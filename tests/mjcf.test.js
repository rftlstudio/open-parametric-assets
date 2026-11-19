import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { expect, it } from 'vitest';
import { buildDataset } from '../scripts/build-dataset.js';
import { createAsset } from '../assets/appliances/microwave/index.js';
import { exportMJCF } from '../scripts/export-mjcf.js';

it('builds standalone MJCF records and declares the optional path in Croissant', async () => {
  const out = await mkdtemp(join(tmpdir(),'opa-mjcf-'));
  try {
    await buildDataset({samples:1, out, mjcf:true});
    const manifest = await readFile(join(out,'data.jsonl'),'utf8');
    const croissant = JSON.parse(await readFile(join(out,'croissant.json'),'utf8'));
    expect(croissant['cr:recordSet'][0]['cr:field'].map(f => f.name)).toContain('mjcf_path');
    for (const r of manifest.trim().split('\n').map(line => JSON.parse(line))) {
      expect(r.urdf_path).toBeUndefined();
      expect(r.mjcf_path).toBe('mjcf/'+r.id+'/model.xml');
      expect(r.provenance.sim_report).toBe(r.provenance.mjcf_sim_report);
      const source = await readFile(join(out,r.mjcf_path),'utf8');
      const xml = new DOMParser().parseFromString(source,'application/xml');
      const metadata = JSON.parse(xml.getElementsByTagName('text')[0].getAttribute('data'));
      expect(metadata).toMatchObject({id:r.id,states:r.states,tasks:r.tasks,controls:r.controls});
      if (r.asset_id === 'appliances/microwave') {
        const asset = createAsset(r.params,{seed:r.seed});
        expect(exportMJCF(asset,r).mjcf).toBe(source);
        const geomNames = [...xml.getElementsByTagName('geom')].map(g => g.getAttribute('name'));
        asset.traverse(part => {
          if (!part.userData.visualOnly) return;
          expect(geomNames).toContain('visual_'+part.name);
          expect(geomNames).not.toContain(part.name);
        });
      }
    }
  } finally {
    await rm(out,{recursive:true,force:true});
  }
});
