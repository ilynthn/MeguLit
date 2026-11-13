// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E583 AliceSoft before System4: System 3.5–3.9 (鬼畜王ランス, ランス4.1/4.2, 闘神都市II, 大悪司 era, ランス5D …) and the
   archives of every AliceSoft generation. System4 (.ain: ランス・クエスト, 戦国ランス, ランス01/03/9/10 …) keeps its own
   message-table reader in original-text.cjs; this file covers what only reached the GARbro whitelist before.
   Format references (read, not copied): xsys35c (kichikuou, GPL-2.0-or-later: common/ald.c, decompiler/decompile.c,
   cali.c, ain.c, common/sjisutf.c), xsystem35-sdl2 cmd_check.c (the interpreter), libsys4 src/afa.c (nunuhara, GPL-2.0).
     *SA.ALD …      ALD archive: 3-byte sector pointers (pointer 0 = link table, then one per file), link table of
                    (volume, pointer) per link number, per file a header {hdrlen, size, FILETIME, name}. Footer "NL\x01\0".
                    The S? archives (SA, SB …) hold one SCO per page.
     *.SCO          "S350" / "S351" / "153S" / "S360" / "S380", header size, file size. Messages sit in the bytecode as raw
                    Shift-JIS runs (a 0x20 or a byte ≥ 0x81 where a command would start); 0xA1–0xDD in a message are
                    "compacted" hiragana. R is a line break, A waits for a key (one shown page = one line here), $label
                    ... $ is a menu item (a choice), /! (2F 21) prints a C string. System 3.9 keeps the text in
                    System39.ain (MSGI) and the code refers to it by id (2F 7C).
                    Commands are walked exactly with the argument signatures of xsys35c's decompiler
                    (sys35-commands.json): e/v an expression ending 0x7F, n one byte, s colon-terminated, z zero-terminated.
     System39.ain   "AINI" / "AIN2", every byte after offset 4 rotated left by 2: sections HEL0 (DLL functions and their
                    argument types, needed to walk dllCall), FUNC, VARI, MSGI (the messages, C strings in id order).
     *.afa          System4 resource archives ("AFAH" … "AlicArch", zlib "INFO" index). They hold CG, sound and voice, never
                    script; listed so a System4 folder is recognised and GARbro does not unpack them for nothing.
   Built on kit.cjs (E573). */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),kit=require('./kit.cjs');
const CMDS=require('./sys35-commands.json').commands;

/* ---- ALD ------------------------------------------------------------------------------------------------------------ */
const sector=(b,i)=>{const p=i*3;return p+3>b.length?-1:(b[p]<<8|b[p+1]<<16|b[p+2]<<24)>>>0;};
function aldVolume(file){const t=kit.tail(file,16);if(t.length===16&&t.readUInt32LE(0)===0x14c4e)return t[8];const m=/([a-z])\.ald$/i.exec(file);return m?m[1].toLowerCase().charCodeAt(0)-96:1;}
/* entries of this volume, in link order: [{name, link, offset, size}] */
function listAld(file){const fsz=kit.size(file);if(fsz<512)return null;const h=kit.head(file,3),link0=(h[0]<<8|h[1]<<16|h[2]<<24)>>>0;if(!link0||link0>=fsz||link0>1<<24)return null;
 const ptrs=kit.readAt(file,0,link0),linkEnd=sector(ptrs,1);if(linkEnd<=link0||linkEnd>fsz)return null;const links=kit.readAt(file,link0,linkEnd-link0),vol=aldVolume(file),out=[];
 for(let i=0;i+3<=links.length;i+=3){const v=links[i],n=links[i+1]|links[i+2]<<8;if(!v)continue;if(v!==vol)continue;const at=sector(ptrs,n);if(at<0||at+16>fsz)return null;
  const eh=kit.readAt(file,at,48),hl=eh.readUInt32LE(0),sz=eh.readUInt32LE(4);if(hl<16||hl>0x200||at+hl+sz>fsz)return null;const nb=kit.readAt(file,at+16,hl-16),z=nb.indexOf(0);
  out.push({name:kit.SJIS.decode(z>=0?nb.subarray(0,z):nb),link:i/3,offset:at+hl,size:sz});}
 return out.length?out:null;}

