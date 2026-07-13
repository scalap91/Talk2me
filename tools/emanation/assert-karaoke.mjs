import pw from 'playwright-core';
const { chromium } = pw;
const CHROME='/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const SECRET=process.env.T2M_SECRET||'';
const b=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});
const p=await ctx.newPage();
await p.request.post('https://dev.talk2me.fr/api/dev/test-login',{headers:{'x-test-secret':SECRET,'content-type':'application/json'},data:{phone:'+99901234567'}});
await p.goto('https://dev.talk2me.fr/',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.evaluate(()=>{try{localStorage.setItem('t2m_display','photo')}catch{}});
await p.goto('https://dev.talk2me.fr/?sort=recent',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.waitForTimeout(6000);
// charge plus de posts (scroll DOM) pour que la card Djadja soit montée
for(let i=0;i<6;i++){await p.evaluate(()=>window.scrollBy(0,900));await p.waitForTimeout(400);}
const r=await p.evaluate(()=>{
  const body=document.body.innerText;
  const hasParoles=/PAROLES/i.test(body);
  const hasMic=document.body.innerHTML.includes('🎤');
  // une ligne de Djadja
  const hasLyricLine=/qué pasa|Aya Nakamura, oh yeah|catchana/i.test(body);
  return {hasDjadja:/Djadja|Aya Nakamura/i.test(body), hasParoles, hasMic, hasLyricLine};
});
console.log(JSON.stringify(r));
await b.close();
