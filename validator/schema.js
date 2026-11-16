import assert from 'node:assert/strict';
import { accepts, parameterGrid } from '../lib/parameters.js';

export const isText = value => typeof value === 'string' && value.trim().length > 0;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function checkSchema(schema) {
  assert(isObject(schema) && isObject(schema.parameters), 'expected schema.parameters object');
  if (Object.hasOwn(schema, 'triangleLimit')) {
    assert(Number.isSafeInteger(schema.triangleLimit) && schema.triangleLimit > 0, 'invalid triangleLimit');
  }
  for (const [name, spec] of Object.entries(schema.parameters)) {
    assert(isText(name) && isObject(spec), 'invalid parameter definition');
    assert(isText(spec.unit) && isText(spec.description), name + ': missing unit or description');
    if (Object.hasOwn(spec, 'step')) assert.equal(spec.type, 'number', name + ': step requires a number parameter');
    if (spec.type === 'enum') {
      assert(Array.isArray(spec.enum) && spec.enum.length > 0 && spec.enum.every(isText), name + ': invalid enum');
      assert.equal(new Set(spec.enum).size, spec.enum.length, name + ': duplicate enum values');
      if (Object.hasOwn(spec, 'labels')) {
        assert(isObject(spec.labels) && Object.keys(spec.labels).length === spec.enum.length &&
          spec.enum.every(v => Object.hasOwn(spec.labels, v) && isText(spec.labels[v])), name + ': invalid enum labels');
      }
    } else {
      assert(['integer', 'number'].includes(spec.type), name + ': unsupported type');
      const valid = spec.type === 'integer' ? Number.isSafeInteger : Number.isFinite;
      assert(valid(spec.min) && valid(spec.max) && spec.min <= spec.max, name + ': invalid bounds');
    }
    assert(accepts(spec, spec.default), name + ': invalid default');
  }
}

export function checkRejection({ schema, createAsset }) {
  for (const [name, spec] of Object.entries(schema.parameters)) {
    let invalid;
    if (spec.type === 'enum') {
      invalid = [null, ''];
    } else {
      invalid = [spec.min - 1, spec.max + 1, NaN, Infinity, null];
      if (spec.type === 'integer') invalid.push(spec.min + 0.5);
      if (spec.step !== undefined) {
        const midpoint = spec.min + spec.step / 2;
        if (midpoint <= spec.max && !accepts(spec, midpoint)) invalid.push(midpoint);
      }
    }
    for (const value of invalid) {
      assert.throws(() => createAsset({ [name]: value }, { seed: 0 }), undefined, name + ': accepted invalid value ' + value);
    }
  }
}

export function sampleParams(schema, random) {
  const params = {};
  for (const [name, spec] of Object.entries(schema.parameters)) {
    const u = random();
    if (spec.type === 'enum') params[name] = spec.enum[Math.floor(u * spec.enum.length)];
    else if (spec.type === 'integer') params[name] = spec.min + Math.floor(u * (spec.max - spec.min + 1));
    else if (spec.step !== undefined) {
      const grid = parameterGrid(spec);
      params[name] = grid.valueAt(Math.floor(u * grid.size));
    } else params[name] = spec.min + u * (spec.max - spec.min);
  }
  return params;
}
