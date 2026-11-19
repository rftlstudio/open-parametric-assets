"""Compare compiled URDF and MJCF models and their measured simulation reports."""
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

import mujoco as mj
import numpy as np

from check_asset import (affordance_frame, collision_geoms, compile_asset, initial, load,
                         region_axes, require)


def bounds(model, data, geom):
    """Tight world-space AABB of the rest-pose collision shape, in meters."""
    position = data.geom_xpos[geom]
    rotation = data.geom_xmat[geom].reshape(3,3)
    if model.geom_type[geom] == mj.mjtGeom.mjGEOM_BOX:
        half = np.abs(rotation) @ model.geom_size[geom]
        return np.array([position-half, position+half])
    mesh = model.geom_dataid[geom]
    start = model.mesh_vertadr[mesh]
    vertices = model.mesh_vert[start:start+model.mesh_vertnum[mesh]] @ rotation.T + position
    return np.array([vertices.min(axis=0), vertices.max(axis=0)])


def tensor(model, body):
    rotation = np.zeros(9)
    mj.mju_quat2Mat(rotation, model.body_iquat[body])
    matrix = rotation.reshape(3,3)
    return matrix @ np.diag(model.body_inertia[body]) @ matrix.T


def compare_models(folder, record):
    path = folder / record["urdf_path"]
    xml = ET.parse(path).getroot()
    urdf = compile_asset(load(path),path,record)
    native = mj.MjModel.from_xml_path(str(folder / record["mjcf_path"]))
    rest = initial(urdf,record["joints"])
    posed = initial(native,record["joints"])
    require(urdf.nbody == native.nbody and urdf.njnt == native.njnt, "body/joint counts differ")
    for i in range(1,urdf.nbody):
        name = urdf.body(i).name
        j = native.body(name).id
        a,b = tensor(urdf,i),tensor(native,j)
        require(np.linalg.norm(a-b) <= 1e-6*np.linalg.norm(a), name+": inertia tensor differs")
        np.testing.assert_allclose(native.body_inertia[j], urdf.body_inertia[i],rtol=1e-6,atol=0)
        np.testing.assert_allclose(native.body_mass[j], urdf.body_mass[i],rtol=1e-6,atol=0)
        np.testing.assert_allclose(native.body_ipos[j], urdf.body_ipos[i],rtol=0,atol=1e-9)
        require(native.body(native.body_parentid[j]).name == urdf.body(urdf.body_parentid[i]).name,
                name+": parent differs")
    for j in record["joints"]:
        a,b = urdf.joint(j["name"]), native.joint(j["name"])
        for field in ("range","stiffness","axis","solref","solimp"):
            np.testing.assert_allclose(getattr(b,field),getattr(a,field),rtol=1e-8,atol=1e-9)
        np.testing.assert_allclose(native.qpos_spring[b.qposadr],urdf.qpos_spring[a.qposadr],atol=1e-9)
        for field in ("dof_damping","dof_frictionloss","dof_armature"):
            np.testing.assert_allclose(getattr(native,field)[b.dofadr],getattr(urdf,field)[a.dofadr],atol=1e-9)
    expected = {urdf.geom(i).name for i in collision_geoms(urdf)}
    actual = {native.geom(i).name for i in collision_geoms(native)}
    require(expected == actual, "collision parts differ")
    for name in expected:
        np.testing.assert_allclose(bounds(native,posed,native.geom(name).id),
                                   bounds(urdf,rest,urdf.geom(name).id),rtol=0,atol=1e-6,err_msg=name)
    regions = [("control_"+c["name"],c["region"]) for c in record["controls"]]
    for a in record["affordances"]:
        regions.append((("grasp_" if a["type"] == "grasp" else "place_")+a["part"],a))
    for name,region in regions:
        point,frame,body = affordance_frame(urdf,rest,xml,region)
        site = posed.site(name)
        require(native.body(native.site_bodyid[site.id]).name == urdf.body(body).name, name+": wrong body")
        np.testing.assert_allclose(site.xpos,point,atol=1e-6,rtol=0)
        if "normal" in region:
            np.testing.assert_allclose(site.xmat.reshape(3,3),frame @ region_axes(region["normal"]),atol=1e-7)
            np.testing.assert_allclose(native.site_size[site.id,:2],np.array(region["size"])/2,atol=1e-9)


def measured_motion(path, record):
    report = json.loads(path.read_text(encoding="utf-8"))
    require(report["id"] == record["id"] and report["passed"], "missing passing report for "+record["id"])
    checks = {c["name"]:c["measurements"] for c in report["checks"]}
    driven = {m["joint"]:m["achieved_fraction"] for m in checks["driven"]}
    return [checks["passive"][0]["max_drift_fraction"], *(driven[j["name"]] for j in record["joints"])]


def main(manifest):
    folder = manifest.parent
    for line in manifest.read_text(encoding="utf-8").splitlines():
        record = json.loads(line)
        try:
            compare_models(folder,record)
            provenance = record["provenance"]
            expected = measured_motion(folder/provenance["sim_report"],record)
            actual = measured_motion(folder/provenance["mjcf_sim_report"],record)
            np.testing.assert_allclose(actual,expected,rtol=0.01,atol=1e-10)
        except Exception as error:
            raise ValueError(f"{record['asset_id']} seed {record['seed']}: {error}") from error
        print(f"PASS parity {record['asset_id']} seed {record['seed']}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
