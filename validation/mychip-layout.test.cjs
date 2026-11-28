'use strict';
/* 2026-11-21 (user: 让问号在圈的正中心，注册和登录不要和上面的我的主页冲突): signed out, the 我的主页 chip on the
   leaderboard showed its default avatar's ? to the right of the circle (the rank value's .lb-mychip>span spacing and rule also
   hit the avatar <span>) and 注册 / 登录 ran into 我的主页 (the global button font sets line-height 1 on the chip, so both
   lines were only as tall as their font size and the glyphs touched; the line boxes themselves do not overlap, so the check is
   each line's own line-height). A chip with a value (阅读榜, signed in) is rendered too, so the value keeps its spacing.
   The real web/ UI runs in headless Edge. Skipped without Edge. */
// The signed-out chip needs no remote data. Both relay timeouts can outlast this test's render poll.
process.env.MEGULIT_RELAY_BASE='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startService,startWeb,startEdge}=require('./library-views-perf.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));
const OPEN=`(()=>{const b=document.querySelector('[data-route="leaderboard"]')||[...document.querySelectorAll('button,a,[role=tab]')].find(e=>/社区/.test(e.textContent));if(!b)return false;b.click();return true;})()`;
const DIAG=`({href:location.href,readyState:document.readyState,ready:!!window.__TOME_READY__,hasRetry:!!document.querySelector('#startup-retry'),body:(document.body?.innerText||'').slice(0,160)})`;
const PROBE=`(()=>{const c=document.querySelector('.lb-mychip');if(!c)return null;const a=c.querySelector('.leaderboard-avatar'),s=c.querySelector('small'),t=c.querySelector('strong');
 const r=document.createRange();r.selectNodeContents(a);const g=r.getBoundingClientRect(),ab=a.getBoundingClientRect();
 const line=n=>{const k=getComputedStyle(n);return {lineHeight:parseFloat(k.lineHeight),fontSize:parseFloat(k.fontSize)};};
 return {dx:(g.left+g.width/2)-(ab.left+ab.width/2),avatarPad:getComputedStyle(a).paddingLeft,small:line(s),strong:line(t),chip:c.getBoundingClientRect().height,text:t.textContent};})()`;
/* the chip as the 阅读榜 paints it for a signed-in reader with a value, put in place of the signed-out one */
const RANKED=`(async()=>{const v=await import('./leaderboard-view.js');const esc=x=>String(x??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const html=v.leaderboardHTML({configured:true,joined:true,account:true,name:'めぐみん',tab:'board',local:{stats:{week:{}},totals:{words:0}},avatars:{},board:{state:'ok',entries:[{rank:3,name:'めぐみん',value:5400,me:true}],me:{rank:3,value:5400}}},'zh',esc);
 const chip=(html.match(/<button type="button" class="lb-mychip"[\\s\\S]*?<\\/button>/)||[''])[0];const old=document.querySelector('.lb-mychip');if(!chip||!old)return null;old.outerHTML=chip;
 const c=document.querySelector('.lb-mychip'),val=c.querySelector('.lb-mychip-value'),a=c.querySelector('.leaderboard-avatar');if(!val)return {value:false};const k=getComputedStyle(val);
 return {value:true,pad:k.paddingLeft,margin:k.marginLeft,border:k.borderLeftWidth,wrap:k.whiteSpace,avatarPad:getComputedStyle(a).paddingLeft,chip:c.getBoundingClientRect().height};})()`;
test('我的主页 chip: the default avatar ? sits in the middle of the circle, 注册 / 登录 does not run into 我的主页, the value keeps its spacing',{skip:!hasEdge&&'Edge not installed',timeout:180000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-mychip-'));const root=path.join(temp,'root');fs.mkdirSync(root);
 const service=startService(root);let web,cdp;
 try{web=await startWeb(service);cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  const url=`http://127.0.0.1:${web.address().port}/#%7B%7D`;
  const nav=await cdp.send('Page.navigate',{url});
  assert.ok(!nav.errorText,`navigation failed (${nav.errorText})`);
  let opened=false,diag=null;
  for(const deadline=Date.now()+45000;Date.now()<deadline&&!opened;){
   await sleep(200);
   diag=await cdp.evaluate(DIAG).catch(()=>null);
   if(diag?.href!==url)continue;
   if(diag.hasRetry)break;
   opened=await cdp.evaluate(OPEN).catch(()=>false);
  }
  assert.ok(opened,`leaderboard tab found (${JSON.stringify(diag)})`);
  let s=null;
  for(const deadline=Date.now()+30000;Date.now()<deadline&&!s;){
   await sleep(200);
   s=await cdp.evaluate(PROBE).catch(()=>null);
  }
  if(!s)diag=await cdp.evaluate(DIAG).catch(()=>diag);
  assert.ok(s,`我的主页 chip rendered (${JSON.stringify(diag)})`);
  await cdp.evaluate('document.fonts?.ready?document.fonts.ready.then(()=>true):true').catch(()=>{});
  s=await cdp.evaluate(PROBE)||s;
  assert.equal(s.text,'注册 / 登录','signed out');
  assert.ok(Math.abs(s.dx)<=1,'? in the middle of the circle: dx '+s.dx);
  assert.equal(s.avatarPad,'0px','the avatar takes none of the value\'s spacing');
  for(const [name,l] of [['我的主页',s.small],['注册 / 登录',s.strong]])
   assert.ok(l.lineHeight>=l.fontSize*1.3,name+' has room for its glyphs (its own line-height, not the button font\'s 1): '+JSON.stringify(l));
  assert.ok(s.chip<=40,'chip keeps its one-avatar height, '+s.chip);
  const v=await cdp.evaluate(RANKED);
  assert.ok(v&&v.value,'a chip with a value rendered: '+JSON.stringify(v));
  assert.deepEqual({pad:v.pad,margin:v.margin,border:v.border,wrap:v.wrap},{pad:'14px',margin:'6px',border:'1px',wrap:'nowrap'},'the value keeps its divider and spacing on one line');
  assert.equal(v.avatarPad,'0px','the avatar next to a value takes none of its spacing');
 }finally{await cdp?.stop();web?.close();await service.stop();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
