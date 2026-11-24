// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E355 Naninovel (Unity) games with official localization (Steam 魔法少女ノ魔女裁判 / manosaba). The localization
   bundles (StreamingAssets/aa/StandaloneWindows64/*-localization-<lang>-scripts-*.bundle, UnityFS + LZ4) hold one
   "localization document" per scenario script:
     # 0101Adv29_Narrative001
     ; 見張りのためか、看守はよく玄関ホールに立っている。<br>いつのっそりと…
     看守经常会来玄关大厅这边巡逻站岗。<br>
     它什么时候悄悄出现在这里都不出奇。
   The "; " line is the source (a "; > Name: |#id|" line is the speaker command and is skipped), the plain lines after it
   are the translation. Simplified Chinese is preferred, then Traditional, then any other localization.
   E449 The first line names both languages: "; Chinese (T) <zh-TW> to Japanese (Japan) <ja-JP> localization document
   for `01_Main` naninovel script" (夏色四葉草: written in Chinese, documents kept as TextAssets in resources.assets,
   Resources/Naninovel/Localization/<lang>/Scripts). When the source is not Japanese, the Japanese text is the
   translation side of the document into Japanese, and the Chinese is the translation into Simplified (else
   Traditional) Chinese, or the source itself when that is Chinese; blocks are matched by their "# id". */
const fs=require('node:fs'),path=require('node:path'),unityfs=require('./unityfs.cjs');
const memo=new Map();
const {stat}=require('./file-key.cjs');
function dataDirs(dir){
 let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return [];}
 const result=[];
 for(const entry of entries){
  if(!/_Data$/i.test(entry.name))continue;
  const data=path.join(dir,entry.name);
  if(entry.isDirectory()){result.push(data);continue;}
  if(!entry.isSymbolicLink())continue;
  // Unity reads the original player's data through this junction when MeguLit launches a shadow.
  try{
   const manifest=path.join(dir,'megulit-shadow.json'),info=fs.lstatSync(manifest);
   if(!info.isFile()||info.size>4096)continue;
   const {game,exe}=JSON.parse(fs.readFileSync(manifest,'utf8'));
   if(!path.isAbsolute(game)||exe!==path.basename(exe)||!/^.+\.exe$/i.test(exe)||entry.name.toLowerCase()!==path.parse(exe).name.toLowerCase()+'_data')continue;
   if(!fs.statSync(path.join(dir,exe)).isFile()||!fs.statSync(path.join(game,exe)).isFile())continue;
   const source=path.join(game,entry.name),target=fs.realpathSync(data);
   if(fs.lstatSync(source).isDirectory()&&path.relative(fs.realpathSync(source),target)==='')result.push(target);
  }catch{}
 }
 return result;
}
function bundleDir(dir){for(const d of dataDirs(dir)){const b=path.join(d,'StreamingAssets','aa','StandaloneWindows64');if(fs.existsSync(b))return b;}return '';}
const isJa=l=>/^(?:ja(?:$|-|jp$|panese$)|jpn?$)/.test(l),isZh=l=>/^(?:zh|(?:cn|chs|cht)(?:$|-))/.test(l);
const isLocalizationBundle=f=>/-localization-[a-z-]+-scripts-.*\.bundle$/i.test(f)&&!/-scripts-debug/i.test(f);
function localizationBundles(dir){const d=bundleDir(dir);if(!d)return [];let files;try{files=fs.readdirSync(d);}catch{return [];}
 const loc=files.filter(isLocalizationBundle);if(!loc.length)return [];
 const lang=f=>((/-localization-([a-z-]+?)-scripts-/i.exec(f)||[])[1]||'').toLowerCase();
 const order=['zhhans','zh-hans','zhcn','zh-cn','zh','chs','cn','zhhant','zh-hant','zhtw','zh-tw','cht'];const langs=[...new Set(loc.map(lang))].sort((a,b)=>((order.indexOf(a)+1)||99)-((order.indexOf(b)+1)||99));
 const primary=loc.filter(f=>lang(f)===langs[0]).sort(),extraJa=isJa(langs[0])?[]:loc.filter(f=>lang(f)!==langs[0]&&isJa(lang(f))).sort();
 return [...primary,...extraJa].map(f=>path.join(d,f));}
