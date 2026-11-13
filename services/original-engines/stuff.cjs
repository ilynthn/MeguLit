// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E643 Stuff Script Engine (Propeller's .msc scripts: Bullet Butlers and its sister titles). Family F4a.
   Format references: TesterTesterov mscScriptTool mscScript.py (GPL-3.0; the opcode tables below are its CommandLibrary,
   transcribed) for the script; GARbro ArcFormats/Propeller/ArcMPK.cs (morkt, MIT) for the archive.
     *.mpk  u32 index offset, i32 count; the index (count × 0x28) is XORed with its own byte 0x1F: {char name[0x20]
            (a leading backslash dropped), u32 offset, u32 size}. .msc entries that begin 0x88 are XOR 0x88
     *.msc  00 00, u32 code offset, u32 n1, n1 bytes of label records, u32 n2, n2 bytes of label records, then the code:
            two opcode bytes and operands B (1), H / h (2), I / i (4), S (u16 length + bytes in version 0, u32 length in
            version 1). Unknown opcodes are two bytes skipped (as the tool does). 05 00 MESSAGE and 02 12 a choice carry
            the shown text as their last string; the version is the one whose walk ends on the last byte with the fewest
            unknown opcodes. */
const kit=require('./kit.cjs');
const RAW=["0000:BIh 0001:BBhHBhH 0002:Bh 0003:Bh 0004: 0005:BhB 0006: 0007:B 0008:S 0009: 000a:B 000b: 000c: 000d: 000e: 000f: 0010:Bh 0011:Bh 0012: 0013: 0014: 0016:B 0017:Bh 0020:BhBhH 0030: 0031: 0032: 0033:Bh 0034:Bh 0035: 0036:B 0037:HiBh 0100:S 0101:BS 0102:Bh 0103:SSS 0104:BS 0105:BhBh 0106:BhBh 0107:BhBh 0108:BhBhBhBhBhBhBh 0109:SSSB 010a:BhBh 010b:BhBhS 010c:HH 010d:BHSS 010e:HhBhBhBh 010f:Bh 0110:HhBhBh 0111:Bh 0112:BhBhBhBhBhBhBh 0113:BhBhBhBhBh 0114:Bh 0115:BS 0116:Bh 0117:SS 0118:S 0119:SBh 011a:H 011b:Hh 011c:HhBh 011d:HhBh 011e:SS 011f:SSS 0200:BhS 0201:BhBhBh 0202:BhB 0203:BhBhBhBhBh 0204:BhBh 0205:BhBhBh 0206:BhBh 0207:BhBh 0208:BhBhBhBh 0209:BhBhBhBhBhBh 020a:BhBhBh 020b:BhBhBhBh 020c:BhBhBhBhB 020d:BhBh 020e:BhBh 020f:BhBh 0210:BhBhBh 0211:BhBhBh 0212:BhBhBhBhBhS 0213:BhBh 0214:BhSBhBhBhB 0215:BhBhBhBh 0216:BhSBhBhBhBh 0217:BhB 0300:BhSBhB 0301:BhBhB 0302:Bh 0303:SB 0400:BhHh 0401:BhB 0402:BhB 0403:BhBh 0404:BhBh 0500:BhS 0501:BhBhBhBhBhBhBhBh 0502:BhBhBhBhBhBhBh 0503:BhBh 0504:BhBh 0505:B 0506: 0507:H 0600:SHh 0601:Bh 0602:S 0603: 0604:BhS 0605:BhB 0606:Bh 0607: 0608:Bh 0609:Bh 060a:S 060b:HiBh 060c:BhBhBhBh 060d: 060e:BhBh","0000:BIBBi 0001:BBiHBiI 0002:Bi 0003:Bi 0004: 0005:BiB 0006: 0007:B 0008:S 0009: 000a:B 000b: 000c: 000d: 000e: 000f: 0010:Bi 0011:Bi 0012: 0013: 0014: 0016:B 0017:Bi 0020:BiBiH 0030: 0031: 0032: 0033:Bi 0034:Bi 0035: 0036:B 0037:HiBi 0100:S 0101:BS 0102:Bi 0103:ISS 0104:BS 0105:BiBi 0106:BiBi 0107:BiBi 0108:BiBiBiBiBiBiBi 0109:SSSB 010a:BiBi 010b:BiBiS 010c:HI 010d:BiSS 010e:HiBiBiBi 010f:Bi 0110:HiBiBi 0111:Bi 0112:BiBiBiBiBiBiBi 0113:BiBiBiBiBi 0114:Bi 0115:BS 0116:Bi 0117:SS 0118:S 0119:SBi 011a:H 011b:Hi 011c:HiBi 011d:HiBi 011e:SS 011f:SSS 0200:BiS 0201:BiBiBi 0202:BiB 0203:BiBiBiBiBi 0204:BiBi 0205:BiBiBi 0206:BiBi 0207:BiBi 0208:BiBiBiBi 0209:BiBiBiBiBiBi 020a:BiBiBi 020b:BiBiBiBi 020c:BiBiBiBiB 020d:BiBi 020e:BiBi 020f:BiBi 0210:BiBiBi 0211:BiBiBi 0212:BiBiBiBiBiS 0213:BiBi 0214:BiSBiBiBiB 0215:BiBiBiBi 0216:BiSBiBiBiBi 0217:BiB 0300:BiSBiB 0301:BiBiB 0302:Bi 0303:SB 0400:BiHi 0401:BiB 0402:BiB 0403:BiBi 0404:BiBi 0500:BIS 0501:BiBiBiBiBiBiBiBi 0502:BiBiBiBiBiBiBi 0503:BiBi 0504:BiBi 0505:B 0506: 0507:H 0600:SHi 0601:Bi 0602:S 0603: 0604:BiS 0605:BiB 0606:Bi 0607: 0608:Bi 0609:Bi 060a:S 060b:HiBi 060c:BiBiBiBi 060d: 060e:BiBi 060f:Bi 0611:Bi 0613:BiBi 0614:BiBiBi 0615:Bi"];
const TABLES=RAW.map(s=>new Map(s.split(' ').map(x=>{const [k,v]=x.split(':');return [parseInt(k,16),v];})));
const W={b:1,h:2,i:4};
function walk(b,version){if(b.length<14||b[0]||b[1])return null;const start=b.readUInt32LE(2);if(start<14||start>b.length)return null;const T=TABLES[version],strs=[];let p=start,unknown=0;
 while(p+2<=b.length){const op=(b[p]<<8)|b[p+1];p+=2;const e=T.get(op);if(e===undefined){unknown++;continue;}const got=[];
  for(const c of e){if(c==='S'){const w=version?4:2;if(p+w>b.length)return null;const n=version?b.readUInt32LE(p):b.readUInt16LE(p);p+=w;if(p+n>b.length)return null;got.push(b.subarray(p,p+n));p+=n;}else{p+=W[c.toLowerCase()];}}
  if(p>b.length)return null;if((op===0x0500||op===0x0212)&&got.length)strs.push({op,bytes:got[got.length-1]});}
 return {strs,unknown};}
