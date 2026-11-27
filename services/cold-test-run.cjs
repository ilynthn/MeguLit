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
const InputFallback=require('../core/cold-test/input-fallback.cjs');
const {parseTrace}=require('../core/self-check.cjs');

let stopActive=null;
/* 2026-11-27 (ファタモルガーナの館, 千恋＊万花 cold runs: the KiriKiri hook reported every line drawn visible, hidden=0; no cold run since
   the first ever had 'replacement=True') core hides the game's original only for a bound reader window (core/hook-native.cjs:
   state.bound, else 'disable reason=reader-unbound'), and the cold run never said it was bound, so every cold run read without hiding.
   The run is bound to the game window like a played game, with the cover on */
const hookSetup=(res,started)=>[{hookAutoStart:true,bindEnabled:true,hookProfile:'auto'},{gameProcessId:res.pid,gameHwnd:String(res.window.hwnd),processName:res.exe.replace(/\.exe$/i,''),gameStarted:started,bound:true,coverEnabled:true}];
const helperPath=root=>{for(const p of [path.join(root||'','native','ColdDesk.exe'),path.join(__dirname,'..','native','ColdDesk.exe')])if(fs.existsSync(p))return p;return '';};

/* engine-draw UI runs (button / menu / choice) in game client px, newest first, for the driver's 「はじめから」 and choice clicks */
function menuItem(raw,win){let rec=null;try{rec=require('../core/text-paths.cjs').parseChars(String(raw||''));}catch{}if(!rec||!rec.role||rec.role==='line'||!rec.box||!win)return null;
 const sx=rec.sw>0?win.w/rec.sw:1,sy=rec.sh>0?win.h/rec.sh:1;const [x,y,w,h]=rec.box;return {role:rec.role,text:String(rec.text||'').slice(0,40),x:Math.round(x*sx),y:Math.round(y*sy),w:Math.round(w*sx),h:Math.round(h*sy)};}

/* 2026-11-26 (tools/megulit-adapter (cold stage), オルフレール: a KiriKiri title screen draws no engine-draw button, the run ended no-lines at the
   title) opts.ocrMenu: while no line has come and the engine reported no start item, a full-size client picture every OCR_EVERY ms
   goes through Windows OCR (services/cold-ocr.ps1, Japanese); a line that reads like 「はじめから / New Game」 (OCR is rough on
   decorated fonts: は し め 力 、 ら) becomes a 'button' item for the driver; 「つづきから / ロード」 lines never do */
const LOCATE_TRIES=3;
const OCR_CONFIRM=/^(決定|[OＯ][KＫ])$/i,OCR_EVERY=20000,OCR_START=/^[はハ][しじシジ]め|^[始最]初から|new.?game|ニューゲ|ゲーム開始|^start$|^\*?新[游遊][戏戲成双]|^开始游戏|^開始遊戲/i,OCR_NOT=/[続つ][づきけ]|ロード|load|continue|コンティ/i;
/* 2026-11-27 a Chinese title menu (千恋＊万花 Steam copy left in Simplified Chinese: 「新游戏」, Japanese OCR reads 新游成 / *新游双) */
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
 /* 2026-11-27 (MeguLit-Adapter, ファタモルガーナの館: 「館の扉を開く / 記を辿る / 調整を行う / 情報頁 / 別メニュー」, no start word, the run
    stalled on the title): a title menu of at least three short rows stacked in one column with no start word gets its topmost row,
    unless that row is continue / load / config / extra / quit */
 if(!out.length){const rows=ls.filter(l=>l.t.length>=2&&l.t.length<=12).sort((a,b)=>a.y-b.y),cx=l=>l.x+l.w/2;
  const col=rows.filter(l=>rows.filter(m=>Math.abs(cx(m)-cx(l))<Math.max(l.w,m.w)).length>=3);
  const top=col[0];if(top&&!OCR_NOT.test(top.t)&&!OCR_NOT_START.test(top.t))out.push(item(top,'はじめから',{guessed:true}));}
 return out;}
