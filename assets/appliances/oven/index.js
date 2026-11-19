import { jointAt, controlAt, pressed } from '../../../lib/state-predicates.js';
import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { resolveParams, seededRandom } from '../../../lib/parameters.js';
import { wearBand, wearParameter } from '../../../lib/furniture-finish.js';
import { dialScale, markControl } from '../../../lib/control-marks.js';

const choice = (values, description) => ({type:'enum', enum:values, default:values[0], unit:'none', description});
export const schema = { triangleLimit:2200, parameters:{
  width:{type:'number', min:0.60,max:0.90,step:0.15,default:0.60,unit:'m',description:'Nominal installation width.'},
  height:{type:'number',min:0.45,max:0.60,step:0.15,default:0.60,unit:'m',description:'Nominal installation height.'},
  depth:{type:'number',min:0.55,max:0.55,default:0.55,unit:'m',description:'Fixed installation depth.'},
  controlStyle:choice(['physical','touch'],'Fascia controls.'),
  rackCount:{type:'integer',min:1,max:3,default:2,unit:'count',description:'Number of pull-out racks.'},
  handleStyle:choice(['bar','recessed'],'Door handle.'),
  finish:{...choice(['stainless','black','white'],'Fascia and door finish.'),
    labels:{stainless:'brushed stainless steel',black:'black',white:'white'}}, wear:wearParameter
}};
export function describe(params, random) {
  const p = resolveParams(schema,params);
  return (random()<0.5 ? 'A ' : 'Build a ') + Math.round(100*p.width) + ' cm built-in oven with a ' +
    (p.height===0.45 ? 'compact' : 'full-height') + ' body, ' + schema.parameters.finish.labels[p.finish] + ' finish, ' +
    p.rackCount + (p.rackCount===1 ? ' rack' : ' racks') + ', a ' + p.handleStyle + ' handle and ' +
    (p.controlStyle==='physical' ? 'two physical dials' : 'a touch strip') + '. It looks ' + wearBand(p.wear) + '.';
}
function material(color,density,options={}) {
  const m = new MeshStandardMaterial({color,...options});
  m.userData.densityKgM3 = density;
  return m;
}
function group(parent,name,x,y,z) {
  const part = new Group();
  part.name=name; part.position.set(x,y,z); parent.add(part);
  return part;
}
const modes=['off','bake','fan_bake','grill','defrost'];
const icons=['off','bake','fan','grill','defrost'];
export function createAsset(params={}, {seed=0}={}) {
  const p=resolveParams(schema,params), random=seededRandom(seed);
  const {width:w,height:h,depth:d}=p, front=d/2, fasciaH=h*0.12, doorH=h-fasciaH-0.01;
  const root=new Group(), joints=[], controls=[], affordances=[];
  root.name='oven';
  const body=group(root,'body',0,0,0);
  const shell=material({stainless:'#a6adb2',white:'#eeeeea',black:'#292d33'}[p.finish],600,{roughness:0.4+p.wear*0.4});
  const enamel=material('#3a4047',650), steel=material('#a7aeb5',5500), dark=material('#1f2428',800);
  const glass=material('#537077',2500,{transparent:true,opacity:0.36});
  let mass=0;
  function box(parent,name,size,center,m=shell) {
    const mesh=new Mesh(new BoxGeometry(...size),m);
    mesh.name=name; mesh.position.set(...center); parent.add(mesh);
    mass+=size.reduce((a,b)=>a*b,m.userData.densityKgM3);
    return mesh;
  }
  function place(part,point,size,normal=[0,1,0]) {
    affordances.push({type:'placeable',part:part.name,point,normal,size});
  }
  for(const sign of [-1,1]) {
    box(body,sign<0?'case_left':'case_right',[0.012,h-0.008,d],[sign*(w/2-0.01),h/2,0]);
  }
  const floor=box(body,'cavity_floor',[w-0.032,0.012,d],[0,0.012,0],enamel);
  place(floor,[0,0.006,-0.19],[w-0.05,0.13]);
  box(body,'case_back',[w-0.032,h-0.03,0.012],[0,h/2,-front+0.006],enamel);
  box(body,'cavity_ceiling',[w-0.032,0.012,d],[0,h-fasciaH,0],enamel);
  box(body,'case_top',[w-0.032,0.008,d],[0,h-0.006,0]);
  const panel=box(root,'fascia',[w,fasciaH,0.014],[0,h-fasciaH/2,front+0.008],dark);
  const door=group(root,'door',0,0.006,front+0.015);
  const dw=w-0.008, wh=doorH*0.55, ww=dw*0.60, side=(dw-ww)/2, end=(doorH-wh)/2;
  for(const sign of [-1,1]) box(door,sign<0?'door_left':'door_right',[side,doorH,0.018],[sign*(dw-side)/2,doorH/2,0]);
  box(door,'door_bottom',[ww,end,0.018],[0,end/2,0]);
  const lip=p.handleStyle==='recessed';
  box(door,'door_top',[ww,end-(lip?0.018:0),0.018],[0,doorH-end/2-(lip?0.009:0),0]);
  const window=box(door,'door_window',[ww,wh,0.004],[0,doorH/2,0],glass);
  place(window,[0,0,-0.002],[ww,wh],[0,0,-1]);
  if(lip) {
    box(door,'pull_lip',[ww,0.018,0.003],[0,doorH-0.009,0.0075],dark);
    box(door,'pull_back',[ww,0.018,0.003],[0,doorH-0.009,-0.0075],dark);
    affordances.push({type:'grasp',grip:'recessed',part:'pull_lip',point:[0,0,-0.0075]});
  } else {
    for(const sign of [-1,1]) box(door,'handle_post_'+(sign<0?'left':'right'),[0.015,0.015,0.035],[sign*dw*0.36,doorH-0.032,0.0265],dark);
    box(door,'door_handle',[dw*0.77,0.016,0.014],[0,doorH-0.032,0.051],dark);
    affordances.push({type:'grasp',grip:'raised',part:'door_handle',point:[0,0,0]});
  }
  // Balance the open-door gravity moment with a linear spring at full travel.
  let gravityMoment=0;
  for(const part of door.children) {
    const {width,height,depth}=part.geometry.parameters;
    gravityMoment+=width*height*depth*part.material.userData.densityKgM3*9.81*part.position.y;
  }
  joints.push({name:'door_hinge',behavior:'balanced_door',type:'revolute',childPart:'door',axis:[1,0,0],limits:[0,1.57],
    dynamics:{spring:{stiffness:gravityMoment/1.57,restPosition:0},friction:gravityMoment*0.12,damping:gravityMoment*0.8},
    effort:100,velocity:1});
  const levels=Array.from({length:5},(_,i)=>0.059+i*(doorH-0.112)/4);
  const rackW=w-0.045, rackD=0.46;
  for(const [i,y] of levels.entries()) for(const sign of [-1,1]) {
    box(body,'runner_'+(i+1)+(sign<0?'_left':'_right'),[0.015,0.005,rackD],[sign*(w/2-0.024),y-0.0064,0],steel);
  }
  const available=[0,1,2,3,4];
  for(let i=1;i<=p.rackCount;i++) {
    const [level]=available.splice(Math.floor(random()*available.length),1);
    const name='rack_'+i, rack=group(root,name,0,levels[level],0);
    for(const sign of [-1,1]) {
      box(rack,name+(sign<0?'_left':'_right'),[0.006,0.007,rackD],[sign*(rackW-0.006)/2,0,0],steel);
      box(rack,name+(sign<0?'_back':'_front'),[rackW-0.012,0.007,0.007],[0,0,sign*(rackD-0.007)/2],steel);
    }
    // Eight cross-wires support a 5 cm load around the central reference wire.
    const wireOffsets=[-0.18,-0.11,-0.022,0,0.022,0.085,0.14,0.19];
    for(let k=0;k<wireOffsets.length;k++) {
      const z=wireOffsets[k];
      const wire=box(rack,name+'_wire_'+k,[rackW-0.012,0.006,0.006],[0,0,z],steel);
      if(k===3) place(wire,[0,0.003,0],[rackW-0.024,0.076]);
    }
    affordances.push({type:'grasp',grip:'raised',part:name+'_front',point:[0,0,0]});
    joints.push({name:name+'_slide',type:'prismatic',childPart:name,axis:[0,0,1],limits:[0,rackD/2],
      requires:[{joint:'door_hinge',at:'upper'}],velocity:0.2,effort:100,dynamics:{damping:1,friction:0.1},
      clearance:{moving:name,stationary:['case_left','case_right'],minRetainedRatio:0.3}});
  }
  function knob(fn,x,values,unit,icon,detentIcons) {
    const name=fn+'_knob', radius=0.013;
    const moving=group(root,name,x,panel.position.y,front+0.024);
    const cap=new Mesh(new CylinderGeometry(radius,radius,0.012,24).rotateX(Math.PI/2),shell);
    cap.name=name+'_cap';moving.add(cap);
    mass+=12*Math.sin(Math.PI/12)*radius**2*0.012*600;
    box(moving,name+'_pointer',[0.002,0.003,0.001],[0,0.010,0.0065],dark);
    const upper=Math.PI*1.5;
    const joint={name:name+'_rotation',type:'revolute',childPart:name,axis:[0,0,-1],limits:[0,upper],
      effort:0.3,velocity:5,dynamics:{damping:0.04,friction:0.02}};
    joints.push(joint);
    const state={kind:'detent',values,positions:values.map((_,i)=>upper*i/(values.length-1)),unit};
    if(detentIcons) state.icons=detentIcons;
    const control={name,type:'knob',function:fn,icon,label:fn==='mode'?'MODE':'TEMP',joint:joint.name,
      region:{part:cap.name,point:[0,0,0.006],normal:[0,0,1],size:[0.011,0.011]},state};
    controls.push(control);
    dialScale(panel,control,joint,[x,0,0.007],radius);
  }
  if(p.controlStyle==='physical') {
    knob('mode',-0.055,modes,'mode','bake',icons);
    knob('temperature',0.055,[0,...Array.from({length:9},(_,i)=>50+25*i)],'degC','thermometer');
  } else {
    const keys=[...modes.map((mode,i)=>['mode',mode.toUpperCase().replace('_',' '),icons[i],mode]),
      ['temp_up','TEMP UP','up'],['temp_down','TEMP DOWN','down'],['start','START','play'],['stop','STOP','stop']];
    for(const [i,[fn,label,icon,value]] of keys.entries()) {
      controls.push({name:(value??fn)+'_key',type:'touch',function:fn,label,icon,...(value?{value}:{}),
        region:{part:panel.name,point:[(i-4)*w/10,0,0.007],normal:[0,0,1],size:[w/10-0.006,fasciaH*0.67]},
        state:{kind:'touch',minForceN:1}});
    }
  }
  for(const c of controls) markControl(root.getObjectByName(c.region.part),c);
  const target=32+6*(w-0.60)/0.30, equipment=[w*0.65,fasciaH*0.55,d*0.65];
  box(body,'electronics',equipment,[0,panel.position.y,0],material('#33383e',(target-mass)/equipment.reduce((a,b)=>a*b)));
  root.updateMatrixWorld(true);
  const bounds=new Box3().setFromObject(root,true);
  root.userData={id:'appliances/oven',category:'appliances',version:'0.1.0',units:'m',license:'CC-BY-4.0',
    boundingBox:{min:bounds.min.toArray(),max:bounds.max.toArray()},installation:{type:'built_in',cutout:[w,h,d]},
    physics:{massKg:mass,friction:0.5,collision:'compound'},joints,controls,affordances};
  const modesOn = controls.filter(c => c.function === 'mode' && c.value !== 'off');
  const modeOn = p.controlStyle === 'physical' ? { not: controlAt(modesOn[0], '==', 'off') }
    : { any: modesOn.map(pressed) };
  const temperature = controls.find(c => c.function === 'temperature' || c.function === 'temp_up');
  root.userData.states = {
    door_open: jointAt(joints.find(j => j.name === 'door_hinge'), '>', 0.9),
    rack_out: { any: joints.filter(j => j.requires?.length).map(j => jointAt(j, '>', 0.8)) },
    heating: { all: [modeOn, temperature.type === 'knob' ? controlAt(temperature, '>', 0) : pressed(temperature)] }
  };
  return root;
}
