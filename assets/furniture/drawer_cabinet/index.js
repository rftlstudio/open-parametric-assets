import { BoxGeometry, Color, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Path, Shape } from 'three';
import { resolveParams, seededRandom } from '../../../lib/parameters.js';
import { colorParameter, wearParameter, wearBand } from '../../../lib/furniture-finish.js';

export const schema = {
  triangleLimit: 1200,
  parameters: {
    width: { type: 'number', min: 0.35, max: 0.90, default: 0.60, step: 0.01, unit: 'm', description: 'Outside case width.' },
    height: { type: 'number', min: 0.55, max: 0.90, default: 0.72, step: 0.01, unit: 'm', description: 'Floor to case top.' },
    depth: { type: 'number', min: 0.40, max: 0.65, default: 0.55, step: 0.01, unit: 'm', description: 'Case depth excluding drawer fronts and pulls.' },
    drawerCount: { type: 'integer', min: 1, max: 6, default: 3, unit: 'count', description: 'Number of equal-height drawers.' },
    handleStyle: { type: 'enum', default: 'bar', enum: ['bar', 'knob', 'recessed'], unit: 'none', description: 'Pull design on each drawer.' },
    color: colorParameter,
    wear: wearParameter
  }
};

export function describe(params, random) {
  const p = resolveParams(schema, params);
  const count = ['one', 'two', 'three', 'four', 'five', 'six'][p.drawerCount - 1];
  const pull = p.handleStyle === 'recessed' ? 'recessed pull' : p.handleStyle + ' handle';
  const fittings = p.drawerCount === 1 ? 'a ' + pull : pull + 's';
  const design = count + '-drawer chest with ' + fittings;
  const intro = random() < 0.5 ? 'Build a ' + design : 'Make a ' + design;
  const dimensions = p.width.toFixed(2) + ' m wide, ' + p.height.toFixed(2) + ' m tall and ' + p.depth.toFixed(2) + ' m deep';
  return intro + '. The case is ' + dimensions + '. The ' + colorParameter.labels[p.color] +
    ' finish looks ' + wearBand(p.wear) + '.';
}

function group(parent, name, center) {
  const node = new Group();
  node.name = name;
  node.position.set(...center);
  parent.add(node);
  return node;
}

function recessedPanel(width, height, apertureW, apertureH, thickness) {
  const outer = new Shape();
  const x = width / 2, y = height / 2;
  outer.moveTo(-x, -y).lineTo(x, -y).lineTo(x, y).lineTo(-x, y).closePath();
  const hole = new Path();
  const hx = apertureW / 2, hy = apertureH / 2;
  hole.moveTo(-hx, -hy).lineTo(-hx, hy).lineTo(hx, hy).lineTo(hx, -hy).closePath();
  outer.holes.push(hole);
  return new ExtrudeGeometry(outer, { depth: thickness, bevelEnabled: false });
}

