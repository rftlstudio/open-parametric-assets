import assert from 'node:assert/strict';
import { Box3, Matrix3, Matrix4, Quaternion, Vector3 } from 'three';

// Work in meters in a frame where +Z is the slide direction. Compute AABBs
// from vertices in that frame, including all descendants of the tray group.
function railBounds(node, frame) {
  const bounds = new Box3();
  const point = new Vector3();
  node.traverse(part => {
    if (!part.isMesh) return;
    const transform = new Matrix4().multiplyMatrices(frame, part.matrixWorld);
    const positions = part.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      bounds.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(transform));
    }
  });
  assert(!bounds.isEmpty(), 'empty slide collision part: ' + node.name);
  return bounds;
}

export function checkDrawerTravel(root, joint) {
  const drawer = root.getObjectByName(joint.childPart);
  const tray = drawer.getObjectByName(joint.drawerBox);
  assert(tray && tray !== drawer, joint.name + ': missing drawerBox inside moving part');
  assert(Array.isArray(joint.caseSides) && new Set(joint.caseSides).size === 2 && joint.caseSides.length === 2,
    joint.name + ': expected two distinct caseSides');

  // Object3D.translateOnAxis applies the child's rotation, then the parent's
  // world transform. Predict its end pose without moving the validated asset.
  const step = new Vector3(...joint.axis).applyQuaternion(drawer.quaternion)
    .applyMatrix3(new Matrix3().setFromMatrix4(drawer.parent.matrixWorld));
  const frame = new Matrix4().makeRotationFromQuaternion(new Quaternion()
    .setFromUnitVectors(step.clone().normalize(), new Vector3(0, 0, 1)));
  const box = railBounds(tray, frame);
  const depth = box.max.z - box.min.z;
  assert(depth > 0, joint.name + ': empty drawer depth');
  box.translate(new Vector3(0, 0, joint.limits[1] * step.length()));

  const sides = joint.caseSides.map(name => {
    const panel = root.getObjectByName(name);
    assert(panel?.isMesh && !drawer.getObjectByName(name), joint.name + ': missing stationary case side ' + name);
    const side = railBounds(panel, frame);
    const penetration = box.clone().intersect(side).getSize(new Vector3());
    assert(Math.min(penetration.x, penetration.y, penetration.z) <= 0.001 + 1e-8,
      joint.name + ': drawer box intersects ' + name + ' at upper limit');
    return side;
  });

  const envelope = sides[0].clone().union(sides[1]);
  const inside = Math.min(box.max.z, sides[0].max.z, sides[1].max.z) -
    Math.max(box.min.z, sides[0].min.z, sides[1].min.z);
  const withinCase = ['x', 'y'].every(axis =>
    box.min[axis] >= envelope.min[axis] - 0.001 && box.max[axis] <= envelope.max[axis] + 0.001);
  assert(withinCase && inside + 1e-7 >= 0.2 * depth, joint.name + ': less than 20% retained inside case');
}
