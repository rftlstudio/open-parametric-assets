import { BoxGeometry, Group, Mesh, Vector3 } from 'three';
import { DOMParser } from '@xmldom/xmldom';
import { expect, it } from 'vitest';
import * as microwave from '../assets/appliances/microwave/index.js';
import { validateAsset } from '../validator/validate.js';
import { checkControls } from '../validator/controls.js';
import { inspect } from '../validator/geometry.js';
import { exportURDF } from '../scripts/export-urdf.js';

it('validates the microwave default and 20 seeded samples and rejects invalid inputs', () => {
  expect(validateAsset(microwave, 'appliances/microwave').cases).toBe(21);
  for (const params of [{ width: 0.451 }, { height: 0.25 }, { depth: 0.46 }, { wear: 0.03 },
    { controlStyle: 'touch', controlLayout:'buttons' }, { controlStyle: 'mixed', controlLayout:'buttons' }, { doorOpening: 'hinge' }, { unexpected: 1 }]) {
    expect(() => microwave.createAsset(params)).toThrow();
  }
});

it.each(['dials', 'buttons'])('exports functional %s controls for both opening styles', controlLayout => {
  for (const doorOpening of ['handle', 'release_button']) {
    const root = microwave.createAsset({ controlLayout, doorOpening }, { seed: 42 });
    const controlTypes = root.userData.controls.map(c => c.type);
    expect(controlTypes.filter(t => t === 'knob')).toHaveLength(controlLayout === 'dials' ? 2 : 0);
    expect(root.userData.controls.find(c => c.function === 'door_release') !== undefined)
      .toBe(controlLayout === 'buttons' || doorOpening === 'release_button');
    const grasp = root.userData.affordances.find(a => a.type === 'grasp');
    expect(grasp.grip).toBe(doorOpening === 'handle' ? 'raised' : 'recessed');
    const door = root.getObjectByName('door');
    const closed = root.getObjectByName(grasp.part).localToWorld(new Vector3(...grasp.point));
    door.rotateOnAxis(new Vector3(0, -1, 0), 0.5);
    expect(root.getObjectByName(grasp.part).localToWorld(new Vector3(...grasp.point)).z).toBeGreaterThan(closed.z);
    door.rotation.set(0, 0, 0);
    const urdf = exportURDF(root);
    expect(urdf.urdf).toContain('type="prismatic"');
    expect(urdf.urdf).toContain('name="door_hinge"');
    expect(urdf.urdf).toContain('visual_start_button_mark');
    expect(urdf.urdf).not.toContain('collision name="start_button_mark"');
    for (const button of root.userData.controls.filter(c => c.type === 'button')) {
      const joint = root.userData.joints.find(j => j.name === button.joint);
      const part = root.getObjectByName(button.region.part);
      const initial = part.localToWorld(new Vector3(...button.region.point));
      root.getObjectByName(joint.childPart).translateOnAxis(new Vector3(...joint.axis), joint.limits[1]);
      const pressed = part.localToWorld(new Vector3(...button.region.point));
      expect(initial.z - pressed.z).toBeCloseTo(0.003, 9);
    }
    const floor = root.getObjectByName('cavity_floor');
    const place = root.userData.affordances.find(a => a.type === 'placeable');
    expect(place.point[1]).toBeCloseTo(floor.geometry.parameters.height / 2);
    expect(root.getObjectByName('door_window').material.transparent).toBe(true);
  }
});

it('describes every layout, finish and opening style deterministically with exact dimensions', () => {
  for (const controlLayout of ['dials', 'buttons']) for (const doorOpening of ['handle', 'release_button']) {
    for (const finish of ['stainless', 'black', 'white']) {
      const params = { width: 0.47, height: 0.29, depth: 0.41, finish, doorOpening, controlLayout, wear: 0.35 };
      for (const n of [0.1, 0.9]) {
        const text = microwave.describe(params, () => n);
        expect(microwave.describe(params, () => n)).toBe(text);
        expect(text).toContain('0.47 m wide, 0.29 m tall and 0.41 m deep');
        expect(text).toContain(microwave.schema.parameters.finish.labels[finish]);
        expect(text).toContain(controlLayout === 'dials' ? 'two dials, a start button' : 'a button panel');
        expect(text).toContain(doorOpening === 'handle' ? 'raised door handle' : 'door-release button and a recessed pull edge');
        expect(text).toContain('looks worn.');
        expect(text).not.toContain('0.35');
        const features = {
          'dials/handle': 'two dials, a start button and a raised door handle',
          'dials/release_button': 'two dials, a start button, a door-release button and a recessed pull edge',
          'buttons/handle': 'a button panel and a raised door handle',
          'buttons/release_button': 'a button panel, a door-release button and a recessed pull edge'
        };
        expect(text).toContain(features[controlLayout + '/' + doorOpening] + '.');
      }
    }
  }
});

