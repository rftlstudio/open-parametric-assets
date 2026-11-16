export function seededRandom(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('seed must be an unsigned 32-bit integer');
  }
  let state = seed;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function accepts(spec, value) {
  if (spec.type === 'enum') return spec.enum.includes(value);
  if (spec.type === 'integer' && !Number.isSafeInteger(value)) return false;
  return Number.isFinite(value) && value >= spec.min && value <= spec.max;
}

export function resolveParams(schema, params) {
  const result = {};
  for (const name of Object.keys(params)) {
    if (!Object.hasOwn(schema.parameters, name)) throw new TypeError('Unknown parameter: ' + name);
  }
  for (const [name, spec] of Object.entries(schema.parameters)) {
    const value = Object.hasOwn(params, name) ? params[name] : spec.default;
    if (!accepts(spec, value)) throw new RangeError('Invalid parameter: ' + name);
    result[name] = value;
  }
  return result;
}
