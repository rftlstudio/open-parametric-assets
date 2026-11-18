import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, OrthographicCamera, Vector3 } from 'three';
import { createAsset as microwave } from '../assets/appliances/microwave/index.js';
import { createAsset as oven } from '../assets/appliances/oven/index.js';
import { fitControlPanel } from '../scripts/fit-control-panel.js';
import { regionCorners } from '../lib/control-region.js';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createAsset } from '../assets/furniture/cabinet/index.js';
import { buildDataset } from '../scripts/build-dataset.js';
import { exportGLB } from '../scripts/export-glb.js';
import { startRenderer } from '../scripts/render.js';

const views = ['front', 'three_quarter', 'side', 'top', 'open_three_quarter', 'perspective_three_quarter'];
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
  const coverage = Math.max(right - left + 1, bottom - top + 1) / width;
  expect(coverage).toBeGreaterThan(0.7);
  expect(Math.min(left, width - 1 - right, top, height - 1 - bottom)).toBeGreaterThan(0);
  expect(Math.abs((left + right + 1) / 2 - width / 2)).toBeLessThan(width * 0.05);
  expect(Math.abs((top + bottom + 1) / 2 - height / 2)).toBeLessThan(height * 0.05);
  return coverage;
}

// Mean relative luminance of a 20 × 20 patch, in linear sRGB.
function meanLuminance(image, left, top) {
  const linear = byte => {
    const c = byte / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  let sum = 0;
  for (let y = top; y < top + 20; y++) {
    for (let x = left; x < left + 20; x++) {
      const i = 4 * (y * image.width + x);
      sum += 0.2126 * linear(image.data[i]) + 0.7152 * linear(image.data[i+1]) + 0.0722 * linear(image.data[i+2]);
    }
  }
  return sum / 400;
}

it.each([
  ['microwave dials', microwave, {controlStyle:'physical',height:0.35}],
  ['microwave buttons', microwave, {controlLayout:'buttons'}],
  ['microwave mixed', microwave, {controlStyle:'mixed'}],
  ['microwave touch', microwave, {controlStyle:'touch',height:0.26}],
  ['oven dials', oven, {width:0.6,controlStyle:'physical'}],
  ['oven touch strip', oven, {width:0.9,height:0.45,controlStyle:'touch'}]
])('frames %s with legible interaction regions', (_, factory, params) => {
  const asset = factory(params);
  // Stress a fixed marking extending beyond its region, and a panel rotated in world space.
  if (factory === microwave && params.controlStyle === 'touch') asset.getObjectByName('digit_1_touch_mark').position.y += 0.04;
  asset.rotation.set(0.18, 0.45, 0.12);
  asset.updateMatrixWorld(true);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 4);
  camera.position.set(0, 0, 1).applyQuaternion(asset.quaternion);
  camera.lookAt(asset.position);
  camera.updateMatrixWorld();
  const controls = asset.userData.controls;
  const regions = controls.map(c => regionCorners(asset.getObjectByName(c.region.part), c.region));
  const pixels = fitControlPanel(camera, asset, regions);
  expect(Math.max(pixels.width,pixels.height)/Math.min(pixels.width,pixels.height)).toBeLessThanOrEqual(4);
  for (const region of regions) {
    const [a,b,,d] = region.map(point => point.clone().project(camera));
    const length = end => Math.hypot((end.x-a.x)*pixels.width/2,(end.y-a.y)*pixels.height/2);
    expect(Math.min(length(b),length(d))).toBeGreaterThanOrEqual(24-1e-7);
  }

  const bounds = new Box3().setFromPoints(regions.flat().map(p => p.project(camera)));
  for (const control of controls) {
    const targets = [asset.getObjectByName(control.name + '_mark')];
    asset.traverse(part => { if (part.userData.scaleFor === control.name) targets.push(part); });
    if (control.joint) {
      const joint = asset.userData.joints.find(j => j.name === control.joint);
      targets.push(asset.getObjectByName(joint.childPart));
    }
    for (const target of targets) target.traverse(mesh => {
      if (!mesh.isMesh) return;
      const vertices = mesh.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        const world = mesh.localToWorld(new Vector3().fromBufferAttribute(vertices, i));
        bounds.expandByPoint(world.project(camera));
      }
    });
  }
  const { min, max } = bounds;
  expect(min.z).toBeGreaterThan(-1);
  expect(max.z).toBeLessThan(1);
  const extent = Math.max(-min.x, -min.y, max.x, max.y);
  expect(extent).toBeLessThanOrEqual(1/1.15 + 1e-7);
  expect(extent).toBeGreaterThan(1/1.15 - 0.005);
  expect(Math.abs(max.x + min.x) + Math.abs(max.y + min.y)).toBeLessThan(1e-6);
});

it('frames the default cabinet in six views, distinguishes panels and visibly opens its doors', async () => {
  const cabinet = createAsset();
  const record = { id: 'default', bounding_box: cabinet.userData.boundingBox, glb_path: 'default.glb' };
  await writeFile(join(directory, record.glb_path), await exportGLB(cabinet));
  const paths = await renderer.renderRecord(record, directory);
  expect(Object.keys(paths).sort()).toEqual([...views].sort());
  const images = {};
  for (const view of views) {
    expect(paths[view]).toBe('renders/default/' + view + '.png');
    images[view] = await readImage(directory, paths[view]);
    const coverage = checkFraming(images[view]);
    if (view === 'perspective_three_quarter') {
      expect(coverage).toBeGreaterThanOrEqual(0.78);
      expect(coverage).toBeLessThanOrEqual(0.82);
    }
  }
  // Interior patches on the left door and right case wall in the fixed 512px view.
  const panel = meanLuminance(images.three_quarter, 150, 210);
  const side = meanLuminance(images.three_quarter, 345, 210);
  expect(panel - side).toBeGreaterThan(0.04);
  expect(rgbDifference(images.three_quarter, images.open_three_quarter)).toBeGreaterThan(0.01);
}, 60000);

it('reproduces the published sample within 1% normalized mean absolute RGB difference', async () => {
  const rows = (await readFile(join(sample, 'data.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const renderedRows = rows.filter(row => row.renders);
  expect([...new Set(renderedRows.map(row => row.asset_id))].sort()).toEqual(['appliances/microwave', 'appliances/oven', 'furniture/cabinet', 'furniture/drawer_cabinet']);
  const output = join(directory, 'dataset');
  await buildDataset({ samples: 3, renders: true, out: output });
  const manifest = await readFile(join(output, 'data.jsonl'), 'utf8');
  const records = manifest.trim().split('\n').map(line => JSON.parse(line));
  for (const row of renderedRows) {
    const actual = records.find(record => record.id === row.id);
    expect(actual).toEqual(row);
    const expectedViews = row.controls.length ? [...views, 'control_panel'] : views;
    expect(Object.keys(actual.renders).sort()).toEqual([...expectedViews].sort());
    for (const view of expectedViews) {
      const reference = await readImage(sample, row.renders[view]);
      const result = await readImage(output, actual.renders[view]);
      expect(rgbDifference(reference, result), row.asset_id + ' ' + view).toBeLessThan(0.01);
    }
    const closed = await readImage(output, actual.renders.three_quarter);
    const open = await readImage(output, actual.renders.open_three_quarter);
    expect(rgbDifference(closed, open), row.asset_id).toBeGreaterThan(0.01);
  }
}, 60000);
