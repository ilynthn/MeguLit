/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
/* 2026-11-26 (死に逝く君、館に芽吹く憎悪, integration run): every row of the reader's 对话记录 said 旁白, also 「……焼き過ぎたか」 under
   the game's name box 血塗れの男. KiriKiri draws the name on side streams (KiriKiri1 / DrawText 「血塗れの男血塗れの男」, KiriKiri2
   「男男」) while the dialogue stream sends the line alone; sometimes 15 ms before the line, sometimes 15 ms after it. Replays the
   real hook-events of that run (fixtures/games/shiniyuku) through HookNative.auxText / emitSource on the log's own clock. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs');
const FIX=path.join(__dirname,'fixtures','games','shiniyuku','integration-20261126.hook-events.txt');

function events(){const rows=fs.readFileSync(FIX,'utf8').split(/\r?\n/).filter(Boolean).map(l=>({t:Date.parse(l.slice(0,24)),l:l.slice(25)}));const out=[];
 for(let i=0;i<rows.length;i++){const {t,l}=rows[i];let m=/^choice aux (\S+) role=\S* added=.* text=(".*")$/.exec(l);
  if(m){out.push({t,aux:{sourceName:m[1],role:0,text:JSON.parse(m[2])}});continue;}
  if(!/^source chars=/.test(l))continue;
  /* the dialogue line: the dialogue stream's own text (script noise check just before), else the reader's translation retry of it */
  const before=/^script noise line kept (".*")$/.exec(rows[i-1]?.l||'');let text=before&&JSON.parse(before[1]);
  if(!text)for(let j=i+1;j<rows.length&&!text;j++){const r=/^translation guard retry chain (".*")$/.exec(rows[j].l);if(r)text=JSON.parse(r[1]);}
  out.push({t,line:text});}
 return out;}

function rig(){let clock=0;const out=[];const h=Object.create(HookNative.prototype);
 Object.assign(h,{state:{hookSequence:0},now:()=>clock,trace(){},clearChoices(){},emit(){},palFlush(){},artCandidate(){},textEffectsFrame(){},recoverPageAside(){return false;},requestChoices(){},
  notify(p){h.state={...h.state,...p};out.push(p);}});
 /* the late-name settle timer runs on the log's clock: fired when the log moves on 60 ms */
 const settle=t=>{if(h.nameLateTimer&&t-h.lateArmedAt>=60){clearTimeout(h.nameLateTimer);h.nameLateTimer=null;h.resolveLateName();}};
 const step=e=>{settle(e.t);clock=e.t;const armed=!!h.nameLateTimer;if(e.aux)h.auxText(e.aux);else h.emitSource(e.line,'live');if(!armed&&h.nameLateTimer)h.lateArmedAt=e.t;};
 const finish=()=>settle(Infinity);
 /* each shown line with the speaker the reader ends up with (hookSpeaker on the line, or the late one for that sequence) */
 const lines=()=>{const L=[];for(const p of out){if(typeof p.hookSource==='string')L.push({text:p.hookSource,speaker:p.hookSpeaker||'',sequence:p.hookSequence});
  else if(p.hookSpeakerLate){const x=L.find(l=>l.sequence===p.hookSpeakerLate);if(x&&!x.speaker)x.speaker=p.hookSpeaker;}}return L;};
 return {h,step,finish,lines};}

test('side-stream names reach the speaker of their quoted line, before or after it, from the second sighting',()=>{
 const r=rig();for(const e of events())r.step(e);r.finish();const L=r.lines();
 const who=re=>L.filter(l=>re.test(l.text)).map(l=>l.speaker);
 assert.ok(r.h.knownSpeakers.has('血塗れの男'),'the drawn name box is learned');assert.ok(r.h.knownSpeakers.has('美亜'));
 assert.ok(!r.h.knownSpeakers.has('男男')&&!r.h.knownSpeakers.has('男')&&!r.h.knownSpeakers.has('亜亜'),'KiriKiri2 voice-name frames lose to the drawn name');
 /* 13:06:37 first sighting of 血塗れの男 (not yet learned), 13:06:44 second: named */
 assert.deepEqual(who(/^「餌風情が/),['血塗れの男']);
 /* name drawn 15 ms after the line (13:07:58 「ここは……」 then 美亜): the late speaker names it */
 assert.deepEqual(who(/^「ここは/),['美亜']);
 const quoted=L.filter(l=>/^[「『]/.test(l.text)),named=quoted.filter(l=>l.speaker);
 assert.ok(named.length>=quoted.length-3,`quoted lines named ${named.length}/${quoted.length}: `+JSON.stringify(quoted));
 for(const l of L)if(!/^[「『]/.test(l.text))assert.equal(l.speaker,'',`narration keeps no speaker: ${l.text}`);
 for(const l of L)assert.ok(['','美亜','血塗れの男'].includes(l.speaker),`only the game's names: ${JSON.stringify(l)}`);});

test('a name-like side-stream word before one quoted line is not a speaker',()=>{
 const r=rig();let t=1000;const ev=[{aux:{sourceName:'TextOutA',text:'セーブ'}},{line:'「よう」'},{line:'坂の下。'},{aux:{sourceName:'TextOutA',text:'ロード'}},{line:'「ああ」'}];
 for(const e of ev){t+=600;r.step({...e,t});}r.finish();
 assert.ok(!r.h.knownSpeakers||!r.h.knownSpeakers.size);assert.deepEqual(r.lines().map(l=>l.speaker),['','','']);});

test('a learned name drawn just after a line does not carry over to the next narration line',()=>{
 const r=rig();let t=1000;const say=(dt,e)=>{t+=dt;r.step({...e,t});};
 for(let i=0;i<2;i++){say(800,{aux:{sourceName:'KiriKiri1',text:'美亜美亜'}});say(15,{line:'「'+i+'回目」'});}
 say(900,{line:'「げぼっ！」'});say(14,{aux:{sourceName:'DrawText',text:'美亜'}});say(900,{line:'――美亜は吐血した。'});r.finish();
 assert.deepEqual(r.lines().map(l=>l.speaker),['','美亜','美亜','']);});
