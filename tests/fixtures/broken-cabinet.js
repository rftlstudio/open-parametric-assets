import * as cabinet from '../../assets/furniture/cabinet/index.js';

export const schema = cabinet.schema;
export function createAsset(params, options) {
  const root = cabinet.createAsset(params, options);
  root.getObjectByName('bottom').geometry.attributes.position.setX(0, NaN);
  return root;
}
