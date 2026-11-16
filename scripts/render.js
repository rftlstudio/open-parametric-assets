import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const origin = 'http://renderer.localhost';
const three = import.meta.resolve('three');
const modules = new Map([
  ['/views.js', new URL('./render-views.js', import.meta.url)],
  ['/three.module.js', three],
  ['/three.core.js', new URL('./three.core.js', three)],
  ...['loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js', 'utils/SkeletonUtils.js'].map(
    name => ['/' + name, import.meta.resolve('three/addons/' + name)]
  )
]);
const html = `<!doctype html><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"/three.module.js"}}</script>
<canvas width="512" height="512"></canvas>`;

// One browser and WebGL context per build. Playwright serves the page and its
// local dependency graph in memory; no HTTP server or network access is needed.
export async function startRenderer() {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
      const module = modules.get(url.pathname);
      if (!module) return route.abort();
      return route.fulfill({ contentType: 'text/javascript', path: fileURLToPath(module) });
    });
    await page.goto(origin);
    await page.evaluate("import('/views.js').then(module => { window.renderViews = module.renderViews; })");

    return {
      async renderRecord(record, directory) {
        const bytes = await readFile(join(directory, record.glb_path));
        const images = await page.evaluate(input => window.renderViews(input), {
          glb: bytes.toString('base64'), boundingBox: record.bounding_box
        });
        const folder = 'renders/' + record.id;
        await mkdir(join(directory, folder), { recursive: true });
        const paths = {};
        for (const [view, png] of Object.entries(images)) {
          paths[view] = folder + '/' + view + '.png';
          await writeFile(join(directory, paths[view]), Buffer.from(png, 'base64'));
        }
        return paths;
      },
      close: () => browser.close()
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
