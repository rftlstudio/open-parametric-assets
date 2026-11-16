import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function directories(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
}

export async function discoverAssets() {
  const base = fileURLToPath(new URL('../assets/', import.meta.url));
  const assets = [];
  for (const category of await directories(base)) {
    for (const name of await directories(join(base, category))) {
      const id = category + '/' + name;
      assets.push({ id, url: pathToFileURL(join(base, id, 'index.js')).href });
    }
  }
  if (!assets.length) throw new Error('no assets found');
  return assets;
}
