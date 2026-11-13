// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Finds the fonts that ship with the game being played (original Japanese fonts and Chinese patch fonts),
// imports them into ToMe's cache and remembers them per game folder.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFile}=require('node:child_process');
const {repairLegacyFont,tables,cmap}=require('./font-map.cjs');

const SIMPLIFIED=[...'这们说么发书个门来时对过还让给为东车长会马鸟页风飞'].map(c=>c.codePointAt(0));
const FONT_EXT=/\.(ttf|otf|ttc|otc)$/i,MAX_FONT=60*1024*1024,MIN_FONT=16*1024;
// A font collection (.ttc/.otc, common for Japanese fonts) holds several faces sharing tables; each face is copied out
// into a standalone font (its own table directory, 4-byte aligned tables) so it can be classified and registered.
function collectionFaces(buffer){
 if(buffer.length<12||buffer.toString('latin1',0,4)!=='ttcf')return [buffer];const count=Math.min(buffer.readUInt32BE(8),16),faces=[];
 for(let i=0;i<count;i++)try{const at=buffer.readUInt32BE(12+i*4),n=buffer.readUInt16BE(at+4),records=[];
  for(let t=0;t<n;t++){const r=at+12+t*16;records.push({tag:buffer.subarray(r,r+4),sum:buffer.readUInt32BE(r+4),offset:buffer.readUInt32BE(r+8),length:buffer.readUInt32BE(r+12)});}
  let size=12+n*16;for(const r of records)size+=(r.length+3)&~3;const out=Buffer.alloc(size);buffer.copy(out,0,at,at+12);let pos=12+n*16;
  records.forEach((r,t)=>{const e=12+t*16;r.tag.copy(out,e);out.writeUInt32BE(r.sum,e+4);out.writeUInt32BE(pos,e+8);out.writeUInt32BE(r.length,e+12);buffer.copy(out,pos,r.offset,r.offset+r.length);pos+=(r.length+3)&~3;});
  faces.push(out);}catch{}
 return faces;
}
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');

function exePath(pid){
 return new Promise(resolve=>{
  if(!Number.isSafeInteger(Number(pid))||Number(pid)<=0)return resolve('');
  // Output as UTF-8: the console code page (CP932/GBK) would garble Japanese/Chinese folder names.
  execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',`[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; (Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue).Path`],{windowsHide:true,timeout:10000,encoding:'utf8'},(error,out)=>{const p=error?'':String(out||'').replace(/^\uFEFF/,'').trim();resolve(p&&fs.existsSync(p)?fs.realpathSync(p):'');});
 });
}

function allNames(buffer){const out=new Set();try{const n=tables(buffer).get('name');if(!n)return [];const count=n.readUInt16BE(2),strings=n.readUInt16BE(4);
 for(let i=0;i<count;i++){const r=6+i*12,platform=n.readUInt16BE(r),encoding=n.readUInt16BE(r+2),id=n.readUInt16BE(r+6),len=n.readUInt16BE(r+8),off=n.readUInt16BE(r+10);if(id!==1&&id!==4)continue;const raw=n.subarray(strings+off,strings+off+len);let text='';
  if(platform===3&&(encoding===1||encoding===10)){const sw=Buffer.from(raw);sw.swap16();text=sw.toString('utf16le');}else if(platform===1&&encoding===0)text=raw.toString('latin1');else continue;text=text.replace(/\0/g,'').trim();if(text&&text.length<=64)out.add(text);}}catch{}return [...out].slice(0,16);}
function familyName(buffer){
 try{
  const t=tables(buffer),n=t.get('name');if(!n)return '';
  const count=n.readUInt16BE(2),strings=n.readUInt16BE(4),found=[];
  for(let i=0;i<count;i++){
   const r=6+i*12,platform=n.readUInt16BE(r),encoding=n.readUInt16BE(r+2),lang=n.readUInt16BE(r+4),id=n.readUInt16BE(r+6),len=n.readUInt16BE(r+8),off=n.readUInt16BE(r+10);
   if(id!==1&&id!==4)continue;const raw=n.subarray(strings+off,strings+off+len);let text='';
   if(platform===3&&(encoding===1||encoding===10)){const sw=Buffer.from(raw);sw.swap16();text=sw.toString('utf16le');}
   else if(platform===1&&encoding===0)text=raw.toString('latin1');else continue;
   text=text.replace(/\0/g,'').trim();if(!text)continue;
   const rank=(id===1?0:10)+(lang===0x804?0:lang===0x411?1:lang===0x409?2:platform===1?4:3);found.push([rank,text]);
  }
  found.sort((a,b)=>a[0]-b[0]);const name=found.map(x=>x[1]).find(v=>/^[\p{L}\p{N} ._\-()（）・]+$/u.test(v)&&v.length<=40);
  return name||'';
 }catch{return '';}
}

