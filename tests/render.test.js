import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createAsset } from '../assets/furniture/cabinet/index.js';
import { buildDataset } from '../scripts/build-dataset.js';
import { exportGLB } from '../scripts/export-glb.js';
import { startRenderer } from '../scripts/render.js';

const views = ['front', 'three_quarter', 'side', 'top', 'open_three_quarter'];
const sample = fileURLToPath(new URL('../examples/dataset-sample/', import.meta.url));
let directory;
let renderer;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'opa-render-'));
  renderer = await startRenderer();
}, 60000);

afterAll(async () => {
  try {
    await renderer?.close();
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

async function readImage(directory, relativePath) {
  return PNG.sync.read(await readFile(join(directory, relativePath)));
}

function rgbDifference(a, b) {
  expect([b.width, b.height]).toEqual([a.width, a.height]);
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i + c] - b.data[i + c]);
  }
  return sum / (a.width * a.height * 3 * 255);
}

function checkFraming({ width, height, data }) {
  expect([width, height]).toEqual([512, 512]);
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = 4 * (y * width + x);
      // Ignore barely blended antialiasing pixels on the #e6e6e6 background.
      if (Math.max(Math.abs(data[i] - 230), Math.abs(data[i + 1] - 230), Math.abs(data[i + 2] - 230)) <= 3) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  expect(Math.max(right - left, bottom - top)).toBeGreaterThan(width * 0.7);
  expect(Math.min(left, width - 1 - right, top, height - 1 - bottom)).toBeGreaterThan(0);
  expect(Math.abs((left + right + 1) / 2 - width / 2)).toBeLessThan(width * 0.05);
  expect(Math.abs((top + bottom + 1) / 2 - height / 2)).toBeLessThan(height * 0.05);
}

it('frames the default cabinet in five views and visibly opens its doors', async () => {
  const cabinet = createAsset();
  const record = { id: 'default', bounding_box: cabinet.userData.boundingBox, glb_path: 'default.glb' };
  await writeFile(join(directory, record.glb_path), await exportGLB(cabinet));
  const paths = await renderer.renderRecord(record, directory);
  expect(Object.keys(paths).sort()).toEqual([...views].sort());
  const images = {};
  for (const view of views) {
    expect(paths[view]).toBe('renders/default/' + view + '.png');
    images[view] = await readImage(directory, paths[view]);
    checkFraming(images[view]);
  }
  expect(rgbDifference(images.three_quarter, images.open_three_quarter)).toBeGreaterThan(0.01);
}, 60000);

it('reproduces the published sample within 1% normalized mean absolute RGB difference', async () => {
  const rows = (await readFile(join(sample, 'data.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const renderedRows = rows.filter(row => row.renders);
  expect(renderedRows).toHaveLength(1);
  const [row] = renderedRows;
  const output = join(directory, 'dataset');
  await buildDataset({ samples: 1, renders: true, out: output });
  const manifest = await readFile(join(output, 'data.jsonl'), 'utf8');
  const actual = manifest.trim().split('\n').map(line => JSON.parse(line)).find(record => record.id === row.id);
  expect(actual.renders).toEqual(row.renders);
  for (const view of views) {
    const reference = await readImage(sample, row.renders[view]);
    const result = await readImage(output, actual.renders[view]);
    expect(rgbDifference(reference, result), view).toBeLessThan(0.01);
  }
}, 60000);
