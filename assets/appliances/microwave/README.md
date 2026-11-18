# Microwave v0.2.1

A countertop appliance with a hollow chamber, an opaque left-hinged door in the shell finish and a right-hand control panel occupying 27% of the width. A centered, inset glass window spans 60% of the door width and 55% of its height, surrounded by solid panels. +Y is up and +Z faces the user. The origin is the case footprint center at floor level.

| Parameter | Default | Domain |
| --- | --- | --- |
| width | 0.52 m | 0.45–0.60 m, step 0.01 |
| height | 0.30 m | 0.26–0.35 m, step 0.01 |
| depth | 0.39 m | 0.33–0.45 m, step 0.01, excluding door and controls |
| controlStyle | physical | physical, touch, mixed |
| controlLayout | dials | dials, buttons for physical panels. Other styles require the default dials value. |
| doorOpening | handle | handle, release_button |
| finish | stainless | stainless, black, white |
| wear | 0 | 0–1, step 0.05 |

Templates include dimensions with two decimal places, the named finish, control layout, opening style and wear band.

```js
import { createAsset } from 'open-parametric-assets/assets/appliances/microwave';
const root = createAsset({ controlLayout: 'dials', doorOpening: 'release_button' }, { seed: 42 });
const start = root.userData.controls.find(c => c.function === 'start');
const slide = root.userData.joints.find(j => j.name === start.joint);
```

The dials layout has a 0–30 minute timer in one-minute detents, five power settings (20–100%) and a start button. The release-button opening style adds a separate OPEN button to this layout. The buttons layout has START, STOP, +30 s and OPEN. The touch panel has ten digits and four action keys. The mixed panel combines a timer knob with START, STOP and +30 S touch keys. Each panel carries original vector lettering and icons. A numeral serves as both the digit icon and its printed label.

At rest the caps protrude 4 mm from the panel, which sits 1 mm behind the case front. Buttons travel 3 mm into the panel, register a press at 60% travel, and use a 300 N/m return spring with zero rest position. Knobs rotate clockwise as seen from the front through 270° around axis [0, 0, -1] and use joint friction to hold their position. The state is the nearest detent value; an exact midpoint chooses the lower index. Control rectangles use local X and Y on the front faces.

The raised bar uses a grasp point at its center. The release-button variant has a recessed right-edge pull, with a grasp point in its free channel. The door swings outward from 0 to 1.75 rad. A real latch is not simulated. Where present, OPEN represents a release request. The mixed panel exposes the pull edge directly.

The cavity floor has a placeable rectangle along local X/Z. Mass estimates use effective enclosure density 500 kg/m³ for the panel volumes, 1100 kg/m³ for plastic and 2500 kg/m³ for glass. A solid electronics box occupies the enclosed bay behind the controls. Its effective density is the remaining target mass divided by its volume. The assembled mass increases linearly with width from 11.5 to 13.5 kg, an estimate for a countertop unit. The panel density approximates a hollow, thin-sheet enclosure. The rendered window has opacity 0.35 and a solid glass collision box.

## Appliance effects

START begins or resumes operation only with the door closed and a positive timer. STOP cancels the current run and clears its remaining time. Opening the door pauses the run. Closing it requires a new START to resume. +30 s adds thirty seconds to the remaining timer. OPEN requests latch release. TIMER selects the duration in minutes and POWER selects the power percentage. A layout exposes the effects corresponding to its controls.

These effects document the contract for a consuming application. Physical joints and fixed touch regions can be exercised with the MuJoCo checker.
