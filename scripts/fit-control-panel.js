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
  const half = 1.15 * Math.max(size.x, size.y) / 2;
  camera.left = center.x - half;
  camera.right = center.x + half;
  camera.bottom = center.y - half;
  camera.top = center.y + half;
  camera.updateProjectionMatrix();
}