const OCR_NOT_START=/設定|環境|コンフィグ|config|option|オプション|おまけ|extra|鑑賞|ギャラリー|gallery|終了|exit|quit|システム|system/i;
/* OCR rows that are pieces of the hook's option text: most of a row's characters appear in it, at least 5 of them; topmost first */
const plainOf=t=>String(t||'').replace(/[\s、。・…‥〃″'"`,.！？!?「」『』（）()]/g,'');
/* 2026-11-27 (ハミダシクリエイティブ, Artemis2 split by text layer: each choice button is its own layer stream and came as auxiliary
   text, one button per line: 'aux Artemis2 role 0 chars=2 text=好き', '... chars=6 text=そうでもない'): auxiliary pieces that come within
   1.5 s of each other are one option text for choiceItems. -> {text, at} | null (the line is not auxiliary text) */
const AUX_JOIN_MS=1500;
function auxPiece(line,prev,prevAt,now){const m=/(?:^|\s)aux \S+ role \d+ chars=\d+ text=(.+?)\s*$/.exec(String(line||''));if(!m)return null;
 return {text:prev&&now-prevAt<AUX_JOIN_MS?prev+m[1]:m[1],at:now};}
/* 2026-11-27 (ハミダシクリエイティブ, Artemis: 「好き」「そうでもない」 came as one label 「好きそうでもない」): a short row (2-4 characters) counts
   when it is word for word in the option text; a longer one when most of its characters are */
function choiceItems(lines,aux){const a=plainOf(aux);if(a.length<4)return [];const out=[];
 for(const l of Array.isArray(lines)?lines:[]){const t=plainOf(l?.text);if(t.length<2||!(l.w>0&&l.h>0))continue;
  if(t.length<5){if(!a.includes(t))continue;}else{let hit=0;for(const c of t)if(a.includes(c))hit++;if(hit/t.length<0.75)continue;}
  if(out.some(o=>Math.abs(o.y-l.y)<Math.max(8,l.h/2)))continue;out.push({role:'choice',text:String(l.text).replace(/\s+/g,''),ocr:t.slice(0,40),x:l.x|0,y:l.y|0,w:l.w|0,h:l.h|0});}
 return out.sort((p,q)=>p.y-q.y);}
/* options the kernel wants located + OCR rows -> the 'hookChoiceBoxes' answer GalWindowBridge gives (client px, the window as the screen):
   each option takes the unused row sharing most of its characters (75 % of the row's, at least 4) */
function locateAnswer(lines,options,win){const rows=(Array.isArray(lines)?lines:[]).map(l=>({...l,p:plainOf(l?.text)})).filter(l=>l.p.length>=4&&l.w>0&&l.h>0);const used=new Set(),items=[],missed=[];
 for(const o of options){const op=plainOf(o);let best=null,score=0;for(const [i,r] of rows.entries()){if(used.has(i))continue;let hit=0;for(const c of r.p)if(op.includes(c))hit++;const sc=hit/r.p.length;if(sc>=0.75&&hit>=4&&sc>score){score=sc;best=i;}}
  if(best==null){missed.push(o);continue;}used.add(best);const r=rows[best];items.push({text:o,x0:r.x|0,y0:r.y|0,x1:(r.x+r.w)|0,y1:(r.y+r.h)|0});}
 if(!items.length)return null;return {type:'hookChoiceBoxes',status:missed.length?'partial':'ok',items,missed,sw:win?.w|0,sh:win?.h|0,rows:[]};}
function ocr(file,{spawn=nodeSpawn,timeoutMs=30000}={}){return new Promise(resolve=>{let out='',p;
  try{p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'cold-ocr.ps1'),file],{windowsHide:true,stdio:['ignore','pipe','ignore']});}catch{return resolve([]);}
  const t=setTimeout(()=>{try{p.kill();}catch{}},timeoutMs);t.unref?.();p.stdout.on('data',d=>out+=d);p.on('error',()=>{clearTimeout(t);resolve([]);});
  p.on('close',()=>{clearTimeout(t);let v=[];try{v=JSON.parse(out.trim()||'[]');}catch{}resolve(Array.isArray(v)?v:v?[v]:[]);});});}

/* 2026-11-26 (tools/megulit-adapter (cold stage) only; Monochrome Empire, YU-RIS, took no posted click on its title) the input ladder of
   core/cold-test/input-fallback.cjs over a running game: 'post' through ColdDesk, 'inputctl' and 'sendinput' through
   services/cold-input.ps1 (one PowerShell for the run). A watched click gets a 160 px picture before it and one waitMs after it;
   res.input records the level, the sends per level, every check and every step up.
   cfg: {inputCtlDir (the testbed folder with InputCtl32/64.exe + InputShim32/64.dll), foreground (visible run: sendinput allowed), ladder} */
const SHOT_W=160;
/* the name a name-entry line offers: 「「アナタの名字を入力してください」 + 朽木」 (rows split by a newline or the trace's escaped one) -> 朽木 (a short row after the prompt row) */
function nameOffered(text){const rows=String(text||'').split(/\\n|\n/).map(r=>r.trim()).filter(Boolean);const k=rows.findIndex(r=>/[入人][力カ]/.test(r));
 return k<0?'':rows.slice(k+1).find(r=>r.length<=10&&!/[「」『』。、？！?!]/.test(r))||'';}
