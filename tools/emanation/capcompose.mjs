import pw from 'playwright-core';
const { chromium } = pw;
const { SECRET, JOB, CHROME } = process.env;
const BASE = 'https://dev.talk2me.fr';
const b = await chromium.launch({ executablePath: CHROME, args:['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
await p.request.post(`${BASE}/api/dev/test-login`, { headers:{'x-test-secret':SECRET,'content-type':'application/json'}, data:{phone:'+99901234567',name:'TestVideo'} });
await p.goto(`${BASE}/creer/texte`, { waitUntil:'domcontentloaded', timeout:45000 }).catch(e=>console.log('goto',e.message));
await p.waitForTimeout(3000);
// attache la vidéo via l'input caché
const input = await p.$('input[type=file][accept*="video"]');
if (!input) { console.log('input vidéo introuvable'); await p.screenshot({path:`${JOB}/compose_dbg.png`}); await b.close(); process.exit(0); }
await input.setInputFiles(`${JOB}/testvid.mp4`);
console.log('vidéo attachée, upload…');
// attendre l'apparition du bouton Aperçu (mediaUrl prêt)
await p.waitForSelector('text=Aperçu', { timeout: 30000 }).catch(()=>console.log('bouton Aperçu pas apparu'));
// remplir un texte
await p.fill('textarea', 'Regarde ce zouk, ça envoie !').catch(()=>{});
await p.waitForTimeout(800);
await p.click('text=Aperçu').catch(e=>console.log('click Aperçu',e.message));
await p.waitForTimeout(3500);
await p.screenshot({ path:`${JOB}/compose_preview.png` });
console.log('capture aperçu OK');
await b.close();
