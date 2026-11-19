# Open Parametric Assets

[Press START on two prebuilt microwaves with Python and MuJoCo](examples/quickstart/README.md). Each example includes the model, labeled views and its measured task report.

[Export a self-contained MuJoCo model](docs/MJCF.md) with `npm run dataset -- --samples 3 --mjcf`.


Build a three.js object from parameters and inspect how to interact with its named parts, joints, affordances and controls.

| Asset | Version | Interactions |
| --- | --- | --- |
| [Hinged cabinet](assets/furniture/cabinet/README.md) | 0.2.2 | Swinging doors, handles and shelves |
| [Drawer cabinet](assets/furniture/drawer_cabinet/README.md) | 0.2.2 | Sliding trays, raised or recessed pulls |
| [Built-in oven](assets/appliances/oven/README.md) | 0.1.0 | Spring-balanced bottom hinge, sliding wire racks, marked dials or touch strip |
| [Microwave](assets/appliances/microwave/README.md) | 0.2.1 | Marked physical, touch and mixed panels with sensor checks |

## Try the cabinet

Clone this repository, install Node.js 24 or newer, and run `npm ci`. From the repository root, run this example with `node --input-type=module`:

```js
import { Vector3 } from 'three';
import { createAsset } from 'open-parametric-assets/assets/furniture/cabinet';

const cabinet = createAsset({ width: 1, shelfCount: 3 }, { seed: 42 });
const hinge = cabinet.userData.joints[0];
const door = cabinet.getObjectByName(hinge.childPart);
door.rotateOnAxis(new Vector3(...hinge.axis), Math.PI / 4);
const grasp = cabinet.userData.affordances.find(a => a.type === 'grasp');
const handle = cabinet.getObjectByName(grasp.part);
console.log(handle.localToWorld(new Vector3(...grasp.point)).toArray());
```

Add the returned group to a three.js scene or query it directly in Node. Run `npm test` for the regression suite and `npm run validate` to check every asset with defaults and 20 seeded samples. See the [asset specification](docs/ASSET_SPEC.md) and [contribution guide](CONTRIBUTING.md).

## Build a dataset

Run `npm run dataset -- --samples 200 --out dist/dataset` on Node 24. Each asset contributes 200 validated records to `data.jsonl`, with binary glTF models in `glb/` and a dataset card in `README.md`. Each record includes its exact constructor call, seed, template-generated English prompt and train/test label. Use a fresh output folder for a self-contained snapshot. Rebuilding in place updates the manifest and retains older GLBs.

Inspect the [sample records and their models](examples/dataset-sample/) or export a single asset from the repository:

```js
import { writeFile } from 'node:fs/promises';
import { createAsset } from 'open-parametric-assets/assets/furniture/cabinet';
import { exportGLB } from './scripts/export-glb.js';

const root = createAsset({ shelfCount: 3 }, { seed: 42 });
await writeFile('cabinet.glb', await exportGLB(root));
```

The asset node stores the full root metadata in glTF `extras`. For texture-free binary export, the Node adapter supplies the exporter's missing `FileReader.readAsArrayBuffer` callback using native `Blob.arrayBuffer()`.

## Render a dataset

After installing Node 24 and running `npm ci`, download the matching browser once with `npx playwright install --with-deps --only-shell chromium`. The render tests use the same browser. Then run:

```sh
npm run dataset -- --samples 3 --renders
```

Assets with controls also get a variable-aspect `control_panel` close-up with a minimum of 24 pixels across each control region. Each record includes six standard 512 × 512 PNGs under `renders/<id>/`. Coordinates are right-handed, with +Y up and +Z at the front. The orthographic views look from the front (+Z), right (+X), top (+Y, with −Z up the image) and front-right (45° yaw, 25° elevation). The open view keeps the front-right orientation and moves each hinge and drawer slide to its upper limit. The closed orthographic views fit the rest bounding box. The open view fits the articulated geometry. The closed perspective_three_quarter view uses the same front-right direction, a 35° vertical field of view and an 80% frame fit.

Playwright serves a local three.js page and blocks network requests. Headless Chromium uses software WebGL, a fixed light-grey background, neutral key, fill and rear rim lights, subtle crease lines, antialiasing and no shadows. Pixels can differ slightly across GPUs, drivers and browser builds. The regression test compares decoded RGB values using a normalized mean absolute difference below 1%.

[View the open cabinet sample](examples/dataset-sample/renders/aa526f9c6f4a8a14680ee7c64396217be3a2891b5b1a54c397673a1a889dd2ea/open_three_quarter.png). [View the extended drawer sample](examples/dataset-sample/renders/8527ffb29683fdc26f0ac3fcc020902495b2e6101a41a1997f5acab8b72e5257/open_three_quarter.png). In GitHub Actions, download the `rendered-dataset` artifact for three sampled records per asset plus fixed numeric and enum boundary cases and two single-drawer regressions, their GLBs and their rendered views.

## Licensing

Source code, schemas, documentation and tests are licensed under [Apache-2.0](LICENSE). Project-generated renders and datasets are licensed under [CC BY 4.0](LICENSE-DATA). The asset's `userData.license` identifies this output license. When sharing covered outputs, credit the Open Parametric Assets contributors, link to the source and license, and indicate any changes.

Example credit: “Cabinet by [Open Parametric Assets contributors](https://github.com/rftlstudio/open-parametric-assets), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified dimensions.”


## URDF export and physical checks

Run `npm run dataset -- --samples 3 --urdf` to include a Z-up URDF and mesh files for each record. Install `sim/requirements.txt` with Python 3.12, then run `python sim/check_asset.py dist/dataset/urdf/<record-id>/model.urdf`. The checker verifies import, passive stability, driven joint travel and cube placement on every declared surface. [URDF frames, inertia and simulation details](docs/URDF.md)
