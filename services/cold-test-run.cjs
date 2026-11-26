// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 闲时冷测试) one cold-test run of one game: start it on the hidden desktop (native/ColdDesk.exe), attach the
   hook exactly as a played game gets it (core/hook-native.cjs, its logs go to the run folder), drive it with the state machine
   of core/cold-test/drive.cjs, take the pictures it asks for, and end it. The recording is the run folder:
     hook-events.log    HookNative.trace lines (what core/self-check.cjs parses)
     engine-draw.log    every ToMe_CHARS record (roles, boxes)
     shot-<tag>.jpg     client-area pictures (local; services/cold-test.cjs decides what, if anything, leaves the PC)
   Runs in its own process (services/cold-test-worker.cjs) so the hook state of the game the user may play later is never touched.
   The user's input ends the run inside ColdDesk at once (it watches GetLastInputInfo); here that arrives as {type:'input'}. */
const fs=require('node:fs'),path=require('node:path'),{spawn:nodeSpawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const {Driver}=require('../core/cold-test/drive.cjs');
const {parseTrace}=require('../core/self-check.cjs');

let stopActive=null;
const helperPath=root=>{for(const p of [path.join(root||'','native','ColdDesk.exe'),path.join(__dirname,'..','native','ColdDesk.exe')])if(fs.existsSync(p))return p;return '';};

/* engine-draw UI runs (button / menu / choice) in game client px, newest first, for the driver's 「はじめから」 and choice clicks */
function menuItem(raw,win){let rec=null;try{rec=require('../core/text-paths.cjs').parseChars(String(raw||''));}catch{}if(!rec||!rec.role||rec.role==='line'||!rec.box||!win)return null;
 const sx=rec.sw>0?win.w/rec.sw:1,sy=rec.sh>0?win.h/rec.sh:1;const [x,y,w,h]=rec.box;return {role:rec.role,text:String(rec.text||'').slice(0,40),x:Math.round(x*sx),y:Math.round(y*sy),w:Math.round(w*sx),h:Math.round(h*sy)};}

/* 2026-11-26 (tools/adapt-auto.cjs, オルフレール: a KiriKiri title screen draws no engine-draw button, the run ended no-lines at the
   title) opts.ocrMenu: while no line has come and the engine reported no start item, a full-size client picture every OCR_EVERY ms
   goes through Windows OCR (services/cold-ocr.ps1, Japanese); a line that reads like 「はじめから / New Game」 (OCR is rough on
   decorated fonts: は し め 力 、 ら) becomes a 'button' item for the driver; 「つづきから / ロード」 lines never do */
const OCR_CONFIRM=/^(決定|[OＯ][KＫ])$/i,OCR_EVERY=20000,OCR_START=/^[はハ][しじシジ]め|^[始最]初から|new.?game|ニューゲ|ゲーム開始|^start$/i,OCR_NOT=/[続つ][づきけ]|ロード|load|continue|コンティ/i;
/* a name entry (オルフレール: 「主人公の名前を入力してください」, buttons 決定 / デフォルト / タイトルへ) keeps the default name: its 「決定」
   is read, or placed one button step left of 「デフォルト」 on the same row (step = distance to 「タイトルへ」, else twice the label
   width: decorated 「決 定」 is the one label OCR never reads). 「はい」 only under 「よろしいですか」 */
const OCR_NAME=/名前?[をの]?.{0,2}[入人][力カ]|名前/,OCR_DEFAULT=/^[デテ][フ][ォオ].{0,3}[トド]$|^default$/i,OCR_TITLE=/^タイト.{0,2}[ヘへペ]$/,OCR_SURE=/よろし|宜し/,OCR_YES=/^はい$/;
function ocrItems(lines){const out=[],ls=(Array.isArray(lines)?lines:[]).map(l=>({...l,t:String(l?.text||'').replace(/[\s、。・〃″'"`,.]/g,'')})).filter(l=>l.t&&l.w>0&&l.h>0);
 const item=(l,text,extra={})=>({role:'button',text,ocr:l.t.slice(0,40),x:l.x|0,y:l.y|0,w:l.w|0,h:l.h|0,...extra});
 for(const l of ls){if(OCR_NOT.test(l.t))continue;if(OCR_START.test(l.t))out.push(item(l,'はじめから'));else if(OCR_CONFIRM.test(l.t))out.push(item(l,'決定'));}
 if(ls.some(l=>OCR_SURE.test(l.t)))for(const l of ls)if(OCR_YES.test(l.t))out.push(item(l,'決定'));
 const def=ls.find(l=>OCR_DEFAULT.test(l.t));
 if(def&&!out.some(i=>i.text==='決定')&&ls.some(l=>OCR_NAME.test(l.t))){const cy=def.y+def.h/2,cx=def.x+def.w/2;
  const ttl=ls.find(l=>OCR_TITLE.test(l.t)&&Math.abs(l.y+l.h/2-cy)<def.h*1.5&&l.x>def.x);const step=ttl?ttl.x+ttl.w/2-cx:def.w*2;
  const x=Math.round(cx-step);if(x>0)out.push({role:'button',text:'決定',estimated:true,ocr:def.t,x:x-Math.round(def.w/2),y:def.y|0,w:def.w|0,h:def.h|0});}
 return out;}
/* OCR rows that are pieces of the hook's option text: most of a row's characters appear in it, at least 5 of them; topmost first */
const plainOf=t=>String(t||'').replace(/[\s、。・…‥〃″'"`,.！？!?「」『』（）()]/g,'');
function choiceItems(lines,aux){const a=plainOf(aux);if(a.length<8)return [];const out=[];
 for(const l of Array.isArray(lines)?lines:[]){const t=plainOf(l?.text);if(t.length<5||!(l.w>0&&l.h>0))continue;let hit=0;for(const c of t)if(a.includes(c))hit++;if(hit/t.length<0.75)continue;
  if(out.some(o=>Math.abs(o.y-l.y)<Math.max(8,l.h/2)))continue;out.push({role:'choice',text:String(l.text).replace(/\s+/g,''),ocr:t.slice(0,40),x:l.x|0,y:l.y|0,w:l.w|0,h:l.h|0});}
 return out.sort((p,q)=>p.y-q.y);}
function ocr(file,{spawn=nodeSpawn,timeoutMs=30000}={}){return new Promise(resolve=>{let out='',p;
  try{p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'cold-ocr.ps1'),file],{windowsHide:true,stdio:['ignore','pipe','ignore']});}catch{return resolve([]);}
  const t=setTimeout(()=>{try{p.kill();}catch{}},timeoutMs);t.unref?.();p.stdout.on('data',d=>out+=d);p.on('error',()=>{clearTimeout(t);resolve([]);});
  p.on('close',()=>{clearTimeout(t);let v=[];try{v=JSON.parse(out.trim()||'[]');}catch{}resolve(Array.isArray(v)?v:v?[v]:[]);});});}

/* opts: {root, exe, runDir, budgetMs, profile, shotWidth, ocrMenu}; deps for tests: {spawn, Hook, now, tick, layout} -> result */
function runOne(opts,deps={}){const {root='',exe,runDir,budgetMs=360000,profile=null,shotWidth=960}=opts;
 const spawn=deps.spawn||nodeSpawn,now=deps.now||Date.now,TICK=deps.tick||250;
 fs.mkdirSync(runDir,{recursive:true});
 /* an explicit helper (even '' = none) wins over the installed ColdDesk.exe: a test asking for no helper must never start the real one */
 const helper='helper' in deps?deps.helper:helperPath(root);
 return new Promise(resolve=>{
  const t0=now();const res={exe:path.basename(String(exe||'')),startedAt:new Date(t0).toISOString(),stopped:'',black:false,relaunched:false,exited:false,lines:0,choices:0,shots:[],end:'',window:null,pid:0,errors:[]};
  if(!helper){res.end='no-helper';return resolve(res);}
  let child;try{child=spawn(helper,['run',exe,'--seconds',String(Math.ceil(budgetMs/1000)+20),...(opts.ignoreInput===true?['--ignore-input']:[]),...(opts.visible===true?['--visible']:[]),...(opts.localeEmulator?.path&&opts.localeEmulator?.guid?['--locale-emulator',opts.localeEmulator.path,'--le-guid',opts.localeEmulator.guid]:[])],{windowsHide:true,stdio:['pipe','pipe','ignore']});}catch(e){res.end='spawn '+String(e?.message||e).slice(0,80);return resolve(res);}
  const send=line=>{try{child.stdin.write(line+'\n');}catch{}};
  let lastLineAt=0,choiceAux='',choiceAuxAt=0;const driver=new Driver({...(opts.driver&&typeof opts.driver==='object'?opts.driver:{}),...(deps.driver||{})});const menu=[];let hooks=null,timer=null,done=false,started='',shotN=0;
  const finish=why=>{if(done)return;done=true;stopActive=null;clearInterval(timer);res.end=res.end||why;try{hooks?.stop?.();}catch{}send('kill');
   const wait=setTimeout(()=>{try{child.kill();}catch{}},4000);wait.unref?.();child.once?.('exit',()=>clearTimeout(wait));
   res.endedAt=new Date(now()).toISOString();res.ms=now()-t0;/* 2026-11-26 Cardinal's tape of this run (core/cardinal/tape.cjs keeps it in memory only, and this worker exits): the run folder gets it, local, so tools/cardinal.cjs --tape can replay a game without engine-draw records (KiriKiri without KAG) */try{const snap=require('../core/cardinal/tape.cjs').snapshot();if(snap.lines>0){fs.writeFileSync(path.join(runDir,'cardinal-tape.jsonl'),snap.rows.map(r=>JSON.stringify(r)).join('\n')+'\n');res.tapeLines=snap.lines;}}catch{}try{fs.writeFileSync(path.join(runDir,'run.json'),JSON.stringify(res,null,1));}catch{}if(child.exitCode!==null&&child.exitCode!==undefined)resolve(res);else child.once('exit',()=>resolve(res));};
  stopActive=()=>{res.stopped='foreground';finish('foreground');};
  /* the hook: same component a played game gets, its trace into the run folder; every trace line is counted here too */
  const attach=()=>{if(hooks||!res.pid||!res.window||!started)return;try{
   const Hook=deps.Hook||require('../core/hook-native.cjs').HookNative;const layout={...(deps.layout||require('../core/layout.cjs')),logs:runDir};
   Hook.traceTap=line=>{{const m=/(?:^|\s)choice aux .* text="(.*)"\s*$/.exec(String(line));if(m&&m[1].length>=8){choiceAux=m[1];choiceAuxAt=now();}}const e=parseTrace(line);if(!e)return;if(e.kind==='line'){res.lines++;lastLineAt=now();}else if(e.kind==='choice')res.choices++;};
   /* 2026-11-26 the hook's status events (bridge errors, attach state) next to its trace, so a run that never connects says why */
   const statusLog=path.join(runDir,'hook-status.log');let statusN=0;
   hooks=new Hook(layout,e=>{if(statusN>=400||!e||e.type==='line'||e.type==='source')return;statusN++;try{fs.appendFileSync(statusLog,new Date(now()).toISOString()+' '+JSON.stringify(e).slice(0,400)+'\n');}catch{}});if(profile)hooks.profile=profile;
   const drawLog=hooks.drawLog?.bind(hooks);if(drawLog)hooks.drawLog=raw=>{const m=menuItem(raw,res.window);if(m){menu.unshift(m);menu.length=Math.min(menu.length,12);}return drawLog(raw);};
   try{fs.appendFileSync(statusLog,new Date(now()).toISOString()+' attach '+JSON.stringify({pid:res.pid,launcherPid:res.launcherPid||0,hwnd:res.window.hwnd,started})+'\n');}catch{}
   hooks.configure({hookAutoStart:true,bindEnabled:true,hookProfile:'auto'},{gameProcessId:res.pid,gameHwnd:String(res.window.hwnd),processName:res.exe.replace(/\.exe$/i,''),gameStarted:started});}
   /* 2026-11-26 processName without .exe, as GalWindowBridge sends it: native/HookTarget.cs Validate compares it with the image name
      without extension, so 'orfre.exe' made every cold run end in 「Bound game process changed」 and six reconnects */
   catch(e){res.errors.push('hook '+String(e?.message||e).slice(0,100));}};
  createInterface({input:child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}
   switch(m.type){
    case 'started':res.pid=m.pid|0;started=String(m.started||'');break;
    case 'window':res.window={hwnd:String(m.hwnd||''),w:m.w|0,h:m.h|0};
     /* started through Locale Emulator: the window's owner is the game, the started pid was LEProc (the hook goes to the game) */
     if(!hooks&&m.pid>0&&(m.pid|0)!==res.pid){res.launcherPid=res.pid;res.pid=m.pid|0;if(m.started)started=String(m.started);}
     attach();break;
    case 'shot':if(m.ok&&m.path&&/^ocr-/i.test(path.basename(m.path))){ocrBusy=true;(deps.ocr||ocr)(m.path).then(lines=>{ocrBusy=false;const items=ocrItems(lines);res.ocr=(res.ocr||0)+1;res.ocrText=(Array.isArray(lines)?lines:[]).map(l=>String(l?.text||'').replace(/\s+/g,'')).filter(Boolean).join(' ').slice(0,300);for(let i=menu.length-1;i>=0;i--)if(menu[i].ocr)menu.splice(i,1);
      if(items.length){res.ocrStart=items[0].ocr;for(const it of items)menu.unshift(it);menu.length=Math.min(menu.length,12);}
      /* options the hook saw (its last 'choice aux' text, since the lines stopped) and OCR finds as separate rows: a choice; the kernel
         confirms choices with the reader's OCR, which a cold run has not (オルフレール: "choice locate unavailable", the run stalled on
         its first choice with Ctrl held) */
      {const opts=choiceItems(lines,choiceAuxAt>=lastLineAt-1000?choiceAux:'');if(opts.length>=2){for(let i=menu.length-1;i>=0;i--)if(menu[i].role==='choice')menu.splice(i,1);for(const it of opts.slice().reverse())menu.unshift(it);res.choices++;res.ocrChoices=opts.map(o=>o.text);}}});break;}
     if(m.ok&&m.path){res.shots.push(path.basename(m.path));if(m.black===true)res.black=true;else res.black=false;}break;
    case 'input':res.stopped='input';finish('input');break;
    case 'power':if(m.ac===false){res.stopped='battery';finish('battery');}break;
    case 'fullscreen':if(m.on===true){res.stopped='fullscreen';finish('fullscreen');}break;
    case 'relaunched':res.relaunched=true;finish('relaunched');break;
    case 'exited':res.exited=true;finish('exited');break;
    case 'timeout':finish('timeout');break;
    case 'ended':finish(String(m.why||'ended'));break;
    case 'error':res.errors.push(String(m.what||'')+': '+String(m.why||''));break;}});
  child.on?.('error',e=>{res.errors.push(String(e?.message||e));finish('helper-error');});
  child.on?.('exit',()=>finish('helper-exit'));
  /* A failed spawn emits error then close, without exit. Release the foreground barrier on close too. */
  child.on?.('close',()=>{finish('helper-close');resolve(res);});
  let ocrBusy=false,ocrAt=0,ocrN=0;
  timer=setInterval(()=>{if(done)return;try{hooks?.tick?.();}catch{}
   if(opts.ocrMenu===true&&!ocrBusy&&res.window&&now()-t0>=OCR_EVERY&&now()-ocrAt>=OCR_EVERY&&(!res.lines?!menu.some(x=>x.role!=='choice'):now()-lastLineAt>=OCR_EVERY)){ocrAt=now();ocrBusy=true;
    send('shot '+Math.max(320,res.window.w|0)+' '+path.join(runDir,'ocr-'+(++ocrN)+'.png'));setTimeout(()=>{ocrBusy=false;},OCR_EVERY).unref?.();}
   const t=now()-t0;const acts=driver.next({t,deadline:budgetMs,window:res.window,lines:res.lines,choices:res.choices,menu,black:res.black});
   for(const a of acts){if(a.do==='end'){finish(a.why);return;}
    if(a.do==='phase'){(res.phases||(res.phases=[])).push({name:String(a.name),at:new Date(now()).toISOString(),lines:res.lines});continue;}
    if(a.do==='click')send('click '+(a.x|0)+' '+(a.y|0));else if(a.do==='key')send('key '+a.vk);else if(a.do==='keydown')send('keydown '+a.vk);else if(a.do==='keyup')send('keyup '+a.vk);
    else if(a.do==='shot'){const file=path.join(runDir,'shot-'+(++shotN)+'-'+String(a.tag).replace(/[^a-z0-9-]/gi,'')+'.jpg');send('shot '+shotWidth+' '+file);}}},TICK);
  timer.unref?.();});}

module.exports={runOne,helperPath,menuItem,ocrItems,choiceItems,ocr,stopActive:()=>stopActive?.()};
