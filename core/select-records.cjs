// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 ISLAND（アイランド） live run: a CatSystem2 select command reaches the source stream as one record per option,
   「<index> <label> <text>」 (「0 com01_selC_1 俺は俺だ」「1 com01_selC_2 わからない」「2 com01_selC_3 ……せつな」; the label can differ per
   option: 「0 com01_selB_1 凛音」「1 sum01 リンネ」). Read only where the profile says so (choice.selectRecords, CatSystem2 engine file).
   parse(text) -> {index,label,text} | null: the index is 0-99, the label is an ASCII script label with at least one letter, the text
   is what the button shows. A line of dialogue never has this shape: after its leading number comes Japanese, not a label.
   SelectBatch collects the records of one command: index 0 starts a batch, the next index continues it; when no record came for
   quietMs the batch is done, and it is a choice when it holds two or more options in index order. */
const RECORD=/^([0-9]{1,2})[ \t]+([A-Za-z0-9_]*[A-Za-z][A-Za-z0-9_]*)[ \t]+(\S[^\r\n]{0,79})$/;
function parse(text){const m=RECORD.exec(String(text||'').trim());if(!m)return null;const t=m[3].trim();if(!/[^\x00-\x7f]/.test(t))return null;return {index:Number(m[1]),label:m[2],text:t};}
class SelectBatch{
 constructor({quietMs=150,onChoice=()=>{},timers={setTimeout,clearTimeout}}={}){this.quietMs=quietMs;this.onChoice=onChoice;this.timers=timers;this.items=[];this.timer=null;}
 add(record){if(!record)return false;
  if(record.index===0)this.items=[];
  else if(record.index!==this.items.length)this.items=[];/* a record out of order starts nothing; its batch is broken */
  if(record.index===this.items.length)this.items.push(record);
  this.timers.clearTimeout(this.timer);this.timer=this.timers.setTimeout(()=>this.flush(),this.quietMs);this.timer?.unref?.();return true;}
 flush(){this.timers.clearTimeout(this.timer);this.timer=null;const items=this.items;this.items=[];if(items.length>=2)this.onChoice(items.map(r=>r.text));}
 stop(){this.timers.clearTimeout(this.timer);this.timer=null;this.items=[];}
}
module.exports={parse,SelectBatch,RECORD};
