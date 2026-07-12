import pw from 'playwright-core';const{chromium}=pw;
const CHROME='/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';const SECRET=process.env.T2M_SECRET||'';
const b=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});const p=await ctx.newPage();
const cdp=await ctx.newCDPSession(p);
async function t(ty,x,y){await cdp.send('Input.dispatchTouchEvent',{type:ty,touchPoints:ty==='touchEnd'?[]:[{x,y}]})}
async function up(){await t('touchStart',195,650);for(let i=1;i<=8;i++){await t('touchMove',195,650-i*60);await p.waitForTimeout(28)}await t('touchEnd',195,150);await p.waitForTimeout(800)}
await p.request.post('https://dev.talk2me.fr/api/dev/test-login',{headers:{'x-test-secret':SECRET,'content-type':'application/json'},data:{phone:'+99901234567'}});
await p.goto('https://dev.talk2me.fr/',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.evaluate(()=>{try{localStorage.setItem('t2m_display','photo')}catch{}});
await p.goto('https://dev.talk2me.fr/?sort=recent',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.waitForTimeout(5000);
let found=false;
for(let i=0;i<16;i++){const txt=await p.evaluate(()=>document.body.innerText).catch(()=>'');if(/asnah|Voir la boutique|VITRINE/i.test(txt)){found=true;await p.waitForTimeout(1000);await p.screenshot({path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/vitrine-fix.png'});break}await up()}
console.log('vitrine vue:',found,'| marqueur visible:',await p.evaluate(()=>/\[VITRINE:/.test(document.body.innerText)));
await b.close();
