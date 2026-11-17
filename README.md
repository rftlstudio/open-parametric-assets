# Open Parametric Assets

Build a three.js object from parameters and inspect how to interact with it through its named parts, joints and affordances. Choose a [hinged cabinet](assets/furniture/cabinet/README.md) with adjustable shelves or a [drawer cabinet](assets/furniture/drawer_cabinet/README.md) with sliding trays.

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

Each record's `renders` object links to six 512 × 512 PNGs under `renders/<id>/`. Coordinates are right-handed, with +Y up and +Z at the front. The orthographic views look from the front (+Z), right (+X), top (+Y, with −Z up the image) and front-right (45° yaw, 25° elevation). The open view keeps the front-right orientation and moves each hinge and drawer slide to its upper limit. The closed orthographic views fit the rest bounding box. The open view fits the articulated geometry. The closed perspective_three_quarter view uses the same front-right direction, a 35° vertical field of view and an 80% frame fit.

Playwright serves a local three.js page and blocks network requests. Headless Chromium uses software WebGL, a fixed light-grey background, neutral key, fill and rear rim lights, subtle crease lines, antialiasing and no shadows. Pixels can differ slightly across GPUs, drivers and browser builds. The regression test compares decoded RGB values using a normalized mean absolute difference below 1%.

[View the open cabinet sample](examples/dataset-sample/renders/15ec0a977b8fb6936e4ddcc58400f24f453a7049bcf7a5ba12bbeb33b2937731/open_three_quarter.png). [View the extended drawer sample](examples/dataset-sample/renders/331a28cb0e6809544238d6ab2714ab0c6e0b80b164297ffbe7722a0d208eadd3/open_three_quarter.png). In GitHub Actions, download the `rendered-dataset` artifact for three records per asset, their GLBs and six views per record.

## Licensing

Source code, schemas, documentation and tests are licensed under [Apache-2.0](LICENSE). Project-generated renders and datasets are licensed under [CC BY 4.0](LICENSE-DATA). The asset's `userData.license` identifies this output license. When sharing covered outputs, credit the Open Parametric Assets contributors, link to the source and license, and indicate any changes.

Example credit: “Cabinet by [Open Parametric Assets contributors](https://github.com/rftlstudio/open-parametric-assets), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified dimensions.”


## URDF export and physical checks

Run `npm run dataset -- --samples 3 --urdf` to include a Z-up URDF and mesh files for each record. Install `sim/requirements.txt` with Python 3.12, then run `python sim/check_asset.py dist/dataset/urdf/<record-id>/model.urdf`. The checker verifies import, passive stability, driven joint travel and cube placement on every declared surface. [URDF frames, inertia and simulation details](docs/URDF.md)