let referenceCache=null;
function reference(){
 if(referenceCache!==null)return referenceCache;
 for(const p of ['C:/Windows/Fonts/simhei.ttf','C:/Windows/Fonts/simsun.ttc'])try{if(p.endsWith('.ttf')){referenceCache=fs.readFileSync(p);return referenceCache;}}catch{}
 referenceCache=false;return referenceCache;
}

// zh = has Simplified Chinese; legacy zh = patch font whose codes must be recovered; ja = kana font
function classify(buffer,hint=''){
 const zhHint=/(chs|cns?\b|zh|[_\- ]sc\b|\bsc[_\- ]|gb|hans|汉化|中文|简体|黑体|宋体|楷体|素晴字体)/i.test(hint),jaHint=/(\bjp\b|jpn|[_\- ]ja\b|日本|ゴシック|明朝|gothic|mincho|ＭＳ|\bjp[_\- ]|cjk jp|\bJP$)/i.test(hint)&&!zhHint;
 let map;try{map=cmap(tables(buffer));}catch{return null;}
 const simplified=SIMPLIFIED.filter(cp=>map.has(cp)).length;let kana=0;for(let cp=0x3041;cp<=0x30fa;cp++)if(map.has(cp))kana++;
 if(jaHint&&kana>=80)return {lang:'ja',legacy:false,data:buffer};
 if(simplified>=12)return {lang:'zh',legacy:false,data:buffer};
 const ref=reference();
 if(ref&&tables(buffer).has('glyf'))try{const fixed=repairLegacyFont(buffer,ref);const has=SIMPLIFIED.filter(cp=>fixed.coverage.has(cp)).length;if(has>=12)return {lang:'zh',legacy:true,data:fixed.buffer};}catch{}
 if(kana>=80)return {lang:'ja',legacy:false,data:buffer};
 return null;
}

function scan(root,depth=4){
 const out=[];const walk=(dir,d)=>{let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
  for(const e of entries.slice(0,600)){const full=path.join(dir,e.name);
   if(e.isDirectory()){if(d<depth&&!/^(save|savedata|savechs|userdata|movie|bgm|voice|se|cg)$/i.test(e.name))walk(full,d+1);}
   else if(FONT_EXT.test(e.name)){try{const s=fs.statSync(full);if(s.size>=MIN_FONT&&s.size<=MAX_FONT)out.push({file:full,size:s.size,mtime:s.mtimeMs});}catch{}}
   if(out.length>=32)return;}};
 walk(root,0);return out;
}

function engineOf(root){
 let names=[];try{names=fs.readdirSync(root);}catch{}
 const has=re=>names.some(n=>re.test(n));let pac=[];try{pac=fs.readdirSync(path.join(root,'pac'));}catch{}
 if(has(/^BGI.*\.exe$/i)||has(/^sysgrp\.arc$/i))return 'BGI';
 if(pac.some(n=>/\.ypf$/i.test(n))||has(/\.ypf$/i)||has(/^yscfg\.dat$/i))return 'YU-RIS';
 if(has(/\.xp3$/i))return 'KiriKiri';
 if(has(/\.pfs$/i))return 'Artemis';
 return '';
}

// E:\GAL\素晴日\素晴らしき日々HD版 -> 素晴日 ; E:\Games\Foo -> Foo
function gameLabel(root){
 const parts=path.resolve(root).split(/[\\/]+/).filter(Boolean);const name=parts[parts.length-1]||'游戏';
 if(parts.length>=4){const parent=parts[parts.length-2];if(parent&&parent.length<=name.length+4&&!/^(games?|gal|galgame|steam|steamapps|common|program files.*)$/i.test(parent))return parent;}
 return name.replace(/[_\- ]?(hd|hd版|高清版)$/i,'')||name;
}

