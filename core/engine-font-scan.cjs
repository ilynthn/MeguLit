// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E503 engine font readers for engines that never draw text through Windows (the E498 GDI/DirectWrite probe sees nothing
   there): Unity (Mono and IL2CPP; UGUI Font and TextMeshPro source fonts), MAGES (STEINS;GATE: a glyph atlas only) and
   Ren'Py (gui.text_font). Everything is read from the game's files, read-only, nothing is injected.
   Unity: a Font object keeps the whole TTF/OTF in m_FontData (a length-prefixed byte array), and a TMP_FontAsset keeps its
   source font the same way when the developer left "include font data" on; both are found by the sfnt header inside the
   serialized files (.assets, level*, AssetBundles through services/original-engines/unityfs.cjs). The dialogue font is the
   Japanese one (kana + kanji coverage) that is not a localisation font for another language (KR / SC / TC names) and not a
   decorative face (pixel, pop, hand-written); TMP assets with only an SDF atlas give their "<Name> SDF" names, looked up
   among the game's and Windows' fonts. MAGES: FONT.PNG in system.mpk is a pre-rendered atlas, no outline font ships; its
   stroke contrast (horizontal stroke thickness / vertical stroke thickness) tells mincho from gothic. Ren'Py: gui.rpy /
   options.rpy (loose, compiled .rpyc, or inside .rpa archives) name the font file. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {tables,cmap}=require('./font-map.cjs');
const {allNames,familyName}=require('./game-fonts.cjs');

/* --- sfnt inside a buffer --- */
function sfntEnd(b,o){
 if(o+12>b.length)return 0;const tag=b.readUInt32BE(o);if(tag!==0x00010000&&tag!==0x4f54544f)return 0;
 const n=b.readUInt16BE(o+4);if(n<4||n>48||b.readUInt16BE(o+6)!==16*(1<<Math.floor(Math.log2(n))))return 0;
 let end=0;const tags=[];for(let i=0;i<n;i++){const r=o+12+i*16;if(r+16>b.length)return 0;const t=b.toString('latin1',r,r+4);if(!/^[A-Za-z0-9 \/]{4}$/.test(t))return 0;tags.push(t);end=Math.max(end,b.readUInt32BE(r+8)+b.readUInt32BE(r+12));}
 return tags.includes('cmap')&&tags.includes('name')&&end>=1024?end:0;}
const SIGS=[Buffer.from([0,1,0,0]),Buffer.from('OTTO')];
/* every embedded font of a buffer: Unity writes the array length just before the data, which is the exact size */
function fontsIn(b){const out=[];for(const sig of SIGS){let p=0;while((p=b.indexOf(sig,p))>=0){const end=sfntEnd(b,p);if(end){const pre=p>=4?b.readUInt32LE(p-4):0;const len=pre>=end&&pre<end+8&&p+pre<=b.length?pre:end;if(p+len<=b.length){out.push(b.subarray(p,p+len));p+=len;continue;}}p++;}}return out;}
/* the same over a large file, chunk by chunk */
function fontsInFile(file,limit=2**31){const out=[];let fd;try{fd=fs.openSync(file,'r');const size=Math.min(fs.fstatSync(fd).size,limit),CH=64<<20,OV=1024;
 for(let at=0;at<size;at+=CH){const n=Math.min(CH+OV,size-at),b=Buffer.alloc(n);fs.readSync(fd,b,0,n,at);
  for(const sig of SIGS){let p=0;while((p=b.indexOf(sig,p))>=0&&p<CH){const end=p+800<=n?sfntEnd(b,p):0;if(end){const pre=p>=4?b.readUInt32LE(p-4):0;const len=pre>=end&&pre<end+8?pre:end;if(len<=80<<20&&at+p+len<=size){const f=Buffer.alloc(len);fs.readSync(fd,f,0,len,at+p);out.push(f);}}p++;}}}
 }catch{}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}return out;}

