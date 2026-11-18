import { Vector3 } from 'three';

// World-space perimeter in winding order, using the ASSET_SPEC tangent basis.
export function regionCorners(part, {point, normal, size}) {
  const n = new Vector3(...normal);
  const u = (Math.abs(n.x) < 0.9 ? new Vector3(1,0,0) : new Vector3(0,1,0)).projectOnPlane(n).normalize();
  const v = n.clone().cross(u);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => part.localToWorld(
    new Vector3(...point).addScaledVector(u,x*size[0]/2).addScaledVector(v,y*size[1]/2)));
}
