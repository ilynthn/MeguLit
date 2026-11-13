// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* E331 NScripter / ONScripter (月姫). The script is 0.txt ... 99.txt (or 00.txt ...) read in number order, else
   nscript.dat (every byte XOR 0x84). It is split into blocks at its labels (*f20, *s20 ...); a block is one scene,
   named by its label, so a translated script lines up block by block even where a block was rewritten.
   A line whose first character is not ASCII is text. It is cut at the click waits (@) and page ends (\) into the parts
   the game shows one at a time; inline commands (!w100, !sd, #ffffff colours) are dropped. Labels and the ASCII
   command lines are anchors. Shift-JIS or GBK (Chinese builds) is chosen per file by which reads with fewer errors. */
const fs=require('node:fs'),path=require('node:path');
const KANA=/[ぁ-ゖァ-ヺ]/g;
/* E577 kit.decodeText */
const decode=kit.decodeText;
const {stat}=require('./file-key.cjs');
const TXT=n=>/^\d{1,2}\.txt$/i.test(n);
function scriptFiles(dir){let names;try{names=fs.readdirSync(dir);}catch{return [];}
 const txt=names.filter(TXT).sort((a,b)=>parseInt(a,10)-parseInt(b,10)||a.length-b.length).map(f=>path.join(dir,f));
 if(txt.length)return txt;const dat=names.find(n=>/^nscript\.dat$/i.test(n));return dat?[path.join(dir,dat)]:[];}
const textMemo=new Map();
// The whole script as text, or '' when it is not an NScripter script (it must define *define and *start).
function scriptText(dir){const files=scriptFiles(dir);if(!files.length)return '';const key=files.map(f=>f+'|'+stat(f)).join('\n');if(textMemo.has(key))return textMemo.get(key);
 let text='';try{text=files.map(f=>{const b=fs.readFileSync(f);if(/\.dat$/i.test(f))for(let i=0;i<b.length;i++)b[i]^=0x84;return decode(b);}).join('\n');}catch{text='';}
 if(!/^\*define\b/m.test(text)||!/^\*start\b/m.test(text))text='';
 textMemo.set(key,text);if(textMemo.size>8)textMemo.delete(textMemo.keys().next().value);return text;}
// Label blocks in file order; the text before the first label is "*_head". A label used twice keeps its first block.
function blocks(text){const out=[],seen=new Set();let name='*_head',body=[];
 const push=()=>{const key=name.toLowerCase();if(!seen.has(key)){seen.add(key);out.push({name,body:body.join('\n')});}};
 for(const raw of text.split(/\r?\n/)){const m=raw.match(/^\s*(\*[A-Za-z0-9_]+)/);if(m){push();name=m[1];body=[raw];}else body.push(raw);}
 push();return out;}
function clean(t){return t.replace(/!(?:w|d)\d+|!s(?:d|\d+)?|#[0-9A-Fa-f]{6}/g,'').replace(/[\/`]$/,'').trim();}
function parse(buf){const lines=[],anchors=[];
 for(const raw of buf.toString('utf8').split('\n')){let t=raw.trim();if(!t||t[0]===';')continue;
  // A text line may open with inline commands (!w500「…」, #ffffff…).
  const lead=t.replace(/^(?:!(?:w|d)\d+|!s(?:d|\d+)?|#[0-9A-Fa-f]{6})+/,'');if(lead!==t&&lead&&!/^[\x00-\x7f]/.test(lead))t=lead;
  if(/^[\x00-\x7f]/.test(t)){if(t[0]==='*')anchors.push(t.split(/\s/)[0]);continue;}
  for(const part of t.split(/[@\\]/)){const s=clean(part);if(s)lines.push(s);}}
 return {lines,anchors};}
const nscripter={
 id:'nscripter',hint:'0.txt（或 nscript.dat）',
 scenes(dir){const text=scriptText(dir);if(!text)return [];return blocks(text).map(b=>({name:b.name,read:()=>Buffer.from(b.body,'utf8')}));},
 // A patch folder holds a whole script too: its blocks stand for the running script's blocks of the same label.
 archives(dir){return this.scenes(dir);},
 sources:dir=>scriptFiles(dir),
 parse,test:()=>false,
 _internal:{blocks,clean,scriptText},
};
module.exports=nscripter;
