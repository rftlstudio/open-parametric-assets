# RoboCasa fixture observations

Loaded 10 of 10 selected fixtures at `7bfc60c9d26c02506d4265cbe0e86b35e6e25d42` with MuJoCo 3.3.7.

## Scope and interpretation

These observations describe the tested fixture and probe. The standalone scene omits the robot, gripper, placement and high-level state logic. Continuous joints, low resistance and contact-driven buttons may be intentional. A rack tested behind a closed door may need a task-level opening sequence. The sample covers individual variants of ten fixtures and does not characterize the full collection.

For each rule, the [threshold table](../docs/LINT.md) gives its units, rationale and configuration. The [source and reproduction notes](../lint/roles/robocasa/README.md) describe scene assembly and role assignments.

## cabinet_double

Source `robocasa/models/assets/fixtures/cabinets/cabinet_hinge.xml` (assembled).

| Rule | Severity | Element | Measured | Threshold | Fix hint |
| --- | --- | --- | --- | --- | --- |
| A003 | warn | fixture_leftdoorhinge | {"inertia": [0.0, 0.0, 0.0], "mass_kg": 0.0} | {"min_mass_kg": 0.001, "triangle": "Imax <= I1 + I2"} | Verify the moving link's density, scale and inertia. |
| A003 | warn | fixture_rightdoorhinge | {"inertia": [0.0, 0.0, 0.0], "mass_kg": 0.0} | {"min_mass_kg": 0.001, "triangle": "Imax <= I1 + I2"} | Verify the moving link's density, scale and inertia. |

## cabinet_single

Source `robocasa/models/assets/fixtures/cabinets/cabinet_single.xml` (assembled).

| Rule | Severity | Element | Measured | Threshold | Fix hint |
| --- | --- | --- | --- | --- | --- |
| A003 | warn | fixture_doorhinge | {"inertia": [0.0, 0.0, 0.0], "mass_kg": 0.0} | {"min_mass_kg": 0.001, "triangle": "Imax <= I1 + I2"} | Verify the moving link's density, scale and inertia. |

## coffee_machine

Source `robocasa/models/assets/fixtures/coffee_machines/CoffeeMachine036/model.xml` (standalone).

| Rule | Severity | Element | Measured | Threshold | Fix hint |
| --- | --- | --- | --- | --- | --- |
| A003 | warn | Button001_joint | {"inertia": [1.0076652016035362e-08, 1.007676668897541e-08, 1.7406956177418943e-08], "mass_kg": 0.0005476539777995642} | {"min_mass_kg": 0.001, "triangle": "Imax <= I1 + I2"} | Verify the moving link's density, scale and inertia. |
| A003 | warn | Button002_joint | {"inertia": [1.0076727560703474e-08, 1.0076843845006149e-08, 1.7407080310875465e-08], "mass_kg": 0.0005476561840452911} | {"min_mass_kg": 0.001, "triangle": "Imax <= I1 + I2"} | Verify the moving link's density, scale and inertia. |
| P002 | error | Button001_joint | {"effort": 150, "fraction": 0.5043471648671398, "target": 0.002} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | Button002_joint | {"effort": 150, "fraction": 0.9373297655456206, "target": 0.002} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P004 | error | Button001_joint | {"pressed": 0.32212038231421547, "released": 0.2868296062324087} | {"max_rest": 0.1, "min_press": 0.6} | Check the available pressing force and restoring spring against friction. |
| P004 | error | Button002_joint | {"pressed": 0.6029079228602418, "released": 0.6229578154225516} | {"max_rest": 0.1, "min_press": 0.6} | Check the available pressing force and restoring spring against friction. |

## dishwasher

Source `robocasa/models/assets/fixtures/dishwashers/Dishwasher031/model.xml` (standalone).

| Rule | Severity | Element | Measured | Threshold | Fix hint |
| --- | --- | --- | --- | --- | --- |
| P001 | warn | button_lock_joint | 3.3262300215287244 | 0.02 | Check gravity balance, rest position and passive resistance. |
| P001 | warn | button_power_joint | 3.326233013709477 | 0.02 | Check gravity balance, rest position and passive resistance. |
| P002 | error | door_joint | {"effort": 150, "fraction": 0.0023408836637436705, "target": 0.0} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | rack0_joint | {"effort": 150, "fraction": 0.13931700477041195, "target": 0.33} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | rack1_joint | {"effort": 150, "fraction": 0.34932878058756084, "target": 0.33} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P004 | error | button_lock_joint | {"pressed": 0.6049890569986729, "released": 3.326289764264651} | {"max_rest": 0.1, "min_press": 0.6} | Check the available pressing force and restoring spring against friction. |
| P004 | error | button_power_joint | {"pressed": 0.6049894698798555, "released": 3.326292756495148} | {"max_rest": 0.1, "min_press": 0.6} | Check the available pressing force and restoring spring against friction. |
| P006 | error | rack0_joint | 0.043450151024383064 | 0.001 | Check the swept collision shapes and required opening sequence. |
| P006 | error | rack1_joint | 0.04331289479265992 | 0.001 | Check the swept collision shapes and required opening sequence. |