function best(b){let pick=null;for(const v of [0,1]){let w;try{w=walk(b,v);}catch{w=null;}if(w&&(!pick||w.unknown<pick.unknown||w.unknown===pick.unknown&&w.strs.length>pick.strs.length))pick=w;}return pick;}
function parse(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf),w=best(b);if(!w)return {lines:[],anchors:[]};const dec=kit.decoder(w.strs.map(x=>x.bytes)),lines=[];
 for(const x of w.strs){const t=kit.trimBoth(dec.decode(x.bytes).replace(/\\n/g,'\n'));if(t)lines.push(t);}return {lines,anchors:[]};}
function list(file){const h=kit.head(file,8);if(h.length<8)return null;const at=h.readUInt32LE(0),count=h.readInt32LE(4),size=kit.size(file);if(at<8||at>=size||count<=0||count>100000||at+count*0x28>size)return null;
 const idx=kit.readAt(file,at,count*0x28),key=idx[0x1f],out=[];for(let i=0;i<idx.length;i++)idx[i]^=key;
 for(let i=0;i<count;i++){const p=i*0x28,s=idx[p]===0x5c?1:0,nb=kit.cstr(idx,p+s,p+0x20);if(!nb||!nb.length||nb.some(c=>c<0x20))return null;const offset=idx.readUInt32LE(p+0x20),sz=idx.readUInt32LE(p+0x24);if(offset+sz>size)return null;out.push({name:kit.SJIS.decode(nb).replace(/\\/g,'/'),offset,size:sz});}
 return out;}
const unxor=b=>b.length>1&&b[0]===0x88&&b[1]===0x88?kit.xor(b,0x88):b;
const MSC=/\.msc$/i;
const engine=kit.engine({id:'stuff',hint:'*.mpk（*.msc）',
 archives:{name:/\.mpk$/i,list:f=>{const l=list(f);return l&&l.some(e=>MSC.test(e.name))?l.filter(e=>MSC.test(e.name)).map(e=>({...e,read:()=>unxor(kit.readAt(f,e.offset,e.size))})):null;}},
 loose:{name:MSC,subs:['','msc','script']},parse:b=>parse(unxor(b))});
module.exports={engine,parse,walk,list,unxor,TABLES};
