# Native MuJoCo models

Run `npm run dataset -- --samples 3 --mjcf`. Each record's `mjcf_path`
points to `mjcf/<id>/model.xml`. Copy the model directory, including
`meshes/`, to load the asset on its own:

```python
import mujoco
model = mujoco.MjModel.from_xml_path("model.xml")
data = mujoco.MjData(model)
mujoco.mj_step(model, data)
```

The fixed base and articulated bodies use the URDF link names and Z-up frames.
A point (x, y, z) in three.js maps to (x, −z, y). Lengths are meters and angles
are radians. Both exporters share the same material-density integration, centers
of mass, inertia tensors, box dimensions, triangle meshes and aperture decomposition.

Collision geoms (group 3) have the part names. Recessed drawer faces have four
boxes around the opening and a separate cup back. MuJoCo uses the convex hull
of each mesh for contact. The visual geoms (group 2, names prefixed with
`visual_`) carry the model colors and use zero mass and zero contact masks.
Flat markings use shell mesh inertia for compilation and appear only as visuals.
[MuJoCo mesh reference](https://mujoco.readthedocs.io/en/3.3.7/XMLreference.html#asset-mesh)

Every joint declares its range, damping, dry friction, stiffness, spring
reference and zero armature. The balanced oven hinge uses a limit reference of
`0.02 1` and impedance of `0.9 0.95 0.001 0.5 2` with a 2 ms implicitfast step.

| Site | Meaning |
| --- | --- |
| `grasp_<part>` | Grip center attached to its moving or fixed body. |
| `place_<part>` | Surface rectangle. Local +Z is the outward normal. |
| `control_<name>` | Control rectangle with the same tangent axes as the GLB region. |

Rectangular sites use half the recorded width and height and 1 mm half-thickness.
Sites are in group 4. Sensors use the control name. Touch sensors report normal
force in newtons; joint-position sensors report radians or meters. The custom
text field `opa_metadata` contains JSON with the record identity, seed, joints,
controls, affordances, states and applicable tasks.

## Run the checks

Pass the XML path to `python sim/check_asset.py`. The checker and oracle use
the asset's declared springs, sites and sensors. They introduce test equipment
such as the cube, probe and floating hand during the checks.

Build with both `--urdf --mjcf` to compare formats. Run the checker on both
model files for each record, then `python sim/check_parity.py dist/dataset/data.jsonl`.
The comparison checks compiled masses and inertias (relative tolerance 1e-6),
joint properties, rest-pose collision AABBs (1 µm), site poses and sizes.
Passive drift and each driven joint's achieved fraction must match to 1% relative
tolerance, with an absolute numerical floor of 1e-10. URDF and MJCF reports have
distinct paths. The MJCF report is named by `provenance.mjcf_sim_report`. A
copied standalone model writes `model.report.json` next to its XML.
