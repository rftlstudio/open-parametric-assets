import { expect, it } from 'vitest';
import { strokes } from '../lib/control-marks.js';

it('draws a distinct stroke path for every control glyph', () => {
  const seen = new Map();
  for (const [glyph, path] of Object.entries(strokes)) {
    // Pen order and direction do not change the visible segments.
    const segments = path.split(' ').flatMap(stroke =>
      [...stroke.slice(1)].map((end, i) => [stroke[i], end].sort().join('')));
    const key = [...new Set(segments)].sort().join(' ');
    expect(seen.has(key), `shared stroke path: ${glyph} and ${seen.get(key)}`).toBe(false);
    seen.set(key, glyph);
  }
});
