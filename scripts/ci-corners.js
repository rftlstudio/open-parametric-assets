// Coverage is checked against the asset schemas in the dataset tests.
const seeds = {
  'appliances/microwave': [4026533801,4026531948,4026531987],
  'appliances/oven': [4026531842,4026532160,4026531847],
  'furniture/cabinet': [4026535660,4026532012,4026533511,4026531854,4026531866],
  'furniture/drawer_cabinet': [4026533490,4026533726,4026537022,4026531872]
};
export function ciCorners(id) {
  if (!seeds[id]) throw new Error('Missing CI corner seeds for ' + id);
  const cases = seeds[id].map(seed => ({seed}));
  if (id === 'furniture/drawer_cabinet') {
    cases.push(
      {seed:91001, params:{width:0.70,height:0.74,depth:0.45,drawerCount:1,handleStyle:'knob'}},
      {seed:91002, params:{width:0.88,height:0.67,depth:0.51,drawerCount:1,handleStyle:'bar'}}
    );
  }
  return cases;
}