function coverage(buf){let kana=0,kanji=0,hangul=0;try{const m=cmap(tables(buf));for(let c=0x3041;c<0x30fb;c++)if(m.has(c))kana++;for(let c=0x4e00;c<0x9fa0;c+=1)if(m.has(c))kanji++;for(let c=0xac00;c<0xac00+400;c++)if(m.has(c))hangul++;}catch{}return {kana,kanji,hangul};}
const OTHER_LANG=/(^|[^a-z])(kr|korean|sc|tc|hk|cn|chs|cht|gb|big5|hans|hant)([^a-z]|$)|简|繁|體|韓|한|仿宋|黑体|宋体|楷体|Source Han (Sans|Serif) (K|SC|TC|HC)\b/i;
const JP_NAME=/(^|[^a-z])(jp|ja|jpn|japanese)([^a-z]|$)|日本|ゴシック|明朝|mincho|gothic|ming|go$/i;
const DECOR=/pixel|pop|tegaki|手書|hand|dos|vga|cute|comic|brush|毛筆|ポップ|雑|marker|pen|kids|chalk|grunge|ドット|dot|8x|12x|mplus10|10$/i;
/* score of one font as the dialogue font; null when it cannot draw Japanese text */
function score(names,cov,hint=''){
 if(cov.kana<80||cov.kanji<1500)return null;const all=names.join(' ')+' '+hint;
 if(OTHER_LANG.test(all)&&!JP_NAME.test(all))return null;
 return (JP_NAME.test(all)?20:0)-(DECOR.test(all)?30:0)+Math.min(cov.kanji,21000)/1000;}
function candidate(buf,source,hint=''){const names=allNames(buf),cov=coverage(buf),s=score(names,cov,hint);return {family:familyName(buf)||names[0]||'',names,source,score:s,...cov,data:buf};}

/* --- Unity --- */
function unityData(root){try{for(const n of fs.readdirSync(root))if(/_Data$/i.test(n)&&fs.existsSync(path.join(root,n,'globalgamemanagers')))return path.join(root,n);}catch{}return '';}
function walk(dir,test,max=4000,out=[]){let list;try{list=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}for(const e of list){if(out.length>=max)break;const f=path.join(dir,e.name);if(e.isDirectory())walk(f,test,max,out);else if(test(e.name,f))out.push(f);}return out;}
/* "<Name> SDF" TMP font asset names (length-prefixed strings) */
function sdfNames(buf){const out=new Set();const re=/([A-Za-z0-9][A-Za-z0-9 _\-+.]{2,60}?)[ _-]SDF/g;const s=buf.toString('latin1');let m;while((m=re.exec(s))&&out.size<64)out.add(m[1].trim());return [...out];}
function unity(root,data){
 const ufs=require('../services/original-engines/unityfs.cjs');const found=[],sdf=new Set();
 const serialized=fs.readdirSync(data).filter(n=>/^(resources\.assets|sharedassets\d+\.assets|level\d+|globalgamemanagers\.assets)$/i.test(n)).map(n=>path.join(data,n));
 for(const f of serialized){for(const b of fontsInFile(f))found.push(candidate(b,path.basename(f)));}
 const stream=path.join(data,'StreamingAssets');let bundles=walk(stream,(n,f)=>/\.bundle$|\.unity3d$|\.ab$/i.test(n)&&/font|tmp/i.test(path.relative(stream,f)),200);
 if(!bundles.length&&!found.some(c=>c.score!==null))bundles=walk(stream,n=>/\.bundle$|\.unity3d$/i.test(n),400).filter(f=>{try{return fs.statSync(f).size<40<<20;}catch{return false;}});
 let budget=1.5*(1<<30);
 for(const f of bundles){let size=0;try{size=fs.statSync(f).size;}catch{continue;}if(size>200<<20||(budget-=size)<0)continue;let nodes;try{nodes=ufs.read(f);}catch{continue;}
  for(const nd of nodes){const fonts=fontsIn(nd.data);for(const b of fonts)found.push(candidate(Buffer.from(b),path.basename(f),path.basename(f)));if(!/\.res/i.test(nd.name))for(const n of sdfNames(nd.data))sdf.add(n);}}
 if(!found.some(c=>c.score!==null))for(const f of serialized){try{if(fs.statSync(f).size<300<<20)for(const n of sdfNames(fs.readFileSync(f)))sdf.add(n);}catch{}}
 return {found,sdf:[...sdf]};}

