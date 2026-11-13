// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E640 Escu:de (エスクード) ACPX engine. Family F4a (docs/engine-families.md, 第二轮).
   Format references (read, not copied): GARbro ArcFormats/Escude/ArcBIN.cs and ArcFormats/Favorite/ArcFVP.cs (morkt,
   MIT) for the archive and its "acp" LZW; TesterTesterov ACPXScriptTool acpx_script.py / acpx_command_lib.py (GPL-2.0)
   for the scripts.
     script.bin  "ESC-ARC1" / "ESC-ARC2", u32 seed; every following dword XOR next() where next(): s ^= 0x65AC9365;
                 s ^= ((s >> 1 ^ s) >> 3) ^ ((s << 1 ^ s) << 3). u32 count. v1: count × {char name[0x80], u32 offset,
                 u32 size}. v2: u32 names size, count × {u32 name offset, u32 offset, u32 size}, then the plain name block
     entries     "acp\0" + u32be unpacked + LZW, MSB-first codes of 9 bits growing to 24: 0x100 end, 0x101 one bit
                 wider, 0x102 reset; every code adds a dictionary entry at the current output position; a code >= 0x103
                 copies from dict[code - 0x103] up to dict[code - 0x102] inclusive
     ESCR1_00    "ESCR1_00", u32 n, n × u32 string offsets, u32 code length, code, u32 string block length, the strings
                 (C strings, table order is the order the code uses them). Hiragana and some punctuation are stored as
                 half-width katakana (the engine maps ｦ-ﾝ back), so a Shift-JIS script is mapped back the same way
     ESCR_NEW    the code in <name>.bin ("@code:__") and the messages in <name>.001: "@mess:__", u32 n, u32 total,
                 n × u32 offsets, strings XOR 0x55 ending at 0x55 (a XORed NUL)
   Shown text is every string with a non-ASCII byte, in table order; ASCII strings (file names, labels) are anchors. */
const kit=require('./kit.cjs');

function seedStream(seed){let s=seed>>>0;return ()=>{s=(s^0x65ac9365)>>>0;s=(s^((((s>>>1)^s)>>>3)^(((s<<1)^s)<<3)))>>>0;return s;};}
function list(file){const h=kit.head(file,0x14);if(h.length<0x14||h.toString('latin1',0,7)!=='ESC-ARC')return null;const v=h[7]-48,size=kit.size(file),next=seedStream(h.readUInt32LE(8));
 const count=(h.readUInt32LE(12)^next())>>>0;if(!count||count>200000)return null;const out=[];
 const dec=b=>{const o=Buffer.from(b);for(let i=0;i+4<=o.length;i+=4)o.writeUInt32LE((o.readUInt32LE(i)^next())>>>0,i);return o;};
 if(v===1){const idx=dec(kit.readAt(file,0x10,count*0x88));if(idx.length<count*0x88)return null;
  for(let i=0;i<count;i++){const p=i*0x88,name=kit.cstr(idx,p,p+0x80),offset=idx.readUInt32LE(p+0x80),sz=idx.readUInt32LE(p+0x84);if(!name||!name.length||offset+sz>size)return null;out.push({name:kit.SJIS.decode(name).replace(/\\/g,'/'),offset,size:sz});}
  return out;}
 if(v!==2)return null;const namesSize=(kit.readAt(file,0x10,4).readUInt32LE(0)^next())>>>0;if(namesSize>size)return null;
 const idx=dec(kit.readAt(file,0x14,count*12)),names=kit.readAt(file,0x14+count*12,namesSize);if(idx.length<count*12)return null;
 for(let i=0;i<count;i++){const p=i*12,no=idx.readUInt32LE(p),offset=idx.readUInt32LE(p+4),sz=idx.readUInt32LE(p+8);const name=kit.cstr(names,no);if(!name||!name.length||offset+sz>size)return null;out.push({name:kit.SJIS.decode(name).replace(/\\/g,'/'),offset,size:sz});}
 return out;}
