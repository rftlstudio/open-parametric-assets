"""Physical return and detent tests using small imported URDFs."""
import contextlib
import io
from pathlib import Path
import tempfile
import unittest

import xml.etree.ElementTree as ET

from check_asset import touch_check, apply_springs, button_check, knob_check, load


class ControlTests(unittest.TestCase):
    def run_control(self, kind, broken=None):
        button = kind == "button"
        joint_type = "prismatic" if button else "revolute"
        upper = 0.003 if button else 1
        damping = 1.5 if button else 0.02
        state = ({"kind": "momentary", "pressedAt": 0.6}
                 if button else {"kind": "detent", "positions": [0, 0.5, 1], "values": [0, 5, 10], "unit": "min"})
        control = {"name": "test_control", "type": kind, "joint": "control_joint", "state": state}
        record = {"joints": [{"name": "control_joint", "limits": [0, upper]}], "controls": [control]}
        if button:
            record["joints"][0]["dynamics"] = {"spring": {"stiffness": 300, "restPosition": 0}}
        limits = {"control_joint": {"effort": 3 if button else 0.3, "velocity": 1}}
        xml = f"""<robot name="base">
          <mujoco><compiler fusestatic="false"/></mujoco>
          <link name="base">
            <collision name="body"><origin xyz="1 0 0"/><geometry><box size=".02 .02 .02"/></geometry></collision>
          </link>
          <link name="control">
            <inertial><mass value=".01"/><inertia ixx=".0001" iyy=".0001" izz=".0001" ixy="0" ixz="0" iyz="0"/></inertial>
            <collision name="cap"><geometry><box size=".02 .02 .016"/></geometry></collision>
          </link>
          <joint name="control_joint" type="{joint_type}">
            <parent link="base"/><child link="control"/><origin xyz="0 0 .1"/><axis xyz="1 0 0"/>
            <limit lower="0" upper="{upper}" effort="3" velocity="1"/>
            <dynamics damping="{damping}" friction=".02"/>
          </joint>
        </robot>"""
        with tempfile.TemporaryDirectory(prefix="opa-controls-") as directory:
            path = Path(directory) / "model.urdf"
            path.write_text(xml, encoding="utf-8")
            model = load(path).compile()
            apply_springs(model, record["joints"])
            if broken == "spring":
                model.jnt_stiffness[:] = 0
            if broken == "friction":
                model.dof_frictionloss[:] = 0
            if broken == "effort":
                limits["control_joint"]["effort"] = 0.0001
            with contextlib.redirect_stdout(io.StringIO()):
                (button_check if button else knob_check)(model, record, control, limits)

    def exercise_touch_panel(self, separation):
        box = '<geometry><box size=".10 .04 .01"/></geometry>'
        xml = f"""<robot name="panel"><mujoco><compiler fusestatic="false" discardvisual="true"/></mujoco>
        <link name="panel"><visual name="visual_glass"><origin xyz="0 0 0"/>{box}</visual>
        <collision name="glass">{box}</collision></link></robot>"""
        controls = [dict(name=f"key_{i}", type="touch", state={"minForceN": 1},
                         region=dict(part="glass", point=[x,0,.005], normal=[0,0,1], size=[.02,.02]))
                    for i, x in enumerate([0,separation])]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.urdf"
            path.write_text(xml)
            touch_check(path, ET.fromstring(xml), {"controls": controls, "joints": []})

    def test_touch_regions_measure_independent_forces(self):
        self.exercise_touch_panel(0.025)

    def test_overlapping_touch_sensors_report_crosstalk(self):
        with self.assertRaisesRegex(ValueError, "neighbouring region activated"):
            self.exercise_touch_panel(0.003)

    def test_button_presses_and_returns(self):
        self.run_control("button")

    def test_button_without_return_spring_fails(self):
        with self.assertRaisesRegex(ValueError, "failed to return"):
            self.run_control("button", broken="spring")

    def test_button_with_insufficient_force_fails(self):
        with self.assertRaisesRegex(ValueError, "failed to press"):
            self.run_control("button", broken="effort")

    def test_knob_holds_every_detent(self):
        self.run_control("knob")

    def test_knob_without_friction_fails(self):
        with self.assertRaisesRegex(ValueError, "frictionloss"):
            self.run_control("knob", broken="friction")


if __name__ == "__main__":
    unittest.main()
