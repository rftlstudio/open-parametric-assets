# RoboCasa fixture observations

Loaded 10 of 10 selected fixtures at `7bfc60c9d26c02506d4265cbe0e86b35e6e25d42` with MuJoCo 3.3.7.

## Scope and interpretation

These observations describe the tested fixture and probe. The standalone scene omits the robot, gripper, placement and high-level state logic. Continuous joints, low resistance and contact-driven buttons may be intentional. For enclosed slides, the controller holds the associated door at its declared open stop in both sweep directions. The sample covers individual variants of ten fixtures and does not characterize the full collection.

For each rule, the [threshold table](../docs/LINT.md) gives its units, rationale and configuration. The [source and reproduction notes](../lint/roles/robocasa/README.md) describe scene assembly and role assignments.

## cabinet_double

Source `robocasa/models/assets/fixtures/cabinets/cabinet_hinge.xml` (assembled).

No findings for this fixture under the tested conditions.

## cabinet_single

Source `robocasa/models/assets/fixtures/cabinets/cabinet_single.xml` (assembled).

No findings for this fixture under the tested conditions.

## coffee_machine

Source `robocasa/models/assets/fixtures/coffee_machines/CoffeeMachine036/model.xml` (standalone).

| Rule | Severity | Element | Measured | Threshold | Fix hint |
| --- | --- | --- | --- | --- | --- |
| A003 | warn | Button001_joint | {"body_inertia": [1.0076652016035362e-08, 1.007676668897541e-08, 1.7406956177418943e-08], "subtree_mass_kg": 0.0005476539777995642} | {"min_mass_kg": 0.001, "triangle": "Imax <= I1 + I2"} | Verify the moving link's density, scale and inertia. |
| A003 | warn | Button002_joint | {"body_inertia": [1.0076727560703474e-08, 1.0076843845006149e-08, 1.7407080310875465e-08], "subtree_mass_kg": 0.0005476561840452911} | {"min_mass_kg": 0.001, "triangle": "Imax <= I1 + I2"} | Verify the moving link's density, scale and inertia. |
| P002 | error | Button001_joint | {"effort": 150, "fraction": 0.5043471648671398, "target": 0.002} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | Button002_joint | {"effort": 150, "fraction": 0.9373297655456206, "target": 0.002} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P004 | error | Button001_joint | {"pressed": 0.32212038231421547, "released": 0.2868296062324087} | {"max_rest": 0.1, "min_press": 0.6} | Check the available pressing force and restoring spring against friction. |
| P004 | error | Button002_joint | {"pressed": 0.6029079228602418, "released": 0.6229578154225516} | {"max_rest": 0.1, "min_press": 0.6} | Check the available pressing force and restoring spring against friction. |

- P002 `Button001_joint` to 0.002 — prerequisite stops held: none.

- P002 `Button002_joint` to 0.002 — prerequisite stops held: none.

## dishwasher

Source `robocasa/models/assets/fixtures/dishwashers/Dishwasher031/model.xml` (standalone).

| Rule | Severity | Element | Measured | Threshold | Fix hint |
| --- | --- | --- | --- | --- | --- |
| P001 | warn | button_lock_joint | 3.3262300215287244 | 0.02 | Check gravity balance, rest position and passive resistance. |
| P001 | warn | button_power_joint | 3.326233013709477 | 0.02 | Check gravity balance, rest position and passive resistance. |
| P002 | error | door_joint | {"effort": 150, "fraction": 0.0023408836637436705, "target": 0.0} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | rack0_joint | {"effort": 150, "fraction": 0.5527475462344008, "target": 0.33} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P003 | warn | rack0_joint | 0.027944886652042422 | 0.006600000000000001 | Inspect limit damping and distinguish impact rebound from intentional return motion. |
| P004 | error | button_lock_joint | {"pressed": 0.6049890569986729, "released": 3.326289764264651} | {"max_rest": 0.1, "min_press": 0.6} | Check the available pressing force and restoring spring against friction. |
| P004 | error | button_power_joint | {"pressed": 0.6049894698798555, "released": 3.326292756495148} | {"max_rest": 0.1, "min_press": 0.6} | Check the available pressing force and restoring spring against friction. |
| P006 | error | rack0_joint | 0.04344489908047175 | 0.001 | Check the swept collision shapes and required opening sequence. |

- P002 `door_joint` to 0 — prerequisite stops held: none.

- P002 `rack0_joint` to 0.33 — prerequisite stops held: `door_joint` at upper.

- P006 `rack0_joint` — prerequisite stops held: `door_joint` at upper.

## drawer

Source `robocasa/models/assets/fixtures/cabinets/drawer.xml` (assembled).

| Rule | Severity | Element | Measured | Threshold | Fix hint |
| --- | --- | --- | --- | --- | --- |
| P002 | error | fixture_slidejoint | {"effort": 150, "fraction": 0.9082788195746178, "target": 0.0} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | fixture_slidejoint | {"effort": 150, "fraction": 0.9082788195746181, "target": -0.55} | 0.95 | Check effort, friction, joint limits and obstructions. |

- P002 `fixture_slidejoint` to 0 — prerequisite stops held: none.

- P002 `fixture_slidejoint` to -0.55 — prerequisite stops held: none.

## fridge

Source `robocasa/models/assets/fixtures/fridges/Refrigerator031/model.xml` (standalone).

No findings for this fixture under the tested conditions.

## microwave

Source `robocasa/models/assets/fixtures/microwaves/Microwave011/model.xml` (standalone).

| Rule | Severity | Element | Measured | Threshold | Fix hint |
| --- | --- | --- | --- | --- | --- |
| A001 | error | Disc001_joint | [0.0, 360.0] | "finite positive range and limited" | Declare the intended end stops or document continuous rotation. |

## oven

Source `robocasa/models/assets/fixtures/ovens/Oven031/model.xml` (standalone).

No findings for this fixture under the tested conditions.

## sink

Source `robocasa/models/assets/fixtures/sinks/Sink001/model.xml` (standalone).

No findings for this fixture under the tested conditions.

## stove

Source `robocasa/models/assets/fixtures/stoves/Stove001/model.xml` (standalone).

No findings for this fixture under the tested conditions.