const DOC=Buffer.from('localization document for');
// Serialized files of the player that hold localization documents as TextAssets (resources.assets, sharedassets*).
function assetFiles(dir){const out=[];for(const d of dataDirs(dir)){let names;try{names=fs.readdirSync(d);}catch{continue;}
 for(const n of names)if(/^(?:resources|sharedassets\d+)\.assets$/i.test(n)){const f=path.join(d,n);if(docsIn(f).length)out.push(f);}}
 return out;}
const HEAD=/^(?:; )?(?:.*?<([A-Za-z_-]+)>\s+to\s+.*?<([A-Za-z_-]+)>\s+)?.*?localization document for [`']([^`']+)[`']\s*([^\r\n]*)/;
// The documents in one buffer: { name, src, dst, script, text }. A document is a length-prefixed UTF-8 string starting
// with its "; ... localization document for" line.
// Newer Naninovel keeps a document as a parsed script asset: the header is a string of its own, the lines follow as
// managed references (LabelScriptLine, CommentScriptLine, GenericTextScriptLine ...) and the printed text sits in the
// PrintText commands after them: type name, namespace, assembly, script name, then the text. Their texts, in order.
const U8=new TextDecoder('utf-8',{fatal:true});
function printed(b,from,to){const out=[];let p=from&~3;const str=q=>{if(q+4>to)return null;const n=b.readUInt32LE(q);if(n<1||n>20000||q+4+n>to)return null;const raw=b.subarray(q+4,q+4+n);for(const c of raw)if(c<9||(c>13&&c<32))return null;try{return {s:U8.decode(raw),next:(q+4+n+3)&~3};}catch{return null;}};
 const toks=[],at=[],ends=[];while(p<to){const r=str(p);if(r){toks.push(r.s);at.push(p);ends.push(r.next);p=r.next;}else p+=4;}
 const comments=[],lines=new Map(),texts=[],registry=[],bounds=[],scripts=[];let firstRid=-1;
 const u32=q=>q+4<=to?b.readUInt32LE(q):-1;
 for(let i=0;i+3<toks.length;i++){
  if(toks[i+1]==='Naninovel.Commands'&&toks[i+2]==='Elringus.Naninovel.Runtime'){if(i+4>=toks.length)break;if(firstRid<0&&at[i]>=8)firstRid=u32(at[i]-8);registry.push(toks[i]==='PrintText'?toks[i+4]:null);if(toks[i]==='PrintText'){out.push(toks[i+4]);scripts.push(toks[i+3]);}continue;}
  if(toks[i+1]!=='Naninovel'||toks[i+2]!=='Elringus.Naninovel.Runtime')continue;
  const line=u32(ends[i+2]);
  // The source line of each block ("Author: text"), after the CommentScriptLine type, its line number and its hash.
  if(toks[i]==='CommentScriptLine'){const k=/^[0-9a-f]{8}$/.test(toks[i+3])?i+4:i+3;comments.push(toks[k]||'');lines.set(line,{comment:toks[k]||''});if(line>=0)bounds.push(line);}
  else if(toks[i]==='LabelScriptLine'){if(line>=0)bounds.push(line);}
  // A text line: line number, hash, then how many commands it plays and their reference ids.
  // Read from the bytes, not the strings: u32 line, u32 hash length + hash (aligned), u32 command count.
  else if(toks[i]==='GenericTextScriptLine'){const q=ends[i+2],hl=u32(q+4);if(hl<0||hl>64)continue;const n=u32(q+8+((hl+3)&~3));if(n<0||n>64)continue;texts.push({line,count:n});}}
 // Each text line: what it prints (through its command references) and the comment just before it.
 // The commands are stored in the order of the lines that play them, so each text line takes its count in turn.
 const byLine=[];let next=0;for(const x of texts.sort((a,c)=>a.line-c.line)){const t=registry.slice(next,next+x.count).filter(s=>typeof s==='string');next+=x.count;const c=lines.get(x.line-1);byLine.push({line:x.line,text:t.join(''),comment:c&&c.comment!=null?c.comment:null});}
 if(next!==registry.length)byLine.length=0;
 out.comments=comments;out.byLine=byLine.sort((a,c)=>a.line-c.line);out.commentLines=[...lines].sort((a,c)=>a[0]-c[0]).map(([line,v])=>({line,text:v.comment}));out.bounds=bounds.sort((a,c)=>a-c);out.scripts=scripts;return out;}
