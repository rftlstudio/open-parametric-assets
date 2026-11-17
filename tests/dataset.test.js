import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, expect, it, vi } from 'vitest';
import * as cabinet from '../assets/furniture/cabinet/index.js';
import { describe } from '../lib/prompt.js';
import { resolveParams } from '../lib/parameters.js';
import { checkSchema, sampleParams } from '../validator/schema.js';
import { validateAsset } from '../validator/validate.js';
import { buildDataset, splitFor } from '../scripts/build-dataset.js';
import { exportGLB } from '../scripts/export-glb.js';
import project from '../package.json' with { type: 'json' };

const assetId = 'furniture/cabinet';
const temporary = [];

async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'opa-dataset-'));
  temporary.push(path);
  return path;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

async function loadGLB(bytes) {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return (await new GLTFLoader().parseAsync(data, '')).scene;
}

function meshes(root) {
  const names = [];
  root.traverse(node => { if (node.isMesh) names.push(node.name); });
  return names.sort();
}

it('round-trips cabinet mesh names, bounds and root extras in Node', async () => {
  const original = cabinet.createAsset({ shelfCount: 4 }, { seed: 9852 });
  const bytes = await exportGLB(original);
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(Buffer.from(bytes.subarray(0, 4)).toString()).toBe('glTF');
  const loaded = (await loadGLB(bytes)).getObjectByName(original.name);
  expect(meshes(loaded)).toEqual(meshes(original));
  expect(loaded.userData).toMatchObject(original.userData);
  const before = new Box3().setFromObject(original, true);
  const after = new Box3().setFromObject(loaded, true);
  for (const side of ['min', 'max']) {
    for (const axis of ['x', 'y', 'z']) expect(Math.abs(before[side][axis] - after[side][axis])).toBeLessThanOrEqual(0.001);
  }
});

it('describes all parameters consistently across multiple English templates', () => {
  const params = { width: 0.79, height: 1.2, depth: 0.54, doorCount: 1, shelfCount: 3,
    handleStyle: 'bar', color: '#526878', wear: 0.35 };
  const texts = new Set();
  for (let seed = 0; seed < 32; seed++) {
    const prompt = describe(assetId, params, seed);
    expect(describe(assetId, params, seed)).toBe(prompt);
    for (const phrase of ['0.79 m wide', '1.20 m tall', '0.54 m deep', 'one door,', 'bar handle',
      'three shelves', 'slate blue', 'looks worn.']) expect(prompt).toContain(phrase);
    texts.add(prompt);
  }
  expect(texts.size).toBe(3);
  const plural = describe(assetId, { doorCount: 2, handleStyle: 'knob', shelfCount: 1 }, 0);
  expect(plural).toContain('two doors, knob handles and one shelf.');
  expect(describe(assetId, { shelfCount: 0 }, 0)).toContain('no shelves');
});

it.each([
  [0, 'brand new'], [0.05, 'lightly worn'], [0.30, 'lightly worn'],
  [0.35, 'worn'], [0.70, 'worn'], [0.75, 'heavily worn'], [1, 'heavily worn']
])('uses the correct wear band for %s', (wear, band) => {
  expect(describe(assetId, { wear }, 42)).toContain('looks ' + band + '.');
});

it('reports a missing or non-deterministic asset-local template', () => {
  const missing = { ...cabinet, describe: undefined };
  expect(() => describe(assetId, {}, 0, missing)).toThrow(/furniture\/cabinet: missing describe/);
  expect(() => validateAsset(missing, assetId)).toThrow(/missing describe/);
  let calls = 0;
  const unstable = { ...cabinet, describe: () => 'Cabinet ' + ++calls };
  expect(() => validateAsset(unstable, assetId)).toThrow(/non-deterministic describe/);
});

it('samples a decimal grid from its minimum and rejects off-grid inputs', () => {
  const schema = { parameters: {
    length: { type: 'number', min: -0.025, max: 0.09, step: 0.05, default: 0.025, unit: 'm', description: 'Length' }
  } };
  checkSchema(schema);
  for (const [u, length] of [[0, -0.025], [0.5, 0.025], [0.9999, 0.075]]) {
    expect(sampleParams(schema, () => u)).toEqual({ length });
    expect(resolveParams(schema, { length })).toEqual({ length });
  }
  expect(() => resolveParams(schema, { length: 0.09 })).toThrow(/length/);
  for (const step of [0, -0.1, Infinity]) {
    expect(() => checkSchema({ parameters: { length: { ...schema.parameters.length, step } } })).toThrow(/step/);
  }
  for (const params of [{ width: 1.2700000001 }, { depth: 0.401 }, { wear: 0.23 }]) {
    expect(() => cabinet.createAsset(params)).toThrow(/Invalid parameter/);
  }
  expect(resolveParams(cabinet.schema, { width: 1.27 }).width).toBe(1.27);
});

