// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 the cold test's input ladder (core/cold-test/input-fallback.cjs + services/cold-test-run.cjs inputLadder): PostMessage
   first, InputShim (testbed InputCtl) when a watched click changed nothing, SendInput only on a visible run; without
   opts.inputFallback (the app's idle cold test) nothing but ColdDesk's PostMessage is sent */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const F=require('../core/cold-test/input-fallback.cjs');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'cold-input-'));

/* an RGBA PNG, each row with the given filter (the encoder side of pngGray) */
function png(w,h,pix,filters=[0]){const crc=b=>{let c=~0;for(const x of b){c^=x;for(let k=0;k<8;k++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return ~c>>>0;};
 const chunk=(k,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const kd=Buffer.concat([Buffer.from(k,'latin1'),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(kd));return Buffer.concat([l,kd,c]);};
 const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
 const rows=[];let prev=Buffer.alloc(w*4);
 for(let y=0;y<h;y++){const f=filters[y%filters.length],row=Buffer.alloc(w*4);for(let x=0;x<w;x++){const v=pix(x,y);row.writeUInt32BE(((v<<24)|(v<<16)|(v<<8)|255)>>>0,x*4);}
  const out=Buffer.alloc(w*4);for(let i=0;i<w*4;i++){const a=i>=4?row[i-4]:0,b=prev[i],c=i>=4?prev[i-4]:0;let p=0;
   if(f===1)p=a;else if(f===2)p=b;else if(f===3)p=(a+b)>>1;else if(f===4){const q=a+b-c,pa=Math.abs(q-a),pb=Math.abs(q-b),pc=Math.abs(q-c);p=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}out[i]=(row[i]-p)&255;}
  rows.push(Buffer.from([f]),out);prev=row;}
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]);}

test('pngGray reads every row filter; screenChange counts the pixels that moved',()=>{
 const a=F.pngGray(png(16,10,(x,y)=>(x*13+y*7)&255,[0,1,2,3,4]));assert.equal(a.w,16);assert.equal(a.h,10);
 for(let y=0;y<10;y++)for(let x=0;x<16;x++)assert.equal(a.px[y*16+x],(x*13+y*7)&255,'pixel '+x+','+y);
 const title=F.pngGray(png(16,10,()=>200)),blink=F.pngGray(png(16,10,(x,y)=>x<2&&y<2?20:200)),black=F.pngGray(png(16,10,()=>0));
 assert.ok(F.screenChange(title,blink)<0.05,'a small animation is no change');assert.equal(F.screenChange(title,black),1);
 assert.equal(F.screenChange(title,null),null);assert.equal(F.pngGray(Buffer.from('nope')),null);
 /* a real ColdDesk picture (System.Drawing PNG), when the earlier Monochrome Empire run is on this PC */
 const real='F:\\Agent\\work\\adapt-auto-runs\\Monochrome Empire\\run\\ocr-1.png';if(fs.existsSync(real)){const r=F.pngGray(fs.readFileSync(real));assert.ok(r&&r.w>100&&r.h>50,'decodes '+real);}});

test('ladder: no change after a watched click goes one level up and sends it again; a change keeps the level',()=>{
 assert.deepEqual(F.ladder(),['post']);assert.deepEqual(F.ladder({inputCtl:true}),['post','inputctl']);assert.deepEqual(F.ladder({inputCtl:true,foreground:true}),['post','inputctl','sendinput']);
 const L=new F.Ladder(F.ladder({inputCtl:true,foreground:true}),{waitMs:1000,minChange:0.25});const click={do:'click',x:10,y:20,watch:'start'};
 assert.equal(L.start(click,0,{lines:1}),true);assert.equal(L.start(click,10,{lines:1}),false,'one watch at a time');
 assert.equal(L.tick(500,{lines:1}),null);assert.deepEqual(L.tick(1000,{lines:1}),{need:'shot'});
 L.screen(0.02);const r=L.tick(1100,{lines:1});assert.deepEqual(r,{done:true,changed:false,resend:click});assert.equal(L.level,'inputctl');
 L.start(click,1200,{lines:1});assert.deepEqual(L.tick(1300,{lines:2}),{done:true,changed:true},'a new line is a change');assert.equal(L.level,'inputctl');
 L.start(click,2000,{lines:2});L.tick(3000,{lines:2});L.screen(0.9);assert.deepEqual(L.tick(3100,{lines:2}),{done:true,changed:true},'the picture changed');
 L.start(click,4000,{lines:2});L.tick(5000,{lines:2});assert.deepEqual(L.tick(8000,{lines:2}).resend,click,'no after picture: judged on the lines');assert.equal(L.level,'sendinput');
 L.start(click,9000,{lines:2});L.tick(10000,{lines:2});L.screen(null);assert.deepEqual(L.tick(10100,{lines:2}),{done:true,changed:false},'the top level stays');
 assert.deepEqual(L.record.escalations.map(e=>e.from+'>'+e.to),['post>inputctl','inputctl>sendinput']);assert.equal(L.record.checks.length,5);assert.equal(L.record.checks[0].via,'post');});

test('ladder: stalled lines go up without a re-send; a level that cannot work is dropped',()=>{
 const L=new F.Ladder(['post','inputctl'],{stallMs:5000});assert.equal(L.stall(4000,0),false);assert.equal(L.stall(6000,0,{advancing:false}),false);
 assert.equal(L.stall(6000,0),true);assert.equal(L.level,'inputctl');assert.equal(L.stall(20000,0),false,'top level');
 const D=new F.Ladder(['post','inputctl','sendinput']);D.raise(0,'x');D.drop('inputctl','inject exit 3');assert.equal(D.level,'sendinput');assert.deepEqual(D.record.errors,['inputctl: inject exit 3']);
 const E=new F.Ladder(['post','inputctl']);E.raise(0,'x');E.drop('inputctl','no shim');assert.equal(E.level,'post');});

/* fake ColdDesk (answers pictures) and fake services/cold-input.ps1 (answers init) */
function fakeDesk(){const sent=[];const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();child.exitCode=null;
 child.stdin.on('data',b=>{for(const l of String(b).split('\n').filter(Boolean)){sent.push(l);if(l==='kill')setImmediate(()=>{child.stdout.write(JSON.stringify({type:'ended',why:'killed'})+'\n');child.stdout.end();child.emit('exit',0);});
  if(l.startsWith('shot '))child.stdout.write(JSON.stringify({type:'shot',ok:true,path:l.split(' ').slice(2).join(' '),w:160,h:90,black:false})+'\n');}});
 child.kill=()=>{};setImmediate(()=>{child.stdout.write(JSON.stringify({type:'started',pid:4242,started:'1'})+'\n');child.stdout.write(JSON.stringify({type:'window',hwnd:'777',w:1024,h:576})+'\n');});return {spawn:()=>child,sent};}
function fakeInput(){const sent=[],args=[];const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();
 child.stdin.on('data',b=>{for(const l of String(b).split('\n').filter(Boolean)){sent.push(l);if(l.startsWith('init '))child.stdout.write(JSON.stringify({type:'init',ok:true,why:''})+'\n');}});
 child.kill=()=>{};return {spawn:(cmd,a)=>{args.push(cmd,...a);return child;},sent,args};}
/* the runner's timer is unref'd (it never keeps the app alive): the test keeps the loop up */
const alive=p=>{const k=setInterval(()=>{},50);return p.finally(()=>clearInterval(k));};
class QuietHook{configure(){}tick(){}stop(){}}
/* one watched start click at 50 ms, then nothing until 1 s */
class OneClick{constructor(){this.n=0;}next(obs){if(obs.t>=1000)return [{do:'end',why:'test'}];if(obs.window&&!this.n++)return [{do:'click',x:512,y:400,watch:'start'},{do:'keydown',vk:17}];return [];}}

test('run: a watched click the game ignored goes to InputShim (32 bit for an x86 exe), Ctrl moves with it; recorded in run.json',async()=>{const run=require('../services/cold-test-run.cjs');const dir=tmp();
 const ctl=path.join(dir,'testbed');fs.mkdirSync(ctl);for(const f of ['InputCtl32.exe','InputShim32.dll'])fs.writeFileSync(path.join(ctl,f),'');
 const desk=fakeDesk(),inp=fakeInput();
 const r=await alive(run.runOne({exe:'C:/g/MonochromeEmpire.exe',runDir:path.join(dir,'run'),budgetMs:60000,inputFallback:{inputCtlDir:ctl,foreground:false,ladder:{waitMs:100}}},{spawn:desk.spawn,inputSpawn:inp.spawn,helper:'ColdDesk.exe',Hook:QuietHook,layout:{native:dir},tick:10,Driver:OneClick}));
 const firstShot=desk.sent.findIndex(l=>/^shot 160 .*inp-1-a\.png$/.test(l)),click=desk.sent.indexOf('click 512 400');
 assert.ok(firstShot>=0&&click>firstShot,'the before picture, then the posted click: '+desk.sent.join(' | '));
 assert.ok(desk.sent.some(l=>/inp-1-b\.png$/.test(l)),'the after picture');assert.ok(desk.sent.includes('keyup 17'),'Ctrl released on the old level');
 assert.ok(inp.args.some(a=>/cold-input\.ps1$/.test(a)));
 assert.equal(inp.sent[0],'hwnd 777');assert.match(inp.sent[1],/^init 4242 777 (32|64) /);
 assert.ok(inp.sent.includes('shim down 11'),'Ctrl held through the shim: '+inp.sent.join(' | '));assert.ok(inp.sent.includes('shim click 512 400'),'the click sent again through the shim: '+inp.sent.join(' | ')+' DESK '+desk.sent.join(' | '));
 assert.equal(r.input.level,'inputctl');assert.equal(r.input.sent.post,3,'click, Ctrl down, Ctrl up');assert.ok(r.input.sent.inputctl>=2);assert.equal(r.input.escalations[0].from,'post');assert.equal(r.input.checks[0].via,'post');assert.equal(r.input.checks[0].changed,false);
 assert.equal(r.input.inject.ok,true);assert.ok(!r.shots.some(s=>/^inp-/.test(s)),'ladder pictures are not run pictures');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'run','run.json'),'utf8')).input.level,'inputctl');});