/* --- MAGES --- */
function png(buf){if(buf.readUInt32BE(0)!==0x89504e47)throw Error('NOT_PNG');let p=8,w=0,h=0,depth=0,type=0;const idat=[];
 while(p<buf.length){const n=buf.readUInt32BE(p),t=buf.toString('latin1',p+4,p+8),d=buf.subarray(p+8,p+8+n);if(t==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);depth=d[8];type=d[9];}else if(t==='IDAT')idat.push(d);else if(t==='IEND')break;p+=12+n;}
 if(depth!==8||![0,2,4,6].includes(type))throw Error('PNG_FORMAT');const bpp={0:1,2:3,4:2,6:4}[type],raw=zlib.inflateSync(Buffer.concat(idat)),stride=w*bpp,out=Buffer.alloc(w*h),row=Buffer.alloc(stride),prev=Buffer.alloc(stride);
 for(let y=0;y<h;y++){const f=raw[y*(stride+1)],src=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1));
  for(let x=0;x<stride;x++){const a=x>=bpp?row[x-bpp]:0,b=prev[x],c=x>=bpp?prev[x-bpp]:0;let v=src[x];
   if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}row[x]=v&255;}
  for(let x=0;x<w;x++){const o=x*bpp;out[y*w+x]=type===6?row[o+3]:type===4?row[o+1]:type===2?(row[o]+row[o+1]+row[o+2])/3|0:row[o];}row.copy(prev);}
 /* atlases are white glyphs on transparency (alpha) or black on white (grey): ink = the minority side */
 let dark=0;for(let i=0;i<out.length;i+=97)if(out[i]<128)dark++;if(dark<out.length/97/2)for(let i=0;i<out.length;i++)out[i]=255-out[i];
 return {w,h,ink:out};}
/* stroke contrast of a glyph atlas, from anti-aliased ink sums along every other row and column: the median ink of a
   vertical crossing (through horizontal strokes, plus the long runs of mincho's thick ends) over that of a horizontal one.
   Calibrated on GDI renders (2026-11-13): Mincho (MS / Yu / BIZ UD) 1.15-1.84, Gothic (MS / Yu / Meiryo / BIZ UD) 0.58-0.77. */
function strokeStats(img){const {w,h,ink}=img,v=i=>(255-ink[i])/255,hr=[],vr=[];
 const run=(get,len,lines,out)=>{for(let a=0;a<lines;a+=2){let sum=0,n=0;for(let b=0;b<len;b++){const x=get(a,b);if(x>0.08){sum+=x;n++;}else{if(n>0)out.push(sum);sum=0;n=0;}}}};
 run((y,x)=>v(y*w+x),w,h,hr);run((x,y)=>v(y*w+x),h,w,vr);
 const median=a=>{a=a.filter(x=>x>=0.8).sort((x,y)=>x-y);return a[a.length>>1]||0;};const vt=median(vr),ht=median(hr);
 return {horizontalStroke:+vt.toFixed(2),verticalStroke:+ht.toFixed(2),ratio:ht?+(vt/ht).toFixed(3):0};}
function atlasFamily(stats){return stats.ratio>=0.95?'mincho':'gothic';}
function mages(root){const ma=require('../services/original-engines/mages.cjs');const dirs=[root,path.join(root,'USRDIR')];
 for(const d of dirs){const sys=path.join(d,'system.mpk');if(!fs.existsSync(sys))continue;const list=ma._internal.mpkList(sys)||[];
  const e=list.find(x=>/^font\.png$/i.test(x.name))||list.find(x=>/^font.*\.png$/i.test(x.name));if(!e)continue;
  const img=png(ma._internal.mpkRead(sys,e)),stats=strokeStats(img);return {atlas:e.name,size:[img.w,img.h],...stats,family:atlasFamily(stats)};}
 return null;}

/* --- Ren'Py --- */
/* E580 the RPA index, pickle decoder and .rpyc slots come from the Ren'Py script reader (renpy-rpyc.cjs) */
const rpyc=require('../services/original-engines/renpy-rpyc.cjs'),{unpickle,rpaIndex,rpaRead}=rpyc;
/* the font a Ren'Py script assigns to dialogue text: gui.text_font, else style.default.font / gui.default_font */
const FONT_KEYS=['text_font','default_font','interface_text_font','name_text_font'];
function fontsInScript(text){const out=[];for(const key of FONT_KEYS){const re=new RegExp('(?:gui\\.|define\\s+gui\\.|style\\.default\\.)?'+key+'\\s*=\\s*[\'"]([^\'"]+\\.(?:ttf|otf|ttc))[\'"]','gi');let m;while((m=re.exec(text)))out.push({key,file:m[1]});}
 const st=/style\.default\.font\s*=\s*['"]([^'"]+\.(?:ttf|otf|ttc))['"]/i.exec(text);if(st)out.push({key:'default_font',file:st[1]});return out;}
