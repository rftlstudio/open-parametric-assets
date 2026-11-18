import assert from 'node:assert/strict';
import { Vector3 } from 'three';

const xyz = ['x', 'y', 'z'];
const tolerance = 0.001 + 1e-8;

// Each descendant mesh contributes its oriented local bounding box. Keep the
// individual boxes so the empty space between panels stays empty.
function boxes(group) {
  const result = [];
  group.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.visualOnly) return;
    const geometry = mesh.geometry;
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const center = bounds.getCenter(new Vector3()).applyMatrix4(mesh.matrixWorld);
    const axes = xyz.map((_, i) => new Vector3().setFromMatrixColumn(mesh.matrixWorld, i));
    const half = bounds.getSize(new Vector3()).multiplyScalar(0.5);
    const radii = axes.map((a, i) => half.getComponent(i) * a.length());
    axes.forEach(a => a.normalize());
    result.push({ center, axes, radii });
  });
  assert(result.length, 'empty clearance part: ' + group.name);
  return result;
}

function radius(box, axis) {
  return box.axes.reduce((sum, a, i) => sum + box.radii[i] * Math.abs(a.dot(axis)), 0);
}

function penetrates(a, b) {
  const delta = a.center.clone().sub(b.center);
  const axes = [...a.axes, ...b.axes];
  for (const u of a.axes) for (const v of b.axes) {
    const cross = new Vector3().crossVectors(u, v);
    if (cross.lengthSq() > 1e-16) axes.push(cross.normalize());
  }
  return axes.every(axis => radius(a, axis) + radius(b, axis) - Math.abs(delta.dot(axis)) > tolerance);
}

function extent(parts, axis) {
  let min = Infinity, max = -Infinity;
  for (const box of parts) {
    const p = box.center.dot(axis), r = radius(box, axis);
    min = Math.min(min, p - r);
    max = Math.max(max, p + r);
  }
  return [min, max];
}

export function checkClearance(root, joint) {
  const { moving, stationary, minRetainedRatio } = joint.clearance;
  const child = root.getObjectByName(joint.childPart);
  const part = child.getObjectByName(moving);
  assert(part, joint.name + ': invalid moving clearance part');
  assert(Array.isArray(stationary) && stationary.length && new Set(stationary).size === stationary.length,
    joint.name + ': expected distinct stationary parts');
  assert(minRetainedRatio === undefined || Number.isFinite(minRetainedRatio) && minRetainedRatio >= 0 && minRetainedRatio <= 1,
    joint.name + ': invalid minRetainedRatio');
  const obstacles = stationary.map(name => {
    const obj = root.getObjectByName(name);
    assert(obj && !child.getObjectByName(name) && !obj.getObjectById(child.id), joint.name + ': invalid stationary part ' + name);
    return { name, boxes: boxes(obj) };
  });
  const pos = child.position.clone(), rot = child.quaternion.clone();
  const axis = new Vector3(...joint.axis);
  const worldAxis = axis.clone().transformDirection(child.matrixWorld);
  const spans = obstacles.map(o => extent(o.boxes, worldAxis));
  try {
    for (let i = 0; i < 5; i++) {
      const q = joint.limits[0] + (joint.limits[1] - joint.limits[0]) * i / 4;
      child.position.copy(pos);
      child.quaternion.copy(rot);
      if (joint.type === 'prismatic') child.translateOnAxis(axis, q);
      else child.rotateOnAxis(axis, q);
      child.updateMatrixWorld(true);
      const body = boxes(part);
      for (const obstacle of obstacles) {
        assert(!body.some(a => obstacle.boxes.some(b => penetrates(a, b))),
          joint.name + ': ' + moving + ' intersects ' + obstacle.name + ' at ' + q);
      }
      if (minRetainedRatio > 0) {
        const [low, high] = extent(body, worldAxis);
        const retained = Math.min(high, ...spans.map(s => s[1])) - Math.max(low, ...spans.map(s => s[0]));
        const reference = Math.abs(worldAxis.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
        const across = new Vector3().crossVectors(worldAxis, reference).normalize();
        const up = new Vector3().crossVectors(worldAxis, across);
        const withinEnvelope = [across, up].every(axis => {
          const [min, max] = extent(body, axis);
          const [outerMin, outerMax] = extent(obstacles.flatMap(o => o.boxes), axis);
          return min >= outerMin - tolerance && max <= outerMax + tolerance;
        });
        assert(withinEnvelope && retained + 1e-7 >= minRetainedRatio * (high - low),
          joint.name + ': less than ' + 100 * minRetainedRatio + '% retained at ' + q);
      }
    }
  } finally {
    child.position.copy(pos);
    child.quaternion.copy(rot);
    child.updateMatrixWorld(true);
  }
}