function inputLadder(cfg,ctx){const {res,runDir,send,post}=ctx;const dir=String(cfg.inputCtlDir||'');
 const hasCtl=!!dir&&fs.existsSync(path.join(dir,'InputCtl32.exe'))&&fs.existsSync(path.join(dir,'InputShim32.dll'));
 const ladder=new InputFallback.Ladder(InputFallback.ladder({inputCtl:hasCtl,foreground:cfg.foreground===true,realInput:cfg.realInput===true,from:String(cfg.from||'')}),cfg.ladder||{});
 if(dir&&!hasCtl)ladder.record.errors.push('no InputCtl32.exe / InputShim32.dll in '+dir);
 let dialogAt=-1e9,helper=null,inited=false,shotN=0,shotA=null,queued=null,cur=ladder.level,closed=false;const held=new Set();
 const bits=()=>{try{return require('../core/locale-emulator.cjs').x86(ctx.exe)?32:64;}catch{return 32;}};
 const err=why=>{if(ladder.record.errors.length<20)ladder.record.errors.push(String(why).slice(0,160));};
 const write=line=>{try{helper.stdin.write(line+'\n');}catch(e){err('helper: '+e.message);}};
 const start=()=>{if(helper)return;
  try{helper=ctx.spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'cold-input.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe']});}
  catch(e){err('helper: '+e.message);helper={stdin:{write(){}},kill(){}};return;}
  helper.on?.('error',e=>err('helper: '+e.message));
  createInterface({input:helper.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}
   if(m.type==='dialog'){const d=ladder.record.dialogs||(ladder.record.dialogs=[]);if(d.length<10)d.push({t:ctx.t(),what:String(m.what||'').slice(0,200)});}
   else if(m.type==='init'){ladder.record.inject={ok:m.ok===true,why:String(m.why||''),bits:bits()};if(m.ok!==true)ladder.drop('inputctl',String(m.why||'init failed'));}
   else if(m.type==='error'||m.type==='done'&&m.ok===false)err(String(m.cmd||'')+': '+String(m.why||''));});
  write('hwnd '+String(res.window?.hwnd||0));};
 const via=(level,a)=>{ladder.sent(level);if(level==='post')return post(a);start();
  if(level==='inputctl'&&!inited){inited=true;write('init '+(res.pid|0)+' '+String(res.window?.hwnd||0)+' '+bits()+' '+dir);}
  const cmd=a.do==='keydown'?'down':a.do==='keyup'?'up':a.do;write((level==='inputctl'?'shim ':'fg ')+cmd+' '+(a.x!=null?(a.x|0)+' '+(a.y|0):(a.vk|0).toString(16)));};
 const act=(a,t)=>{const lv=ladder.level;
  /* a held key (Ctrl fast-forward) moves to the new level with it */
  if(lv!==cur){for(const vk of held){via(cur,{do:'keyup',vk});via(lv,{do:'keydown',vk});}cur=lv;}
  if(a.do==='keydown')held.add(a.vk);else if(a.do==='keyup')held.delete(a.vk);
  if(a.watch&&a.do==='click'&&ladder.start(a,t,{lines:res.lines,choices:res.choices})){shotA=null;
   /* ColdDesk takes its commands in order: a posted click comes after the picture; another level waits for the picture first */
   if(lv!=='post')queued={a,lv,at:t};send('shot '+SHOT_W+' '+path.join(runDir,'inp-'+(++shotN)+'-a.png'));if(lv==='post')via(lv,a);return;}
  via(lv,a);};
 const read=file=>{try{return InputFallback.pngGray(fs.readFileSync(file));}catch{return null;}};
 return {ladder,act,
  shot(m){const name=path.basename(String(m.path));
   if(/-a\.png$/i.test(name)){shotA=m.ok?read(m.path):null;if(queued){const q=queued;queued=null;via(q.lv,q.a);}}
   else if(/-b\.png$/i.test(name))ladder.screen(m.ok?InputFallback.screenChange(shotA,read(m.path)):null);},
  tick(t){if(queued&&t-queued.at>=1000){const q=queued;queued=null;via(q.lv,q.a);}
   /* lines stopped for 3 s: a standard dialog of the game asking for text (YU-RIS name entry, Monochrome Empire) is answered with
      the name the script offered, every 3 s while it stays */
   if(res.pid&&t-ctx.since()>=3000&&t-dialogAt>=3000){dialogAt=t;
    /* 2026-11-27 the helper sits on the visible desktop and does not see a hidden run's dialogs: there ColdDesk answers (its "dialog"; the
       name URI-encoded: ColdDesk reads its stdin in the ANSI code page, and the first live run typed 「麻?」 into the second dialog) */
    if(cfg.foreground===true){start();write('dialog '+(res.pid|0)+(ctx.name()?' '+ctx.name():''));}else send('dialog'+(ctx.name()?' '+encodeURIComponent(ctx.name()):''));}
   const r=ladder.tick(t,{lines:res.lines,choices:res.choices});
   /* the click took (a line or the picture changed): what the OCR read belongs to the screen before it (オルフレール: the title's
      start item, clicked again on the next screen, looked like a click the game ignored and raised the level twice) */
   if(r?.done&&r.changed)ctx.changed?.();
   if(r?.need==='shot')send('shot '+SHOT_W+' '+path.join(runDir,'inp-'+shotN+'-b.png'));
   else if(r?.resend)act(r.resend,t);
   else if(!r)ladder.stall(t,ctx.since(),{advancing:res.lines>0});},
  close(){if(closed)return;closed=true;if(!helper)return;write('quit');const h=helper;setTimeout(()=>{try{h.kill();}catch{}},2000).unref?.();}};}

