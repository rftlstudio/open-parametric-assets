# Drawer cabinet

A kitchen base unit or office pedestal with one to six equal-height drawers. The origin is the center of the case footprint at floor level. +Y points up and +Z points out through the drawer fronts.

| Parameter | Default | Range or choices |
| --- | --- | --- |
| width | 0.60 m | 0.35–0.90 m |
| height | 0.72 m | 0.55–0.90 m |
| depth | 0.55 m | 0.40–0.65 m, excluding fronts and handles |
| drawerCount | 3 | Integers 1–6 |
| handleStyle | bar | bar, knob, recessed |
| color | #a8734b | walnut brown, slate blue, off-white (same hex palette as the hinged cabinet) |
| wear | 0 | 0–1 in steps of 0.05 |

All three dimensions use 0.01 m steps. Prompts include the dimensions, count, pull style, paint label and wear band. The record parameters retain the exact wear value.

```js
import { Vector3 } from 'three';
import { createAsset } from 'open-parametric-assets/assets/furniture/drawer_cabinet';

const root = createAsset({ drawerCount: 3, handleStyle: 'recessed' }, { seed: 42 });
const slide = root.userData.joints[0];
root.getObjectByName(slide.childPart).translateOnAxis(new Vector3(...slide.axis), 0.15);
const grasp = root.userData.affordances.find(a => a.type === 'grasp');
console.log(root.getObjectByName(grasp.part).localToWorld(new Vector3(...grasp.point)).toArray());
```

Drawers are numbered from the bottom. The tray depth is the case depth minus the 18 mm back and 12 mm of rear clearance. At full travel 80% of the tray depth extends past the case opening and 20% remains between the sides. Grasp points follow the moving pull; the recessed grip lies inside the cutout, behind its lip. Placeable rectangles use local X and Z and cover the clear drawer floors and the case top.

Use a box collider for each rectangular part. For a recessed front, use four boxes around the 0.12 × 0.032 m aperture to leave the grip accessible. Mass is estimated from solid volumes at 650 kg/m³ for wood and 2700 kg/m³ for metal. The friction coefficient is 0.5.
