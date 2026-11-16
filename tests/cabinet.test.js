import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import * as cabinet from '../assets/furniture/cabinet/index.js';
import { validateAsset } from '../validator/validate.js';
import * as broken from './fixtures/broken-cabinet.js';

const id = 'furniture/cabinet';

describe('asset validation', () => {
  it('checks the cabinet with defaults and 20 seeded samples', () => {
    expect(validateAsset(cabinet, id).cases).toBe(21);
  });

  it('rejects the fixture containing a NaN vertex', () => {
    expect(() => validateAsset(broken, id)).toThrow(/bottom: non-finite vertex/);
  });

  it.each([
    ['joint target', root => { root.userData.joints[0].childPart = 'missing'; }, /unknown joint childPart/],
    ['box mismatch', root => { root.userData.boundingBox.max[1] += 0.002; }, /1 mm tolerance/],
    ['duplicate name', root => { root.getObjectByName('bottom').name = 'top'; }, /duplicate part name/]
  ])('detects an invalid %s', (label, mutate, expected) => {
    const createAsset = (params, options) => {
      const root = cabinet.createAsset(params, options);
      mutate(root);
      return root;
    };
    expect(() => validateAsset({ ...cabinet, createAsset }, id)).toThrow(expected);
  });

  it('detects changing geometry even inside an unchanged outer box', () => {
    let offset = 0;
    const createAsset = (params, options) => {
      const root = cabinet.createAsset(params, options);
      root.getObjectByName('shelf_1').position.y += offset;
      offset += 0.001;
      return root;
    };
    expect(() => validateAsset({ ...cabinet, createAsset }, id)).toThrow(/non-deterministic/);
  });
});

describe('cabinet interaction geometry', () => {
  it.each([1, 2])('opens each of %i doors outwards around its declared hinge', doorCount => {
    const root = cabinet.createAsset({ doorCount });
    expect(root.userData.joints).toHaveLength(doorCount);
    const grasps = root.userData.affordances.filter(a => a.type === 'grasp');
    expect(grasps).toHaveLength(doorCount);
    for (const j of root.userData.joints) {
      const door = root.getObjectByName(j.childPart);
      const grasp = grasps.find(a => door.getObjectByName(a.part));
      const grip = door.getObjectByName(grasp.part);
      const point = () => grip.localToWorld(new Vector3(...grasp.point));
      const closed = point();
      const hinge = door.getWorldPosition(new Vector3());
      expect(j.limits).toEqual([0, 1.75]);
      door.rotateOnAxis(new Vector3(...j.axis), j.limits[1]);
      const open = point();
      expect(open.z).toBeGreaterThan(closed.z);
      expect(open.distanceTo(hinge)).toBeCloseTo(closed.distanceTo(hinge), 8);
    }
  });

  it.each([0, 5])('locates each of %i placeable surfaces on its shelf top', shelfCount => {
    const root = cabinet.createAsset({ shelfCount });
    const surfaces = root.userData.affordances.filter(a => a.type === 'placeable');
    expect(surfaces).toHaveLength(shelfCount);
    for (const a of surfaces) {
      const geom = root.getObjectByName(a.part).geometry;
      geom.computeBoundingBox();
      expect(a.point[1]).toBeCloseTo(geom.boundingBox.max.y, 7);
      expect(a.normal).toEqual([0, 1, 0]);
      expect(a.size).toEqual([geom.parameters.width, geom.parameters.depth]);
    }
  });
});
