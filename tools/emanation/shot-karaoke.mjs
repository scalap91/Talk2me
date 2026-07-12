import pw from 'playwright-core';
const { chromium } = pw;
const CHROME='/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const SECRET=process.env.T2M_SECRET||'';
const b=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});
const p=await ctx.newPage();
const cdp=await ctx.newCDPSession(p);
async function touch(type,x,y){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});}
async function swipe(x1,x2,y){await touch('touchStart',x1,y);for(let i=1;i<=6;i++){await touch('touchMove',x1+(x2-x1)*i/6,y);await p.waitForTimeout(40);}await touch('touchEnd',x2,y);await p.waitForTimeout(700);}
await p.request.post('https://dev.talk2me.fr/api/dev/test-login',{headers:{'x-test-secret':SECRET,'content-type':'application/json'},data:{phone:'+99901234567'}});
await p.goto('https://dev.talk2me.fr/',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.evaluate(()=>{try{localStorage.setItem('t2m_display','photo')}catch{}});
await p.goto('https://dev.talk2me.fr/?sort=recent',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.waitForTimeout(6000);
await p.screenshot({path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/k1-landing.png'});
// swipe DROITE (doigt gauche→droite) = révèle la slide de GAUCHE = karaoké
await swipe(70,330,450);
await p.screenshot({path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/k2-karaoke.png'});
console.log('OK captures landing + karaoke');
await b.close();
