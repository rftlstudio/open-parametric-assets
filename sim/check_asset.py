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


def controller(model, data, joints, targets, limits, released=()):
    data.qfrc_applied[:] = 0
    inertia = np.zeros((model.nv, model.nv))
    mj.mj_fullM(model, inertia, data.qM)
    for joint, target in zip(joints, targets):
        if joint["name"] in released:
            continue
        jid = model.joint(joint["name"]).id
        q, v = model.jnt_qposadr[jid], model.jnt_dofadr[jid]
        # Critically damped position servo, capped by the URDF effort limit.
        gain = 400.0
        damping = 2 * np.sqrt(gain * inertia[v, v])
        force = gain * (target - data.qpos[q]) - damping * data.qvel[v]
        force += model.jnt_stiffness[jid] * (data.qpos[q] - model.qpos_spring[q])
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


def apply_springs(model, controls):
    for control in controls:
        if control["type"] == "button":
            joint = model.joint(control["joint"]).id
            spring = control["state"]["spring"]
            model.jnt_stiffness[joint] = spring["stiffness"]
            model.qpos_spring[model.jnt_qposadr[joint]] = spring["restPosition"]


def button_check(model, record, control, limits):
    joints = record["joints"]
    data = initial(model, joints)
    targets = [j["limits"][0] for j in joints]
    jid = model.joint(control["joint"]).id
    q, v = model.jnt_qposadr[jid], model.jnt_dofadr[jid]
    travel = model.jnt_range[jid, 1]
    pressed = control["state"]["pressedAt"] * travel
    spring = control["state"]["spring"]
    force = min(limits[control["joint"]]["effort"],
                1.25 * spring["stiffness"] * (travel - spring["restPosition"]) + 0.05)
    for _ in range(round(0.5 / model.opt.timestep)):
        controller(model, data, joints, targets, limits, released=[control["joint"]])
        data.qfrc_applied[v] = force
        mj.mj_step(model, data)
        if data.qpos[q] >= pressed:
            break
    require(data.qpos[q] >= pressed, control["name"] + ": button failed to press")
    for _ in range(round(0.5 / model.opt.timestep)):
        controller(model, data, joints, targets, limits, released=[control["joint"]])
        mj.mj_step(model, data)
    require(abs(data.qpos[q]) < 0.1 * travel, control["name"] + ": button failed to return within 0.5 s")
    print(f"PASS button {control['name']}, pressed and returned to {data.qpos[q]:.6f} m")


def detent_index(positions, value):
    # The lower index wins an exact midpoint tie.
    return int(np.argmin(np.abs(np.asarray(positions) - value)))


def knob_check(model, record, control, limits):
    joints = record["joints"]
    data = initial(model, joints)
    targets = [j["limits"][0] for j in joints]
    index = next(i for i, j in enumerate(joints) if j["name"] == control["joint"])
    jid = model.joint(control["joint"]).id
    q = model.jnt_qposadr[jid]
    positions = control["state"]["positions"]
    tolerance = min(0.02, 0.1 * min(np.diff(positions)))
    require(model.dof_frictionloss[model.jnt_dofadr[jid]] > 0,
            control["name"] + ": knob needs positive joint frictionloss")
    for expected, target in enumerate(positions):
        targets[index] = target
        for _ in range(round(1.0 / model.opt.timestep)):
            controller(model, data, joints, targets, limits)
            mj.mj_step(model, data)
        require(detent_index(positions, data.qpos[q]) == expected,
                control["name"] + ": failed to reach detent " + str(expected))
        require(abs(data.qpos[q] - target) <= tolerance,
                control["name"] + ": detent target position error exceeds tolerance")
        for _ in range(round(0.5 / model.opt.timestep)):
            controller(model, data, joints, targets, limits, released=[control["joint"]])
            mj.mj_step(model, data)
            require(detent_index(positions, data.qpos[q]) == expected,
                    control["name"] + ": detent state changed after release")
    print(f"PASS knob {control['name']}, all {len(positions)} detents held their values for 0.5 s")


