import { expect, it } from 'vitest';
import { evaluate, validateLogic } from '../lib/logic.js';
import fixture from './fixtures/logic-cases.json' with { type: 'json' };

const meta = { states: fixture.states, joints: [{name:'hinge'}], controls: [
  {name:'start',type:'button'}, {name:'mode',type:'knob',state:{values:['bake']}},
  {name:'temperature',type:'knob',state:{values:[0,175]}}] };
it('resolves and evaluates the cross-language cases', () => {
  validateLogic(meta, fixture.cases.map(([goal]) => goal));
  for (const [goal, result] of fixture.cases) expect(evaluate(goal, meta.states, fixture.snapshot)).toBe(result);
});
it('rejects unresolved leaves, invalid operators, out-of-range thresholds and indirect cycles', () => {
  for (const goal of [{joint:'missing',op:'>',val:0}, {joint:'hinge',op:'=',val:0},
    {joint:'hinge',op:'>',val:1.1}, {state:'absent'}, {any:[]}, {control:'wrong',op:'==',val:true}])
    expect(() => validateLogic(meta,[goal])).toThrow();
  expect(() => validateLogic({...meta, states:{a:{state:'b'},b:{not:{state:'a'}}}})).toThrow(/cycle/);
});

