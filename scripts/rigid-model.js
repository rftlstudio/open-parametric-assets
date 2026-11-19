import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { MassProperties } from './urdf-inertia.js';

const basis = new Matrix4().makeRotationX(Math.PI / 2);
const inverseBasis = basis.clone().invert();
export const number = value => Number(value.toFixed(9)).toString();
export const vec = v => v.toArray().map(number).join(' ');
export const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
// Serialize both physics formats with identical extrinsic XYZ angle rounding.
export function rpy(rotation) {
  const e = new Euler().setFromQuaternion(rotation, 'ZYX');
  return [e.x, e.y, e.z].map(number).join(' ');
}

function frame(node) {
  // Every link frame uses the Z-up basis, including articulated children.
  const pos = new Vector3(), rot = new Quaternion(), scale = new Vector3();
  node.matrixWorld.decompose(pos, rot, scale);
  if (scale.distanceTo(new Vector3(1, 1, 1)) > 1e-8) throw new Error(node.name + ': scaled joint or base frame');
  return node.matrixWorld.clone().multiply(inverseBasis);
}

function meshShape(node, local, masses, meshes) {
  const point = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
  local.decompose(point, rotation, scale);
  if (Math.min(...scale.toArray()) <= 0) throw new Error(node.name + ': expected positive scale');
  const recomposed = new Matrix4().compose(point, rotation, scale);
  if (local.elements.some((n, i) => !Number.isFinite(n) || Math.abs(n - recomposed.elements[i]) > 1e-8)) {
    throw new Error(node.name + ': sheared mesh transform cannot be represented by a URDF primitive');
  }
  const density = node.material.userData.densityKgM3;
  if (masses && !(Number.isFinite(density) && density > 0)) throw new Error(node.name + ': missing positive material densityKgM3');
  const geo = node.geometry;
  if (geo.type === 'BoxGeometry') {
    geo.computeBoundingBox();
    const size = geo.boundingBox.getSize(new Vector3()).multiply(scale);
    const center = geo.boundingBox.getCenter(new Vector3()).applyMatrix4(local);
    masses?.box(center, size, rotation, density);
    return { position: center, rotation, size };
  }
  const vertices = [], lines = [];
  const attr = geo.getAttribute('position');
  for (let i = 0; i < attr.count; i++) {
    const v = new Vector3().fromBufferAttribute(attr, i).multiply(scale);
    lines.push('v ' + v.toArray().join(' '));
    vertices.push(v.applyQuaternion(rotation).add(point));
  }
  const count = geo.index?.count ?? attr.count;
  for (let i = 0; i < count; i += 3) {
    const [a,b,c] = [i, i+1, i+2].map(j => geo.index ? geo.index.getX(j) : j);
    lines.push('f ' + [a+1,b+1,c+1].join(' '));
    masses?.triangle(vertices[a], vertices[b], vertices[c], density);
  }
  const filename = 'meshes/part-' + (meshes.size + 1) + '.obj';
  meshes.set(filename, new TextEncoder().encode(lines.join('\n') + '\n'));
  return { position: point, rotation, filename };
}

function rectangleBounds(path) {
  const points = path.getPoints();
  const xs = [...new Set(points.map(p => p.x))].sort((a, b) => a - b);
  const ys = [...new Set(points.map(p => p.y))].sort((a, b) => a - b);
  const corners = new Set(points.map(p => p.x + ',' + p.y));
  const axisAligned = points.every((p, i) => {
    const next = points[(i + 1) % points.length];
    return p.x === next.x || p.y === next.y;
  });
  if (xs.length !== 2 || ys.length !== 2 || corners.size !== 4 || !axisAligned) {
    throw new Error('URDF aperture decomposition requires axis-aligned rectangles');
  }
  return [xs[0], xs[1], ys[0], ys[1]];
}

