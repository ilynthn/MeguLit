// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Builds runtime\dictionaries\jmdict.json, jmdict.english.json and jmdict-furigana.json from the official sources, so the
   dictionary is the current EDRDG release instead of the 2026-10 copy the runtime pack carried.

     node tools/build-jmdict.cjs <out folder> [--previous <folder with the old jmdict.json>] [--cache <download folder>]

   Sources (downloaded into --cache when missing, never committed):
     JMdict_e.gz           http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz (EDRDG, CC BY-SA 4.0)
     JmdictFurigana.txt    https://github.com/Doublevil/JmdictFurigana/releases/latest (CC BY-SA 4.0, built from the same JMdict)

   The entry shape stays what core/learning-native.cjs and core/reading.cjs read (id, spellings, readings, definitions, pos,
   priority, kana_only, ke_inf, re_inf, re_restr, re_nokanji, misc, freq_rank; pos / misc / priority sorted, kana_only when a
   sense is usually written in kana, as before), so an old runtime keeps working; added:
     ke_pri / re_pri   the priority tags of each spelling and each reading (the entry-level priority is their union)
     senses            one per JMdict sense: pos, misc, field, dial, stagk, stagr, info (and gloss in the English file)
   The Chinese definitions come from the previous jmdict.json by entry id (they are one per sense); an entry new in this
   release has the English glosses of each sense and definitions_lang 'en'. freq_rank is kept by id too; a new entry gets its
   nf## band (nf01 = 500) or the old "unranked" value. jmdict-furigana.json maps "spelling|reading" to JmdictFurigana's
   alignment ("0-1:いつ;3:ま") for every spelling with two kanji in a row, where the kanji cannot be told apart by okurigana. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const args=process.argv.slice(2),flag=name=>{const i=args.indexOf(name);return i>=0?args.splice(i,2)[1]:'';};
const previous=flag('--previous'),cache=flag('--cache')||path.join(require('node:os').tmpdir(),'megulit-jmdict');
const out=args[0];if(!out)throw Error('usage: node tools/build-jmdict.cjs <out folder> [--previous <folder>] [--cache <folder>]');
const SOURCES={jmdict:'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz',furigana:'https://github.com/Doublevil/JmdictFurigana/releases/latest/download/JmdictFurigana.txt'};
const UNRANKED=211874;

async function fetchTo(url,file){
 if(fs.existsSync(file)&&fs.statSync(file).size>0)return file;
 const res=await fetch(url,{redirect:'follow'});if(!res.ok)throw Error(url+' → HTTP '+res.status);
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.part',Buffer.from(await res.arrayBuffer()));fs.renameSync(file+'.part',file);return file;
}
const unescape=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
const all=(xml,tag)=>{const r=[],re=new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+tag+'>','g');let m;while((m=re.exec(xml)))r.push(m[1]);return r;};
const has=(xml,tag)=>new RegExp('<'+tag+'\\s*/>').test(xml);
const code=s=>s.replace(/^&|;$/g,'');

