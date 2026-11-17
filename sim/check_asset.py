"""Load dataset URDFs directly and run headless physical acceptance checks."""
import argparse
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

import mujoco as mj
import numpy as np


def require(condition, message):
    if not condition:
        raise ValueError(message)


def record_for(path):
    manifest = path.parent.parent.parent / "data.jsonl"
    for line in manifest.read_text(encoding="utf-8").splitlines():
        record = json.loads(line)
        if record.get("urdf_path") and (manifest.parent / record["urdf_path"]).resolve() == path:
            return record
    raise ValueError("URDF has no matching record in " + str(manifest))


def load(path):
    spec = mj.MjSpec.from_file(str(path))
    spec.option.timestep = 0.002
    spec.option.integrator = mj.mjtIntegrator.mjINT_IMPLICITFAST
    return spec


def initial(model, joints, upper=False):
    data = mj.MjData(model)
    for joint in joints:
        jid = model.joint(joint["name"]).id
        data.qpos[model.jnt_qposadr[jid]] = joint["limits"][int(upper)]
    mj.mj_forward(model, data)
    return data


def controller(model, data, joints, targets, limits):
    data.qfrc_applied[:] = 0
    inertia = np.zeros((model.nv, model.nv))
    mj.mj_fullM(model, inertia, data.qM)
    for joint, target in zip(joints, targets):
        jid = model.joint(joint["name"]).id
        q, v = model.jnt_qposadr[jid], model.jnt_dofadr[jid]
        # Critically damped position servo, capped by the URDF effort limit.
        gain = 400.0
        damping = 2 * np.sqrt(gain * inertia[v, v])
        force = gain * (target - data.qpos[q]) - damping * data.qvel[v]
        effort = limits[joint["name"]]["effort"]
        data.qfrc_applied[v] = np.clip(force, -effort, effort)


def check_contacts(model, data, moving):
    parent = model.body_parentid[moving]
    for contact in data.contact:
        a, b = model.geom_bodyid[contact.geom]
        if moving not in (a, b):
            continue
        other = b if a == moving else a
        require(other in (moving, parent) or contact.dist >= -0.001,
                f"contact penetration {-contact.dist:.6f} m between "
                f"{model.body(moving).name} and {model.body(other).name}")


def passive(model, joints):
    data = initial(model, joints)
    max_drift = 0.0
    for _ in range(round(2 / model.opt.timestep)):
        mj.mj_step(model, data)
        for joint in joints:
            jid = model.joint(joint["name"]).id
            lo, hi = joint["limits"]
            drift = abs(data.qpos[model.jnt_qposadr[jid]] - lo) / (hi - lo)
            max_drift = max(max_drift, drift)
            require(drift <= 0.02, f"{joint['name']}: passive drift {drift:.2%} exceeds 2%")
    print(f"PASS passive, 2 s, maximum drift {max_drift:.3%}")


def driven(model, joints, limits):
    for target_joint in joints:
        data = initial(model, joints)
        moving = model.jnt_bodyid[model.joint(target_joint["name"]).id]
        for _ in range(round(3 / model.opt.timestep)):
            targets = []
            for joint in joints:
                lo, hi = joint["limits"]
                speed = limits[joint["name"]]["velocity"]
                targets.append(min(hi, lo + speed * data.time) if joint is target_joint else lo)
            controller(model, data, joints, targets, limits)
            mj.mj_step(model, data)
            check_contacts(model, data, moving)
        jid = model.joint(target_joint["name"]).id
        lo, hi = target_joint["limits"]
        progress = (data.qpos[model.jnt_qposadr[jid]] - lo) / (hi - lo)
        require(0.95 <= progress <= 1.02, f"{target_joint['name']}: reached {progress:.2%} of range")
        print(f"PASS drive {target_joint['name']}, 3 s, reached {progress:.2%}")


def rotation(rpy):
    cx, cy, cz = np.cos(rpy)
    sx, sy, sz = np.sin(rpy)
    return np.array([[cz*cy, cz*sy*sx-sz*cx, cz*sy*cx+sz*sx],
                     [sz*cy, sz*sy*sx+cz*cx, sz*sy*cx-cz*sx],
                     [-sy, cy*sx, cy*cx]])


def surface_frame(model, data, xml, affordance):
    for link in xml.findall("link"):
        for collision in link.findall("collision"):
            if collision.get("name") != affordance["part"]:
                continue
            origin = collision.find("origin")
            pos = np.fromstring(origin.get("xyz", "0 0 0"), sep=" ")
            rot = rotation(np.fromstring(origin.get("rpy", "0 0 0"), sep=" "))
            body = model.body(link.get("name")).id
            world = data.xmat[body].reshape(3, 3)
            point = data.xpos[body] + world @ (pos + rot @ affordance["point"])
            return point, world @ rot, body
    raise ValueError("Missing affordance collision part " + affordance["part"])


