# URDF export and MuJoCo checks v0.1

```sh
npm ci
npm run dataset -- --samples 3 --urdf
python -m pip install -r sim/requirements.txt
python sim/check_asset.py dist/dataset/urdf/<record-id>/model.urdf
```

Use Python 3.12 with the pinned MuJoCo 3.3.7 package. Rendering is optional and can be combined with `--urdf --renders`. Each record gains `urdf_path`. Mesh references resolve under the model's sibling `meshes/` directory. Keep the dataset's `data.jsonl` with the model so the checker can verify its record.

```js
import { exportURDF } from '../scripts/export-urdf.js';
const { urdf, meshes } = exportURDF(root);
// Write urdf as model.urdf. Write each Map entry under its relative filename.
```

## Frames and geometry

URDF coordinates use meters and radians. The right-handed basis conversion is a +90° X rotation, mapping three.js (x, y, z) to (x, −z, y). +Z becomes up and the asset front faces −Y. Every link frame receives this basis change. Mesh origins, joint origins and axes are transformed consistently. The base link starts at the origin in its rest frame. Three.js placement of the entire root in a scene is omitted.

The root and each joint's `childPart` produce one named rigid link. Intermediate groups are flattened into their enclosing link. Nested moving parts become child links of the nearest articulated ancestor. Link frames require unit scale; positive mesh scales are baked into geometry. Sheared transforms are rejected. BoxGeometry supplies box visual and collision primitives. Other closed triangle meshes produce OBJ visual and collision references. URDF effort and velocity limits and joint damping and friction come from metadata, with the defaults documented in the asset spec.

Material density is required in `material.userData.densityKgM3`. Box volumes and analytic box moments determine their mass contributions. Closed non-box meshes contribute signed tetrahedral volume integrals, preserving the recessed panel's missing material. Rotated contributions and the parallel-axis theorem give the complete tensor about the link center of mass. These densities are estimates.

The small URDF MuJoCo compiler extension preserves the base body, keeps collision geometry and resolves OBJ basenames from `meshes/`. MuJoCo treats a collision OBJ as a convex hull. A recessed pull's cavity is consequently filled for collision purposes. Its visual OBJ preserves the cavity. Primitive boxes preserve the hollow tray and case interior through separate panels.

## Simulation acceptance checks

The CLI loads the URDF directly through `MjSpec.from_file`, uses gravity and a 2 ms implicit-fast timestep, prints each check and exits with status 1 on failure.

- Body and joint counts, names, types and ranges must match the record. The base is fixed.
- With zero applied actuation, maximum joint displacement over two seconds must stay within 2% of range.
- Each joint is driven independently for three seconds. A critically damped proportional-derivative position controller ramps its target at the URDF velocity limit and caps applied effort at the URDF effort limit. It must finish within 95–102% of the declared range. Other joints hold their lower limits. Contacts between the driven link and other bodies, excluding its parent, may penetrate by at most 1 mm.
- Each placeable surface receives a separate 5 cm, 50 g cube, with all asset joints held at their upper limits. The cube bottom starts 5 mm above the surface to fit the smallest supported shelf gaps. It must rest on the named collision geometry within two seconds and remain stable for the final 0.2 seconds. Position, footprint, speed and contact penetration are checked. Current surfaces are horizontal and use local X/Z rectangle axes.

Test cubes and controllers are added in memory to the imported model. The asset URDF remains the simulation source. CI runs these checks on every model in a three-samples-per-asset dataset.

Clearance validation samples five joint positions and uses conservative per-mesh boxes. Simulation adds time-stepped contacts for each independently driven joint. These finite checks do not prove collision freedom for every combination of multiple moving joints.

[MuJoCo URDF import documentation](https://mujoco.readthedocs.io/en/3.3.7/modeling.html#urdf-extensions)
