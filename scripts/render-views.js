// Browser module served by scripts/render.js.
import { Box3, Color, DirectionalLight, HemisphereLight, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from './loaders/GLTFLoader.js';

const renderer = new WebGLRenderer({
  canvas: document.querySelector('canvas'), antialias: true, preserveDrawingBuffer: true
});
renderer.setPixelRatio(1);
renderer.setSize(512, 512, false);
renderer.shadowMap.enabled = false;

const scene = new Scene();
scene.background = new Color(0xe6e6e6);
const sky = new HemisphereLight(0xffffff, 0xbfc4ca, 1.65);
const key = new DirectionalLight(0xffffff, 2.2);
key.position.set(3, 5, 4);
scene.add(sky, key);

const pitch = 25 * Math.PI / 180;
const yaw = Math.PI / 4;
const threeQuarter = new Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
const views = {
  front: new Vector3(0, 0, 1), three_quarter: threeQuarter,
  side: new Vector3(1, 0, 0), top: new Vector3(0, 1, 0), open_three_quarter: threeQuarter
};

function openJoints(asset) {
  let moved = false;
  for (const joint of asset.userData.joints) {
    if (joint.type !== 'revolute') continue;
    const part = asset.getObjectByName(joint.childPart);
    if (!part) throw new Error('Cannot open joint ' + joint.name + ': missing ' + joint.childPart);
    part.rotateOnAxis(new Vector3(...joint.axis), joint.limits[1]);
    moved ||= joint.limits[1] !== 0;
  }
  return moved;
}

function cameraFor(bounds, direction, posedAsset) {
  const camera = new OrthographicCamera();
  const target = bounds.getCenter(new Vector3());
  const distance = bounds.getSize(new Vector3()).length();
  camera.position.copy(target).addScaledVector(direction, 2 * distance);
  if (direction.y === 1) camera.up.set(0, 0, -1);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const frame = bounds.clone().applyMatrix4(camera.matrixWorldInverse);

  // An opened door can extend well outside the rest AABB. Fit the articulated
  // silhouette in camera space, including thin doors seen at oblique angles.
  if (posedAsset) {
    frame.makeEmpty();
    const point = new Vector3();
    posedAsset.traverse(part => {
      if (!part.isMesh) return;
      const positions = part.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
        frame.expandByPoint(point);
      }
    });
  }

  const size = frame.getSize(new Vector3());
  const center = frame.getCenter(new Vector3());
  const half = 0.56 * Math.max(size.x, size.y);
  camera.left = center.x - half;
  camera.right = center.x + half;
  camera.bottom = center.y - half;
  camera.top = center.y + half;
  camera.near = distance * 0.1;
  camera.far = distance * 4;
  camera.updateProjectionMatrix();
  return camera;
}

export async function renderViews({ glb, boundingBox }) {
  const bytes = Uint8Array.from(atob(glb), c => c.charCodeAt(0));
  const { scene: model } = await new GLTFLoader().parseAsync(bytes.buffer, '');
  const asset = model.children[0];
  scene.add(model);
  const rest = new Box3(new Vector3(...boundingBox.min), new Vector3(...boundingBox.max));
  const images = {};
  try {
    for (const [view, direction] of Object.entries(views)) {
      const opened = view === 'open_three_quarter' && openJoints(asset);
      const bounds = opened ? new Box3().setFromObject(model, true) : rest;
      renderer.render(scene, cameraFor(bounds, direction, opened ? model : null));
      images[view] = renderer.domElement.toDataURL('image/png').split(',')[1];
    }
    return images;
  } finally {
    scene.remove(model);
    const materials = new Set();
    model.traverse(part => {
      if (part.isMesh) {
        part.geometry.dispose();
        for (const material of [].concat(part.material)) materials.add(material);
      }
    });
    for (const material of materials) material.dispose();
  }
}
