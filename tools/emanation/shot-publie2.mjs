import pw from 'playwright-core';
const { chromium } = pw;
const CHROME='/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const SECRET=process.env.T2M_SECRET||'';
const b=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});
const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push('ERR:'+String(e).slice(0,120)));
await p.request.post('https://dev.talk2me.fr/api/dev/test-login',{headers:{'x-test-secret':SECRET,'content-type':'application/json'},data:{phone:'+99901234567'}});
// crée une card son publiée
const r=await p.request.post('https://dev.talk2me.fr/api/cards/create',{headers:{'content-type':'application/json'},data:{type:'texte',text:'Publié test rendu',attached_audio:{video_id:'kJQP7kiw5Fk',title:'Luis Fonsi - Despacito',source:'youtube'}}});
const cid=(await r.json().catch(()=>({})))?.card?.id||'';
await p.waitForTimeout(1500);
await p.goto('https://dev.talk2me.fr/drafts#publiees',{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});
await p.waitForTimeout(4000);
await p.screenshot({path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/pub-list.png'});
if(cid){await p.goto('https://dev.talk2me.fr/mes-cards/'+cid,{waitUntil:'domcontentloaded',timeout:40000}).catch(()=>{});await p.waitForTimeout(4500);await p.screenshot({path:'/home/ubuntu/.claude/jobs/8d8314e5/tmp/pub-apercu.png'});}
console.log(JSON.stringify({cid:cid.slice(0,8),errs:errs.slice(0,4)}));
await b.close();
