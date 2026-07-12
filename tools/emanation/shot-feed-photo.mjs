import pw from 'playwright-core';const{chromium}=pw;
const CHROME='/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';const SECRET=process.env.T2M_SECRET||'';
const b=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});const p=await ctx.newPage();
const cdp=await ctx.newCDPSession(p);
async function t(ty,x,y){await cdp.send('Input.dispatchTouchEvent',{type:ty,touchPoints:ty==='touchEnd'?[]:[{x,y}]})}
async function up(){await t('touchStart',195,650);for(let i=1;i<=8;i++){await t('touchMove',195,650-i*62);await p.waitForTimeout(30)}await t('touchEnd',195,150);await p.waitForTimeout(900)}
await p.request.post('https://dev.talk2me.fr/api/dev/test-login',{headers:{'x-test-secret':SECRET,'content-type':'application/json'},data:{phone:'+99901234567'}});
await p.goto('https://dev.talk2me.fr/',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.evaluate(()=>{try{localStorage.setItem('t2m_display','photo')}catch{}});
await p.goto('https://dev.talk2me.fr/?sort=recent',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.waitForTimeout(6000);
for(let i=1;i<=6;i++){await p.screenshot({path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/fp-'+i+'.png'});const txt=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,60)).catch(()=>'');console.log('  écran '+i+': '+txt);await up();}
await b.close();
