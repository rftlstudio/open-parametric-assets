import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { croissant } from './croissant.js';
import { createHash } from 'node:crypto';
import { findPackageJSON } from 'node:module';
import { mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import project from '../package.json' with { type: 'json' };
import { discoverAssets } from '../lib/assets.js';
import { ciCorners } from './ci-corners.js';
import { mixSeed, seededRandom, resolveParams } from '../lib/parameters.js';
import { sampleParams } from '../validator/schema.js';
import { validateAsset } from '../validator/validate.js';
import { datasetCard } from './dataset-card.js';
import { exportURDF } from './export-urdf.js';
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

async function generate(stage, samples, assets, renders, urdf, corners) {
  const threePackage = JSON.parse(await readFile(findPackageJSON('three', import.meta.url), 'utf8'));
  const repo = resolve(fileURLToPath(new URL('../', import.meta.url)));
  const gitCommit = execFileSync('git',['-c','safe.directory='+repo.replaceAll('\\','/'),'rev-parse','HEAD'],
    { cwd: repo, encoding: 'utf8' }).trim();
  const requirements = await readFile(new URL('../sim/requirements.txt', import.meta.url),'utf8');
  const mujocoVersion = requirements.match(/^mujoco==([\d.]+)\s*$/m)[1];
  const provenance = {
    git_commit: gitCommit, spec_version: '0.4', mujoco_version: mujocoVersion,
    generator_version: project.version, validator_version: project.version,
    three_version: threePackage.version, created_with: project.name
  };
  let count = 0;
  let testCount = 0;
  const manifest = await open(join(stage, 'data.jsonl'), 'wx');
  let renderer;
  try {
    if (renders) {
      const { startRenderer } = await import('./render.js');
      renderer = await startRenderer();
    }
    for (const { id: assetId, url } of assets) {
      const asset = await import(url);
      const seedOffset = digest([assetId]).readUInt32BE(0);
      const extra = corners ? ciCorners(assetId) : [];
      const extraSeeds = new Set(extra.filter(c => !c.params).map(c => c.seed));
      for (let i = 0; i < samples + extra.length; i++) {
        // A permuted counter keeps record seeds unique throughout the uint32 domain.
        const fixture = extra[i-samples];
        const seed = fixture?.seed ?? mixSeed((seedOffset + i) >>> 0);
        if (!fixture && extraSeeds.has(seed)) continue;
        try {
          // Domain-separate parameter draws from the asset's own random stream.
          const paramSeed = digest(['parameters', assetId, seed]).readUInt32BE(0);
          const params = fixture?.params ? resolveParams(asset.schema, fixture.params) : sampleParams(asset.schema, seededRandom(paramSeed));
          const { root, triangles, prompt, tasks, checks } = validateAsset(asset, assetId, { params, seed });
          const meta = root.userData;
          const id = recordId(assetId, meta.version, seed, params);
          const record = {
            id, asset_id: assetId, asset_version: meta.version, seed, params,
            prompt,
            code: 'createAsset(' + JSON.stringify(params) + ', { seed: ' + seed + ' })',
            glb_path: 'glb/' + id + '.glb', triangles, bounding_box: meta.boundingBox,
            states: meta.states, tasks, joints: meta.joints, affordances: meta.affordances, controls: meta.controls ?? [], split: splitFor(assetId, seed),
            provenance: { ...provenance, seed, checks, sim_report: urdf ? 'sim/'+id+'.json' : null }, license: meta.license
          };
          await writeFile(join(stage, record.glb_path), await exportGLB(root), { flag: 'wx' });
          if (meta.installation) record.installation = meta.installation;
          if (urdf) {
            record.urdf_path = 'urdf/' + id + '/model.urdf';
            const directory = join(stage, 'urdf', id);
            const model = exportURDF(root);
            await mkdir(join(directory, 'meshes'), { recursive: true });
            for (const [filename, bytes] of model.meshes) await writeFile(join(directory, filename), bytes);
            await writeFile(join(stage, record.urdf_path), model.urdf);
          }
          if (renderer) record.renders = await renderer.renderRecord(record, stage);
          await manifest.writeFile(JSON.stringify(record) + '\n');
          count++;
          if (record.split === 'test') testCount++;
        } catch (cause) {
          throw new Error(assetId + ', seed ' + seed + ': ' + cause.message, { cause });
        }
      }
    }
  } finally {
    await Promise.all([manifest.close(), renderer?.close()]);
  }
  const metadata = await croissant(join(stage,'data.jsonl'),project.version);
  await writeFile(join(stage,'croissant.json'), JSON.stringify(metadata,null,2)+'\n');
  await writeFile(join(stage, 'README.md'), datasetCard(count, testCount, samples, project.version, renders, urdf, corners));
  return count;
}

export async function buildDataset({ samples = 200, out = 'dist/dataset', renders = false, urdf = false, corners = false } = {}) {
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 0x100000000) {
    throw new RangeError('samples must be a positive integer within the uint32 seed space');
  }
  const assets = await discoverAssets();
  await mkdir(out, { recursive: true });
  const stage = await mkdtemp(join(out, '.build-'));
  try {
    await mkdir(join(stage, 'glb'));
    const count = await generate(stage, samples, assets, renders, urdf, corners);
    // Publish the manifest last, after every referenced model is in place.
    const models = join(out, 'glb');
    await mkdir(models, { recursive: true });
    for (const file of await readdir(join(stage, 'glb'))) {
      await rename(join(stage, 'glb', file), join(models, file));
    }
    if (renders) {
      const stagedRenders = join(stage, 'renders');
      for (const id of await readdir(stagedRenders)) {
        const destination = join(out, 'renders', id);
        await mkdir(destination, { recursive: true });
        for (const png of await readdir(join(stagedRenders, id))) {
          await rename(join(stagedRenders, id, png), join(destination, png));
        }
      }
    }
    if (urdf) {
      for (const id of await readdir(join(stage, 'urdf'))) {
        const src = join(stage, 'urdf', id), dest = join(out, 'urdf', id);
        await mkdir(join(dest, 'meshes'), { recursive: true });
        for (const file of await readdir(join(src, 'meshes'))) {
          await rename(join(src, 'meshes', file), join(dest, 'meshes', file));
        }
        await rename(join(src, 'model.urdf'), join(dest, 'model.urdf'));
      }
    }
    await rename(join(stage,'croissant.json'),join(out,'croissant.json'));
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
      samples: { type: 'string', default: '200' }, out: { type: 'string', default: 'dist/dataset' },
      renders: { type: 'boolean', default: false }, urdf: { type: 'boolean', default: false }, corners: { type: 'boolean', default: false }
    } });
    const count = await buildDataset({ samples: Number(values.samples), out: values.out, renders: values.renders, urdf: values.urdf, corners: values.corners });
    console.log('Wrote ' + count + ' validated records to ' + resolve(values.out));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
