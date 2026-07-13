import pw from 'playwright-core';const{chromium}=pw;
const CHROME='/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';const SECRET=process.env.T2M_SECRET||'';
const b=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});const p=await ctx.newPage();
await p.request.post('https://dev.talk2me.fr/api/dev/test-login',{headers:{'x-test-secret':SECRET,'content-type':'application/json'},data:{phone:'+99901234567'}});
await p.goto('https://dev.talk2me.fr/',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.evaluate(()=>{try{localStorage.setItem('t2m_display','photo')}catch{}});
await p.goto('https://dev.talk2me.fr/?sort=recent',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.waitForTimeout(6000);
for(let i=1;i<=7;i++){
  await p.screenshot({path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/gp-'+i+'.png'});
  const txt=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,55)).catch(()=>'');
  console.log('  gp-'+i+': '+txt);
  // molette sur le centre + scroll snap container
  await p.mouse.move(195,450); await p.mouse.wheel(0,880); await p.waitForTimeout(300);
  await p.evaluate(()=>{const s=document.querySelector('[class*="snap"],main,[style*="overflow"]');if(s)s.scrollBy(0,880);else window.scrollBy(0,880);}).catch(()=>{});
  await p.waitForTimeout(800);
}
await b.close();
