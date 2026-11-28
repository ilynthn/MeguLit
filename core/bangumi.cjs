// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 (owner: 作品和游戏社介绍加一个来源 Bangumi) the one owner of Bangumi (bgm.tv) lookups for library games and developers:
   the work's Chinese name, introduction, cover, score and developer, and a developer's introduction.
   - Search: the legacy search API (api.bgm.tv/search/subject, type 4 = games). The v0 search and v0 subject answer nothing for an
     R18 work without a user token (サクラノ詩 and 喫茶ステラと死神の蝶 come back empty / 404), and most galgames are R18, so v0 is only
     asked for the developer field of a work it does show.
   - Matching is strict: a Bangumi entry counts only when its Japanese name or its Chinese name equals one of the names we already know
     for the work (VNDB's original name first, then VNDB's other names, then the library's), compared without spaces, punctuation and
     width. Bangumi keeps no VNDB id, so the VNDB id reaches Bangumi through VNDB's names. Two different entries with the same name are
     no match. A near name (サクラノ詩 10th Anniversary edition for サクラノ詩) is no match. Nothing is better than another work's text.
   - Bangumi's API rules: a User-Agent naming the app and its home page, one request at a time with a gap, answers cached by the
     callers (config/synopsis.json for works, config/seed-producers.json for developers). A request gives up after 5 s, so a slow
     connection falls back to the next source instead of holding the page. Only work and developer names are sent. */
const UA='ilynthn/MeguLit (https://github.com/ilynthn/MeguLit)';
const API='https://api.bgm.tv',GAP=1100,TIMEOUT=5000,MAX_TEXT=1500;
const SOURCE='Bangumi';
let queue=Promise.resolve(),lastAt=0;
/* one request at a time, at least `gap` ms after the previous one; JSON or null for "not found"; throws on a network error */
function ask(url,{fetcher=globalThis.fetch,timeout=TIMEOUT,gap=GAP,method='GET',body}={}){
 const run=async()=>{
  const wait=lastAt+gap-Date.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));
  try{
   const r=await fetcher(url,{method,headers:{'User-Agent':UA,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout)});
   if(r.status===404)return null;if(!r.ok)throw Error('BANGUMI_HTTP_'+r.status);
   const j=await r.json();return j&&typeof j==='object'&&!(j.code===404&&j.error)?j:null;
  }finally{lastAt=Date.now();}
 };
 const job=queue.then(run,run);queue=job.catch(()=>{});return job;
}
const fold=s=>decode(s).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
function decode(s){return String(s||'').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(m,e)=>{e=e.toLowerCase();if(e[0]==='#')return String.fromCodePoint(e[1]==='x'?parseInt(e.slice(2),16):Number(e.slice(1)));return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[e]??m;});}
function clean(s){
 const t=decode(s).replace(/\r\n?/g,'\n').split('\n').map(x=>x.trim()).join('\n').replace(/\n{3,}/g,'\n\n').trim();
 if(t.length<=MAX_TEXT)return t;const cut=t.slice(0,MAX_TEXT),end=Math.max(cut.lastIndexOf('\n'),cut.lastIndexOf('。'));return (end>MAX_TEXT/2?cut.slice(0,end+1):cut).trim()+'…';
}
/* 'zh' when the opening reads as Chinese (almost no kana), else 'ja': many Bangumi game entries carry the Japanese official story text */
function language(text){const head=String(text||'').slice(0,200),kana=(head.match(/[぀-ヿ]/g)||[]).length,han=(head.match(/\p{Script=Han}/gu)||[]).length;return han>=10&&kana<=Math.max(2,han*0.08)?'zh':'ja';}
const https=u=>{const s=String(u||'');return /^https?:\/\/lain\.bgm\.tv\//i.test(s)?s.replace(/^http:/i,'https:'):'';};
const names=list=>{const seen=new Set(),out=[];for(const n of list||[]){const v=String(n||'').trim();const k=fold(v);if(v&&k.length>=2&&!seen.has(k)){seen.add(k);out.push(v);}}return out;};
/* the one entry whose name or Chinese name equals a known name; names are tried in order, and the first name that equals any entry
   decides: one entry is the match, two or more is no match */
function pick(list,known,keys=s=>[s.name,s.name_cn]){
 for(const n of known.map(fold)){
  const hits=new Map();for(const s of list||[])if(s&&s.id!=null&&keys(s).some(k=>k&&fold(k)===n))hits.set(String(s.id),s);
  if(hits.size===1)return [...hits.values()][0];if(hits.size>1)return null;
 }
 return null;
}
const infoValue=v=>Array.isArray(v)?v.map(x=>typeof x==='string'?x:x?.v).filter(Boolean).join(' / '):String(v||'');
/* the work: {id,url,name,nameCn,text,lang,cover,score,votes,developer,source} or null (no entry that matches, or the network failed) */
async function work(titles,options={}){
 const known=names(titles);if(!known.length||!(options.fetcher||globalThis.fetch))return null;
 try{
  for(const query of known.slice(0,4)){
   const r=await ask(API+'/search/subject/'+encodeURIComponent(query)+'?type=4&responseGroup=large&max_results=10',options);
   const hit=pick((r?.list||[]).filter(s=>Number(s.type)===4),known);if(!hit)continue;
   const id=String(hit.id);let developer='';
   try{const s=await ask(API+'/v0/subjects/'+id,options);const box=(s?.infobox||[]).find(i=>/^(开发|游戏开发商|开发商)$/.test(i?.key));developer=infoValue(box?.value).slice(0,120);}catch{}
   const text=clean(hit.summary);
   return {id,url:'https://bgm.tv/subject/'+id,name:decode(hit.name).slice(0,200),nameCn:decode(hit.name_cn).slice(0,200),text,lang:language(text),
    cover:https(hit.images?.large||hit.images?.common),score:Number(hit.rating?.score)||0,votes:Number(hit.rating?.total)||0,developer,source:SOURCE};
  }
 }catch(error){if(options.raise)throw error;}
 return null;
}
/* a developer (a Bangumi "person" of type 2, a company) whose name equals one of the names: {id,url,name,summary} or null.
   Both lookups answer null when the network fails, or throw with {raise:true} so a caller can tell "none" from "not asked". */
async function company(list,options={}){
 const known=names(list);if(!known.length||!(options.fetcher||globalThis.fetch))return null;
 try{
  for(const query of known.slice(0,3)){
   const r=await ask(API+'/v0/search/persons?limit=10',{...options,method:'POST',body:{keyword:query}});
   const hit=pick((r?.data||[]).filter(p=>Number(p.type)===2),known,p=>[p.name]);if(!hit)continue;
   const id=String(hit.id);return {id,url:'https://bgm.tv/person/'+id,name:decode(hit.name).slice(0,120),summary:decode(hit.summary).replace(/\r\n?/g,'\n')};
  }
 }catch(error){if(options.raise)throw error;}
 return null;
}
module.exports={work,company,pick,language,clean,fold,UA,SOURCE,_reset(){queue=Promise.resolve();lastAt=0;}};
