# Running the task oracle

Build a dataset with `npm run dataset -- --samples 3 --corners --urdf`. Install
`pip install -r sim/requirements.txt`, then run
`python sim/oracle.py dist/dataset/data.jsonl` to see successes and failures grouped by task.
Every row includes its applicable task definitions and named states.

Each JSON file under `tasks/` declares the asset, English instruction, parameter filter,
initial joint fractions, goal predicate and simulation time budget in seconds.
All filter keys must match. Omitted joints start at the lower stop. The validator
resolves every applicable goal against the parts and controls of the generated variant.

A floating hand follows a grasp site's joint path using a site weld, or presses a region
with a 4 mm sphere. Joint prerequisites are satisfied before pulling. All contacts
are checked at each physics step with a 1 mm penetration tolerance. A momentary button or
touch goal is scored during contact; the probe then releases it. The returned step log
contains simulation time, joint coordinates, world hand pose and contacts. It stays in memory.

The five tasks exercise the first reachable alternative in an ordered disjunction and execute
conjunctions in order. The oracle implements the motion primitives used by these tasks.
Success measures feasibility for this simplified floating hand. It does not establish
reachability for a particular robot arm.

States describe instantaneous observations. On key-only microwave panels, a nonzero digit or
add-time key supplies the positive-time input. On touch ovens, a non-off mode key and
temperature-up key supply the heating inputs. These predicates describe concurrent input
signals; they do not model stored appliance settings.

