# Articulation lint and fault detection

29 MJCF records. Each count represents a fresh simulation or static inspection.

| Asset | Clean records | Errors | Warnings | Info |
| --- | ---: | ---: | ---: | ---: |
| appliances/microwave | 6 | 0 | 10 | 0 |
| appliances/oven | 6 | 0 | 3 | 6 |
| furniture/cabinet | 8 | 0 | 0 | 0 |
| furniture/drawer_cabinet | 9 | 0 | 6 | 0 |

Cells show caught / applicable. A dash marks an inapplicable fault.

| Fault | Expected rule(s) | appliances/microwave | appliances/oven | furniture/cabinet | furniture/drawer_cabinet |
| --- | --- | ---: | ---: | ---: | ---: |
| stuck_drawer | P002 | — | 6/6 | — | 9/9 |
| sticky_button | A006, P004 | 2/2 | — | — | — |
| dead_sensor | A007, P005 | 4/4 | 3/3 | — | — |
| contact_bounce | P003 | 6/6 | 6/6 | 8/8 | 9/9 |
| ghost_handle | A004, A005 | 4/4 | 6/6 | 8/8 | 7/7 |
| free_swing | A002, P001 | — | 6/6 | — | — |
| feather_door | A003 | 6/6 | 6/6 | 8/8 | — |

Only a newly triggered rule on the targeted element counts. Ghost handles accept either listed rule.
These observations apply to the specified mutations and finite probe trajectories.