function parse(text,entities){
 const entries=[];
 for(const body of all(text,'entry')){
  const id=Number(all(body,'ent_seq')[0]);
  const k=all(body,'k_ele').map(x=>({keb:unescape(all(x,'keb')[0]),inf:all(x,'ke_inf').map(code),pri:all(x,'ke_pri')}));
  const r=all(body,'r_ele').map(x=>({reb:unescape(all(x,'reb')[0]),nokanji:has(x,'re_nokanji'),restr:all(x,'re_restr').map(unescape),inf:all(x,'re_inf').map(code),pri:all(x,'re_pri')}));
  let pos=[];const senses=all(body,'sense').map(x=>{const own=all(x,'pos').map(p=>entities[code(p)]||code(p));if(own.length)pos=own;
   return {pos,misc:all(x,'misc').map(code),field:all(x,'field').map(code),dial:all(x,'dial').map(code),stagk:all(x,'stagk').map(unescape),stagr:all(x,'stagr').map(unescape),info:all(x,'s_inf').map(unescape),gloss:all(x,'gloss').map(unescape)};});
  entries.push({id,k,r,senses});
 }
 return entries;
}
function shape(e,zh,old){
 const priority=[...new Set([...e.k.flatMap(x=>x.pri),...e.r.flatMap(x=>x.pri)])].sort(),misc=[...new Set(e.senses.flatMap(s=>s.misc))].sort();
 const nf=priority.map(p=>/^nf(\d\d)$/.exec(p)).find(Boolean);
 const base={id:e.id,spellings:e.k.map(x=>x.keb),readings:e.r.map(x=>x.reb),definitions:[],pos:[...new Set(e.senses.flatMap(s=>s.pos))].sort(),priority,kana_only:misc.includes('uk'),
  ke_inf:e.k.map(x=>x.inf),re_inf:e.r.map(x=>x.inf),re_restr:e.r.map(x=>x.restr),re_nokanji:e.r.map(x=>x.nokanji),misc,
  freq_rank:old?.freq_rank??(nf?Number(nf[1])*500:UNRANKED),ke_pri:e.k.map(x=>x.pri),re_pri:e.r.map(x=>x.pri)};
 const meta=s=>{const m={pos:s.pos};for(const key of ['misc','field','dial','stagk','stagr','info'])if(s[key].length)m[key]=s[key];return m;};
 if(!zh)return {...base,definitions:e.senses.flatMap(s=>s.gloss),senses:e.senses.map(s=>({...meta(s),gloss:s.gloss}))};
 if(old?.definitions?.length)return {...base,definitions:old.definitions,senses:e.senses.map(meta)};
 return {...base,definitions:e.senses.map(s=>s.gloss.join('; ')),definitions_lang:'en',senses:e.senses.map(meta)};
}
function furigana(text){
 const map={};
 for(const line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){const [spelling,reading,parts]=line.split('|');if(!parts||!/[\p{Script=Han}々〆ヶ][\p{Script=Han}々〆ヶ]/u.test(spelling))continue;map[spelling+'|'+reading]=parts;}
 return map;
}
(async()=>{
 const gz=await fetchTo(SOURCES.jmdict,path.join(cache,'JMdict_e.gz')),fu=await fetchTo(SOURCES.furigana,path.join(cache,'JmdictFurigana.txt'));
 const text=zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8');
 const created=/JMdict created: (\d{4}-\d\d-\d\d)/.exec(text)?.[1]||'';
 const entities={};for(const m of text.matchAll(/<!ENTITY (\S+) "([^"]*)">/g))entities[m[1]]=m[2];
 const entries=parse(text,entities);
 const old=new Map();if(previous)for(const e of JSON.parse(fs.readFileSync(path.join(previous,'jmdict.json'),'utf8')))old.set(e.id,e);
 fs.mkdirSync(out,{recursive:true});
 const zh=entries.map(e=>shape(e,true,old.get(e.id))),en=entries.map(e=>shape(e,false,old.get(e.id)));
 fs.writeFileSync(path.join(out,'jmdict.json'),JSON.stringify(zh));
 fs.writeFileSync(path.join(out,'jmdict.english.json'),JSON.stringify(en));
 const fmap=furigana(fs.readFileSync(fu,'utf8'));fs.writeFileSync(path.join(out,'jmdict-furigana.json'),JSON.stringify(fmap));
 const info={jmdict:created,entries:entries.length,chineseFromPrevious:zh.filter(e=>!e.definitions_lang).length,englishOnly:zh.filter(e=>e.definitions_lang).length,furigana:Object.keys(fmap).length,sources:SOURCES};
 fs.writeFileSync(path.join(out,'jmdict.version.json'),JSON.stringify(info,null,1));console.log(JSON.stringify(info));
})().catch(e=>{console.error(e.message);process.exit(1);});
