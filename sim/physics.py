"""Shared deterministic rigid-body probe mechanics."""

import mujoco as mj
import numpy as np


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
                if required[name] != at:
                    raise ValueError("conflicting motion prerequisites: " + name)

    visit(target)
    targets = [j["limits"][int(required.get(j["name"]) == "upper")] for j in joints]
    data = initial(model, joints)
    for joint, value in zip(joints, targets):
        data.joint(joint["name"]).qpos[0] = value
    mj.mj_forward(model, data)
    return data, targets


def press_button(model, data, joints, targets, limits, name, q, v, pressed, force):
    for _ in range(round(0.5 / model.opt.timestep)):
        controller(model, data, joints, targets, limits, released=[name])
        data.qfrc_applied[v] = force
        mj.mj_step(model, data)
        if data.qpos[q] >= pressed:
            break


def release_button(model, data, joints, targets, limits, name, seconds=0.5):
    for _ in range(round(seconds / model.opt.timestep)):
        controller(model, data, joints, targets, limits, released=[name])
        mj.mj_step(model, data)


def nonparent_contacts(model, data, moving):
    parent = model.body_weldid[model.body_parentid[moving]]
    moving = model.body_weldid[moving]
    for contact in data.contact:
        a, b = model.body_weldid[model.geom_bodyid[contact.geom]]
        if moving not in (a, b):
            continue
        other = b if a == moving else a
        if other not in (moving, parent):
            yield float(-contact.dist), other


def press_touch(model, data, body, q, center, normal, radius, force, multiplier=1.25):
    data.qpos[q : q + 3] = center + normal * (radius + 0.0001)
    mj.mj_forward(model, data)
    data.xfrc_applied[body, :3] = -normal * multiplier * force
    for _ in range(100):
        mj.mj_step(model, data)
        yield data


def drift_samples(model, data, seconds):
    for _ in range(round(seconds / model.opt.timestep)):
        mj.mj_step(model, data)
        yield data


def ramp_target(lo, hi, speed, elapsed):
    return min(hi, lo + speed * elapsed)
