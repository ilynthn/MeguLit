// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 a cold-test run (services/cold-test-run.cjs run.json) -> tape rows of what the game's screen showed (core/cardinal/timeline.cjs
   screenRow). The cold test reads the choice screen with its own OCR (run.ocrChoices) and says when it got there (phase 'choice') and
   when it was through (phase 'choice-done'); that becomes one {t, screen:{type:'choices', texts, until}} row. Pure, no clock, no file. */
function screenRows(run){
 const phases=Array.isArray(run?.phases)?run.phases:[],texts=Array.isArray(run?.ocrChoices)?run.ocrChoices.map(x=>String(x??'').trim()).filter(Boolean):[];
 if(!texts.length)return [];
 const at=name=>{const p=phases.find(x=>x?.name===name);const t=Date.parse(p?.at);return Number.isFinite(t)?t:null;};
 const from=at('choice');if(from==null)return [];
 const done=at('choice-done');
 return [{t:from,screen:{type:'choices',texts:texts.slice(0,12),...(done!=null&&done>=from?{until:done}:{})}}];
}
module.exports={screenRows};
