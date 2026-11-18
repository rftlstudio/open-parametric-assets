# Asset specification v0.3

An asset is an ESM module at `assets/<category>/<asset-name>/index.js`. It exports a JSON-compatible `schema` object and a synchronous `createAsset(params = {}, { seed = 0 } = {})` factory. Each call returns a fresh three.js Group in its rest pose, with identity root transform. Lengths are meters. The coordinate system is right-handed, +Y up.

## Parameters and reproducibility

`schema.parameters` maps case-sensitive parameter names to descriptors. Every descriptor declares a type, a default value, a nonempty unit string and a description. A `number` has finite inclusive `min` and `max`. An `integer` uses safe integer bounds. An `enum` declares an `enum` array of distinct nonempty strings. The default must belong to the domain. Use `m` for lengths, `rad` for angles and `none` for unitless labels. Optional `schema.triangleLimit` is a positive integer, default 20,000 triangles per build.

A `number` may declare a finite positive `step`. Its allowed values are the decimal grid points `min + k * step <= max` for nonnegative integer `k`. The sampler draws a grid index uniformly, and the factory rejects off-grid inputs. For an inclusive upper bound between grid points, the last valid value is the preceding point. Decimal ticks must fit within JavaScript's safe integer range. An enum may supply `labels`, mapping each stored value to a human-readable name.

Each asset also exports a synchronous `describe(params, random)` function from its module. It returns a nonempty English prompt, applies parameter defaults and uses the supplied PRNG for template choices. The validator checks repeat calls using fresh PRNGs with the same seed. State geometric dimensions at the decimal precision of the grid and include exact part counts. Document any appearance attribute described in bands. Its exact numeric value stays in the record.

```js
export const schema = {
  triangleLimit: 500,
  parameters: {
    height: { type: 'number', default: 1, min: 0.5, max: 2, step: 0.01, unit: 'm', description: 'Overall height.' }
  }
};
```

An optional parameter condition `activeWhen` maps parameter names to required values. Inactive parameters accept only their default. Omitted parameters use defaults. Reject unknown names, wrong types, non-finite numbers and out-of-domain values by throwing. Do not silently coerce or clamp. A seed is an unsigned 32-bit integer. Use a local seeded PRNG for any variation. Avoid Math.random, clocks and shared mutable generation state. Within a given asset version and locked dependency environment, equal parameters and seed must reproduce geometry, part transforms, material appearance and metadata. Runtime three.js object identities and UUIDs are excluded.

A mesh marked `userData.visualOnly = true` contributes to rendering, geometry hashes and triangle counts. URDF exports its visual with zero contribution to mass or inertia. Clearance and collision checks omit it. Affordances and control regions must reference physical parts.

## Root metadata and part frames

All fields below belong to `root.userData` and contain JSON values.

| Field | Meaning |
| --- | --- |
| id, category | Relative identifier such as `furniture/cabinet`, and its category `furniture`. |
| version, license, units | Asset version in x.y.z form, output license `CC-BY-4.0`, and `m`. |
| boundingBox | Object with `min` and `max` XYZ triples, the rest-pose axis-aligned bounds of all mesh vertices in the initial root frame. Absolute tolerance per coordinate is 0.001 m. |
| physics | Positive finite `massKg`, finite nonnegative dimensionless `friction`, and `collision` equal to `box` or `compound`. Document estimates and how to interpret collision parts. |
| affordances | Array of named-part interaction annotations, possibly empty. |
| joints | Array of joint definitions, possibly empty. |
| controls | Optional array of named buttons, knobs and touch controls. Omission is equivalent to an empty array. |

Use ordinary triangle meshes with BufferGeometry, valid indices and finite XYZ positions. Assign each mesh a unique, descriptive name. Named groups must also be unambiguous. Put a moving part's origin at its pivot. Its child meshes and interaction annotations then follow the part during motion.

A joint has a unique `name`, a `type` of `revolute` or `prismatic`, a unit XYZ `axis` in the child's rest frame, ordered inclusive `limits` and a `childPart` naming the affected node. Starting at the rest pose, rotate around the axis using the right-hand rule (radians) or translate along it (meters).

A grasp is `{ type: 'grasp', grip: 'raised' | 'recessed', part, point: [x,y,z] }`. The required `grip` describes the individual affordance independently of asset parameters. A raised grip lies inside its own collision box and needs more than 10 mm clearance to every other collision geometry. A recessed grip must clear every collision geometry by more than 2 mm. A rectangular placeable surface also has `normal` (unit XYZ) and `size` (two positive edge lengths in meters). Its `point` is the rectangle center. All coordinates are local to the named part. Document the two surface directions in the asset README.

