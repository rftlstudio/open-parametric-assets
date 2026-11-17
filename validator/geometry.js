import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Box3, Group, Vector3 } from 'three';
import { checkClearance } from './clearance.js';
import { isText } from './schema.js';

const finiteVector = (value, n) => Array.isArray(value) && value.length === n && value.every(Number.isFinite);

function checkMetadata(data, parts, id) {
  assert.equal(data.id, id, 'id must match asset path');
  assert.equal(data.category, id.split('/')[0], 'invalid category');
  assert(isText(data.version) && /^\d+\.\d+\.\d+$/.test(data.version), 'invalid version');
  assert.equal(data.units, 'm');
  assert.equal(data.license, 'CC-BY-4.0');
  const p = data.physics;
  assert(p && Number.isFinite(p.massKg) && p.massKg > 0, 'invalid physics.massKg');
  assert(Number.isFinite(p.friction) && p.friction >= 0, 'invalid physics.friction');
  assert(['box', 'compound'].includes(p.collision), 'invalid physics.collision');
  assert(Array.isArray(data.joints) && Array.isArray(data.affordances), 'expected joints and affordances arrays');
  const jointNames = new Set();
  for (const joint of data.joints) {
    assert(isText(joint.name) && !jointNames.has(joint.name), 'invalid or duplicate joint name');
    jointNames.add(joint.name);
    assert(['prismatic', 'revolute'].includes(joint.type), 'invalid joint type');
    assert(parts.has(joint.childPart), 'unknown joint childPart: ' + joint.childPart);
    assert(finiteVector(joint.axis, 3) && Math.abs(Math.hypot(...joint.axis) - 1) < 1e-6, 'invalid joint axis');
    if (joint.dynamics !== undefined) {
      assert(joint.dynamics && typeof joint.dynamics === 'object', 'invalid joint dynamics');
      for (const key of ['damping', 'friction']) {
        const value = joint.dynamics[key];
        assert(value === undefined || Number.isFinite(value) && value >= 0, 'invalid joint dynamics.' + key);
      }
    }
    for (const key of ['effort', 'velocity']) {
      assert(joint[key] === undefined || Number.isFinite(joint[key]) && joint[key] > 0, 'invalid joint ' + key);
    }
    assert(finiteVector(joint.limits, 2) && joint.limits[0] <= joint.limits[1], 'invalid joint limits');
  }
  for (const a of data.affordances) {
    assert(parts.has(a.part) && finiteVector(a.point, 3), 'invalid affordance target or point');
    assert(['grasp', 'placeable'].includes(a.type), 'unknown affordance type');
    if (a.type === 'placeable') {
      assert(finiteVector(a.normal, 3) && Math.abs(Math.hypot(...a.normal) - 1) < 1e-6, 'invalid surface normal');
      assert(finiteVector(a.size, 2) && a.size.every(v => v > 0), 'invalid surface size');
    }
  }
}

// Hash attribute values in vertex order, including interleaved buffers.
function digestAttribute(hash, key, attr) {
  hash.update(JSON.stringify([key, attr.count, attr.itemSize, attr.normalized]));
  const values = new Float64Array(attr.itemSize);
  const bytes = Buffer.from(values.buffer);
  for (let i = 0; i < attr.count; i++) {
    for (let c = 0; c < attr.itemSize; c++) values[c] = attr.getComponent(i, c);
    hash.update(bytes);
  }
}

export function inspect(root, id, triangleLimit) {
  assert(root instanceof Group, 'createAsset must return a THREE.Group');
  root.updateMatrixWorld(true);
  const parts = new Set();
  const bounds = new Box3();
  const v = new Vector3();
  const hash = createHash('sha256');
  let triangles = 0;

  root.traverse(node => {
    if (node !== root && (node.isMesh || node.name)) {
      assert(isText(node.name) && !parts.has(node.name), 'empty or duplicate part name: ' + node.name);
      parts.add(node.name);
    }
    hash.update(JSON.stringify([node.type, node.name, node.children.length, node.matrix.elements]));
    if (!node.isMesh) return;
    const geo = node.geometry;
    const pos = geo.getAttribute('position');
    assert(pos?.count > 0 && pos.itemSize === 3, node.name + ': expected xyz positions');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
      assert([v.x, v.y, v.z].every(Number.isFinite), node.name + ': non-finite vertex position');
      bounds.expandByPoint(v);
    }
    const count = geo.index ? geo.index.count : pos.count;
    assert(count % 3 === 0, node.name + ': incomplete triangle');
    triangles += count / 3;
    if (geo.index) {
      for (let i = 0; i < count; i++) {
        const idx = geo.index.getX(i);
        assert(Number.isInteger(idx) && idx >= 0 && idx < pos.count, node.name + ': invalid vertex index');
      }
      digestAttribute(hash, 'index', geo.index);
    }
    for (const key of Object.keys(geo.attributes).sort()) digestAttribute(hash, key, geo.attributes[key]);
    hash.update(JSON.stringify(geo.groups));
    for (const m of [].concat(node.material)) {
      hash.update(JSON.stringify([m.type, m.color?.toArray(), m.roughness, m.metalness, m.opacity, m.userData.densityKgM3]));
    }
  });

  assert(triangles > 0 && triangles <= triangleLimit, 'triangle count ' + triangles + ' outside budget 1..' + triangleLimit);
  checkMetadata(root.userData, parts, id);
  for (const joint of root.userData.joints) {
    if (joint.clearance !== undefined) checkClearance(root, joint);
  }
  for (const side of ['min', 'max']) {
    const declared = root.userData.boundingBox?.[side];
    assert(finiteVector(declared, 3), 'invalid boundingBox.' + side);
    bounds[side].toArray().forEach((v, i) => {
      assert(Math.abs(v - declared[i]) <= 0.001, 'boundingBox.' + side + '[' + i + '] exceeds 1 mm tolerance');
    });
  }
  hash.update(JSON.stringify(root.userData));
  return { hash: hash.digest('hex'), triangles };
}
