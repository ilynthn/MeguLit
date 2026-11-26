// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 跳过片头 click/Enter/Esc/Ctrl，轮询不死等；点 New Game 不读档；推进几十句，Ctrl 快进加点击) what the cold test
   does to the game on the hidden desktop, as a pure state machine: the runner (services/cold-test-run.cjs) calls next(obs)
   every TICK ms with what it sees and sends the returned actions through native/ColdDesk.exe (PostMessage only: the hidden
   desktop has no real keyboard, and the user's mouse is never touched).

   obs: {t ms since start, window:{w,h}|null, lines (hook lines so far), choices (choice events so far),
         menu:[{text, role, x, y, w, h}] (engine-draw button / menu / choice runs on screen now), black (last picture was black)}
   actions: {do:'click', x, y} (client px) | {do:'key', vk} | {do:'keydown'|'keyup', vk} | {do:'shot', tag} | {do:'end', why}

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
const DEFAULTS=Object.freeze({tick:250,bootMs:90000,introMs:120000,introEvery:900,escUntil:15000,advanceEvery:450,ctrlEvery:2000,targetLines:60,stallMs:45000,blackAfter:40000,shotLines:[3,15,30],introShotAt:25000,confirmAfter:8000});

class Driver{
 constructor(opt={}){this.o={...DEFAULTS,...opt};this.phase='boot';this.step=0;this.lastAct=-1e9;this.lastCtrl=-1e9;this.lastLines=0;this.lastLineAt=0;this.lastChoices=0;this.choiceAt=0;this.shotsTaken=new Set();this.clickedStart=-1e9;this.clickedConfirm=-1e9;this.introShot=false;}
 next(obs){const o=this.o,t=obs.t|0,out=[];const end=why=>{if(this.phase==='advance')out.push({do:'keyup',vk:VK.ctrl});this.phase='end';out.push({do:'end',why});return out;};
  if(this.phase==='end')return out;
  if(obs.deadline&&t>=obs.deadline)return end(this.phase==='advance'?'time':'time-'+this.phase);
  if(this.phase==='boot'){if(obs.window&&obs.window.w>0&&obs.window.h>0){this.phase='intro';this.introAt=t;this.lastAct=t;}else if(t>=o.bootMs)return end('no-window');else return out;}
  const W=obs.window||{w:0,h:0};const center={do:'click',x:Math.round(W.w/2),y:Math.round(W.h*.6)};
  if((obs.lines|0)>this.lastLines){this.lastLines=obs.lines|0;this.lastLineAt=t;}
  if(this.phase==='intro'){
   if((obs.lines|0)>0){this.phase='advance';this.lastLineAt=t;out.push({do:'keydown',vk:VK.ctrl});this.lastCtrl=t;}
   else{const since=t-this.introAt;
    if(!this.introShot&&since>=o.introShotAt){this.introShot=true;out.push({do:'shot',tag:'intro'});}
    if(obs.black&&since>=o.blackAfter)return end('black');
    if(since>=o.introMs)return end('no-lines');
    const item=(obs.menu||[]).find(m=>m&&START.test(String(m.text||'').trim())&&!NOT_START.test(String(m.text||''))&&m.w>0&&m.h>0);
    if(item&&t-this.clickedStart>2500){this.clickedStart=t;this.lastAct=t;out.push({do:'click',x:Math.round(item.x+item.w/2),y:Math.round(item.y+item.h/2)});return out;}
    if(t-this.lastAct>=o.introEvery){this.lastAct=t;const k=this.step++%4;
     if(k===0)out.push(center);else if(k===1)out.push({do:'key',vk:VK.enter});else if(k===2)out.push(since<o.escUntil?{do:'key',vk:VK.esc}:{do:'key',vk:VK.space});else out.push({do:'key',vk:VK.ctrl});}
    return out;}}
  /* advance */
  if(this.lastLines>=o.targetLines)return end('enough');
  if(t-this.lastLineAt>=o.stallMs)return end('stalled');
  for(const n of o.shotLines)if(this.lastLines>=n&&!this.shotsTaken.has(n)){this.shotsTaken.add(n);out.push({do:'shot',tag:'line-'+n});}
  if((obs.choices|0)>this.lastChoices){this.lastChoices=obs.choices|0;this.choiceAt=t;}
  if(this.choiceAt&&t-this.choiceAt>=600){this.choiceAt=0;this.lastAct=t;const opt=(obs.menu||[]).find(m=>m&&m.role==='choice'&&m.w>0&&m.h>0);out.push(opt?{do:'click',x:Math.round(opt.x+opt.w/2),y:Math.round(opt.y+opt.h/2)}:{do:'key',vk:VK.enter});return out;}
  const ok=t-this.lastLineAt>=o.confirmAfter&&t-this.clickedConfirm>2500&&(obs.menu||[]).find(m=>m&&m.role==='button'&&CONFIRM.test(String(m.text||'').trim())&&m.w>0&&m.h>0);
  if(ok){this.clickedConfirm=t;this.lastAct=t;out.push({do:'click',x:Math.round(ok.x+ok.w/2),y:Math.round(ok.y+ok.h/2)});return out;}
  if(t-this.lastCtrl>=o.ctrlEvery){this.lastCtrl=t;out.push({do:'keydown',vk:VK.ctrl});}
  if(t-this.lastAct>=o.advanceEvery){this.lastAct=t;out.push(this.step++%2?{do:'key',vk:VK.enter}:{do:'click',x:Math.round(W.w/2),y:Math.round(W.h*.85)});}
  return out;}
}
module.exports={Driver,DEFAULTS,VK,START,NOT_START,CONFIRM};
