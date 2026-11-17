import { expect, it } from 'vitest';
import { schema } from '../assets/furniture/cabinet/index.js';
import { parameterGrid, seededRandom } from '../lib/parameters.js';
import { sampleParams } from '../validator/schema.js';

// Adjacent seeds exercise both the initial seed hash and each parameter draw.
const samples = Array.from({ length: 3000 }, (_, seed) => sampleParams(schema, seededRandom(seed)));

// Upper 0.001 critical values for the cabinet's category counts. Comparing the
// Pearson statistic here is equivalent to testing its upper-tail p against 0.001.
// https://www.itl.nist.gov/div898/handbook/eda/section3/eda3674.htm
const critical = new Map([[1, 10.8275661707], [2, 13.8155105580], [5, 20.5150056524]]);

it('preserves the 0.2.0 random stream for seed 42', () => {
  const random = seededRandom(42);
  expect(Array.from({ length: 4 }, () => random() * 0x100000000))
    .toEqual([2091601267, 2169168056, 306405048, 1675291194]);
});

for (const [name, spec] of Object.entries(schema.parameters)) {
  if (spec.type === 'enum' || spec.type === 'integer') {
    it(name + ' passes a uniform chi-square test at alpha = 0.001', () => {
      const values = spec.enum ?? Array.from({ length: spec.max - spec.min + 1 }, (_, i) => spec.min + i);
      const counts = new Map(values.map(value => [value, 0]));
      for (const sample of samples) {
        const count = counts.get(sample[name]);
        if (count === undefined) throw new Error(name + ': unexpected category ' + sample[name]);
        counts.set(sample[name], count + 1);
      }
      const expected = samples.length / values.length;
      const chiSquare = [...counts.values()].reduce((sum, n) => sum + (n - expected) ** 2 / expected, 0);
      expect(chiSquare, name + ' counts: ' + [...counts.values()]).toBeLessThanOrEqual(critical.get(values.length - 1));
    });
  } else if (spec.step !== undefined) {
    it(name + ' grid deciles stay within 30% of their expected counts', () => {
      const grid = parameterGrid(spec);
      const buckets = new Map();
      const expected = Array(10).fill(0);
      const counts = Array(10).fill(0);
      for (let i = 0; i < grid.size; i++) {
        const decile = Math.floor(i * 10 / grid.size);
        buckets.set(grid.valueAt(i), decile);
        // Some deciles contain one more grid point than their neighbors.
        expected[decile] += samples.length / grid.size;
      }
      for (const sample of samples) {
        const decile = buckets.get(sample[name]);
        if (decile === undefined) throw new Error(name + ': off-grid sample ' + sample[name]);
        counts[decile]++;
      }
      counts.forEach((count, i) => {
        expect(Math.abs(count - expected[i]), name + ' decile ' + i + ': ' + count).toBeLessThanOrEqual(0.30 * expected[i]);
      });
    });
  }
}
