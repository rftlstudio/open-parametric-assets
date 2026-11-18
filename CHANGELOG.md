# Changelog

## Built-in oven 0.1.0

Adds 60/75/90 cm wall ovens, installation cutouts, a bottom-hinged door, seeded wire racks and physical or touch controls. MuJoCo checks door release, rebound and cube transport on sliding surfaces, including drawer trays.

## Microwave 0.2.1 and asset spec v0.3

Breaking metadata change: button springs move from control.state.spring to joint.dynamics.spring. Record IDs change. Fixed panel scales show dial detents and their values.

## Microwave 0.2.0

Physical controls gain vector icons and uppercase labels. Touch and mixed panels add force-tested, separated control regions and a control-panel close-up. Updated button caps, recessed panel and electronics mass change microwave sample IDs. The triangle budget remains 1,800.

## Microwave + controls v0.1

Adds appliances/microwave v0.1.0 with a hollow cavity, hinged windowed door, raised or recessed opening, and physical button or dial layouts. Asset spec v0.2 defines controls, function/icon vocabularies, regions, momentary springs, detents and the reserved touch contract. Dataset records include controls. MuJoCo checks button return, detent stability and region access, with button springs applied in memory.

Cabinet and drawer_cabinet advance to 0.2.2. Every grasp now requires an explicit raised/recessed grip, and the simulator reads this affordance field. Record IDs and example paths change with these asset versions. Examples include a rendered microwave.

## Asset versions 0.2.1

Both cabinet assets advance to 0.2.1. Recessed drawer faces use four collision boxes around the aperture and retain their separate cup back, keeping the cavity open in MuJoCo. Visual faces remain OBJ meshes.

Grasp checks require recessed points to clear every collision geometry by more than 2 mm. Bar and knob points use the grip center, must lie inside their own collision box, and require more than 10 mm clearance from every other collision geometry. All URDF numeric attributes are rounded to 1e-9.

The asset version change produces new record IDs and file paths. Example records, GLBs and renders are regenerated for 0.2.1.

## URDF and simulation v0.1

Adds optional URDF dataset export, Z-up rigid links with material-density inertia, and MuJoCo 3.3.7 acceptance checks. Both furniture assets expose material density in material userData.

Drawer cabinet v0.2.0 changes the joint contract to `clearance` and reduces travel to 75% of tray depth. The validator samples five poses for either joint type. Drawer record IDs and open-view references change with the asset version.


## 0.2.0

**Breaking reproducibility change.** The cabinet and dataset generator now use Mulberry32 initialized with the 32-bit MurmurHash3 finalizer. The dataset enumerates record seeds with a permuted counter. The same build command produces different samples, record IDs and file paths. To reproduce a 0.1.0 record, use the 0.1.0 generator and its lockfile.

The renderer uses fixed neutral key, fill and rim lights and subtle crease lines. All five existing view names are retained. The new `perspective_three_quarter` view uses a 35° vertical field of view and frames the closed asset at approximately 80% of the image. The example GLBs and PNG references were regenerated for this release.
