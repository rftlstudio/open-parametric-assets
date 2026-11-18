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


POSITION_GAIN = 400.0


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
        gain = POSITION_GAIN
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


def apply_springs(model, joints):
    for joint in joints:
        spring = joint.get("dynamics", {}).get("spring")
        if spring:
            jid = model.joint(joint["name"]).id
            model.jnt_stiffness[jid] = spring["stiffness"]
            model.qpos_spring[model.jnt_qposadr[jid]] = spring["restPosition"]


def button_check(model, record, control, limits):
    joints = record["joints"]
    data = initial(model, joints)
    targets = [j["limits"][0] for j in joints]
    jid = model.joint(control["joint"]).id
    q, v = model.jnt_qposadr[jid], model.jnt_dofadr[jid]
    travel = model.jnt_range[jid, 1]
    pressed = control["state"]["pressedAt"] * travel
    spring = next(j["dynamics"]["spring"] for j in joints if j["name"] == control["joint"])
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
    apply_springs(model, record["joints"])
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


def touch_check(path, xml, record):
    controls = [c for c in record.get("controls", []) if c["type"] == "touch"]
    if not controls:
        return
    spec = load(path)
    base = spec.compile()
    rest = initial(base, record["joints"])
    centers, normals = [], []
    for control in controls:
        region = control["region"]
        center, frame, body = affordance_frame(base, rest, xml, region)
        require("joint" not in control and base.body_weldid[body] == 0,
                control["name"] + ": touch region must be fixed")
        n = np.array(region["normal"])
        u = np.array([1., 0., 0.] if abs(n[0]) < 0.9 else [0., 1., 0.])
        u -= n * (u @ n)
        u /= np.linalg.norm(u)
        axes = np.column_stack([u, np.cross(n, u), n])
        local = rest.xmat[body].reshape(3, 3).T
        quat = np.zeros(4)
        mj.mju_mat2Quat(quat, (local @ frame @ axes).ravel())
        name = control["name"]
        spec.body(base.body(body).name).add_site(name=name, type=mj.mjtGeom.mjGEOM_BOX,
                pos=local @ (center-rest.xpos[body]), quat=quat,
                size=[region["size"][0]/2, region["size"][1]/2, 0.001])
        spec.add_sensor(name=name, type=mj.mjtSensor.mjSENS_TOUCH,
                        objtype=mj.mjtObj.mjOBJ_SITE, objname=name)
        centers.append(center)
        normals.append(frame @ n)
    radius = 0.004
    probe = spec.worldbody.add_body(name="touch_probe", gravcomp=1)
    probe.add_freejoint(name="touch_probe_free")
    probe.add_geom(type=mj.mjtGeom.mjGEOM_SPHERE, size=[radius,0,0], mass=0.02)
    model = spec.compile()
    apply_springs(model, record["joints"])
    q = model.jnt_qposadr[model.joint("touch_probe_free").id]
    for i, control in enumerate(controls):
        data = initial(model, record["joints"])
        data.qpos[q:q+3] = centers[i] + normals[i]*(radius+0.0001)
        mj.mj_forward(model, data)
        force = control["state"]["minForceN"]
        data.xfrc_applied[model.body("touch_probe").id,:3] = -normals[i]*1.25*force
        for _ in range(100):
            mj.mj_step(model, data)
            for j, other in enumerate(controls):
                sensor = other["name"]
                require(np.linalg.norm(data.site(sensor).xpos-centers[j]) < 1e-12, sensor + ": touch region drift")
                if j != i:
                    require(data.sensor(sensor).data[0] == 0, sensor + ": neighbouring region activated")
        measured = data.sensor(control["name"]).data[0]
        require(measured >= force, control["name"] + ": insufficient touch reading")
        print(f"PASS touch {control['name']}, {measured:.3f} N, neighbouring sensors silent")


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


