// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 ファタモルガーナの館（海市蜃楼之馆）: after 「館の扉を開く」 the prologue is pictures of text fading in and out
   (「鬱蒼と茂る闇の森をかき分けると」「しかし 何時の間にか」), the hook gives no line, and the cold run ended 'stalled' 45 s after its
   5th line while the runner's own OCR read new text on the screen. New Japanese text on the screen now keeps the run going
   (core/cold-test/drive.cjs screenStallMs; services/cold-test-run.cjs hands the OCR text to the driver). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {Driver}=require('../core/cold-test/drive.cjs');
const W={w:800,h:600};
/* a driver past the title with 5 lines at t=10 s, then only screen text: -> the first 'end' and when */
function ride(screenAt){const d=new Driver({stallMs:45000,screenStallMs:180000,advanceEvery:1e9,ctrlEvery:1e9,confirmAfter:1e9});
 d.next({t:0,window:W});d.next({t:10000,window:W,lines:5});
 for(let t=10250;t<=400000;t+=250){const acts=d.next({t,window:W,lines:5,screenText:screenAt(t)});const e=acts.find(a=>a.do==='end');if(e)return {why:e.why,t};}
 return null;}
const PROLOGUE=['','鬱蒼と茂る闇の森をかき分けると','しかし何時の間にか','その館は、深い霧に覆われていると','大きな館が建っていた','もう誰も住んではいない'];

test('ファタ: the prologue text changing on the screen keeps the run going past 45 s without a hook line',()=>{
 const r=ride(t=>PROLOGUE[Math.min(PROLOGUE.length-1,Math.floor(t/20000))]);
 assert.ok(r.t>100000,'still running while the screen moved: ended '+r.why+' at '+r.t);
 assert.equal(r.why,'stalled','ends once the screen stops changing');});

test('a screen that keeps changing does not run for ever: screenStallMs after the last hook line',()=>{
 const r=ride(t=>'場面'+'あいうえおかきくけこさしすせそ'[Math.floor(t/20000)%15]+'の文');
 assert.equal(r.why,'stalled');assert.ok(r.t<=10000+180000+45000+250,'ended at '+r.t);});

test('the same picture, or text without Japanese, is no progress: stalled 45 s after the last line as before',()=>{
 assert.deepEqual(ride(()=>'鬱蒼と茂る闇の森をかき分けると'),{why:'stalled',t:55000});
 assert.deepEqual(ride(t=>'SAVE LOAD '+Math.floor(t/20000)),{why:'stalled',t:55000});
 assert.deepEqual(ride(()=>''),{why:'stalled',t:55000});});

function fakeHelper(script){const sent=[],args=[];const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();
 child.stdin.on('data',b=>{for(const l of String(b).split('\n').filter(Boolean)){sent.push(l);if(l==='kill')setImmediate(()=>{child.stdout.write(JSON.stringify({type:'ended',why:'killed'})+'\n');child.stdout.end();child.emit('exit',0);});
  if(l.startsWith('shot '))child.stdout.write(JSON.stringify({type:'shot',ok:true,path:l.split(' ').slice(2).join(' '),w:800,h:600,black:false})+'\n');}});
 child.kill=()=>{};setImmediate(()=>script(m=>child.stdout.write(JSON.stringify(m)+'\n')));return {spawn:(f,a)=>{args.push(...a);return child;},sent,args};}
class FakeHook{constructor(layout){this.layout=layout;}configure(p,s){this.state=s;}tick(){}stop(){}drawLog(){}}
const until=async(cond,ms=10000)=>{const end=Date.now()+ms;while(!cond()&&Date.now()<end)await new Promise(r=>setTimeout(r,20));return cond();};

test('runOne: the text its OCR read reaches the driver',async()=>{const R=require('../services/cold-test-run.cjs');
 const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'cold-screen-'));let t=0;const seen=[];
 class Spy extends Driver{next(obs){if(obs.screenText)seen.push(obs.screenText);return super.next(obs);}}
 const h=fakeHelper(emit=>{emit({type:'started',pid:5,started:'1'});emit({type:'window',hwnd:'9',w:800,h:600});});
 const p=R.runOne({exe:'C:/g/fata_jp.exe',runDir:path.join(dir,'run'),budgetMs:600000,ocrMenu:true},{spawn:h.spawn,helper:'ColdDesk.exe',Hook:FakeHook,layout:{native:dir},tick:5,now:()=>t+=400,Driver:Spy,
  ocr:async()=>[{text:'鬱 蒼 と 茂 る 闇 の 森 を か き 分 け る と',x:250,y:330,w:300,h:20}],driver:{introEvery:1e9,introMs:1e9}});
 try{assert.ok(await until(()=>seen.length>0),'no screen text reached the driver');assert.equal(seen.at(-1),'鬱蒼と茂る闇の森をかき分けると');}
 finally{R.stopActive();await p;fs.rmSync(dir,{recursive:true,force:true});}});