function scan(b,out,{blocksOnly=false,check=()=>{}}={}){let at=0;
 while((at=b.indexOf(DOC,at))>=0){
  check();
  let start=at;const min=blocksOnly?Math.max(0,at-1024):0;
  while(start>min&&b[start-1]>=0x20)start--;
  at+=DOC.length;
  if(start<4)continue;const n=b.readUInt32LE(start-4);if(n<DOC.length||start+n>b.length)continue;
  if(blocksOnly&&(start===min&&min>0||n>2<<20))continue;
  const text=b.toString('utf8',start,start+n),m=HEAD.exec(text.split('\n',1)[0]);if(!m)continue;
  const doc={name:path.basename(m[3])+'.nani',rawName:m[3],src:(m[1]||'ja').toLowerCase().replace(/_/g,'-'),dst:(m[2]||'').toLowerCase().replace(/_/g,'-'),script:!/managed text/i.test(m[4]),text};
  if(!blocksOnly&&doc.script&&!/\n# /.test(text)){const next=b.indexOf(DOC,at),end=next<0?Math.min(b.length,start+n+4e6):next;doc.prints=printed(b,start+n,end);
   // E450 entries by document line (source comment at L, translation at L + 1), so pairing never shifts at a gap
   try{doc.entries=require('./naninovel-voice.cjs').docEntries(b,start+n,end);}catch{doc.entries=null;}}
  out.push(doc);}
 return out;}
function docsIn(file){const key=file+'|'+stat(file);if(memo.has(key))return memo.get(key);const out=[];
 try{if(/\.bundle$/i.test(file))for(const node of unityfs.read(file))scan(node.data,out);else scan(fs.readFileSync(file),out);}catch{}
 memo.set(key,out);return out;}