/* ---- System39.ain --------------------------------------------------------------------------------------------------- */
function readAin39(buf){if(!buf||buf.length<12)return null;const m=buf.toString('latin1',0,4);if(m!=='AINI'&&m!=='AIN2')return null;
 const d=Buffer.from(buf);for(let i=4;i<d.length;i++)d[i]=((d[i]<<2)|(d[i]>>>6))&255;const out={dlls:[],messages:null};let p=8;
 const str=()=>{const e=d.indexOf(0,p);if(e<0)throw Error('AIN39');const s=d.subarray(p,e);p=e+1;return s;};const u32=()=>{const v=d.readUInt32LE(p);p+=4;return v;};
 try{while(p+8<=d.length){const tag=d.toString('latin1',p,p+4);p+=8;
   if(tag==='HEL0'){const n=u32();for(let i=0;i<n;i++){str();const fns=[],k=u32();for(let j=0;j<k;j++){str();const a=u32(),types=[];for(let x=0;x<a;x++)types.push(u32());fns.push(types);}out.dlls.push(fns);}}
   else if(tag==='FUNC'){const n=u32();for(let i=0;i<n;i++){str();p+=6;}}
   else if(tag==='VARI'||tag==='MSGI'){const n=u32(),list=[];for(let i=0;i<n;i++)list.push(str());if(tag==='MSGI')out.messages=list;}
   else break;}}catch{}
 return out;}

/* ---- SCO walker ----------------------------------------------------------------------------------------------------- */
const KANA=[0x8140,0x8142,0x8175,0x8176,0x8141,0x8145,0x82f0,0x829f,0x82a1,0x82a3,0x82a5,0x82a7,0x82e1,0x82e3,0x82e5,0x82c1,0x815b,0x82a0,0x82a2,0x82a4,0x82a6,0x82a8,0x82a9,0x82ab,
 0x82ad,0x82af,0x82b1,0x82b3,0x82b5,0x82b7,0x82b9,0x82bb,0x82bd,0x82bf,0x82c2,0x82c4,0x82c6,0x82c8,0x82c9,0x82ca,0x82cb,0x82cc,0x82cd,0x82d0,0x82d3,0x82d6,0x82d9,0x82dc,
 0x82dd,0x82de,0x82df,0x82e0,0x82e2,0x82e4,0x82e6,0x82e7,0x82e8,0x82e9,0x82ea,0x82eb,0x82ed,0x82f1,0x814a,0x814b];
const lead=c=>c>=0x81&&c<=0x9f||c>=0xe0&&c<=0xfc;
const VERSIONS=new Set(['S350','S351','153S','S360','S380']);
const isSco=b=>b&&b.length>=16&&VERSIONS.has(b.toString('latin1',0,4));
/* skip one expression (is_lhs: a single variable / array reference) */
function cali(c,p,lhs=false,depth=0){if(depth>8)throw Error('SCO_EXPR');
 for(;;){if(p>=c.length)throw Error('SCO_EXPR');const op=c[p++];
  if(op===0x7f){if(lhs)throw Error('SCO_EXPR');return p;}
  if(op>=0x74&&op<=0x7e){}
  else if(op===0xc0){const o=c[p++];if(o===1){p+=2;p=cali(c,p,false,depth+1);}else if(o<0x40&&(o<1||o>4))throw Error('SCO_EXPR');}
  else if(op&0x80){if(op>0xc0)p++;}
  else{if(op<0x40){const v=(op&0x3f)<<8|c[p];p++;if(v<=0x33)throw Error('SCO_EXPR');}}
  if(lhs)return p;}}
