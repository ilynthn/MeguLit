// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E660 CIRCUS (VNDB engine "adv32": D.C.～ダ・カーポ～ series, fortissimo, La'cryma, Hon-Pro): scene scripts *.mes, loose
   under AdvData\MES or packed in a .pck / .dat archive. Format facts from msg-tool (lifegpc, GPL-3.0,
   src/scripts/circus/{script,info}.rs and archive/{pck,dat}.rs), the same layout GARbro's Circus/ArcPCK.cs opens:
   MES      i32 head0, i32 head1. head1 == 3 (newer builds): u16 version at head0 * 6 + 4, bytecode from there + 3;
            otherwise u16 version at head0 * 4 + 4, bytecode from there + 2. The version picks one of 31 opcode tables
            (VERSIONS). Every instruction is one opcode byte whose range gives its operands:
              uint8x2  op u8 u8            uint8str op u8 C-string        string op C-string
              encstr   op C-string, every byte stored minus deckey (text)  uint16x4 op u16 u16 u16 u16
            encstr instructions are the lines; the table's name opcode (inside encstr) is the speaker of the next line;
            the "unencrypted text" opcode (inside string) is a plain line. Ruby is ｛漢字／よみ｝.
   PCK      u32 count, count × (u32 offset, u32 size), count × (char name[0x38], u32 offset, u32 size)
   DAT      u32 count, count × (char name[N], u32 offset) with N 0x24, 0x30 or 0x3C, sizes from the next offset; the last
            index entry ends the list (msg-tool reads count - 1 files, the last running to the end of the archive) */
const path=require('node:path');
const kit=require('./kit.cjs');

/* name, version, uint8x2, uint8str, string, encstr, uint16x4 (from, to; 0xFF,0xFF = none), unencrypted text op, deckey,
   name op — msg-tool info.rs SCRIPT_INFO, same order (the first table with a version wins) */
const VERSIONS=[
 ['ffexa',0x7b69,0x0,0x28,0x29,0x2e,0x2f,0x49,0x4a,0x4d,0x4e,0xff,0x43,0x20,0x4b],
 ['ffexs',0x7b6b,0x0,0x28,0x29,0x2e,0x2f,0x4b,0x4c,0x4f,0x50,0xff,0x43,0x20,0x4d],
 ['ef',0x466a,0x0,0x28,0x2a,0x2f,0x30,0x4a,0x4b,0x4e,0x4f,0xff,0x46,0x20,0x4c],
 ['dcos',0x315d,0x0,0x2b,0xff,0xff,0x2c,0x45,0x46,0x49,0x4a,0xff,0x42,0x20,0x47],
 ['ktlep',0x6e69,0x0,0x28,0x29,0x2e,0x2f,0x49,0x4a,0x4d,0x4e,0xff,0x45,0x20,0x4b],
 ['dcws',0x656c,0x0,0x2b,0x2c,0x31,0x32,0x4c,0x4d,0x50,0x51,0xff,0x48,0x20,0x4e],
 ['dcsv',0x636c,0x0,0x2b,0x2c,0x31,0x32,0x4c,0x4d,0x50,0x51,0xff,0x46,0x20,0x4e],
 ['dcpc',0x3d63,0x0,0x2c,0xff,0xff,0x2d,0x49,0x4a,0x4d,0x4e,0xff,0x44,0x20,0x4b],
 ['dcmems',0x315d,0x0,0x2b,0xff,0xff,0x2c,0x45,0x46,0x49,0x4a,0xff,0x42,0x20,0x47],
 ['dcdx',0x7769,0x0,0x28,0x29,0x2e,0x2f,0x49,0x4a,0x4d,0x4e,0xff,0x45,0x20,0x4b],
 ['dcas',0x4e69,0x0,0x28,0x29,0x2e,0x2f,0x49,0x4a,0x4d,0x4e,0xff,0x43,0x20,0x4b],
 ['dcbs',0x3163,0x0,0x2b,0xff,0xff,0x2c,0x48,0x49,0x4c,0x4d,0xff,0xff,0x20,0x4a],
 ['dc2fl',0x9c69,0x0,0x28,0x29,0x2e,0x2f,0x49,0x4a,0x4d,0x4e,0xff,0x45,0x20,0x4b],
 ['dc2bs',0x316c,0x0,0x2b,0x2c,0x31,0x32,0x4c,0x4d,0x50,0x51,0xff,0xff,0x20,0x4e],
 ['dc2dm',0x9d72,0x0,0x29,0x2a,0x31,0x32,0x4c,0x4d,0x50,0x51,0xff,0x44,0x20,0x4e],
 ['dc2fy',0x3866,0x0,0x2e,0xff,0xff,0x2f,0x4b,0x4c,0x4f,0x50,0xff,0x48,0x20,0x4d],
 ['dc2cckko',0x26c,0x0,0x2b,0x2c,0x31,0x32,0x4c,0x4d,0x50,0x51,0xff,0xff,0x20,0x4e],
 ['dc2ccotm',0x16c,0x0,0x2b,0x2c,0x31,0x32,0x4c,0x4d,0x50,0x51,0xff,0xff,0x20,0x4e],
 ['dc2sc',0x3b69,0x0,0x28,0x29,0x2e,0x2f,0x49,0x4a,0x4d,0x4e,0xff,0x45,0x20,0x4b],
 ['dc2ty',0x5f69,0x0,0x28,0x29,0x2e,0x2f,0x49,0x4a,0x4d,0x4e,0xff,0xff,0x20,0x4b],
 ['dc2pc',0x5769,0x0,0x28,0x29,0x2e,0x2f,0x49,0x4a,0x4d,0x4e,0xff,0x45,0x20,0x4b],
 ['dc3rx',0x9772,0x0,0x2b,0x2c,0x33,0x34,0x4e,0x4f,0x52,0x53,0xff,0x45,0x20,0x50],
 ['dc3pp',0x9872,0x0,0x2a,0x2b,0x32,0x33,0x4e,0x4f,0x51,0x52,0xff,0x45,0x20,0x50],
 ['dc3wy',0xa09f,0x0,0x38,0x39,0x41,0x42,0x5f,0x60,0x63,0x64,0xff,0x55,0x20,0x61],
 ['dc3dd',0xa5a8,0x0,0x38,0x39,0x43,0x44,0x62,0x63,0x67,0x68,0xff,0x58,0x20,0x64],
 ['dc4',0xaab6,0x0,0x3a,0x3b,0x47,0x48,0x68,0x69,0x6d,0x6e,0xff,0x5d,0x20,0x6a],
 ['dc4ph',0xabb6,0x0,0x3a,0x3b,0x47,0x48,0x68,0x69,0x6d,0x6e,0xff,0x5d,0x20,0x6a],
 ['ds',0x9f9a,0x0,0x38,0x39,0x4a,0x41,0x5e,0x5f,0x62,0x63,0xff,0x54,0x20,0x60],
 ['dsif',0xa1a1,0x0,0x39,0x3a,0x42,0x43,0x60,0x61,0x64,0x65,0xff,0x56,0x20,0x62],
 ['tmpl',0xa6b4,0x0,0x3b,0x3a,0x46,0x46,0x67,0x68,0x6e,0x6d,0xff,0x5c,0x20,0x69],
 ['nightshade',0x871,0x0,0x2b,0x2c,0x33,0x34,0x4e,0x4f,0x52,0x53,0xff,0x43,0x1,0x50]];
