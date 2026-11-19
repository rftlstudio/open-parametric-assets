"""Print the task matrix from the same per-record reports shipped with a build."""
from collections import Counter
import json
from pathlib import Path
import sys


def summarize(manifest):
    passed, total = Counter(), Counter()
    for line in manifest.read_text(encoding="utf-8").splitlines():
        record = json.loads(line)
        path = manifest.parent / record["provenance"]["sim_report"]
        report = json.loads(path.read_text(encoding="utf-8"))
        if report["id"] != record["id"]:
            raise ValueError(f"{path}: report belongs to a different record")
        results = {r["task"]: r["passed"] for r in report["oracle"]}
        for task in record["tasks"]:
            name = task["id"]
            total[name] += 1
            passed[name] += results.get(name, False)
    for name in sorted(total):
        print(f"{name}: {passed[name]}/{total[name]} passed")
    return passed == total


if __name__ == "__main__":
    raise SystemExit(0 if summarize(Path(sys.argv[1])) else 1)

