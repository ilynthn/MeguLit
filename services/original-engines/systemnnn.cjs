// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E570 System-NNN (Tinyan's engine: CYCLET, metalogiq, Black Cyc, Mio — 浅き夢見し, 魔法少女消耗戦線, 鏖殺ノ乙女 …).
   Format references (read, not copied): the engine source tinyan/SystemNNN (nnnLib/execscript.cpp LoadScript /
   GetMessagePtr / GetStringPtr) and devseed's GalgameReverse project/systemnnn/src/systemnnn_spt.py (command layout).
     spt/*.spt  loose story scripts. Every dword is XOR'd with 0xFFFFFFFF (the engine's m_xorCode; m_addXorCode and
                m_addIncCode are 0 in the released engine, a title can change them: the key is then recovered from the
                header command, whose id and code are known)
     header     dword 4 message count, 5 message table, 6 string count, 7 string table (dword indices); a message is the
                cp932 C string at byte 4 × table[index]
     commands   from dword 0: {op_params (length in dwords), op_id 0x6666000x, op_code, args...}. PRINT / LPRINT / APPEND
                (0x22220001-3) show message args[0]; SELECT (0x22220006) shows strings args[1..sel+mes], sel = args[0],
                mes = the command's last dword.
   Lines are the shown messages and choices in command order, so a patch that appends its own text section and repoints
   the tables (how translation tools rebuild an spt) still pairs line by line. Built on kit.cjs (E573). */
const kit=require('./kit.cjs');
const ID_DATA=0x66660001,CODE_HEADER=0x55550001,PRINT=new Set([0x22220001,0x22220002,0x22220003]),SELECT=0x22220006;
const isHeader=d=>d.length>=12&&d.readUInt32LE(4)===ID_DATA&&d.readUInt32LE(8)===CODE_HEADER;
/* the plain dwords, or null when this is not a System-NNN script */
function plain(buf){if(!buf||buf.length<40)return null;
 let d=kit.xorDword(buf,0xffffffff);if(isHeader(d))return d;
 /* another fixed key: id XOR 0x66660001 gives it, the code confirms it */
 d=kit.xorDword(buf,(buf.readUInt32LE(4)^ID_DATA)>>>0);if(isHeader(d))return d;
 /* already decoded */
 return isHeader(buf)?Buffer.from(buf.subarray(0,buf.length&~3)):null;}
/* the strings a script shows, in order: {kind:'message'|'choice', bytes} */
function shown(d){const n=d.length>>>2,w=i=>i<n?d.readUInt32LE(i*4):0,out=[];
 const message=kit.pointerTable(d,w(5),w(4)),string=kit.pointerTable(d,w(7),w(6));
 for(let i=0,guard=0;i+2<n&&guard<1e6;guard++){const len=w(i),id=w(i+1),code=w(i+2);if(len<3||(id>>>4)!==0x6666000)break;
  if(PRINT.has(code)){const b=message(w(i+3));if(b)out.push({kind:'message',bytes:b});}
  else if(code===SELECT){const total=w(i+3)+w(i+len-1);if(total<64)for(let k=0;k<total;k++){const b=string(w(i+4+k));if(b)out.push({kind:'choice',bytes:b});}}
  i+=len;}
 return out;}
/* #［...］ notes and #X colour / glyph codes (#心 #赤 …) are display codes; \r\n is a line break */
const clean=t=>kit.trimBoth(t.replace(/#［[^］]*］/g,'').replace(/#[名心桃足猫黄赤青緑白黒]/g,'').replace(/\r\n|\r/g,'\n'));
function parse(buf){const d=plain(buf);if(!d)return {lines:[],anchors:[]};
 const list=shown(d),dec=kit.decoder(list.map(x=>x.bytes)),lines=[],anchors=[];
 for(const x of list){const t=clean(dec.decode(x.bytes));if(!t)continue;if(kit.ascii(t))anchors.push(t);else lines.push(t);}
 return {lines,anchors};}
const engine=kit.engine({id:'systemnnn',hint:'spt\\*.spt',loose:{name:/\.spt$/i,subs:['','spt','override/spt']},parse});
module.exports={engine,parse,plain,shown,clean};