const sec=(a,b)=>a===0xff&&b===0xff?()=>false:op=>op>=a&&op<=b;
const INFO=VERSIONS.map(v=>({name:v[0],version:v[1],u8x2:sec(v[2],v[3]),u8str:sec(v[4],v[5]),string:sec(v[6],v[7]),encstr:sec(v[8],v[9]),u16x4:sec(v[10],v[11]),plain:v[12],key:v[13],nameOp:v[14]}));
const byVersion=v=>INFO.find(i=>i.version===v)||null;

/* the header: {info, code} or null */
function header(b){if(b.length<12)return null;const h0=b.readInt32LE(0),h1=b.readInt32LE(4);if(h0<0||h0>0x1000000)return null;
 const at=h1===3?h0*6+4:h0*4+4;if(at+3>b.length)return null;const info=byVersion(b.readUInt16LE(at));if(!info)return null;return {info,code:at+(h1===3?3:2)};}
const isMes=b=>!!header(b);
/* the instructions: [{op, at, len}] (stops at an unknown opcode, as msg-tool fails there) */
function tokens(b,h){const {info}=h,out=[];let p=h.code;
 const cs=at=>{const z=b.indexOf(0,at);return z<0?b.length:z+1;};
 while(p<b.length){const op=b[p];let end;
  if(info.u8x2(op))end=p+3;else if(info.u8str(op))end=cs(p+2);else if(info.string(op)||info.encstr(op))end=cs(p+1);else if(info.u16x4(op))end=p+9;else break;
  out.push({op,at:p,end:Math.min(end,b.length)});p=end;}
 return out;}
