import { schema } from '../assets/furniture/cabinet/index.js';
import { resolveParams, seededRandom } from './parameters.js';

const numbers = ['zero', 'one', 'two', 'three', 'four', 'five'];

export function describe(assetId, params, seed) {
  if (assetId !== 'furniture/cabinet') throw new Error('Missing prompt template for ' + assetId);
  const p = resolveParams(schema, params);
  const random = seededRandom(seed);
  const doors = numbers[p.doorCount] + (p.doorCount === 1 ? ' door' : ' doors');
  const shelves = numbers[p.shelfCount] + (p.shelfCount === 1 ? ' shelf' : ' shelves');
  const handles = p.doorCount === 1 ? 'a ' + p.handleStyle + ' handle' : p.handleStyle + ' handles';
  const fittings = doors + ', ' + handles + ' and ' + shelves;
  const dimensions = p.width.toFixed(2) + ' m wide, ' + p.height.toFixed(2) + ' m tall and ' + p.depth.toFixed(2) + ' m deep';
  const finish = 'Paint it ' + p.color + ' with ' + Math.round(100 * p.wear) + '% surface wear.';
  const templates = [
    'Build a wooden cabinet with ' + fittings + '. Make the case ' + dimensions + '.',
    'A wooden cabinet measuring ' + dimensions + ', with ' + fittings + '.',
    'Design a wooden cabinet with ' + fittings + '. Its case measures ' + dimensions + '.'
  ];
  const choice = Math.floor(random() * 0x100000000) % templates.length;
  return templates[choice] + ' ' + finish;
}
