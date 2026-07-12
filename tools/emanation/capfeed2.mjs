import pw from 'playwright-core';
const { chromium } = pw;
const SECRET = process.env.SECRET, JOB = process.env.JOB, CHROME = process.env.CHROME;
const BASE = 'https://dev.talk2me.fr';
const b = await chromium.launch({ executablePath: CHROME, args:['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
await p.request.post(`${BASE}/api/dev/test-login`, { headers:{'x-test-secret':SECRET,'content-type':'application/json'}, data:{phone:'+99901234567',name:'TestVideo'} });
// mode immersif photo
await p.goto(`${BASE}/`, { waitUntil:'domcontentloaded', timeout:45000 }).catch(()=>{});
await p.evaluate(()=>{ localStorage.setItem('t2m_display','photo'); });
await p.goto(`${BASE}/?sort=recent`, { waitUntil:'domcontentloaded', timeout:45000 }).catch(()=>{});
await p.waitForTimeout(7000);
await p.screenshot({ path:`${JOB}/feed_photo.png` });
console.log('capture photo OK');
await b.close();
