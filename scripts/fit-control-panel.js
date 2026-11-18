import { Box3, Vector3 } from 'three';

export function fitControlPanel(camera, asset, regions) {
  const frame = new Box3();
  for (const corners of regions) {
    for (const corner of corners) frame.expandByPoint(corner.clone().applyMatrix4(camera.matrixWorldInverse));
  }

  const meshes = new Set();
  for (const control of asset.userData.controls) {
    const joint = asset.userData.joints.find(j => j.name === control.joint);
    if (joint) {
      asset.getObjectByName(joint.childPart).traverse(part => {
        if (part.isMesh) meshes.add(part);
      });
    }
    const mark = asset.getObjectByName(control.name + '_mark');
    if (mark) meshes.add(mark);
  }
  const names = new Set(asset.userData.controls.map(c => c.name));
  asset.traverse(part => {
    if (part.isMesh && names.has(part.userData.scaleFor)) meshes.add(part);
  });
  asset.updateWorldMatrix(true, true);
  const point = new Vector3();
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      frame.expandByPoint(point);
    }
  }
  const center = frame.getCenter(new Vector3()), size = frame.getSize(new Vector3());
  const aspect = Math.max(0.25, Math.min(4, size.x/size.y));
  const height = Math.max(size.y, size.x/aspect)*1.15;
  const width = height*aspect;
  // Preserve roughly the pixel budget of a 512-square view, increasing the
  // density if the smallest projected interaction patch would be under 24 px.
  let density = 512/Math.sqrt(width*height);
  for (const corners of regions) {
    const [a,b,,d] = corners.map(p => p.clone().applyMatrix4(camera.matrixWorldInverse));
    const shortest = Math.min(Math.hypot(a.x-b.x,a.y-b.y), Math.hypot(a.x-d.x,a.y-d.y));
    if (shortest < 1e-8) throw new Error('Control region is edge-on to the panel camera');
    density = Math.max(density, 24/shortest);
  }
  const pixels = {width:Math.ceil(width*density), height:Math.ceil(height*density)};
  const frameWidth = pixels.width/density, frameHeight = pixels.height/density;
  camera.left = center.x - frameWidth/2;
  camera.right = center.x + frameWidth/2;
  camera.bottom = center.y - frameHeight/2;
  camera.top = center.y + frameHeight/2;
  camera.updateProjectionMatrix();
  return pixels;
}
