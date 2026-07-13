import pw from 'playwright-core';
const { chromium } = pw;
const { SECRET, JOB, CHROME } = process.env;
const BASE = 'https://dev.talk2me.fr';
const b = await chromium.launch({ executablePath: CHROME, args:['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
await p.request.post(`${BASE}/api/dev/test-login`, { headers:{'x-test-secret':SECRET,'content-type':'application/json'}, data:{phone:'+99901234567',name:'TestVideo'} });
await p.goto(`${BASE}/drafts`, { waitUntil:'domcontentloaded', timeout:40000 }).catch(()=>{});
await p.waitForTimeout(4500);
// onglet Recherche
try { await p.getByText(/Recherche|Rech/).first().click({ timeout: 5000 }); } catch(e){ console.log('tab recherche?', e.message); }
await p.waitForTimeout(1500);
// champ recherche
try { const inp = p.getByPlaceholder(/titre|artiste|Rech/i).first(); await inp.fill('kassav'); } catch(e){ console.log('input?', e.message); }
await p.waitForTimeout(4000); // laisse la recherche live remonter Kassav
await p.screenshot({ path:`${JOB}/kassav_search.png` });
// cliquer le + du 1er résultat (bouton avec icône plus, à droite d'une ligne)
const btns = await p.$$('button');
let clicked=false;
for (const btn of btns.reverse()) {
  const box = await btn.boundingBox().catch(()=>null);
  if (box && box.x > 300 && box.width < 70 && box.y > 250 && box.y < 700) { await btn.click().catch(()=>{}); clicked=true; break; }
}
console.log('plus cliqué?', clicked);
await p.waitForTimeout(3500);
// importer la vidéo test
const input = await p.$('input[type=file][accept*="video"]');
if (input) await input.setInputFiles(`${JOB}/testvid.mp4`);
await p.waitForSelector('video', { timeout: 20000 }).catch(()=>console.log('video?'));
await p.waitForTimeout(2500);
await p.screenshot({ path:`${JOB}/kassav_composer.png` });
console.log('OK');
await b.close();
