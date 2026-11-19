import {
  BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Scene, WebGLRenderTarget
} from 'three';
import { regionCorners } from '../lib/control-region.js';

// Rasterize region IDs against the posed asset's depth buffer at the delivered
// PNG resolution. FrontSide winding culls back faces. Marks on a control are
// part of its visible surface; helper edge lines are presentation geometry.
export function controlPixels(renderer, scene, asset, camera, width, height) {
  const controls = asset.userData.controls ?? [];
  if (!controls.length) return { width, height, controls: [] };
  const target = new WebGLRenderTarget(width,height);
  const previous = renderer.getRenderTarget(), clear = renderer.autoClear;
  const background = scene.background, override = scene.overrideMaterial;
  const depth = new MeshBasicMaterial({colorWrite:false});
  const regions = new Scene(), hidden = [];
  try {
    asset.traverse(p => {
      if (p.visible && (p.userData.visualOnly || p.isLineSegments)) { hidden.push(p); p.visible = false; }
    });
    renderer.setRenderTarget(target);
    scene.background = null;
    scene.overrideMaterial = depth;
    renderer.autoClear = true;
    renderer.render(scene,camera);
    const annotations = controls.map(({name, function:fn, label, region}, i) => {
      const corners = regionCorners(asset.getObjectByName(region.part), region);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(corners.flatMap(p => p.toArray()), 3));
      geometry.setIndex([0,1,2,0,2,3]);
      const material = new MeshBasicMaterial({toneMapped:false, polygonOffset:true,
        polygonOffsetFactor:-1, polygonOffsetUnits:-2});
      const id = i+1;
      material.color.setRGB((id & 255)/255, ((id>>8) & 255)/255, ((id>>16) & 255)/255);
      regions.add(new Mesh(geometry,material));
      const points = corners.map(p => p.clone().project(camera));
      const x = points.map(p => Math.max(0, Math.min(width,(p.x+1)*width/2)));
      const y = points.map(p => Math.max(0, Math.min(height,(1-p.y)*height/2)));
      return {name,function:fn,label,bbox:[Math.floor(Math.min(...x)),Math.floor(Math.min(...y)),
        Math.ceil(Math.max(...x)),Math.ceil(Math.max(...y))],visible:false};
    });
    renderer.autoClear = false;
    renderer.render(regions,camera);
    const pixels = new Uint8Array(width*height*4);
    renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
    for (let i=0; i<pixels.length; i+=4) {
      const id = pixels[i] | pixels[i+1]<<8 | pixels[i+2]<<16;
      if (id && id <= annotations.length) annotations[id-1].visible = true;
    }
    return {width,height,controls:annotations};
  } finally {
    renderer.autoClear = clear;
    renderer.setRenderTarget(previous);
    scene.background = background;
    scene.overrideMaterial = override;
    hidden.forEach(p => { p.visible = true; });
    regions.children.forEach(p => { p.material.dispose(); p.geometry.dispose(); });
    depth.dispose();
    target.dispose();
  }
}

