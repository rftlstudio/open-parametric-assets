"""Finite, reproducible experiments on fresh states of a compiled fixture."""

import math
import mujoco as mj
import numpy as np

from sim.physics import (
    controller,
    drift_samples,
    nonparent_contacts,
    prepare_motion,
    press_button,
    press_touch,
    ramp_target,
    release_button,
)
from .report import finding


def passive(model, joints, limits):
    data = mj.MjData(model)
    mj.mj_forward(model, data)
    q = [model.jnt_qposadr[model.joint(j["name"]).id] for j in joints]
    rest = data.qpos[q].copy()
    spans = np.array([j["limits"][1] - j["limits"][0] for j in joints])
    peak = np.zeros(len(q))
    starts = [rest.copy()]
    # Unseat spring hinges slightly: a motionless vertical door can sit exactly
    # at an unstable equilibrium even when all passive resistance is removed.
    unseated = rest.copy()
    for i, j in enumerate(joints):
        jid = model.joint(j["name"]).id
        if (
            model.jnt_type[jid] == mj.mjtJoint.mjJNT_HINGE
            and model.jnt_stiffness[jid] > 0
        ):
            unseated[i] = j["limits"][0] + 0.01 * spans[i]
    if not np.array_equal(unseated, rest):
        starts.append(unseated)
    for start in starts:
        data = mj.MjData(model)
        data.qpos[q] = start
        mj.mj_forward(model, data)
        for state in drift_samples(model, data, limits.passive_seconds):
            peak = np.maximum(peak, abs(state.qpos[q] - start) / spans)
    for joint, value in zip(joints, peak):
        if value > limits.passive_drift:
            yield finding(
                "P001",
                "warn",
                joint["name"],
                value,
                limits.passive_drift,
                "Check gravity balance, rest position and passive resistance.",
            )


def drive(model, joints, drives, joint, limits):
    name = joint["name"]
    jid = model.joint(name).id
    body = model.jnt_bodyid[jid]
    lo, hi = joint["limits"]
    index = joints.index(joint)
    peak = 0.0
    for direction in (1, -1):
        data, targets = prepare_motion(model, joints, joint)
        start, end = (lo, hi) if direction == 1 else (hi, lo)
        q = model.jnt_qposadr[jid]
        data.qpos[q] = start
        mj.mj_forward(model, data)
        for _ in range(round(limits.drive_seconds / model.opt.timestep)):
            distance = ramp_target(0.0, hi - lo, drives[name]["velocity"], data.time)
            targets[index] = start + direction * distance
            controller(model, data, joints, targets, drives)
            mj.mj_step(model, data)
            for depth, _ in nonparent_contacts(model, data, body):
                peak = max(peak, depth)
        reached = float((data.qpos[q] - start) / (end - start))
        if reached < limits.required_travel:
            yield finding(
                "P002",
                "error",
                name,
                {"fraction": reached, "target": end, "effort": drives[name]["effort"]},
                limits.required_travel,
                "Check effort, friction, joint limits and obstructions.",
            )
    if peak > limits.penetration:
        yield finding(
            "P006",
            "error",
            name,
            peak,
            limits.penetration,
            "Check the swept collision shapes and required opening sequence.",
        )


def bounce(model, joints, drives, joint, limits):
    name = joint["name"]
    jid = model.joint(name).id
    lo, hi = joint["limits"]
    data, targets = prepare_motion(model, joints, joint)
    q, v = model.jnt_qposadr[jid], model.jnt_dofadr[jid]
    # Standardize the incoming speed immediately before impact, then release.
    speed = min(
        0.5 if model.jnt_type[jid] == mj.mjtJoint.mjJNT_SLIDE else 2.0, 2 * (hi - lo)
    )
    data.qpos[q] = hi - speed * model.opt.timestep / 2
    data.qvel[v] = speed
    mj.mj_forward(model, data)
    targets[joints.index(joint)] = hi
    controller(model, data, joints, targets, drives, released=[name])
    data.qfrc_applied[v] = drives[name]["effort"]
    mj.mj_step(model, data)
    rebound = 0.0
    for _ in range(round(0.12 / model.opt.timestep)):
        controller(model, data, joints, targets, drives, released=[name])
        mj.mj_step(model, data)
        rebound = max(rebound, hi - data.qpos[q])
    threshold = (
        math.radians(limits.rebound_degrees)
        if model.jnt_type[jid] == mj.mjtJoint.mjJNT_HINGE
        else limits.rebound_fraction * (hi - lo)
    )
    if rebound > threshold:
        yield finding(
            "P003",
            "warn",
            name,
            rebound,
            threshold,
            "Inspect limit damping and distinguish impact rebound from intentional return motion.",
        )


def button(model, joints, drives, joint, fraction, limits):
    name = joint["name"]
    jid = model.joint(name).id
    lo, hi = joint["limits"]
    data, targets = prepare_motion(model, joints, joint)
    q, v = model.jnt_qposadr[jid], model.jnt_dofadr[jid]
    force = min(
        drives[name]["effort"],
        1.25 * model.jnt_stiffness[jid] * (hi - model.qpos_spring[q]) + 0.05,
    )
    press_button(
        model,
        data,
        joints,
        targets,
        drives,
        name,
        q,
        v,
        lo + fraction * (hi - lo),
        force,
    )
    pressed = float((data.qpos[q] - lo) / (hi - lo))
    release_button(model, data, joints, targets, drives, name, limits.button_seconds)
    returned = float(abs(data.qpos[q] - lo) / (hi - lo))
    if pressed < fraction or returned >= limits.button_return:
        yield finding(
            "P004",
            "error",
            name,
            {"pressed": pressed, "released": returned},
            {"min_press": fraction, "max_rest": limits.button_return},
            "Check the available pressing force and restoring spring against friction.",
        )


def touch(spec, roles, forces, limits):
    if not roles["sensors"]:
        return
    clone = spec.copy()
    body = clone.worldbody.add_body(gravcomp=1)
    joint = body.add_freejoint()
    body.add_geom(
        type=mj.mjtGeom.mjGEOM_SPHERE, size=[limits.touch_radius, 0, 0], mass=0.02
    )
    model = clone.compile()
    for name in sorted(roles["sensors"]):
        data = mj.MjData(model)
        mj.mj_forward(model, data)
        site = model.sensor(name).objid[0]
        center = data.site_xpos[site].copy()
        normal = data.site_xmat[site].reshape(3, 3)[:, 2].copy()
        force = forces.get(name, limits.touch_force)
        neighbours = [model.sensor(n).adr[0] for n in roles["sensors"] if n != name]
        spill = 0.0
        value = 0.0
        for state in press_touch(
            model,
            data,
            body.id,
            model.jnt_qposadr[joint.id],
            center,
            normal,
            limits.touch_radius,
            force,
            limits.touch_multiplier,
        ):
            if neighbours:
                spill = max(spill, float(np.max(state.sensordata[neighbours])))
            tip = state.xpos[body.id] - normal * limits.touch_radius
            if np.linalg.norm(tip - center) <= limits.touch_radius:
                value = max(value, float(state.sensor(name).data[0]))
        if value < force or spill > 0:
            yield finding(
                "P005",
                "error",
                name,
                {"force_N": value, "neighbour_N": spill},
                {"min_force_N": force, "max_neighbour_N": 0},
                "Check the sensor site, pressing normal and separation from adjacent controls.",
            )
