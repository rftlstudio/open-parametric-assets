"""Lint a standalone MJCF. Optional roles add control semantics."""

import argparse
import json
from pathlib import Path

import mujoco as mj

from . import probes
from .report import Limits, dump, finding, table
from .roles import resolve
from .rules_static import static


def named(spec):
    # Anonymous MJCF elements are valid. Assign stable, collision-free names
    # in memory so that findings and the shared controller can address them.
    for kind, items in (
        ("joint", spec.joints),
        ("sensor", spec.sensors),
        ("site", spec.sites),
    ):
        used = {x.name for x in items}
        for i, item in enumerate(items):
            if not item.name:
                name = f"lint_{kind}_{i}"
                while name in used:
                    name += "_"
                item.name = name
                used.add(name)


def lint_spec(spec, overrides=None, limits=None, rules=None, target=None):
    limits = limits or Limits()
    spec = spec.copy()
    named(spec)
    spec.option.timestep = 0.002
    spec.option.gravity = [0, 0, -9.81]
    spec.option.integrator = mj.mjtIntegrator.mjINT_IMPLICITFAST
    spec.option.disableflags |= int(mj.mjtDisableBit.mjDSBL_ACTUATION)
    try:
        model = spec.compile()
    except ValueError as error:
        message = str(error)
        rule = (
            "A001"
            if "range" in message and "joint" in message
            else "A003"
            if any(x in message.lower() for x in ("inertia", "mass"))
            else "LOAD"
        )
        return [
            finding(
                rule,
                "error",
                "compiler",
                message,
                "compilable MJCF",
                "Inspect the named element in the source MJCF.",
            )
        ]
    joints, drives, roles, buttons, forces = resolve(model, overrides or {}, limits)
    data = mj.MjData(model)
    mj.mj_forward(model, data)
    checks = []

    def wanted(rule):
        return rules is None or rule in rules

    if rules is None or any(r.startswith("A") for r in rules):
        checks.extend(
            f
            for f in static(spec, model, data, joints, roles, limits)
            if wanted(f["id"])
        )
    bounded = [
        j
        for j in joints
        if model.joint(j["name"]).limited[0] and j["limits"][0] < j["limits"][1]
    ]
    if wanted("P001") and bounded:
        checks.extend(probes.passive(model, bounded, limits))
    for j in bounded:
        name = j["name"]
        if target and target != name:
            continue
        if wanted("P002") or wanted("P006"):
            checks.extend(
                f
                for f in probes.drive(model, bounded, drives, j, limits)
                if wanted(f["id"])
            )
        if roles["joints"].get(name) == "button":
            if wanted("P004"):
                checks.extend(
                    probes.button(
                        model,
                        bounded,
                        drives,
                        j,
                        buttons.get(name, limits.press_fraction),
                        limits,
                    )
                )
        elif wanted("P003"):
            checks.extend(probes.bounce(model, bounded, drives, j, limits))
    if wanted("P005"):
        checks.extend(probes.touch(spec, roles, forces, limits))
    return sorted(
        checks,
        key=lambda f: (
            f["id"],
            f["element"],
            json.dumps(f["measured"], sort_keys=True),
        ),
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("--roles", type=Path)
    parser.add_argument("--thresholds", type=Path)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args(argv)
    try:

        def config(path):
            return json.loads(path.read_text(encoding="utf-8")) if path else {}

        spec = mj.MjSpec.from_file(str(args.model.resolve()))
        findings = lint_spec(
            spec, config(args.roles), Limits(**config(args.thresholds))
        )
    except (ValueError, OSError, TypeError, KeyError) as error:
        findings = [
            finding(
                "LOAD",
                "error",
                args.model.name,
                str(error),
                "valid input",
                "Check model resources and role names.",
            )
        ]
    if args.json:
        dump(args.json, {"model": args.model.name, "findings": findings})
    print(table(findings) if findings else "No findings.")
    return int(any(f["severity"] == "error" for f in findings))