/* compiled .rpyc (RENPY RPC2 slots of zlib pickles): the variable name and its expression string sit next to each other */
function fontsInRpyc(buf){let data=buf;try{data=rpyc.data(buf,{all:true})||buf;}catch{}
 const s=data.toString('latin1'),out=[];for(const key of FONT_KEYS){let i=-1;while((i=s.indexOf(key,i+1))>=0){const m=/['"]([^'"\x00]{1,120}\.(?:ttf|otf|ttc))['"]/i.exec(s.slice(i,i+600));if(m){out.push({key,file:m[1]});break;}}}return out;}
function renpy(root){const game=path.join(root,'game');if(!fs.existsSync(game))return null;const scripts=[],files=new Map(),archives=[];
 for(const f of walk(game,n=>/\.(rpy|rpyc|rpa|ttf|otf|ttc)$/i.test(n),3000)){const rel=path.relative(game,f).replace(/\\/g,'/');if(/\.rpa$/i.test(f))archives.push(f);else if(/\.rpyc?$/i.test(f)){if(/(^|\/)(gui|options|screens|styles?|font[^/]*)\.rpyc?$/i.test(rel))scripts.push({rel,read:()=>fs.readFileSync(f)});}else files.set(rel.toLowerCase(),{rel,read:()=>fs.readFileSync(f)});}
 for(const a of archives){let idx;try{idx=rpaIndex(a);}catch{continue;}if(!idx)continue;for(const [name,e] of idx){const rel=name.replace(/\\/g,'/');if(/(^|\/)(gui|options|screens|styles?|font[^/]*)\.rpyc?$/i.test(rel)&&!scripts.some(s=>s.rel===rel))scripts.push({rel,read:()=>rpaRead(a,e)});else if(/\.(ttf|otf|ttc)$/i.test(rel)&&!files.has(rel.toLowerCase()))files.set(rel.toLowerCase(),{rel,read:()=>rpaRead(a,e)});}}
 /* source .rpy first (what the developer wrote), then compiled */
 scripts.sort((a,b)=>(/\.rpy$/i.test(a.rel)?0:1)-(/\.rpy$/i.test(b.rel)?0:1)||(/gui/i.test(a.rel)?0:1)-(/gui/i.test(b.rel)?0:1));
 const named=[];for(const s of scripts){try{const buf=s.read();named.push(...(/\.rpy$/i.test(s.rel)?fontsInScript(buf.toString('utf8')):fontsInRpyc(buf)));}catch{}}
 named.sort((a,b)=>FONT_KEYS.indexOf(a.key)-FONT_KEYS.indexOf(b.key));
 const resolve=name=>{const n=name.replace(/\\/g,'/').toLowerCase();return files.get(n)||[...files.values()].find(f=>f.rel.toLowerCase().endsWith('/'+n)||path.posix.basename(f.rel).toLowerCase()===path.posix.basename(n));};
 return {named,files:[...files.values()],resolve};}