## drawer

Source `robocasa/models/assets/fixtures/cabinets/drawer.xml` (assembled).

| Rule | Severity | Element | Measured | Threshold | Fix hint |
| --- | --- | --- | --- | --- | --- |
| P002 | error | fixture_slidejoint | {"effort": 150, "fraction": 0.9082788195746178, "target": 0.0} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | fixture_slidejoint | {"effort": 150, "fraction": 0.9082788195746181, "target": -0.55} | 0.95 | Check effort, friction, joint limits and obstructions. |

## fridge

Source `robocasa/models/assets/fixtures/fridges/Refrigerator031/model.xml` (standalone).

| Rule | Severity | Element | Measured | Threshold | Fix hint |
| --- | --- | --- | --- | --- | --- |
| P002 | error | freezer_drawer0_joint | {"effort": 150, "fraction": 0.02048267055966046, "target": 0.0} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | freezer_drawer0_joint | {"effort": 150, "fraction": 0.2894039346620258, "target": 0.38} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | freezer_drawer1_joint | {"effort": 150, "fraction": 0.012822213042021796, "target": 0.0} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | freezer_drawer1_joint | {"effort": 150, "fraction": 0.28480285181833487, "target": 0.38} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | fridge_drawer0_joint | {"effort": 150, "fraction": 0.40502142812022646, "target": 0.38} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | fridge_drawer0_joint | {"effort": 150, "fraction": 0.5228625531669182, "target": 0.0} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | fridge_drawer1_joint | {"effort": 150, "fraction": 0.0001409373692754103, "target": 0.0} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | fridge_drawer1_joint | {"effort": 150, "fraction": 0.4050215482979509, "target": 0.38} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P006 | error | freezer_drawer0_joint | 0.031096480963890828 | 0.001 | Check the swept collision shapes and required opening sequence. |
| P006 | error | freezer_drawer1_joint | 0.030524436826579845 | 0.001 | Check the swept collision shapes and required opening sequence. |
| P006 | error | fridge_drawer0_joint | 0.029860289684439753 | 0.001 | Check the swept collision shapes and required opening sequence. |
| P006 | error | fridge_drawer1_joint | 0.032244567489012645 | 0.001 | Check the swept collision shapes and required opening sequence. |

## microwave

Source `robocasa/models/assets/fixtures/microwaves/Microwave011/model.xml` (standalone).

| Rule | Severity | Element | Measured | Threshold | Fix hint |
| --- | --- | --- | --- | --- | --- |
| A001 | error | Disc001_joint | [0.0, 360.0] | "finite positive range and limited" | Declare the intended end stops or document continuous rotation. |

## oven

Source `robocasa/models/assets/fixtures/ovens/Oven031/model.xml` (standalone).

| Rule | Severity | Element | Measured | Threshold | Fix hint |
| --- | --- | --- | --- | --- | --- |
| P002 | error | rack0_joint | {"effort": 150, "fraction": 0.007309866172657666, "target": 0.0} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | rack0_joint | {"effort": 150, "fraction": 0.11847408966662253, "target": 0.27} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | rack1_joint | {"effort": 150, "fraction": -0.001239335855170833, "target": 0.0} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P002 | error | rack1_joint | {"effort": 150, "fraction": 0.19026379299501697, "target": 0.27} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P006 | error | rack0_joint | 0.06326668511414271 | 0.001 | Check the swept collision shapes and required opening sequence. |
| P006 | error | rack1_joint | 0.051236635087020886 | 0.001 | Check the swept collision shapes and required opening sequence. |

## sink

Source `robocasa/models/assets/fixtures/sinks/Sink001/model.xml` (standalone).

No findings for this fixture under the tested conditions.

## stove

Source `robocasa/models/assets/fixtures/stoves/Stove001/model.xml` (standalone).

| Rule | Severity | Element | Measured | Threshold | Fix hint |
| --- | --- | --- | --- | --- | --- |
| P002 | error | Shelf001_joint | {"effort": 150, "fraction": 0.1481954329584721, "target": 0.3} | 0.95 | Check effort, friction, joint limits and obstructions. |
| P006 | error | Shelf001_joint | 0.030414498881433067 | 0.001 | Check the swept collision shapes and required opening sequence. |
