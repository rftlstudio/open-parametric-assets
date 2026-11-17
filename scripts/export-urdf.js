import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { MassProperties } from './urdf-inertia.js';

const basis = new Matrix4().makeRotationX(Math.PI / 2);
const inverseBasis = basis.clone().invert();
const vec = v => v.toArray().join(' ');
const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const xyz = p => '<origin xyz="' + vec(p) + '"';
function pose(position, rotation) {
  const e = new Euler().setFromQuaternion(rotation, 'ZYX');
  return xyz(position) + ' rpy="' + [e.x, e.y, e.z].join(' ') + '"/>';
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
  if (!(Number.isFinite(density) && density > 0)) throw new Error(node.name + ': missing positive material densityKgM3');
  const geo = node.geometry;
  if (geo.type === 'BoxGeometry') {
    geo.computeBoundingBox();
    const size = geo.boundingBox.getSize(new Vector3()).multiply(scale);
    const center = geo.boundingBox.getCenter(new Vector3()).applyMatrix4(local);
    masses.box(center, size, rotation, density);
    return pose(center, rotation) + '<geometry><box size="' + vec(size) + '"/></geometry>';
  }
  const vertices = [], lines = [];
  const attr = geo.getAttribute('position');
  for (let i = 0; i < attr.count; i++) {
    const v = new Vector3().fromBufferAttribute(attr, i).multiply(scale);
    lines.push('v ' + vec(v));
    vertices.push(v.applyQuaternion(rotation).add(point));
  }
  const count = geo.index?.count ?? attr.count;
  for (let i = 0; i < count; i += 3) {
    const [a,b,c] = [i, i+1, i+2].map(j => geo.index ? geo.index.getX(j) : j);
    lines.push('f ' + [a+1,b+1,c+1].join(' '));
    masses.triangle(vertices[a], vertices[b], vertices[c], density);
  }
  const filename = 'meshes/part-' + (meshes.size + 1) + '.obj';
  meshes.set(filename, new TextEncoder().encode(lines.join('\n') + '\n'));
  return pose(point, rotation) + '<geometry><mesh filename="' + filename + '"/></geometry>';
}

export function exportURDF(root) {
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
  const lines = ['<?xml version="1.0"?>', '<robot name="' + escape(root.name) + '">',
    '  <mujoco><compiler fusestatic="false" strippath="true" meshdir="meshes" discardvisual="true"/></mujoco>'];
  for (const [link, nodes] of links) {
    lines.push('  <link name="' + escape(link.name) + '">');
    const masses = new MassProperties();
    const inverse = frame(link).invert();
    for (const node of nodes) {
      const shape = meshShape(node, inverse.clone().multiply(node.matrixWorld), masses, meshes);
      const color = node.material.color.toArray().join(' ') + ' ' + node.material.opacity;
      lines.push('    <visual name="visual_' + escape(node.name) + '">' + shape +
        '<material name="material_' + escape(node.name) + '"><color rgba="' + color + '"/></material></visual>',
        '    <collision name="' + escape(node.name) + '">' + shape + '</collision>');
    }
    const m = masses.finish();
    const inertia = ['ixx','ixy','ixz','iyy','iyz','izz'].map(k => k + '="' + m[k] + '"').join(' ');
    lines.push('    <inertial>' + xyz(m.center) + '/><mass value="' + m.mass + '"/><inertia ' + inertia + '/></inertial>', '  </link>');
  }
  for (const joint of joints) {
    const child = root.getObjectByName(joint.childPart), parent = owner(child.parent);
    const local = frame(parent).invert().multiply(frame(child));
    const origin = pose(new Vector3().setFromMatrixPosition(local), new Quaternion().setFromRotationMatrix(local));
    const axis = new Vector3(...joint.axis).transformDirection(basis);
    const [lower, upper] = joint.limits;
    const { damping = 1, friction = 0.05 } = joint.dynamics ?? {};
    const { effort = 150, velocity = joint.type === 'prismatic' ? 0.5 : 2 } = joint;
    if (![damping, friction].every(n => Number.isFinite(n) && n >= 0) ||
      ![effort, velocity].every(n => Number.isFinite(n) && n > 0)) throw new Error(joint.name + ': invalid joint dynamics or limit');
    lines.push('  <joint name="' + escape(joint.name) + '" type="' + joint.type + '">',
      '    <parent link="' + escape(parent.name) + '"/><child link="' + escape(child.name) + '"/>',
      '    ' + origin + '<axis xyz="' + vec(axis) + '"/>',
      '    <limit lower="' + lower + '" upper="' + upper + '" effort="' + effort + '" velocity="' + velocity + '"/>',
      '    <dynamics damping="' + damping + '" friction="' + friction + '"/>', '  </joint>');
  }
  return { urdf: [...lines, '</robot>', ''].join('\n'), meshes };
}
