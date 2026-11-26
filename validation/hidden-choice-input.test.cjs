// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 11-27: in Settings → translation models, the download source pill 「Hugging Face」 had an empty gap on its left. The radio
   inside is meant to be invisible and out of the flow (controls.css: position:absolute, 0x0), but the shared checkbox /
   radio skin in controls-b.css set position:relative with a far higher specificity, so the hidden 17px radio still took
   its place in the row. The same happens to every chip-style choice whose input hides the same way (leaderboard report
   kinds). This test renders the real stylesheets of web/index.html in a headless Edge (its own temporary profile,
   services/cardinal/cdp.cjs) and compares the painted pixels of each choice with and without its input in the layout.
   MEGULIT_SHOT_DIR=<folder> also saves the screenshots used for the PR. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch}=require('../services/cardinal/cdp.cjs');
const web=path.join(__dirname,'../web');
const styles=[...fs.readFileSync(path.join(web,'index.html'),'utf8').matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(m=>m[1]);
const SCALE=4;

/* the markup the app builds (translation-settings.js, leaderboard-social.js, learning-goal.js, game-language.js) */
const body=`<main class="main" style="padding:24px">
 <label class="download-source">下载源<span><label id="hf"><input type="radio" name="download-source" value="hf" checked> Hugging Face</label> <label id="mirror"><input type="radio" name="download-source" value="mirror"> hf-mirror.com</label></span></label>
 <label class="locale-toggle detail-locale" id="locale"><strong>日本語</strong><input type="checkbox" role="switch" data-locale checked><span class="review-switch" aria-hidden="true"></span></label>
</main>
<div class="lv-backdrop" id="goals" hidden><div class="lv-dialog lg-dialog" role="dialog"><form class="lg-form">
 <div class="lv-grid lg-goals"><label class="lv-opt lg-goal active" id="goal" style="--i:0"><input type="checkbox" name="goal" value="read" checked><span class="lv-seal" aria-hidden="true">読</span><b>读游戏</b><small>看懂剧情</small></label></div>
 <div class="lg-row"><label class="lg-chip" id="chip"><input type="radio" name="level" value="n3" checked><span>N3</span></label></div>
</form></div></div>
<dialog class="lb-profile-card" id="report"><fieldset class="lb-report-kinds"><legend>原因</legend><label id="kind"><input type="radio" name="kind" value="spam" checked><span>垃圾信息</span></label></fieldset></dialog>`;
const CASES=[
 {id:'hf',where:'设置页 翻译下载源 Hugging Face',centred:true},
 {id:'mirror',where:'设置页 翻译下载源 hf-mirror.com',centred:true},
 {id:'kind',where:'排行榜 举报原因',dialog:true},
 {id:'locale',where:'作品详情 日语原版开关'},
 {id:'chip',where:'学习目标 等级胶囊',layer:true},
 {id:'goal',where:'学习目标 目标卡片',layer:true}
];

async function inkOf(page,selector,shots,name){
 const r=await page.evaluate(s=>{const b=document.querySelector(s).getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};},selector);
 const clip={x:Math.max(0,r.x-2),y:Math.max(0,r.y-2),width:r.width+4,height:r.height+4,scale:SCALE};
 const shot=await page.c.send('Page.captureScreenshot',{format:'png',clip});
 if(shots)fs.writeFileSync(path.join(shots,name+'.png'),Buffer.from(shot.data,'base64'));
 const ink=await page.evaluate(async({png,clip,scale})=>{
  const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
  const d=g.getImageData(0,0,c.width,c.height).data,at=(x,y)=>{const i=(y*c.width+x)*4;return [d[i],d[i+1],d[i+2]];};
  const bg=at(1,1);let x0=Infinity,x1=-1;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const p=at(x,y);if(Math.abs(p[0]-bg[0])+Math.abs(p[1]-bg[1])+Math.abs(p[2]-bg[2])>90){if(x<x0)x0=x;if(x>x1)x1=x;}}
  return x1<0?null:{left:clip.x+x0/scale,right:clip.x+(x1+1)/scale};
 },{png:shot.data,clip,scale:SCALE});
 return {box:r,ink};
}
/* glyph ink of the pill's own text (the label minus its padding box), for the centring check */
async function textInk(page,selector){
 return page.evaluate(s=>{const l=document.querySelector(s),range=document.createRange();const text=[...l.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim());if(!text.length)return null;range.setStart(text[0],text[0].textContent.search(/\S/));range.setEnd(text.at(-1),text.at(-1).textContent.trimEnd().length);const t=range.getBoundingClientRect(),b=l.getBoundingClientRect();return {left:t.left-b.left,right:b.right-t.right};},selector);
}

test('a hidden radio or checkbox inside a chip-style choice takes no room in the row',async()=>{
 const browser=await launch({viewport:{width:900,height:700}}),page=browser.page;
 const shots=process.env.MEGULIT_SHOT_DIR||'';if(shots)fs.mkdirSync(shots,{recursive:true});
 try{
  page.route(url=>{const u=new URL(url);if(u.origin!=='https://chip.invalid')return 'abort';const file=path.resolve(web,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(web+path.sep)||!fs.existsSync(file))return 'abort';return {body:fs.readFileSync(file),headers:{'content-type':file.endsWith('.css')?'text/css':'application/octet-stream','access-control-allow-origin':'*'}};});
  const html='<!doctype html><html lang="zh-CN" data-theme="dark"><head><meta charset="utf-8">'+styles.map(f=>`<link rel="stylesheet" href="https://chip.invalid/${f}">`).join('')+'</head><body>'+body+'</body></html>';
  await page.goto('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  await page.evaluate(()=>document.fonts.ready.then(()=>new Promise(r=>setTimeout(r,400))));
  const problems=[];
  for(const c of CASES){
   /* the goal picker is a full-window layer over the page, opened only for its own cases */
   if(c.layer)await page.evaluate(()=>{const d=document.getElementById('report');if(d.open)d.close();document.getElementById('goals').hidden=false;return new Promise(r=>setTimeout(r,500));});
   if(c.dialog)await page.evaluate(id=>{const d=document.getElementById(id).closest('dialog');if(!d.open)d.showModal();document.activeElement?.blur();return new Promise(r=>setTimeout(r,300));},c.id);
   const sel='#'+c.id;
   if(c.centred){const t=await textInk(page,sel);if(!t)problems.push(`${c.where}: no text`);else if(Math.abs(t.left-t.right)>1)problems.push(`${c.where}: text sits ${t.left.toFixed(1)} px from the left edge and ${t.right.toFixed(1)} px from the right`);}
   const shown=await inkOf(page,sel,shots,c.id);
   await page.evaluate(s=>{document.querySelector(s+' input').style.setProperty('display','none','important');},sel);
   const without=await inkOf(page,sel,'',c.id);
   await page.evaluate(s=>{document.querySelector(s+' input').style.removeProperty('display');},sel);
   if(!shown.ink||!without.ink){problems.push(`${c.where}: nothing painted`);continue;}
   const shift=Math.max(Math.abs(shown.ink.left-without.ink.left),Math.abs(shown.ink.right-without.ink.right)),grow=shown.box.width-without.box.width;
   if(shift>.5||grow>.5)problems.push(`${c.where}: the hidden input moves the visible choice by ${shift.toFixed(1)} px and widens it by ${grow.toFixed(1)} px`);
  }
  assert.deepEqual(problems,[]);
 }finally{await browser.close();}
});
