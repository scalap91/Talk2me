import pw from 'playwright-core';
const { chromium } = pw;
const { SECRET, JOB, CHROME } = process.env;
const b = await chromium.launch({ executablePath: CHROME, args:['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
const p = await ctx.newPage();
await p.request.post('https://dev.talk2me.fr/api/dev/test-login', { headers:{'x-test-secret':SECRET,'content-type':'application/json'}, data:{phone:'+99901234567',name:'TestVideo'} });
await p.goto('https://dev.talk2me.fr/', { waitUntil:'domcontentloaded', timeout:40000 }).catch(()=>{});
await p.evaluate(()=>{ localStorage.setItem('t2m_display','photo'); });
await p.goto('https://dev.talk2me.fr/?sort=recent', { waitUntil:'domcontentloaded', timeout:40000 }).catch(()=>{});
await p.waitForTimeout(4000);
const loc = p.getByText('Card démo', { exact:false }).first();
try { await loc.scrollIntoViewIfNeeded({ timeout: 9000 }); } catch(e){ console.log('pas trouvé Card démo'); }
await p.waitForTimeout(6000);
await p.screenshot({ path:`${JOB}/demo2_s1.png` });
// swipe gauche 3x dans la zone texte pour atteindre la dernière slide (boutique)
for(let s=0;s<3;s++){ await p.mouse.move(320,470); await p.mouse.down(); await p.mouse.move(50,470,{steps:14}); await p.mouse.up(); await p.waitForTimeout(1100); }
await p.screenshot({ path:`${JOB}/demo2_shop.png` });
console.log('OK');
await b.close();
