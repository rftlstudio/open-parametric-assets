import { readdirSync, readFileSync } from 'node:fs';
import { validateLogic } from './logic.js';
import { accepts } from './parameters.js';

const directory = new URL('../tasks/', import.meta.url);
const tasks = readdirSync(directory, { recursive: true }).filter(p => p.endsWith('.json')).sort()
  .map(p => JSON.parse(readFileSync(new URL(p.replaceAll('\\', '/'), directory), 'utf8')));

export function validateTasks(meta, schema, params) {
  const selected = [];
  for (const task of tasks.filter(t => t.asset_id === meta.id)) {
    for (const [name, values] of Object.entries(task.applies_when)) {
      if (!schema.parameters[name] || !Array.isArray(values) || !values.length ||
          !values.every(v => accepts(schema.parameters[name], v))) throw Error('Invalid filter in ' + task.id);
    }
    if (!Object.entries(task.applies_when).every(([k,v]) => v.includes(params[k]))) continue;
    if (!(Number.isFinite(task.horizon_s) && task.horizon_s > 0) || !task.instruction) throw Error('Invalid task ' + task.id);
    for (const [name, fraction] of Object.entries(task.init)) {
      if (!meta.joints.some(j => j.name === name) || !Number.isFinite(fraction) || fraction < 0 || fraction > 1)
        throw Error('Invalid initial position in ' + task.id);
    }
    selected.push(task);
  }
  validateLogic(meta, selected.map(t => t.goal));
  return selected;
}

