// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// 2026-11-27 (user: 「下个版本启动器只保留进度条 最后动效取消变圆然后出来那个小脸 换成变形成透明的MeguLit的logo」).
// Builds native/StartupIsland.exe with its real build script, runs its offscreen timeline (--frames: a scripted load,
// no window, no engine) and reads the rendered PNG frames back: while loading only the bar is drawn; when the bar
// fills it turns into a small translucent MeguLit logo, no wider than the bar (no 44 px circle, no face), entering with the
// website's / promo video's logo move (its timings are checked frame by frame); the whole closing stays within the
// old 1.16 s and the main window is revealed no later than before. With Windows animations off the bar just fades.
// 2026-11-28 (user: 「现在这个启动动画的megulit 贼他妈发灰 还卡卡的 要优化一下」): the logo now holds solid in its own
// colours (on a dark desktop the warm white of the letters is near white, not 62 % grey), comes in dark -> bright, and a
// closing frame draws in a few ms (--bench), so it keeps 60 fps on a machine 4x slower.
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path'),os=require('os'),zlib=require('zlib'),{execFileSync}=require('child_process');
const root=path.join(__dirname,'..');
const csc=['C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'].find(f=>fs.existsSync(f));
const skip=process.platform!=='win32'||!csc?'needs Windows and the .NET Framework csc':false;

/* PNG (8-bit RGBA, any filter) back to its pixels */
function readRGBA(file){
 const buf=fs.readFileSync(file);let p=8,w=0,h=0,type=0;const idat=[];
 while(p<buf.length){const n=buf.readUInt32BE(p),t=buf.toString('latin1',p+4,p+8),data=buf.subarray(p+8,p+8+n);
  if(t==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);type=data[9];assert.equal(data[8],8,'8-bit PNG');}if(t==='IDAT')idat.push(data);p+=12+n;}
 assert.equal(type,6,'RGBA PNG');const raw=zlib.inflateSync(Buffer.concat(idat)),bpp=4,stride=w*bpp,out=Buffer.alloc(h*stride);
 for(let y=0;y<h;y++){const f=raw[y*(stride+1)],src=y*(stride+1)+1,row=y*stride,up=row-stride;
  for(let x=0;x<stride;x++){const a=x>=bpp?out[row+x-bpp]:0,b=y?out[up+x]:0,c=y&&x>=bpp?out[up+x-bpp]:0,v=raw[src+x];let pr;
   if(f===0)pr=0;else if(f===1)pr=a;else if(f===2)pr=b;else if(f===3)pr=(a+b)>>1;else{const q=a+b-c,pa=Math.abs(q-a),pb=Math.abs(q-b),pc=Math.abs(q-c);pr=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
   out[row+x]=(v+pr)&255;}}
 const alpha=new Uint8Array(w*h);for(let i=0;i<w*h;i++)alpha[i]=out[i*4+3];return {w,h,alpha,rgba:out};
}
const readAlpha=readRGBA;
/* the frame laid over a dark desktop (#170f11): brightest luminance, mean luminance of the logo, and whether red shows */
function onDark({w,h,rgba}){
 let max=0,sum=0,n=0,red=0;
 for(let i=0;i<w*h;i++){const a=rgba[i*4+3]/255;if(a<.1)continue;
  const r=rgba[i*4]*a+23*(1-a),g=rgba[i*4+1]*a+15*(1-a),b=rgba[i*4+2]*a+17*(1-a),l=.2126*r+.7152*g+.0722*b;
  if(l>max)max=l;sum+=l;n++;if(r>=150&&g<70&&b<90)red++;}
 return {max,mean:n?sum/n:0,red};
}
/* extent of what is visible (alpha above a faint threshold) and the strongest alpha */
function visible({w,h,alpha},min=24){
 let x0=w,x1=-1,y0=h,y1=-1,max=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=alpha[y*w+x];if(a>max)max=a;if(a>=min){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
 return {width:x1<0?0:x1-x0+1,height:y1<0?0:y1-y0+1,max};
}

let work,exe;
test.before(()=>{if(skip)return;
 work=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-startup-island-'));exe=path.join(work,'StartupIsland.exe');
 execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'native','Build-StartupIsland.ps1'),'-OutputPath',exe],{windowsHide:true,stdio:'pipe'});
});
test.after(()=>{if(work)fs.rmSync(work,{recursive:true,force:true});});
function run(name,...flags){
 const dir=path.join(work,name);
 execFileSync(exe,[dir,'zh','#ad1539','--frames',...flags],{windowsHide:true,timeout:60000});
 const timeline=JSON.parse(fs.readFileSync(path.join(dir,'timeline.json'),'utf8'));
 const frame=i=>visible(readAlpha(path.join(dir,String(i).padStart(3,'0')+'.png')));
 return {timeline,frame,index:ms=>timeline.frames.findIndex(f=>f.ms>=ms)};
}

test('render test: the busy frame is the bar alone; the ready frame is the solid logo, not the 44 px face circle',{skip},()=>{
 const base=path.join(work,'still');execFileSync(exe,[base,'zh','#ad1539','--render-test'],{windowsHide:true,timeout:60000});
 const busy=visible(readAlpha(base+'-busy.png')),still=readRGBA(base+'-ready.png'),ready=visible(still),look=onDark(still);
 assert.ok(busy.height<=12&&busy.width>=200,`busy: a thin full-width bar (${busy.width}x${busy.height})`);
 assert.ok(ready.width>=150&&ready.width<=218,`ready: the logo, about as wide as the bar and no wider, not a circle (got ${ready.width}x${ready.height})`);
 assert.ok(ready.max>=250,`ready: solid, not laid down translucent (strongest alpha ${ready.max})`);
 assert.ok(look.max>=225,`ready: on a dark desktop the letters' warm white is near white, not grey (brightest ${look.max.toFixed(0)})`);
 assert.ok(look.red>=200,`ready: the cape and "Lit" show Megumin red (${look.red} red pixels)`);
});

