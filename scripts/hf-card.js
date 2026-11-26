import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [folder, tag] = process.argv.slice(2);
if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Expected a vX.Y.Z release tag');
const manifest = join(folder, 'data.jsonl');
const records = (await readFile(manifest, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
const commits = new Set(records.map(r => r.provenance.git_commit));
if (commits.size !== 1 || !/^[a-f0-9]{40}$/.test(records[0].provenance.git_commit)) {
  throw new Error('Expected one source commit in the release');
}
const counts = new Map();
for (const record of records) {
  counts.set(record.asset_id, (counts.get(record.asset_id) ?? 0) + 1);
}
const summary = execFileSync('python', [
  fileURLToPath(new URL('../sim/summarize_tasks.py', import.meta.url)), manifest
], { encoding: 'utf8' }).trim();
const taskRows = summary.split(/\r?\n/).map(line => {
  const match = /^(.*): (\d+)\/(\d+) passed$/.exec(line);
  if (!match) throw new Error('Unexpected oracle summary: ' + line);
  const [, task, passed, total] = match;
  return `| ${task} | ${total} | ${passed}/${total} |`;
});
const sizes = ['n<1K', '1K<n<10K', '10K<n<100K', '100K<n<1M', '1M<n<10M'];
const size = sizes[Math.max(0, Math.floor(Math.log10(records.length)) - 2)];
if (!size) throw new Error('Unexpected release size');
const repo = 'https://github.com/rftlstudio/open-parametric-assets';
const card = `---
license: cc-by-4.0
task_categories: [robotics]
tags: [mujoco, mjcf, urdf, articulated-objects, simulation, manipulation]
pretty_name: Open Parametric Assets
size_categories: ["${size}"]
configs:
  - config_name: default
    data_files: data.jsonl
---

# Open Parametric Assets

A parametric generator and physics verifier for articulated and panel objects.
It catches simulation-asset exploits before they reach training.

All ${records.length} variants ship with GLB, renders, URDF, native MJCF and passing simulation reports for both physics formats.

| Asset | Variants |
| --- | ---: |
${[...counts].sort().map(([name, count]) => `| ${name} | ${count} |`).join('\n')}

| Oracle task | Variants with task | Passed / attempted |
| --- | ---: | ---: |
${taskRows.join('\n')}

## Load and run

From the [GitHub checkout](${repo}) with Python installed:

\`\`\`sh
python -m pip install mujoco==3.3.7
python examples/demo/demo.py
python examples/demo/demo.py --hf
python examples/demo/demo.py --hf --task open_door_pull_rack
python examples/demo/demo.py --task open_door_pull_rack --view
\`\`\`

The JSONL manifest links each model to its parameters, joints, controls, tasks, renders and simulation reports. The checks exercise scripted interactions in MuJoCo.

Credit the Open Parametric Assets contributors when reusing this [CC BY 4.0 dataset](https://creativecommons.org/licenses/by/4.0/). Generator and demo code use Apache-2.0.
[Repository](${repo}) · [Dataset tag ${tag}](https://huggingface.co/datasets/rftlstudio/open-parametric-assets/tree/${tag}) · [Source commit ${records[0].provenance.git_commit}](${repo}/commit/${records[0].provenance.git_commit})
`;
await writeFile(join(folder, 'README.md'), card);
