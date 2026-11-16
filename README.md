# Open Parametric Assets

Build a three.js object from parameters and inspect how to interact with it through its named parts, joints and affordances. The first asset is a [cabinet](assets/furniture/cabinet/README.md) with hinged doors and adjustable shelf count.

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

Inspect the [three sample records and their models](examples/dataset-sample/) or export a single asset from the repository:

```js
import { writeFile } from 'node:fs/promises';
import { createAsset } from 'open-parametric-assets/assets/furniture/cabinet';
import { exportGLB } from './scripts/export-glb.js';

const root = createAsset({ shelfCount: 3 }, { seed: 42 });
await writeFile('cabinet.glb', await exportGLB(root));
```

The asset node stores the full root metadata in glTF `extras`. For texture-free binary export, the Node adapter supplies the exporter's missing `FileReader.readAsArrayBuffer` callback using native `Blob.arrayBuffer()`.

## Licensing

Source code, schemas, documentation and tests are licensed under [Apache-2.0](LICENSE). Project-generated renders and datasets are licensed under [CC BY 4.0](LICENSE-DATA). The asset's `userData.license` identifies this output license. When sharing covered outputs, credit the Open Parametric Assets contributors, link to the source and license, and indicate any changes.

Example credit: “Cabinet by [Open Parametric Assets contributors](https://github.com/rftlstudio/open-parametric-assets), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified dimensions.”