/* opts: {root, exe, runDir, budgetMs, profile, shotWidth, ocrMenu}; deps for tests: {spawn, Hook, now, tick, layout} -> result */
/* 2026-11-26 Monochrome Empire r4: the tape kept the in-memory default of the last 60 dialogue lines, and after 60 lines at reading pace
   the run held Ctrl for 40 more, so every line on the tape was in the fast span, which Cardinal does not score: "scored 0 lines"
   although the run read 60 at reading pace. The worker keeps up to TAPE_KEEP lines, and the file gets the Ctrl span plus the
   TAPE_SLOW reading-pace lines before it (all of them when there was no Ctrl span) */
const TAPE_KEEP=400,TAPE_SLOW=60,TAPE_FAST=60;
function tapeOfRun(res,tape=require('../core/cardinal/tape.cjs'),slow=null){const fast=(Array.isArray(res?.phases)?res.phases:[]).find(p=>p?.name==='fast');
 const all=tape.snapshot(TAPE_KEEP);const from=fast?Date.parse(fast.at):NaN;if(!Number.isFinite(from))return all;
 const fastLines=all.rows.filter(r=>r.hb?.type==='hookSource'&&r.t>=from).length;const snap=fastLines+TAPE_SLOW>=all.lines?all:tape.snapshot(fastLines+TAPE_SLOW);
 /* 2026-11-27 (Monochrome Empire r6: 125 lines with Ctrl, none scored, a replay three times as long): a Ctrl span over TAPE_FAST lines
    keeps its first and last TAPE_FAST/2 (the first choice is at its end); the replay closes the time gap (Cardinal maxGap) */
 /* the reading-pace lines kept aside at the start of the fast span, when the kept tape no longer has them (rows before the fast span) */
 const withSlow=t=>{if(!slow?.rows?.length||t.rows.some(r=>r.hb?.type==='hookSource'&&r.t<from))return t;const first=t.rows[0]?.t??Infinity;const rows=[...slow.rows.filter(r=>r.t<Math.min(from,first)),...t.rows];return {...t,rows,lines:rows.filter(r=>r.hb?.type==='hookSource').length};};
 if(fastLines<=TAPE_FAST)return withSlow(snap);const src=[];snap.rows.forEach((r,i)=>{if(r.hb?.type==='hookSource'&&r.t>=from)src.push(i);});
 const cutFrom=src[TAPE_FAST/2],cutTo=src[src.length-TAPE_FAST/2];const rows=snap.rows.filter((r,i)=>i<cutFrom||i>=cutTo);
 return withSlow({...snap,rows,lines:rows.filter(r=>r.hb?.type==='hookSource').length,fastDropped:fastLines-TAPE_FAST});}
