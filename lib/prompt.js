import { createRequire } from 'node:module';
import { seededRandom } from './parameters.js';

const load = createRequire(import.meta.url);

// Reuse the module already loaded by validation, or resolve it through the
// package's assets export. Node 24 supports synchronous loading of these ESMs.
export function describe(assetId, params, seed, asset = load('open-parametric-assets/assets/' + assetId)) {
  if (typeof asset.describe !== 'function') throw new TypeError(assetId + ': missing describe(params, random)');
  const prompt = asset.describe({ ...params }, seededRandom(seed));
  if (typeof prompt !== 'string' || !prompt.trim()) throw new TypeError(assetId + ': describe must return nonempty text');
  return prompt;
}
