import pw from 'playwright-core';const{chromium}=pw;
const CHROME='/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';const SECRET=process.env.T2M_SECRET||'';
const b=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,permissions:['camera']});const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push('PAGEERR: '+String(e).slice(0,160)));p.on('console',m=>{if(m.type()==='error')errs.push('CONS: '+m.text().slice(0,150));});
await p.request.post('https://dev.talk2me.fr/api/dev/test-login',{headers:{'x-test-secret':SECRET,'content-type':'application/json'},data:{phone:'+99901234567'}});
await p.goto('https://dev.talk2me.fr/',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.waitForTimeout(4000);
// ouvre le composer (bouton +)
const plus=await p.evaluate(()=>{const el=[...document.querySelectorAll('button,a,[role=button]')].find(e=>/\+/.test(e.textContent)&&e.offsetHeight<120);if(el){el.click();return true}return false});
await p.waitForTimeout(2500);
await p.screenshot({path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/ap-1-menu.png'});
// clique Caméra
const cam=await p.evaluate(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/Caméra/i.test(e.textContent));if(el){(el.closest('button')||el).click();return true}return false});
await p.waitForTimeout(3500);
await p.screenshot({path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/ap-2-camera.png'});
const info=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,120));
console.log(JSON.stringify({plus,cam,info,errs:errs.slice(0,8)}));
await b.close();