function runOne(opts,deps={}){const {root='',exe,runDir,budgetMs=360000,profile=null,shotWidth=960}=opts;
 const spawn=deps.spawn||nodeSpawn,now=deps.now||Date.now,TICK=deps.tick||250;let slowTape=null;
 fs.mkdirSync(runDir,{recursive:true});try{require('../core/cardinal/tape.cjs').keep(TAPE_KEEP);}catch{}
 /* an explicit helper (even '' = none) wins over the installed ColdDesk.exe: a test asking for no helper must never start the real one */
 const helper='helper' in deps?deps.helper:helperPath(root);
 return new Promise(resolve=>{
  const t0=now();const res={exe:path.basename(String(exe||'')),startedAt:new Date(t0).toISOString(),stopped:'',black:false,relaunched:false,exited:false,lines:0,choices:0,shots:[],end:'',window:null,pid:0,errors:[]};
  if(!helper){res.end='no-helper';return resolve(res);}
  let child;try{child=spawn(helper,['run',exe,'--seconds',String(Math.ceil(budgetMs/1000)+20),...(opts.ignoreInput===true?['--ignore-input']:[]),...(opts.visible===true?['--visible']:[]),...(opts.localeEmulator?.path&&opts.localeEmulator?.guid?['--locale-emulator',opts.localeEmulator.path,'--le-guid',opts.localeEmulator.guid]:[])],{windowsHide:true,stdio:['pipe','pipe','ignore']});}catch(e){res.end='spawn '+String(e?.message||e).slice(0,80);return resolve(res);}
  const send=line=>{try{child.stdin.write(line+'\n');}catch{}};
  /* 2026-11-26 opts.hideProbe (tools/megulit-adapter (cold stage)): what core/hook-control.cjs does for a played game (E578): while the selected stream
   carries text and cannot write back, the kernel is asked to probe the hide (hooks.probeHide(true)); the bridge then reports a hidden draw
   and lists the stream hide-only. A cold run has no HookControl, so the probe was never asked for and the confirmation came only by
   chance. Every confirmation is kept with its time (res.hideConfirmed) */
  const hideProbe=threads=>{const sel=threads.find(t=>t&&t.selected);if(!sel)return;
   /* the source no-draw count (HookBridge DrawSkipHit, MeguLitHook MeguLitDrawSkip.h): characters the game was told not to draw */
   if(Number(sel.drawSkipped)>(res.drawSkipped||0))res.drawSkipped=Math.floor(Number(sel.drawSkipped));
   if(sel.hideOnly===true){const c=res.hideConfirmed||(res.hideConfirmed=[]);if(!c.some(x=>x.id===sel.id)){c.push({id:String(sel.id),name:String(sel.name||''),at:new Date(now()).toISOString(),lines:res.lines});}return;}
   if(opts.hideProbe===true&&sel.sample&&sel.embeddable!==true&&hooks?.probing!==true){try{hooks.probeHide?.(true);{const hp=res.hideProbes||(res.hideProbes=[]);if(hp.length<20)hp.push({id:String(sel.id),at:new Date(now()).toISOString()});}}catch{}}};
  /* when the hook last saw game text (any stream): obs.quietMs for the driver's readQuietMs */
  let hookTextAt=0,threadSig='',srcChars=0,srcAt=0;
  /* 2026-11-26 (オルフレール krkr-nodraw r1: the kernel's request with the right two options came while the OCR of the request before it
     was running; that older picture's answer took the new request, found nothing and dropped it, so no hookChoiceBoxes): a request is
     answered only from a picture taken after it came (ocrFor), and one the picture does not show stays for LOCATE_TRIES pictures */
  let locatePending=null,ocrFor=null;
  let nameHint='',lastLineAt=0,choiceAux='',choiceAuxAt=0;const driver=new (deps.Driver||Driver)({...(opts.driver&&typeof opts.driver==='object'?opts.driver:{}),...(deps.driver||{})});const menu=[];let hooks=null,timer=null,done=false,started='',shotN=0;
  /* every input the driver asks for: ColdDesk's PostMessage, or (opts.inputFallback, tools/megulit-adapter (cold stage)) the level the input ladder is on */
  const post=a=>{if(a.do==='click')send('click '+(a.x|0)+' '+(a.y|0));else if(a.do==='move')send('move '+(a.x|0)+' '+(a.y|0));else if(a.do==='key')send('key '+a.vk);else if(a.do==='keydown')send('keydown '+a.vk);else if(a.do==='keyup')send('keyup '+a.vk);};
  const input=opts.inputFallback&&typeof opts.inputFallback==='object'?inputLadder(opts.inputFallback,{exe,runDir,res,send,post,spawn:deps.inputSpawn||nodeSpawn,since:()=>lastLineAt?lastLineAt-t0:0,t:()=>now()-t0,name:()=>nameHint,changed:()=>{for(let i=menu.length-1;i>=0;i--)if(menu[i].ocr)menu.splice(i,1);}}):null;
  const finish=why=>{if(done)return;done=true;stopActive=null;clearInterval(timer);res.end=res.end||why;/* whether core had the game's original hidden at the end (HookNative.enabled: it sent the bridge 'enable') */if(hooks&&typeof hooks.enabled==='boolean')res.hideOn=hooks.enabled;if(input){res.input=input.ladder.record;input.close();}try{hooks?.stop?.();}catch{}send('kill');
   const wait=setTimeout(()=>{try{child.kill();}catch{}},4000);wait.unref?.();child.once?.('exit',()=>clearTimeout(wait));
   res.endedAt=new Date(now()).toISOString();res.ms=now()-t0;/* 2026-11-26 Cardinal's tape of this run (core/cardinal/tape.cjs keeps it in memory only, and this worker exits): the run folder gets it, local, so tools/cardinal.cjs --tape can replay a game without engine-draw records (KiriKiri without KAG) */try{const snap=tapeOfRun(res,undefined,slowTape);if(snap.lines>0){
     /* the versioned tape file (core/cardinal/tape-file.cjs), with what the game's screen showed: the choice the runner's OCR read
        ({t, screen:{type:'choices', texts, until}}, core/cardinal/screen-run.cjs) */
     const screen=require('../core/cardinal/screen-run.cjs').screenRows(res);
     const rows=[...snap.rows,...screen].sort((a,b)=>a.t-b.t);
     fs.writeFileSync(path.join(runDir,'cardinal-tape.jsonl'),require('../core/cardinal/tape-file.cjs').serialize({...snap,rows}));res.tapeLines=snap.lines;res.tapeScreenRows=screen.length;}}catch{}try{fs.writeFileSync(path.join(runDir,'run.json'),JSON.stringify(res,null,1));}catch{}if(child.exitCode!==null&&child.exitCode!==undefined)resolve(res);else child.once('exit',()=>resolve(res));};
  stopActive=()=>{res.stopped='foreground';finish('foreground');};
  /* the hook: same component a played game gets, its trace into the run folder; every trace line is counted here too */
  const attach=()=>{if(hooks||!res.pid||!res.window||!started)return;try{
   const Hook=deps.Hook||require('../core/hook-native.cjs').HookNative;const layout={...(deps.layout||require('../core/layout.cjs')),logs:runDir};
   Hook.traceTap=line=>{if(/(?:^|\s)(?:source chars=|choice aux |aux )/.test(String(line)))hookTextAt=now();{const sc=/(?:^|\s)source chars=(\d+)/.exec(String(line));if(sc){srcChars=+sc[1];srcAt=now();}}{const m=/(?:^|\s)choice aux .* text="(.*)"\s*$/.exec(String(line));if(m&&m[1].length>=8){choiceAux=m[1];choiceAuxAt=now();}}/* 2026-11-27 (ハミダシクリエイティブ, Artemis2: the options joined into one short line the bridge drops as a label: 'label not shown Artemis2 "好きそうでもない"') a label is option text too; choiceItems only takes it with OCR rows that are in it */{const m=/(?:^|\s)label not shown \S+ "(.*)"\s*$/.exec(String(line));if(m&&m[1].length>=4){choiceAux=m[1];choiceAuxAt=now();}}{const a=auxPiece(line,choiceAux,choiceAuxAt,now());if(a){choiceAux=a.text;choiceAuxAt=a.at;}}{const q=/"([\s\S]*)"\s*$/.exec(String(line));if(q&&/[入人][力カ]/.test(q[1]))nameHint=nameOffered(q[1])||nameHint;}/* 2026-11-27 (ファタモルガーナの館: 'choice options filtered 2 -> 0' at the end of the prologue, then 'filtered 5 -> 2' made of typewriter pieces of the next line, were counted as choices: the driver pressed Down + Enter and clicked, the game opened its config screen, or the run ended 5 lines later before the real first choice) only options the kernel found on the screen (its locate answered by this runner's OCR: 'choice ocr … found=N', N >= 2) are a choice; candidates and filter counts are not */if(/(?:^|\s)choice ocr \S+ found=([2-9]|\d{2,})\b/.test(String(line)))res.choices++;const e=parseTrace(line);if(!e)return;if(e.kind==='line'){res.lines++;lastLineAt=now();
    /* a new line: what the OCR read is another screen now (Monochrome Empire: the title's start item, clicked again on its name entry) */
    for(let i=menu.length-1;i>=0;i--)if(menu[i].ocr)menu.splice(i,1);}};
   /* 2026-11-26 the hook's status events (bridge errors, attach state) next to its trace, so a run that never connects says why */
   const statusLog=path.join(runDir,'hook-status.log');let statusN=0;
   hooks=new Hook(layout,e=>{if(e&&Array.isArray(e.hookThreads)){hideProbe(e.hookThreads);const sig=e.hookThreads.map(x=>x&&x.sample||'').join('|');if(sig!==threadSig){threadSig=sig;hookTextAt=now();}}if(statusN>=400||!e||e.type==='line'||e.type==='source')return;statusN++;try{fs.appendFileSync(statusLog,new Date(now()).toISOString()+' '+JSON.stringify(e).slice(0,400)+'\n');}catch{}});if(profile)hooks.profile=profile;
   const drawLog=hooks.drawLog?.bind(hooks);if(drawLog)hooks.drawLog=raw=>{const m=menuItem(raw,res.window);if(m){menu.unshift(m);menu.length=Math.min(menu.length,12);}return drawLog(raw);};
   try{fs.appendFileSync(statusLog,new Date(now()).toISOString()+' attach '+JSON.stringify({pid:res.pid,launcherPid:res.launcherPid||0,hwnd:res.window.hwnd,started})+'\n');}catch{}
   /* 2026-11-26 opts.choiceLocate (tools/megulit-adapter (cold stage)): the kernel asks the host to locate the options it has (hooks.locateChoices; in the
      app GalWindowBridge answers with its OCR as 'hookChoiceBoxes'). A cold run has no reader, so this runner answers with its own OCR
      rows; the answer also goes on Cardinal's tape as the gwb record the app would have */
   /* 2026-11-26 (オルフレール, merged branch: the kernel asked for the two options, 1.2 s later again with a third piece 「らね」; the picture
      taken for the first request was dropped, so the answer came 8.6 s after the options were up and Cardinal counted them as never reaching
      the reader): a request that keeps an option of the pending one is the same choice screen, so a picture taken after the pending one
      answers it too; a request for other options still waits for a picture of its own */
   if(opts.choiceLocate===true)hooks.locateChoices=options=>{const o=(Array.isArray(options)?options:[]).map(String).slice(0,12),prev=locatePending,same=!!prev&&o.some(x=>prev.options.includes(x));
    locatePending={options:o,at:now(),tries:same?prev.tries:0,chain:same?prev.chain:{}};if(!same)ocrAt=0;};
   hooks.configure(...hookSetup(res,started));}
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
    case 'shot':/* 2026-11-27 a visible run whose game window lies under other windows (ColdDesk covered): the shots and real input miss it */if(m.covered===true)res.covered=(res.covered|0)+1;
     /* 2026-11-27 where each picture came from (ColdDesk: wgc first, then printwindow / screen) and why WGC was not used */if(m.ok){const src=String(m.source||'printwindow');(res.shotSources||(res.shotSources={}))[src]=(res.shotSources[src]|0)+1;if(m.wgc)res.wgcFallback=String(m.wgc).slice(0,120);}if(input&&m.path&&/^inp-/i.test(path.basename(m.path))){input.shot(m);break;}if(m.ok&&m.path&&/^ocr-/i.test(path.basename(m.path))){ocrBusy=true;(deps.ocr||ocr)(m.path).then(lines=>{ocrBusy=false;const items=ocrItems(lines);res.ocr=(res.ocr||0)+1;res.ocrText=(Array.isArray(lines)?lines:[]).map(l=>String(l?.text||'').replace(/\s+/g,'')).filter(Boolean).join(' ').slice(0,300);for(let i=menu.length-1;i>=0;i--)if(menu[i].ocr)menu.splice(i,1);
      if(items.length){res.ocrStart=items[0].ocr;for(const it of items)menu.unshift(it);menu.length=Math.min(menu.length,12);}
      /* options the hook saw (its last 'choice aux' text, since the lines stopped) and OCR finds as separate rows: a choice; the kernel
         confirms choices with the reader's OCR, which a cold run has not (オルフレール: "choice locate unavailable", the run stalled on
         its first choice with Ctrl held) */
      const req0=ocrFor;ocrFor=null;const req=req0&&locatePending&&(req0===locatePending||req0.chain===locatePending.chain)?locatePending:null;if(req){const ans=locateAnswer(lines,req.options,res.window);if(ans||++req.tries>=LOCATE_TRIES){locatePending=null;if(!ans){const mi=res.choiceLocateMisses||(res.choiceLocateMisses=[]);if(mi.length<10)mi.push({at:new Date(req.at).toISOString(),options:req.options.slice(0,4)});}}if(ans){res.choiceLocates=(res.choiceLocates||0)+1;try{require('../core/cardinal/tape.cjs').record('gwb',ans);}catch{}try{hooks?.choiceBoxes?.(ans);}catch{}}}
      {const opts=choiceItems(lines,choiceAuxAt>=lastLineAt-1000?choiceAux:'');if(opts.length>=2){for(let i=menu.length-1;i>=0;i--)if(menu[i].role==='choice')menu.splice(i,1);for(const it of opts.slice().reverse())menu.unshift(it);res.choices++;res.ocrChoices=opts.map(o=>o.text);}}});break;}
     if(m.ok&&m.path){res.shots.push(path.basename(m.path));if(m.black===true)res.black=true;else res.black=false;}break;
    case 'dialog':if(input){const d=input.ladder.record.dialogs||(input.ladder.record.dialogs=[]);if(d.length<10)d.push({t:now()-t0,what:String(m.what||'').slice(0,200),via:'colddesk'});}break;
    case 'input':res.stopped='input';finish('input');break;
    case 'power':if(m.ac===false){res.stopped='battery';finish('battery');}break;
    /* 2026-11-27 (千恋＊万花, visible run: the game opens full screen at 1920x1080; once it was the top window, Windows reported a full-screen
       app and the run ended after 5 s with 0 lines) a full-screen app on the user's desktop means the user is playing, unless the run
       is on that desktop itself (opts.visible: the owner is away), where the full-screen window is the game */
    case 'fullscreen':if(m.on===true){if(opts.visible===true){res.fullscreenGame=(res.fullscreenGame|0)+1;break;}res.stopped='fullscreen';finish('fullscreen');}break;
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
  /* core decides the hide (its render route) only in a configure that finds its bridge started; in the app GalWindowBridge configures again
     and again, here the first configure only starts the bridge: once it runs, the run's setup is applied a second time */
  let routed=false;
  timer=setInterval(()=>{if(done)return;try{if(hooks&&!routed&&hooks.process&&res.window){routed=true;hooks.configure(...hookSetup(res,started));}}catch{}try{hooks?.tick?.();}catch{}
   if(opts.ocrMenu===true&&!ocrBusy&&res.window&&(locatePending&&now()-ocrAt>=2000||now()-t0>=OCR_EVERY&&now()-ocrAt>=OCR_EVERY&&(!res.lines?!menu.some(x=>x.role!=='choice'):now()-lastLineAt>=OCR_EVERY))){ocrAt=now();ocrBusy=true;ocrFor=locatePending;
    send('shot '+Math.max(320,res.window.w|0)+' '+path.join(runDir,'ocr-'+(++ocrN)+'.png'));setTimeout(()=>{ocrBusy=false;},OCR_EVERY).unref?.();}
   const t=now()-t0;const acts=driver.next({t,deadline:budgetMs,window:res.window,lines:res.lines,choices:res.choices,menu,black:res.black,ocr:res.ocr|0,screenText:res.ocrText||'',quietMs:hookTextAt?now()-hookTextAt:1e9,lineChars:srcChars,lineAgeMs:srcAt?now()-srcAt:1e9});
   if(input)input.tick(t);
   for(const a of acts){if(a.do==='end'){finish(a.why);return;}
    if(a.do==='phase'){(res.phases||(res.phases=[])).push({name:String(a.name),at:new Date(now()).toISOString(),lines:res.lines});
     /* 2026-11-27 (MeguLit-Adapter, ISLAND: 474 lines with Ctrl pushed every reading-pace line out of the 400-line tape, Cardinal
        replayed 0 lines): the reading-pace lines are kept aside the moment the fast span starts */
     if(String(a.name)==='fast'&&!slowTape)try{slowTape=require('../core/cardinal/tape.cjs').snapshot(TAPE_SLOW);}catch{}continue;}
    if(/^(click|move|key|keydown|keyup)$/.test(a.do)){if(input)input.act(a,t);else post(a);}
    else if(a.do==='shot'){const file=path.join(runDir,'shot-'+(++shotN)+'-'+String(a.tag).replace(/[^a-z0-9-]/gi,'')+'.jpg');send('shot '+shotWidth+' '+file);}}},TICK);
  timer.unref?.();});}

module.exports={auxPiece,hookSetup,tapeOfRun,TAPE_SLOW,TAPE_FAST,nameOffered,runOne,helperPath,menuItem,ocrItems,choiceItems,locateAnswer,ocr,stopActive:()=>stopActive?.()};
