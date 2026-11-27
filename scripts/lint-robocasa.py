"""Reproduce standalone fixture observations from a local pinned RoboCasa checkout."""

import argparse
import json
from pathlib import Path
import subprocess
import sys
import mujoco as mj

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from sim.lint.cli import lint_spec  # noqa: E402 (direct script entry point)
from sim.lint.report import dump, table  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout", required=True, type=Path)
    parser.add_argument("--extracted", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path, help="report basename")
    args = parser.parse_args()
    checkout = args.checkout.resolve()
    commit = subprocess.check_output(
        [
            "git",
            "-c",
            "safe.directory=" + checkout.as_posix(),
            "-C",
            str(checkout),
            "rev-parse",
            "HEAD",
        ],
        text=True,
    ).strip()
    rows = []
    for role_file in sorted((ROOT / "lint/roles/robocasa").glob("*.json")):
        roles = json.loads(role_file.read_text(encoding="utf-8"))
        revision, source = roles["source"].split("/", 1)
        if revision != "robocasa@" + commit:
            raise ValueError("Checkout differs from " + revision)
        procedure = Path(source).parent.name == "cabinets"
        path = (
            args.extracted / (role_file.stem + ".xml")
            if procedure
            else checkout / source
        )
        row = dict(
            fixture=role_file.stem,
            source=source,
            commit=commit,
            method="assembled" if procedure else "standalone",
        )
        try:
            spec = mj.MjSpec.from_file(str(path.resolve()))
            model = spec.compile()
            row.update(loaded=True, joints=model.njnt, findings=lint_spec(spec, roles))
        except (OSError, ValueError, KeyError) as error:
            row.update(
                loaded=False,
                error=str(error)
                .replace(str(checkout), "<checkout>")
                .replace(str(path.resolve()), source),
            )
        rows.append(row)
        print(
            role_file.stem, row.get("joints"), len(row.get("findings", [])), flush=True
        )
    dump(args.out.with_suffix(".json"), rows)
    lines = [
        "# RoboCasa fixture observations",
        "",
        f"Loaded {sum(r['loaded'] for r in rows)} of {len(rows)} selected fixtures at `{commit}` with MuJoCo {mj.__version__}.",
        "",
        "## Scope and interpretation",
        "",
        "These observations describe the tested fixture and probe. The standalone scene omits the robot, gripper, placement and high-level state logic. "
        "Continuous joints, low resistance and contact-driven buttons may be intentional. A rack tested behind a closed door may need a task-level opening sequence. "
        "The sample covers individual variants of ten fixtures and does not characterize the full collection.",
        "",
        "For each rule, the [threshold table](../docs/LINT.md) gives its units, rationale and configuration. "
        "The [source and reproduction notes](../lint/roles/robocasa/README.md) describe scene assembly and role assignments.",
    ]
    for r in rows:
        lines.extend(
            [
                "",
                "## " + r["fixture"],
                "",
                f"Source `{r['source']}` ({r['method']}).",
                "",
            ]
        )
        if r["loaded"]:
            lines.append(
                table(r["findings"])
                if r["findings"]
                else "No findings for this fixture under the tested conditions."
            )
        else:
            lines.append("Load attempt: " + r["error"])
    args.out.with_suffix(".md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return int(sum(r["loaded"] for r in rows) < 8)


if __name__ == "__main__":
    raise SystemExit(main())
