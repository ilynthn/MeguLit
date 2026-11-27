// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 (owner via 总指挥: 实机验证时输入只发给自己的游戏窗口，截图也只截自己的窗口，不准再用真实鼠标；几个代理同时跑也不会互相打架)
   The live check's hands and eyes on a game that is already running (the MeguLit under test launched it and bound its reader to it):
     const g=await attach(pid)          native/ColdDesk.exe "attach <pid>": the game's biggest visible window
     await g.click(x,y) / g.key(vk)     PostMessage to the game's own window (the deepest child under the point), never the real mouse
     await g.shot(file)                 the game's window by Windows.Graphics.Capture (services/window-shot.cjs; PrintWindow when WGC cannot):
                                        other windows on top do not matter, Direct3D games too
     await g.windows(pid)               the visible top-level windows of a process (the reader layer of the MeguLit under test)
     await g.wshot(hwnd,file)           one of those windows, the same way
     g.close()                          ends the helper; the game and its windows are left as they are
   Every command waits for the helper's answer ({type:'done'|'shot'|'windows'|'error'}). */
const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
/* the picture: WGC first, PrintWindow when WGC cannot (services/window-shot.cjs owns it) */
const capture=o=>require('../../services/window-shot.cjs').captureWindow({method:'auto',timeoutMs:5000,...o});
const VK={enter:0x0d,esc:0x1b,ctrl:0x11,space:0x20,down:0x28};

function attach(pid,{exe,spawnFn=spawn,timeoutMs=15000}={}){
 if(!exe)throw Error('ColdDesk.exe path needed');
 return new Promise((resolve,reject)=>{
  const child=spawnFn(exe,['attach',String(pid)],{stdio:['pipe','pipe','ignore'],windowsHide:true});
  const waiting=[];let window=null,ended=null;
  const settle=m=>{const w=waiting.shift();if(w){clearTimeout(w.timer);w.done(m);}/* a failed shot sends no done of its own */if(m.type==='error'&&waiting[0]?.dummy)waiting.shift();};
  createInterface({input:child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}
   if(m.type==='window'&&!window){window=m;resolve(api);return;}
   if(m.type==='ended'){ended=m;if(!window)reject(Error('attach: '+(m.why||'ended')));while(waiting.length)settle(m);return;}
   if(m.type==='done'||m.type==='shot'||m.type==='windows'||m.type==='error')settle(m);});
  child.on('error',reject);
  const send=(cmd,want)=>new Promise(done=>{if(ended)return done(ended);const w={done,timer:setTimeout(()=>{const i=waiting.indexOf(w);if(i>=0)waiting.splice(i,1);done({type:'error',why:'timeout',what:cmd});},timeoutMs)};
   /* a shot answers with its own record before the 'done' of the same command */
   if(want==='pair'){const first={done:m=>{w.done(m);},timer:w.timer};waiting.push(first,{done:()=>{},timer:null,dummy:true});}else waiting.push(w);
   child.stdin.write(cmd+'\n');});
  const api={get window(){return window;},
   click:(x,y)=>send('click '+Math.round(x)+' '+Math.round(y)),
   move:(x,y)=>send('move '+Math.round(x)+' '+Math.round(y)),
   key:vk=>send('key '+vk),keydown:vk=>send('keydown '+vk),keyup:vk=>send('keyup '+vk),
   shot:async file=>capture({hwnd:Number(window.hwnd),out:file}),
   wshot:async(hwnd,file)=>capture({hwnd:Number(hwnd),out:file}),
   windows:async p=>{const m=await send('windows '+p,'pair');return m?.type==='windows'?m.list:[];},
   close:()=>{try{child.stdin.write('kill\n');child.stdin.end();}catch{}}};
 });}
/* What the MeguLit under test writes to logs/hook-events.log when its kernel sees a choice screen (core/hook-native.cjs):
   placed = the options reached the reader, frame = a choice frame line left to the choice layer. Either ends the advance.
   "choice candidates too few" is no signal: it comes after ordinary lines too (ファタモルガーナの館 prologue, 2026-11-27). */