test('run: without inputFallback (the app\'s idle cold test) only PostMessage, no ladder pictures, no input record',async()=>{const run=require('../services/cold-test-run.cjs');const dir=tmp();
 const desk=fakeDesk();let spawned=0;
 const r=await alive(run.runOne({exe:'C:/g/x.exe',runDir:path.join(dir,'run'),budgetMs:60000},{spawn:desk.spawn,inputSpawn:()=>{spawned++;throw Error('no');},helper:'ColdDesk.exe',Hook:QuietHook,layout:{native:dir},tick:10,Driver:OneClick}));
 assert.ok(desk.sent.includes('click 512 400'));assert.ok(!desk.sent.some(l=>/inp-/.test(l)));assert.equal(spawned,0);assert.equal(r.input,undefined);});

test('run: no testbed InputCtl → the ladder is PostMessage (+ SendInput on a visible run) and says why',async()=>{const run=require('../services/cold-test-run.cjs');const dir=tmp();
 const desk=fakeDesk(),inp=fakeInput();
 const r=await alive(run.runOne({exe:'C:/g/x.exe',runDir:path.join(dir,'run'),budgetMs:60000,inputFallback:{inputCtlDir:path.join(dir,'none'),foreground:true,ladder:{waitMs:100}}},{spawn:desk.spawn,inputSpawn:inp.spawn,helper:'ColdDesk.exe',Hook:QuietHook,layout:{native:dir},tick:10,Driver:OneClick}));
 assert.deepEqual(r.input.levels,['post','sendinput']);assert.equal(r.input.level,'sendinput');assert.match(r.input.errors[0],/no InputCtl32/);
 assert.ok(inp.sent.includes('fg click 512 400'));assert.ok(!inp.sent.some(l=>l.startsWith('init ')));});

