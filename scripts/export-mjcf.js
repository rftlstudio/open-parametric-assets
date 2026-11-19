import { Matrix4, Quaternion, Vector3 } from 'three';
import { rigidModel, vec, number, escape, rpy } from './rigid-model.js';

const list = values => values.map(number).join(' ');
const quat = q => list([q.w,q.x,q.y,q.z]);
const pose = ({position,rotation}) => 'pos="' + vec(position) + '" euler="' + rpy(rotation) + '"';

function geom(shape) {
  // URDF rounds full box lengths before MuJoCo halves them. Preserve this
  // order even at nominally touching surfaces to match passive contact forces.
  const type = shape.size ? 'type="box" size="' + shape.size.toArray().map(v => Number(number(v))/2).join(' ') + '"'
    : 'type="mesh" mesh="' + shape.filename + '"';
  return type + ' ' + pose(shape);
}

function site(name, region, local) {
  const center = new Vector3(...region.point).applyMatrix4(local);
  const start = '<site name="' + escape(name) + '" pos="' + vec(center) + '" ';
  if (!region.normal) return start + 'type="sphere" size="0.001" group="4"/>';
  const n = new Vector3(...region.normal);
  const u = new Vector3(...(Math.abs(n.x)<0.9 ? [1,0,0] : [0,1,0])).projectOnPlane(n).normalize();
  const v = n.clone().cross(u);
  const transform = new Matrix4().extractRotation(local);
  const rotation = new Quaternion().setFromRotationMatrix(transform.multiply(new Matrix4().makeBasis(u,v,n)));
  return start + 'quat="' + quat(rotation) + '" type="box" size="' +
    list([region.size[0]/2, region.size[1]/2, 0.001]) + '" group="4"/>';
}

export function exportMJCF(root, record) {
  const { bodies, connections, meshes } = rigidModel(root);
  const {id,asset_id,asset_version,seed,joints,affordances,controls,states,tasks} = record;
  const metadata = {id,asset_id,asset_version,seed,joints,affordances,controls,states,tasks};
  const lines = ['<mujoco model="' + escape(root.name) + '">',
    '<compiler angle="radian" eulerseq="XYZ" inertiafromgeom="auto" fusestatic="false"/>',
    '<option timestep="0.002" integrator="implicitfast"/>',
    '<custom><text name="opa_metadata" data="' + escape(JSON.stringify(metadata)) + '"/></custom>',
    '<asset>'];
  const sites = new Map();
  function add(part, name, region) {
    if (!sites.has(part)) sites.set(part, []);
    sites.get(part).push({name,region});
  }
  for (const a of affordances) add(a.part,(a.type === 'grasp' ? 'grasp_' : 'place_') + a.part,a);
  for (const c of controls) add(c.region.part,'control_' + c.name,c.region);
  const solid = new Set();
  for (const {parts} of bodies.values()) {
    for (const part of parts) {
      for (const [, shape] of part.collisions) if (shape.filename) solid.add(shape.filename);
    }
  }
  for (const path of meshes.keys()) lines.push('<mesh name="' + path + '" file="' + path + '"' +
    (solid.has(path) ? '' : ' inertia="shell"') + '/>');
  lines.push('</asset>', '<worldbody>');
  function body(name, parentJoint) {
    const {inertia,parts} = bodies.get(name);
    lines.push('<body name="' + escape(name) + '"' + (parentJoint ? ' '+pose(parentJoint) : '') + '>');
    lines.push('<inertial pos="' + vec(inertia.center) + '" mass="' + number(inertia.mass) +
      '" fullinertia="' + list(['ixx','iyy','izz','ixy','ixz','iyz'].map(k => inertia[k])) + '"/>');
    if (parentJoint) {
      const {joint,axis,lower,upper,damping,friction} = parentJoint;
      const spring = joint.dynamics?.spring;
      lines.push('<joint name="' + escape(joint.name) + '" type="' + (joint.type === 'prismatic' ? 'slide' : 'hinge') +
        '" axis="' + vec(axis) + '" range="' + list([lower,upper]) + '" limited="true" damping="' + number(damping) +
        '" frictionloss="' + number(friction) + '" stiffness="' + number(spring?.stiffness ?? 0) +
        '" springref="' + number(spring?.restPosition ?? 0) + '" armature="0"' +
        (joint.behavior === 'balanced_door' ? ' solreflimit="0.02 1" solimplimit="0.9 0.95 0.001 0.5 2"' : '') + '/>');
    }
    for (const {name,local,shape,color,collisions} of parts) {
      for (const [part,collision] of collisions) {
        lines.push('<geom name="' + escape(part) + '" ' + geom(collision) + ' group="3"/>');
      }
      lines.push('<geom name="visual_' + escape(name) + '" ' + geom(shape) +
        ' group="2" contype="0" conaffinity="0" mass="0" rgba="' + color + '"/>');
      for (const entry of sites.get(name) ?? []) lines.push(site(entry.name,entry.region,local));
    }
    for (const connection of connections) if (connection.parent === name) body(connection.child,connection);
    lines.push('</body>');
  }
  body(root.name);
  lines.push('</worldbody>','<sensor>');
  for (const c of controls) {
    if (c.type === 'touch') lines.push('<touch name="' + escape(c.name) + '" site="control_' + escape(c.name) + '"/>');
    else lines.push('<jointpos name="' + escape(c.name) + '" joint="' + escape(c.joint) + '"/>');
  }
  return { mjcf: [...lines,'</sensor>','</mujoco>',''].join('\n'), meshes };
}
