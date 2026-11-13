// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Script harvest: the whole scenario of a game, gathered while the user plays, whatever the engine. MeguLitDump32/64.dll
// (native/runtimedump) saves every buffer the game decrypts or decompresses and, through seed expansion, the run of text
// around each line the text hook captured (services/runtime-dump.cjs reads that folder). This module turns those buffers
// into one clean script per game:
//   1. lines: split at control bytes and line breaks, engine control codes stripped (ruby kept as its base text),
//      speaker names split off (【名】「…」, 名「…」, a name-only line before a quoted one);
//   2. scenes: each buffer is a run of scenes; label-like ASCII pieces between strings (*scene01, @label, ks/scn names)
//      start a new one; buffers that are copies or parts of another one (seed blocks overlap) are dropped;
//   3. pairing: when a Chinese translation was loaded too (official release or patch), scenes are matched by label, then
//      in order by size, and their lines aligned 1-1 / 1-2 / 2-1 / skip on character length (Gale-Church style);
//   4. report: total / paired / unpaired with a reason per line, saved with the script as harvest.json in the game's dump
//      folder and rebuilt only when the dump grew.
// provider() feeds it to the zero-latency path (services/original-text.cjs falls back to it when a game has no imported
// script) and every line it is asked about is written back to seeds.txt for the DLL to expand. Nothing here touches the
// game; any error just means no harvest.
const fs=require('node:fs'),path=require('node:path'),rd=require('./runtime-dump.cjs');
const VERSION=1;
const CJK=/[぀-ヿ㐀-鿿々〆ー]/g,KANA=/[぀-ヿ]/g;
const count=(s,re)=>(String(s).match(re)||[]).length;
const norm=s=>String(s||'').replace(/[\s　]+/g,'');
// Key used to look a captured line up: no speaker, no punctuation or quotes, no ruby readings.
const keyOf=s=>norm(clean(s).text).replace(/[「」『』（）()【】〈〉《》、。，．・…‥―ー～~！？!?♪☆★♥♡“”"'’‘]/g,'');
const langOf=t=>{const c=count(t,CJK);return c&&count(t,KANA)*10>=c?'ja':'zh';};

// ---- 1. lines -------------------------------------------------------------------------------------------------------
// Engine markup seen across KiriKiri, NScripter, Siglus, BGI, Ren'Py, CatSystem, YU-RIS, Artemis, Unity text assets:
// ruby forms keep their base text; tags, escapes and variables go.
function stripCodes(s){return String(s)
 .replace(/\[ruby[^\]]*text="?([^"\]]*)"?[^\]]*\]([^[]*)\[\/ruby\]/gi,'$2')    // [ruby text=…]base[/ruby]
 .replace(/<r(?:uby)?[^>]*>([^<]*)<(?:rt|\/r)[^>]*>[^<]*(?:<\/rt>)?(?:<\/ruby>)?/gi,'$1')
 .replace(/\[([^\[\]\/|]{1,20})[\/|][^\[\]]{1,30}\]/g,'$1')                     // [漢字/かんじ] [漢字|かんじ]
 .replace(/[|｜]([^|｜《]{1,20})《[^》]{1,30}》/g,'$1').replace(/([一-鿿々]{1,10})《[^》]{1,30}》/g,'$1') // |漢字《かんじ》
 .replace(/≪([^≪≫／]*)／[^≪≫]*≫/g,'$1').replace(/\{([^{}\/:]{1,20})[\/:][^{}]{1,30}\}/g,'$1')
 .replace(/<[^<>]{0,80}>/g,'').replace(/\[[A-Za-z_@\/][^\[\]]{0,80}\]/g,'').replace(/\{[^{}]{0,40}\}/g,'')
 .replace(/\\[A-Za-z]+(\[[^\]]*\])?|\\./g,'').replace(/%[A-Za-z][^;%\s「」]{0,24};|%[A-Za-z0-9]{1,3}/g,'').replace(/[@#$][A-Za-z_][\w]*/g,'')
 .replace(/^[\x20-\x7e]+(?=[^\x00-\x7f])/,'').replace(/[\x00-\x1f\x7f]/g,'').trim();}
const NAME=/^[【\[［(（]?([^「『（(\s。、！？…―「」【】\[\]［］()（）]{1,12})[】\]］)）]?$/u;
// {speaker, text}: 【名】「…」 / 名「…」 split; text keeps its quotes.
function clean(raw){let t=stripCodes(raw),speaker='';
 let m=t.match(/^【([^】]{1,12})】\s*(.+)$/u);
 if(m){speaker=m[1];t=m[2];}else if((m=t.match(/^([^「『（(\s。、！？…―]{1,12})([「『（(].*)$/u))){speaker=m[1];t=m[2];}
 return {speaker,text:t.trim()};}
// Pieces of a decoded buffer: text lines and the ASCII labels between them (scene marks).
function pieces(text){const out=[];
 for(const raw of String(text).split(/[\x00-\x08\x0a-\x1f\x7f]+|\r?\n/)){const p=raw.replace(/\t/g,' ').trim();if(!p||p.includes('�'))continue;
  if(count(p,CJK)>=2)out.push({kind:'line',raw:p});
  else if(/^[*@#]?[A-Za-z_][\w.\-\/]{1,40}$/.test(p)&&/(scene|scn|chap|ep|label|route|^\*|^@|\d{2,})/i.test(p))out.push({kind:'label',raw:p.replace(/^[*@#]/,'')});}
 return out;}
// Lines of one buffer, scene by scene; a name-only line is folded into the quoted line after it.
function scenesOf(doc){const scenes=[];let cur=null,pending='';
 const open=label=>{cur={label:label||'',source:doc.source,lines:[]};scenes.push(cur);};open('');
 for(const p of pieces(doc.text)){
  if(p.kind==='label'){if(cur.lines.length||cur.label)open(p.raw);else cur.label=p.raw;pending='';continue;}
  const c=clean(p.raw);if(count(c.text,CJK)<2&&!c.speaker)continue;
  if(!c.speaker&&NAME.test(c.text)&&!/[「『]/.test(c.text)&&count(c.text,CJK)<=8){pending=c.text.replace(NAME,'$1');continue;}
  if(!c.speaker&&pending&&/^[「『（(]/.test(c.text))c.speaker=pending;pending='';
  if(count(c.text,CJK)<2)continue;cur.lines.push({speaker:c.speaker,text:c.text,lang:langOf(c.text)});}
 return scenes.filter(s=>s.lines.length);}

// ---- 2. collect -----------------------------------------------------------------------------------------------------
// All scenes of a game, per language, copies dropped: a scene whose lines all appear in a larger one is a copy (seed
// blocks overlap the file buffers and each other).
function gather(gameDir){const by={ja:[],zh:[]};
 for(const doc of rd.collect(gameDir))for(const s of scenesOf(doc)){const ja=s.lines.filter(l=>l.lang==='ja').length;s.lang=ja*2>=s.lines.length?'ja':'zh';s.lines=s.lines.filter(l=>l.lang===s.lang||s.lang==='zh');if(s.lines.length)by[s.lang].push(s);}
 for(const lang of ['ja','zh']){const list=by[lang].sort((a,b)=>b.lines.length-a.lines.length),kept=[],seen=new Map();
  for(const s of list){const keys=s.lines.map(l=>keyOf(l.text)).filter(Boolean);const novel=keys.filter(k=>!seen.has(k)).length;
   if(keys.length&&novel/keys.length<0.1)continue;if(novel<keys.length){/* partial overlap: keep only its new lines */const fresh=new Set();s.lines=s.lines.filter(l=>{const k=keyOf(l.text);if(!k||seen.has(k)||fresh.has(k))return false;fresh.add(k);return true;});}
   s.lines.forEach(l=>seen.set(keyOf(l.text),1));if(s.lines.length)kept.push(s);}
  by[lang]=kept.sort((a,b)=>String(a.source).localeCompare(String(b.source))||0);}
 return by;}

// ---- 3. pairing -----------------------------------------------------------------------------------------------------
const size=t=>Math.max(1,count(t,CJK)+count(t,/[A-Za-z0-9]/g)*.5);
// Gale-Church style alignment on character counts: Chinese runs about 0.8x the Japanese length.
function alignLines(ja,zh){const n=ja.length,m=zh.length,R=.8,INF=1e18;
 const cost=(a,b)=>{const d=Math.log((b+1)/(a*R+1));return d*d*4;};
 const D=Array.from({length:n+1},()=>new Float64Array(m+1).fill(INF)),B=Array.from({length:n+1},()=>new Int8Array(m+1));D[0][0]=0;
 const J=i=>size(ja[i].text),Z=j=>size(zh[j].text);
 for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){const d=D[i][j];if(d>=INF)continue;
  const step=(di,dj,c,k)=>{const a=i+di,b=j+dj;if(a<=n&&b<=m&&d+c<D[a][b]){D[a][b]=d+c;B[a][b]=k;}};
  if(i<n&&j<m)step(1,1,cost(J(i),Z(j)),1);
  if(i<n)step(1,0,3,2);if(j<m)step(0,1,3,3);
  if(i+1<n&&j<m)step(2,1,cost(J(i)+J(i+1),Z(j))+1.5,4);if(i<n&&j+1<m)step(1,2,cost(J(i),Z(j)+Z(j+1))+1.5,5);}
 const out=new Array(n).fill(null).map(()=>({zh:'',why:'no-translation-line'}));
 for(let i=n,j=m;i>0||j>0;){const k=B[i][j];
  if(k===1){out[i-1]={zh:zh[j-1].text,why:''};i--;j--;}else if(k===2){i--;}else if(k===3){j--;}
  else if(k===4){out[i-2]={zh:zh[j-1].text,why:''};out[i-1]={zh:'',why:'merged-into-previous'};i-=2;j--;}
  else if(k===5){out[i-1]={zh:zh[j-2].text+zh[j-1].text,why:''};i--;j-=2;}else break;}
 return out;}
// Scenes paired by label, then the rest in order when their sizes agree.
function pairScenes(ja,zh){const pairs=new Map(),used=new Set(),byLabel=new Map();
 zh.forEach((s,i)=>{if(s.label)byLabel.set(s.label.toLowerCase(),i);});
 ja.forEach((s,i)=>{const k=s.label?byLabel.get(s.label.toLowerCase()):undefined;if(k!==undefined&&!used.has(k)){pairs.set(i,k);used.add(k);}});
 let j=0;ja.forEach((s,i)=>{if(pairs.has(i))return;while(j<zh.length&&used.has(j))j++;if(j>=zh.length)return;const r=zh[j].lines.length/s.lines.length;
  if(r>.6&&r<1.6){pairs.set(i,j);used.add(j);j++;}});
 return pairs;}

function build(gameDir){const by=gather(gameDir),pairs=pairScenes(by.ja,by.zh),reasons={};let total=0,paired=0;
 const scenes=by.ja.map((s,i)=>{const k=pairs.get(i),al=k===undefined?null:alignLines(s.lines,by.zh[k].lines);
  const lines=s.lines.map((l,n)=>{const zh=al?al[n].zh:'',why=zh?'':al?al[n].why:by.zh.length?'scene-unmatched':'no-translation-loaded';total++;if(zh)paired++;else reasons[why]=(reasons[why]||0)+1;
   return {speaker:l.speaker,ja:l.text,zh};});
  return {label:s.label,source:s.source,lines};});
 // A game played in Chinese only (no Japanese buffers yet): its lines still count, as unpaired.
 const zhOnly=by.ja.length?0:by.zh.reduce((n,s)=>n+s.lines.length,0);if(zhOnly){reasons['no-japanese-loaded']=zhOnly;}
 return {version:VERSION,gameDir:path.resolve(gameDir),builtAt:Date.now(),scenes,
  report:{total,paired,unpaired:total-paired,reasons,japaneseScenes:by.ja.length,chineseScenes:by.zh.length,chineseLinesWithoutJapanese:zhOnly}};}

// ---- 4. persistence ---------------------------------------------------------------------------------------------
const stamp=gameDir=>{try{const st=fs.statSync(path.join(rd.dirFor(gameDir),'index.jsonl'));return st.size+':'+Math.floor(st.mtimeMs);}catch{return '';}};
const cache=new Map();
// The harvest for a game: from harvest.json when the dump has not grown since, else rebuilt and saved.
function harvest(gameDir,{rebuild=false}={}){const dir=rd.dirFor(gameDir),file=path.join(dir,'harvest.json'),now=stamp(gameDir);
 if(!now)return null;const hit=cache.get(file);if(!rebuild&&hit&&hit.stamp===now)return hit.value;
 let value=null;if(!rebuild){try{const v=JSON.parse(fs.readFileSync(file,'utf8'));if(v.version===VERSION&&v.stamp===now)value=v;}catch{}}
 if(!value){value={...build(gameDir),stamp:now};try{fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);}catch{}}
 cache.set(file,{stamp:now,value});return value;}
const report=gameDir=>{try{return harvest(gameDir)?.report||null;}catch{return null;}};
function brief(gameDir){const r=report(gameDir);if(!r||!r.total)return null;return {total:r.total,paired:r.paired,unpaired:r.unpaired,reasons:r.reasons};}

// Lines MeguLit captured, for the DLL's seed expansion. Capped so a long session cannot grow it without end.
function seed(gameDir,text){try{if(count(text,CJK)<4||rd.disabled?.(gameDir))return;const file=path.join(rd.dirFor(gameDir),'seeds.txt');
  let n=0;try{n=fs.statSync(file).size;}catch{if(!fs.existsSync(path.dirname(file)))return;}if(n>4<<20)return;
  fs.appendFileSync(file,String(text).replace(/[\r\n]+/g,' ')+'\n');}catch{}}

// Zero-latency source for services/original-text.cjs: exact lines by key, with their Chinese when paired.
function provider(gameDir){let index=null,at='';
 const load=()=>{const h=harvest(gameDir);if(!h)return null;if(h.stamp===at&&index)return index;at=h.stamp;index=new Map();let i=0;
  for(const s of h.scenes)for(const l of s.lines){const k=keyOf(l.ja);if(k&&!index.has(k))index.set(k,{...l,i});i++;}return index;};
 return {kind:'patch',source:'harvest',
  resolve(text){seed(gameDir,text);let map=null;try{map=load();}catch{}const hit=map&&map.get(keyOf(text));
   if(!hit)return {status:'none',indices:[]};return {status:'exact',method:'harvest',indices:[hit.i],translation:hit.zh||'',japanese:hit.ja,speaker:hit.speaker,machine:false};},
  near(){return '';}};}

module.exports={harvest,report,brief,seed,provider,build,_internal:{clean,stripCodes,pieces,scenesOf,alignLines,pairScenes,keyOf}};
