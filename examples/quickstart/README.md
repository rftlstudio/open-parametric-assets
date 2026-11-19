# Press START in MuJoCo

Download or clone this repository. From its root, run:

```sh
python -m pip install mujoco==3.3.7
python examples/quickstart/quickstart.py
```

Expected output:

```text
physical: START -> start_pressed=True
touch: START -> start_pressed=True
```

The script opens each supplied URDF and looks up START by function. The oracle
presses the region with a small sphere. For the physical button, it observes the
travel threshold. For the glass key, it observes contact force. Both readings are
taken during the press; the probe then releases. The example uses the repository's
Python modules in `sim/`. The models, images and reports are already built.

## Reading a sample

Open `physical/record.json` or `touch/record.json`. Resolve its file paths from
the folder containing that record.

| Field | Meaning |
| --- | --- |
| id, asset_id, asset_version | Sample digest, asset family and asset release. |
| seed, params | Seed and exact parameter values to reproduce this variant. |
| code, prompt | Constructor call and its English description. |
| glb_path, urdf_path | Visual model and physics model. The URDF's OBJ files sit alongside it in meshes/. |
| triangles, bounding_box | Mesh triangle count and rest-pose XYZ bounds in meters. |
| joints, affordances | Moving links, axes, limits and interaction points in named parts. |
| controls | Labels, functions, region geometry and activation thresholds. |
| states, tasks | Observable predicates, available instructions, initial positions, goals and time limits. |
| renders, renders_meta | PNG paths, image dimensions and per-control pixel boxes and visibility. |
| split, license | Reproducible train/test assignment and generated-data license. |
| provenance | Source commit, seed, tool and spec versions, passed validator checks and the path to this sample's measured simulation report. |

The GLB uses +Y up and +Z toward the front. The URDF uses +Z up and −Y toward
the front. Joint rotations use radians, slide distances use meters, and logic
predicates use fractions from lower to upper stop. Region points and normals are
local to their named mesh. Pixel coordinates start at the upper left; the right
and bottom box edges are exclusive.

The reports record simplified simulation outcomes. Report a confusing field, missing
step or unexpected result using [Quickstart feedback](https://github.com/rftlstudio/open-parametric-assets/issues/new?template=quickstart-feedback.md).

