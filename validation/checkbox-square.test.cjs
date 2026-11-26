// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 11-27 (user: 勾选框勾选成这样了 不止这里 方框还是个长方形 / 文字位置错了): with every stylesheet of web/index.html loaded,
   a checkbox stretched to 28x24 (another input rule added 11px 13px padding), its tick shrank to a white dot in the corner
   (grimoire-controls.css drew a second, masked tick over the controls-b.css one), and the startup notice's
   「当前版本不再提示」 sat about 2px above the box. This test renders the real stylesheets in a headless Edge (its own
   temporary profile, services/cardinal/cdp.cjs) and measures the painted pixels: box size, where the white tick is, and
   where the label's glyphs are. MEGULIT_SHOT_DIR=<folder> also saves the screenshots used for the PR. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch}=require('../services/cardinal/cdp.cjs');
const web=path.join(__dirname,'../web');
const styles=[...fs.readFileSync(path.join(web,'index.html'),'utf8').matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(m=>m[1]);
const SCALE=4;

const body=`<main class="main" style="padding:24px">
 <label class="probe-main" style="display:inline-flex;align-items:center;gap:8px"><input type="checkbox" id="main-check" checked><span>启动时检查更新</span></label>
 <label class="probe-main" style="display:inline-flex;align-items:center;gap:8px;margin-left:24px"><input type="radio" id="main-radio" name="r" checked><span>简体中文</span></label>
</main>
<dialog class="game-dialog dev-notice seed-flow startup-notice" id="notice"><div class="dev-notice-page" data-page="1">
 <div class="dev-notice-offbar"><label class="dev-notice-off"><input type="checkbox" id="notice-check" data-notice-off checked><span>当前版本不再提示</span></label></div>
</div></dialog>`;

async function capture(page,rect,pad=0){
 const clip={x:Math.max(0,rect.x-pad),y:Math.max(0,rect.y-pad),width:rect.width+pad*2,height:rect.height+pad*2,scale:SCALE};
 const shot=await page.c.send('Page.captureScreenshot',{format:'png',clip});
 return {clip,png:shot.data};
}
/* the painted pixels of one clip, analysed in the page: bounding box (CSS px, page coordinates) of the pixels matching `kind` */
async function ink(page,{clip,png},kind){
 return page.evaluate(async({png,clip,kind,scale})=>{
  const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
  const d=g.getImageData(0,0,c.width,c.height).data,at=(x,y)=>{const i=(y*c.width+x)*4;return [d[i],d[i+1],d[i+2]];};
  const bg=at(1,1),hit=kind==='white'?p=>p[0]>215&&p[1]>215&&p[2]>215:p=>Math.abs(p[0]-bg[0])+Math.abs(p[1]-bg[1])+Math.abs(p[2]-bg[2])>90;
  let x0=Infinity,y0=Infinity,x1=-1,y1=-1,n=0;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(hit(at(x,y))){n++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  if(!n)return null;
  return {n,left:clip.x+x0/scale,right:clip.x+(x1+1)/scale,top:clip.y+y0/scale,bottom:clip.y+(y1+1)/scale};
 },{png,clip,kind,scale:SCALE});
}
const rectOf=(page,selector)=>page.evaluate(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};},selector);

test('checkboxes render as a 17px square with the tick centred; 「当前版本不再提示」 lines up with its box',async()=>{
 const browser=await launch({viewport:{width:900,height:600}}),page=browser.page;
 const shots=process.env.MEGULIT_SHOT_DIR||'';
 try{
  page.route(url=>{const u=new URL(url);if(u.origin!=='https://checkbox.invalid')return 'abort';const file=path.resolve(web,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(web+path.sep)||!fs.existsSync(file))return 'abort';return {body:fs.readFileSync(file),headers:{'content-type':file.endsWith('.css')?'text/css':'application/octet-stream','access-control-allow-origin':'*'}};});
  const html='<!doctype html><html lang="zh-CN" data-theme="dark"><head><meta charset="utf-8">'+styles.map(f=>`<link rel="stylesheet" href="https://checkbox.invalid/${f}">`).join('')+'</head><body>'+body+'</body></html>';
  await page.goto('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  await page.evaluate(()=>document.fonts.ready.then(()=>new Promise(r=>setTimeout(r,400))));
  const problems=[];
  /* .main first: the modal's backdrop dims the page behind the startup notice */
  for(const id of ['main-check','main-radio','notice-check']){
   if(id==='notice-check')await page.evaluate(()=>{const d=document.getElementById('notice');d.showModal();document.activeElement?.blur();return new Promise(r=>setTimeout(r,400));});
   const box=await rectOf(page,'#'+id);
   if(Math.abs(box.width-17)>.01||Math.abs(box.height-17)>.01)problems.push(`${id}: box is ${box.width}x${box.height}, not 17x17`);
   if(id==='main-radio')continue;
   const shot=await capture(page,box);
   if(shots){fs.mkdirSync(shots,{recursive:true});fs.writeFileSync(path.join(shots,id+'.png'),Buffer.from(shot.png,'base64'));}
   const tick=await ink(page,shot,'white');
   if(!tick){problems.push(`${id}: no white tick painted`);continue;}
   const cx=(tick.left+tick.right)/2-(box.x+box.width/2),cy=(tick.top+tick.bottom)/2-(box.y+box.height/2),h=tick.bottom-tick.top;
   if(Math.hypot(cx,cy)>2.5)problems.push(`${id}: tick centre is ${cx.toFixed(2)},${cy.toFixed(2)} px from the box centre`);
   if(h<6)problems.push(`${id}: tick is only ${h.toFixed(2)} px tall (a dot, not a check)`);
  }
  const box=await rectOf(page,'#notice-check'),label=await rectOf(page,'.dev-notice-off span');
  if(shots){const whole=await rectOf(page,'.dev-notice-off');fs.writeFileSync(path.join(shots,'dev-notice-off.png'),Buffer.from((await capture(page,whole,6)).png,'base64'));}
  const text=await ink(page,await capture(page,label,3),'ink');
  if(!text)problems.push('dev-notice: label glyphs not found');
  else{const off=(text.top+text.bottom)/2-(box.y+box.height/2);if(Math.abs(off)>1)problems.push(`dev-notice: 「当前版本不再提示」 midline is ${off.toFixed(2)} px from the box midline`);}
  assert.deepEqual(problems,[]);
 }finally{await browser.close();}
});
