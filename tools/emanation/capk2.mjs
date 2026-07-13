import pw from 'playwright-core';
const { chromium } = pw;
const { SECRET, JOB, CHROME } = process.env;
const BASE = 'https://dev.talk2me.fr';
const ID='a8dd4a47-d058-4c6f-9b97-e8d8ccc51297';
const b = await chromium.launch({ executablePath: CHROME, args:['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
await p.request.post(`${BASE}/api/dev/test-login`, { headers:{'x-test-secret':SECRET,'content-type':'application/json'}, data:{phone:'+99901234567',name:'TestVideo'} });
await p.goto(`${BASE}/`, { waitUntil:'domcontentloaded', timeout:40000 }).catch(()=>{});
await p.evaluate(()=>{ localStorage.setItem('t2m_display','photo'); });
await p.goto(`${BASE}/home#card-${ID}`, { waitUntil:'domcontentloaded', timeout:40000 }).catch(()=>{});
await p.waitForTimeout(3000);
// scroll jusqu'à l'ancre de la card
await p.evaluate((id)=>{ const el=document.getElementById('card-'+id)||document.querySelector('[id*="'+id.slice(0,8)+'"]'); if(el) el.scrollIntoView(); }, ID).catch(()=>{});
await p.waitForTimeout(6000);
await p.screenshot({ path:`${JOB}/kassav_final.png` });
console.log('OK');
await b.close();
