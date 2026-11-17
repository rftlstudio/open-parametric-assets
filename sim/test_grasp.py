"""Regression checks for raised and recessed grasp semantics."""
import contextlib
import io
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET

from check_asset import grasp


class GraspTests(unittest.TestCase):
    def check_grasp(self, point, style="bar", obstacle_x=0.08, lower=0):
        inertia = '<inertial><mass value="1"/><inertia ixx=".01" iyy=".01" izz=".01" ixy="0" ixz="0" iyz="0"/></inertial>'
        box = '<geometry><box size=".02 .02 .02"/></geometry>'
        xml = f"""<robot name="base">
          <mujoco><compiler fusestatic="false" discardvisual="true"/></mujoco>
          <link name="base">{inertia}
            <collision name="obstacle"><origin xyz="{obstacle_x} 0 0"/>{box}</collision>
          </link>
          <link name="grip_link">{inertia}
            <visual name="visual_grip"><origin xyz="0 0 0"/>{box}</visual>
            <collision name="grip"><origin xyz="0 0 0"/>{box}</collision>
          </link>
          <joint name="slide" type="prismatic">
            <parent link="base"/><child link="grip_link"/><axis xyz="1 0 0"/>
            <limit lower="{lower}" upper=".1" effort="10" velocity="1"/>
          </joint>
        </robot>"""
        record = {
            "params": {"handleStyle": style},
            "joints": [{"name": "slide", "limits": [lower, 0.1]}],
            "affordances": [{"type": "grasp", "part": "grip", "point": point}],
        }
        with tempfile.TemporaryDirectory(prefix="opa-grasp-") as directory:
            path = Path(directory) / "model.urdf"
            path.write_text(xml, encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                grasp(path, ET.fromstring(xml), record)

    def test_raised_center_passes_for_bar_and_knob(self):
        for style in ("bar", "knob"):
            with self.subTest(style=style):
                self.check_grasp([0, 0, 0], style=style)

    def test_raised_surface_passes_but_external_point_fails(self):
        self.check_grasp([0.01, 0, 0])
        with self.assertRaisesRegex(ValueError, "inside its own collision box"):
            self.check_grasp([0.011, 0, 0])

    def test_raised_finger_room_excludes_only_the_own_box(self):
        for x in (0.019, 0.020):
            with self.subTest(obstacle_x=x):
                with self.assertRaisesRegex(ValueError, "finger room"):
                    self.check_grasp([0, 0, 0], obstacle_x=x)
        self.check_grasp([0, 0, 0], obstacle_x=0.0201)

    def test_lower_joint_limit_is_used_for_finger_room(self):
        with self.assertRaisesRegex(ValueError, "finger room"):
            self.check_grasp([0, 0, 0], obstacle_x=0.05, lower=0.03)

    def test_recessed_point_must_clear_own_and_other_geometry(self):
        for point in ([0, 0, 0], [0.012, 0, 0], [0.08, 0, 0]):
            with self.subTest(point=point):
                with self.assertRaisesRegex(ValueError, "must exceed 0.002"):
                    self.check_grasp(point, style="recessed")
        self.check_grasp([0.0121, 0, 0], style="recessed")


if __name__ == "__main__":
    unittest.main()