class GameFonts{
 constructor(layout,onChange=()=>{},findExe=exePath){this.findExe=findExe;this.layout=layout;this.manifestFile=path.join(layout.config,'game-fonts.json');this.cacheDir=path.join(layout.cache,'game-fonts');this.onChange=onChange;this.current=null;this.running=null;try{this.manifest=JSON.parse(fs.readFileSync(this.manifestFile,'utf8'))||{};}catch{this.manifest={};}for(const k of Object.keys(this.manifest))if(!this.manifest[k]?.root||!fs.existsSync(this.manifest[k].root))delete this.manifest[k];}
 // Cached copies are found relative to the current cache folder, so renaming or moving ToMe (ToMe.V3 -> ToMe) keeps them.
 fontFile(f){if(f?.file&&fs.existsSync(f.file))return f.file;const moved=f?.file?path.join(this.cacheDir,path.basename(path.dirname(f.file)),path.basename(f.file)):'';return moved&&fs.existsSync(moved)?moved:'';}
 save(){try{fs.writeFileSync(this.manifestFile+'.tmp',JSON.stringify(this.manifest,null,2));fs.renameSync(this.manifestFile+'.tmp',this.manifestFile);}catch{}}
 async detect(pid,force=false){
  if(this.running)return this.running;
  this.running=(async()=>{
   const exe=await this.findExe(pid);if(!exe){this.current={status:'error',message:'没能读取游戏程序位置（游戏是否以管理员身份运行？）'};this.onChange(this.current);return this.current;}
   const root=path.dirname(exe),key=root.toLowerCase();let info=this.manifest[key];
   if(info&&Array.isArray(info.fonts))for(const f of info.fonts){const file=this.fontFile(f);if(file&&file!==f.file){f.file=file;this.save();}}
   if(!info||force||!Array.isArray(info.fonts)||info.fonts.some(f=>!this.fontFile(f))){
    const seen=new Set(),found=scan(root),dir=path.join(this.cacheDir,sha(key).slice(0,12)),fonts=[];fs.mkdirSync(dir,{recursive:true});
    for(const f of found){let file;try{file=fs.readFileSync(f.file);}catch{continue;}const faces=collectionFaces(file);for(let face=0;face<faces.length;face++){const buffer=faces[face];const digest=sha(buffer);if(seen.has(digest))continue;seen.add(digest);const kind=classify(buffer,path.basename(f.file)+' '+familyName(buffer));if(!kind)continue;
     const ext=/\.(ttc|otc)$/i.test(f.file)?(buffer.readUInt32BE(0)===0x4f54544f?'.otf':'.ttf'):(path.extname(f.file).toLowerCase()||'.ttf'),id=sha(f.file.toLowerCase()+'|'+f.size+'|'+f.mtime+'|'+face).slice(0,10),target=path.join(dir,id+ext);
     try{fs.writeFileSync(target,kind.data);}catch{continue;}
     fonts.push({id,lang:kind.lang,legacy:kind.legacy,family:familyName(buffer)||path.basename(f.file,path.extname(f.file)),source:path.relative(root,f.file)+(faces.length>1?'#'+face:''),file:target});}}
    info={root,label:info?.label||gameLabel(root),engine:engineOf(root),exe:path.basename(exe),fonts,scannedAt:Date.now(),autoApplied:force?false:!!info?.autoApplied};
    this.manifest[key]=info;this.save();
   }
   this.current={status:'ready',...info};this.onChange(this.current);return this.current;
  })();
  try{return await this.running;}finally{this.running=null;}
 }
 /* A font the game loaded itself (font probe: AddFontMemResourceEx data saved by the hook, or a private font file outside the
    Windows font folder). Added to the current game's fonts so the reader can use it with FontFace like a bundled font. */
 addFile(file,kind='file'){const c=this.current;if(!c||c.status!=='ready'||!file)return null;let buffer;try{const s=fs.statSync(file);if(!s.isFile()||s.size<MIN_FONT/4||s.size>MAX_FONT)return null;buffer=fs.readFileSync(file);}catch{return null;}
  const key=c.root.toLowerCase(),dir=path.join(this.cacheDir,sha(key).slice(0,12)),added=[];fs.mkdirSync(dir,{recursive:true});
  const faces=collectionFaces(buffer);for(let face=0;face<faces.length;face++){const data=faces[face],id=sha(data).slice(0,10);if(c.fonts.some(f=>f.id===id))continue;
   const names=allNames(data),kind2=classify(data,path.basename(file)+' '+names.join(' '));if(!kind2)continue;
   const target=path.join(dir,id+(data.readUInt32BE(0)===0x4f54544f?'.otf':'.ttf'));try{fs.writeFileSync(target,kind2.data);}catch{continue;}
   const entry={id,lang:kind2.lang,legacy:kind2.legacy,family:familyName(data)||names[0]||path.basename(file,path.extname(file)),names,source:(kind==='mem'?'内存 ':'')+path.basename(file)+(faces.length>1?'#'+face:''),file:target,loaded:kind};
   c.fonts.push(entry);added.push(entry);}
  if(added.length){if(this.manifest[key]){this.manifest[key].fonts=c.fonts;this.save();}this.onChange(this.current);}return added;}
 markApplied(){if(!this.current?.root)return;const key=this.current.root.toLowerCase();if(this.manifest[key]){this.manifest[key].autoApplied=true;this.current.autoApplied=true;this.save();}}
 // What the UI needs: metadata plus font data to register with FontFace.
 payload(withData=true){const c=this.current;if(!c||c.status!=='ready')return c||null;
  return {...c,fonts:c.fonts.map(f=>{let data='';if(withData)try{data=fs.readFileSync(this.fontFile(f)).toString('base64');}catch{}return {id:f.id,lang:f.lang,legacy:f.legacy,family:f.family,names:f.names||[],source:f.source,format:String(this.fontFile(f)||f.file).toLowerCase().endsWith('.otf')?'opentype':'truetype',data};})};}
}
module.exports={GameFonts,classify,familyName,allNames,gameLabel,engineOf,scan,exePath,collectionFaces};
