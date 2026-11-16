# Cabinet

A free-standing box cabinet with one left-hinged door or a pair of outward-opening doors. The origin lies on the floor at the center of the case. +X points right, +Y up and +Z out of the front. Dimensions describe the case; doors and handles extend its depth. The declared bounds include them in the closed pose.

```js
import { schema, createAsset } from './index.js';
const cabinet = createAsset({ doorCount: 1, shelfCount: 0, handleStyle: 'knob' }, { seed: 17 });
console.log(schema.parameters.width, cabinet.userData.boundingBox);
```

| Parameter | Default | Accepted values |
| --- | --- | --- |
| width | 0.9 m | 0.4–1.6 m |
| height | 1.2 m | 0.5–2.2 m |
| depth | 0.45 m | 0.25–0.8 m |
| doorCount | 2 | 1 or 2 |
| shelfCount | 2 | Integers from 0 to 5 |
| handleStyle | bar | bar, knob |
| color | #a8734b | #a8734b, #526878, #e9e4d8 |
| wear | 0 | 0–1, controls roughness and seeded fading |

Use each hinge's signed axis to open its child door from 0 to 1.75 radians. Both hinges use positive opening angles. Grasp points are centered in each grip. Each shelf exposes a rectangular placeable top face with dimensions along local X and Z and normal +Y.

For a compound collider use one oriented box per mesh, retaining its parent transform. Estimated mass sums box volumes using 650 kg/m³ for wood and 2700 kg/m³ for handles and mounts. The friction coefficient 0.5 is a simulation assumption.