def controls_reachable(path, xml, record):
    controls = record.get("controls", [])
    if not controls:
        return
    spec = load(path)
    radius = 1e-6
    spec.worldbody.add_geom(name="test_region_probe", type=mj.mjtGeom.mjGEOM_SPHERE,
                           size=[radius, 0, 0], pos=[0, 0, 10])
    model = spec.compile()
    apply_springs(model, controls)
    data = initial(model, record["joints"])
    probe = model.geom("test_region_probe").id
    for control in controls:
        region = control["region"]
        point, _, _ = affordance_frame(model, data, xml, region)
        own = model.geom(region["part"]).id
        model.geom_pos[probe] = point
        mj.mj_forward(model, data)
        for geom in range(model.ngeom):
            if geom == probe:
                continue
            distance = mj.mj_geomDistance(model, data, probe, geom, 1.0, None) + radius
            if geom == own:
                require(abs(distance) <= 0.001, control["name"] + ": region does not touch its own part")
            else:
                require(distance > 0.002 + 1e-9,
                        control["name"] + ": region obstructed by " + model.geom(geom).name)
        print(f"PASS region {control['name']}, on its part with more than 2 mm clearance")


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


def affordance_frame(model, data, xml, affordance):
    for link in xml.findall("link"):
        for visual in link.findall("visual"):
            if visual.get("name") != "visual_" + affordance["part"]:
                continue
            origin = visual.find("origin")
            pos = np.fromstring(origin.get("xyz", "0 0 0"), sep=" ")
            rot = rotation(np.fromstring(origin.get("rpy", "0 0 0"), sep=" "))
            body = model.body(link.get("name")).id
            world = data.xmat[body].reshape(3, 3)
            point = data.xpos[body] + world @ (pos + rot @ affordance["point"])
            return point, world @ rot, body
    raise ValueError("Missing affordance part " + affordance["part"])


def grasp(path, xml, record):
    spec = load(path)
    radius = 1e-6
    spec.worldbody.add_geom(name="test_grasp_probe", type=mj.mjtGeom.mjGEOM_SPHERE,
                           size=[radius, 0, 0], pos=[0, 0, 10])
    model = spec.compile()
    apply_springs(model, record.get("controls", []))
    data = initial(model, record["joints"])
    probe = model.geom("test_grasp_probe").id
    for affordance in record["affordances"]:
        if affordance["type"] != "grasp":
            continue
        point, _, _ = affordance_frame(model, data, xml, affordance)
        model.geom_pos[probe] = point
        mj.mj_forward(model, data)
        distances = [
            (mj.mj_geomDistance(model, data, probe, geom, 1.0, None) + radius, geom)
            for geom in range(model.ngeom) if geom != probe
        ]
        # Adding the probe radius gives the signed point-to-solid distance.
        require(affordance.get("grip") in ("raised", "recessed"), "invalid grasp grip")
        if affordance["grip"] == "raised":
            own = model.geom(affordance["part"]).id
            require(model.geom_type[own] == mj.mjtGeom.mjGEOM_BOX,
                    affordance["part"] + ": raised grasp requires its own collision box")
            own_distance = next(distance for distance, geom in distances if geom == own)
            require(own_distance <= 0,
                    f"{affordance['part']}: raised grasp distance {own_distance:.6f} m "
                    "must be inside its own collision box (distance <= 0)")
            distance, nearest = min((distance, geom) for distance, geom in distances if geom != own)
            require(distance > 0.010 + 1e-9,
                    f"{affordance['part']}: finger room {distance:.6f} m to "
                    f"{model.geom(nearest).name} must exceed 0.010 m")
            print(f"PASS grasp {affordance['part']}, inside own box, finger room {distance:.6f} m")
            continue
        distance, nearest = min(distances)
        require(distance > 0.002 + 1e-9,
                f"{affordance['part']}: grasp distance {distance:.6f} m to "
                f"{model.geom(nearest).name} must exceed 0.002 m")
        print(f"PASS grasp {affordance['part']}, minimum distance {distance:.6f} m")


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
        apply_springs(model, record.get("controls", []))
        data = initial(model, joints, upper=True)
        point, frame, support_body = affordance_frame(model, data, xml, affordance)
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
            point, frame, support_body = affordance_frame(model, data, xml, affordance)
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
    apply_springs(model, record.get("controls", []))
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
    grasp(path, xml, record)
    controls_reachable(path, xml, record)
    for control in record.get("controls", []):
        if control["type"] == "button":
            button_check(model, record, control, limits)
        elif control["type"] == "knob":
            knob_check(model, record, control, limits)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("urdf", type=Path)
    args = parser.parse_args()
    try:
        check(args.urdf.resolve())
    except Exception as error:
        print(f"FAIL {args.urdf}: {error}", file=sys.stderr)
        sys.exit(1)
