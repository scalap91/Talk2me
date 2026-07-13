import pw from 'playwright-core';
const { chromium } = pw;
const { SECRET, JOB, CHROME } = process.env;
const BASE = 'https://dev.talk2me.fr';
const b = await chromium.launch({ executablePath: CHROME, args:['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
await p.request.post(`${BASE}/api/dev/test-login`, { headers:{'x-test-secret':SECRET,'content-type':'application/json'}, data:{phone:'+99901234567',name:'TestVideo'} });
await p.goto(`${BASE}/drafts`, { waitUntil:'domcontentloaded', timeout:40000 }).catch(e=>console.log('goto',e.message));
await p.waitForTimeout(5000);
await p.screenshot({ path:`${JOB}/drafts.png` });
// tenter d'ouvrir le composer via un bouton + sur un son
let opened=false;
const plus = await p.$$('button');
for (const btn of plus) {
  const t = (await btn.textContent().catch(()=>'')) || '';
  const html = (await btn.innerHTML().catch(()=>'')) || '';
  // heuristique : bouton avec icône Plus près d'un son
}
// clic sur le 1er bouton contenant une icône plus dans la liste musique
try {
  await p.getByRole('button').filter({ hasText: '' }).first();
} catch(e){}
console.log('drafts capturé');
await b.close();
