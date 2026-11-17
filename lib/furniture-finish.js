export const colorParameter = {
  type: 'enum', default: '#a8734b', enum: ['#a8734b', '#526878', '#e9e4d8'],
  labels: { '#a8734b': 'walnut brown', '#526878': 'slate blue', '#e9e4d8': 'off-white' },
  unit: 'sRGB', description: 'Paint color in hexadecimal sRGB.'
};

export const wearParameter = {
  type: 'number', default: 0, min: 0, max: 1, step: 0.05, unit: 'ratio',
  description: 'Strength of seeded surface fading and roughness.'
};

export function wearBand(wear) {
  if (wear === 0) return 'brand new';
  if (wear <= 0.3) return 'lightly worn';
  if (wear <= 0.7) return 'worn';
  return 'heavily worn';
}