/* the "acp" LZW (also FAVORITE's): bits MSB first */
function lzw(src,unpacked){const out=Buffer.alloc(unpacked),dict=new Int32Array(0x8900);let width=9,dp=0,o=0,bitPos=0;
 const bits=n=>{let v=0;for(let k=0;k<n;k++){const byte=bitPos>>>3;if(byte>=src.length)return -1;v=(v<<1)|((src[byte]>>>(7-(bitPos&7)))&1);bitPos++;}return v;};
 while(o<unpacked){const t=bits(width);if(t<0||t===0x100)break;if(t===0x101){if(++width>24)break;continue;}if(t===0x102){width=9;dp=0;continue;}
  if(dp>=dict.length)break;dict[dp++]=o;if(t<0x100){out[o++]=t;continue;}const k=t-0x103;if(k>=dp-1)break;
  const from=dict[k],n=Math.min(unpacked-o,dict[k+1]-from+1);for(let j=0;j<n;j++)out[o+j]=out[from+j];o+=n;}
 return out.subarray(0,o);}
const unpack=b=>b.length>8&&b.toString('latin1',0,4)==='acp\0'?lzw(b.subarray(8),b.readUInt32BE(4)):b;

/* half-width forms the engine uses for hiragana / punctuation in ESCR1_00 strings (acpx_script.py _string_format) */
const INNER='!?｡｢｣､･ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝﾞﾟ',OUTER='！？　。「」、…をぁぃぅぇぉゃゅょっーあいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん゛゜';
const MAP=new Map([...INNER].map((c,i)=>[c,[...OUTER][i]]));
const restring=t=>[...t].map(c=>MAP.get(c)||c).join('');
/* the strings of a script in table order: ESCR1_00 (.bin) or the ESCR_NEW message file (.001) */
function strings(b){const tag=b.toString('latin1',0,8);
 if(tag==='ESCR1_00'){const n=b.readUInt32LE(8);if(n>500000||12+n*4+4>b.length)return null;const codeLen=b.readUInt32LE(12+n*4),block=12+n*4+4+codeLen+4;if(block>b.length)return null;
  const out=[];for(let i=0;i<n;i++){const s=kit.cstr(b,block+b.readUInt32LE(12+i*4));if(s)out.push(s);}return {kind:'v1',list:out};}
 if(tag==='@mess:__'){const n=b.readUInt32LE(8);if(n>500000||16+n*4>b.length)return null;const base=16+n*4,out=[];
  for(let i=0;i<n;i++){const s=[];for(let q=base+b.readUInt32LE(16+i*4);q<b.length&&b[q]!==0x55;q++)s.push(b[q]^0x55);out.push(Buffer.from(s));}
  return {kind:'new',list:out};}
 return null;}
function parse(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf);if(b.length<16)return {lines:[],anchors:[]};const s=strings(b);if(!s)return {lines:[],anchors:[]};
 /* the half-width forms count against Shift-JIS in kit.codepage, so ESCR1_00 text is judged after mapping them back */
 const all=Buffer.concat(s.list.filter(x=>x.some(c=>c>=0x80)).slice(0,4000)),score=t=>({bad:(t.match(/�/g)||[]).length,kana:(t.match(kit.KANA_G)||[]).length});
 const sj=score(restring(kit.SJIS.decode(all))),gb=score(new TextDecoder('gbk').decode(all));
 const enc=s.kind==='v1'?(sj.bad<gb.bad||sj.bad===gb.bad&&sj.kana>=gb.kana?'shift_jis':'gbk'):kit.codepage(all),dec=new TextDecoder(enc),lines=[],anchors=[];
 for(const x of s.list){if(!x.length)continue;if(!x.some(c=>c>=0x80)){anchors.push(x.toString('latin1'));continue;}let t=dec.decode(x);if(s.kind==='v1'&&enc==='shift_jis')t=restring(t);t=kit.trimBoth(t.replace(/\\n/g,'\n'));if(t)lines.push(t);}
 return {lines,anchors};}
const SCRIPT=/\.(bin|001)$/i;
const isScript=b=>{const t=b.toString('latin1',0,8);return t==='ESCR1_00'||t==='@mess:__';};
const engine=kit.engine({id:'escude',hint:'script.bin（ESCR1_00 / .001）',
 archives:{name:/\.bin$/i,magic:'ESC-ARC',list:f=>{const l=list(f);return l&&l.some(e=>SCRIPT.test(e.name))?l.filter(e=>SCRIPT.test(e.name)).map(e=>({...e,read:()=>unpack(kit.readAt(f,e.offset,e.size))})):null;}},
 loose:{name:/\.(bin|001)$/i,subs:['','script','scr']},parse,
 test:n=>/\.001$/i.test(n)});
/* loose .bin files that are not scripts (the archives themselves) parse to nothing, so the factory's loose list is fine */
module.exports={engine,parse,list,lzw,unpack,strings,restring,seedStream};
