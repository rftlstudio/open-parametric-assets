# Build and publish the verified dataset

From a checkout of the source commit, use Node.js 24, Bash and a Python 3.12 environment. Keep the same commit and sample flags to reproduce the record IDs.

```sh
npm ci
npx playwright install --with-deps --only-shell chromium
python -m pip install -r sim/requirements.txt
bash scripts/build-release.sh v0.4.0
```

The script builds 50 seeded samples per asset plus fixed corners, renders every view, checks every URDF and MJCF, runs task summaries and checks format parity. It reads both simulation reports for each ID. It promotes the staging directory to `dist/release/` after all checks pass and prints the total bytes. If the verified package exceeds 500 MB it repeats with fewer samples. Move an older release directory aside before running again. Failed build workspaces stay in `dist/` for inspection.

The release contains the JSONL manifest, card, parameterized model outputs, views and simulation reports. To refresh the three offline fixtures, run the following with an empty destination and replace the previous model directories with the generated ones:

```sh
python scripts/demo-models.py dist/release dist/offline-models
```

To reproduce the README animation, install Pillow in the developer environment and run `python scripts/record_gif.py`. The demo itself only needs `mujoco==3.3.7`. On macOS use `mjpython examples/demo/demo.py --view` for the interactive viewer.

## Publish manually

Use a separate local environment for the CLI. Create or select the public dataset repository `rftlstudio/open-parametric-assets` on Hugging Face. Run these commands from the project checkout after inspecting the verified release. Login stores credentials locally.

```sh
python -m pip install "huggingface_hub==1.6.0" "typer==0.20.0"
hf auth login
hf upload rftlstudio/open-parametric-assets dist/release . --repo-type dataset --commit-message "v0.4.0"
hf repos tag create rftlstudio/open-parametric-assets v0.4.0 --repo-type dataset
```

Use the verified upload commit when tagging if the dataset branch has advanced (`--revision COMMIT`). A new published version needs a new tag and a matching pinned revision in the demo. [Hugging Face CLI reference for 1.6.0](https://huggingface.co/docs/huggingface_hub/v1.6.0/package_reference/cli)

After uploading, run `python examples/demo/demo.py --hf` and `python examples/demo/demo.py --hf --task open_door_pull_rack` and paste the PASS output in the PR. The demo downloads the pinned manifest and only the selected MJCFs and their referenced meshes. It reuses files in `~/.cache/open-parametric-assets/v0.4.0/`.
