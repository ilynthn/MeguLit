// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Runtime dump: the reading side of MeguLitDump32/64.dll (native/runtimedump/RuntimeDump.cpp). For games whose scenario or
// translation pack is under a cipher no static key opens (女王蜂の王房's menou.chs, サノバウィッチ's packs), the DLL saves the
// buffers the game itself decrypts. This module switches a game on/off, lists what was saved, decodes it, and turns it
// into plain text files and line lists the original-engine readers and the pairing step take as input.
//
// Layout (all written by the DLL): <root>/<key>/ with key = FNV-1a of the lower-case game folder; game.txt (that folder),
// on (switch), index.jsonl (one line per saved buffer: file, source, how, offset, size, enc, cjk, kana, ratio, crc) and the
// buffers. how: plain (file was never encrypted), inplace (decrypted in the read buffer), alloc (decrypted into a fresh
// buffer), rtl / inflate (decompressor output). root: MEGULIT_RUNTIME_DUMP, else <MeguLit>/cache/runtime-dump.
const fs=require('node:fs'),path=require('node:path');

const root=()=>process.env.MEGULIT_RUNTIME_DUMP||path.join(__dirname,'..','cache','runtime-dump');
function key(dir){const s=path.resolve(dir).replace(/[\\/]+$/,'');let h=0x811c9dc5;
 for(let i=0;i<s.length;i++){let c=s.charCodeAt(i);if(c>=65&&c<=90)c+=32;h=Math.imul(h^c,16777619)>>>0;}return h.toString(16).padStart(8,'0');}
// The folder for this game: by key, else the one whose game.txt names it (another spelling of the same path).
function dirFor(gameDir){const r=root(),own=path.join(r,key(gameDir));if(fs.existsSync(own))return own;
 let names=[];try{names=fs.readdirSync(r);}catch{return own;}const want=path.resolve(gameDir).toLowerCase();
 for(const n of names){try{if(path.resolve(fs.readFileSync(path.join(r,n,'game.txt'),'utf8').trim()).toLowerCase()===want)return path.join(r,n);}catch{}}
 return own;}
// On by default (2026-11-13): the DLL and HookBridge act unless <key>/off exists (or MEGULIT_RUNTIME_DUMP_OFF=1). The DLL
// writes off itself after repeated faults, so a game it disturbs is left alone from then on.
function enable(gameDir){const d=path.join(root(),key(gameDir));fs.mkdirSync(d,{recursive:true});try{fs.unlinkSync(path.join(d,'off'));}catch{}fs.writeFileSync(path.join(d,'on'),'');return d;}
function disable(gameDir){const d=dirFor(gameDir);fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'off'),'');try{fs.unlinkSync(path.join(d,'on'));}catch{}}
const disabled=gameDir=>process.env.MEGULIT_RUNTIME_DUMP_OFF==='1'||fs.existsSync(path.join(dirFor(gameDir),'off'));
const enabled=gameDir=>!disabled(gameDir);

function entries(gameDir){const d=dirFor(gameDir);let raw='';try{raw=fs.readFileSync(path.join(d,'index.jsonl'),'utf8');}catch{return[];}
 const out=[];for(const line of raw.split('\n')){if(!line.trim())continue;let e;try{e=JSON.parse(line);}catch{continue;}
  e.path=path.join(d,e.file);if(fs.existsSync(e.path))out.push(e);}
 return out;}

const ENC={'shift_jis':'shift_jis','gbk':'gbk','utf-8':'utf-8','utf-16le':'utf-16le'};
function decode(buf,enc){const e=ENC[enc]||'utf-8';let t=new TextDecoder(e,{fatal:false}).decode(buf);if(t.charCodeAt(0)===0xfeff)t=t.slice(1);return t;}
const CJK=/[぀-ヿ㐀-鿿＀-￯]/g,KANA=/[぀-ヿ]/g;
const count=(s,re)=>(s.match(re)||[]).length;
const lang=t=>{const c=count(t,CJK);return c&&count(t,KANA)*10>=c?'ja':'zh';};
// Text pieces worth reading: split at line breaks, NULs and other control bytes (compiled scripts keep their strings
// between opcodes); a piece needs two CJK characters and no replacement characters.
function lines(text){const seen=new Set(),out=[];
 for(let p of text.split(/[\x00-\x08\x0a-\x1f\x7f]+/)){p=p.replace(/\t/g,' ').trim();if(!p||p.includes('�')||count(p,CJK)<2||seen.has(p))continue;seen.add(p);out.push(p);}
 return out;}

const HOW={inplace:4,alloc:3,inflate:2,rtl:2,plain:1};
// One document per source file: decrypted copies win over plain ones; between equals, the larger then the later one.
function collect(gameDir){const best=new Map();
 for(const e of entries(gameDir)){const k=(e.source||'memory').toLowerCase()+'|'+(e.how==='plain'?'p':'d')+'|'+(e.offset||0);
  const prev=best.get(k);if(!prev||(HOW[e.how]||0)>(HOW[prev.how]||0)||((HOW[e.how]||0)===(HOW[prev.how]||0)&&(e.size>prev.size||(e.size===prev.size&&e.seq>prev.seq))))best.set(k,e);}
 const docs=[];
 for(const e of best.values()){let buf;try{buf=fs.readFileSync(e.path);}catch{continue;}const text=decode(buf,e.enc);
  docs.push({source:e.source,how:e.how,enc:e.enc,seq:e.seq,offset:e.offset||0,lang:lang(text),text,lines:lines(text)});}
 // A decrypted copy of a source makes a plain copy of the same source redundant (that was the cipher text read as text).
 const decrypted=new Set(docs.filter(d=>d.how!=='plain').map(d=>String(d.source).toLowerCase()));
 return docs.filter(d=>d.how!=='plain'||!decrypted.has(String(d.source).toLowerCase())).sort((a,b)=>a.seq-b.seq);}

// Lines per language, in the order the game decrypted them: the input for pairing a Japanese script with its translation.
function corpus(gameDir){const out={ja:[],zh:[]};for(const d of collect(gameDir))for(const l of d.lines)out[d.lang].push(l);return out;}

// Writes each document as UTF-8 text to outDir (named after its source), so readers that take plain script files can open
// them like files from the game folder. Returns the written paths.
function exportTexts(gameDir,outDir){fs.mkdirSync(outDir,{recursive:true});const used=new Set(),written=[];
 for(const d of collect(gameDir)){let base=path.basename(String(d.source||'memory').replace(/\\/g,'/')).replace(/[<>:"|?*]/g,'_')||'memory';
  let name=`${base}.${d.how}.${d.lang}.txt`;for(let i=2;used.has(name.toLowerCase());i++)name=`${base}.${d.how}.${d.lang}.${i}.txt`;used.add(name.toLowerCase());
  const file=path.join(outDir,name);fs.writeFileSync(file,d.text,'utf8');written.push(file);}
 return written;}

module.exports={root,key,dirFor,enable,disable,enabled,disabled,entries,decode,lines,collect,corpus,exportTexts,_internal:{lang}};