const tidy=t=>t.replace(/<br>\s*/gi,'\n').replace(/<\/?[a-z][^>]*>/gi,'').replace(/\r/g,'').trim();
// Blocks of a document: Map id -> {src:[...], dst:[...]}.
function blocks(text){const out=new Map();
 for(const block of text.replace(/\r/g,'').split(/\n(?=# )/)){const m=/^# (\S+)/.exec(block);if(!m)continue;const src=[],dst=[];
  let voice=null;for(const l of block.split('\n').slice(1)){if(!l.trim())continue;if(l.startsWith('; >')){const v=/^; >\s*[^@\s:][^:]*:\s*\|#([\w.\-]+)\|/.exec(l); /* "> Name: |#id|" only, not "> @choice |#id|" */if(v)voice=v[1];continue;}if(l.startsWith('; '))src.push(l.slice(2));else if(!l.startsWith(';'))dst.push(l);}
  out.set(m[1],{src,dst,voice});}
 return out;}
const ZH=['zh-cn','zh-hans','zh','zh-sg','chs','cn','zh-tw','zh-hant','zh-hk','cht'];
const zhRank=l=>{const i=ZH.indexOf(l);return i<0?(isZh(l)?50:isJa(l)?100:99):i;};
const scriptKey=s=>String(s||'').replace(/\.nani$/i,'').toLowerCase();
const sameScript=(doc,s)=>{const k=scriptKey(s),rn=scriptKey(doc.rawName||doc.name),bn=path.basename(rn);return !!k&&(k===rn||k===bn||path.basename(k)===bn);};
const cleanJaSrc=c=>String(c||'').replace(/^[^\s:：「『（\[、。！？]{1,24}: /,'').replace(/\\([\\\[\]{}":])|\[[^\]\n]*\]/g,(_,e)=>e||'');
const fmtOne=s=>String(s||'').replace(/<br>\s*/gi,'<br>').replace(/\r?\n/g,'<br>');
const fmtSrc=s=>{const o=fmtOne(s);return '; '+(o.startsWith('>')?' '+o:o);};
const fmtDst=s=>{const o=fmtOne(s).trim();return !tidy(o)?'':/^[#;]/.test(o)?' '+o:o;};
const fmtBlock=(id,src,z,meta)=>{const d=fmtDst(z);return '# '+id+'\n'+(meta?'; '+meta+'\n':'')+fmtSrc(src)+(d?'\n'+d:'');};
const stripNonZhDst=text=>text.replace(/\r/g,'').split('\n').filter(l=>!l.trim()||l.startsWith('# ')||l.startsWith(';')).join('\n');
function parsedJaSrc(doc){
 const scripts=doc.prints&&doc.prints.scripts||[];
 if(scripts.length?!scripts.some(s=>sameScript(doc,s)):/^;|[\r\n]/.test(doc.text))return null;
 const hasZh=isZh(doc.dst);
 if(doc.entries&&doc.entries.length){
  const parts=[];let meta='';
  doc.entries.forEach((e,i)=>{
   const raw=String(e.source||'').trimStart();
   if(raw.startsWith('>')){meta=tidy(e.text)?'':raw.trim();return;}
   const src=cleanJaSrc(raw);if(!tidy(src)){meta='';return;}
   parts.push(fmtBlock('e'+i,src,hasZh?e.text:'',meta));meta='';
  });
  if(parts.length)return parts.join('\n\n');
 }
 if(doc.prints){
  const bl=doc.prints.byLine||[],cl=doc.prints.commentLines,bounds=doc.prints.bounds;
  const parts=[];let meta='';
  if(cl&&cl.length){
   cl.forEach((c,i)=>{
    const raw=String(c.text||'').trimStart();
    const nextLine=bounds?bounds.find(x=>x>c.line)??Infinity:(i+1<cl.length?cl[i+1].line:Infinity);
    const texts=bl.length?bl.filter(x=>x.line>c.line&&x.line<nextLine).map(x=>x.text).filter(tidy):[];
    if(raw.startsWith('>')){meta=texts.length?'':raw.trim();return;}
    const src=cleanJaSrc(raw);if(!tidy(src)){meta='';return;}
    parts.push(fmtBlock('p'+i,src,hasZh?texts.join('\n'):'',meta));meta='';
   });
  }else if(doc.prints.comments&&doc.prints.comments.length){
   const rows=[];
   for(const c of doc.prints.comments){
    const raw=String(c||'').trimStart();
    if(raw.startsWith('>')){meta=raw.trim();continue;}
    const src=cleanJaSrc(raw);if(!tidy(src)){meta='';continue;}
    rows.push({src,meta});meta='';
   }
   const zp=hasZh&&doc.prints.length===rows.length?doc.prints:null;
   rows.forEach((r,i)=>parts.push(fmtBlock('p'+i,r.src,zp?zp[i]:'',r.meta)));
  }
  if(parts.length)return parts.join('\n\n');
 }
 return null;
}
// One document per script, written the classic way ("; " Japanese, then the Chinese) so parse() reads every release alike.
function combine(docs){const byName=new Map();for(const d of docs){if(!d.script)continue;const k=d.name.toLowerCase();if(!byName.has(k))byName.set(k,[]);byName.get(k).push(d);}
 const out=[];
 for(const list of byName.values()){
  const jaSrc=list.filter(d=>isJa(d.src)).sort((a,b)=>zhRank(a.dst)-zhRank(b.dst))[0];
  if(jaSrc){out.push({name:jaSrc.name,text:parsedJaSrc(jaSrc)||(isJa(jaSrc.dst)?stripNonZhDst(jaSrc.text):jaSrc.text)});continue;}
  const ja=list.find(d=>isJa(d.dst));if(!ja)continue;
  const zhDoc=list.filter(d=>isZh(d.dst)).sort((a,b)=>zhRank(a.dst)-zhRank(b.dst))[0];
  /* E450 Parsed-asset documents with their entries: each Japanese entry (its source line and the Japanese printed on the
     next document line) meets the Chinese document's entry for the same source line, matched in order as the longest
     common subsequence of the source lines. The Chinese is that entry's translation, else the source line itself when
     the source is Chinese. Pairing by position (below) shifted every later line after an untranslated entry. */
  if(ja.entries&&ja.entries.length){const nv=require('./naninovel-voice.cjs'),je=ja.entries,ze=zhDoc&&zhDoc.entries||[],m=nv.lcs(je.map(e=>e.key),ze.map(e=>e.key));
   const strip=c=>String(c||'').replace(/^[^:：「『（]{1,24}[:：]\s*/,'');
   const parts=je.map((e,i)=>{if(!tidy(e.text))return '';const z=m[i]>=0&&tidy(ze[m[i]].text)?ze[m[i]].text:isZh(ja.src)?strip(e.source):'';return fmtBlock('e'+i,e.text,z);}).filter(Boolean);
   if(parts.length){out.push({name:ja.name,text:parts.join('\n\n')});continue;}}
  // Parsed-asset documents: the printed texts, paired with the Chinese document's when both have as many.
  if(ja.prints){const zp=zhDoc&&zhDoc.prints&&zhDoc.prints.length===ja.prints.length?zhDoc.prints:null;
   // A line the Chinese document left blank falls back to the source when that is Chinese (one block per printed line).
   // The source of each print comes from the Japanese document's own line map (comment before each text line) when
   // every text line there plays one print; else from the comments in order when they are as many as the prints.
   const bl=ja.prints.byLine||[],strip=c=>String(c||'').replace(/^[^\s:：]{1,24}[:：]\s*/,'');
   const src=!isZh(ja.src)?null:bl.length===ja.prints.length&&bl.every(x=>x.comment!=null)?bl.map(x=>strip(x.comment)):ja.prints.comments&&ja.prints.comments.length===ja.prints.length?ja.prints.comments.map(strip):null;
   // A print the Japanese split off a sentence the Chinese keeps whole is blank in the Chinese document (a lone tab or
   // line feed): the neighbouring print holds that sentence's translation.
   const zhAt=i=>zp&&tidy(zp[i]||'')?zp[i]:'';
   const zhOf=i=>zhAt(i)||(src&&tidy(src[i]||'')?src[i]:'')||(zp?zhAt(i-1)||zhAt(i+1):'');
   // Prints that are only whitespace are not lines.
   const parts=ja.prints.map((t,i)=>tidy(t)?fmtBlock('p'+i,t,zhOf(i)):'').filter(Boolean);
   if(parts.length)out.push({name:ja.name,text:parts.join('\n\n')});continue;}
  const jb=blocks(ja.text),zb=zhDoc?blocks(zhDoc.text):null,useSrc=isZh(ja.src);const parts=[];
  for(const [id,b] of jb){if(!b.dst.length)continue;const z=zb?zb.get(id):null;const zh=z&&tidy(z.dst.join('\n'))?z.dst:useSrc?b.src:[];
   parts.push('# '+id+'\n'+b.dst.map(l=>'; '+l).join('\n')+(zh.length?'\n'+zh.join('\n'):''));}
  if(parts.length)out.push({name:ja.name,text:parts.join('\n\n')});}
 return out;}
/* E452 a spoken line names its text id in the source comment ("> Ema: |#0101Adv31_Ema001|"); voices by text id play the
   AudioClip of that name (naninovel-voice.cjs namedClips) */
function parse(buf){const text=Buffer.isBuffer(buf)?buf.toString('utf8'):String(buf),lines=[],zh=[],anchors=[],voices=[];
 for(const [id,b] of blocks(text)){anchors.push(id);if(!b.src.length)continue;lines.push(tidy(b.src.join('\n')));zh.push(tidy(b.dst.join('\n')));voices.push(b.voice||null);}
 return voices.some(Boolean)?{lines,anchors,zh,voices}:{lines,anchors,zh};}
function documents(file){return docsIn(file).filter(d=>d.script);}
const sourcesOf=dir=>{const b=localizationBundles(dir);return b.length?b:assetFiles(dir);};
const naninovel={
 id:'naninovel',hint:'<游戏>_Data\\StreamingAssets\\aa 或 resources.assets（本地化剧本）',
 scenes(dir){const out=new Map();for(const d of combine(sourcesOf(dir).flatMap(docsIn)))if(!out.has(d.name.toLowerCase()))out.set(d.name.toLowerCase(),{name:d.name,read:()=>Buffer.from(d.text,'utf8')});
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));},
 archives:()=>[],
 sources:sourcesOf,
 parse,test:()=>false,
 // E450 voices: auto-voice clips aligned to the printed lines (naninovel-voice.cjs)
 voiceLines:dir=>require('./naninovel-voice.cjs').voiceLines(dir),
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
 _internal:{dataDirs,bundleDir,documents,localizationBundles,isLocalizationBundle,tidy,combine,scan,blocks},
};
module.exports=naninovel;
