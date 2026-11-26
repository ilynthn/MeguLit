// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* #1110 Weblio as a lookup source: the public word pages of Weblio 国語辞典 (www.weblio.jp/content/<word>) and Weblio 日中中日辞典
   (cjjc.weblio.jp/content/<word>), fetched on demand like MOJi. Only public pages, no sign-in, nothing bypassed: every request
   first checks the host's robots.txt (cached a day; a missing robots.txt allows, an unreachable one blocks) and refuses a
   disallowed path. Requests are gentle: one per host at least GAP_MS apart, the same word in flight is shared, answers are cached
   (memory + data/config/weblio-cache.json, 7 days, misses 1 day; only the parsed text is kept, never the page). The page is reduced
   to the dictionary blocks between Weblio's <!--開始 name--> / <!--終了 name--> markers: headword, reading and plain-text body. */
const fs=require('node:fs'),path=require('node:path');
const SITES={
 kokugo:{label:'Weblio 国語辞典',origin:'https://www.weblio.jp',path:'/content/'},
 cjjc:{label:'Weblio 日中中日辞典',origin:'https://cjjc.weblio.jp',path:'/content/'}
};
const AGENT='MeguLit-dictionary';
const USER_AGENT=AGENT+'/1.0 (+https://megulit.com)';
const TTL=7*864e5,MISS_TTL=864e5,ROBOTS_TTL=864e5,GAP_MS=1500,TIMEOUT=8000,MAX_CACHE=400,MAX_PAGE=4*1024*1024;
const SKIP=/ウィキペディア|Wikipedia|Wiktionary|例文|作品名|索引/i;
const memory=new Map(),inflight=new Map(),robots=new Map(),slots=new Map();

/* ---------- HTML → text ---------- */
const ENTITY={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',middot:'·',hellip:'…',mdash:'—',ndash:'–',laquo:'«',raquo:'»'};
const decode=s=>String(s||'').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,e)=>e[0]==='#'?(()=>{const n=e[1]==='x'||e[1]==='X'?parseInt(e.slice(2),16):Number(e.slice(1));return n>0&&n<0x110000?String.fromCodePoint(n):'';})():ENTITY[e.toLowerCase()]??m);
function plain(html,max=1500){
 const text=String(html||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|noscript|iframe|ins)\b[\s\S]*?<\/\1>/gi,'')
  .replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|li|tr|h\d|dd|dt|table|ol|ul)>/gi,'\n').replace(/<(p|div|li|tr|dd|dt)\b[^>]*>/gi,'\n').replace(/<\/(span|td|b)>/gi,'$& ')
  .replace(/<[^>]+>/g,'');
 return decode(text).split('\n').map(l=>l.replace(/[ \t 　]+/g,' ').trim()).filter(Boolean).join('\n').slice(0,max);
}
function headword(raw){
 const head=plain(raw,120).replace(/\n/g,' ').trim(),bracket=head.match(/^(.*?)【([^】]+)】/);
 if(bracket)return {spelling:bracket[2].split(/[・／/]/)[0].trim(),reading:bracket[1].replace(/[・‐\-]/g,'').trim()};
 return {spelling:head,reading:''};
}
/* One Weblio page → [{dictionary, entries:[{spelling, reading, text}]}] in page order; encyclopedia / example blocks are left out */
function parse(html,kind='kokugo'){
 const out=[],re=/<!--\s*開始\s*([^>]*?)\s*-->([\s\S]*?)<!--\s*終了/g;let m;
 while((m=re.exec(String(html||'')))&&out.length<4){
  const name=plain(m[1],60).replace(/\n/g,' ');if(!name||SKIP.test(name))continue;
  const entries=[];
  for(const part of m[2].split(/<h2\b[^>]*class="?midashigo"?[^>]*>/i).slice(1,4)){
   const end=part.search(/<\/h2>/i);if(end<0)continue;const head=headword(part.slice(0,end));if(!head.spelling)continue;
   let text=plain(part.slice(end).replace(/<div\b[^>]*class="?kijiFoot"?[\s\S]*$/i,''));let reading=head.reading;
   text=text.replace(/^読み方[：:\s]\s*([^\n]+)\n?/,(x,r)=>{reading||=r.trim();return '';});
   if(kind==='cjjc')text=text.replace(/\n中国語品詞[\s\S]*$/,'').replace(/中国語訳\s*([^\n]+)\nピンイン\s*([^\n]+)/g,'$1（$2）').replace(/^中国語訳\s*/gm,'').replace(/^解説\s*/gm,'　').replace(/^ピンイン\s*/gm,'');
   if(text)entries.push({spelling:head.spelling,reading:reading&&reading!==head.spelling?reading:'',text});
  }
  if(entries.length)out.push({dictionary:name,entries});
 }
 return out;
}
const rowsOf=(blocks,kind,word)=>blocks.flatMap(b=>b.entries.map(e=>({spelling:e.spelling,reading:e.reading,pron:e.reading,definition:e.text,source:'weblio',site:kind,
 dictionary:SITES[kind].label+' · '+b.dictionary,url:SITES[kind].origin+SITES[kind].path+encodeURIComponent(word)})));