const CHOICE_SIGNAL=/choice (placed |frame line left to the choice layer)/;
function choiceSignal(text,extra){for(const line of String(text||'').split(/\r?\n/)){const m=CHOICE_SIGNAL.exec(line)||(extra&&extra.exec(line));if(m)return {line:line.trim(),kind:/placed /.test(m[0])?'placed':/frame line/.test(m[0])?'frame':'extra'};}return null;}
/* Read what a log file grew by since `from` (bytes), without holding it open: MeguLit appends and rotates it. */
function grown(file,from,fsx=require('node:fs')){let size=0;try{size=fsx.statSync(file).size;}catch{return {text:'',size:from};}
 if(size<from)from=0;const fd=fsx.openSync(file,'r');try{const b=Buffer.alloc(size-from);fsx.readSync(fd,b,0,b.length,from);return {text:b.toString('utf8'),size};}finally{fsx.closeSync(fd);}}
/* Advance a running game to its first choice screen with window messages only, then take the pictures.
     g          attach(pid) of the game
     hookLog    the MeguLit under test's logs/hook-events.log
     advance    one way or a list of ways to advance: 'enter' (VK_RETURN) or {x,y} (a click in the game's client area). When the
                hook log has not grown for stallSteps steps the next way is used (2026-11-27 ファタモルガーナの館: Enter read 44
                lines of the prologue, then a page took clicks only and 1200 Enters went nowhere)
     until      an extra RegExp on the hook log that also ends the advance (an option text that is known)
     shotDir    progress pictures every shotEvery steps and, at the end, choice-game.png
     readerPid  the MeguLit under test: its window titled readerTitle is shot too (choice-reader.png)
   Returns {signal:{line,kind}|null, steps, switched, shots:{game,reader}}. Nothing here touches the real mouse or keyboard. */
async function toChoice(g,{hookLog,advance='enter',until=null,max=300,stepMs=1500,stallSteps=8,settleMs=2500,shotDir='',shotEvery=20,readerPid=0,readerTitle='MeguLit tools',sleep=ms=>new Promise(r=>setTimeout(r,ms)),fsx=require('node:fs'),log=()=>{}}={}){
 if(!hookLog)throw Error('hookLog needed');const path=require('node:path');
 const ways=(Array.isArray(advance)?advance:[advance]).filter(Boolean);if(!ways.length)throw Error('advance needed');
 let at=(()=>{try{return fsx.statSync(hookLog).size;}catch{return 0;}})(),signal=null,steps=0,way=0,quiet=0,switched=0;
 const step=w=>w==='enter'?g.key(VK.enter):g.click(w.x,w.y);
 for(;steps<max&&!signal;steps++){await step(ways[way]);await sleep(stepMs);const r=grown(hookLog,at,fsx);quiet=r.text.trim()?0:quiet+1;at=r.size;signal=choiceSignal(r.text,until);
  if(!signal&&ways.length>1&&quiet>=stallSteps){way=(way+1)%ways.length;quiet=0;switched++;log('no new hook lines in '+stallSteps+' steps: advancing by '+JSON.stringify(ways[way]));}
  if(shotDir&&shotEvery&&steps%shotEvery===shotEvery-1)await g.shot(path.join(shotDir,'progress-'+steps+'.png'));}
 log(signal?'choice signal after '+steps+' steps: '+signal.line:'no choice signal in '+steps+' steps');
 const shots={game:null,reader:null};if(!shotDir)return {signal,steps,switched,shots};
 await sleep(settleMs);shots.game=await g.shot(path.join(shotDir,'choice-game.png'));
 if(readerPid){const w=(await g.windows(readerPid)).find(x=>x.title===readerTitle);if(w)shots.reader=await g.wshot(w.hwnd,path.join(shotDir,'choice-reader.png'));}
 return {signal,steps,switched,shots};}
