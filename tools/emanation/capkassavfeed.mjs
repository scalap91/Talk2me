import pw from 'playwright-core';
const { chromium } = pw;
const { SECRET, JOB, CHROME } = process.env;
const BASE = 'https://dev.talk2me.fr';
const b = await chromium.launch({ executablePath: CHROME, args:['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
await p.request.post(`${BASE}/api/dev/test-login`, { headers:{'x-test-secret':SECRET,'content-type':'application/json'}, data:{phone:'+99901234567',name:'TestVideo'} });
await p.goto(`${BASE}/`, { waitUntil:'domcontentloaded', timeout:40000 }).catch(()=>{});
await p.evaluate(()=>{ localStorage.setItem('t2m_display','photo'); });
await p.goto(`${BASE}/?sort=recent`, { waitUntil:'domcontentloaded', timeout:40000 }).catch(()=>{});
await p.waitForTimeout(4000);
const loc = p.getByText('Ma vidéo GabaritEditor', { exact:false }).first();
try { await loc.scrollIntoViewIfNeeded({ timeout: 8000 }); } catch(e){ for(let i=0;i<6;i++){ await p.mouse.wheel(0,800); await p.waitForTimeout(600);} }
await p.waitForTimeout(6000); // laisse l'iframe YouTube charger
await p.screenshot({ path:`${JOB}/kassav_feed.png` });
console.log('OK');
await b.close();
