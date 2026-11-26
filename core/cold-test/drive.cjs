// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 跳过片头 click/Enter/Esc/Ctrl，轮询不死等；点 New Game 不读档；推进几十句，Ctrl 快进加点击) what the cold test
   does to the game on the hidden desktop, as a pure state machine: the runner (services/cold-test-run.cjs) calls next(obs)
   every TICK ms with what it sees and sends the returned actions through native/ColdDesk.exe (PostMessage only: the hidden
   desktop has no real keyboard, and the user's mouse is never touched).

   obs: {t ms since start, window:{w,h}|null, lines (hook lines so far), choices (choice events so far),
         menu:[{text, role, x, y, w, h}] (engine-draw button / menu / choice runs on screen now), black (last picture was black)}
   actions: {do:'click', x, y, watch?} (client px; watch 'start' | 'confirm': the input ladder of core/cold-test/input-fallback.cjs checks it took) | {do:'key', vk} | {do:'keydown'|'keyup', vk} | {do:'shot', tag} | {do:'end', why}

   phases  boot     wait for the game's window (polled)
           intro    logos / opening / title: click, Enter, Esc (first seconds only), Ctrl in turn; a 「はじめから / New Game」 item
                    the engine drew is clicked; 「つづきから / Load」 never
           advance  lines are coming: Ctrl held (fast forward), click + Enter in turn, a choice takes its first option
           end      enough lines, the time is up, nothing happens any more, or the picture stays black */
const VK={enter:0x0d,esc:0x1b,ctrl:0x11,space:0x20,down:0x28};
const START=/はじめから|始めから|最初から|ニューゲーム|new\s*game|^start$|^スタート$|ゲーム開始|^開始$|^play$|^begin$/i;
/* a confirm button (a name entry's 「決定」) the runner found: clicked when lines stop for confirmAfter */
const CONFIRM=/^(決定|OK|ＯＫ)$/i;
const NOT_START=/つづき|続き|ロード|load|continue|コンティニュー|config|設定|コンフィグ|extra|おまけ|exit|終了/i;
const DEFAULTS=Object.freeze({tick:250,bootMs:90000,introMs:120000,introEvery:900,escUntil:15000,advanceEvery:450,ctrlEvery:2000,targetLines:60,stallMs:45000,blackAfter:40000,shotLines:[3,15,30],introShotAt:25000,confirmAfter:8000,skip:true,afterChoice:0,slowLines:0,choiceSequence:false,hoverStart:false,readEvery:0,readQuietMs:0,readMinMs:1000,choiceWait:1500,choiceQuietMs:0,choiceHover:300,choiceRetry:3000,holdBlind:false});

class Driver{
 constructor(opt={}){this.o={...DEFAULTS,...opt};this.phase='boot';this.step=0;this.lastAct=-1e9;this.lastCtrl=-1e9;this.lastLines=0;this.lastLineAt=0;this.lastChoices=0;this.choiceAt=0;this.shotsTaken=new Set();this.clickedStart=-1e9;this.clickedConfirm=-1e9;this.introShot=false;this.choiceTry=0;this.choiceNext=0;this.choiceHoverClick=false;}
 next(obs){const o=this.o,t=obs.t|0,out=[];const end=why=>{if(this.phase==='advance'&&(this.o.slowLines>0?this.fast:this.o.skip!==false))out.push({do:'keyup',vk:VK.ctrl});this.phase='end';out.push({do:'end',why});return out;};
  if(this.phase==='end')return out;
  /* hoverStart (tools/adapt-auto.cjs): a start item is hovered first and clicked choiceHover later (Monochrome Empire's title buttons took no bare click) */
  if(this.pendingClick&&t>=this.pendingClick.at){const c=this.pendingClick;this.pendingClick=null;out.push({do:'click',x:c.x,y:c.y,watch:'start'});return out;}
  if(obs.deadline&&t>=obs.deadline)return end(this.phase==='advance'?'time':'time-'+this.phase);
  if(this.phase==='boot'){if(obs.window&&obs.window.w>0&&obs.window.h>0){this.phase='intro';this.introAt=t;this.lastAct=t;}else if(t>=o.bootMs)return end('no-window');else return out;}
  const W=obs.window||{w:0,h:0};const center={do:'click',x:Math.round(W.w/2),y:Math.round(W.h*.6)};
  if((obs.lines|0)>this.lastLines){this.lastLines=obs.lines|0;this.lastLineAt=t;}
  if(this.phase==='intro'){
   if((obs.lines|0)>0){this.phase='advance';this.lastLineAt=t;if(o.skip!==false&&!(o.slowLines>0)){out.push({do:'keydown',vk:VK.ctrl});this.lastCtrl=t;}}
   else{const since=t-this.introAt;
    if(!this.introShot&&since>=o.introShotAt){this.introShot=true;out.push({do:'shot',tag:'intro'});}
    if(obs.black&&since>=o.blackAfter)return end('black');
    if(since>=o.introMs)return end('no-lines');
    const item=(obs.menu||[]).find(m=>m&&START.test(String(m.text||'').trim())&&!NOT_START.test(String(m.text||''))&&m.w>0&&m.h>0);
    if(item&&t-this.clickedStart>2500){this.clickedStart=t;this.lastAct=t;{const at={x:Math.round(item.x+item.w/2),y:Math.round(item.y+item.h/2)};if(o.hoverStart){out.push({do:'move',...at});this.pendingClick={...at,at:t+o.choiceHover};}else out.push({do:'click',...at,watch:'start'});}return out;}
    if(t-this.lastAct>=o.introEvery){this.lastAct=t;const k=this.step++%4;
     if(k===0)out.push(center);else if(k===1)out.push({do:'key',vk:VK.enter});else if(k===2)out.push(since<o.escUntil?{do:'key',vk:VK.esc}:{do:'key',vk:VK.space});else out.push({do:'key',vk:VK.ctrl});}
    return out;}}
  /* advance */
  if(this.lastLines>=o.targetLines)return end('enough');
  /* afterChoice (tools/adapt-auto.cjs: run until the first choice): end this many lines after the first choice was answered */
  if(o.afterChoice>0&&this.choiceLine!=null&&this.lastLines>=this.choiceLine+o.afterChoice)return end('choice');
  if(t-this.lastLineAt>=o.stallMs)return end('stalled');
  for(const n of o.shotLines)if(this.lastLines>=n&&!this.shotsTaken.has(n)){this.shotsTaken.add(n);out.push({do:'shot',tag:'line-'+n});}
  if((obs.choices|0)>this.lastChoices){this.lastChoices=obs.choices|0;this.choiceAt=t;if(this.choiceLine==null){this.choiceLine=this.lastLines;if(this.fast){this.fast=false;out.push({do:'keyup',vk:VK.ctrl},{do:'phase',name:'choice'});}}}
  /* slowLines (tools/adapt-auto.cjs): reading pace for the first slowLines lines (the samples a diff is made from), then fast-forward
     (held Ctrl) until the first choice, then reading pace again for the choice and afterChoice lines */
  if(o.slowLines>0&&!this.fast&&this.choiceLine==null&&this.lastLines>=o.slowLines){this.fast=true;this.lastCtrl=t;out.push({do:'phase',name:'fast'},{do:'keydown',vk:VK.ctrl});}
  /* 2026-11-26 second pass (both オルフレール runs: the hover + click 8 s after Ctrl was released worked, the one at 1.5 s and the keyboard did
     not): the first try waits until the game drew nothing for choiceQuietMs (fast-forward ended); hover + click, hover + click, then the
     keyboard last.
     answering a choice (2026-11-26, オルフレール: one click right after Ctrl was released did nothing): after choiceWait (the game leaves
     fast-forward), hover on the first option and click it choiceHover later; no line within choiceRetry: Down + Enter; then hover +
     click once more; each try is a phase ('choice-try-N'), the one that worked 'choice-done' */
  if(!o.choiceSequence&&this.choiceAt&&t-this.choiceAt>=600){this.choiceAt=0;this.lastAct=t;const opt=(obs.menu||[]).find(m=>m&&m.role==='choice'&&m.w>0&&m.h>0);out.push(opt?{do:'click',x:Math.round(opt.x+opt.w/2),y:Math.round(opt.y+opt.h/2)}:{do:'key',vk:VK.enter});return out;}
  if(o.choiceSequence&&this.choiceAt){const opt=(obs.menu||[]).find(m=>m&&m.role==='choice'&&m.w>0&&m.h>0),at=opt?{x:Math.round(opt.x+opt.w/2),y:Math.round(opt.y+opt.h/2)}:null;
   if(this.lastLines>this.choiceLine){if(this.choiceTry>0)out.push({do:'phase',name:'choice-done',try:this.choiceTry});this.choiceAt=0;this.choiceTry=0;this.choiceHoverClick=false;}
   else if(this.choiceHoverClick){if(t>=this.choiceNext){this.choiceHoverClick=false;this.lastAct=t;if(at)out.push({do:'click',...at});else out.push({do:'key',vk:VK.enter});this.choiceNext=t+o.choiceRetry;}return out;}
   else if(t>=this.choiceNext&&t-this.choiceAt>=o.choiceWait&&(this.choiceTry>0||(obs.quietMs??1e9)>=o.choiceQuietMs)){this.lastAct=t;const k=this.choiceTry++;
    /* keyboard first (three オルフレール runs: Down + Enter was the try that worked), hover + click twice as the fallback */
    if(k===0){out.push({do:'phase',name:'choice-try-1'},{do:'key',vk:VK.down},{do:'key',vk:VK.enter});this.choiceNext=t+o.choiceRetry;return out;}
    if(k===1||k===2){out.push({do:'phase',name:'choice-try-'+(k+1)});if(at)out.push({do:'move',...at});this.choiceNext=t+o.choiceHover;this.choiceHoverClick=true;return out;}
    this.choiceAt=0;}
   if(this.choiceAt)return out;}
  /* 2026-11-26 (Monochrome Empire, YU-RIS: a 150-character system text at start counted as the first line, so the run left the intro
     and never clicked 「最初から始める」 on the title): while only a few lines came and none for confirmAfter, a start item on screen is still
     clicked, as in the intro */
  if(this.lastLines<=3&&t-this.lastLineAt>=o.confirmAfter&&t-this.clickedStart>2500){const item=(obs.menu||[]).find(m=>m&&START.test(String(m.text||'').trim())&&!NOT_START.test(String(m.text||''))&&m.w>0&&m.h>0);
   if(item){this.clickedStart=t;this.lastAct=t;{const at={x:Math.round(item.x+item.w/2),y:Math.round(item.y+item.h/2)};if(o.hoverStart){out.push({do:'move',...at});this.pendingClick={...at,at:t+o.choiceHover};}else out.push({do:'click',...at,watch:'start'});}return out;}}
  const ok=t-this.lastLineAt>=o.confirmAfter&&t-this.clickedConfirm>2500&&(obs.menu||[]).find(m=>m&&m.role==='button'&&CONFIRM.test(String(m.text||'').trim())&&m.w>0&&m.h>0);
  if(ok){this.clickedConfirm=t;this.lastAct=t;out.push({do:'click',x:Math.round(ok.x+ok.w/2),y:Math.round(ok.y+ok.h/2),watch:'confirm'});return out;}
  /* skip:false (tools/adapt-auto.cjs --no-skip): no held Ctrl, lines come at reading pace (a per-character draw stream is not cut up by fast-forward) */
  const ctrl=o.slowLines>0?this.fast:o.skip!==false;
  if(ctrl&&t-this.lastCtrl>=o.ctrlEvery){this.lastCtrl=t;out.push({do:'keydown',vk:VK.ctrl});}
  /* readEvery (tools/adapt-auto.cjs): the advance interval without Ctrl, so a long line is shown to its end before the next one (the reader
     reveals it; at 450 ms 3-row lines of オルフレール never completed: Cardinal row) */
  /* readQuietMs (tools/adapt-auto.cjs, owner: DrawText 流静默 ≥600 ms 且距上次点击 ≥1 s 再点): without Ctrl, the next click waits until the
     game drew nothing for readQuietMs (a long line is shown to its end) and readMinMs passed (a short one does not wait for nothing) */
  /* readPerCharMs (tools/adapt-auto.cjs; 2026-11-27 Monochrome Empire: YU-RIS hands the joined line over when its typewriter is done, the
     click came 1.2 s later, and the reader, which reveals the line again at about 30 characters a second, never finished 10 of 55 lines):
     at reading pace the line that came last is also given readPerCharMs per character before the next click */
  const due=!ctrl&&o.readQuietMs>0?(obs.quietMs??1e9)>=o.readQuietMs&&t-this.lastAct>=o.readMinMs&&!(o.readPerCharMs>0&&(obs.lineAgeMs??1e9)<(obs.lineChars|0)*o.readPerCharMs):t-this.lastAct>=(!ctrl&&o.readEvery>0?o.readEvery:o.advanceEvery);
  /* holdBlind (tools/adapt-auto.cjs; 2026-11-26 Monochrome Empire: once InputShim made its input land, the blind advance click at the
     bottom centre of the title opened 「各鑑賞モード」 before the OCR could find 「最初から始める」): while only a few lines came, none for
     confirmAfter and the runner's OCR has not looked at the screen yet (obs.ocr), no blind click / Enter goes to what may be a menu */
  if(due&&o.holdBlind&&this.lastLines<=3&&t-this.lastLineAt>=o.confirmAfter&&!((obs.ocr|0)>0))return out;
  if(due){this.lastAct=t;out.push(this.step++%2?{do:'key',vk:VK.enter}:{do:'click',x:Math.round(W.w/2),y:Math.round(W.h*.85)});}
  return out;}
}
module.exports={Driver,DEFAULTS,VK,START,NOT_START,CONFIRM};