function readGeometry(prompt) {
  const counts = ['no', 'one', 'two', 'three', 'four', 'five'];
  const [, width, height, depth] = prompt.match(/\b(\d+\.\d{2}) m wide, (\d+\.\d{2}) m tall and (\d+\.\d{2}) m deep\b/);
  const [, doors] = prompt.match(/\b(one|two) doors?\b/);
  const [, handleStyle] = prompt.match(/\b(bar|knob) handles?\b/);
  const [, shelves] = prompt.match(/\b(no|one|two|three|four|five) shel(?:f|ves)\b/);
  return { width: Number(width), height: Number(height), depth: Number(depth),
    doorCount: counts.indexOf(doors), shelfCount: counts.indexOf(shelves), handleStyle };
}

it('writes five replayable records per asset and reproduces their IDs and GLBs', async () => {
  const first = await directory();
  const second = await directory();
  for (const out of [first, second]) await buildDataset({ samples: 5, out });
  const manifest = await readFile(join(first, 'data.jsonl'), 'utf8');
  expect(await readFile(join(second, 'data.jsonl'), 'utf8')).toBe(manifest);
  const records = manifest.trimEnd().split('\n').map(line => JSON.parse(line));
  const rows = records.filter(r => r.asset_id === assetId);
  expect(rows).toHaveLength(5);
  expect(new Set(records.map(r => r.id)).size).toBe(records.length);
  expect((await readdir(join(first, 'glb'))).length).toBe(records.length);

  for (const r of rows) {
    expect(r).not.toHaveProperty('renders');
    const { width, height, depth, doorCount, shelfCount, handleStyle } = r.params;
    expect(readGeometry(r.prompt)).toEqual({ width, height, depth, doorCount, shelfCount, handleStyle });
    expect(r.prompt).toContain(cabinet.schema.parameters.color.labels[r.params.color]);
    const original = cabinet.createAsset(r.params, { seed: r.seed });
    let triangles = 0;
    original.traverse(node => { if (node.isMesh) triangles += node.geometry.index.count / 3; });
    expect(r).toMatchObject({
      asset_version: original.userData.version, triangles, bounding_box: original.userData.boundingBox,
      joints: original.userData.joints, affordances: original.userData.affordances,
      prompt: describe(assetId, r.params, r.seed), split: splitFor(assetId, r.seed),
      glb_path: 'glb/' + r.id + '.glb', license: 'CC-BY-4.0',
      provenance: { created_with: project.name, generator_version: project.version,
        validator_version: project.version, three_version: project.devDependencies.three }
    });
    expect(r.code).toBe('createAsset(' + JSON.stringify(r.params) + ', { seed: ' + r.seed + ' })');
    const bytes = await readFile(join(first, r.glb_path));
    expect(bytes.equals(await readFile(join(second, r.glb_path)))).toBe(true);
    expect((await loadGLB(bytes)).getObjectByName(original.name).userData).toMatchObject(original.userData);
  }
  const card = await readFile(join(first, 'README.md'), 'utf8');
  expect(card).toContain('license: cc-by-4.0');
  expect(card).toContain('size: ' + records.length + '\n');
});

it('assigns approximately one tenth of 1000 seeds to the test split', () => {
  let tests = 0;
  for (let seed = 0; seed < 1000; seed++) {
    const input = JSON.stringify([assetId, seed]);
    const hash = createHash('sha256').update(input).digest('hex');
    const expected = parseInt(hash.slice(0, 8), 16) < 0x100000000 / 10 ? 'test' : 'train';
    expect(splitFor(assetId, seed)).toBe(expected);
    if (expected === 'test') tests++;
  }
  expect(tests).toBeGreaterThanOrEqual(70);
  expect(tests).toBeLessThanOrEqual(130);
});

it('aborts publication when the exact sampled geometry is invalid', async () => {
  const out = await directory();
  await buildDataset({ samples: 1, out });
  const originalManifest = await readFile(join(out, 'data.jsonl'), 'utf8');
  const baseline = originalManifest.trim().split('\n').map(line => JSON.parse(line));
  const firstSeed = baseline.find(row => row.asset_id === assetId).seed;
  const original = cabinet.createAsset;
  vi.spyOn(cabinet, 'createAsset').mockImplementation((params, options) => {
    const root = original(params, options);
    if (options.seed !== firstSeed) root.getObjectByName('bottom').geometry.attributes.position.setX(0, NaN);
    return root;
  });
  await expect(buildDataset({ samples: 2, out })).rejects.toThrow(/seed .*non-finite vertex/);
  expect(await readFile(join(out, 'data.jsonl'), 'utf8')).toBe(originalManifest);
  expect((await readdir(join(out, 'glb'))).sort()).toEqual(baseline.map(row => row.id + '.glb').sort());
});