const string=(c,p,term)=>{const e=c.indexOf(term,p);if(e<0)throw Error('SCO_STR');return e+1;};
function args(c,p,sig){for(const a of sig){
  if(a==='e'||a==='v')p=cali(c,p);else if(a==='n'||a==='N')p++;else if(a==='s')p=string(c,p,0x3a);else if(a==='z')p=string(c,p,0);
  else if(a==='o'){if(c[p]!==0)throw Error('SCO_STR');p=string(c,p+1,0);}else if(a==='F')p+=6;else throw Error('SCO_SIG');}
 return p;}
function command(c,p){const b=c[p],n=c[p+1],L=x=>x.charCodeAt(0);
 if(b===0x2f)return [b|n<<8,2];
 if(b===L('G'))return n===L('S')||n===L('X')?[b|n<<8,2]:[b,1];
 if(b===L('N'))return n===L('D')?[b|n<<8|c[p+2]<<16,3]:[b|n<<8,2];
 if(b===L('V'))return n===L('I')?[b|n<<8|c[p+2]<<16,3]:[b|n<<8,2];
 if(b===L('L'))return n===L('H')||n===L('X')?[b|n<<8|c[p+2]<<16,3]:[b|n<<8,2];
 if('CDEIKMPQSUWZ'.includes(String.fromCharCode(b)))return [b|n<<8,2];
 return [b,1];}
const C2=(a,b)=>a.charCodeAt(0)|b.charCodeAt(0)<<8;
const MSG=0x2f|0x21<<8,AIN_MSG=0x2f|0x7c<<8,AIN_H=0x2f|0x7d<<8,AIN_HH=0x2f|0x7e<<8,AIN_X=0x2f|0x7f<<8,DLL=0x2f|0x60<<8,SR=C2('S','R'),SX=C2('S','X');
/* the message run at p: [bytes (expanded Shift-JIS) or string (utf8), next] */
function messageRun(c,p,utf8){const out=[];const s=p;
 while(p<c.length&&(c[p]===0x20||c[p]>0x80)){const x=c[p];
  if(utf8){const len=x<0x80?1:x<0xe0?2:x<0xf0?3:4;for(let k=0;k<len;k++)out.push(c[p+k]);p+=len;continue;}
  if(lead(x)&&p+1<c.length){out.push(x,c[p+1]);p+=2;continue;}
  if(x===0x20||x>=0xa1&&x<=0xdd){const w=x===0x20?0x8140:KANA[x-0xa0];out.push(w>>8,w&255);p++;continue;}
  out.push(x);p++;}
 return [Buffer.from(out),p,p-s];}
