// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs');
const kit=require('./kit.cjs');
const siglusSource=require('./siglus-source.cjs');
const siglusKey=require('./siglus-key.cjs');
const path=require('node:path');

/* SiglusEngine Scene*.pck reader (compiled scenes without an exe key, plus OS-section .ss sources).
   Format references (read, not copied): Jirehlov/SiglusSceneScriptUtility (Unlicense OR 0BSD; pck.py, const.py, disam.py).
   - Compiled scenes when header[21] (scn_data_exe_angou_mod) == 0: XOR with EASY_ANGOU_CODE, decompress via siglus-source
     lzss (kit.lzDistance), decode UTF-16LE strings XORed by (0x7087 * index) & 0xffff, then walk CD_PUSH(20, sid) followed
     by CD_NAME(50) / CD_TEXT(49) in bytecode order.
   - OS-section .ss sources via siglus-source.cjs (works even when scn_data_exe_angou_mod != 0; no exe key needed).
   - When scn_data_exe_angou_mod != 0 the scenes carry a second 16-byte XOR (exe_el): siglus-key.cjs finds it from 暗号.dat,
     the SiglusEngine exe, or the scenes themselves (known plaintext). Only when all three fail, and no OS .ss sources exist,
     unsupported() reports SIGLUS_EXE_KEY. */
const EASY_ANGOU_CODE=Buffer.from('70f8a6b0a1a5284fb52f48fae1e94bdeb74f62958be00380e7cf0f6b9201ebf8a288ce630438d26d8cd28876a792718f4eb68d017988830af9e92cdb67db9114d59a4e79172308960e1d15f9a5a06f5817c8a946da22fffd871242fba9b8676c916764f9d11ee450646ff20bde40e747f103cc2aad7f3421a06426986ced69f4b523086e7d92f6eb93f07a895ef9f87aafe8a948c2ac116b2b33a7400ddc7da75bcfc831d177528d82ac41b873a54f267c0f39da5b374adea4490b7c17a343ae77066473c043a3185a0f9f024c7e8b019f2dae725413ff96ae0b3458cfe30078bee3f561e4877cfc80afc48d463a5dd036bce5607768084fbbabe27807e873bf','hex');
const STRING_XOR_MULT=0x7087,PACK_HDR_SIZE=92,SCN_HDR_SIZE=132;
const {stat}=require('./file-key.cjs');
const memo=new Map();

