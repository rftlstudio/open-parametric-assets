import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// Node 24 has Blob but lacks the FileReader callback API used by the binary
// exporter. Texture-free assets only need readAsArrayBuffer and onloadend.
class BinaryFileReader {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend();
  }
}

export async function exportGLB(root) {
  globalThis.FileReader ??= BinaryFileReader;
  const binary = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false });
  return new Uint8Array(binary);
}
