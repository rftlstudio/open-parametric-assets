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

URDF coordinates use meters and radians. Numeric attributes are rounded to 1e-9 with negative zero normalized to zero. The right-handed basis conversion is a +90° X rotation, mapping three.js (x, y, z) to (x, −z, y). +Z becomes up and the asset front faces −Y. Every link frame receives this basis change. Mesh origins, joint origins and axes are transformed consistently. The base link starts at the origin in its rest frame. Three.js placement of the entire root in a scene is omitted.

The root and each joint's `childPart` produce one named rigid link. Intermediate groups are flattened into their enclosing link. Nested moving parts become child links of the nearest articulated ancestor. Link frames require unit scale; positive mesh scales are baked into geometry. Sheared transforms are rejected. BoxGeometry supplies box visual and collision primitives. An unbeveled ExtrudeGeometry face with one axis-aligned rectangular aperture keeps its OBJ visual and uses four collision boxes above, below and beside the aperture. The existing cup back remains a separate box. Other closed triangle meshes produce OBJ visual and collision references. URDF effort and velocity limits and joint damping and friction come from metadata, with the defaults documented in the asset spec.

Material density is required in `material.userData.densityKgM3`. Box volumes and analytic box moments determine their mass contributions. Closed non-box meshes contribute signed tetrahedral volume integrals, preserving the recessed panel's missing material. Rotated contributions and the parallel-axis theorem give the complete tensor about the link center of mass. These densities are estimates.

The small URDF MuJoCo compiler extension preserves the base body, keeps collision geometry and resolves OBJ basenames from `meshes/`. MuJoCo treats a collision OBJ as a convex hull. The recessed face uses box collisions to preserve its cavity. Unsupported hole layouts are rejected with a clear error. Primitive boxes preserve the hollow tray and case interior through separate panels.

## Simulation acceptance checks

The CLI loads the URDF directly through `MjSpec.from_file`, uses gravity and a 2 ms implicit-fast timestep, prints each check and exits with status 1 on failure.

- Body and joint counts, names, types and ranges must match the record. The base is fixed.
- With zero applied actuation, maximum joint displacement over two seconds must stay within 2% of range.
- Each joint is driven independently for three seconds. A critically damped proportional-derivative position controller ramps its target at the URDF velocity limit and caps applied effort at the URDF effort limit. It must finish within 95–102% of the declared range. Other joints hold their lower limits. Contacts between the driven link and other bodies, excluding its parent, may penetrate by at most 1 mm.
- Each placeable surface receives a separate 5 cm, 50 g cube, with all asset joints held at their upper limits. The cube bottom starts 5 mm above the surface to fit the smallest supported shelf gaps. It must rest on the named collision geometry within two seconds and remain stable for the final 0.2 seconds. Position, footprint, speed and contact penetration are checked. Current surfaces are horizontal and use local X/Z rectangle axes.

- With all joints at their lower limits, recessed grasp points must be more than 2 mm outside every asset collision geometry. Bar and knob grasps use the grip center `[0, 0, 0]`, which must lie inside their own collision box (signed distance ≤ 0) and more than 10 mm from every other collision geometry for finger room. The checker reads the required `affordance.grip` and queries MuJoCo signed distances using a 1 µm sphere, adding its radius back to recover point distance.

Test cubes, grasp probes and controllers are added in memory to the imported model. The asset URDF remains the simulation source. CI runs these checks on every model in a three-samples-per-asset dataset.

Clearance validation samples five joint positions and uses conservative per-mesh boxes. Simulation adds time-stepped contacts for each independently driven joint. These finite checks do not prove collision freedom for every combination of multiple moving joints.

[MuJoCo URDF import documentation](https://mujoco.readthedocs.io/en/3.3.7/modeling.html#urdf-extensions)

## Physical controls

Dataset records carry `controls` with the same definitions as root metadata. Button and knob links and joints use the ordinary URDF representation. URDF carries joint damping and friction. The checker reads each button's spring stiffness and rest position from the record and assigns MuJoCo's in-memory joint stiffness and spring reference. A future MJCF exporter can encode those properties natively.

Actuated position checks compensate spring force while holding a target. The button check applies force along its slide until the press threshold is reached, releases the force and requires return to within 10% of travel in 0.5 seconds. The spring acts during release, while other joints hold their lower limits.

The knob check drives to each declared detent, removes actuation on that knob and requires the nearest-detent value to remain unchanged for 0.5 seconds. URDF joint frictionloss holds the knob. Each control region point must touch its own collision geometry within 1 mm and clear every other collision geometry by more than 2 mm with the joints at their lower limits.

Run `python -m unittest discover -s sim -p "test_*.py"` for the grasp, button-return and detent regression tests. Touch sensor simulation and appliance runtime state are reserved for later work.

Visual-only control markings export as OBJ visuals without collision geometry or inertial contribution. The touch check creates a box site on the panel body for each rectangular region. A 4 mm radius free sphere presses each center at 1.25 times its declared threshold. The checker requires the settled sensor reading to reach the threshold, every other sensor to read zero throughout the press, and the region to stay fixed.