function collisionShapes(node, local, visual) {
  const geometry = node.geometry;
  const shapes = [].concat(geometry.parameters?.shapes ?? []);
  if (geometry.type !== 'ExtrudeGeometry' || !shapes.some(shape => shape.holes.length)) {
    return [[node.name, visual]];
  }
  if (shapes.length !== 1 || shapes[0].holes.length !== 1 || geometry.parameters.options.bevelEnabled !== false) {
    throw new Error(node.name + ': URDF aperture decomposition requires one unbeveled rectangular hole');
  }
  const [left, right, bottom, top] = rectangleBounds(shapes[0]);
  const [holeLeft, holeRight, holeBottom, holeTop] = rectangleBounds(shapes[0].holes[0]);
  if (!(left < holeLeft && holeLeft < holeRight && holeRight < right &&
        bottom < holeBottom && holeBottom < holeTop && holeTop < top)) {
    throw new Error(node.name + ': aperture must lie inside the face');
  }
  const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
  local.decompose(position, rotation, scale);
  geometry.computeBoundingBox();
  const minZ = geometry.boundingBox.min.z, maxZ = geometry.boundingBox.max.z;
  const panels = [
    ['above', left, right, holeTop, top],
    ['below', left, right, bottom, holeBottom],
    ['left', left, holeLeft, holeBottom, holeTop],
    ['right', holeRight, right, holeBottom, holeTop]
  ];
  return panels.map(([side, minX, maxX, minY, maxY]) => {
    const center = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2).applyMatrix4(local);
    const size = new Vector3(maxX - minX, maxY - minY, maxZ - minZ).multiply(scale);
    return [node.name + '_' + side, { position: center, rotation, size }];
  });
}

export function rigidModel(root) {
  root.updateWorldMatrix(true, true);
  const meshes = new Map();
  const joints = root.userData.joints;
  const links = new Map([[root, []]]);
  const names = new Set([root.name]);
  if (!root.name) throw new Error('URDF root requires a name');
  for (const { childPart } of joints) {
    const child = root.getObjectByName(childPart);
    if (!child || !childPart || names.has(childPart)) throw new Error('Invalid URDF child link: ' + childPart);
    names.add(childPart);
    links.set(child, []);
  }
  function owner(node) {
    while (node && !links.has(node)) node = node.parent;
    return node;
  }
  root.traverse(node => { if (node.isMesh) links.get(owner(node)).push(node); });
  const bodies = new Map();
  for (const [link, nodes] of links) {
    const parts = [];
    const masses = new MassProperties();
    const inverse = frame(link).invert();
    for (const node of nodes) {
      const local = inverse.clone().multiply(node.matrixWorld);
      const shape = meshShape(node, local, node.userData.visualOnly ? null : masses, meshes);
      const color = node.material.color.toArray().map(number).join(' ') + ' ' + number(node.material.opacity);
      const collisions = node.userData.visualOnly ? [] : collisionShapes(node, local, shape);
      parts.push({ name: node.name, local, shape, color, collisions });
    }
    bodies.set(link.name, { inertia: masses.finish(), parts });
  }
  const connections = [];
  for (const joint of joints) {
    const child = root.getObjectByName(joint.childPart), parent = owner(child.parent);
    const local = frame(parent).invert().multiply(frame(child));
    const position = new Vector3().setFromMatrixPosition(local), rotation = new Quaternion().setFromRotationMatrix(local);
    const axis = new Vector3(...joint.axis).transformDirection(basis);
    const [lower, upper] = joint.limits;
    const { damping = 1, friction = 0.05 } = joint.dynamics ?? {};
    const { effort = 150, velocity = joint.type === 'prismatic' ? 0.5 : 2 } = joint;
    if (![damping, friction].every(n => Number.isFinite(n) && n >= 0) ||
      ![effort, velocity].every(n => Number.isFinite(n) && n > 0)) throw new Error(joint.name + ': invalid joint dynamics or limit');
    connections.push({ joint, parent: parent.name, child: child.name, position, rotation, axis,
      lower, upper, effort, velocity, damping, friction });
  }
  return { bodies, connections, meshes };
}
