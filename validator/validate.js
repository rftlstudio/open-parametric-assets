import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { seededRandom } from '../lib/parameters.js';
import { inspect } from './geometry.js';
import { checkRejection, checkSchema, sampleParams } from './schema.js';

export function validateAsset(asset, id) {
  checkSchema(asset.schema);
  assert.equal(typeof asset.createAsset, 'function', 'missing createAsset');
  checkRejection(asset);
  const random = seededRandom(0xcab1);
  let maxTriangles = 0;
  for (let i = 0; i <= 20; i++) {
    const params = i === 0 ? {} : sampleParams(asset.schema, random);
    const seed = Math.floor(random() * 0x100000000);
    try {
      const build = () => inspect(asset.createAsset({ ...params }, { seed }), id, asset.schema.triangleLimit ?? 20000);
      const first = build();
      assert.equal(first.hash, build().hash, 'non-deterministic geometry or metadata');
      maxTriangles = Math.max(first.triangles, maxTriangles);
    } catch (error) {
      throw new Error('case ' + i + ', seed ' + seed + ', params ' + JSON.stringify(params) + ': ' + error.message);
    }
  }
  return { cases: 21, maxTriangles };
}

async function directories(path) {
  return (await readdir(path, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
}

async function main() {
  const base = fileURLToPath(new URL('../assets/', import.meta.url));
  let assets = 0;
  for (const category of await directories(base)) {
    for (const name of await directories(resolve(base, category))) {
      const id = category + '/' + name;
      assets++;
      try {
        const asset = await import(pathToFileURL(resolve(base, id, 'index.js')).href);
        const { cases, maxTriangles } = validateAsset(asset, id);
        console.log('PASS ' + id + ' | ' + cases + ' reproducible cases | peak ' + maxTriangles + ' triangles');
      } catch (error) {
        console.error('FAIL ' + id + ' | ' + error.message);
        process.exitCode = 1;
      }
    }
  }
  assert(assets > 0, 'no assets found');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
