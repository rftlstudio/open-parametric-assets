import assert from 'node:assert/strict';
import { Matrix3, Vector3 } from 'three';
import { isText } from './schema.js';

export const controlFunctions = ['start', 'stop', 'add_30s', 'door_release', 'power_level', 'timer'];
export const controlIcons = ['play', 'stop', 'plus_30', 'power', 'clock'];
const vector = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);

// Clip a projected face triangle against the region rectangle.
function clippedArea(points, half) {
  for (const axis of [0, 1]) for (const sign of [-1, 1]) {
    const result = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const da = half[axis] - sign * a[axis], db = half[axis] - sign * b[axis];
      if (da >= 0) result.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    points = result;
  }
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area) / 2;
}

function checkRegion(root, region, name) {
  assert(region && vector(region.point, 3) && vector(region.normal, 3) &&
    Math.abs(Math.hypot(...region.normal) - 1) < 1e-6 &&
    vector(region.size, 2) && region.size.every(n => n > 0), name + ': invalid region');
  const part = root.getObjectByName(region.part);
  assert(part?.isMesh, name + ': unknown region part');
  const normal = new Vector3(...region.normal), center = new Vector3(...region.point);
  const u = (Math.abs(normal.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0))
    .projectOnPlane(normal).normalize();
  const v = normal.clone().cross(u);
  const geometry = part.geometry, position = geometry.getAttribute('position');
  const count = geometry.index?.count ?? position.count;
  let covered = 0;
  for (let i = 0; i < count; i += 3) {
    const vertices = [i, i + 1, i + 2].map(j =>
      new Vector3().fromBufferAttribute(position, geometry.index ? geometry.index.getX(j) : j).sub(center));
    const face = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
    if (face.dot(normal) < 0.999 || vertices.some(p => Math.abs(p.dot(normal)) > 0.001 + 1e-8)) continue;
    covered += clippedArea(vertices.map(p => [p.dot(u), p.dot(v)]), region.size.map(n => n / 2));
  }
  assert(covered >= region.size[0] * region.size[1] * (1 - 1e-5), name + ': region off outer surface');
  return part;
}

export function checkControls(root) {
  const controls = root.userData.controls;
  if (controls === undefined) return;
  assert(Array.isArray(controls), 'controls must be an array');
  const names = new Set();
  for (const control of controls) {
    assert(control && isText(control.name) && !names.has(control.name), 'invalid or duplicate control name');
    names.add(control.name);
    const name = control.name;
    assert(['button', 'knob', 'touch'].includes(control.type), name + ': invalid control type');
    assert(controlFunctions.includes(control.function), name + ': unknown function');
    assert(control.label === null || isText(control.label), name + ': invalid label');
    assert(control.icon === null || controlIcons.includes(control.icon), name + ': unknown icon');
    const part = checkRegion(root, control.region, name);
    const state = control.state;
    assert(state && typeof state === 'object', name + ': missing state');
    if (control.type === 'touch') {
      assert(!Object.hasOwn(control, 'joint'), name + ': touch must not have a joint');
      assert(state.kind === 'touch' && Number.isFinite(state.minForceN) && state.minForceN > 0,
        name + ': invalid touch state');
      continue;
    }
    const joint = root.userData.joints.find(j => j.name === control.joint);
    assert(joint, name + ': missing joint');
    const child = root.getObjectByName(joint.childPart);
    assert(child?.getObjectById(part.id), name + ': joint childPart must contain region.part');
    const [lower, upper] = joint.limits;
    if (control.type === 'button') {
      assert(joint.type === 'prismatic', name + ': button joint type mismatch');
      assert(lower === 0 && upper >= 0.002 && upper <= 0.004, name + ': button travel must be 2–4 mm');
      const axis = new Vector3(...joint.axis).transformDirection(child.matrixWorld);
      const normal = new Vector3(...control.region.normal).applyNormalMatrix(new Matrix3().getNormalMatrix(part.matrixWorld));
      assert(axis.dot(normal) < -0.999, name + ': button axis must point into the panel');
      assert(state.kind === 'momentary' && Number.isFinite(state.pressedAt) && state.pressedAt >= 0 && state.pressedAt <= 1,
        name + ': invalid momentary state');
      const spring = state.spring;
      assert(spring && Number.isFinite(spring.stiffness) && spring.stiffness > 0 &&
        Number.isFinite(spring.restPosition) && spring.restPosition >= lower && spring.restPosition <= upper,
        name + ': invalid spring');
    } else {
      assert(joint.type === 'revolute', name + ': knob joint type mismatch');
      assert(state.kind === 'detent' && Array.isArray(state.positions) && state.positions.length >= 2 &&
        state.positions.every((p, i, a) => Number.isFinite(p) && p >= lower && p <= upper && (i === 0 || p > a[i-1])),
        name + ': invalid detent positions');
      assert(Array.isArray(state.values) && state.values.length === state.positions.length &&
        state.values.every(v => Number.isFinite(v) || isText(v)) && isText(state.unit), name + ': invalid detent values or unit');
    }
  }
}