/* The live check's choice step (node tools/megulit-adapter.cjs choice ...): the game was started by the MeguLit under test (its own
   side-by-side install, MEGULIT_SIDE_BY_SIDE=1, the game an own copy from tools/game-copies.cjs); this advances it to the first choice
   and shoots the game and the reader. A person then looks at choice-reader.png: the options in Chinese where the game shows them.
     choice <game pid> --megulit <MeguLit root> [--megulit-pid N] --out <dir> [--engine <id>] [--advance "x,y;enter"] [--until <regexp>] [--max N] [--step-ms N]
   --advance  ways to advance (enter, centre, x,y), tried in turn when the hook log stops growing; without it the engine's row in
              tools/megulit-adapter/engines.cjs (live.advance; CatSystem2 takes keys only), else "enter;centre"
   Writes <out>/choice.json {signal, steps, switched, shots}; exit 0 with a signal, 2 without. */
function parseChoiceArgs(a){const o={pid:0,megulit:'',megulitPid:0,out:'',engine:'',advance:'',until:'',max:600,stepMs:1500};
 for(let i=0;i<a.length;i++){const k=a[i],v=()=>{if(i+1>=a.length)throw Error(k+' needs a value');return a[++i];};
  if(k==='--megulit')o.megulit=v();else if(k==='--megulit-pid')o.megulitPid=Number(v());else if(k==='--out')o.out=v();else if(k==='--advance')o.advance=v();else if(k==='--engine')o.engine=v();
  else if(k==='--until')o.until=v();else if(k==='--max')o.max=Number(v());else if(k==='--step-ms')o.stepMs=Number(v());
  else if(/^\d+$/.test(k)&&!o.pid)o.pid=Number(k);else throw Error('unknown argument: '+k);}
 if(!o.pid||!o.megulit||!o.out)throw Error('usage: choice <game pid> --megulit <MeguLit root> --out <dir> [--megulit-pid N] [--advance "x,y;enter"] [--until <regexp>] [--max N]');
 if(!(o.max>0)||!(o.stepMs>=0))throw Error('--max and --step-ms are numbers');
 return o;}
/* "x,y;enter;centre" (or the same as a list) -> [{x,y},'enter',{centre of the game window}]; '' -> Enter, then the centre */
function parseAdvance(text,win){const centre={x:Math.round((win?.w||800)/2),y:Math.round((win?.h||600)/2)};
 const parts=Array.isArray(text)?text.map(String):String(text||'').split(';');const list=parts.map(s=>s.trim()).filter(Boolean);if(!list.length)return ['enter',centre];
 return list.map(s=>{if(s==='enter')return 'enter';if(s==='centre'||s==='center')return {...centre};const m=/^(\d+),(\d+)$/.exec(s);if(!m)throw Error('--advance: "x,y" or "enter", not '+s);return {x:+m[1],y:+m[2]};});}
async function choiceMain(argv,{attachFn=attach,build=root=>require('./cold.cjs').buildColdDesk(root),fsx=require('node:fs'),log=console.log}={}){
 const path=require('node:path'),o=parseChoiceArgs(argv);fsx.mkdirSync(o.out,{recursive:true});
 const g=await attachFn(o.pid,{exe:build(o.megulit)});
 try{const r=await toChoice(g,{hookLog:path.join(o.megulit,'logs','hook-events.log'),advance:parseAdvance(o.advance||(o.engine&&require('./engines.cjs').capabilities(o.engine).live?.advance)||'',g.window),until:o.until?new RegExp(o.until):null,max:o.max,stepMs:o.stepMs,shotDir:o.out,readerPid:o.megulitPid,log});
  fsx.writeFileSync(path.join(o.out,'choice.json'),JSON.stringify(r,null,1));return r.signal?0:2;}finally{g.close();}}
module.exports={attach,VK,toChoice,choiceSignal,grown,CHOICE_SIGNAL,parseChoiceArgs,parseAdvance,choiceMain};