/* walk one SCO page: events {text:Buffer|string, kind:'text'|'choice'} and {br} / {page} markers, in code order */
function walk(sco,{ain=null,utf8=false}={}){const c=sco,hdr=c.readUInt32LE(4),end=Math.min(c.length,c.readUInt32LE(8)||c.length),ev=[];let p=hdr,menu=false,bad=0;
 if(utf8===null)utf8=c.toString('latin1',hdr,hdr+4)==='ZU\x41\x7f';if(c.toString('latin1',hdr,hdr+4)==='ZU\x41\x7f')p+=4;
 const say=(t,kind)=>ev.push({text:t,kind:menu?'choice':kind});
 while(p<end){const top=p,b=c[p];
  try{
   if(b===0x20||b>0x80){const [t,q]=messageRun(c,p,utf8);p=q;if(c[p]===0){p++;continue;}if(t.length)say(t,'text');continue;}
   if(b===0){p++;continue;}
   const [cmd,len]=command(c,p);p+=len;
   switch(cmd){
    case 0x21:case 0x10:case 0x11:case 0x12:case 0x13:case 0x14:case 0x15:case 0x16:case 0x17:p=cali(c,p,true);p=cali(c,p);break;
    case 0x7b:p=cali(c,p);p+=4;break;
    case 0x40:case 0x5c:case 0x3e:p+=4;break;
    case 0x26:case 0x25:p=cali(c,p);break;
    case 0x3c:if(c[p]!==0||c[p+1]!==0x3c||c[p+2]!==1)throw Error('SCO_FOR');p+=7;p=cali(c,p);p=cali(c,p);p=cali(c,p);p=cali(c,p);break;
    case 0x5d:ev.push({page:true});break;
    case 0x24:menu=!menu;ev.push({page:true});if(menu){p+=4;/* inline item: $label text$ */const [t,q]=messageRun(c,p,utf8);if(c[q]===0x24){if(t.length)say(t,'choice');p=q+1;menu=false;ev.push({page:true});}}break;
    case 0x23:p+=4;p=cali(c,p);break;
    case 0x7e:{const pg=c.readUInt16LE(p);p+=2;if(pg===0||pg===0xffff)p=cali(c,p);else p+=4;break;}
    case 0x41:ev.push({page:true});break;
    case 0x52:ev.push({br:true});break;
    case MSG:{const e=c.indexOf(0,p);if(e<0)throw Error('SCO_STR');const t=c.subarray(p,e);p=e+1;if(t.length)say(utf8?t.toString('utf8'):t,'text');break;}
    case AIN_MSG:{const id=c.readUInt32LE(p);p+=4;const m=ain?.messages?.[id];if(m&&m.length)say(m,'text');break;}
    case AIN_H:case AIN_HH:p+=4;p=args(c,p,'ne');break;
    case AIN_X:p+=4;p=args(c,p,'e');break;
    case DLL:{const di=c.readUInt32LE(p),fi=c.readUInt32LE(p+4);p+=8;const types=ain?.dlls?.[di]?.[fi];if(!types)throw Error('SCO_DLL');
      for(const t of types){if(t===0||t===1||t===3)p=cali(c,p);else if(t===18)p=string(c,p,0);else if([2,4,5,6,7,9,10,13,14,15,16,17].includes(t))p+=2;else throw Error('SCO_DLL');}break;}
    case SR:p=args(c,p,c[p]<0x40?'Nv':'ev');break;
    case SX:{p++;const s=CMDS[SX].sub[c[p++]];if(s===undefined)throw Error('SCO_SUB');p=args(c,p,s);break;}
    default:{const sig=CMDS[cmd];if(sig===undefined)throw Error('SCO_CMD');if(typeof sig==='string')p=args(c,p,sig);else{const s=sig.sub[c[p++]];if(s===undefined)throw Error('SCO_SUB');p=args(c,p,s);}}}
   if(p>end)break;
  }catch{/* data in the code area or a command this table lacks: resync one byte on */p=top+1;if(++bad>4096)break;}}
 return ev;}
/* events -> lines: a shown page (text up to A or a menu boundary) is one line; R is a line break inside it */
function scoLines(sco,opts){const ev=walk(sco,opts),lines=[];let cur=[],kind='text';const dec=kit.SJIS;
 const flush=()=>{const t=kit.trimBoth(cur.join('').replace(/\n+$/,''));if(t&&!kit.ascii(t))lines.push(t);cur=[];};
 for(const e of ev){if(e.page){flush();continue;}if(e.br){if(cur.length)cur.push('\n');continue;}
  const t=typeof e.text==='string'?e.text:dec.decode(e.text);if(e.kind==='choice'){flush();const s=kit.trimBoth(t);if(s)lines.push(s);continue;}cur.push(t);}
 flush();return lines;}

/* ---- AFA (System4 resources; listed, never script) ------------------------------------------------------------------ */
function listAfa(file){const h=kit.head(file,44);if(h.length<44||h.toString('latin1',0,4)!=='AFAH')return null;
 if(h.toString('latin1',8,16)!=='AlicArch')return h.readUInt32LE(8)===3?[]:null;if(h.toString('latin1',28,32)!=='INFO')return null;
 const ver=h.readUInt32LE(16),dataStart=h.readUInt32LE(24),packed=h.readUInt32LE(32)-16,count=h.readUInt32LE(40);if(count>1e6||packed<=0)return null;
 let idx;try{idx=zlib.inflateSync(kit.readAt(file,44,packed),{maxOutputLength:64<<20});}catch{return null;}
 const withNo=ver===1||(()=>{let p=0;for(let i=0;i<count;i++){if(p+8>idx.length)return false;const n=idx.readUInt32LE(p+4);p+=8+n+20;}return p===idx.length;})();
 const out=[];let p=0;for(let i=0;i<count&&p+8<=idx.length;i++){const padded=idx.readUInt32LE(p+4),nl=idx.readUInt32LE(p);p+=8;const nb=idx.subarray(p,p+Math.min(nl,padded));p+=padded;if(withNo)p+=4;p+=8;
  const off=idx.readUInt32LE(p),size=idx.readUInt32LE(p+4);p+=8;out.push({name:new TextDecoder("shift_jis").decode(nb),offset:dataStart+off,size});}
 return out;}

