import { createHash } from 'node:crypto';
import { findPackageJSON } from 'node:module';
import { mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import project from '../package.json' with { type: 'json' };
import { discoverAssets } from '../lib/assets.js';
import { seededRandom } from '../lib/parameters.js';
import { sampleParams } from '../validator/schema.js';
import { validateAsset } from '../validator/validate.js';
import { datasetCard } from './dataset-card.js';
import { exportGLB } from './export-glb.js';

function digest(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest();
}

export function splitFor(assetId, seed) {
  const bucket = digest([assetId, seed]).readUInt32BE(0) / 0x100000000;
  return bucket < 0.1 ? 'test' : 'train';
}

function recordId(assetId, version, seed, params) {
  const entries = Object.keys(params).sort().map(key => [key, params[key]]);
  return digest([assetId, version, seed, entries]).toString('hex');
}

async function generate(stage, samples, assets) {
  const threePackage = JSON.parse(await readFile(findPackageJSON('three', import.meta.url), 'utf8'));
  const provenance = {
    generator_version: project.version, validator_version: project.version,
    three_version: threePackage.version, created_with: project.name
  };
  let count = 0;
  let testCount = 0;
  const manifest = await open(join(stage, 'data.jsonl'), 'wx');
  try {
    for (const { id: assetId, url } of assets) {
      const asset = await import(url);
      const next = seededRandom(digest([assetId]).readUInt32BE(0));
      for (let i = 0; i < samples; i++) {
        const seed = Math.floor(next() * 0x100000000);
        try {
          // Separate parameter draws from the LCG that enumerates unique record seeds.
          const paramSeed = digest(['parameters', assetId, seed]).readUInt32BE(0);
          const params = sampleParams(asset.schema, seededRandom(paramSeed));
          const { root, triangles, prompt } = validateAsset(asset, assetId, { params, seed });
          const meta = root.userData;
          const id = recordId(assetId, meta.version, seed, params);
          const record = {
            id, asset_id: assetId, asset_version: meta.version, seed, params,
            prompt,
            code: 'createAsset(' + JSON.stringify(params) + ', { seed: ' + seed + ' })',
            glb_path: 'glb/' + id + '.glb', triangles, bounding_box: meta.boundingBox,
            joints: meta.joints, affordances: meta.affordances, split: splitFor(assetId, seed),
            provenance, license: meta.license
          };
          await writeFile(join(stage, record.glb_path), await exportGLB(root), { flag: 'wx' });
          await manifest.writeFile(JSON.stringify(record) + '\n');
          count++;
          if (record.split === 'test') testCount++;
        } catch (cause) {
          throw new Error(assetId + ', seed ' + seed + ': ' + cause.message, { cause });
        }
      }
    }
  } finally {
    await manifest.close();
  }
  await writeFile(join(stage, 'README.md'), datasetCard(count, testCount, samples, project.version));
  return count;
}

export async function buildDataset({ samples = 200, out = 'dist/dataset' } = {}) {
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 0x100000000) {
    throw new RangeError('samples must be a positive integer within the uint32 seed space');
  }
  const assets = await discoverAssets();
  await mkdir(out, { recursive: true });
  const stage = await mkdtemp(join(out, '.build-'));
  try {
    await mkdir(join(stage, 'glb'));
    const count = await generate(stage, samples, assets);
    // Publish the manifest last, after every referenced model is in place.
    const models = join(out, 'glb');
    await mkdir(models, { recursive: true });
    for (const file of await readdir(join(stage, 'glb'))) {
      await rename(join(stage, 'glb', file), join(models, file));
    }
    await rename(join(stage, 'README.md'), join(out, 'README.md'));
    await rename(join(stage, 'data.jsonl'), join(out, 'data.jsonl'));
    return count;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { values } = parseArgs({ options: {
      samples: { type: 'string', default: '200' }, out: { type: 'string', default: 'dist/dataset' }
    } });
    const count = await buildDataset({ samples: Number(values.samples), out: values.out });
    console.log('Wrote ' + count + ' validated records to ' + resolve(values.out));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