test('loading shows only the progress bar; the full bar turns into a solid MeguLit logo, not a circle with a face',{skip},()=>{
 const {timeline,frame,index}=run('morph'),s=timeline.scale,ready=timeline.readyAt;
 assert.ok(ready>0,'the scripted load completes');
 for(const ms of [40,120,280,600,ready-40]){const v=frame(index(ms));
  assert.ok(v.height>0&&v.height<=10*s,`at ${ms} ms only the 8 px bar is visible (got ${v.height} px tall)`);
  assert.ok(v.width>=200*s,`at ${ms} ms the bar is drawn at full width, not grown out of a circle (got ${v.width} px)`);}
 const hold=frame(index(ready+800));
 assert.ok(hold.width>=150*s,`the closing image is the logo (got ${hold.width} px wide; the old face circle was 44)`);
 assert.ok(hold.width<=218*s,`the logo is small: no wider than the 218 px bar (got ${hold.width} px)`);
 assert.ok(hold.height>=60*s&&hold.height<=95*s,`logo height (got ${hold.height} px)`);
 assert.ok(hold.max>=250,`the logo holds solid (strongest alpha ${hold.max})`);
 // it comes in dark -> bright (in place of the site's blur), and is at full brightness once it lands
 const lum=ms=>onDark(readRGBA(path.join(work,'morph',String(index(ms)).padStart(3,'0')+'.png'))).mean;
 const early=lum(ready+60+200),late=lum(ready+60+400),held=lum(ready+800);
 assert.ok(early<late&&late<=held+1&&early<held*.9,`brightness rises as the logo lands (${early.toFixed(0)} -> ${late.toFixed(0)} -> ${held.toFixed(0)})`);
 const mid=frame(index(ready+300));assert.ok(mid.height>10*s,'mid-morph the logo is coming in where the bar was');
 // the logo's entrance reuses the website's (site/public/assets/js/intro.js), started 60 ms after the bar fills:
 // unfurl = eo(t, 0, 475, 3), ripple = 1 - eo(t, 125, 800, 2), letters rp = eo(t, 100, 575, 4)
 const clamp=v=>Math.max(0,Math.min(1,v)),eo=(t,a,b,p)=>1-Math.pow(1-clamp((t-a)/(b-a)),p);
 for(const f of timeline.frames.filter(f=>f.ms>=ready+60&&f.ms<=ready+900)){const t=f.ms-ready-60;
  assert.ok(Math.abs(f.morph-eo(t,0,475,3))<.002,`cape unfurl at ${t} ms`);
  assert.ok(Math.abs(f.ripple-(1-eo(t,125,800,2)))<.002,`cape ripple at ${t} ms`);
  assert.ok(Math.abs(f.logo-eo(t,100,575,4))<.002,`letters landing at ${t} ms`);}
 assert.ok(timeline.revealAfter<=390,'the main window is revealed no later than before');
 assert.ok(timeline.closeAfter<=1160,'the closing takes no longer than the old 1.16 s');
 const last=timeline.frames.at(-1);assert.ok(last.ms-ready<=1160&&last.opacity<0.01,'faded out by the end');
});

test('with Windows animations off the full bar just fades: no morph, no logo, shorter close',{skip},()=>{
 const {timeline,frame,index}=run('reduce','--reduce-motion'),s=timeline.scale,ready=timeline.readyAt;
 assert.equal(timeline.reduce,true);
 assert.ok(timeline.frames.every(f=>f.morph===0&&f.logo===0),'no frame morphs or shows the logo');
 for(let i=index(ready);i<timeline.frames.length;i++){const v=frame(i);assert.ok(v.height<=10*s,`frame ${i} is only the bar (or nothing)`);}
 assert.ok(timeline.closeAfter<=240&&timeline.revealAfter===0,'the main window is revealed at once and the bar is gone within 240 ms');
 const fades=timeline.frames.filter(f=>f.ms>=ready).map(f=>f.opacity);assert.ok(fades.every((o,i)=>!i||o<=fades[i-1]),'opacity only goes down');
});

test('a closing frame draws fast enough for 60 fps on a machine 4x slower',{skip},()=>{
 const dir=path.join(work,'bench');execFileSync(exe,[dir,'zh','#ad1539','--bench'],{windowsHide:true,timeout:120000});
 const frames=JSON.parse(fs.readFileSync(path.join(dir,'bench.json'),'utf8')).frames.filter(([after])=>after>=0).map(([,ms])=>ms).sort((a,b)=>a-b);
 assert.ok(frames.length>100,'the whole closing was drawn');
 const p95=frames[Math.floor(frames.length*.95)];
 // one 60 Hz frame is 16.7 ms; at 4x slower a frame must draw in a quarter of it. CI runners are slower than desktops,
 // so the bound is half a frame; the old drawing took ~100 ms per closing frame here.
 assert.ok(p95<=8,`95th percentile draw time of a closing frame ${p95.toFixed(2)} ms (needs <= 8 ms)`);
});
