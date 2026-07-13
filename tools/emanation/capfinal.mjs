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
const loc = p.getByText('Kassav + boutique', { exact:false }).first();
try { await loc.scrollIntoViewIfNeeded({ timeout: 9000 }); } catch(e){ console.log('pas trouvé'); }
await p.waitForTimeout(6000);
const found = await p.evaluate(()=>{ const t=document.body.innerText||''; return {tshirt:t.includes('Ti-shirt Zouk'), boutique:t.includes('Boutique')}; });
console.log('DOM:', JSON.stringify(found));
const cdp = await ctx.newCDPSession(p);
async function swipe(){ await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:320,y:470}]}); for(const x of [260,180,110,55]){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:470}]}); await p.waitForTimeout(70);} await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await p.waitForTimeout(1000); }
await swipe(); await swipe(); await swipe(); await swipe();
await p.screenshot({ path:`${JOB}/boutique_slide_final.png` });
console.log('OK');
await b.close();
