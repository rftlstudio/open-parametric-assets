"""Structural checks at rest. Query geoms are disabled for physical contact."""

import mujoco as mj
import numpy as np

from .report import finding


def geometry_queries(spec, model, data, sites):
    """Use MuJoCo convex distances in world coordinates, including mesh geoms."""
    if not sites:
        return
    clone = spec.copy()
    point = clone.worldbody.add_geom(
        type=mj.mjtGeom.mjGEOM_SPHERE, size=[1e-7, 0, 0], contype=0, conaffinity=0
    )
    volumes = {}
    for name, surface in sites:
        if surface and name not in volumes:
            sid = model.site(name).id
            volumes[name] = clone.worldbody.add_geom(
                type=mj.mjtGeom(model.site_type[sid]),
                size=model.site_size[sid],
                contype=0,
                conaffinity=0,
            )
    # Use the compiled probe ID; the added world geom can reorder other geoms.
    query = clone.compile()
    pose = mj.MjData(query)
    pose.qpos[:] = data.qpos
    mj.mj_forward(query, pose)
    geom = point.id
    eligible = np.flatnonzero((query.geom_contype | query.geom_conaffinity) != 0)
    for i in range(query.npair):
        eligible = np.union1d(eligible, [query.pair_geom1[i], query.pair_geom2[i]])
    for site, is_surface in sites:
        sid = model.site(site).id
        weld = model.body_weldid[model.site_bodyid[sid]]
        candidates = [
            g for g in eligible if query.body_weldid[query.geom_bodyid[g]] == weld
        ]
        center = data.site_xpos[sid]
        rotation = data.site_xmat[sid].reshape(3, 3)
        radius = model.site_size[sid]
        # Signed centre distance suffices for a grip. A sensor is a volume;
        # compare surface distance along its nearest-point direction to its support.
        pose.geom_xpos[geom] = center
        best = float("inf")
        for g in candidates:
            segment = np.zeros(6)
            dist = mj.mj_geomDistance(query, pose, geom, g, 100.0, segment) + 1e-7
            gap = max(0.0, dist)
            if is_surface:
                direction = rotation.T @ (segment[3:] - segment[:3])
                length = np.linalg.norm(direction)
                direction = direction / length if length else np.array([0.0, 0.0, 1.0])
                kind = model.site_type[sid]
                if kind == mj.mjtGeom.mjGEOM_BOX:
                    support = abs(direction) @ radius
                elif kind == mj.mjtGeom.mjGEOM_ELLIPSOID:
                    support = np.linalg.norm(direction * radius)
                elif kind in (mj.mjtGeom.mjGEOM_CAPSULE, mj.mjtGeom.mjGEOM_CYLINDER):
                    radial = (
                        1
                        if kind == mj.mjtGeom.mjGEOM_CAPSULE
                        else np.linalg.norm(direction[:2])
                    )
                    support = radius[0] * radial + radius[1] * abs(direction[2])
                else:
                    support = radius[0]
                gap = max(0.0, abs(dist) - support)
                if dist >= 0:
                    # The nearest surface normal supplies a separating plane.
                    # MuJoCo's box-box routine can return zero outside contact.
                    volume = volumes[site].id
                    pose.geom_xpos[volume] = center
                    pose.geom_xmat[volume] = rotation.ravel()
                    gap = max(
                        gap, mj.mj_geomDistance(query, pose, volume, g, 100.0, None)
                    )
            best = min(best, gap)
        yield site, is_surface, best


def static(spec, model, data, joints, roles, limits):
    for joint in joints:
        name = joint["name"]
        jid = model.joint(name).id
        body, dof = model.jnt_bodyid[jid], model.jnt_dofadr[jid]
        if not model.jnt_limited[jid] or joint["limits"][0] >= joint["limits"][1]:
            yield finding(
                "A001",
                "error",
                name,
                joint["limits"],
                "finite positive range and limited",
                "Declare the intended end stops or document continuous rotation.",
            )
        if model.dof_damping[dof] == model.dof_frictionloss[dof] == 0:
            yield finding(
                "A002",
                "warn",
                name,
                0,
                ">0 damping or frictionloss",
                "Check the intended passive resistance.",
            )
        mass = model.body_mass[body]
        inertia = sorted(model.body_inertia[body])
        if mass < limits.min_mass or inertia[2] > inertia[0] + inertia[1] + 1e-14:
            invalid = inertia[2] > inertia[0] + inertia[1] + 1e-14
            yield finding(
                "A003",
                "error" if invalid else "warn",
                name,
                {"mass_kg": mass, "inertia": inertia},
                {"min_mass_kg": limits.min_mass, "triangle": "Imax <= I1 + I2"},
                "Verify the moving link's density, scale and inertia.",
            )
        collision = (model.geom_contype | model.geom_conaffinity) != 0
        collision[model.pair_geom1] = True
        collision[model.pair_geom2] = True
        if not np.any(collision & (model.body_weldid[model.geom_bodyid] == body)):
            yield finding(
                "A004",
                "error",
                name,
                0,
                1,
                "Attach collision geometry to this rigid link.",
            )
        if roles["joints"].get(name) == "button" and model.jnt_stiffness[jid] <= 0:
            yield finding(
                "A006",
                "error",
                name,
                float(model.jnt_stiffness[jid]),
                ">0",
                "Specify the button's return spring.",
            )
        effective = (
            1 / model.dof_invweight0[dof]
            if model.dof_invweight0[dof] > 0
            else float("inf")
        )
        if model.dof_armature[dof] == 0 and effective < limits.min_inertia:
            yield finding(
                "A008",
                "info",
                name,
                effective,
                limits.min_inertia,
                "Check reflected inertia and integration stability.",
            )
    handles = {s for sites in roles["handles"].values() for s in sites}
    handles.update(
        model.site(i).name
        for i in range(model.nsite)
        if "handle" in model.site(i).name.lower()
    )
    sensors = {}
    for name in roles["sensors"]:
        sensors.setdefault(model.site(model.sensor(name).objid[0]).name, []).append(
            name
        )
    sites = [(s, False) for s in sorted(handles)] + [(s, True) for s in sorted(sensors)]
    for site, surface, gap in geometry_queries(spec, model, data, sites):
        threshold = limits.surface_tolerance if surface else limits.handle_gap
        if gap > threshold:
            for element in sensors[site] if surface else [site]:
                yield finding(
                    "A007" if surface else "A005",
                    "error" if surface else "warn",
                    element,
                    gap if np.isfinite(gap) else "no collision geom",
                    threshold,
                    "Check site placement and the collision surface on its rigid link.",
                )