it('turns both knob indicators clockwise from the front for positive joint positions', () => {
  const root = microwave.createAsset();
  for (const control of root.userData.controls.filter(c => c.type === 'knob')) {
    const joint = root.userData.joints.find(j => j.name === control.joint);
    const part = root.getObjectByName(joint.childPart);
    const indicator = root.getObjectByName(control.name + '_indicator');
    const before = indicator.getWorldPosition(new Vector3());
    expect(joint.axis).toEqual([0, 0, -1]);
    part.rotateOnAxis(new Vector3(...joint.axis), Math.PI / 2);
    const after = indicator.getWorldPosition(new Vector3());
    expect(after.x - before.x).toBeCloseTo(0.013, 9);
    expect(after.y - before.y).toBeCloseTo(-0.013, 9);
  }
});

it('surrounds a centered inset glass box with opaque panels in the shell finish', () => {
  for (const finish of ['stainless', 'black', 'white']) for (const doorOpening of ['handle', 'release_button']) {
    const root = microwave.createAsset({ finish, doorOpening });
    const window = root.getObjectByName('door_window');
    const left = root.getObjectByName('door_frame_left');
    const top = root.getObjectByName('door_frame_top');
    const bottom = root.getObjectByName('door_frame_bottom');
    const right = root.getObjectByName('door_frame_right_inner');
    const doorWidth = 0.52 * 0.73 - 0.004, doorHeight = 0.30 - 0.008;
    expect(window.geometry.parameters.width).toBeCloseTo(doorWidth * 0.60, 9);
    expect(window.geometry.parameters.height).toBeCloseTo(doorHeight * 0.55, 9);
    expect(window.position.x).toBeCloseTo(doorWidth / 2, 9);
    expect(window.position.y).toBe(0);
    for (const panel of [left, top, bottom, right]) {
      expect(panel.material).toBe(root.getObjectByName('case_top').material);
      expect(panel.material.transparent).toBe(false);
      expect(panel.material.opacity).toBe(1);
    }
    expect(left.position.x + left.geometry.parameters.width / 2)
      .toBeCloseTo(window.position.x - window.geometry.parameters.width / 2, 9);
    expect(right.position.x - right.geometry.parameters.width / 2)
      .toBeCloseTo(window.position.x + window.geometry.parameters.width / 2, 9);
    expect(top.position.y - top.geometry.parameters.height / 2).toBeCloseTo(window.geometry.parameters.height / 2, 9);
    expect(bottom.position.y + bottom.geometry.parameters.height / 2).toBeCloseTo(-window.geometry.parameters.height / 2, 9);
    expect(window.position.z + window.geometry.parameters.depth / 2)
      .toBeLessThan(top.position.z + top.geometry.parameters.depth / 2);
    const xml = new DOMParser().parseFromString(exportURDF(root).urdf, 'text/xml');
    const visual = Array.from(xml.getElementsByTagName('visual')).find(e => e.getAttribute('name') === 'visual_door_window');
    const collision = Array.from(xml.getElementsByTagName('collision')).find(e => e.getAttribute('name') === 'door_window');
    for (const tag of ['origin', 'geometry']) {
      expect(collision.getElementsByTagName(tag)[0].toString()).toBe(visual.getElementsByTagName(tag)[0].toString());
    }
    const dimensions = collision.getElementsByTagName('box')[0].getAttribute('size').split(' ').map(Number);
    for (const [i, size] of [window.geometry.parameters.width, window.geometry.parameters.height, 0.004].entries()) {
      expect(dimensions[i]).toBeCloseTo(size, 7);
    }
  }
});

it('declares minute timer detents and five power levels within 270 degrees', () => {
  const { controls } = microwave.createAsset().userData;
  const timer = controls.find(c => c.function === 'timer').state;
  expect(timer.values).toEqual(Array.from({ length: 31 }, (_, i) => i));
  expect(timer.unit).toBe('min');
  expect(timer.positions.at(-1)).toBeCloseTo(1.5 * Math.PI);
  expect(controls.find(c => c.function === 'power_level').state.values).toEqual([20,40,60,80,100]);
});

it.each([
  ['missing joint', (r, c) => { c.joint = 'missing'; }],
  ['joint type mismatch', (r, c) => { r.userData.joints.find(j => j.name === c.joint).type = 'revolute'; }],
  ['unknown function', (r, c) => { c.function = 'cook_anything'; }],
  ['unknown icon', (r, c) => { c.icon = 'microwave'; }],
  ['region off outer surface', (r, c) => { c.region.point[2] += 0.002; }],
  ['region off outer surface', (r, c) => { c.region.size = [1, 1]; }],
  ['invalid momentary', (r, c) => { c.state.pressedAt = 1.01; }],
  ['invalid spring', (r, c) => { r.userData.joints.find(j => j.name === c.joint).dynamics.spring.stiffness = -1; }],
  ['axis must point into', (r, c) => { r.userData.joints.find(j => j.name === c.joint).axis = [0, 0, 1]; }],
  ['travel', (r, c) => { r.userData.joints.find(j => j.name === c.joint).limits[1] = 0.005; }],
  ['contain region.part', (r, c) => { r.userData.joints.find(j => j.name === c.joint).childPart = 'door'; }]
])('rejects invalid control metadata: %s', (message, mutate) => {
  const root = microwave.createAsset();
  mutate(root, root.userData.controls.find(c => c.type === 'button'));
  expect(() => checkControls(root)).toThrow(message);
});

