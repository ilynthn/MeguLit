// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Cardinal timelines (core/cardinal/, services/cardinal/driver.cjs steps), from any of:
     a tape       what this PC's bridges said during the session (core/cardinal/tape.cjs; also the older MEGULIT_HOOK_RECORD
                  recordings {t,m}): fromTape(rows, game). Every game, every engine: the records are fed as they were said
     logs         the owner's logs or a runtime sample (data/runtime-samples/<key>/: the same three file names), below.
                  The hook text of a line is only in engine-draw.log (KiriKiri ToMe_CHARS), so a log timeline needs that log
   (moved from tools/reader-replay/from-logs.cjs)
   The owner's logs -> a replay timeline.
   Facts taken from the logs as they are:
     engine-draw.log   every ToMe_CHARS record (KiriKiri script.inc) at its time -> HookBridge {type:'hookChars',line}
     reader-host.log   pointer downs on the game (the owner's clicks)            -> marks right before each click
     hook-events.log   'source chars=N' times                                     -> the hookSource times
   Reconstructed (labelled, checked): the hookSource TEXT of a dialogue line is the text of its first ToMe_CHARS record (the
   log keeps only its length); extract() returns the logged lengths so a fixture asserts they match. */
const fs=require('node:fs'),path=require('node:path');
const T=s=>Date.parse(s);
function readLines(file){return fs.existsSync(file)?fs.readFileSync(file,'utf8').split(/\r?\n/):[];}
function extract(logs,fromIso,toIso){
 const a=T(fromIso),z=T(toIso),inside=t=>t>=a&&t<=z;
 const chars=[];for(const l of readLines(path.join(logs,'engine-draw.log'))){const m=/^(\S+Z) (ToMe_CHARS .*)$/.exec(l);if(m&&inside(T(m[1])))chars.push({t:T(m[1]),raw:m[2]});}
 const sources=[],placed=[],other=[];for(const l of readLines(path.join(logs,'hook-events.log'))){const m=/^(\S+Z) (.*)$/.exec(l);if(!m||!inside(T(m[1])))continue;const t=T(m[1]),s=m[2];let x;
  if((x=/^source chars=(\d+) sequence=(\d+)/.exec(s)))sources.push({t,chars:+x[1],seq:+x[2]});else if(/^placement /.test(s))placed.push({t,s});else other.push({t,s});}
 const clicks=[],host=[];for(const l of readLines(path.join(logs,'reader-host.log'))){if(!l.startsWith('{'))continue;let o;try{o=JSON.parse(l);}catch{continue;}const t=T(o.at);if(!inside(t))continue;if(o.type==='hostFrame'&&o.pointer==='down')clicks.push({t,gameX:o.gameX,gameY:o.gameY,ctrl:o.ctrl});else if(o.type!=='hostFrame')host.push({t,o});}
 return {chars,sources,placed,other,clicks,host};
}
const fieldOf=(raw,k)=>{const m=new RegExp('(?:^| )'+k+'=(\\S*)').exec(raw);return m?m[1]:null;};
const textOf=raw=>{const i=raw.indexOf(' text=');return i<0?'':raw.slice(i+6);};
/* the bridge's attach of the owner's run (GalWindowBridge 'bound' / 'layout', HookBridge stream list) */
const LAYOUT={clientWidth:1280,clientHeight:720,clientX:320,clientY:180,magpie:false,readerX:384,readerY:760,readerWidth:1152,readerHeight:160,workBottom:1040,surfaceWidth:1920,surfaceHeight:1080,maskX:0,maskY:0};
/* game: what the attach records say; anything missing (an older recording) gets a plain 1280x720 game */
function attachSteps(game,t){game={pid:4242,started:'638994190000000000',hwnd:'1234',process:'game',exe:'C:/Games/game.exe',title:'',sha:'',...game};game.layout={...LAYOUT,...(game.layout||{})};game.stream={id:'1:0:0',name:'hook',code:'',...(game.stream||{})};return [
 {t,gwb:{type:'ready',hotkey:true,coverHotkey:true,modeHotkey:true,coverEnabled:true}},
 {t:t+50,gwb:{type:'bound',activateGame:false,coverEnabled:true,bound:true,gameProcessId:game.pid,gameStarted:game.started,gameHwnd:game.hwnd,gameStyleKey:game.sha,gameTitle:game.title,hookExact474:false,interfaceMode:'translation',processName:game.process,gameExecutable:game.exe,message:''}},
 {t:t+100,gwb:{type:'layout',...game.layout}},
 {t:t+150,hb:{type:'hookProcess',path:game.exe}},
 {t:t+200,hb:{type:'hookThreads',hookThreads:[{id:game.stream.id,name:game.stream.name,code:game.stream.code,selected:true,embed:true,sample:''}]}}
];}
/* timeline: every ToMe_CHARS record; a hookSource (text of the record) before the first record of each dialogue line number;
   a mark before each click; clicks themselves go to the hook as advance (readerInput complete) like the bridge reports them */
/* OCR art scan readings (GalWindowBridge artText, source ocr) and aux streams (HookBridge hookAuxText) as the log names them */
function sideEvents(ex,game){const out=[];let shown=false,id=0;
 for(const o of ex.other){let x;
  if((x=/^ocr page art scan (\d+)\/\d+ ?(.*)$/.exec(o.s))){const n=+x[1],text=x[2];if(n>0&&text){
   /* MODEL (labelled): the log keeps the scan's text with its rows joined; a text that is one phrase k times (the opening's litany,
      three rows faded in one by one: core/ocr-vote.cjs) is given back as k rows; any other text as one row */
   let rows=[text];for(let k=2;k<=6;k++){const L=[...text].length;if(L%k)continue;const part=[...text].slice(0,L/k).join('');if(part.repeat(k)===text){rows=Array(k).fill(part);break;}}
   if(!shown)id++;shown=true;out.push({t:o.t,gwb:{type:'artText',source:'ocr',id:'art'+id,visible:true,text,rows:rows.map((t,i)=>({text:t,x:300,y:200+i*40,w:200,h:30})),sw:game.layout?.clientWidth||1280,sh:game.layout?.clientHeight||720,dialogSeen:false,others:0}});}
   else if(shown){shown=false;out.push({t:o.t,gwb:{type:'artText',source:'ocr',id:'art'+id,visible:false}});}}
  else if((x=/^choice aux (.+?) role=(\d+) added=\[.*?\] text="(.*)"?$/.exec(o.s))){const text=x[3].replace(/"$/,'');if(text&&text.length<=400)out.push({t:o.t,hb:{type:'hookAuxText',text,sourceName:x[1],role:+x[2]}});}
 }return out;}
function timeline(ex,game,{markEvery=true,side=true,actions=[]}={}){
 const steps=[],seen=new Set();
 /* KiriKiri reports a line of the KAG text renderer path as 100000+n (native/krkrtext/script.inc trLine: 千恋＊万花); those are the
    dialogue when the window has no line of the message layer path (ファタ draws through the message layer) */
 const trOnly=!ex.chars.some(c=>{const l=fieldOf(c.raw,'line');return l!=null&&+l<100000&&(fieldOf(c.raw,'role')||'line')==='line'&&textOf(c.raw);});
 const ev=[];for(const c of ex.chars)ev.push({t:c.t,k:'c',c});for(const k of ex.clicks)ev.push({t:k.t,k:'k',k});if(side)for(const s of sideEvents(ex,game))ev.push({t:s.t,k:'s',s});for(const a of actions)ev.push({t:a.t,k:'a',a});ev.sort((x,y)=>x.t-y.t);
 for(const e of ev){if(e.k==='s'){steps.push(e.s);continue;}if(e.k==='a'){steps.push(e.a);continue;}
  if(e.k==='c'){const raw=e.c.raw,line=fieldOf(raw,'line'),role=fieldOf(raw,'role')||'line',text=textOf(raw);
   if(role==='line'&&text&&!seen.has(line)&&(+line<100000||trOnly)){seen.add(line);steps.push({t:e.t-25,hb:{type:'hookSource',text,sourceName:game.stream?.name||'hook',sourceCode:game.stream?.code||'',hookActive:true},line:+line,text});}
   steps.push({t:e.t,hb:{type:'hookChars',line:raw}});}
  else{if(markEvery)steps.push({t:e.t-1,mark:'click@'+new Date(e.t).toISOString().slice(11,23),settle:0});
   /* MODEL (labelled): did the game clear its page at this click? yes when the next dialogue line starts on a row at or above the
      row of the line before it (a new page), no when it goes on below it (the same page, KAG [l]) */
   const y=c=>{const m=/ rects=\d+,(\d+),/.exec(c.raw);return m?+m[1]:null;},line=c=>!/ role=(?!line)/.test(c.raw)&&/ n=[1-9]/.test(c.raw);
   const prev=[...ex.chars].reverse().find(c=>c.t<=e.t&&line(c)),next=ex.chars.find(c=>c.t>e.t&&line(c));
   const pageClear=!(prev&&next&&y(prev)!=null&&y(next)!=null&&y(next)>y(prev)+4);
   steps.push({t:e.t,gwb:{type:'readerInput',complete:true},pageClear});}
 }
 return steps;
}
/* GalWindowBridge's messages (core/gal-native.cjs reads them); every other record of a tape is HookBridge's */
const GWB=new Set(['ready','bound','layout','readerInput','hookChoiceBoxes','artText','hookVisual','hotkey','bindHotkey','modeRequest','backlogHotkey','regionApplied','waitMarkerFrame','hotkeyState','error','dialogScene','dialogAway','dialogVisibility','choiceBoxes','ocrChoices','choiceOcr']);
/* 2026-11-26 what the game's screen showed, as the cold test / a live capture saw it (not a bridge record): {t, screen:{type:'choices',
   texts:[...], until?}} -> a screenChoice step. The driver only notes when it came (o.screenChoices); nothing is fed to the reader, so
   options the hook did not turn into a choice stay unoffered and core/cardinal/checks.cjs choices() fails them as unseen by the player */
function screenRow(r){const s=r.screen;if(!s||s.type!=='choices'||!Array.isArray(s.texts))return null;const texts=s.texts.map(x=>String(x??'').slice(0,400)).filter(x=>x.trim()).slice(0,12);
 if(!texts.length)return null;return {t:r.t,screenChoice:{texts,...(Number.isFinite(s.until)&&s.until>=r.t?{until:s.until}:{})}};}
const rowOf=r=>r&&(r.hb?{t:r.t,hb:r.hb}:r.gwb?{t:r.t,gwb:r.gwb}:r.screen?screenRow(r):r.phase&&typeof r.phase.name==='string'?{t:r.t,phase:r.phase.name.slice(0,40)}:r.m&&typeof r.m.type==='string'?(GWB.has(r.m.type)?{t:r.t,gwb:r.m}:{t:r.t,hb:r.m}):null);
/* a tape -> steps. game: {pid, started, hwnd, sha, title, process, exe, layout, stream} for the attach when the tape has none (an older
   recording of the HookBridge alone); every hookSource is a dialogue line (line = its order, text = its text) */
function fromTape(rows,game){const steps=[];let n=0;const list=(rows||[]).map(rowOf).filter(r=>r&&Number.isFinite(r.t)).sort((a,b)=>a.t-b.t);if(!list.length)return steps;
 const has=type=>list.some(r=>r.gwb?.type===type);
 if(!has('bound'))steps.push(...attachSteps(game,list[0].t-400));
 for(const r of list){if(r.hb?.type==='hookSource'&&typeof r.hb.text==='string'){steps.push({...r,line:++n,text:r.hb.text});continue;}steps.push(r);}
 return steps;}
module.exports={extract,timeline,attachSteps,sideEvents,fieldOf,textOf,fromTape,GWB,screenRow};
