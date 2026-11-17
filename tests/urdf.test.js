import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { expect, it } from 'vitest';
import * as cabinet from '../assets/furniture/cabinet/index.js';
import * as drawers from '../assets/furniture/drawer_cabinet/index.js';
import { exportURDF } from '../scripts/export-urdf.js';
import { buildDataset } from '../scripts/build-dataset.js';
import { checkClearance } from '../validator/clearance.js';

function parse(xml) {
  return new DOMParser({ onError: level => { throw new Error('XML ' + level); } }).parseFromString(xml, 'text/xml');
}
const elements = (node, tag) => [...node.getElementsByTagName(tag)];

it.each([cabinet, drawers])('exports deterministic, well-formed links with positive definite inertia', asset => {
  for (const handleStyle of asset.schema.parameters.handleStyle.enum) {
    const root = asset.createAsset({ handleStyle }, { seed: 42 });
    const model = exportURDF(root);
    expect(exportURDF(root)).toEqual(model);
    const doc = parse(model.urdf);
    const links = elements(doc, 'link');
    expect(links.map(n => n.getAttribute('name')).sort()).toEqual([root.name, ...root.userData.joints.map(j => j.childPart)].sort());
    expect(elements(doc, 'joint').map(n => n.getAttribute('name'))).toEqual(root.userData.joints.map(j => j.name));
    let mass = 0;
    for (const link of links) {
      mass += Number(elements(link, 'mass')[0].getAttribute('value'));
      const node = elements(link, 'inertia')[0];
      const [a,b,c,d,e,f] = ['ixx','ixy','ixz','iyy','iyz','izz'].map(k => Number(node.getAttribute(k)));
      expect(a).toBeGreaterThan(0);
      expect(a*d-b*b).toBeGreaterThan(0);
      expect(a*(d*f-e*e)-b*(b*f-c*e)+c*(b*e-c*d)).toBeGreaterThan(0);
      expect(elements(link, 'visual').length).toBe(elements(link, 'collision').length);
    }
    expect(mass).toBeCloseTo(root.userData.physics.massKg, 4);
    for (const mesh of elements(doc, 'mesh')) {
      const bytes = model.meshes.get(mesh.getAttribute('filename'));
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(bytes)).toMatch(/^v .*\nf /m);
    }
    expect(model.meshes.size > 0).toBe(handleStyle === 'recessed');
  }
});

it('converts axes and origins to Z-up and exports explicit joint dynamics', () => {
  const root = drawers.createAsset();
  const j = root.userData.joints[0];
  j.dynamics = { damping: 2, friction: 0.12 };
  j.effort = 80;
  j.velocity = 0.3;
  const node = elements(parse(exportURDF(root).urdf), 'joint')[0];
  const numbers = (tag, key) => elements(node, tag)[0].getAttribute(key).split(' ').map(Number);
  const axis = numbers('axis', 'xyz');
  expect(axis[0]).toBeCloseTo(0);
  expect(axis[1]).toBeCloseTo(-1);
  expect(axis[2]).toBeCloseTo(0);
  expect(numbers('origin','xyz')[2]).toBeCloseTo(root.getObjectByName(j.childPart).position.y);
  expect(numbers('dynamics','damping')).toEqual([2]);
  expect(numbers('dynamics','friction')).toEqual([0.12]);
  expect(numbers('limit','effort')).toEqual([80]);
  expect(numbers('limit','velocity')).toEqual([0.3]);
});

it('computes a box inertia about its center of mass, with XML-safe names', () => {
  const root = new Group();
  root.name = 'body & "frame"';
  const material = new MeshStandardMaterial();
  material.userData.densityKgM3 = 10;
  const mesh = new Mesh(new BoxGeometry(1,2,3), material);
  mesh.name = 'box';
  mesh.position.set(2,3,4);
  root.add(mesh);
  root.userData = { joints: [] };
  const doc = parse(exportURDF(root).urdf);
  expect(doc.documentElement.getAttribute('name')).toBe(root.name);
  const inertia = elements(doc, 'inertia')[0];
  expect(Number(inertia.getAttribute('ixx'))).toBeCloseTo(65);
  expect(Number(inertia.getAttribute('iyy'))).toBeCloseTo(25);
  expect(Number(inertia.getAttribute('izz'))).toBeCloseTo(50);
  expect(elements(doc, 'inertial')[0].firstChild.getAttribute('xyz').split(' ').map(Number)[2]).toBeCloseTo(3);
});

it('writes optional URDFs and their meshes reproducibly alongside every dataset record', async () => {
  const out = await mkdtemp(join(tmpdir(), 'opa-urdf-'));
  try {
    await buildDataset({ samples: 1, out, urdf: true });
    const text = await readFile(join(out, 'data.jsonl'), 'utf8');
    const originals = new Map();
    for (const row of text.trim().split('\n').map(JSON.parse)) {
      expect(row.urdf_path).toBe('urdf/' + row.id + '/model.urdf');
      const xml = await readFile(join(out, row.urdf_path), 'utf8');
      originals.set(row.urdf_path, xml);
      for (const mesh of elements(parse(xml), 'mesh')) {
        expect((await readFile(join(out, 'urdf', row.id, mesh.getAttribute('filename')))).length).toBeGreaterThan(0);
      }
    }
    await buildDataset({ samples: 1, out, urdf: true });
    expect(await readFile(join(out, 'data.jsonl'), 'utf8')).toBe(text);
    for (const [path, xml] of originals) expect(await readFile(join(out,path),'utf8')).toBe(xml);
    expect(await readFile(join(out,'README.md'),'utf8')).toContain('urdf_path');
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

it.each(['revolute', 'prismatic'])('catches intermediate %s collisions and restores the rest pose', type => {
  const root = new Group(), child = new Group();
  child.name = 'moving';
  const box = new Mesh(new BoxGeometry(0.1,0.1,0.1));
  child.add(box);
  const obstacle = new Mesh(new BoxGeometry(0.1,0.1,0.1));
  obstacle.name = 'stationary';
  root.add(child, obstacle);
  const joint = { name: 'joint', type, childPart: 'moving', axis: [0,1,0], limits: [0,Math.PI],
    clearance: { moving: 'moving', stationary: ['stationary'] } };
  if (type === 'revolute') {
    box.position.x = 1;
    obstacle.position.z = -1;
  } else {
    joint.axis = [1,0,0];
    joint.limits = [0,2];
    obstacle.position.x = 1;
  }
  root.updateMatrixWorld(true);
  expect(() => checkClearance(root, joint)).toThrow(/intersects stationary/);
  expect(child.position.toArray()).toEqual([0,0,0]);
  expect(child.quaternion.toArray()).toEqual([0,0,0,1]);
  obstacle.position.y = 1;
  root.updateMatrixWorld(true);
  expect(() => checkClearance(root, joint)).not.toThrow();
});
