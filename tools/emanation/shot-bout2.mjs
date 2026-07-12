import pw from 'playwright-core';const{chromium}=pw;
const CHROME='/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';const SECRET=process.env.T2M_SECRET||'';
const b=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push('ERR:'+String(e).slice(0,130)));
await p.request.post('https://dev.talk2me.fr/api/dev/test-login',{headers:{'x-test-secret':SECRET,'content-type':'application/json'},data:{phone:'+99901234567'}});
// onglet Boutiques de /decouvrir
await p.goto('https://dev.talk2me.fr/decouvrir',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.waitForTimeout(3500);
const clicked=await p.evaluate(()=>{const el=[...document.querySelectorAll('button,a,div')].find(e=>e.textContent.trim()==='Boutiques');if(el){el.click();return true}return false});
await p.waitForTimeout(3500);
await p.screenshot({path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/bout-tab.png'});
const info=await p.evaluate(()=>({txt:document.body.innerText.replace(/\s+/g,' ').slice(0,200)}));
// une boutique en direct (/drafts#boutiques)
await p.goto('https://dev.talk2me.fr/drafts#boutiques',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.waitForTimeout(3500);
await p.screenshot({path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/bout-drafts.png'});
console.log(JSON.stringify({clicked,info,errs:errs.slice(0,5)}));
await b.close();
