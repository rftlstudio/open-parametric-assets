"""Assemble the three procedural RoboCasa fixtures with their official constructors."""

import argparse
from pathlib import Path

import mujoco as mj
import numpy as np
from robocasa.models.fixtures.cabinets import SingleCabinet, HingeCabinet, Drawer
from robosuite.models import MujocoWorldBase


def extract(out):
    out.mkdir(parents=True, exist_ok=True)
    for name, typ in [
        ("cabinet_single", SingleCabinet),
        ("cabinet_double", HingeCabinet),
        ("drawer", Drawer),
    ]:
        fixture = typ(
            name="fixture",
            size=[0.60, 0.55, 0.70],
            texture="textures/flat/light_gray.png",
            rng=np.random.default_rng(0),
        )
        world = MujocoWorldBase()
        world.merge_assets(fixture)
        world.worldbody.append(fixture.get_obj())
        model = mj.MjModel.from_xml_string(world.get_xml())
        path = out / (name + ".xml")
        mj.mj_saveLastXML(str(path), model)
        print(name, model.njnt, "joints")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    extract(parser.parse_args().out)
