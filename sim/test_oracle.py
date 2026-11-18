import json
from pathlib import Path
import tempfile
import unittest

from logic import evaluate
from oracle import Hand, solve


class OracleTests(unittest.TestCase):
    def test_shared_logic(self):
        fixture = json.loads((Path(__file__).resolve().parents[1]/"tests/fixtures/logic-cases.json").read_text())
        for goal, expected in fixture["cases"]:
            self.assertEqual(evaluate(goal, fixture["states"], fixture["snapshot"]), expected)

    def hinge(self, offset):
        box = '<geometry><box size=".02 .02 .02"/></geometry>'
        xml = f"""<robot name="base"><mujoco><compiler fusestatic="false" discardvisual="true"/></mujoco>
        <link name="base"/><link name="door">
        <inertial><mass value=".2"/><inertia ixx=".01" iyy=".01" izz=".01" ixy="0" ixz="0" iyz="0"/></inertial>
        <visual name="visual_grip"><origin xyz=".2 0 0"/>{box}</visual>
        <collision name="grip"><origin xyz=".2 0 0"/>{box}</collision></link>
        <joint name="hinge" type="revolute"><parent link="base"/><child link="door"/>
        <axis xyz="0 0 1"/><limit lower="0" upper="1" velocity="1" effort="4"/></joint></robot>"""
        record = dict(joints=[dict(name="hinge",childPart="door",limits=[0,1])], states={},
                      affordances=[dict(type="grasp",grip="raised",part="grip",point=[0,offset,0])])
        task = dict(id="test/open",init={},goal=dict(joint="hinge",op=">",val=.8),horizon_s=4)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/"model.urdf"
            path.write_text(xml)
            return solve(path,record,task)

    def test_weld_pulls_hinge(self):
        result = self.hinge(0)
        self.assertGreater(result["snapshot"]["joints"]["hinge"], .8)
        self.assertGreater(len(result["steps"]), 1)

    def test_off_handle(self):
        with self.assertRaisesRegex(ValueError, "outside handle"):
            self.hinge(.03)

    def test_neighbour_does_not_activate_start(self):
        box = '<geometry><box size=".10 .04 .01"/></geometry>'
        xml = f"""<robot name="panel"><mujoco><compiler fusestatic="false" discardvisual="true"/></mujoco>
        <link name="panel"><visual name="visual_glass"><origin xyz="0 0 0"/>{box}</visual>
        <collision name="glass">{box}</collision></link></robot>"""
        controls = [dict(name=name,type="touch",state={"minForceN":1},
                    region=dict(part="glass",point=[x,0,.005],normal=[0,0,1],size=[.02,.02]))
                    for name,x in [("start",0),("stop",.03)]]
        record = dict(affordances=[],joints=[],controls=controls,
                      states={"start_pressed":dict(control="start",op="==",val=True)})
        task = dict(id="test/start",init={},goal={"state":"start_pressed"},horizon_s=1)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/"model.urdf"
            path.write_text(xml)
            hand = Hand(path,record,task)
            hand.press(controls[1])
            self.assertIsNone(hand.success_snapshot)
            self.assertTrue(solve(path,record,task)["passed"])

