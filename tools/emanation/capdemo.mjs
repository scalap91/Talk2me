import pw from 'playwright-core';
const { chromium } = pw;
const b = await chromium.launch({ executablePath: '/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome', args:['--no-sandbox','--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true });
const p = await ctx.newPage();
await p.request.post('https://dev.talk2me.fr/api/dev/test-login', { headers:{'x-test-secret':'3b4941fdf3dc4cbb653d4dfe75bd3215','content-type':'application/json'}, data:{phone:'+99901234567',name:'TestVideo'} });
await p.goto('https://dev.talk2me.fr/', { waitUntil:'domcontentloaded', timeout:40000 }).catch(()=>{});
await p.evaluate(()=>{ localStorage.setItem('t2m_display','photo'); });
await p.goto('https://dev.talk2me.fr/home#card-a800e37e-4f6b-480f-944c-b5d09241360d', { waitUntil:'domcontentloaded', timeout:40000 }).catch(()=>{});
await p.waitForTimeout(3000);
await p.evaluate((id)=>{ const el=document.getElementById('card-'+id); if(el) el.scrollIntoView(); }, 'a800e37e-4f6b-480f-944c-b5d09241360d').catch(()=>{});
await p.waitForTimeout(6000);
await p.screenshot({ path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/demo_slide1.png' });
// swipe vers la gauche dans la zone texte (y~460) pour atteindre la slide boutique
await p.touchscreen.tap(200,460).catch(()=>{});
for(let s=0;s<2;s++){
  await p.mouse.move(320,470); await p.mouse.down(); await p.mouse.move(60,470,{steps:12}); await p.mouse.up();
  await p.waitForTimeout(1200);
}
await p.screenshot({ path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/demo_boutique.png' });
console.log('OK');
await b.close();
