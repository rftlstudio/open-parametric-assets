"""Interpret optional role maps and embedded semantics, using compiled joint ranges."""

import json
import mujoco as mj

from sim.physics import motion_prerequisites


def embedded(model):
    idx = mj.mj_name2id(model, mj.mjtObj.mjOBJ_TEXT, "opa_metadata")
    if idx < 0:
        return {}
    start = model.text_adr[idx]
    return json.loads(model.text_data[start : start + model.text_size[idx] - 1])


def resolve(model, overrides, limits):
    record = embedded(model)
    metadata = {j["name"]: j for j in record.get("joints", [])}
    roles = {"joints": {}, "handles": {}, "sensors": {}}
    buttons, forces = {}, {}
    joints, drives = [], {}
    for i in range(model.njnt):
        kind = model.jnt_type[i]
        if kind not in (mj.mjtJoint.mjJNT_SLIDE, mj.mjtJoint.mjJNT_HINGE):
            continue
        name = model.joint(i).name
        meta = metadata.get(name, {})
        slide = kind == mj.mjtJoint.mjJNT_SLIDE
        joint = dict(
            name=name,
            limits=model.jnt_range[i].tolist(),
            requires=meta.get("requires", []),
        )
        joints.append(joint)
        effort = meta.get("effort", limits.default_effort)
        if model.jnt_actfrclimited[i]:
            effort = min(effort, max(abs(model.jnt_actfrcrange[i])))
        drives[name] = dict(
            effort=effort, velocity=meta.get("velocity", 0.5 if slide else 2)
        )
        if name in metadata:
            roles["joints"][name] = "slide" if slide else "hinge"
        for a in record.get("affordances", []):
            if a["type"] == "grasp":
                site = "grasp_" + a["part"]
                if model.body_weldid[model.site(site).bodyid[0]] == model.jnt_bodyid[i]:
                    roles["handles"].setdefault(name, []).append(site)
    for c in record.get("controls", []):
        if c["type"] == "knob":
            roles["joints"][c["joint"]] = "knob"
        if c["type"] == "button":
            roles["joints"][c["joint"]] = "button"
            buttons[c["joint"]] = c["state"]["pressedAt"]
        if c["type"] == "touch":
            forces[c["name"]] = c["state"]["minForceN"]
    for i in range(model.nsensor):
        if model.sensor_type[i] == mj.mjtSensor.mjSENS_TOUCH:
            roles["sensors"][model.sensor(i).name] = "touch"
    if not isinstance(overrides, dict) or set(overrides) - {
        "source",
        "requires",
        *roles,
    }:
        raise ValueError("Invalid roles file keys")
    for key in roles:
        values = overrides.get(key, {})
        if not isinstance(values, dict):
            raise ValueError(f"{key} roles must be a name-to-role object")
        roles[key].update(values)
    names = {j["name"] for j in joints}
    prerequisites = overrides.get("requires", {})
    if not isinstance(prerequisites, dict) or prerequisites.keys() - names:
        raise ValueError(
            "requires must map known articulation joints to lists of stops"
        )
    by_name = {j["name"]: j for j in joints}
    for joint in joints:
        name = joint["name"]
        stops = prerequisites.get(name, joint["requires"])
        if not isinstance(stops, list):
            raise ValueError(f"Expected a list of motion prerequisites for {name}")
        for stop in stops:
            if (
                not isinstance(stop, dict)
                or set(stop) != {"joint", "at"}
                or not isinstance(stop["joint"], str)
                or stop["joint"] not in names
                or stop["at"] not in ("upper", "lower")
                or not model.joint(stop["joint"]).limited[0]
            ):
                raise ValueError(f"Invalid motion prerequisite for {name}: {stop!r}")
        joint["requires"] = stops
    for joint in joints:
        if joint["requires"]:
            motion_prerequisites(by_name, joint)
    if not (roles["joints"].keys() | roles["handles"].keys()) <= names:
        raise ValueError("Role references an unknown articulation joint")
    for joint, sites in roles["handles"].items():
        if isinstance(sites, str):
            sites = roles["handles"][joint] = [sites]
        if not isinstance(sites, list) or not all(isinstance(s, str) for s in sites):
            raise ValueError(f"Invalid handle sites for {joint}")
        for site in sites:
            if mj.mj_name2id(model, mj.mjtObj.mjOBJ_SITE, site) < 0:
                raise ValueError(f"Unknown handle site {site}")
    for name, role in roles["sensors"].items():
        if role != "touch" or name not in [
            model.sensor(i).name
            for i in range(model.nsensor)
            if model.sensor_type[i] == mj.mjtSensor.mjSENS_TOUCH
        ]:
            raise ValueError(f"Invalid touch sensor role {name}")
    return joints, drives, roles, buttons, forces
