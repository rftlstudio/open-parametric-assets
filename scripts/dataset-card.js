const sizes = [
  [1000, 'n<1K'], [10000, '1K<n<10K'], [100000, '10K<n<100K'],
  [1e6, '100K<n<1M'], [1e7, '1M<n<10M'], [1e8, '10M<n<100M'],
  [1e9, '100M<n<1B'], [1e10, '1B<n<10B'], [Infinity, 'n>10B']
];

export function datasetCard(count, testCount, samples, version, renders = false) {
  const category = sizes.find(([limit]) => count < limit)[1];
  return `---
license: cc-by-4.0
language: [en]
task_categories: [text-generation]
tags: [3d, gltf, procedural-generation, text-to-code, synthetic]
size_categories: ['${category}']
size: ${count}
configs:
  - config_name: default
    data_files: data.jsonl
---

# Open Parametric Assets

## Description

${count} English prompts paired with executable three.js constructor calls and binary glTF models. The split column assigns ${count - testCount} records to training and ${testCount} to testing. Paths are relative to this card.

## Fields

| Field | Meaning |
| --- | --- |
| id, asset_id, asset_version | Stable record digest, asset module path and asset version. |
| seed, params | Unsigned 32-bit seed and complete, typed generator inputs. |
| prompt, code | English request and its constructor call. Import createAsset from the module named by asset_id to replay the call. |
| glb_path, triangles | Relative path to the binary glTF and validated mesh triangle count. |${renders ? '\n| renders | Paths to 512 × 512 front, three-quarter, side, top, open three-quarter and 35° perspective three-quarter PNGs. GPU and driver changes may cause small pixel differences. |' : ''}
| bounding_box | Rest-pose XYZ minimum and maximum in meters, +Y up. |
| joints, affordances | Named moving parts with axes and limits, and part-local interaction points. Revolute limits are radians. |
| split | Deterministic train or test label. Filter this column when loading data.jsonl. |
| provenance | Generator and validator release versions, installed three.js version and creating project. |
| license | CC-BY-4.0 for generated outputs. |

## How it was generated

From the source repository, run \`npm ci\`${renders ? ', then install the browser with \`npx playwright install --with-deps --only-shell chromium\`' : ''} and \`npm run dataset -- --samples ${samples}${renders ? ' --renders' : ''}\` with Node 24. For each asset, the builder permutes a 32-bit counter into unique record seeds, samples its schema with hash-seeded Mulberry32 and describes the result using English templates. Each sample passes geometry, bounds, metadata and repeat-build hash checks before its validated group is exported. Root metadata is stored in the asset node's glTF extras.

Record IDs are SHA-256 digests of the asset ID, version, seed and sorted parameter entries. The split uses the first 32 bits of SHA-256 over the JSON pair [asset_id, seed], assigning the lowest tenth to test. Adding samples preserves earlier IDs and assignments.

## Limitations

The current collection varies one cabinet design. Test records share the generator and prompt templates used for training. Prompts give exact case dimensions on a 0.01 m grid and exact part counts. Surface wear appears as a descriptive band in the prompt and an exact value in steps of 0.05 in params. Geometry checks cover the rest pose. Physical properties are estimates.

## Citation

Open Parametric Assets contributors. *Open Parametric Assets*, dataset builder v${version}. https://github.com/rftlstudio/open-parametric-assets. Generated data is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Cite the record ID and asset version when referring to an individual model.
`;
}
