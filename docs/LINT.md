# Articulation linter

From the repository root, install `python -m pip install -r sim/requirements.txt` and run:

```sh
python -m sim.lint path/to/model.xml
python -m sim.lint path/to/model.xml --roles roles.json --json findings.json
python -m sim.lint path/to/model.xml --thresholds policy.json
```

Keep referenced meshes and includes where the MJCF expects them. MuJoCo 3.3.7 and NumPy suffice. The CLI reads the model, prints a Markdown table, and exits 1 when it reports an error (including input and compilation errors). Warnings and informational findings alone exit 0. The JSON object contains the model filename and a sorted list of findings with rule ID, severity, element, measurement, threshold and fix hint. Anonymous joints, sites and sensors receive stable temporary names.

## Roles

Every hinge and slide is inspected. A bounded joint also gets motion probes. MuJoCo touch sensors and sites with “handle” in their name are discovered directly. Embedded `opa_metadata` supplies control types, press thresholds, grasp sites, motion prerequisites, velocity and effort. An optional UTF-8 JSON file adds or overrides roles by model name:

```json
{
  "joints": {"door_hinge": "door", "start_slide": "button"},
  "handles": {"door_hinge": "grasp_door_handle"},
  "sensors": {"start_touch": "touch"},
  "requires": {"rack_slide": [{"joint": "door_hinge", "at": "upper"}]},
  "source": "collection@revision/path/to/fixture.xml"
}
```

A handle can also be a list of sites. The button role activates spring and return checks. Other joint roles describe function. A touch mapping must reference a declared MuJoCo touch sensor. Orient local +Z of its site outwards. See the [RoboCasa role maps](../lint/roles/robocasa/README.md) for external examples.

For each joint listed under `requires`, the role file replaces that joint's embedded prerequisite list. Other joints retain their embedded settings. In the example the drive opens the door before either rack sweep and holds its target at the upper stop. Use `lower` for mechanisms that require a joint at the opposite stop. Prerequisites may be transitive and must reference bounded joints. Cycles and conflicting stops are rejected.

## Rules and thresholds

Numeric settings in backticks below are JSON keys accepted by `--thresholds`. For example, `{"handle_gap": 0.008, "default_effort": 80}` changes the grip tolerance to 8 mm and fallback drive cap to 80 N or N·m. Values must be finite and positive. Fractions for required travel, press and return must also be at most 1. Structural rules follow the compiled model.

| Rule | Severity | Default test and rationale |
| --- | --- | --- |
| A001 | error | Require a limited joint with upper > lower. The endpoint experiments need two distinct stops. Continuous rotation can be intentional. |
| A002 | warn | Both damping and frictionloss are zero. A controller may supply resistance when the fixture is used. |
| A003 | warn / error | Moving subtree mass below `min_mass` = 0.001 kg warrants a scale check. The mass includes all descendants of the joint body. For a body with its own mass, a principal moment exceeding the sum of the other two is physically inconsistent (error, slack 1e-14 kg·m²). A massless hinge frame can carry an inertial child. Compiler-rejected inertials also report an error. |
| A004 | error | At least one collision geom on the moving rigid link, including its welded children. Contact masks and explicit geom pairs count. A visual alone supplies no contact. |
| A005 | warn | Handle point within `handle_gap` = 0.005 m of collision on the same rigid link. Recessed grasps can intentionally sit in free space. |
| A006 | error | A declared button needs positive spring stiffness for passive return. |
| A007 | error | A touch site must meet a collision surface on its rigid link within `surface_tolerance` = 0.000001 m. A buried or floating sensor may miss contact. |
| A008 | info | Zero armature and rest-pose effective inertia below `min_inertia` = 1e-6 (kg for slides, kg·m² for hinges). Small effective inertia increases sensitivity to integration settings. |
| P001 | warn | Peak unactuated motion over `passive_seconds` = 2 s above `passive_drift` = 0.02 of range. Spring hinges also start 1% off the lower stop to reveal unstable equilibria. |
| P002 | error | Drive from each endpoint to the opposite one for `drive_seconds` = 3 s. Require `required_travel` = 0.95 of range at the end. Allows settling tolerance while identifying blocked travel under bounded effort. |
| P003 | warn | Drive into the upper stop and release for 0.12 s. Report rebound over `rebound_degrees` = 2° for hinges or `rebound_fraction` = 0.02 of slide range. Return buttons use P004 because the spring deliberately moves them away from the stop. |
| P004 | error | Press to the control threshold or `press_fraction` = 0.6, release for `button_seconds` = 0.5 s, and require residual travel below `button_return` = 0.1. A stuck or non-returning button cannot repeat a press. |
| P005 | error | A sphere of radius `touch_radius` = 0.004 m presses at `touch_multiplier` = 1.25 times the required force. The addressed sensor must reach its declared minimum or `touch_force` = 1 N, with all other touch readings zero. Count target responses within one probe radius of the site center. |
| P006 | error | During both P002 sweeps flag non-parent rigid-link penetration above `penetration` = 0.001 m. This tolerates shallow solver contact while exposing deeper interference. |
| Drive effort | P002–P004 | Use declared effort when available, otherwise `default_effort` = 150 N or N·m. The compiled joint actuator-force range can further cap the effort. |

Each experiment starts from a fresh simulation state at a fixed 2 ms timestep, implicitfast integrator and gravity of −9.81 m/s² along Z. Model actuators are disabled. The shared position controller uses proportional gain 400, critical damping from the instantaneous inertia and spring compensation. Targets ramp at the declared velocity or 0.5 m/s for slides and 2 rad/s for hinges. Other bounded joints are held at their starting positions, with prerequisites from the role map or embedded metadata set first. The rebound test standardizes incoming speed at the smaller of the default speed and twice the joint span per second. The button press lasts at most 0.5 s. The touch probe starts 0.1 mm above the region and presses for 100 steps.

## Measuring detection

```sh
npm run dataset -- --samples 3 --corners --mjcf
python -m sim.lint.faults --dataset dist/dataset --out reports/faults
```

Each manifest record is checked clean first. Each applicable mutation starts from its own copy of that record, on the first eligible target for that class. A detection requires a newly fired rule on the targeted element. Inapplicable cases are explicit. The command writes Markdown and per-record JSON and exits 1 on a missed mutation or a clean error.

| Mutation | Change | Required finding |
| --- | --- | --- |
| stuck_drawer | Raise slide frictionloss to at least 1000 and at least 1000× its initial value. | P002 |
| sticky_button | Remove the button spring and set frictionloss to 100. | A006 and P004 |
| dead_sensor | Move the touch site 5 cm along its outward normal. | A007 and P005 |
| contact_bounce | Set the damping ratio of an un-sprung travel stop to 0.05. | P003 |
| ghost_handle | Disable both contact masks on the raised grip geom. | A004 or A005 |
| free_swing | Remove damping and frictionloss from a spring-balanced hinge. | A002 and P001 |
| feather_door | Scale the entire hinge subtree's mass and inertia together by 0.001, capped at 0.5 g to exercise the 1 g rule for heavy doors. | A003 |

Finite trajectories cover the specified initial states, controller, contacts and thresholds. Robot-specific grasp strategies, task sequences, external controllers and deliberate continuous joints can change the interpretation. A clean report provides evidence for those tested conditions. It cannot establish that every interaction succeeds.

[Release results](../reports/lint-opa-2026-11-27.md) · [CI detection matrix](../reports/faults/matrix.md) · [External fixture measurements](../reports/lint-robocasa-2026-11-27.md)
