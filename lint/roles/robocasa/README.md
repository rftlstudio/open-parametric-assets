# RoboCasa fixture sources and role maps

The 10 JSON files identify the tested fixture, exact upstream revision and articulated parts. Clone RoboCasa at `7bfc60c9d26c02506d4265cbe0e86b35e6e25d42`. Its license file supplies the MIT code license and accompanying notices. Its README separately designates datasets and assets as CC BY 4.0. Consult the upstream terms when obtaining or reusing the models. This repository publishes role mappings and measured observations. [License file](https://github.com/robocasa/robocasa/blob/7bfc60c9d26c02506d4265cbe0e86b35e6e25d42/LICENSE) · [Upstream README](https://github.com/robocasa/robocasa/blob/7bfc60c9d26c02506d4265cbe0e86b35e6e25d42/README.md#license)

| Selected fixture | Role assignment |
| --- | --- |
| SingleCabinet / HingeCabinet | One or two door hinges on procedurally attached cabinet panels. |
| Drawer | The constructed drawer's translation joint. |
| Microwave011 | Door hinge and turntable. This variant handles button contact in the fixture logic without a dedicated moving button joint. |
| Dishwasher031 | Door, two racks, lock and power buttons. |
| Refrigerator031 | Two doors and four inner drawers. |
| Oven031 | Door, temperature and timer knobs, two racks. |
| Stove001 | Burner and oven knobs, oven door and shelf. |
| Sink001 | Faucet flow and temperature controls, spout. |
| CoffeeMachine036 | Two buttons and two lids. |

Joint names were mapped against the fixture implementation and the selected model. Button-specific probes require an actual joint, and touch probes require a declared touch sensor. The maps do not add mechanisms to the fixtures. [Fixture implementations](https://github.com/robocasa/robocasa/tree/7bfc60c9d26c02506d4265cbe0e86b35e6e25d42/robocasa/models/fixtures)

## Reproduce the measurements

1. From the OPA repository root, clone and pin the source:

   ```sh
   git clone https://github.com/robocasa/robocasa.git ../robocasa
   git -C ../robocasa checkout 7bfc60c9d26c02506d4265cbe0e86b35e6e25d42
   ```

2. Use a separate Python 3.12 environment for assembly. The tested environment used RoboCasa from the pinned checkout, robosuite 1.5.2, NumPy 2.2.5 and MuJoCo 3.3.1. The two MuJoCo versions serve separate stages. With that environment active, install the fixture dependencies and download the upstream asset bundles:

   ```sh
   python -m pip install robosuite==1.5.2 numpy==2.2.5 mujoco==3.3.1 gymnasium pyyaml h5py lxml imageio
   python -m pip install --no-deps -e ../robocasa
   python ../robocasa/robocasa/scripts/download_kitchen_assets.py --type fixtures_lw tex
   python scripts/robocasa_extract.py --out dist/robocasa-assembled
   ```

   The three cabinet templates are in Git. The extractor invokes the original SingleCabinet, HingeCabinet and Drawer constructors at 0.60 × 0.55 × 0.70 m with seed 0, attaches each fixture to a robosuite world, compiles and saves the result with `mj_saveLastXML`. Keep upstream textures accessible while checking the compiled files. For the seven appliances, the original XMLs and their referenced geometry come from the download bundle and load directly. [Downloader and registry keys](https://github.com/robocasa/robocasa/blob/7bfc60c9d26c02506d4265cbe0e86b35e6e25d42/robocasa/scripts/download_kitchen_assets.py) · [Upstream bundle sources](https://github.com/robocasa/robocasa/blob/7bfc60c9d26c02506d4265cbe0e86b35e6e25d42/robocasa/models/assets/box_links/box_links_assets.json)

   Downloaded archive SHA-256 values:

   | Bundle | SHA-256 |
   | --- | --- |
   | fixtures_lw | `62c1c87776edda9b7c42dda7b00781a1e5a7f90acc3e49d06c39c9545cbd6c3e` |
   | tex | `ba3a4dcef96e199cbd601c7cdb7eb46077fb6672611b7ac74c25a191bf0be392` |

3. In the OPA environment with MuJoCo 3.3.7, run:

   ```sh
   python -m pip install -r sim/requirements.txt
   python scripts/lint-robocasa.py --checkout ../robocasa --extracted dist/robocasa-assembled --out reports/lint-robocasa-2026-11-27
   ```

The script verifies the Git revision and writes Markdown and JSON. Each fixture is measured in isolation using the linter's default controller and thresholds. See the [observation report](../../../reports/lint-robocasa-2026-11-27.md).