export function createAsset(params = {}, { seed = 0 } = {}) {
  const { width, height, depth, drawerCount, handleStyle, color, wear } = resolveParams(schema, params);
  const random = seededRandom(seed);
  const wood = new MeshStandardMaterial({ color, roughness: 0.55 + 0.4 * wear });
  wood.color.lerp(new Color('#d6c6ae'), wear * (0.05 + 0.15 * random()));
  const metal = new MeshStandardMaterial({ color: '#53575b', metalness: 0.7, roughness: 0.35 });
  const root = new Group();
  root.name = 'drawer_cabinet';
  const joints = [], affordances = [];
  wood.userData.densityKgM3 = 650;
  metal.userData.densityKgM3 = 2700;
  let massKg = 0;
  function box(parent, name, size, center, material = wood) {
    const mesh = new Mesh(new BoxGeometry(...size), material);
    mesh.position.set(...center);
    mesh.name = name;
    parent.add(mesh);
    massKg += size[0] * size[1] * size[2] * material.userData.densityKgM3;
    return mesh;
  }

  const wall = 0.018, liner = 0.012, face = 0.024;
  const insideHeight = height - 2 * wall;
  const pitch = insideHeight / drawerCount;
  const trayWidth = width - 2 * (wall + 0.006);
  const trayDepth = depth - wall - 0.012;
  const reach = { bar: 0.036, knob: 0.027, recessed: 0 }[handleStyle];
  const sideNames = ['case_left', 'case_right'];
  box(root, 'case_left', [wall, insideHeight, depth], [-(width - wall) / 2, height / 2, 0]);
  box(root, 'case_right', [wall, insideHeight, depth], [(width - wall) / 2, height / 2, 0]);
  box(root, 'case_back', [width - 2 * wall, insideHeight, wall], [0, height / 2, -(depth - wall) / 2]);
  box(root, 'case_base', [width, wall, depth], [0, wall / 2, 0]);
  box(root, 'case_top', [width, wall, depth], [0, height - wall / 2, 0]);
  affordances.push({ type: 'placeable', part: 'case_top', point: [0, wall / 2, 0], normal: [0, 1, 0], size: [width, depth] });

  for (let i = 1; i <= drawerCount; i++) {
    const name = 'drawer_' + i;
    const drawer = group(root, name, [0, wall + (i - 1) * pitch, depth / 2]);
    const tray = group(drawer, name + '_box', [0, 0.006, 0]);
    const bottom = box(tray, name + '_bottom', [trayWidth, liner, trayDepth], [0, liner / 2, -trayDepth / 2]);
    const sideHeight = pitch * 0.75 - liner;
    for (const [side, sign] of [['left', -1], ['right', 1]]) {
      box(tray, name + '_' + side, [liner, sideHeight, trayDepth],
        [sign * (trayWidth - liner) / 2, liner + sideHeight / 2, -trayDepth / 2]);
    }
    box(tray, name + '_back', [trayWidth - 2 * liner, sideHeight, liner],
      [0, liner + sideHeight / 2, -trayDepth + liner / 2]);
    affordances.push({ type: 'placeable', part: bottom.name, point: [0, liner / 2, liner / 2],
      normal: [0, 1, 0], size: [trayWidth - 2 * liner, trayDepth - liner] });

    const front = group(drawer, name + '_front', [0, pitch / 2, 0]);
    const fw = width - 0.004, fh = pitch - 0.004;
    const handle = name + '_handle';
    let point = [0, 0, (handleStyle === 'bar' ? 0.012 : reach) / 2 + 0.005];
    if (handleStyle === 'recessed') {
      const apertureW = 0.12, apertureH = 0.032;
      const panel = new Mesh(recessedPanel(fw, fh, apertureW, apertureH, face), wood);
      panel.name = name + '_face';
      front.add(panel);
      massKg += (fw * fh - apertureW * apertureH) * face * wood.userData.densityKgM3;
      box(front, name + '_cup_back', [apertureW, apertureH, 0.003], [0, 0, 0.0015], metal);
      box(front, handle, [apertureW, 0.008, 0.004], [0, 0.012, face - 0.002], metal);
      point = [0, -0.012, -0.01]; // In the free space behind and below the lip.
    } else {
      box(front, name + '_face', [fw, fh, face], [0, 0, face / 2]);
      if (handleStyle === 'bar') {
        for (const [side, x] of [['left', -0.048], ['right', 0.048]]) {
          box(front, name + '_post_' + side, [0.012, 0.012, reach - 0.012], [x, 0, face + (reach - 0.012) / 2], metal);
        }
        box(front, handle, [0.12, 0.012, 0.012], [0, 0, face + reach - 0.006], metal);
      } else {
        box(front, handle, [0.028, 0.028, reach], [0, 0, face + reach / 2], metal);
      }
    }
    affordances.push({ type: 'grasp', part: handle, point });
    joints.push({ name: 'slide_' + i, type: 'prismatic', axis: [0, 0, 1], limits: [0, 0.75 * trayDepth],
      childPart: drawer.name, clearance: { moving: tray.name, stationary: [...sideNames], minRetainedRatio: 0.2 } });
  }

  root.userData = {
    id: 'furniture/drawer_cabinet', category: 'furniture', version: '0.2.1', license: 'CC-BY-4.0', units: 'm',
    boundingBox: { min: [-width / 2, 0, -depth / 2], max: [width / 2, height, depth / 2 + face + reach] },
    physics: { massKg, friction: 0.5, collision: 'compound' }, joints, affordances
  };
  return root;
}
