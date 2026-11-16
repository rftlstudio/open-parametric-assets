# Contributing an asset

1. Create `assets/<category>/<asset-name>/index.js` and a sibling README. Define the parameter schema and implement the [v0.1 contract](docs/ASSET_SPEC.md).
2. Document the axes, origin, motion, usable surfaces and any assumptions behind physical properties. Include a reproducible example and add an English template in `lib/prompt.js` that describes each parameter for dataset generation.
3. Add a focused interaction test when the geometry has a moving part or an annotated surface.
4. With Node.js 24 or newer, run `npm ci`, `npm test` and `npm run validate`. Include the asset ID and validator result in your pull request.

Contribute original geometry or identify the source and redistribution terms of any reused material. Contributions use the code and output licenses described in the [README](README.md#licensing).
