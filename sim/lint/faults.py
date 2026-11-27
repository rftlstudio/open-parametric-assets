"""Inject one physical fault per applicable class per record and measure new findings."""

import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
import json
from pathlib import Path

import mujoco as mj

from .cli import lint_spec
from .report import Limits, dump
from .roles import embedded, resolve

EXPECTED = {
    "stuck_drawer": ("P002",),
    "sticky_button": ("A006", "P004"),
    "dead_sensor": ("A007", "P005"),
    "contact_bounce": ("P003",),
    "ghost_handle": ("A004", "A005"),
    "free_swing": ("A002", "P001"),
    "feather_door": ("A003",),
}


def mutate(clean, fault, target):
    spec = clean.copy()
    if fault == "dead_sensor":
        site = spec.site(target)
        # Site Z is the outward normal (compute its orientation in body coordinates).
        model = clean.compile()
        data = mj.MjData(model)
        mj.mj_forward(model, data)
        sid = model.site(target).id
        normal = data.site_xmat[sid].reshape(3, 3)[:, 2]
        site.pos[:] += 0.05 * (
            data.xmat[model.site_bodyid[sid]].reshape(3, 3).T @ normal
        )
    elif fault == "ghost_handle":
        geom = spec.geom(target)
        geom.contype = geom.conaffinity = 0
    else:
        joint = spec.joint(target)
        if fault == "stuck_drawer":
            joint.frictionloss = max(joint.frictionloss * 1000, 1000)
        elif fault == "sticky_button":
            joint.stiffness, joint.frictionloss = 0, 100
        elif fault == "contact_bounce":
            joint.solref_limit = [0.02, 0.05]
        elif fault == "free_swing":
            joint.damping, joint.frictionloss = 0, 0
        elif fault == "feather_door":
            model = clean.compile()
            joint_body = model.joint(target).bodyid[0]
            ratio = min(0.001, 0.0005 / model.body_subtreemass[joint_body])
            pending = [joint.parent]
            while pending:
                body = pending.pop()
                body.mass *= ratio
                body.fullinertia[:] *= ratio
                body.inertia[:] *= ratio
                # Bodies without an explicit inertial derive it from their geoms.
                for geom in body.geoms:
                    geom.mass *= ratio
                    geom.density *= ratio
                pending.extend(body.bodies)
        else:
            raise ValueError("Unknown fault " + fault)
    return spec


def targets(model):
    record = embedded(model)
    joints, _, roles, _, _ = resolve(model, {}, Limits())
    chosen = {}
    for joint in joints:
        name = joint["name"]
        jid = model.joint(name).id
        if roles["joints"].get(name) == "button":
            chosen.setdefault("sticky_button", (name, name))
            continue
        if model.jnt_stiffness[jid] == 0 and roles["joints"].get(name) != "knob":
            chosen.setdefault("contact_bounce", (name, name))
        if model.jnt_type[jid] == mj.mjtJoint.mjJNT_SLIDE:
            chosen.setdefault("stuck_drawer", (name, name))
        else:
            chosen.setdefault("feather_door", (name, name))
            if model.jnt_stiffness[jid] > 0:
                chosen.setdefault("free_swing", (name, name))
    for sensor in roles["sensors"]:
        site = model.site(model.sensor(sensor).objid[0]).name
        chosen.setdefault("dead_sensor", (site, sensor))
    for a in record.get("affordances", []):
        if a.get("grip") == "raised":
            chosen.setdefault("ghost_handle", (a["part"], "grasp_" + a["part"]))
    return chosen


def run_record(job):
    folder, row = job
    spec = mj.MjSpec.from_file(str((folder / row["mjcf_path"]).resolve()))
    model = spec.compile()
    clean = lint_spec(spec)
    baseline = {(f["id"], f["element"]) for f in clean}
    picked = targets(model)
    cases = {}
    for fault, required in EXPECTED.items():
        if fault not in picked:
            cases[fault] = {"status": "n/a"}
            continue
        target, element = picked[fault]
        injected = mutate(spec, fault, target)
        findings = lint_spec(injected, rules=set(required), target=element)
        addresses = {element}
        if fault == "ghost_handle":
            body = model.body_weldid[model.geom(target).bodyid[0]]
            addresses.update(
                model.joint(i).name
                for i in range(model.njnt)
                if model.jnt_bodyid[i] == body
            )
        fired = sorted(
            {
                f["id"]
                for f in findings
                if f["element"] in addresses and (f["id"], f["element"]) not in baseline
            }
        )
        caught = bool(fired) if fault == "ghost_handle" else set(required) <= set(fired)
        cases[fault] = {
            "status": "caught" if caught else "missed",
            "target": target,
            "fired": fired,
        }
    return dict(id=row["id"], asset=row["asset_id"], clean=clean, faults=cases)


def summary(rows):
    lines = [
        "# Articulation lint and fault detection",
        "",
        f"{len(rows)} MJCF records. Each count represents a fresh simulation or static inspection.",
        "",
        "| Asset | Clean records | Errors | Warnings | Info |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    groups = {
        a: [r for r in rows if r["asset"] == a]
        for a in sorted({r["asset"] for r in rows})
    }
    for asset, group in groups.items():
        counts = Counter(f["severity"] for r in group for f in r["clean"])
        lines.append(
            f"| {asset} | {len(group)} | {counts['error']} | {counts['warn']} | {counts['info']} |"
        )
    lines.extend(
        [
            "",
            "Cells show caught / applicable. A dash marks an inapplicable fault.",
            "",
            "| Fault | Expected rule(s) | " + " | ".join(groups) + " |",
            "| --- | --- | " + " | ".join("---:" for _ in groups) + " |",
        ]
    )
    for fault, required in EXPECTED.items():
        cells = []
        for group in groups.values():
            counts = Counter(r["faults"][fault]["status"] for r in group)
            n = counts["caught"] + counts["missed"]
            cells.append(f"{counts['caught']}/{n}" if n else "—")
        lines.append(f"| {fault} | {', '.join(required)} | " + " | ".join(cells) + " |")
    lines.extend(
        [
            "",
            "Only a newly triggered rule on the targeted element counts. Ghost handles accept either listed rule.",
            "These observations apply to the specified mutations and finite probe trajectories.",
        ]
    )
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    manifest = (args.dataset / "data.jsonl").read_text(encoding="utf-8").splitlines()
    if not manifest:
        parser.error("empty manifest")
    jobs = [(args.dataset, json.loads(line)) for line in manifest]
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        rows = sorted(pool.map(run_record, jobs), key=lambda r: (r["asset"], r["id"]))
    dump(args.out / "matrix.json", rows)
    content = summary(rows)
    (args.out / "matrix.md").write_text(content, encoding="utf-8")
    print(content.encode("ascii", "backslashreplace").decode())
    return int(
        any(
            any(f["severity"] == "error" for f in r["clean"])
            or any(c["status"] == "missed" for c in r["faults"].values())
            for r in rows
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