function parseHeader(buf,totalSize=buf.length){
 if(!buf||buf.length<PACK_HDR_SIZE)return null;
 const v=i=>buf.readUInt32LE(i*4),hs=v(0);
 if(hs<PACK_HDR_SIZE||hs>totalSize)return null;
 const h={hs,scnNameIdxOfs:v(13),scnNameCnt:v(14),scnNameStrOfs:v(15),scnDataIdxOfs:v(17),scnDataCnt:v(18),scnDataOfs:v(19),exeAngouMod:v(21),osHeaderSize:v(22)};
 if(h.scnDataIdxOfs+h.scnDataCnt*8>totalSize||h.scnNameIdxOfs+h.scnNameCnt*8>totalSize||h.scnDataOfs>totalSize)return null;
 return h;
}
function isSiglusDat(buf){
 if(!buf||buf.length<SCN_HDR_SIZE)return false;
 const v=i=>buf.readUInt32LE(i*4),hs=v(0);
 if(hs<SCN_HDR_SIZE||hs>buf.length)return false;
 const [scnOfs,scnSize,strIdxOfs,strCnt,strListOfs]=[v(1),v(2),v(3),v(4),v(5)];
 return scnOfs<=buf.length&&scnOfs+scnSize<=buf.length&&strIdxOfs+strCnt*8<=buf.length&&strListOfs<=buf.length;
}
function decodeSceneNames(buf,h){
 const names=[];
 for(let i=0;i<h.scnNameCnt;i++){
  const so=buf.readUInt32LE(h.scnNameIdxOfs+i*8),sl=buf.readUInt32LE(h.scnNameIdxOfs+i*8+4);
  const start=h.scnNameStrOfs+so*2,end=start+sl*2;
  names.push(end<=buf.length?buf.subarray(start,end).toString('utf16le'):'');
 }
 return names;
}
/* scene i with the easy layer removed (exe layer still on), or null when out of range / zeroed (partial probe copies) */
function sceneBlob(buf,h,i){
 const a=buf.readInt32LE(h.scnDataIdxOfs+i*8),s=buf.readInt32LE(h.scnDataIdxOfs+i*8+4);
 if(a<0||s<=8||h.scnDataOfs+a+s>buf.length)return null;
 const raw=buf.subarray(h.scnDataOfs+a,h.scnDataOfs+a+s);
 if(raw.subarray(0,16).every(x=>!x))return null;
 return kit.xor(raw,EASY_ANGOU_CODE);
}
function compiledScenes(buf,h,exeKey=null){
 const names=decodeSceneNames(buf,h),out=[];
 for(let i=0;i<h.scnDataCnt;i++){
  try{
   let c=sceneBlob(buf,h,i);if(!c)continue;
   if(exeKey)c=kit.xor(c,exeKey);
   const dat=siglusSource._internal.lzss(c);
   if(!isSiglusDat(dat))continue;
   const name=(names[i]||('scene'+i))+'.dat';
   out.push({name,read:()=>dat});
  }catch{}
 }
 return out;
}
const angouFiles=dir=>kit.names(dir).filter(n=>/^暗号\.dat$/i.test(n)).map(n=>path.join(dir,n));
/* exe_el for an encrypted pack: 暗号.dat (packed source or beside the pck), the engine exe, then known plaintext */
function sceneKey(file,buf,h,angou=angouFiles(path.dirname(file))){
 const blobs=[];for(let i=0;i<h.scnDataCnt&&blobs.length<64;i++){try{const c=sceneBlob(buf,h,i);if(c)blobs.push(c);}catch{}}
 if(!blobs.length)return null;
 const fits=k=>{if(!k)return false;let ok=0;for(const c of blobs.slice(0,3)){try{if(isSiglusDat(siglusSource._internal.lzss(kit.xor(c,k))))ok++;else return false;}catch{return false;}}return ok>0;};
 const dir=path.dirname(file),tried=[];
 try{for(const s of siglusSource.sources(file))if(/(^|[\\/])暗号\.dat$/i.test(s.name))tried.push(['angou',siglusKey.angouDatKey(s.raw)]);}catch{}
 try{for(const f of angou)tried.push(['angou',siglusKey.angouDatKey(fs.readFileSync(f))]);}catch{}
 for(const [source,k] of tried)if(fits(k))return {key:k,source};
 for(const f of siglusKey.exeCandidates(dir)){try{const k=siglusKey.exeKey(fs.readFileSync(f));if(fits(k))return {key:k,source:'exe'};}catch{}}
 const k=siglusKey.solveKey(blobs,{check:isSiglusDat});
 return fits(k)?{key:k,source:'plaintext'}:null;
}
function parseCompiledDat(buf){
 if(!isSiglusDat(buf))return {lines:[],anchors:[]};
 const v=i=>buf.readUInt32LE(i*4);
 const scnOfs=v(1),scnSize=v(2),strIdxOfs=v(3),strCnt=v(4),strListOfs=v(5);
 const strs=[];
 for(let si=0;si<strCnt;si++){
  const o=buf.readUInt32LE(strIdxOfs+si*8),l=buf.readUInt32LE(strIdxOfs+si*8+4);
  const start=strListOfs+o*2,end=start+l*2;
  if(end>buf.length){strs.push('');continue;}
  const raw=Buffer.from(buf.subarray(start,end));
  const k=(STRING_XOR_MULT*si)&0xffff;
  for(let m=0;m<raw.length;m+=2)raw.writeUInt16LE(raw.readUInt16LE(m)^k,m);
  strs.push(raw.toString('utf16le'));
 }
 const scn=buf.subarray(scnOfs,scnOfs+scnSize),lines=[],speakers=[];
 let speaker='';
 for(let p=0;p+10<=scn.length;p++){
  if(scn[p]===2&&scn.readInt32LE(p+1)===20){
   const sid=scn.readInt32LE(p+5),nextOp=scn[p+9];
   if(sid<0||sid>=strs.length)continue;
   if(nextOp===50){speaker=strs[sid];p+=9;}
   else if(nextOp===49){if(strs[sid]){lines.push(strs[sid]);speakers.push(speaker);}speaker='';p+=13;}
  }
 }
 if(buf.namae instanceof Map)for(let i=0;i<speakers.length;i++)if(buf.namae.has(speakers[i]))speakers[i]=buf.namae.get(speakers[i]);
 return speakers.some(Boolean)?{lines,anchors:[],speakers}:{lines,anchors:[]};
}