/* ---- engine: scenes are the SCO pages of the scenario ALDs (and loose SCO files) ------------------------------------- */
const SCEN=/s[a-z]\.ald$/i;
const ainMemo=new Map();
function ain39(dir){if(ainMemo.has(dir))return ainMemo.get(dir);let a=null;for(const n of kit.names(dir))if(/\.ain$/i.test(n)){const h=kit.head(path.join(dir,n),4).toString('latin1');if(h==='AINI'||h==='AIN2'){try{a=readAin39(fs.readFileSync(path.join(dir,n)));}catch{}break;}}
 ainMemo.set(dir,a);return a;}
let lastOpts={};
function scenes(dir){const out=new Map(),ain=ain39(dir);const opts={ain,utf8:null};lastOpts=opts;
 for(const f of kit.files(dir,{name:/\.ald$/i,max:64})){if(!SCEN.test(f))continue;let l;try{l=listAld(f);}catch{l=null;}
  for(const e of l||[]){const name=e.name||('page'+e.link+'.sco');out.set(name.toLowerCase(),{name,read:()=>{const b=kit.readAt(f,e.offset,e.size);b.ain=opts;return b;},link:e.link});}}
 for(const f of kit.files(dir,{name:/\.sco$/i,subs:['','sco','SCO'],max:4000})){const name=path.basename(f);out.set(name.toLowerCase(),{name,read:()=>{const b=fs.readFileSync(f);b.ain=opts;return b;}});}
 /* System 3.9 without an SA archive in reach: the message table alone, in id order */
 if(!out.size&&ain?.messages?.length)out.set('system39.ain',{name:'System39.ain',read:()=>{const b=Buffer.from('MSGI');b.ain={ain,utf8:false};return b;}});
 return [...out.values()].sort((a,b)=>(a.link??1e9)-(b.link??1e9)||a.name.localeCompare(b.name));}
function parse(buf){try{const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf),opts=buf.ain||lastOpts;
 if(isSco(b))return {lines:scoLines(b,opts),anchors:[]};
 if(b.toString('latin1',0,4)==='MSGI'&&opts.ain){const lines=[];for(const m of opts.ain.messages||[]){const t=kit.trimBoth(kit.SJIS.decode(m));if(t&&!kit.ascii(t))lines.push(t);}return {lines,anchors:[]};}
 const a=readAin39(b);if(a?.messages){const lines=[];for(const m of a.messages){const t=kit.trimBoth(kit.SJIS.decode(m));if(t&&!kit.ascii(t))lines.push(t);}return {lines,anchors:[]};}}catch{}
 return {lines:[],anchors:[]};}
function sources(dir){return [...kit.files(dir,{name:/\.ald$/i}).filter(f=>SCEN.test(f)),...kit.files(dir,{name:/\.(sco|ain)$/i,subs:['','sco','SCO'],max:4000})];}
const engine={id:'alicesoft',hint:'*SA.ALD / System39.ain',scenes,archives:scenes,sources,parse,test:n=>/\.sco$/i.test(n)};
/* a System4 folder: its script is the .ain (original-text.cjs), its .afa / .ald archives are CG and sound only */
function system4(dir){return kit.names(dir).some(n=>/\.ain$/i.test(n)&&!['AINI','AIN2'].includes(kit.head(path.join(dir,n),4).toString('latin1')));}
module.exports={engine,parse,listAld,listAfa,readAin39,walk,scoLines,cali,system4,messageRun};
