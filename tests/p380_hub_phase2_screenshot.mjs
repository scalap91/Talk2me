/**
 * Screenshot Talk2Me #380 Phase 2-3 — /demo-unified-hub grid (17 cards).
 * Output : /home/ubuntu/dashboard/uploads/talk2me_hub_phase2_grid.png
 */
import { writeFile } from 'node:fs/promises';

const PUPPET = 'http://127.0.0.1:8004/render';
const TARGET = 'http://127.0.0.1:3010/demo-unified-hub';
const OUT = '/home/ubuntu/dashboard/uploads/talk2me_hub_phase2_grid.png';

async function shoot(target) {
  const u = new URL(PUPPET);
  u.searchParams.set('url', target);
  u.searchParams.set('width', '1200');
  u.searchParams.set('height', '4400');
  u.searchParams.set('wait', '12000');
  const r = await fetch(u);
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`puppeteer ${r.status}: ${txt}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

const buf = await shoot(TARGET);
await writeFile(OUT, buf);
console.log(`Saved ${OUT} (${buf.length} bytes)`);
