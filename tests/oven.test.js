import { Box3 } from 'three';
import { expect, it } from 'vitest';
import * as oven from '../assets/appliances/oven/index.js';
import { createAsset as microwave } from '../assets/appliances/microwave/index.js';
import { inspect } from '../validator/geometry.js';
import { validateAsset } from '../validator/validate.js';

it('validates the oven domain and installation envelope', () => {
  expect(validateAsset(oven,'appliances/oven').cases).toBe(21);
  for (const bad of [{width:0.65},{height:0.55},{depth:0.56},{rackCount:4}]) expect(() => oven.createAsset(bad)).toThrow();
  const root=oven.createAsset({width:0.75,height:0.45});
  expect(root.userData.installation.cutout).toEqual([0.75,0.45,0.55]);
  root.userData.installation.cutout[2]=0.54;
  expect(() => inspect(root,'appliances/oven',2200)).toThrow(/cutout/);
});

it('selects distinct, repeatable runner levels with no rack overlap', () => {
  const heights=seed=>{
    const root=oven.createAsset({rackCount:3},{seed});
    const racks=root.userData.joints.filter(j=>j.type==='prismatic').map(j=>root.getObjectByName(j.childPart));
    const boxes=racks.map(r=>new Box3().setFromObject(r,true));
    for(let i=0;i<boxes.length;i++) for(const other of boxes.slice(i+1)) expect(boxes[i].intersectsBox(other)).toBe(false);
    return racks.map(r=>r.position.y);
  };
  expect(heights(42)).toEqual(heights(42));
  expect(new Set(Array.from({length:8},(_,i)=>heights(i).join(','))).size).toBeGreaterThan(1);
});

it('describes both fascia styles and exact dimensions without raw wear', () => {
  for(const controlStyle of ['physical','touch']){
    const text=oven.describe({width:0.75,height:0.45,controlStyle,rackCount:3,finish:'black',handleStyle:'recessed',wear:0.25},()=>0);
    for(const word of ['75 cm','compact','black','3 racks','recessed',controlStyle,'lightly worn']) expect(text).toContain(word);
    expect(text).not.toContain('0.25');
  }
});

it('places visual ticks on the stationary panel for each knob detent', () => {
  for(const root of [oven.createAsset(),microwave()]) {
    for(const c of root.userData.controls.filter(c=>c.type==='knob')){
      const {positions,values}=c.state;
      const joint=root.userData.joints.find(j=>j.name===c.joint);
      for(const [i,angle] of positions.entries()){
        const tick=root.getObjectByName(c.name+'_tick_'+i);
        expect(tick.userData).toMatchObject({visualOnly:true,scaleFor:c.name,labelled:values.length<=12 || i%5===0});
        expect(root.getObjectByName(joint.childPart).getObjectById(tick.id)).toBeUndefined();
        const vertex=tick.geometry.attributes.position;
        // First quad is the radial tick, centered on the indicator angle.
        let x=0,y=0;
        for(let k=0;k<4;k++){x+=vertex.getX(k);y+=vertex.getY(k);}
        expect(x/Math.hypot(x,y)).toBeCloseTo(-joint.axis[2]*Math.sin(angle),4);
        expect(y/Math.hypot(x,y)).toBeCloseTo(Math.cos(angle),4);
      }
    }
  }
});

it('validates hinge spring units and limits and requires a joint spring for each button', () => {
  const root=oven.createAsset();
  root.userData.joints[0].dynamics.spring.restPosition=2;
  expect(() => inspect(root,'appliances/oven',2200)).toThrow(/spring/);
  const appliance=microwave();
  const control=appliance.userData.controls.find(c=>c.type==='button');
  const joint=appliance.userData.joints.find(j=>j.name===control.joint);
  expect(control.state).not.toHaveProperty('spring');
  delete joint.dynamics.spring;
  expect(() => inspect(appliance,'appliances/microwave',1800)).toThrow(/spring/);
});
