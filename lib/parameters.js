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

function decimalPlaces(value) {
  const [mantissa, exponent = 0] = String(value).split('e');
  return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent));
}

// Shift the decimal exponent before converting to Number, so decimal steps
// such as 0.05 can be added and compared as integer ticks.
function shiftDecimal(value, places) {
  const [mantissa, exponent = 0] = String(value).split('e');
  return Number(mantissa + 'e' + (Number(exponent) + places));
}

export function parameterGrid({ min, max, step }) {
  if (!Number.isFinite(step) || step <= 0) throw new RangeError('step must be finite and positive');
  const precision = Math.max(decimalPlaces(min), decimalPlaces(step));
  const start = shiftDecimal(min, precision);
  const stride = shiftDecimal(step, precision);
  const end = Math.floor(shiftDecimal(max, precision));
  if (![start, stride, end, end - start].every(Number.isSafeInteger)) {
    throw new RangeError('parameter grid exceeds safe integer precision');
  }
  const valueAt = index => shiftDecimal(start + index * stride, -precision);
  let last = Math.floor((end - start) / stride);
  if (valueAt(last) > max) last--;
  return {
    precision, size: last + 1, valueAt,
    contains(value) {
      const tick = shiftDecimal(value, precision);
      return Number.isSafeInteger(tick) && (tick - start) % stride === 0 && shiftDecimal(tick, -precision) === value;
    }
  };
}

export function accepts(spec, value) {
  if (spec.type === 'enum') return spec.enum.includes(value);
  if (spec.type === 'integer' && !Number.isSafeInteger(value)) return false;
  if (!Number.isFinite(value) || value < spec.min || value > spec.max) return false;
  return spec.step === undefined || parameterGrid(spec).contains(value);
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
