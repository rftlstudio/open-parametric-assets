"""Run from any directory with Python and mujoco==3.3.7 installed."""
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "sim"))
from logic import evaluate
from oracle import Hand


def run(folder):
    record = json.loads((folder / "record.json").read_text(encoding="utf-8"))
    start = next(c for c in record["controls"] if c["function"] == "start")
    task = next(t for t in record["tasks"] if t["goal"] == {"state": "start_pressed"})
    hand = Hand(folder / record["urdf_path"], record, task)
    hand.press(start)
    pressed = hand.success_snapshot is not None and evaluate(
        task["goal"], record["states"], hand.success_snapshot)
    print(f"{folder.name}: {start['label']} -> start_pressed={pressed}")
    if not pressed:
        raise RuntimeError("The START region did not activate during contact")


if __name__ == "__main__":
    for style in ("physical", "touch"):
        run(HERE / style)

