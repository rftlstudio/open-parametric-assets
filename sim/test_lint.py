"""Record-free CLI behavior and small, controlled rule regressions."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import mujoco as mj
from sim.lint.cli import lint_spec
from sim.lint.faults import mutate
from sim.lint.report import Limits

FOREIGN = """<mujoco><worldbody><body name="leaf">
<inertial mass=".01" pos="0 0 0" diaginertia=".001 .001 .001"/>
<joint type="hinge" limited="false"/>
<geom type="box" size=".1 .1 .1" contype="0" conaffinity="0"/>
<site name="handle" pos=".15 0 0"/></body></worldbody></mujoco>"""


class RecordFreeTests(unittest.TestCase):
    def test_foreign_cli_json_and_exit(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "model.xml"
            path.write_text(FOREIGN)
            report = Path(root) / "findings.json"
            args = [sys.executable, "-m", "sim.lint", str(path), "--json", str(report)]
            first = subprocess.run(args, capture_output=True)
            self.assertEqual(first.returncode, 1, first.stderr)
            findings = json.loads(report.read_text())["findings"]
            self.assertEqual(
                [f["id"] for f in findings], ["A001", "A002", "A004", "A005"]
            )
            for f in findings:
                self.assertEqual(
                    set(f),
                    {"id", "severity", "element", "measured", "threshold", "hint"},
                )
            second = subprocess.run(args, capture_output=True)
            self.assertEqual(first.stdout, second.stdout)
            self.assertIn("lint_joint_0", second.stdout.decode())

    def test_configuration_and_welded_collision(self):
        xml = (
            FOREIGN.replace('limited="false"', 'range="0 60" damping=".2"')
            .replace('<geom type="box"', '<body><geom type="box"')
            .replace('contype="0" conaffinity="0"/>', "/></body>")
        )
        spec = mj.MjSpec.from_string(xml)
        labels = {"handles": {"lint_joint_0": "handle"}}

        def ids(config):
            return {
                f["id"] for f in lint_spec(spec, labels, config, rules={"A004", "A005"})
            }

        self.assertEqual(ids(Limits()), {"A005"})
        self.assertEqual(ids(Limits(handle_gap=0.06)), set())
        with self.assertRaises(ValueError):
            lint_spec(spec, {"joints": {"missing": "door"}})

    def test_touch_site_surface_and_neighbour(self):
        xml = """<mujoco><worldbody><geom type="box" size=".1 .1 .01"/>
        <site name="one" type="box" size=".02 .02 .001" pos="0 0 .01"/>
        <site name="two" type="box" size=".02 .02 .001" pos="0 0 .01"/></worldbody>
        <sensor><touch name="a" site="one"/><touch name="b" site="two"/></sensor></mujoco>"""
        spec = mj.MjSpec.from_string(xml)
        overlap = lint_spec(spec, rules={"P005"})
        self.assertEqual({f["element"] for f in overlap}, {"a", "b"})
        broken = mutate(spec, "dead_sensor", "one")
        ids = {
            f["id"]
            for f in lint_spec(broken, rules={"A007", "P005"})
            if f["element"] == "a"
        }
        self.assertEqual(ids, {"A007", "P005"})
        self.assertEqual(spec.site("one").pos[2], 0.01)

    def test_rotated_panel_measures_air_gap_to_touch_box(self):
        xml = """<mujoco><worldbody>
        <geom type="box" size=".075 .118 .006" pos=".213 -.158 .13"
              quat=".70710678 .70710678 0 0"/>
        <site name="target" type="box" size=".05508 .0169 .001" pos=".213 -.214 .1352"
              quat=".70710678 .70710678 0 0"/></worldbody>
        <sensor><touch name="sensor" site="target"/></sensor></mujoco>"""
        findings = lint_spec(mj.MjSpec.from_string(xml), rules={"A007"})
        self.assertEqual([f["element"] for f in findings], ["sensor"])
        self.assertAlmostEqual(findings[0]["measured"], 0.049, places=6)

    def test_nonparent_sweep_collision(self):
        xml = """<mujoco><worldbody><body><joint name="slide" type="slide" axis="1 0 0"
        range="0 .15"/><geom type="sphere" size=".04" mass=".5"/></body>
        <body pos=".10 0 0"><joint name="stop" type="slide" axis="0 0 1" range="0 .0001"
        damping="50"/><geom type="sphere" size=".04" mass="2"/></body></worldbody></mujoco>"""
        f = lint_spec(mj.MjSpec.from_string(xml), rules={"P006"}, target="slide")
        self.assertTrue(any(i["measured"] > 0.001 for i in f))

    def test_invalid_compiled_range(self):
        spec = mj.MjSpec.from_string(
            FOREIGN.replace('limited="false"', 'range="0 0" limited="true"')
        )
        findings = lint_spec(spec)
        self.assertEqual(findings[0]["id"], "A001")
        self.assertEqual(findings[0]["severity"], "error")
