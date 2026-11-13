// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E588 ExHIBIT (Exhibit / Yuzusoft-era small brands; ~100 company releases: 白銀のソレイユ, プリンセスエヴァンジール, 桜の森ドリーマーズ …).
   Format references (read, not copied): jialiang/shirogane-analysis (format notes, round-tripped on 418 scripts of 白銀のソレイユ),
   regomne/chinesize ExHIBIT (decRld / extRld) and marcussacana/RLDManager with its MIT Python port DrSimp515/RLDManager-py (key
   table, known seeds -> rld-seeds.json).
     rld*.rld  loose files. Header (16 bytes, plain): "\0DLR", u32 version, u32 first instruction offset, u32 instruction count.
               Some titles XOR the dwords from 0x10 up to min(size, 0xFFCF) & ~3 with a key table made from one 32-bit seed
               (index & 0xFF into 256 of the 624 entries); the seed is per title and not recoverable, so only plain scripts and
               the known seeds are read
     code      self-describing instructions: u32 word, op = word & 0xFFFF, ints = (word >> 16) & 0xFF, strings = (word >> 24) & 0xF,
               then ints × i32, then the NUL-terminated strings. A script parses when its instruction count ends exactly at the
               end of the file; that is also how a seed is recognised
     text      op 0x1C: 7 ints, 2 strings: the speaker label and the line; op 0x15: choices (10 strings, "*" = unused);
               inside a line \n is a LF, 《base:reading》 is ruby (the base is kept)
   Lines come in instruction order (label before its line), so a GBK patch's rld pairs 1:1. */
const kit=require('./kit.cjs'),seeds=require('./rld-seeds.json');
const SEEDS=Object.values(seeds.seeds).map(s=>Number(s)>>>0);

/* the 624-entry key table (MSVC-style seed buffer, mixed twister-like), as in RLDManager */
function keyTable(seed){seed>>>=0;const keys=new Array(0x270);let st=seed;
 for(let i=0;i<0x270;i++){const prod=Math.imul(st,0x10dcd)>>>0;keys[i]=((st&0xffff0000)|(((prod+1)>>>0)>>>16))>>>0;st=(Math.imul(st,0x1c587629)+0x10dce)>>>0;}
 const ori=keys.slice();
 for(let i=0;i<keys.length;i++){const cur=keys[i],nxt=i+1>=keys.length?0:i+1;let m=((keys[nxt]^cur)&0x7fffffff)^cur;const carry=m&1;m=m>>>1;if(carry)m^=0x9908b0df;
  let idx=i+0x18d;if(idx>=keys.length)idx-=keys.length;m=(m^ori[idx])>>>0;ori[i]=m;
  m=(m^(m>>>11))>>>0;m=(m^((m&0xff3a58ad)<<7))>>>0;m=(m^((m&0xffffdf8c)<<15))>>>0;keys[i]=((((m>>>18)^m)>>>0)^seed)>>>0;}
 return keys;}
function crypt(buf,seed){const b=Buffer.from(buf),t=keyTable(seed);let n=Math.min(b.length,0xffcf);n-=n%4;
 for(let off=0x10,k=0;off<n;off+=4,k++)b.writeUInt32LE((b.readUInt32LE(off)^t[k&0xff])>>>0,off);return b;}

/* [{op, ints, strs:[Buffer]}] when the whole file parses as the declared instruction count, else null */
function walk(b){if(b.length<0x14||b.toString('latin1',1,4)!=='DLR')return null;const first=b.readUInt32LE(8),count=b.readUInt32LE(12);if(first<0x10||first>b.length||!count||count>5e6)return null;
 const out=[];let p=first;
 for(let n=0;n<count;n++){if(p+4>b.length)return null;const w=b.readUInt32LE(p),ints=(w>>>16)&0xff,ns=(w>>>24)&0xf;p+=4;if(p+ints*4>b.length)return null;
  const iv=[];for(let i=0;i<ints;i++)iv.push(b.readInt32LE(p+i*4));p+=ints*4;const strs=[];
  for(let i=0;i<ns;i++){const z=b.indexOf(0,p);if(z<0)return null;strs.push(b.subarray(p,z));p=z+1;}
  out.push({op:w&0xffff,ints:iv,strs});}
 return p===b.length?out:null;}
let lastSeed=null;
/* the plain script bytes and its instructions: plain first, then the seed that worked last, then every known seed */
function open(buf){const tries=[null,lastSeed,...SEEDS].filter((s,i,a)=>(s!==null||i===0)&&a.indexOf(s)===i);
 for(const s of tries){const b=s===null?buf:crypt(buf,s),w=walk(b);if(w){if(s!==null)lastSeed=s;return {bytes:b,ins:w};}}return null;}
const skip=t=>!t||t==='*'||t==='$noname$';
const rubyless=t=>t.replace(/《([^:》]*):[^》]*》/g,'$1');
function parse(buf){const o=open(Buffer.isBuffer(buf)?buf:Buffer.from(buf));if(!o)return {lines:[],anchors:[]};
 const items=[];for(const i of o.ins){if(i.op===0x1c&&i.strs.length>=2)items.push({k:'say',label:i.strs[0],text:i.strs[1]});else if(i.op===0x15)for(const s of i.strs)items.push({k:'choice',text:s});}
 const dec=kit.decoder(items.flatMap(x=>[x.label,x.text].filter(Boolean))),lines=[];
 for(const x of items){const t=dec.decode(x.text);if(skip(t))continue;
  if(x.k==='say'){if(/^[\x20-\x7e]*$/.test(t)&&(t.match(/,/g)||[]).length>=2)continue;const l=dec.decode(x.label);if(!skip(l))lines.push(l);}
  const s=kit.trimBoth(rubyless(t).replace(/\r\n|\r/g,'\n'));if(s)lines.push(s);}
 return {lines,anchors:[]};}
/* titles that encrypt their scripts with a seed not in the table: say so */
const looksRld=buf=>buf.length>=0x14&&buf.toString('latin1',1,4)==='DLR';
const engine=kit.engine({id:'exhibit',hint:'rld\*.rld',loose:{name:/\.rld$/i,subs:['','rld','dat']},parse,test:n=>/\.rld$/i.test(n)});
engine.unsupported=dir=>{let seen=false;for(const s of engine.scenes(dir).slice(0,40)){let b;try{b=s.read();}catch{continue;}if(!looksRld(b))continue;seen=true;if(open(b))return '';}return seen?'EXHIBIT_SEED':'';};
engine.REASONS={EXHIBIT_SEED:'这个 ExHIBIT 游戏的 rld 脚本用了按作品不同的种子加密，种子不在已知表里，暂时读不了'};
module.exports={engine,parse,keyTable,crypt,walk,open};