def drop(path, xml, record, limits):
    joints = record["joints"]
    targets = [j["limits"][1] for j in joints]
    for affordance in record["affordances"]:
        if affordance["type"] != "placeable":
            continue
        require(min(affordance["size"]) >= 0.05, affordance["part"] + ": surface too small for cube")
        spec = load(path)
        # Add only test equipment to the loaded URDF, without writing MJCF.
        cube = spec.worldbody.add_body(name="test_cube", pos=[0, 0, 10])
        cube.add_freejoint(name="test_cube_free")
        cube.add_geom(name="test_cube_geom", type=mj.mjtGeom.mjGEOM_BOX,
                      size=[0.025]*3, mass=0.05, friction=[0.5, 0.005, 0.0001])
        model = spec.compile()
        data = initial(model, joints, upper=True)
        point, frame, support_body = surface_frame(model, data, xml, affordance)
        normal = frame @ affordance["normal"]
        require(np.linalg.norm(normal - [0, 0, 1]) < 1e-6,
                affordance["part"] + ": drop check requires an upward horizontal surface")
        free = model.joint("test_cube_free").id
        q = model.jnt_qposadr[free]
        v = model.jnt_dofadr[free]
        cube_id = model.body("test_cube").id
        data.qpos[q:q+3] = point + normal * 0.030  # 5 mm bottom-to-surface drop.
        data.qpos[q+3:q+7] = [1, 0, 0, 0]
        mj.mj_forward(model, data)
        stable_steps = 0
        for _ in range(round(2 / model.opt.timestep)):
            controller(model, data, joints, targets, limits)
            mj.mj_step(model, data)
            point, frame, support_body = surface_frame(model, data, xml, affordance)
            delta = data.xpos[cube_id] - point
            local = frame.T @ delta
            on_surface = abs(delta @ normal - 0.025) <= 0.002
            within = abs(local[0]) <= affordance["size"][0]/2 - 0.025 + 0.001 and \
                     abs(local[2]) <= affordance["size"][1]/2 - 0.025 + 0.001
            touching = any(
                set(model.geom_bodyid[c.geom]) == {cube_id, support_body} and
                (model.geom(c.geom[0]).name == affordance["part"] or
                 model.geom(c.geom[1]).name == affordance["part"]) and c.dist >= -0.001
                for c in data.contact)
            stable = on_surface and within and touching and np.linalg.norm(data.qvel[v:v+6]) < 0.01
            stable_steps = stable_steps + 1 if stable else 0
        require(stable_steps * model.opt.timestep >= 0.2,
                affordance["part"] + ": cube did not settle on the named surface within 2 s")
        print(f"PASS drop {affordance['part']}, 5 cm cube stable for final 0.2 s")


def check(path):
    record = record_for(path)
    xml = ET.parse(path).getroot()
    joints = record["joints"]
    model = load(path).compile()
    names = [j["name"] for j in joints]
    require(model.njnt == len(joints), "joint count differs from record")
    require(model.nbody == len(joints) + 2, "body count differs from record plus root and world")
    require({model.joint(i).name for i in range(model.njnt)} == set(names), "joint names differ from record")
    require({model.body(i).name for i in range(1, model.nbody)} ==
            {xml.get("name"), *(j["childPart"] for j in joints)}, "body names differ from record")
    require(not any(model.jnt_type == mj.mjtJoint.mjJNT_FREE), "base must be fixed")
    for joint in joints:
        jid = model.joint(joint["name"]).id
        expected = mj.mjtJoint.mjJNT_SLIDE if joint["type"] == "prismatic" else mj.mjtJoint.mjJNT_HINGE
        require(model.jnt_type[jid] == expected and np.allclose(model.jnt_range[jid], joint["limits"]),
                joint["name"] + ": type or range differs from record")
        require(joint["limits"][1] > joint["limits"][0], joint["name"] + ": zero joint range")
    limits = {j.get("name"): {key: float(j.find("limit").get(key)) for key in ("effort", "velocity")}
              for j in xml.findall("joint")}
    print(f"PASS load {record['asset_id']}, {model.nbody - 1} bodies, {model.njnt} joints, fixed base")
    passive(model, joints)
    driven(model, joints, limits)
    drop(path, xml, record, limits)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("urdf", type=Path)
    args = parser.parse_args()
    try:
        check(args.urdf.resolve())
    except Exception as error:
        print(f"FAIL {args.urdf}: {error}", file=sys.stderr)
        sys.exit(1)
