const compare = new Map([
  ['==', (a,b) => a === b], ['<', (a,b) => a < b], ['<=', (a,b) => a <= b],
  ['>', (a,b) => a > b], ['>=', (a,b) => a >= b]
]);

export function validateLogic(meta, goals = []) {
  const states = meta.states;
  if (!states || typeof states !== 'object' || Array.isArray(states)) throw Error('Expected named states');
  const checked = new Set(), visiting = new Set();
  function state(name) {
    if (!Object.hasOwn(states, name)) throw Error('Unknown state ' + name);
    if (visiting.has(name)) throw Error('State cycle at ' + name);
    if (checked.has(name)) return;
    visiting.add(name);
    visit(states[name]);
    visiting.delete(name);
    checked.add(name);
  }
  function visit(n) {
    if (!n || typeof n !== 'object' || Array.isArray(n)) throw Error('Invalid logic node');
    const keys = Object.keys(n).sort().join(',');
    if (keys === 'all' || keys === 'any') {
      if (!Array.isArray(n[keys]) || !n[keys].length) throw Error('Expected nonempty ' + keys);
      n[keys].forEach(visit);
    } else if (keys === 'not') visit(n.not);
    else if (keys === 'state' && typeof n.state === 'string') state(n.state);
    else if (keys === 'joint,op,val') {
      if (!meta.joints.some(j => j.name === n.joint) || !compare.has(n.op) || n.op === '==' ||
          !Number.isFinite(n.val) || n.val < 0 || n.val > 1) throw Error('Invalid joint predicate ' + n.joint);
    } else if (keys === 'control,op,val') {
      const c = meta.controls?.find(c => c.name === n.control);
      const types = c?.type === 'knob' ? c.state.values.map(v => typeof v) : ['boolean'];
      if (!c || !compare.has(n.op) || !types.includes(typeof n.val) ||
          (typeof n.val !== 'number' && n.op !== '==')) throw Error('Invalid control predicate ' + n.control);
    } else throw Error('Invalid logic node: ' + keys);
  }
  Object.keys(states).forEach(state);
  goals.forEach(visit);
}

// Snapshots contain normalized joint fractions and decoded control values.
export function evaluate(n, states, snapshot) {
  const sub = child => evaluate(child, states, snapshot);
  if ('all' in n) return n.all.every(sub);
  if ('any' in n) return n.any.some(sub);
  if ('not' in n) return !sub(n.not);
  if ('state' in n) return sub(states[n.state]);
  const values = 'joint' in n ? snapshot.joints : snapshot.controls;
  const name = n.joint ?? n.control;
  if (!Object.hasOwn(values, name)) throw Error('Missing snapshot value ' + name);
  return compare.get(n.op)(values[name], n.val);
}

