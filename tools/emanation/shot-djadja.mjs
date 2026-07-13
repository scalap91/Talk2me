import pw from 'playwright-core';
const { chromium } = pw;
const CHROME='/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const SECRET=process.env.T2M_SECRET||'';
const b=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});
const p=await ctx.newPage();
const cdp=await ctx.newCDPSession(p);
async function touch(t,x,y){await cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:t==='touchEnd'?[]:[{x,y}]});}
async function swipe(x1,y1,x2,y2){await touch('touchStart',x1,y1);for(let i=1;i<=6;i++){await touch('touchMove',x1+(x2-x1)*i/6,y1+(y2-y1)*i/6);await p.waitForTimeout(35);}await touch('touchEnd',x2,y2);await p.waitForTimeout(800);}
await p.request.post('https://dev.talk2me.fr/api/dev/test-login',{headers:{'x-test-secret':SECRET,'content-type':'application/json'},data:{phone:'+99901234567'}});
await p.goto('https://dev.talk2me.fr/',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.evaluate(()=>{try{localStorage.setItem('t2m_display','photo')}catch{}});
await p.goto('https://dev.talk2me.fr/?sort=recent',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.waitForTimeout(5000);
let found=false;
for(let i=0;i<10;i++){
  const txt=await p.evaluate(()=>document.body.innerText).catch(()=>'');
  if(/Djadja|Aya Nakamura|karaok/i.test(txt)){found=true;break;}
  await swipe(195,650,195,180); // swipe vertical = post suivant
}
await p.waitForTimeout(1000);
await p.screenshot({path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/dj-landing.png'});
await swipe(70,450,330,450); // swipe droite = slide gauche = karaoké
await p.screenshot({path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/dj-karaoke.png'});
console.log('found Djadja card:',found);
await b.close();
