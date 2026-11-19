import { rigidModel, number, vec, escape, rpy } from './rigid-model.js';

const xyz = p => '<origin xyz="' + vec(p) + '"';
function pose(position, rotation) {
  return xyz(position) + ' rpy="' + rpy(rotation) + '"/>';
}

function geometry(shape) {
  const primitive = shape.size ? '<box size="' + vec(shape.size) + '"/>' : '<mesh filename="' + shape.filename + '"/>';
  return pose(shape.position, shape.rotation) + '<geometry>' + primitive + '</geometry>';
}

export function exportURDF(root) {
  const { bodies, connections, meshes } = rigidModel(root);
  const lines = ['<?xml version="1.0"?>', '<robot name="' + escape(root.name) + '">',
    '  <mujoco><compiler fusestatic="false" strippath="true" meshdir="meshes" discardvisual="true"/></mujoco>'];
  for (const [name, { parts, inertia: m }] of bodies) {
    lines.push('  <link name="' + escape(name) + '">');
    for (const {name,shape,color,collisions} of parts) {
      lines.push('    <visual name="visual_' + escape(name) + '">' + geometry(shape) +
        '<material name="material_' + escape(name) + '"><color rgba="' + color + '"/></material></visual>');
      for (const [name,shape] of collisions) {
        lines.push('    <collision name="' + escape(name) + '">' + geometry(shape) + '</collision>');
      }
    }
    const inertia = ['ixx','ixy','ixz','iyy','iyz','izz'].map(k => k + '="' + number(m[k]) + '"').join(' ');
    lines.push('    <inertial>' + xyz(m.center) + '/><mass value="' + number(m.mass) + '"/><inertia ' + inertia + '/></inertial>', '  </link>');
  }
  for (const {joint,parent,child,position,rotation,axis,lower,upper,effort,velocity,damping,friction} of connections) {
    lines.push('  <joint name="' + escape(joint.name) + '" type="' + joint.type + '">',
      '    <parent link="' + escape(parent) + '"/><child link="' + escape(child) + '"/>',
      '    ' + pose(position,rotation) + '<axis xyz="' + vec(axis) + '"/>',
      '    <limit lower="' + number(lower) + '" upper="' + number(upper) + '" effort="' + number(effort) + '" velocity="' + number(velocity) + '"/>',
      '    <dynamics damping="' + number(damping) + '" friction="' + number(friction) + '"/>', '  </joint>');
  }
  return { urdf: [...lines, '</robot>', ''].join('\n'), meshes };
}
