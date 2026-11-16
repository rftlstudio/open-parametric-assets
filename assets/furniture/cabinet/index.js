import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { resolveParams, seededRandom } from '../../../lib/parameters.js';

export const schema = {
  triangleLimit: 500,
  parameters: {
    width: { type: 'number', default: 0.9, min: 0.4, max: 1.6, unit: 'm', description: 'Outside case width.' },
    height: { type: 'number', default: 1.2, min: 0.5, max: 2.2, unit: 'm', description: 'Floor to top of case.' },
    depth: { type: 'number', default: 0.45, min: 0.25, max: 0.8, unit: 'm', description: 'Case depth, excluding doors and handles.' },
    doorCount: { type: 'integer', default: 2, min: 1, max: 2, unit: 'count', description: 'Number of front doors.' },
    shelfCount: { type: 'integer', default: 2, min: 0, max: 5, unit: 'count', description: 'Number of evenly spaced interior shelves.' },
    handleStyle: { type: 'enum', default: 'bar', enum: ['bar', 'knob'], unit: 'none', description: 'Raised pull bar or block knob.' },
    color: { type: 'enum', default: '#a8734b', enum: ['#a8734b', '#526878', '#e9e4d8'], unit: 'sRGB', description: 'Paint color in hexadecimal sRGB.' },
    wear: { type: 'number', default: 0, min: 0, max: 1, unit: 'ratio', description: 'Strength of seeded surface fading and roughness.' }
  }
};

export function createAsset(params = {}, { seed = 0 } = {}) {
  const { width, height, depth, doorCount, shelfCount, handleStyle, color, wear } = resolveParams(schema, params);
  const random = seededRandom(seed);
  const root = new Group();
  root.name = 'cabinet';
  const joints = [];
  const affordances = [];
  const thickness = 0.018;
  const clearWidth = width - 2 * thickness;
  const clearHeight = height - 2 * thickness;
  const front = depth / 2;
  const wood = new MeshStandardMaterial({ color, roughness: 0.55 + 0.4 * wear });
  wood.color.lerp(new Color('#d6c6ae'), wear * (0.05 + 0.15 * random()));
  const metal = new MeshStandardMaterial({ color: '#53575b', metalness: 0.7, roughness: 0.35 });
  let massKg = 0;

  function box(parent, name, size, center, material = wood) {
    const mesh = new Mesh(new BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...center);
    parent.add(mesh);
    massKg += size[0] * size[1] * size[2] * (material === wood ? 650 : 2700);
    return mesh;
  }

  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    box(root, 'side_' + side, [thickness, height, depth], [sign * (width - thickness) / 2, height / 2, 0]);
  }
  box(root, 'bottom', [clearWidth, thickness, depth], [0, thickness / 2, 0]);
  box(root, 'top', [clearWidth, thickness, depth], [0, height - thickness / 2, 0]);
  box(root, 'back', [clearWidth, clearHeight, thickness], [0, height / 2, -front + thickness / 2]);

  const shelfDepth = depth - 2 * thickness;
  for (let i = 1; i <= shelfCount; i++) {
    const y = thickness + clearHeight * i / (shelfCount + 1);
    const shelf = box(root, 'shelf_' + i, [clearWidth, thickness, shelfDepth], [0, y, 0]);
    affordances.push({ type: 'placeable', part: shelf.name, point: [0, thickness / 2, 0], normal: [0, 1, 0], size: [clearWidth, shelfDepth] });
  }

  const doorWidth = width / doorCount - 0.004;
  const reach = handleStyle === 'bar' ? 0.04 : 0.03;
  for (let i = 0; i < doorCount; i++) {
    const side = i === 0 ? 'left' : 'right';
    const inward = i === 0 ? 1 : -1;
    const pivot = new Group();
    pivot.name = 'door_' + side;
    pivot.position.set(-inward * (width / 2 - 0.002), height / 2, front + thickness);
    root.add(pivot);
    box(pivot, 'panel_' + side, [doorWidth, height - 0.004, thickness], [inward * doorWidth / 2, 0, -thickness / 2]);
    const handleX = inward * (doorWidth - 0.045);
    let grip;
    if (handleStyle === 'bar') {
      for (const [end, y] of [['top', 0.052], ['bottom', -0.052]]) {
        box(pivot, 'mount_' + side + '_' + end, [0.012, 0.012, reach - 0.012], [handleX, y, (reach - 0.012) / 2], metal);
      }
      grip = box(pivot, 'handle_' + side, [0.012, 0.12, 0.012], [handleX, 0, reach - 0.006], metal);
    } else {
      grip = box(pivot, 'handle_' + side, [0.03, 0.03, reach], [handleX, 0, reach / 2], metal);
    }
    affordances.push({ type: 'grasp', part: grip.name, point: [0, 0, 0] });
    joints.push({ name: 'hinge_' + side, type: 'revolute', axis: [0, -inward, 0], limits: [0, 1.75], childPart: pivot.name });
  }

  root.userData = {
    id: 'furniture/cabinet', category: 'furniture', version: '0.1.0', license: 'CC-BY-4.0', units: 'm',
    boundingBox: { min: [-width / 2, 0, -front], max: [width / 2, height, front + thickness + reach] },
    physics: { massKg, friction: 0.5, collision: 'compound' }, affordances, joints
  };
  return root;
}
