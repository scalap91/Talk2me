import pw from 'playwright-core';
const { chromium } = pw;
const { SECRET, JOB, CHROME } = process.env;
const BASE = 'https://dev.talk2me.fr';
const b = await chromium.launch({ executablePath: CHROME, args:['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
const p = await ctx.newPage();
await p.request.post(`${BASE}/api/dev/test-login`, { headers:{'x-test-secret':SECRET,'content-type':'application/json'}, data:{phone:'+99901234567',name:'TestVideo'} });
await p.goto(`${BASE}/drafts`, { waitUntil:'domcontentloaded', timeout:40000 }).catch(()=>{});
await p.waitForTimeout(5000);
// clic sur le + orange du 1er son (position CSS ~ x353 y400)
await p.mouse.click(353, 400);
await p.waitForTimeout(4500);
await p.screenshot({ path:`${JOB}/gabarit_composer.png` });
console.log('gabarit capturé');
await b.close();