/* ｛漢字／よみ｝ -> 漢字, with the reading kept */
const RUBY=/｛([^／｝]+)／([^｝]*)｝/g;
function parse(b){const h=header(b);if(!h)return {lines:[],anchors:[]};const {info}=h,raw=[],anchors=[];
 for(const t of tokens(b,h)){
  if(info.encstr(t.op)){const s=Buffer.from(b.subarray(t.at+1,t.end-1));for(let i=0;i<s.length;i++)s[i]=(s[i]+info.key)&255;raw.push({s,name:t.op===info.nameOp});continue;}
  if(t.op===info.plain){raw.push({s:b.subarray(t.at+1,t.end-1),name:false});continue;}
  if(info.string(t.op)||info.u8str(t.op)){const s=b.subarray(info.string(t.op)?t.at+1:t.at+2,t.end-1).toString('latin1');if(s&&kit.ascii(s))anchors.push(s);}}
 const dec=kit.decoder(raw.map(r=>r.s)),lines=[],ruby={};
 for(const r of raw){let s=dec.decode(r.s);const pairs=[...s.matchAll(RUBY)].map(m=>[m[1],m[2]]);s=kit.trimBoth(s.replace(RUBY,'$1').replace(/\\n/g,'\n'));if(!s)continue;
  if(pairs.length)ruby[lines.length]=pairs;lines.push(s);}
 return {lines,anchors,ruby,version:info.name};}

/* ---- archives ----------------------------------------------------------------------------------------------------- */
function pckList(file){const sz=kit.size(file);if(sz<16)return null;const b=kit.readAt(file,0,Math.min(sz,8<<20));const n=b.readUInt32LE(0);if(!n||n>0x40000||4+n*8+n*0x40>b.length)return null;
 const out=[];let prev=0;for(let i=0;i<n;i++){const off=b.readUInt32LE(4+i*8),size=b.readUInt32LE(8+i*8),e=4+n*8+i*0x40;
  if(off<prev||off+size>sz||b.readUInt32LE(e+0x38)!==off||b.readUInt32LE(e+0x3c)!==size)return null;prev=off+size;
  const nb=b.subarray(e,e+0x38),z=nb.indexOf(0);const name=kit.cname(nb);if(!name)return null;out.push({name,offset:off,size});}
 return out;}
function datList(file){const sz=kit.size(file);if(sz<16)return null;const b=kit.readAt(file,0,Math.min(sz,8<<20));const count=b.readUInt32LE(0);if(count<2||count>100000)return null;
 for(const nl of [0x24,0x30,0x3c]){const isz=(nl+4)*count;if(4+isz>b.length)continue;const off=i=>b.readUInt32LE(4+i*(nl+4)+nl);
  if(off(0)<isz+4)continue;const out=[];let ok=true;
  for(let i=0;i<count-1;i++){const o=off(i),next=i+1===count-1?sz:off(i+1);const nb=b.subarray(4+i*(nl+4),4+i*(nl+4)+nl),z=nb.indexOf(0),name=kit.cname(nb);
   if(!name||next<o||o<isz||next>sz||/[\x00-\x1f]/.test(name)){ok=false;break;}out.push({name,offset:o,size:next-o});}
  if(ok&&out.length)return out;}
 return null;}
const list=file=>/\.pck$/i.test(file)?pckList(file)||datList(file):datList(file)||pckList(file);
/* archives that hold scene scripts: a .mes entry, or entries that parse as MES */
const scriptArchive=file=>{const l=list(file);if(!l)return null;const mes=l.filter(e=>/\.mes$/i.test(e.name));if(mes.length)return mes;
 const probe=l.slice(0,8).filter(e=>{try{return isMes(kit.readAt(file,e.offset,Math.min(e.size,0x40000)));}catch{return false;}});return probe.length?l.filter(e=>!/\.(crx|pcm|ogg|wav|png|bmp)$/i.test(e.name)):null;};
const SUBS=['','advdata','AdvData','ADVDATA','advdata/mes','AdvData/MES','mes','MES'];
const engine=kit.engine({id:'circus',hint:'AdvData\\MES\\*.mes / *.pck',
 archives:{find:dir=>kit.files(dir,{name:/\.(pck|dat)$/i,subs:[...new Set(SUBS.map(s=>s.toLowerCase()))].map(s=>SUBS.find(x=>x.toLowerCase()===s))}),list:scriptArchive},
 loose:{name:/\.mes$/i,subs:SUBS},parse,test:n=>/\.mes$/i.test(n)});
/* the fingerprint: an AdvData folder holding Circus parts, or a .mes beside the exe that opens as MES */
function probe(dir){const sub=kit.names(dir).find(n=>/^advdata$/i.test(n));const d=sub?path.join(dir,sub):dir;
 for(const f of kit.files(d,{name:/\.mes$/i,subs:['','mes','MES'],max:3}))if(isMes(kit.head(f,0x40000)))return true;
 for(const f of kit.files(d,{name:/\.(pck|dat)$/i,max:6}))if(scriptArchive(f))return true;return false;}
module.exports={engine,parse,header,isMes,tokens,pckList,datList,list,probe,VERSIONS};