/* --- entry --- */
function engineOf(root){if(unityData(root))return 'unity';if(['','USRDIR'].some(d=>fs.existsSync(path.join(root,d,'system.mpk'))))return 'mages';if(fs.existsSync(path.join(root,'game'))&&(fs.existsSync(path.join(root,'renpy'))||walk(path.join(root,'game'),n=>/\.(rpa|rpyc)$/i.test(n),1).length))return 'renpy';return '';}
const safe=s=>String(s||'font').replace(/[^\p{L}\p{N}_ -]/gu,'').trim().slice(0,40)||'font';
function save(dir,c,tag){fs.mkdirSync(dir,{recursive:true});const id=crypto.createHash('sha256').update(c.data).digest('hex').slice(0,10);const file=path.join(dir,tag+'-'+safe(c.family)+'-'+id+'.jp'+(c.data.readUInt32BE(0)===0x4f54544f?'.otf':'.ttf'));if(!fs.existsSync(file))fs.writeFileSync(file,c.data);return file;}
/* Scan one game folder. Returns {engine, face, family?, files:[font files to import], reason, candidates} or null. */
function scan(root,cacheDir){const engine=engineOf(root);if(!engine)return null;const dir=path.join(cacheDir,crypto.createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,12));
 if(engine==='unity'){const {found,sdf}=unity(root,unityData(root));const seen=new Set(),list=found.filter(c=>{const k=c.data.length+':'+c.family;if(seen.has(k))return false;seen.add(k);return true;});
  const ranked=list.filter(c=>c.score!==null).sort((a,b)=>b.score-a.score);const candidates=list.map(c=>({family:c.family,source:c.source,kana:c.kana,kanji:c.kanji,score:c.score}));
  if(ranked.length){const best=ranked[0];return {engine,face:best.family,files:[save(dir,best,'unity')],reason:'embedded '+best.source,candidates};}
  const tmp=sdf.filter(n=>!/^(liberation ?sans|arial|tinos)$/i.test(n));const jp=tmp.find(n=>JP_NAME.test(n)&&!OTHER_LANG.test(n))||tmp.find(n=>!OTHER_LANG.test(n)&&!DECOR.test(n));
  return jp?{engine,face:jp.replace(/[-_ ](regular|medium|bold|r|m|b)$/i,'').replace(/([a-z])([A-Z])/g,'$1 $2'),files:[],reason:'tmp sdf name',candidates,sdf:tmp}:{engine,face:'',files:[],reason:'no japanese font',candidates,sdf:tmp};}
 if(engine==='mages'){const m=mages(root);if(!m)return {engine,face:'',files:[],reason:'no atlas'};/* E532: the closest installed face, drawn glyph by glyph against the atlas (core/mages-font.cjs + services/font-match.ps1);
   the stroke-ratio family stays the fallback when nothing installed scores >= 0.8. */
  let near={face:''};try{const mf=require('./mages-font.cjs'),job=mf.sample(root);if(job)near={...mf.closest(mf.matchSync(job,dir)),size:job.cell};}catch{}
  return {engine,face:near.face||'',family:m.family,bold:near.face?near.bold:undefined,size:near.size,files:[],reason:'atlas '+m.atlas+' stroke ratio '+m.ratio.toFixed(2)+(near.face?' ~ '+near.face+' '+near.score:''),atlas:m,candidates:near.candidates};}
 if(engine==='renpy'){const r=renpy(root);if(!r)return null;for(const n of r.named){const f=r.resolve(n.file);if(!f)continue;let buf;try{buf=f.read();}catch{continue;}const c=candidate(buf,f.rel);if(c.kana<80)continue;return {engine,face:c.family,files:[save(dir,c,'renpy')],reason:'gui.'+n.key+' = '+n.file,named:r.named};}
  /* no script names a Japanese font: the Japanese font file the game ships (game-fonts' own scan imports loose ones) */
  for(const f of r.files){let buf;try{buf=f.read();}catch{continue;}const c=candidate(buf,f.rel);if(c.score===null)continue;return {engine,face:c.family,files:[save(dir,c,'renpy')],reason:'bundled '+f.rel,named:r.named};}
  return {engine,face:'',files:[],reason:'no japanese font',named:r.named};}
 return null;}
/* cached per game folder (a Unity scan reads hundreds of MB once) */
function cached(root,cacheDir){const file=path.join(cacheDir,'engine-font-scan.json');let all={};try{all=JSON.parse(fs.readFileSync(file,'utf8'))||{};}catch{}const key=root.toLowerCase();const hit=all[key];
 if(hit&&hit.version===2&&(hit.files||[]).every(f=>fs.existsSync(f)))return hit;const result=scan(root,cacheDir);if(!result)return null;const keep={version:2,...result};
 try{fs.mkdirSync(cacheDir,{recursive:true});all[key]=keep;fs.writeFileSync(file,JSON.stringify(all,null,1));}catch{}return keep;}
/* run in a worker thread so the reader service keeps answering while hundreds of MB are read */
function inWorker(root,cacheDir){return new Promise(resolve=>{try{const {Worker}=require('node:worker_threads');const w=new Worker(__filename,{workerData:{engineFontScan:{root,cacheDir}}});let done=false;const end=v=>{if(!done){done=true;resolve(v);}};w.once('message',end);w.once('error',()=>end(null));w.once('exit',()=>end(null));}catch{resolve(null);}});}
{const wt=require('node:worker_threads');if(!wt.isMainThread&&wt.workerData&&wt.workerData.engineFontScan){const {root,cacheDir}=wt.workerData.engineFontScan;let r=null;try{r=cached(root,cacheDir);}catch{}wt.parentPort.postMessage(r);}}
module.exports={inWorker,scan,cached,engineOf,sfntEnd,fontsIn,score,strokeStats,atlasFamily,png,unpickle,fontsInScript,fontsInRpyc,sdfNames};
