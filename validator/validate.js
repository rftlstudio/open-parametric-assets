import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverAssets } from '../lib/assets.js';
import { validateTasks } from "../lib/tasks.js";
import { resolveParams, seededRandom } from '../lib/parameters.js';
import { describe } from '../lib/prompt.js';
import { inspect } from './geometry.js';
import { checkRejection, checkSchema, sampleParams } from './schema.js';

function validateCase(asset, id, params, seed) {
  const build = () => asset.createAsset({ ...params }, { seed });
  const root = build();
  const limit = asset.schema.triangleLimit ?? 20000;
  const first = inspect(root, id, limit);
  assert.equal(first.hash, inspect(build(), id, limit).hash, 'non-deterministic geometry or metadata');
  const prompt = describe(id, params, seed, asset);
  assert.equal(prompt, describe(id, params, seed, asset), 'non-deterministic describe output');
  const tasks = validateTasks(root.userData, asset.schema, resolveParams(asset.schema, params));
  return { root, triangles: first.triangles, prompt, tasks };
}

export function validateAsset(asset, id, sample) {
  checkSchema(asset.schema);
  assert.equal(typeof asset.createAsset, 'function', 'missing createAsset');
  checkRejection(asset);
  if (sample) return validateCase(asset, id, sample.params, sample.seed);
  const random = seededRandom(0xcab1);
  let maxTriangles = 0;
  for (let i = 0; i <= 20; i++) {
    const params = i === 0 ? {} : sampleParams(asset.schema, random);
    const seed = Math.floor(random() * 0x100000000);
    try {
      const { triangles } = validateCase(asset, id, params, seed);
      maxTriangles = Math.max(triangles, maxTriangles);
    } catch (error) {
      throw new Error('case ' + i + ', seed ' + seed + ', params ' + JSON.stringify(params) + ': ' + error.message);
    }
  }
  return { cases: 21, maxTriangles };
}

async function main() {
  for (const { id, url } of await discoverAssets()) {
    try {
      const { cases, maxTriangles } = validateAsset(await import(url), id);
      console.log('PASS ' + id + ' | ' + cases + ' reproducible cases | peak ' + maxTriangles + ' triangles');
    } catch (error) {
      console.error('FAIL ' + id + ' | ' + error.message);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
