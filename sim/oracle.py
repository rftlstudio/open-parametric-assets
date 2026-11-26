"""Floating-hand oracle for the published pull, press and sequence tasks."""
import argparse
import json
from collections import Counter
from pathlib import Path
import xml.etree.ElementTree as ET

import mujoco as mj
import numpy as np

from check_asset import prepare_touch_sites, affordance_frame, compile_asset, initial, load, require
from logic import evaluate, snapshot


class Hand:
    def __init__(self, path, record, task):
        self.record, self.task = record, task
        self.xml = ET.parse(path).getroot()
        spec = load(path)
        controls = record.get("controls", [])
        prepare_touch_sites(spec, self.xml, record, [c for c in controls if c["type"] == "touch"])
        base = spec.compile()
        rest = initial(base, record["joints"])
        hand = spec.worldbody.add_body(name="oracle_hand", mocap=True, pos=[0, 0, 10])
        if self.xml.tag != "mujoco":
            hand.add_site(name="hand_site", size=[0.001, 0, 0])
        self.grips = {}
        for a in record["affordances"]:
            if a["type"] != "grasp":
                continue
            point, _, body = affordance_frame(base, rest, self.xml, a)
            name = base.body(body).name
            local = rest.xmat[body].reshape(3, 3).T @ (point-rest.xpos[body])
            if self.xml.tag == "mujoco":
                site = "grasp_" + a["part"]
                # Weld body frames with the hand origin at the declared asset site.
                spec.add_equality(name=site, type=mj.mjtEq.mjEQ_WELD, objtype=mj.mjtObj.mjOBJ_BODY,
                                  name1=name, name2="oracle_hand", active=False, solref=[0.006, 1],
                                  data=[0,0,0,*local,1,0,0,0,1])
            else:
                site = "grip_" + a["part"]
                spec.body(name).add_site(name=site, pos=local, size=[0.001, 0, 0])
                spec.add_equality(name=site, type=mj.mjtEq.mjEQ_WELD, objtype=mj.mjtObj.mjOBJ_SITE,
                                  name1="hand_site", name2=site, active=False, solref=[0.006, 1])
            self.grips[name] = (site, a)
        probe = spec.worldbody.add_body(name="oracle_probe", gravcomp=1, pos=[0, 0, 10])
        probe.add_freejoint(name="probe_free")
        probe.add_geom(name="probe_tip", type=mj.mjtGeom.mjGEOM_SPHERE, size=[0.004,0,0],
                       mass=0.02, priority=1, solref=[0.004, 1])
        self.model = m = compile_asset(spec,path,record)
        self.data = d = initial(m, record["joints"])
        self.joints = {j["name"]: j for j in record["joints"]}
        for name, frac in task["init"].items():
            lo, hi = self.joints[name]["limits"]
            d.joint(name).qpos[0] = lo + frac*(hi-lo)
        mj.mj_forward(m, d)
        self.trace = []
        self.peak_penetration = 0.
        self.success_snapshot = None
        self.success_time = None

    def snapshot(self):
        return snapshot(self.data,self.record,joint_sensors=self.xml.tag == "mujoco")

    def step(self, probing=False):
        m, d = self.model, self.data
        require(d.time + m.opt.timestep <= self.task["horizon_s"] + 1e-9, "task horizon exceeded")
        mj.mj_step(m, d)
        mj.mj_forward(m, d)
        contacts = []
        for c in d.contact:
            names = [m.geom(i).name for i in c.geom]
            contacts.append((names, float(c.dist)))
            self.peak_penetration = max(self.peak_penetration, -float(c.dist))
            require(c.dist >= -0.001, f"penetration {-c.dist:.6f} m: {names}")
        hand = d.body("oracle_probe") if probing else d.body("oracle_hand")
        self.trace.append(dict(time=d.time, joints={n: float(d.joint(n).qpos[0]) for n in self.joints},
                               hand=[*hand.xpos, *hand.xquat], contacts=contacts))
        values = self.snapshot()
        if self.success_snapshot is None and evaluate(self.task["goal"], self.record["states"], values):
            self.success_snapshot, self.success_time = values, d.time
        return values

    def pull(self, name, upper):
        m, d = self.model, self.data
        j = self.joints[name]
        for req in j.get("requires", []):
            target = req["at"] == "upper"
            if abs(self.snapshot()["joints"][req["joint"]] - int(target)) > 0.015:
                self.pull(req["joint"], target)
        site, a = self.grips[j["childPart"]]
        point = d.site(site).xpos.copy()
        if a["grip"] == "raised":
            geom = d.geom(a["part"])
            local = geom.xmat.reshape(3,3).T @ (point - geom.xpos)
            require(np.all(np.abs(local) <= m.geom_size[geom.id] + 1e-9), "grasp point outside handle")
        # Move the empty hand before closing it. Site weld aligns the two
        # site frames at the actual grip, not the link origin.
        start = d.mocap_pos[0].copy()
        for t in np.linspace(0, 1, 25):
            d.mocap_pos[0] = (1-t)*start + t*point
            self.step()
        require(np.linalg.norm(d.site(site).xpos - d.mocap_pos[0]) <= 0.005, "missed grasp")
        mj.mju_mat2Quat(d.mocap_quat[0], d.site(site).xmat)
        eq = m.equality(site).id
        d.eq_active[eq] = 1
        # Use forward kinematics on a separate scratch state. Only the hand
        # target is prescribed; the simulated joint moves through the weld.
        fk = mj.MjData(m)
        fk.qpos[:] = d.qpos
        lo, hi = j["limits"]
        origin = d.joint(name).qpos[0]
        target = hi if upper else lo
        steps = max(100, int(abs(target-origin)/(j.get("velocity", 1)*m.opt.timestep)*1.5))
        for k in range(steps + 51):
            t = min(k/steps, 1)
            fk.joint(name).qpos[0] = origin + (target-origin)*t*t*(3-2*t)
            mj.mj_kinematics(m, fk)
            d.mocap_pos[0] = fk.site(site).xpos
            mj.mju_mat2Quat(d.mocap_quat[0], fk.site(site).xmat)
            self.step()
        require(abs(d.joint(name).qpos[0]-target) <= 0.015*(hi-lo), "pull missed target " + name)
        d.eq_active[eq] = 0

    def press(self, control):
        m, d = self.model, self.data
        region = control["region"]
        center, frame, _ = affordance_frame(m, d, self.xml, region, "control_"+control["name"])
        normal = frame @ region["normal"]
        probe = d.body("oracle_probe")
        d.joint("probe_free").qpos[:3] = center + normal*0.0041
        mj.mj_forward(m,d)
        force = control["state"].get("minForceN", 1)
        for step in range(round(0.6/m.opt.timestep)):
            d.xfrc_applied[probe.id,:3] = -normal*1.25*force*min(1, (step+1)*m.opt.timestep/0.08)
            values = self.step(probing=True)
            if values["controls"][control["name"]]:
                break
        else:
            raise ValueError("probe did not activate " + control["name"])
        d.xfrc_applied[probe.id,:3] = normal*force
        for _ in range(30):
            self.step(probing=True)
        d.xfrc_applied[probe.id] = 0
        require(not self.snapshot()["controls"][control["name"]], "probe failed to release")

    def achieve(self, node):
        states = self.record["states"]
        if evaluate(node, states, self.snapshot()):
            return
        if "state" in node:
            self.achieve(states[node["state"]])
        elif "all" in node:
            for child in node["all"]:
                self.achieve(child)
        elif "any" in node:
            self.achieve(node["any"][0])
        elif "joint" in node:
            self.pull(node["joint"], node["op"] in (">", ">="))
        else:
            c = next(c for c in self.record["controls"] if c["name"] == node["control"])
            self.press(c)


def solve(path, record, task):
    hand = Hand(path,record,task)
    hand.achieve(task["goal"])
    require(hand.success_snapshot is not None, task["id"] + ": goal not observed")
    return dict(task=task["id"], passed=True, time_s=hand.success_time, snapshot=hand.success_snapshot,
                max_penetration_m=hand.peak_penetration, steps=hand.trace)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    manifest = parser.parse_args().manifest
    counts, failures = Counter(), []
    for line in manifest.read_text().splitlines():
        record = json.loads(line)
        for task in record["tasks"]:
            try:
                solve(manifest.parent / record["urdf_path"], record, task)
                counts[task["id"]] += 1
            except Exception as error:
                failures.append((task["id"], record["seed"], str(error)))
    for name in sorted(counts.keys() | {f[0] for f in failures}):
        print(f"{name}: {counts[name]} passed, {sum(f[0]==name for f in failures)} failed")
    for failure in failures:
        print("FAIL", *failure)
    return bool(failures)


if __name__ == "__main__":
    raise SystemExit(main())

