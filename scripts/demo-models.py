"""Copy the three offline demo fixtures from a verified release build."""
import json
from pathlib import Path
from shutil import copy2, copytree
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "examples/demo"))
from demo import select, START


def copy_models(folder, destination):
    records = [json.loads(line) for line in (folder / "data.jsonl").read_text(encoding="utf-8").splitlines()]
    destination.mkdir(parents=True, exist_ok=True)
    for name, task in zip(("physical", "touch", "oven"), (*START, "oven/open_door_pull_rack")):
        record, _ = select(records, task)
        for key in ["sim_report", "mjcf_sim_report"]:
            report = folder / record["provenance"][key]
            data = json.loads(report.read_text(encoding="utf-8"))
            if data["id"] != record["id"] or data["passed"] is not True:
                raise ValueError(f"Expected passing report: {report}")
        copytree((folder / record["mjcf_path"]).parent, destination / name)
        copy2(folder / record["provenance"]["mjcf_sim_report"], destination / name)
    total = sum(p.stat().st_size for p in destination.rglob("*") if p.is_file())
    if total >= 5_000_000:
        raise ValueError(f"Offline models exceed budget: {total} bytes")
    print(f"Copied offline models ({total} bytes)")


if __name__ == "__main__":
    copy_models(Path(sys.argv[1]), Path(sys.argv[2]))
