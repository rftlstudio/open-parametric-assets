"""Record two real oracle interactions. Development dependencies: MuJoCo and Pillow."""
from pathlib import Path
import sys

import mujoco as mj
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "examples/demo"))
from demo import camera, prepare

FPS = 20
WIDTH, HEIGHT = 480, 360


def clip(path, task, seconds):
    hand, original = prepare(path, task, visible=True)
    # Keep enough state to replay the actual simulation at a fixed output frame rate.
    poses = []
    def capture():
        d = hand.data
        poses.append((d.qpos.copy(), d.mocap_pos.copy(), d.mocap_quat.copy()))

    capture()
    hand.on_step = capture
    hand.achieve(hand.task["goal"])
    if hand.success_snapshot is None:
        raise ValueError(f"{task}: oracle failed")
    cam = mj.MjvCamera()
    camera(cam, original)
    if task == "microwave/press_start":
        cam.distance = original.stat.extent * 0.85
        cam.azimuth, cam.elevation = 96, -5
    else:
        cam.lookat[1] -= 0.15
        cam.distance = original.stat.extent * 1.25
    frames = []
    with mj.Renderer(hand.model, HEIGHT, WIDTH) as renderer:
        for index in np.linspace(0, len(poses)-1, seconds * FPS).round().astype(int):
            d = hand.data
            d.qpos[:], d.mocap_pos[:], d.mocap_quat[:] = poses[index]
            mj.mj_forward(hand.model, d)
            renderer.update_scene(d, camera=cam)
            renderer.scene.flags[mj.mjtRndFlag.mjRND_SHADOW] = False
            rgb = renderer.render().copy()
            renderer.enable_segmentation_rendering()
            background = renderer.render()[:, :, 0] < 0
            renderer.disable_segmentation_rendering()
            rgb[background] = [230, 230, 230]
            frame = Image.fromarray(rgb)
            draw = ImageDraw.Draw(frame)
            draw.rounded_rectangle((10, 10, 270, 35), radius=5, fill=(30, 35, 39))
            draw.text((19, 16), task, fill="white")
            if index * hand.model.opt.timestep >= hand.success_time:
                draw.text((228, 16), "PASS", fill=(141, 244, 180))
            frames.append(frame.quantize(colors=128))
    return frames


if __name__ == "__main__":
    models = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "examples/demo/models"
    frames = clip(models / "physical/model.xml", "microwave/press_start", 2)
    frames += clip(models / "oven/model.xml", "oven/open_door_pull_rack", 4)
    out = ROOT / "docs/media/demo.gif"
    out.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=1000 // FPS, loop=0, optimize=True)
    if out.stat().st_size >= 3_000_000:
        raise ValueError("GIF exceeds 3 MB")
    print(f"{out}: {out.stat().st_size} bytes")