function parseSs(buf){
 const lines=[],speakers=[];
 siglusSource.walkSs(kit.decodeText(buf),(_,items)=>{
  for(const {text,speaker} of items){lines.push(text);speakers.push(speaker);}
 });
 return speakers.some(Boolean)?{lines,anchors:[],speakers}:{lines,anchors:[]};
}

function namaeMap(f,exeKey){
 const m=new Map();if(!f)return m;
 let t='';try{const b=fs.readFileSync(f);t=siglusKey.gameexeText(b,b.length>=8&&b.readInt32LE(4)===0?null:exeKey);}catch{}
 for(const line of t.split(/\r?\n/)){const r=line.match(/^\s*#NAMAE\s*=\s*"([^"]*)"\s*,\s*"([^"]*)"/);if(r&&r[1]&&r[2]&&!m.has(r[1]))m.set(r[1],r[2]);}
 return m;
}
function loadPck(dir){
 const file=siglusSource.scenePck(dir);
 if(!file)return null;
 const packDir=path.dirname(file),gameexe=siglusKey.gameexeFile(packDir),angou=angouFiles(packDir);
 const key=JSON.stringify([stat(file),gameexe&&[gameexe,stat(gameexe)],angou.map(f=>[f,stat(f)])]),cached=memo.get(file);
 if(cached?.key===key)return cached.val;
 let res={file,hdr:null,scenes:[]};
 try{
  const buf=fs.readFileSync(file),h=parseHeader(buf);
  res.hdr=h;
  if(h){
   if(h.exeAngouMod===0&&h.scnDataCnt>0)res.scenes=compiledScenes(buf,h);
   else if(h.scnDataCnt>0){const k=sceneKey(file,buf,h,angou);if(k){res.key=k;res.scenes=compiledScenes(buf,h,k.key);}}
   /* #NAMAE "tag","shown name": compiled scenes name speakers by tag (吉野＿体験版); the window shows the second column */
   if(res.scenes.length){const namae=namaeMap(gameexe,res.key?.key||null);if(namae.size)res.scenes=res.scenes.map(sc=>({name:sc.name,read:()=>{const d=sc.read();d.namae=namae;return d;}}));}
   if(!res.scenes.length&&h.osHeaderSize>0)res.scenes=siglusSource.sources(file).filter(s=>/\.ss$/i.test(s.name)).map(s=>({name:s.name,read:()=>s.raw}));
  }
 }catch{}
 memo.set(file,{key,val:res});if(memo.size>8)memo.delete(memo.keys().next().value);
 return res;
}

const engine={
 id:'siglus-pck',hint:'Scene.pck',
 scenes(dir){return loadPck(dir)?.scenes||[];},
 archives:()=>[],
 sources(dir){const f=siglusSource.scenePck(dir);return f?[f]:[];},
 parse:buf=>isSiglusDat(buf)?parseCompiledDat(buf):parseSs(buf),
 test:()=>false,
 voiceLines:dir=>siglusSource.voiceLines(dir),
 unsupported(dir){
  const f=siglusSource.scenePck(dir);if(!f)return '';
  let h=null;try{const head=kit.readAt(f,0,PACK_HDR_SIZE),sz=kit.size(f);h=parseHeader(head,sz);}catch{}
  if(!h||h.exeAngouMod===0)return '';
  return loadPck(dir)?.scenes.length?'':'SIGLUS_EXE_KEY';
 },
 REASONS:{SIGLUS_EXE_KEY:'这个 SiglusEngine 游戏的 Scene.pck 用了按作品的 exe 密钥加密，从 exe 和剧本本身都没能取到密钥（或 Scene.pck 不完整），暂时读不了'},
 gameexe(dir){const pck=siglusSource.scenePck(dir),f=siglusKey.gameexeFile(pck?path.dirname(pck):dir);if(!f)return '';try{const b=fs.readFileSync(f);if(b.readInt32LE(4)===0)return siglusKey.gameexeText(b,null);return siglusKey.gameexeText(b,loadPck(dir)?.key?.key||null);}catch{return '';}},
};
module.exports={engine,parseHeader,isSiglusDat,compiledScenes,sceneKey,parseCompiledDat,parseSs,_internal:{EASY_ANGOU_CODE}};