def prepare_motion(model, joints, target):
    """Hold prerequisite joints at their declared stops, including indirect prerequisites."""
    by_name = {j["name"]: j for j in joints}
    required = {}
    def visit(joint):
        for req in joint.get("requires", []):
            name, at = req["joint"], req["at"]
            if name not in required:
                required[name] = at
                visit(by_name[name])
            else:
                require(required[name] == at, "conflicting motion prerequisites: "+name)
    visit(target)
    targets = [j["limits"][int(required.get(j["name"]) == "upper")] for j in joints]
    data = initial(model,joints)
    for joint, value in zip(joints,targets):
        data.joint(joint["name"]).qpos[0] = value
    mj.mj_forward(model,data)
    return data, targets


def driven(model, joints, limits):
    for target_joint in joints:
        data, rest = prepare_motion(model,joints,target_joint)
        moving = model.jnt_bodyid[model.joint(target_joint["name"]).id]
        for _ in range(round(3 / model.opt.timestep)):
            targets = []
            for joint, fixed in zip(joints, rest):
                lo, hi = joint["limits"]
                speed = limits[joint["name"]]["velocity"]
                targets.append(min(hi, lo + speed * data.time) if joint is target_joint else fixed)
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
    apply_springs(model, record["joints"])
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


def cube_model(path, record):
    spec = load(path)
    # Add only test equipment to the loaded URDF, without writing MJCF.
    cube = spec.worldbody.add_body(name="test_cube", pos=[0, 0, 10])
    cube.add_freejoint(name="test_cube_free")
    cube.add_geom(name="test_cube_geom", type=mj.mjtGeom.mjGEOM_BOX,
                  size=[0.025]*3, mass=0.05, friction=[0.5, 0.005, 0.0001])
    model = spec.compile()
    apply_springs(model, record["joints"])
    return model


