// Browser module served by scripts/render.js.
import {
  Box3, Color, DirectionalLight, EdgesGeometry, HemisphereLight, LineBasicMaterial,
  LineSegments, OrthographicCamera, PerspectiveCamera, Scene, Vector3, WebGLRenderer
} from 'three';
import { regionCorners } from '../lib/control-region.js';
import { GLTFLoader } from './loaders/GLTFLoader.js';

const renderer = new WebGLRenderer({
  canvas: document.querySelector('canvas'), antialias: true, preserveDrawingBuffer: true
});
renderer.setPixelRatio(1);
renderer.setSize(512, 512, false);
renderer.shadowMap.enabled = false;

const scene = new Scene();
scene.background = new Color(0xe6e6e6);
const sky = new HemisphereLight(0xffffff, 0xd0d0d0, 0.8);
const key = new DirectionalLight(0xffffff, 3.0);
key.position.set(-3, 5, 7);
const fill = new DirectionalLight(0xffffff, 0.65);
fill.position.set(5, 2, 1);
const rim = new DirectionalLight(0xffffff, 1.4);
rim.position.set(-2, 4, -5);
scene.add(sky, key, fill, rim);

const pitch = 25 * Math.PI / 180;
const yaw = Math.PI / 4;
const threeQuarter = new Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
const views = {
  front: new Vector3(0, 0, 1), three_quarter: threeQuarter,
  side: new Vector3(1, 0, 0), top: new Vector3(0, 1, 0),
  perspective_three_quarter: threeQuarter, open_three_quarter: threeQuarter
};

function openJoints(asset) {
  let moved = false;
  for (const joint of asset.userData.joints) {
    const part = asset.getObjectByName(joint.childPart);
    if (!part) throw new Error('Cannot open joint ' + joint.name + ': missing ' + joint.childPart);
    const axis = new Vector3(...joint.axis);
    if (joint.type === 'prismatic') part.translateOnAxis(axis, joint.limits[1]);
    else if (joint.type === 'revolute') part.rotateOnAxis(axis, joint.limits[1]);
    else throw new Error('Unsupported joint type: ' + joint.type);
    moved ||= joint.limits[1] !== 0;
  }
  return moved;
}

function addEdgeAccents(model) {
  const meshes = [];
  model.traverse(part => { if (part.isMesh && !part.userData.visualOnly) meshes.push(part); });
  const ink = new LineBasicMaterial({ color: 0x202020, opacity: 0.22, transparent: true, depthWrite: false });
  for (const mesh of meshes) {
    // A small depth bias keeps visible crease lines on their host surface.
    for (const material of [].concat(mesh.material)) {
      material.polygonOffset = true;
      material.polygonOffsetFactor = 1;
      material.polygonOffsetUnits = 1;
    }
    mesh.add(new LineSegments(new EdgesGeometry(mesh.geometry, 35), ink));
  }
}

function forEachCameraVertex(model, camera, visit) {
  const point = new Vector3();
  model.updateMatrixWorld(true);
  model.traverse(part => {
    if (!part.isMesh) return;
    const positions = part.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      visit(point);
    }
  });
}

function perspectiveCamera(bounds, direction, model) {
  const camera = new PerspectiveCamera(35, 1);
  const center = bounds.getCenter(new Vector3());
  const diagonal = bounds.getSize(new Vector3()).length();
  camera.position.copy(center);
  camera.lookAt(center.clone().sub(direction));
  camera.updateMatrixWorld();
  // At depth d - z, the central 80% spans ±slope * (d - z) on either axis.
  // Solve the four frustum-plane constraints for a centered, tight fit.
  const slope = 0.8 * Math.tan(camera.fov * Math.PI / 360);
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity, nearest = -Infinity;
  forEachCameraVertex(model, camera, ({ x, y, z }) => {
    left = Math.min(left, x - slope * z);
    right = Math.max(right, x + slope * z);
    bottom = Math.min(bottom, y - slope * z);
    top = Math.max(top, y + slope * z);
    nearest = Math.max(nearest, z);
  });
  const distance = Math.max((right - left) / (2 * slope), (top - bottom) / (2 * slope), nearest + diagonal * 0.1);
  camera.translateX((right + left) / 2);
  camera.translateY((top + bottom) / 2);
  camera.translateZ(distance);
  camera.near = diagonal * 0.01;
  camera.far = distance + diagonal;
  camera.updateProjectionMatrix();
  return camera;
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
    forEachCameraVertex(posedAsset, camera, point => frame.expandByPoint(point));
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
    addEdgeAccents(model);
    if (asset.userData.controls?.length) {
      const regions = asset.userData.controls.map(c => regionCorners(asset.getObjectByName(c.region.part), c.region));
      const [a,b,,d] = regions[0];
      const direction = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
      const camera = cameraFor(rest,direction);
      const projected = new Box3().setFromPoints(regions.flat().map(p => p.applyMatrix4(camera.matrixWorldInverse)));
      const center = projected.getCenter(new Vector3()), size = projected.getSize(new Vector3());
      const half = 0.575 * Math.max(size.x,size.y);
      camera.left = center.x-half; camera.right = center.x+half;
      camera.top = center.y+half; camera.bottom = center.y-half;
      camera.updateProjectionMatrix();
      renderer.render(scene,camera);
      images.control_panel = renderer.domElement.toDataURL('image/png').split(',')[1];
    }
    for (const [view, direction] of Object.entries(views)) {
      const opened = view === 'open_three_quarter' && openJoints(asset);
      const bounds = opened ? new Box3().setFromObject(model, true) : rest;
      const camera = view === 'perspective_three_quarter'
        ? perspectiveCamera(rest, direction, model)
        : cameraFor(bounds, direction, opened ? model : null);
      renderer.render(scene, camera);
      images[view] = renderer.domElement.toDataURL('image/png').split(',')[1];
    }
    return images;
  } finally {
    scene.remove(model);
    const materials = new Set();
    model.traverse(part => {
      if (part.isMesh || part.isLineSegments) {
        part.geometry.dispose();
        for (const material of [].concat(part.material)) materials.add(material);
      }
    });
    for (const material of materials) material.dispose();
  }
}