/* ---------- robots.txt ---------- */
/* The group for our agent (or *), Allow / Disallow by longest match with * and $; a tie allows. */
function robotsAllows(text,pathname,agent=AGENT){
 const groups=[];let current=null,rules=false;
 for(const raw of String(text||'').split(/\r?\n/)){const line=raw.replace(/#.*$/,'').trim();const m=line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);if(!m)continue;const field=m[1].toLowerCase(),value=m[2].trim();
  if(field==='user-agent'){if(!current||rules){current={agents:[],rules:[]};groups.push(current);rules=false;}current.agents.push(value.toLowerCase());}
  else if((field==='allow'||field==='disallow')&&current){rules=true;current.rules.push({allow:field==='allow',path:value});}}
 const name=agent.toLowerCase(),own=groups.filter(g=>g.agents.some(a=>a!=='*'&&name.includes(a))),list=(own.length?own:groups.filter(g=>g.agents.includes('*'))).flatMap(g=>g.rules);
 let best=null;
 for(const rule of list){if(!rule.path)continue;const pattern=new RegExp('^'+rule.path.replace(/[.+?^{}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\\\$$|\$$/,'$'));
  if(!pattern.test(pathname))continue;const len=rule.path.length;if(!best||len>best.len||(len===best.len&&rule.allow))best={len,allow:rule.allow};}
 return best?best.allow:true;
}
async function robotsFor(origin,fetcher,timeout,now){
 const hit=robots.get(origin);if(hit&&now-hit.at<ROBOTS_TTL)return hit.text;
 let text='';
 try{const res=await fetcher(origin+'/robots.txt',{headers:{'user-agent':USER_AGENT,accept:'text/plain'},redirect:'follow',signal:AbortSignal.timeout(timeout)});
  if(res.ok)text=String(await res.text()).slice(0,200000);else if(res.status>=500)throw Error('WEBLIO_UNAVAILABLE');}
 catch(error){throw Error(/timeout|abort/i.test(String(error?.name||'')+error?.message)?'WEBLIO_TIMEOUT':'WEBLIO_UNAVAILABLE');}
 robots.set(origin,{at:now,text});return text;
}

/* ---------- cache, spacing ---------- */
const cacheFile=root=>root?path.join(root,'data','config','weblio-cache.json'):'';
let disk=null,diskRoot='';
function load(root){if(disk&&diskRoot===root)return disk;diskRoot=root;disk={};try{const f=cacheFile(root);if(f)disk=JSON.parse(fs.readFileSync(f,'utf8'))||{};}catch{disk={};}return disk;}
function save(root){const f=cacheFile(root);if(!f||!disk)return;try{const keys=Object.keys(disk);if(keys.length>MAX_CACHE)for(const k of keys.sort((a,b)=>disk[a].at-disk[b].at).slice(0,keys.length-MAX_CACHE))delete disk[k];
 fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f+'.tmp',JSON.stringify(disk));fs.renameSync(f+'.tmp',f);}catch{}}
async function spaced(origin){const now=Date.now(),next=slots.get(origin)||0,wait=Math.max(0,next-now);slots.set(origin,Math.max(next,now)+GAP_MS);if(wait)await new Promise(r=>setTimeout(r,wait));}

async function fetchSite(kind,word,fetcher,options){
 const site=SITES[kind],pathname=site.path+encodeURIComponent(word),timeout=options.timeout||TIMEOUT;
 if(!robotsAllows(await robotsFor(site.origin,fetcher,timeout,options.now||Date.now()),pathname))throw Error('WEBLIO_BLOCKED');
 if(!options.noThrottle)await spaced(site.origin);
 let res;
 try{res=await fetcher(site.origin+pathname,{headers:{'user-agent':USER_AGENT,accept:'text/html','accept-language':'ja,zh-CN;q=0.8'},redirect:'follow',signal:AbortSignal.timeout(timeout)});}
 catch(error){throw Error(/timeout|abort/i.test(String(error?.name||'')+error?.message)?'WEBLIO_TIMEOUT':'WEBLIO_UNAVAILABLE');}
 if(res.status===404)return [];
 if(!res.ok)throw Error('WEBLIO_UNAVAILABLE');
 if(res.url&&!/^https:\/\/([a-z0-9-]+\.)*weblio\.jp\//i.test(res.url))throw Error('WEBLIO_UNAVAILABLE');
 const html=String(await res.text()).slice(0,MAX_PAGE);
 return rowsOf(parse(html,kind),kind,word);
}
async function cachedSite(kind,word,fetcher,options){
 const key=kind+'|'+word.normalize('NFKC'),now=options.now||Date.now();
 const hit=memory.get(key)||load(options.root||'')[key];
 if(hit&&Array.isArray(hit.items)&&now-hit.at<(hit.items.length?TTL:MISS_TTL)){memory.set(key,hit);return hit.items;}
 if(inflight.has(key))return inflight.get(key);
 const job=(async()=>{const items=await fetchSite(kind,word,fetcher,options),entry={at:Date.now(),items};
  memory.set(key,entry);if(memory.size>MAX_CACHE)memory.delete(memory.keys().next().value);
  if(options.root){load(options.root)[key]=entry;save(options.root);}return items;})().finally(()=>inflight.delete(key));
 inflight.set(key,job);return job;
}
/* Both dictionaries by default (日中 first for the Chinese interface); English asks only the 国語辞典. One failing site still returns
   the other's rows; both failing throws the first error (WEBLIO_TIMEOUT / WEBLIO_UNAVAILABLE / WEBLIO_BLOCKED). */
async function lookupWeblio(query,fetcher=fetch,options={}){
 const word=typeof query==='string'?query.trim().slice(0,60):'';if(!word)return [];
 const sites=(Array.isArray(options.sites)?options.sites:options.language==='en'?['kokugo']:['cjjc','kokugo']).filter(k=>SITES[k]);
 const settled=await Promise.allSettled(sites.map(kind=>cachedSite(kind,word,fetcher,options)));
 const rows=settled.flatMap(s=>s.status==='fulfilled'?s.value:[]);
 if(!rows.length){const failed=settled.find(s=>s.status==='rejected');if(failed)throw failed.reason;}
 return rows.slice(0,12);
}
const MESSAGES={WEBLIO_TIMEOUT:'Weblio 响应超时，请稍后再试',WEBLIO_UNAVAILABLE:'暂时连不上 Weblio，请检查网络后重试',WEBLIO_BLOCKED:'Weblio 的 robots.txt 不允许读取这个页面'};
const message=error=>MESSAGES[String(error?.message||error)]||MESSAGES.WEBLIO_UNAVAILABLE;
function _reset(){memory.clear();inflight.clear();robots.clear();slots.clear();disk=null;diskRoot='';}
module.exports={lookupWeblio,parse,plain,headword,robotsAllows,message,SITES,USER_AGENT,GAP_MS,_reset};