def drop(path, xml, record, limits):
    joints = record["joints"]
    targets = [j["limits"][1] for j in joints]
    for affordance in record["affordances"]:
        if affordance["type"] != "placeable":
            continue
        require(min(affordance["size"]) >= 0.05, affordance["part"] + ": surface too small for cube")
        model = cube_model(path, record)
        data = initial(model, joints, upper=True)
        point, frame, support_body = affordance_frame(model, data, xml, affordance)
        normal = frame @ affordance["normal"]
        require(normal[2] >= np.cos(np.deg2rad(1)),
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
                     abs(local[2 if abs(affordance["normal"][1]) > 0.9 else 1]) <= affordance["size"][1]/2 - 0.025 + 0.001
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


def door_behavior(model, joints, limits, joint):
    name = joint["name"]
    lo, hi = joint["limits"]
    for start in (lo, hi, np.deg2rad(30)):
        data, targets = prepare_motion(model,joints,joint)
        hinge = data.joint(name)
        hinge.qpos[0] = start
        mj.mj_forward(model, data)
        for _ in range(round(2 / model.opt.timestep)):
            controller(model,data,joints,targets,limits,released=[name])
            mj.mj_step(model, data)
            if start in (lo, hi):
                require(abs(hinge.qpos[0]-start) < np.deg2rad(1), "released door endpoint drift")
            else:
                require(abs(hinge.qvel[0]) < 2, "door slam at 30 degrees")
    print("PASS door release, endpoints held and peak speed below 2 rad/s at 30 degrees")


def door_bounce(model, joints, limits, joint):
    name = joint["name"]
    index = next(i for i,j in enumerate(joints) if j["name"] == name)
    lo, hi = joints[index]["limits"]
    data, targets = prepare_motion(model,joints,joint)
    hinge = data.joint(name)
    for _ in range(round(4/model.opt.timestep)):
        targets[index] = min(hi, lo + data.time * limits[name]["velocity"])
        controller(model, data, joints, targets, limits)
        mj.mj_step(model,data)
        if hinge.qpos[0] >= hi - np.deg2rad(1):
            break
    else:
        raise ValueError("door failed to reach bounce observation window")
    for _ in range(round(0.5/model.opt.timestep)):
        controller(model,data,joints,targets,limits,released=[name])
        mj.mj_step(model,data)
        require(hinge.qpos[0] >= hi - np.deg2rad(2) and hinge.qvel[0] >= -0.05, "door bounce after opening")
    print("PASS door bounce, 0.5 s after first approach")


def carry(path, xml, record, limits):
    joints = record["joints"]
    for surface in record["affordances"]:
        if surface["type"] != "placeable":
            continue
        link = next(link for link in xml.findall("link") if
                    any(v.get("name") == "visual_"+surface["part"] for v in link.findall("visual")))
        index = next((i for i,j in enumerate(joints) if j["type"] == "prismatic" and
                      j["childPart"] == link.get("name")), None)
        if index is None:
            continue
        model = cube_model(path, record)
        data, targets = prepare_motion(model,joints,joints[index])
        point, frame, body = affordance_frame(model,data,xml,surface)
        normal = frame @ surface["normal"]
        cube = data.body("test_cube")
        data.joint("test_cube_free").qpos[:3] = point + normal*0.030
        mj.mj_forward(model,data)
        for _ in range(round(1/model.opt.timestep)):
            controller(model,data,joints,targets,limits)
            mj.mj_step(model,data)
        support_geom = model.geom(surface["part"]).id
        def supported():
            return any(support_geom in c.geom and cube.id in model.geom_bodyid[c.geom] for c in data.contact)
        require(supported() and np.linalg.norm(data.joint("test_cube_free").qvel) < 0.01,
                "carry cube failed to settle on "+surface["part"])
        local = data.xmat[body].reshape(3,3).T @ (cube.xpos-data.xpos[body])
        name = joints[index]["name"]
        lo, hi = joints[index]["limits"]
        speed = limits[name]["velocity"]
        # Finite acceleration at departure and arrival, respecting the URDF speed limit.
        acceleration = 3.0
        peak = min(speed, np.sqrt(acceleration*(hi-lo)))
        ramp = peak/acceleration
        duration = (hi-lo)/peak + ramp
        # The position servo is critically damped. Its response time scales with
        # sqrt(effective inertia / stiffness); six time constants allow settling.
        inertia = np.zeros((model.nv,model.nv))
        mj.mj_fullM(model,inertia,data.qM)
        dof = model.jnt_dofadr[model.joint(name).id]
        settle_time = max(0.6, 6*np.sqrt((inertia[dof,dof] + model.body_mass[cube.id])/POSITION_GAIN))
        for step in range(round((duration+settle_time)/model.opt.timestep)):
            time = step*model.opt.timestep
            if time < ramp:
                position = 0.5*acceleration*time*time
            elif time < duration-ramp:
                position = peak*(time-ramp/2)
            else:
                position = hi-lo-0.5*acceleration*max(duration-time,0)**2
            targets[index] = lo+position
            controller(model,data,joints,targets,limits)
            mj.mj_step(model,data)
            relative = data.xmat[body].reshape(3,3).T @ (cube.xpos-data.xpos[body])
            require(np.linalg.norm(relative-local) <= 0.01, "carry cube slip on "+surface["part"])
            require(cube.xmat.reshape(3,3)[2,2] >= np.cos(np.deg2rad(5)), "carry cube tilt")
            require(supported(), "carry cube lost support")
        require(data.joint(name).qpos[0] >= lo+0.95*(hi-lo), "carry slide jam")
        print("PASS carry "+surface["part"]+", slide reached full travel with stable load")


def check(path):
    record = record_for(path)
    xml = ET.parse(path).getroot()
    joints = record["joints"]
    model = load(path).compile()
    apply_springs(model, record["joints"])
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
    for joint in joints:
        if joint.get("behavior") == "balanced_door":
            door_behavior(model,joints,limits,joint)
            door_bounce(model,joints,limits,joint)
    drop(path, xml, record, limits)
    carry(path, xml, record, limits)
    grasp(path, xml, record)
    controls_reachable(path, xml, record)
    touch_check(path, xml, record)
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
