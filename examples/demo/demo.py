"""Run a published manipulation task offline, or fetch its MJCF from Hugging Face."""
import argparse
from contextlib import nullcontext
import json
from pathlib import Path
import re
from shutil import copyfileobj
import sys
from tempfile import NamedTemporaryFile
import time
from urllib.request import urlopen
import xml.etree.ElementTree as ET

import mujoco as mj

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "sim"))
from oracle import Hand

REVISION = "v0.4.0"
REPO = "rftlstudio/open-parametric-assets"
CACHE = Path.home() / ".cache" / "open-parametric-assets" / REVISION
START = ("microwave/press_start", "microwave/press_start_touch")


def checked_path(relative):
    if any(not re.fullmatch(r"[A-Za-z0-9_-][A-Za-z0-9_.-]*", part) for part in relative.split("/")):
        raise ValueError(f"Unexpected dataset path {relative!r}")
    return relative


def url_for(relative):
    return f"https://huggingface.co/datasets/{REPO}/resolve/{REVISION}/{checked_path(relative)}"


def fetch(relative):
    url = url_for(relative)
    dest = CACHE / relative
    if not dest.is_file():
        dest.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(dir=dest.parent, delete=False) as temp:
            pending = Path(temp.name)
        try:
            with urlopen(url, timeout=45) as response, pending.open("wb") as output:
                copyfileobj(response, output)
            pending.replace(dest)
        finally:
            pending.unlink(missing_ok=True)
    return dest


def metadata(model):
    index = mj.mj_name2id(model, mj.mjtObj.mjOBJ_TEXT, "opa_metadata")
    if index < 0:
        raise ValueError("Missing opa_metadata in MJCF")
    offset = int(model.text_adr[index])
    return json.loads(model.text_data[offset:offset + int(model.text_size[index]) - 1])


def select(records, task_id):
    for record in records:
        for task in record["tasks"]:
            if task_id not in (task["id"], task["id"].split("/")[-1]):
                continue
            # Mixed panels share the touch task. The introductory pair shows a full keypad.
            if task["id"] == START[1] and record.get("params", {}).get("controlStyle") == "mixed":
                continue
            return record, task["id"]
    raise ValueError(f"No model for task {task_id!r}")


def model_paths(tasks, online):
    if online:
        records = [json.loads(line) for line in fetch("data.jsonl").read_text(encoding="utf-8").splitlines()]
    else:
        records = []
        for path in sorted((HERE / "models").glob("*/model.xml")):
            records.append(dict(metadata(mj.MjModel.from_xml_path(str(path))), local=path))
    for requested in tasks:
        record, task_id = select(records, requested)
        if online:
            relative = record["mjcf_path"]
            if not re.fullmatch(r"mjcf/[0-9a-f]{64}/model\.xml", relative):
                raise ValueError(f"Invalid MJCF path {relative!r}")
            path = fetch(relative)
            for mesh in ET.parse(path).findall("asset/mesh"):
                name = mesh.attrib["file"]
                if not re.fullmatch(r"meshes/[\w-]+\.obj", name, re.ASCII):
                    raise ValueError(f"Invalid mesh filename {name!r}")
                fetch(f"{relative.rsplit('/', 1)[0]}/{name}")
        else:
            path = record["local"]
        yield path, task_id


def prepare(path, task_id, visible=False):
    original = mj.MjModel.from_xml_path(str(path))
    record = metadata(original)
    task = next(t for t in record["tasks"] if t["id"] == task_id)
    hand = Hand(path, record, task, visible=visible)
    hand.model.stat.extent = original.stat.extent
    return hand, original


def camera(cam, original):
    cam.lookat[:] = original.stat.center
    cam.azimuth, cam.elevation = 112, -13
    cam.distance = 1.18 * original.stat.extent


def run(path, task_id, view):
    hand, original = prepare(path, task_id, visible=view)
    context = nullcontext()
    if view:
        import mujoco.viewer
        context = mujoco.viewer.launch_passive(hand.model, hand.data)
    with context as viewer:
        if viewer:
            camera(viewer.cam, original)
            viewer.sync()
            time.sleep(0.6)
            start = time.monotonic()

            def show():
                if not viewer.is_running():
                    raise InterruptedError("Viewer closed")
                viewer.sync()
                time.sleep(max(0, start + hand.data.time - time.monotonic()))

            hand.on_step = show
        hand.achieve(hand.task["goal"])
        if hand.success_snapshot is None:
            raise ValueError(f"{task_id}: goal not observed")
        if viewer:
            viewer.sync()
            time.sleep(0.6)
        print(f"{task_id}: {hand.task['instruction']} -> PASS ({hand.success_time:.3f} s)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", help="full task ID or its short name")
    parser.add_argument("--hf", action="store_true", help=f"download from {REPO} at {REVISION}")
    parser.add_argument("--view", action="store_true", help="watch the simulation in real time")
    args = parser.parse_args()
    try:
        for model_path, task_name in model_paths([args.task] if args.task else START, args.hf):
            run(model_path, task_name, args.view)
    except (OSError, ValueError, RuntimeError) as error:
        sys.exit(f"Demo failed: {error}")
