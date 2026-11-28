# Changelog

## 0.5.0

The record-free MJCF articulation linter reports joint, collision and control measurements with configurable thresholds. CI checks clean models and seven classes of injected faults across parameter corners. [Rules and reproduction instructions](docs/LINT.md).

On the 217 models in the published v0.4.0 dataset, the linter reported zero clean errors and detected all 803 applicable injected faults. The 29-record CI sample detected all 104 applicable faults. [OPA lint report](reports/lint-opa-2026-11-27.md) · [CI fault matrix](reports/faults/matrix.md) · [Hugging Face dataset v0.4.0](https://huggingface.co/datasets/rftlstudio/open-parametric-assets/tree/v0.4.0).

The external evaluation covers 10 standalone RoboCasa fixtures. Each remaining reachability or penetration finding records which prerequisite joints the controller held during the sweep. [RoboCasa lint report](reports/lint-robocasa-2026-11-27.md).

The dataset builder accepts `--mjcf` to export native MuJoCo models with springs, interaction sites, control sensors and embedded task metadata. CI runs both physics formats and compares their compiled models and measured motion. See [Native MuJoCo models](docs/MJCF.md).

## 0.3.0

- Furniture URDFs preserve recessed drawer pulls as open cavities. MuJoCo checks finger clearance for recessed pulls and grip centers for raised handles. URDF numeric values are rounded to nine decimal places. [#7](https://github.com/rftlstudio/open-parametric-assets/pull/7)
- The microwave adds a hinged door with a viewing window and physical, touch and mixed control panels. Vector icons and labels identify controls in the exported models. MuJoCo checks button return, dial detents and touch-region separation. [#8](https://github.com/rftlstudio/open-parametric-assets/pull/8), [#9](https://github.com/rftlstudio/open-parametric-assets/pull/9)
- The built-in oven adds a balanced door and sliding racks with motion prerequisites. Joint metadata now carries spring settings, including microwave button springs previously stored under `control.state.spring`. Dial scales show detent values, and simulation covers loaded slides and parameter corners. [#10](https://github.com/rftlstudio/open-parametric-assets/pull/10)
- Asset spec v0.4 defines observable states and five tasks across four asset families. A floating-hand MuJoCo oracle tests each applicable task. Dataset records include source provenance and per-view control boxes, with measured reports for simulated URDFs and Croissant metadata for each build. The Python quickstart presses START on two prebuilt microwaves. [#11](https://github.com/rftlstudio/open-parametric-assets/pull/11)

## Dataset provenance and quickstart

Records identify the source commit and checks. URDF simulation writes a measured report per record. Render annotations locate control regions in pixels, and Croissant metadata accompanies each dataset build. The Python quickstart exercises two published START controls.

## Asset spec v0.4

Named state predicates, five variant-filtered tasks and a floating-hand MuJoCo oracle now ship with the four asset families.

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
