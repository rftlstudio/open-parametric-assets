"""Synthetic URDF tests for passive hinges, limit rebounds and loaded slides."""
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from check_asset import apply_springs, carry, door_behavior, door_bounce, load

class OvenChecks(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "model.urdf"

    def door(self, damping=0.25, friction=0.03):
        spring = 0.04*9.81/1.57
        self.path.write_text(f"""<robot name="base">
          <mujoco><compiler fusestatic="false"/></mujoco><link name="base"/>
          <link name="door"><inertial><origin xyz="0 0 .04"/><mass value="1"/>
          <inertia ixx=".0003" iyy=".0003" izz=".0003" ixy="0" ixz="0" iyz="0"/></inertial></link>
          <joint name="door_hinge" type="revolute"><parent link="base"/><child link="door"/>
          <axis xyz="1 0 0"/><limit lower="0" upper="1.57" effort="8" velocity="2"/>
          <dynamics damping="{damping}" friction="{friction}"/></joint></robot>""")
        joints = [dict(name="door_hinge", limits=[0,1.57], dynamics=dict(spring=dict(stiffness=spring,restPosition=0)))]
        model = load(self.path).compile()
        apply_springs(model,joints)
        return model,joints,{"door_hinge":{"effort":8,"velocity":2}}

    def test_damped_hinge(self):
        model,joints,limits = self.door()
        door_behavior(model,joints)
        door_bounce(model,joints,limits)

    def test_unrestrained_slam(self):
        with self.assertRaisesRegex(ValueError,"slam"):
            door_behavior(*self.door(damping=0,friction=0)[:2])

    def test_rebounding_limit(self):
        model,joints,limits = self.door(damping=0,friction=0)
        model.jnt_solref[0] = [0.025, 0.15]
        with self.assertRaisesRegex(ValueError,"bounce"):
            door_bounce(model,joints,limits)

    def tray(self, effort):
        box = '<geometry><box size=".2 .25 .01"/></geometry>'
        source = f"""<robot name="base"><mujoco><compiler fusestatic="false" discardvisual="true"/></mujoco>
        <link name="base"/><link name="tray"><visual name="visual_floor"><origin xyz="0 0 0"/>{box}</visual>
        <collision name="floor">{box}</collision></link>
        <joint name="slide" type="prismatic"><parent link="base"/><child link="tray"/><axis xyz="0 1 0"/>
        <limit lower="0" upper=".1" velocity=".2" effort="{effort}"/><dynamics friction="1"/></joint></robot>"""
        self.path.write_text(source)
        record = {"joints":[dict(name="slide",type="prismatic",childPart="tray",limits=[0,.1])],
                  "affordances":[dict(type="placeable",part="floor",point=[0,0,.005],normal=[0,0,1],size=[.2,.25])]}
        carry(self.path,ET.fromstring(source),record,{"slide":{"velocity":.2,"effort":effort}})

    def test_loaded_tray(self):
        self.tray(15)

    def test_jammed_tray(self):
        with self.assertRaisesRegex(ValueError,"jam"):
            self.tray(0.01)
