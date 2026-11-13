const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const shots=require('../services/scene-shots.cjs');
const jpeg=Buffer.from('fake').toString('base64');
const reader=root=>{const r={root,gameExe:path.join(root,'game.exe'),calls:0,gal:{sceneShot:async()=>{r.calls++;return {jpeg,score:90,hash:'00000000000000ff'};}}};return r;};

test('scene shots are never captured while a dialogue box is on screen',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shots-')),r=reader(root);
 try{await shots.maybe(r);await shots.maybe(r);assert.equal(r.calls,0,'a new line (box shown) never captures');
  /* the box leaves, but a line arrives during the settle wait: dropped */
  const p=shots.maybe(r,{hidden:true});setTimeout(()=>shots.maybe(r),100);await p;assert.equal(r.calls,0);
  r.sceneShotState.at=0;await shots.maybe(r,{hidden:true});assert.equal(r.calls,1,'captured once the box is gone');
  const listed=shots.list(root,r.gameExe);assert.equal(listed.length,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('shots stored before the rule (no clean mark) are never offered as cards',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shots-')),exe=path.join(root,'g.exe');
 try{shots.keep(root,exe,{jpeg,score:80,hash:'0000000000000f00'},1);const dir=fs.readdirSync(path.join(root,'data','scene-shots'))[0],idx=path.join(root,'data','scene-shots',dir,'index.json');
  const list=JSON.parse(fs.readFileSync(idx,'utf8'));list.push({file:'old-abcdef.jpg',score:99,hash:'ffff000000000000',at:0});fs.writeFileSync(idx,JSON.stringify(list));
  assert.deepEqual(shots.list(root,exe).map(x=>x.score),[80]);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('a frame with a dialogue box band is recognised, a clean CG is not',async()=>{
 const {hasTextBox}=await import('../web/textbox-detect.js');const w=96,h=72;
 const frame=box=>{const d=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;let r=120+60*Math.sin(x*.21+y*.13),g=90+50*Math.cos(x*.17-y*.09),b=140+40*Math.sin((x+y)*.11);
  if(box&&y>=Math.floor(h*.7)){r=60;g=40;b=110;if(y>h*.76&&y<h*.92&&x>8&&x<w-8&&(x*7+y*3)%9<2){r=g=b=250;}}d[i]=r;d[i+1]=g;d[i+2]=b;d[i+3]=255;}return d;};
 assert.equal(hasTextBox(frame(true),w,h),true);
 assert.equal(hasTextBox(frame(false),w,h),false);
});
