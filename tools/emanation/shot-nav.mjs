import pw from 'playwright-core';const{chromium}=pw;const CHROME='/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';const SECRET=process.env.T2M_SECRET||'';
const b=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage']});const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true});const p=await ctx.newPage();
await p.request.post('https://dev.talk2me.fr/api/dev/test-login',{headers:{'x-test-secret':SECRET,'content-type':'application/json'},data:{phone:'+99901234567'}});
await p.goto('https://dev.talk2me.fr/',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});await p.waitForTimeout(4000);
// crop bas (nav)
await p.screenshot({path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/nav.png',clip:{x:0,y:720,width:390,height:124}});
console.log('ok');await b.close();
