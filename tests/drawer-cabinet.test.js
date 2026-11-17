import { Box3, Raycaster, Vector3 } from 'three';
import { expect, it } from 'vitest';
import * as drawers from '../assets/furniture/drawer_cabinet/index.js';
import { resolveParams, seededRandom } from '../lib/parameters.js';
import { validateAsset } from '../validator/validate.js';

const id = 'furniture/drawer_cabinet';
const bounds = part => new Box3().setFromObject(part, true);

it('validates defaults and 20 deterministic drawer configurations', () => {
  expect(validateAsset(drawers, id).cases).toBe(21);
  for (const params of [{ width: 0.351 }, { drawerCount: 0 }, { drawerCount: 7 }, { handleStyle: 'loop' }, { wear: 0.03 }]) {
    expect(() => drawers.createAsset(params)).toThrow(/Invalid parameter/);
  }
});

it.each(['bar', 'knob', 'recessed'])('moves every %s pull out by the declared travel and retains 20% of each tray', handleStyle => {
  const root = drawers.createAsset({ width: 0.35, height: 0.55, depth: 0.40, drawerCount: 6, handleStyle });
  const joints = root.userData.joints;
  expect(joints).toHaveLength(6);
  expect(root.userData.affordances.filter(a => a.type === 'grasp')).toHaveLength(6);
  for (const joint of joints) {
    expect(joint.type).toBe('prismatic');
    expect(joint.axis).toEqual([0, 0, 1]);
    const drawer = root.getObjectByName(joint.childPart);
    const tray = drawer.getObjectByName(joint.drawerBox);
    const fullDepth = bounds(tray).getSize(new Vector3()).z;
    expect(joint.limits[0]).toBe(0);
    expect(joint.limits[1]).toBeCloseTo(0.8 * fullDepth, 7);
    const grasp = root.userData.affordances.find(a => a.type === 'grasp' && drawer.getObjectByName(a.part));
    const grip = drawer.getObjectByName(grasp.part);
    const closed = grip.localToWorld(new Vector3(...grasp.point));
    if (handleStyle === 'recessed') {
      const front = grip.parent;
      const lip = bounds(grip);
      const cup = bounds(drawer.getObjectByName(drawer.name + '_cup_back'));
      expect(closed.z).toBeGreaterThan(cup.max.z);
      expect(closed.z).toBeLessThan(lip.min.z);
      expect(Math.abs(closed.x - lip.getCenter(new Vector3()).x)).toBeLessThan(0.06);
      const ray = new Raycaster(closed.clone().add(new Vector3(0, 0, 0.1)), new Vector3(0, 0, -1));
      const [firstHit] = ray.intersectObject(front, true);
      expect(firstHit.object.name).toBe(drawer.name + '_cup_back');
      expect(firstHit.point.z).toBeLessThan(closed.z);
    }
    drawer.translateOnAxis(new Vector3(...joint.axis), joint.limits[1]);
    const delta = grip.localToWorld(new Vector3(...grasp.point)).sub(closed);
    expect(delta.x).toBeCloseTo(0, 8);
    expect(delta.y).toBeCloseTo(0, 8);
    expect(delta.z).toBeCloseTo(joint.limits[1], 8);
    const extended = bounds(tray);
    for (const name of joint.caseSides) {
      const side = bounds(root.getObjectByName(name));
      expect(extended.intersectsBox(side)).toBe(false);
      expect(side.max.z - extended.min.z).toBeCloseTo(0.2 * fullDepth, 7);
    }
  }
});

it('locates the case top and clear floor area of every drawer', () => {
  const root = drawers.createAsset({ drawerCount: 3 });
  const surfaces = root.userData.affordances.filter(a => a.type === 'placeable');
  expect(surfaces.map(a => a.part).sort()).toEqual(['case_top', 'drawer_1_bottom', 'drawer_2_bottom', 'drawer_3_bottom']);
  for (const a of surfaces) {
    const part = root.getObjectByName(a.part);
    const surface = part.localToWorld(new Vector3(...a.point));
    const floor = bounds(part);
    expect(surface.y).toBeCloseTo(floor.max.y, 7);
    expect(a.normal).toEqual([0, 1, 0]);
    const left = surface.x - a.size[0] / 2, right = surface.x + a.size[0] / 2;
    const rear = surface.z - a.size[1] / 2;
    if (a.part === 'case_top') {
      expect(left).toBeCloseTo(floor.min.x, 7);
      expect(right).toBeCloseTo(floor.max.x, 7);
      expect(rear).toBeCloseTo(floor.min.z, 7);
    } else {
      const prefix = a.part.slice(0, -'_bottom'.length);
      expect(left).toBeCloseTo(bounds(root.getObjectByName(prefix + '_left')).max.x, 7);
      expect(right).toBeCloseTo(bounds(root.getObjectByName(prefix + '_right')).min.x, 7);
      expect(rear).toBeCloseTo(bounds(root.getObjectByName(prefix + '_back')).max.z, 7);
    }
    expect(surface.z + a.size[1] / 2).toBeCloseTo(floor.max.z, 7);
  }
});

it('allows 1 mm side overlap and rejects larger overlaps or insufficient engagement', () => {
  function check(offset, extraTravel) {
    const createAsset = (params, options) => {
      const root = drawers.createAsset(params, options);
      const joint = root.userData.joints[0];
      root.getObjectByName(joint.drawerBox).position.x += offset;
      joint.limits[1] += extraTravel;
      return root;
    };
    return validateAsset({ ...drawers, createAsset }, id, { params: {}, seed: 123 });
  }
  // Resting clearance is 6 mm. Moving the tray sideways leaves the case AABB unchanged.
  expect(check(0.007, 0).root.getObjectByName('drawer_1').position.z).toBeCloseTo(0.55 / 2, 9);
  expect(() => check(0.008, 0)).toThrow(/intersects case_right/);
  expect(() => check(-0.008, 0)).toThrow(/intersects case_left/);
  expect(() => check(0, 0.002)).toThrow(/less than 20% retained/);
});

it('recovers every parameter from both natural-language drawer templates', () => {
  const counts = ['one', 'two', 'three', 'four', 'five', 'six'];
  const palette = drawers.schema.parameters.color.labels;
  for (let i = 0; i < 6; i++) {
    for (const handleStyle of ['bar', 'knob', 'recessed']) {
      const params = resolveParams(drawers.schema, { drawerCount: i + 1, handleStyle, width: 0.35,
        height: 0.87, depth: 0.61, color: Object.keys(palette)[i % 3], wear: [0, 0.05, 0.3, 0.65, 0.75, 1][i] });
      for (const variant of [0.1, 0.9]) {
        const text = drawers.describe(params, () => variant);
        const [, n, style] = text.match(/(\w+)-drawer chest with (?:a )?(bar|knob|recessed) (?:handle|pull)s?\./);
        const [, width, height, depth] = text.match(/(\d\.\d{2}) m wide, (\d\.\d{2}) m tall and (\d\.\d{2}) m deep/);
        const [, label] = text.match(/The ([^.]+) finish looks/);
        const [, wear] = text.match(/\(wear (\d\.\d{2})\)/);
        expect({ width: +width, height: +height, depth: +depth, drawerCount: counts.indexOf(n) + 1, handleStyle: style,
          color: Object.keys(palette).find(hex => palette[hex] === label), wear: +wear }).toEqual(params);
      }
      expect(drawers.describe(params, seededRandom(42))).toBe(drawers.describe(params, seededRandom(42)));
    }
  }
});
