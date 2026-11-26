// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Cardinal's tape (2026-11-21): what this PC's two native bridges said during the game session, kept in memory so Cardinal can play
   the session's last lines back through a hidden reader (services/cardinal.cjs). Every engine, every game: the records are the
   bridges' own stdout (core/gal-native.cjs GalWindowBridge, core/hook-native.cjs HookBridge), the input of the whole chain.
   Never written to disk by itself, never uploaded (only scores leave the PC): the replay gets a temporary copy that is removed with it.
   Left out: the bridge's heartbeat, pointer / layer bookkeeping and pictures (the reader never sees them), any record over 64 KB.
   Kept: about cardinal.lines + a margin of dialogue lines (hookSource), at most MAX_ROWS records and MAX_BYTES; the attach records
   (ready, bound, layout, hookProcess, hookThreads) that scrolled out are kept as the head, so a snapshot can always attach. */
const SKIP={gwb:new Set(['hostFrame','readerPointer','readerContext','layerState','layerRaise','clientShot','sceneShot','rawFrame','sceneFrame','sceneProbe','mediaClip','hotkeyState']),hb:new Set(['hookHeartbeat'])};
/* 2026-11-26 hb:hookStatus too: the bridge's replacement / hide state (replacementState, hookActive …) says how the kernel may draw; a
   snapshot that cut it off replayed a read-only stream as embeddable (cold-test tape of オルフレール: embed mode, no Japanese row) */
const HEAD=['gwb:ready','gwb:bound','gwb:layout','hb:hookProcess','hb:hookThreads','hb:hookStatus'];
const MAX_ROWS=30000,MAX_BYTES=12*1024*1024,ROW_MAX=64*1024,MARGIN=20;
let keepLines=60+MARGIN;
let tape=fresh();
function liveSource(text,options){if(process.env.MEGULIT_CARDINAL_REPLAY==='1')return null;if(!String(text||'').trim())return null;return tape.pairs.source(text,options);}
function liveTranslation(text,translation,options){if(process.env.MEGULIT_CARDINAL_REPLAY==='1')return;tape.pairs.availability(text,translation,options);}
function pairPolicy(message,target){if(process.env.MEGULIT_CARDINAL_REPLAY==='1')return null;return tape.pairs.setPolicy(message,target);}
function pairObserved(message,target){if(process.env.MEGULIT_CARDINAL_REPLAY==='1')return false;return tape.pairs.observe(message,target);}
function pairing(n){return tape.pairs.snapshot(n);}
function fresh(){return {rows:[],sizes:[],head:new Map(),bytes:0,lines:0,game:'',since:0,pairs:new(require('./display-pairs.cjs').DisplayPairs)()};}
const kindOf=row=>(row.gwb?'gwb:':'hb:')+(row.gwb||row.hb).type;
function trim(){const t=tape;while(t.rows.length&&(t.lines>keepLines||t.rows.length>MAX_ROWS||t.bytes>MAX_BYTES)){const row=t.rows.shift(),size=t.sizes.shift();t.bytes-=size;const k=kindOf(row);if(HEAD.includes(k))t.head.set(k,row);if(k==='hb:hookSource')t.lines--;}}
/* side: 'gwb' | 'hb'; m: the parsed record */
function record(side,m,now=Date.now()){try{if(!m||typeof m.type!=='string'||SKIP[side]?.has(m.type))return;
 if(side==='gwb'&&m.type==='bound'&&m.gameProcessId){const id=m.gameProcessId+'|'+(m.gameStarted||'');if(id!==tape.game){/* a new game process: a new tape; the bridge's ready (said once at its start) stays */const ready=[...tape.rows,...tape.head.values()].filter(r=>r.gwb?.type==='ready').at(-1);tape=fresh();tape.game=id;tape.since=now;if(ready)tape.head.set('gwb:ready',ready);}}
 const json=JSON.stringify(m);if(json.length>ROW_MAX)return;const row={t:now,[side]:m};tape.rows.push(row);tape.sizes.push(json.length+24);tape.bytes+=json.length+24;
 if(side==='hb'&&m.type==='hookSource')tape.lines++;trim();}catch{}}
/* how many dialogue lines the tape keeps (the profile's cardinal.lines, plus a margin) */
function keep(lines){const n=Math.max(10,Math.min(400,Math.floor(Number(lines)||60)));keepLines=n+MARGIN;trim();}
/* the last n dialogue lines with the attach records before them: rows of the tape format ({t, gwb|hb}), oldest first */
function snapshot(n=keepLines-MARGIN){const t=tape;if(!t.rows.length)return {rows:[],lines:0,game:t.game};let cut=0,seen=0;
 for(let i=t.rows.length-1;i>=0;i--){if(t.rows[i].hb?.type==='hookSource'&&++seen>=n){cut=i;break;}}
 const head=new Map(t.head);for(let i=0;i<cut;i++){const k=kindOf(t.rows[i]);if(HEAD.includes(k))head.set(k,t.rows[i]);}
 const body=t.rows.slice(cut);const first=body[0]?.t??Date.now();
 const pre=HEAD.filter(k=>head.has(k)&&!body.some(r=>kindOf(r)===k&&k!=='gwb:layout')).map((k,i)=>({...head.get(k),t:first-300+i*20}));
 return {pairing:pairing(n),rows:[...pre,...body],lines:body.filter(r=>r.hb?.type==='hookSource').length,game:t.game,since:t.since};}
function clear(){tape=fresh();}
const stats=()=>({rows:tape.rows.length,lines:tape.lines,bytes:tape.bytes,game:tape.game});
module.exports={record,keep,snapshot,clear,stats,liveSource,liveTranslation,pairPolicy,pairObserved,pairing};
