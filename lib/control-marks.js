import { Mesh, MeshBasicMaterial, Shape, ShapeGeometry } from 'three';

// Single-stroke glyphs on a 3 by 5 lattice. A space in a path lifts the pen.
const strokes = {
  A:'C318E 68', B:'C012586 68BEDC', C:'2103CDE', D:'C017BDC',
  E:'2103CDE 68', F:'C012 68', G:'2103CDEB87', H:'0C 2E 68',
  I:'02 1D CE', J:'02 2ED9', K:'0C 26E', L:'0CE', M:'C072E',
  N:'C0E2', O:'012BEC90', P:'C012586', Q:'012BEC90 7E', R:'C012586 7E',
  S:'210368BEDC', T:'02 1D', U:'0CDE2', V:'0D2', W:'0C7E2',
  X:'0E 2C', Y:'072 7D', Z:'02CE', '0':'012BEC90', '1':'31D CE',
  '2':'301258CE', '3':'012587 8BEDC', '4':'06 68 2E', '5':'21068BEDC',
  '6':'2103CDEB86', '7':'02D', '8':'012586301 68BEDC6', '9':'863012BEDC',
  '+':'68 4A', ' ':''
};
// Coordinate ids 0..E run left to right, top to bottom.
const paths = {
  off:'03,01 07,01 09,03 09,07 07,09 03,09 01,07 01,03 03,01',
  bake:'01,08 09,08 / 01,02 09,02', fan:'05,05 02,08 04,09 05,05 09,06 09,04 05,05 04,01 02,02 05,05',
  grill:'01,08 03,05 05,08 07,05 09,08', defrost:'05,01 05,09 / 01,03 09,07 / 01,07 09,03',
  up:'01,03 05,07 09,03', down:'01,07 05,03 09,07',
  play:'02,01 02,09 09,05 02,01', stop:'02,02 08,02 08,08 02,08 02,02',
  power:'05,09 05,05 / 03,08 01,06 01,03 03,01 07,01 09,03 09,06 07,08',
  clock:'03,01 07,01 09,03 09,07 07,09 03,09 01,07 01,03 03,01 / 05,08 05,05 07,04',
  open:'01,04 05,09 09,04 01,04 / 01,02 09,02'
};
// Numeric icons share the original stroke-font paths.
const textIcons = { plus_30: '+30 S', ...Object.fromEntries(
  Array.from({length: 10}, (_, digit) => ['digit_' + digit, String(digit)])) };

function line(shapes, a, b, thickness) {
  const dx = b[0]-a[0], dy = b[1]-a[1], length = Math.hypot(dx,dy);
  if (!length) return;
  const x = -dy * thickness / (2*length), y = dx * thickness / (2*length);
  const s = new Shape();
  s.moveTo(a[0]+x,a[1]+y); s.lineTo(a[0]-x,a[1]-y);
  s.lineTo(b[0]-x,b[1]-y); s.lineTo(b[0]+x,b[1]+y); s.closePath();
  shapes.push(s);
}
function lettering(shapes, text, y, width, height) {
  const unit = Math.min(height/4, width/(3*text.length));
  for (const [i,ch] of [...text].entries()) {
    for (const path of strokes[ch].split(' ')) {
      const points = [...path].map(key => {
        const n = parseInt(key,16);
        return [(i*3 + n%3 - (3*text.length-1)/2)*unit, y+(2-Math.floor(n/3))*unit];
      });
      for (let j=1; j<points.length; j++) line(shapes,points[j-1],points[j],unit*0.38);
    }
  }
}
function drawPath(shapes,path,scale,cx,cy) {
    for (const stroke of path.split(' / ')) {
      const pts = stroke.split(' ').map(pair => pair.split(',').map(Number))
        .map(([x,v]) => [cx+(x-5)*scale, cy+(v-5)*scale]);
      for (let i=1;i<pts.length;i++) line(shapes,pts[i-1],pts[i],scale);
    }
}

export function markControl(part, control) {
  const {point} = control.region;
  // Use the dial face surrounding its smaller central interaction region.
  const size = control.type === 'knob' ? [0.032, 0.022] : control.region.size;
  const shapes = [], h = Math.min(size[1], size[0]*1.4), y = h*0.18;
  const path = paths[control.icon];
  if (path) {
    const scale = Math.min(size[0],h)*0.052;
    drawPath(shapes,path,scale,0,y);
    lettering(shapes,control.label,-h*0.27,size[0]*0.9,h*0.27);
  } else {
    lettering(shapes, textIcons[control.icon], 0, size[0]*0.72, h*0.62);
  }
  const color = part.material.color;
  const light = color.r*0.2126 + color.g*0.7152 + color.b*0.0722 > 0.18;
  const mesh = new Mesh(new ShapeGeometry(shapes),new MeshBasicMaterial({color:light ? 0x101418 : 0xfafafa}));
  mesh.name = control.name + '_mark';
  mesh.userData.visualOnly = true;
  mesh.position.set(point[0],point[1],point[2]+0.0003);
  part.add(mesh);
}

// The zero indicator points up (+Y). Orient offsets with the signed hinge axis.
export function dialScale(panel, control, joint, center, radius) {
  const { positions, values, icons } = control.state;
  const material = new MeshBasicMaterial({color: 0xffffff});
  for (const [i,angle] of positions.entries()) {
    const x = -joint.axis[2]*Math.sin(angle), y = Math.cos(angle);
    const shapes = [];
    line(shapes,[x*(radius+0.001),y*(radius+0.001)],[x*(radius+0.003),y*(radius+0.003)],0.0008);
    const labelled = positions.length <= 12 || i%5 === 0;
    if (labelled) {
      const dx = x*(radius+0.008), dy = y*(radius+0.008);
      if (icons) drawPath(shapes,paths[icons[i]],0.00055,dx,dy);
      else {
        const label = [];
        lettering(label,String(values[i]),0,0.011,0.0045);
        for (const glyph of label) {
          const translated = new Shape(glyph.getPoints().map(p => p.set(p.x+dx,p.y+dy)));
          shapes.push(translated);
        }
      }
    }
    const mesh = new Mesh(new ShapeGeometry(shapes), material);
    mesh.name = control.name + '_tick_' + i;
    mesh.userData = { visualOnly:true, scaleFor:control.name, detent:i, labelled };
    mesh.position.set(center[0],center[1],center[2]+0.0003);
    panel.add(mesh);
  }
}