test('driver holdBlind: few lines and none for confirmAfter, no blind click until the OCR looked; then the start item is clicked',()=>{const {Driver}=require('../core/cold-test/drive.cjs');
 const W={w:1024,h:576},d=new Driver({holdBlind:true,confirmAfter:1000,advanceEvery:100,skip:false,introEvery:100});d.next({t:0,window:W});d.next({t:100,window:W,lines:1});
 assert.ok(d.next({t:300,window:W,lines:1}).length>0,'before confirmAfter it still advances');
 for(let t=1200;t<3000;t+=200)assert.deepEqual(d.next({t,window:W,lines:1}),[],'held at '+t);
 assert.ok(d.next({t:3200,window:W,lines:1,ocr:1}).length>0,'after the OCR the blind advance resumes');
 const start={role:'button',text:'最初から始める',x:400,y:300,w:200,h:40};assert.deepEqual(d.next({t:6000,window:W,lines:1,ocr:1,menu:[start]}),[{do:'click',x:500,y:320,watch:'start'}]);
 const off=new Driver({confirmAfter:1000,advanceEvery:100,skip:false});off.next({t:0,window:W});off.next({t:100,window:W,lines:1});assert.ok(off.next({t:2000,window:W,lines:1}).length>0,'off by default (the app)');});