A joint may declare `clearance: { moving, stationary, minRetainedRatio }`. The moving part must belong to `childPart`; stationary names must refer to separate parts outside that subtree. Both revolute and prismatic joints are checked at five equally spaced positions, including both limits. Each mesh contributes an oriented box around its local geometry. Separating-axis tests permit up to 0.001 m penetration. This is a conservative box approximation, including for curved or hollow meshes. Validation restores the rest pose even on failure.

Optional `minRetainedRatio` lies in [0,1]. At each sampled position, it measures the moving part's projected depth overlapping the common stationary span along the joint's rest-world axis and requires its transverse bounds to stay within the stationary envelope. Drawer trays declare 0.2 and travel by 0.75 of their depth, leaving a 5% retention margin. Drawer metadata v0.3.0 replaces `drawerBox` and `caseSides` with `clearance`.

Optional `dynamics: { damping, friction }` contains finite nonnegative joint damping and Coulomb friction. URDF export defaults to 1 and 0.05, respectively. Units are N·s/m and N for slides, N·m·s/rad and N·m for hinges. Optional positive `effort` and `velocity` default to 150 N or N·m and 0.5 m/s or 2 rad/s.

URDF export reads `material.userData.densityKgM3` for every mesh. Furniture uses 650 kg/m³ wood and 2700 kg/m³ metal, matching `physics.massKg`. Box integrals and closed-mesh volume integrals determine per-link center of mass and inertia. See [URDF and simulation](URDF.md) for the axis conversion and checks.

## Controls

Every control contains a unique nonempty `name`, `type` (`button`, `knob` or `touch`), `function`, `label` (nonempty printed text or null), `icon` (enum ID or null), `region` and `state`. Labels and icons declare intended markings. Microwave markings use flat vector meshes mounted 0.3 mm above each control.

The function vocabulary defines appliance-level effects.

| Function | Meaning |
| --- | --- |
| start | Begin or resume operation subject to the appliance's interlocks. |
| stop | Cancel the active operation. The appliance README defines reset behavior. |
| add_30s | Add thirty seconds to the remaining timer. |
| door_release | Request release of the door latch. |
| power_level | Select the operating power level. |
| timer | Select the operation duration in the declared unit. |

The function `digit` enters a keypad digit and requires an integer `value` from 0 to 9. The icon vocabulary includes `open`, `digit_0` through `digit_9`, and `play`, `stop`, `plus_30`, `power` and `clock`. Labels and icons may independently be null. Appliance READMEs describe effects and interlocks; the metadata does not execute an appliance state machine.

A region is `{ part, point, normal, size }`, using a named mesh's local coordinates. The unit normal points outward and `size` contains the rectangle's two edge lengths in meters. Its first tangent is local +X projected onto the face, or local +Y when the normal is nearly parallel to X. The second tangent is normal × first tangent. This gives local X/Y rectangles on front faces and X/Z rectangles on horizontal surfaces. The validator clips outward-facing triangles against the rectangle and requires full area coverage within a 1 mm plane tolerance.

A button names a prismatic `joint` whose `childPart` contains `region.part`. Its lower limit is zero, upper limit is 0.002–0.004 m and its axis points into the panel. The state is `{ kind: 'momentary', pressedAt }`. `pressedAt` is a finite fraction in [0,1], and a press means q ≥ pressedAt × upper limit. Momentary buttons require a spring on their joint. Any joint can declare dynamics.spring = { stiffness, restPosition }. Stiffness is positive in N/m for slides or N·m/rad for hinges; its rest position is finite, in meters and within the joint limits.

A knob names a revolute `joint` whose `childPart` contains `region.part`. Its state is `{ kind: 'detent', positions, values, unit }`. There are at least two finite, strictly increasing positions in radians within the joint limits. Values have the same length and contain finite numbers or nonempty strings. The nonempty unit string describes those values. Choose the nearest position to obtain the state value, breaking midpoint ties toward the lower index.

A touch control has no `joint` field. Its state is `{ kind: 'touch', minForceN }` with a positive finite force threshold in newtons. Its panel is fixed. At rest, all control rectangles must be separated by at least 0.002 m, measured between their closest points in world space.

## Validation

Run `npm run validate`. The validator discovers asset modules from their category directories, checks schemas and probes invalid inputs. It builds defaults and 20 pseudo-random parameter sets twice each. For each pair it checks metadata and named references, compares declared bounds with transformed vertices, enforces the triangle budget and compares SHA-256 digests over the hierarchy, transforms, indices, vertex attributes, geometry groups, basic material properties and userData. It reports the asset ID and exits with status 1 if an asset fails. Sampling covers reproducible cases within the declared domain. Asset-specific tests check intended physical behavior such as the direction of door motion.
