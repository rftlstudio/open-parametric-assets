import { jointAt, controlAt, pressed } from '../../../lib/state-predicates.js';
import { Box3, BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { resolveParams, seededRandom } from '../../../lib/parameters.js';
import { wearParameter, wearBand } from '../../../lib/furniture-finish.js';

import { markControl, dialScale } from '../../../lib/control-marks.js';

export const schema = {
  triangleLimit: 1800,
  parameters: {
    width: { type: 'number', min: 0.45, max: 0.60, default: 0.52, step: 0.01, unit: 'm', description: 'Outside case width.' },
    height: { type: 'number', min: 0.26, max: 0.35, default: 0.30, step: 0.01, unit: 'm', description: 'Outside case height.' },
    depth: { type: 'number', min: 0.33, max: 0.45, default: 0.39, step: 0.01, unit: 'm', description: 'Case depth excluding door and controls.' },
    controlStyle: { type: 'enum', default: 'physical', enum: ['physical', 'touch', 'mixed'], unit: 'none', description: 'Panel technology.' },
    controlLayout: { activeWhen: { controlStyle: 'physical' }, type: 'enum', default: 'dials', enum: ['dials', 'buttons'], unit: 'none', description: 'Two dials with start, or four push buttons.' },
    doorOpening: { type: 'enum', default: 'handle', enum: ['handle', 'release_button'], unit: 'none', description: 'Raised handle or release button with a recessed pull edge.' },
    finish: { type: 'enum', default: 'stainless', enum: ['stainless', 'black', 'white'],
      labels: { stainless: 'brushed stainless steel', black: 'black', white: 'white' }, unit: 'none', description: 'Enclosure finish.' },
    wear: wearParameter
  }
};

export function describe(params, random) {
  const p = resolveParams(schema, params);
  const features = p.controlStyle === 'touch' ? ['a touch keypad'] : p.controlStyle === 'mixed' ? ['a timer dial with touch buttons'] : p.controlLayout === 'dials' ? ['two dials', 'a start button'] : ['a button panel'];
  features.push(...(p.doorOpening === 'handle' ? ['a raised door handle'] : (p.controlStyle === 'mixed' ? ['a recessed pull edge'] : ['a door-release button', 'a recessed pull edge'])));
  const featureList = features.slice(0, -1).join(', ') + ' and ' + features.at(-1);
  const intro = random() < 0.5 ? 'A countertop microwave' : 'Build a countertop microwave';
  return intro + ' with a ' + schema.parameters.finish.labels[p.finish] + ' finish, ' + featureList +
    '. The case is ' + p.width.toFixed(2) + ' m wide, ' + p.height.toFixed(2) + ' m tall and ' + p.depth.toFixed(2) +
    ' m deep. It looks ' + wearBand(p.wear) + '.';
}

export function createAsset(params = {}, { seed = 0 } = {}) {
  const p = resolveParams(schema, params), random = seededRandom(seed);
  const { width, height, depth } = p;
  function material(color, density, options = {}) {
    const m = new MeshStandardMaterial({ color, ...options });
    m.userData.densityKgM3 = density;
    return m;
  }
  const shell = material({ stainless: '#a6adb2', black: '#24282b', white: '#eeeeea' }[p.finish],
    500, { metalness: p.finish === 'stainless' ? 0.7 : 0.1, roughness: 0.4 + 0.4 * p.wear });
  shell.color.lerp(new Color('#d3d1ca'), p.wear * random() * 0.06);
  const dark = material('#22262b', 1100, { roughness: 0.5 });
  const interior = material('#b4b8bb', 500, { metalness: 0.4, roughness: 0.5 });
  const glass = material('#477078', 2500, { transparent: true, opacity: 0.35, roughness: 0.12 });
  const mark = material('#ddddda', 1100);
  const root = new Group();
  root.name = 'microwave';
  const joints = [], affordances = [], controls = [];
  let massKg = 0;
  function group(parent, name, position) {
    const g = new Group();
    g.name = name;
    g.position.set(...position);
    parent.add(g);
    return g;
  }
  function box(parent, name, size, position, m = shell) {
    const mesh = new Mesh(new BoxGeometry(...size), m);
    mesh.name = name;
    mesh.position.set(...position);
    parent.add(mesh);
    massKg += size[0] * size[1] * size[2] * m.userData.densityKgM3;
    return mesh;
  }
  const wall = 0.012, front = depth / 2, panelWidth = width * 0.27;
  const split = width / 2 - panelWidth, cavityWidth = width - panelWidth - 2 * wall;
  const cavityCenter = -panelWidth / 2;
  const body = group(root, 'body', [0, 0, 0]);
  box(body, 'case_left', [wall, height - 2 * wall, depth], [-(width - wall) / 2, height / 2, 0]);
  box(body, 'case_right', [wall, height - 2 * wall, depth], [(width - wall) / 2, height / 2, 0]);
  box(body, 'case_top', [width, wall, depth], [0, height - wall / 2, 0]);
  box(body, 'cavity_floor', [width, wall, depth], [0, wall / 2, 0], interior);
  box(body, 'case_back', [width - 2 * wall, height - 2 * wall, wall], [0, height / 2, -front + wall / 2]);
  box(body, 'cavity_divider', [wall, height - 2 * wall, depth - wall], [split - wall / 2, height / 2, wall / 2], interior);
  const physical = p.controlStyle === 'physical';
  const panelFront = front - 0.001;
  const panel = box(body, physical ? 'control_panel' : 'touch_panel', [panelWidth - wall, height - 2 * wall, wall], [split + (panelWidth - wall) / 2, height / 2, panelFront - wall / 2], physical ? dark : material('#17242c', 2500, { roughness: 0.12 }));
  affordances.push({ type: 'placeable', part: 'cavity_floor', point: [cavityCenter, wall / 2, 0],
    normal: [0, 1, 0], size: [cavityWidth, depth - 2 * wall] });

  const doorWidth = width - panelWidth - 0.004, doorHeight = height - 0.008;
  const door = group(root, 'door', [-width / 2 + 0.002, height / 2, front + 0.022]);
  const windowWidth = doorWidth * 0.60, windowHeight = doorHeight * 0.55;
  const borderWidth = (doorWidth - windowWidth) / 2, borderHeight = (doorHeight - windowHeight) / 2;
  box(door, 'door_frame_left', [borderWidth, doorHeight, 0.018], [borderWidth / 2, 0, -0.009]);
  for (const [side, sign] of [['top', 1], ['bottom', -1]]) {
    box(door, 'door_frame_' + side, [windowWidth, borderHeight, 0.018],
      [doorWidth / 2, sign * (doorHeight - borderHeight) / 2, -0.009]);
  }
  box(door, 'door_window', [windowWidth, windowHeight, 0.004], [doorWidth / 2, 0, -0.009], glass);
  // Reserve the outer 18 mm for the handle edge or the open recessed pull channel.
  box(door, 'door_frame_right_inner', [borderWidth - 0.018, doorHeight, 0.018],
    [doorWidth - (borderWidth + 0.018) / 2, 0, -0.009]);
  if (p.doorOpening === 'handle') {
    box(door, 'door_frame_right', [0.018, doorHeight, 0.018], [doorWidth - 0.009, 0, -0.009]);
    for (const [end, y] of [['top', 0.043], ['bottom', -0.043]]) {
      box(door, 'door_handle_mount_' + end, [0.012, 0.012, 0.024], [doorWidth - 0.030, y, 0.012], dark);
    }
    box(door, 'door_handle', [0.012, 0.10, 0.012], [doorWidth - 0.030, 0, 0.030], dark);
    affordances.push({ type: 'grasp', grip: 'raised', part: 'door_handle', point: [0, 0, 0] });
  } else {
    const segmentHeight = (doorHeight - 0.08) / 2;
    for (const [end, sign] of [['top', 1], ['bottom', -1]]) {
      box(door, 'door_edge_' + end, [0.018, segmentHeight, 0.018],
        [doorWidth - 0.009, sign * (0.04 + segmentHeight / 2), -0.009]);
    }
    box(door, 'door_pull_back', [0.018, 0.08, 0.003], [doorWidth - 0.009, 0, -0.0165], dark);
    box(door, 'door_pull_edge', [0.006, 0.08, 0.004], [doorWidth - 0.003, 0, -0.002]);
    affordances.push({ type: 'grasp', grip: 'recessed', part: 'door_pull_edge', point: [-0.009, 0, -0.005] });
  }
  joints.push({ name: 'door_hinge', type: 'revolute', axis: [0, -1, 0], limits: [0, 1.75],
    childPart: door.name, clearance: { moving: door.name, stationary: ['body'] } });

  const controlX = panel.position.x;
  function button(fn, label, icon, y, size = [0.06, 0.022]) {
    const name = fn + '_button', part = name + '_cap', joint = name + '_slide';
    const moving = group(root, name, [controlX, y, panelFront + 0.0035]);
    box(moving, part, [size[0], size[1], 0.001], [0, 0, 0], shell);
    joints.push({ name: joint, type: 'prismatic', axis: [0, 0, -1], limits: [0, 0.003],
      childPart: name, dynamics: { damping: 1.5, friction: 0.005, spring: { stiffness: 300, restPosition: 0 } }, effort: 3, velocity: 0.04 });
    controls.push({ name, type: 'button', function: fn, label, icon, joint,
      region: { part, point: [0, 0, 0.0005], normal: [0, 0, 1], size: [size[0] * 0.7, size[1] * 0.7] },
      state: { kind: 'momentary', pressedAt: 0.6 } });
  }
  function knob(fn, y, values, unit) {
    const name = fn + '_knob', part = name + '_dial', joint = name + '_rotation';
    const moving = group(root, name, [controlX, y, front + 0.022]);
    const radius = 0.021, length = 0.016;
    const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 24).rotateX(Math.PI / 2), shell);
    mesh.name = part;
    moving.add(mesh);
    // Match the polygonal cylinder exported as OBJ.
    massKg += 12 * Math.sin(2 * Math.PI / 24) * radius * radius * length * shell.userData.densityKgM3;
    box(moving, name + '_indicator', [0.003, 0.006, 0.001], [0, 0.013, length / 2 + 0.0005], mark);
    const upper = 1.5 * Math.PI;
    joints.push({ name: joint, type: 'revolute', axis: [0, 0, -1], limits: [0, upper],
      childPart: name, dynamics: { damping: 0.04, friction: 0.02 }, effort: 0.3, velocity: 5 });
    controls.push({ name, type: 'knob', function: fn, label: fn === 'timer' ? 'TIMER' : 'POWER',
      icon: fn === 'timer' ? 'clock' : 'power', joint,
      region: { part, point: [0, 0, length / 2], normal: [0, 0, 1], size: [0.012, 0.012] },
      state: { kind: 'detent', positions: values.map((_, i) => upper * i / (values.length - 1)), values, unit } });
    dialScale(panel, controls.at(-1), joints.at(-1), [0,y-panel.position.y,wall/2],radius);
  }
  function touch(fn, label, icon, x, y, size, value) {
    const name = value === undefined ? fn : 'digit_' + value;
    controls.push({ name: name + '_touch', type: 'touch', function: fn, label, icon,
      ...(value === undefined ? {} : { value }),
      region: { part: panel.name, point: [x, y, wall/2], normal: [0, 0, 1], size },
      state: { kind: 'touch', minForceN: 1 } });
  }
  const actions = [['start','START','play'], ['stop','STOP','stop'], ['add_30s','+30 S','plus_30']];
  if (p.controlStyle === 'touch') {
    const keys = [1,2,3,4,5,6,7,8,9,0].map(n => ['digit', String(n), 'digit_' + n, n]);
    keys.push(...actions, ['door_release','OPEN','open']);
    const pitchX = (panelWidth - 0.018)/3, pitchY = (height - 0.05)/5;
    keys.forEach(([fn,label,icon,value], i) => touch(fn,label,icon,(i%3-1)*pitchX,
      (2-Math.floor(i/3))*pitchY,[pitchX-0.004,pitchY-0.004],value));
  } else if (p.controlStyle === 'mixed') {
    knob('timer', height * 0.78, Array.from({length:31}, (_,i) => i), 'min');
    actions.forEach(([fn,label,icon],i) => touch(fn,label,icon,0,height*(0.02-i*0.17),[panelWidth*0.68,height*0.13]));
  } else if (p.controlLayout === 'dials') {
    knob('timer', height * 0.73, Array.from({ length: 31 }, (_, i) => i), 'min');
    knob('power_level', height * 0.46, [20, 40, 60, 80, 100], '%');
    button('start', 'START', 'play', height * 0.20, [0.042, 0.014]);
    if (p.doorOpening === 'release_button') button('door_release', 'OPEN', 'open', height * 0.08, [0.042, 0.014]);
  } else {
    for (const [i, [fn, label, icon]] of [['start', 'START', 'play'], ['stop', 'STOP', 'stop'],
      ['add_30s', '+30 S', 'plus_30'], ['door_release', 'OPEN', 'open']].entries()) {
      button(fn, label, icon, height * (0.80 - i * 0.20));
    }
  }
  for (const control of controls) markControl(root.getObjectByName(control.region.part), control);
  // A lumped transformer/electronics assembly fills the enclosed side bay.
  const equipment = [panelWidth*0.65,height*0.55,depth*0.60];
  const targetMass = 11.5 + 2*(width-0.45)/0.15;
  const density = (targetMass-massKg)/equipment.reduce((a,b) => a*b,1);
  box(body,'electronics',equipment,[controlX,height/2,0],material('#34383c',density));
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root, true);
  root.userData = { id: 'appliances/microwave', category: 'appliances', version: '0.2.1',
    license: 'CC-BY-4.0', units: 'm', boundingBox: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    physics: { massKg, friction: 0.5, collision: 'compound' }, joints, affordances, controls };
  const doorJoint = joints.find(j => j.name === 'door_hinge');
  const timer = controls.find(c => c.function === 'timer');
  const hasTime = timer ? controlAt(timer, '>', 0) : { any: controls
    .filter(c => c.function === 'add_30s' || (c.function === 'digit' && c.value > 0)).map(pressed) };
  root.userData.states = {
    door_open: jointAt(doorJoint, '>', 0.8),
    start_pressed: pressed(controls.find(c => c.function === 'start')),
    running: { all: [jointAt(doorJoint, '<', 0.05), hasTime, { state: 'start_pressed' }] }
  };
  return root;
}