it('rejects out-of-range and unordered detents and mismatched values', () => {
  for (const mutate of [s => { s.positions[1] = -1; }, s => { s.positions[1] = 10; },
    s => { s.positions[1] = s.positions[0]; }, s => { s.values.pop(); }]) {
    const root = microwave.createAsset();
    mutate(root.userData.controls[0].state);
    expect(() => checkControls(root)).toThrow(/detent/);
  }
});

it('validates a synthetic touch asset and rejects joints and invalid force thresholds', () => {
  const root = new Group(), part = new Mesh(new BoxGeometry(0.1, 0.1, 0.02));
  part.name = 'touch_surface';
  root.add(part);
  const control = { name: 'touch_start', type: 'touch', function: 'start', label: null, icon: 'play',
    region: { part: part.name, point: [0, 0, 0.01], normal: [0,0,1], size: [0.04,0.04] },
    state: { kind: 'touch', minForceN: 1 } };
  root.userData = { id: 'test/touch', category: 'test', version: '0.1.0', units: 'm', license: 'CC-BY-4.0',
    physics: { massKg: 0.1, friction: 0.5, collision: 'box' }, joints: [], affordances: [], controls: [control],
    boundingBox: { min: [-0.05,-0.05,-0.01], max: [0.05,0.05,0.01] } };
  expect(() => inspect(root, 'test/touch', 20)).not.toThrow();
  control.joint = 'anything';
  expect(() => checkControls(root)).toThrow(/must not have a joint/);
  delete control.joint;
  control.state.minForceN = -1;
  expect(() => checkControls(root)).toThrow(/touch state/);
});

it('requires explicit grip semantics on every grasp affordance', () => {
  const root = microwave.createAsset();
  delete root.userData.affordances.find(a => a.type === 'grasp').grip;
  expect(() => inspect(root, 'appliances/microwave', 1800)).toThrow(/grasp grip/);
});

it('keeps total and exported mass in range across dimension extremes and panel styles', () => {
  for (const width of [0.45,0.60]) for (const height of [0.26,0.35]) for (const depth of [0.33,0.45]) {
    for (const controlStyle of ['physical','touch','mixed']) {
      const root = microwave.createAsset({ width, height, depth, controlStyle });
      const doc = new DOMParser().parseFromString(exportURDF(root).urdf,'text/xml');
      const mass = [...doc.getElementsByTagName('mass')].reduce((m,el) => m+Number(el.getAttribute('value')),0);
      expect(mass).toBeGreaterThanOrEqual(11);
      expect(mass).toBeLessThanOrEqual(14);
      expect(mass).toBeCloseTo(root.userData.physics.massKg,4);
      expect(root.getObjectByName('electronics').material.userData.densityKgM3).toBeGreaterThan(0);
    }
  }
});

it('maps keypad digits, rejects overlapping regions and enforces physical interaction targets', () => {
  const root = microwave.createAsset({ controlStyle:'touch' });
  const digits = root.userData.controls.filter(c => c.function === 'digit');
  expect(digits.map(c => c.value).sort()).toEqual([0,1,2,3,4,5,6,7,8,9]);
  for (const c of root.userData.controls) {
    const mark = root.getObjectByName(c.name+'_mark');
    expect(mark.userData.visualOnly).toBe(true);
    expect(mark.position.z-c.region.point[2]).toBeCloseTo(0.0003,9);
  }
  digits[0].value = 10;
  expect(() => checkControls(root)).toThrow(/digit value/);
  digits[0].value = 1;
  const panel = root.getObjectByName('touch_panel');
  panel.userData.visualOnly = true;
  expect(() => checkControls(root)).toThrow(/visualOnly/);
  panel.userData.visualOnly = false;
  digits[1].region.point[0] = digits[0].region.point[0]+digits[0].region.size[0]+0.0019;
  expect(() => checkControls(root)).toThrow(/2 mm gap/);
  digits[1].region.point[0] += 0.0001;
  expect(() => checkControls(root)).not.toThrow();
  root.userData.affordances[0].part = digits[0].name+'_mark';
  expect(() => inspect(root,'appliances/microwave',1800)).toThrow(/visualOnly/);
});

it('recesses the panel 1 mm and leaves 1 mm of cap clearance at full travel', () => {
  const root = microwave.createAsset();
  const frontFace = mesh => mesh.getWorldPosition(new Vector3()).z + mesh.geometry.parameters.depth/2;
  const panel = frontFace(root.getObjectByName('control_panel'));
  expect(frontFace(root.getObjectByName('case_right'))-panel).toBeCloseTo(0.001,9);
  const cap = root.getObjectByName('start_button_cap');
  expect(frontFace(cap)-panel).toBeCloseTo(0.004,9);
  root.getObjectByName('start_button').translateZ(-0.003);
  expect(frontFace(cap)-panel).toBeCloseTo(0.001,9);
});
