"""Run the existing simulator on both model formats before publishing a release."""
from concurrent.futures import ProcessPoolExecutor, as_completed
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sim"))
from check_asset import check


def verify(folder, record):
    for field, report_key in (("urdf_path", "sim_report"), ("mjcf_path", "mjcf_sim_report")):
        path = folder / record[field]
        check(path.resolve())
        report = json.loads((folder / record["provenance"][report_key]).read_text(encoding="utf-8"))
        if report["id"] != record["id"] or report["passed"] is not True:
            raise ValueError(f"{path}: expected a passing report for {record['id']}")


if __name__ == "__main__":
    manifest = Path(sys.argv[1])
    records = [json.loads(line) for line in manifest.read_text(encoding="utf-8").splitlines()]
    with ProcessPoolExecutor(max_workers=min(6, os.cpu_count() or 1)) as workers:
        jobs = [workers.submit(verify, manifest.parent, record) for record in records]
        try:
            for job in as_completed(jobs):
                job.result()
        except BaseException:
            for job in jobs:
                job.cancel()
            raise
