'use strict';
/* E592–E596 synthetic files for CMVS, Lucifen, KaGuYa, LC-ScriptEngine and Yuka, written exactly as the readers' header
   comments describe the formats (the encryptors are the inverses of the readers' decryptors). */
const {sjis}=require('./engine-fixtures.cjs');
const cmvs=require('../../services/original-engines/cmvs.cjs'),lucifen=require('../../services/original-engines/lucifen.cjs');
const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b;},i32=v=>{const b=Buffer.alloc(4);b.writeInt32LE(v);return b;},u16=v=>{const b=Buffer.alloc(2);b.writeUInt16LE(v);return b;};
const z=(s,enc=sjis)=>Buffer.concat([Buffer.isBuffer(s)?s:enc(s),Buffer.from([0])]);
const pad4=b=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]);
/* LZSS stream of literals only: one all-literal flag byte per 8 bytes (valid for every Okumura variant) */
const literals=d=>{const out=[];for(let i=0;i<d.length;i+=8)out.push(Buffer.from([0xff]),d.subarray(i,i+8));return Buffer.concat(out);};
const rol8=(b,n)=>((b<<n)|(b>>>(8-n)))&255;
const inverse=t=>{const inv=new Uint8Array(256);for(let i=0;i<256;i++)inv[t[i]]=i;return inv;};

/* ---- CMVS (E592) ------------------------------------------------------------------------------------------------- */
/* items: ['text' | {push:'bgm01.ogg'}] -> PS2A (encrypted, literal-only LZSS) */
function ps2a(items,{enc=sjis,key=0x12345678}={}){const strs=[],code=[];let at=0;
 code.push(Buffer.from([0x05,0x00,0x00,0x00]));
 for(const it of items){const s=z(typeof it==='string'?it:it.push,enc);code.push(Buffer.from([1,2,0x20,1]),u32(at),Buffer.from([0x0f,2,0x30,4]),Buffer.from([0x11,0x00,0x00,0x00]));strs.push(s);at+=s.length;}
 const codeBuf=Buffer.concat(code),text=Buffer.concat(strs),body=Buffer.concat([codeBuf,text]);
 const shift=((key>>>20)%5)+1,k=((key>>>24)+(key>>>3))&255,packed=Buffer.from(literals(body).map(b=>((rol8(b,shift)^k)+0x7c)&255));
 const h=Buffer.alloc(0x30);h.write('PS2A','latin1');h.writeUInt32LE(0x30,4);h.writeUInt32LE(key>>>0,12);h.writeUInt32LE(0,16);h.writeUInt32LE(codeBuf.length,20);h.writeUInt32LE(0,24);h.writeUInt32LE(text.length,28);h.writeUInt32LE(packed.length,36);h.writeUInt32LE(body.length,40);
 return Buffer.concat([h,packed]);}
const rotl=cmvs.rotl,rotr=cmvs.rotr;
function encStage1(d,key,sc){const sk=sc.secret.map(s=>(s-key)>>>0),shift=(((key>>>24)^(key>>>16)^(key>>>8)^key^0xB)&15)+7,n=d.length>>>2;let j=5;
 for(let p=0;p<n;p++){d.writeUInt32LE(((rotl((d.readUInt32LE(p*4)-0x01010101)>>>0,shift)-sc.indexAddend)>>>0^sk[j])>>>0,p*4);j=(j+1)%24;}
 for(let q=n*4,k=d.length&3;k>0;k--,q++){d[q]=(((d[q]+sc.indexSub)&255)^(sk[j]>>>(k*4)))&255;j=(j+1)%24;}}
function encDir(d,len,key4){let seed=0x76548AEF,i=0;for(;i<len>>>2;i++){d.writeUInt32LE(((rotr((d.readUInt32LE(i*4)+seed)>>>0,3)+0x4A91C262)>>>0^key4[i&3])>>>0,i*4);seed=(seed+0x10FB562A)>>>0;}
 for(let q=i*4;q<len;q++,i++)d[q]=(((d[q]-0x37)&255)^(key4[i&3]>>>6))&255;}
function encEntries(d,at,len,key4,seed){let i=0;for(;i<len>>>2;i++){const o=at+i*4;d.writeUInt32LE(((rotr((d.readUInt32LE(o)-0x37A19E8B)>>>0,2)+seed)>>>0^key4[i&3])>>>0,o);seed=(seed-0x139FA9B)>>>0;}
 for(let q=at+i*4;q<at+len;q++,i++)d[q]=(((d[q]-5)&255)^(key4[i&3]>>>4))&255;}
/* files: {'dir/name.ps3': Buffer} ("root" for files without a folder) -> CPZ5/CPZ6, encrypted with the given md5 variant */
function cpz(files,{version=6,variant='Mirai',encrypted=true,master=0x1234ABCD,raw=[0x11111111,0x22222222,0x33333333,0x44444444],entryRaw=0x5555AAAA}={}){
 const sc=cmvs.DEFAULT,v=sc.md5.find(x=>x.name===variant),md5=cmvs.md5Words(raw,v),dirs=new Map();
 for(const [n,b] of Object.entries(files)){const at=n.lastIndexOf('/'),d=at<0?'root':n.slice(0,at);if(!dirs.has(d))dirs.set(d,[]);dirs.get(d).push({name:n.slice(at+1),data:b});}
 const dirKeys=[...dirs.keys()].map((_,i)=>(0x01020304*(i+1))>>>0);let dataAt=0;const dirBufs=[],entBufs=[],datas=[];let entOff=0;
 [...dirs.entries()].forEach(([dn,list],di)=>{const ents=list.map((f,i)=>{const nb=pad4(z(f.name,s=>Buffer.from(s,'latin1'))),e=Buffer.alloc(0x18);e.writeInt32LE(0x18+nb.length,0);e.writeBigInt64LE(BigInt(dataAt),4);e.writeUInt32LE(f.data.length,12);e.writeUInt32LE(0,16);e.writeUInt32LE((0x100+i)>>>0,20);
   f.key=((0x100+i)+dirKeys[di])>>>0;f.offset=dataAt;dataAt+=f.data.length;datas.push(f);return Buffer.concat([e,nb]);});
  const eb=Buffer.concat(ents),nb=pad4(z(dn,s=>Buffer.from(s,'latin1'))),dh=Buffer.alloc(16);dh.writeInt32LE(16+nb.length,0);dh.writeInt32LE(list.length,4);dh.writeInt32LE(entOff,8);dh.writeUInt32LE(dirKeys[di],12);
  dirBufs.push(Buffer.concat([dh,nb]));entBufs.push({eb,dirKey:dirKeys[di],at:entOff});entOff+=eb.length;});
 const dirArea=Buffer.concat(dirBufs),entArea=Buffer.concat(entBufs.map(x=>x.eb)),idx=Buffer.concat([dirArea,entArea]),mk=master>>>0;
 const t1=inverse(cmvs.table(mk,md5[1],sc.factor)),t2=inverse(cmvs.table(mk,md5[2],sc.factor));
 for(const x of entBufs){const at=dirArea.length+x.at;encEntries(idx,at,x.eb.length,md5.map((m,j)=>(m^((x.dirKey+sc.dirAddend[j])>>>0))>>>0),sc.indexSeed);for(let i=at;i<at+x.eb.length;i++)idx[i]=t2[idx[i]]^0x7E;}
 encDir(idx,dirArea.length,[(md5[0]^((mk+0x76A3BF29)>>>0))>>>0,(md5[1]^mk)>>>0,(md5[2]^((mk+0x10000000)>>>0))>>>0,(md5[3]^mk)>>>0]);for(let i=0;i<dirArea.length;i++)idx[i]=t1[idx[i]]^0x3A;
 encStage1(idx,(mk^0x3795B39A)>>>0,sc);
 const k=version===5?[-0x1C5AC27,0x37F298E7,0x7A6F3A2C,0xAE7D39BF,0xFB73A955,0x43DE7C19,0xCC65F415,0xD016A93C,0x97A3BA9A]:[-0x1C5AC26,0x37F298E8,0x7A6F3A2D,0xAE7D39B7,0xFB73A956,0x43DE7C1A,0xCC65F416,0xD016A93D,0x97A3BA9B];
 const h=Buffer.alloc(0x40);h.write('CPZ'+version,'latin1');h.writeInt32LE(dirs.size^k[0],4);h.writeInt32LE(dirArea.length^k[1],8);h.writeInt32LE(entArea.length^k[2],12);
 require('node:crypto').createHash('md5').update(idx).digest().copy(h,0x10);raw.forEach((m,i)=>h.writeUInt32LE((m^k[5+i])>>>0,0x20+i*4));h.writeUInt32LE((mk^k[3])>>>0,0x30);h.writeUInt32LE(((encrypted?1:0)^k[4])>>>0,0x34);h.writeUInt32LE(entryRaw>>>0,0x38);
 let sum=0x923A564C;for(let o=0;o<0x3C;o+=4)sum=(sum+h.readUInt32LE(o))>>>0;h.writeUInt32LE(sum,0x3C);
 const hd=cmvs.header(h),t3=cmvs.table(md5[3],mk,sc.factor),inv3=inverse(t3),low=(md5[1]>>>2)&255,kb=Buffer.alloc(64);for(let i=0;i<16;i++)kb.writeUInt32LE(sc.secret[i],i*4);for(let i=0;i<64;i++)kb[i]=low^t3[kb[i]];
 const enc=datas.map(f=>{const d=Buffer.from(f.data);if(!encrypted)return d;let seed=((((mk^f.key)>>>0)+dirs.size)>>>0);seed=(seed-sc.entrySub)>>>0;seed=(seed^hd.entryKey)>>>0;
  const sk=Array.from({length:16},(_,i)=>(kb.readUInt32LE(i*4)^seed)>>>0);let key=sc.entryInit,kk=sc.entryPos;const n=d.length>>>2;
  for(let i=0;i<n;i++){const p=d.readUInt32LE(i*4);d.writeUInt32LE((((((md5[key&3]^p)>>>0)+seed)>>>0)^(sk[kk]>>>1)^sk[(key>>>6)&15])>>>0,i*4);kk=(kk+1)&15;key=(key+seed+p)>>>0;}
  for(let q=n*4;q<d.length;q++)d[q]=inv3[d[q]]^sc.entryTail;return d;});
 return Buffer.concat([h,idx,...enc]);}

/* ---- Lucifen (E593) ---------------------------------------------------------------------------------------------- */
/* items: [{say:'text', name?, voice?} | {choices:['a','b']}] -> SOB0 */
function sob(items,{enc=sjis,magic='SOB0'}={}){const codeSize=items.length*16+16,res=[],t1=[],t4=[];let at=codeSize;
 items.forEach((it,i)=>{const c=i*16;let rec;
  if(it.choices){const opts=it.choices.map(o=>{const s=z(o,enc);return Buffer.concat([u16(2+s.length),s]);});rec=Buffer.concat([Buffer.from([0]),u16(i),u16(opts.length),...opts]);t1.push([c+8,491]);}
  else{const s=it.name?'#'+it.name+(it.voice?'\\'+it.voice:'')+'$&'+it.say+'$':it.say+'$';rec=Buffer.concat([Buffer.from([0]),u16(i),z(s,enc)]);t1.push([c+8,462]);}
  t4.push([c,at]);res.push(rec);at+=rec.length;});
 /* an unrelated pointer to a UI string must not become a line */
 const ui=z('セーブ',enc);t4.push([items.length*16,at]);res.push(ui);
 const tables=[[],t1,[],[],t4].map(t=>Buffer.concat([u32(t.length),...t.map(([a,b])=>Buffer.concat([u32(a),u32(b)]))])),reloc=Buffer.concat(tables),payload=Buffer.concat([Buffer.alloc(codeSize),...res]);
 return Buffer.concat([Buffer.from(magic,'latin1'),u32(reloc.length),reloc,u32(codeSize),u32(payload.length),payload]);}
/* names -> serialized letter trie (letter, u32 relative offset; letter 0 = leaf with the entry number) */
function trie(names){const node=list=>{const groups=new Map();for(const [n,id] of list){const c=n.length?n[0]:0;if(!groups.has(c))groups.set(c,[]);groups.get(c).push([n.slice(1),id]);}
  const kids=[...groups.entries()],headLen=1+kids.length*5,subs=[];let at=headLen;const head=Buffer.alloc(headLen);head[0]=kids.length;
  kids.forEach(([c,l],i)=>{const field=1+i*5;head[field]=c;if(c===0){head.writeInt32LE(l[0][1],field+1);return;}const sb=node(l);head.writeInt32LE(at-(field+5),field+1);subs.push(sb);at+=sb.length;});
  return Buffer.concat([head,...subs]);};
 return node(names.map((n,i)=>[[...Buffer.from(n,'latin1')],i]));}
/* files: {name: Buffer} -> LPK1 named basename, flags 2|4|8|0x10 by default */
function lpk(files,{basename='SCRIPT',scheme=lucifen.DEFAULT[0],flags=0x1e}={}){const names=Object.keys(files),[k1,k2]=lucifen.fileKeys(basename,scheme);
 const datas=names.map(n=>{let d=Buffer.from(files[n]);if(flags&4)lucifen.cryptEntry(d,Math.min(d.length,0x100),k1,scheme.pattern);if(flags&0x10)d=Buffer.from(d.map(b=>rol8(b,4)^scheme.xor));return {raw:files[n],body:flags&8?literals(d):d};});
 const t=trie(names),size=(flags&8)?13:9,entries=Buffer.alloc(size*names.length),idxLen=4+1+1+4+t.length+entries.length;let at=8+idxLen;
 datas.forEach((d,i)=>{let p=i*size;if(size&1)entries[p++]=0;entries.writeUInt32LE(at,p);entries.writeUInt32LE(d.body.length,p+4);if(flags&8)entries.writeUInt32LE(d.raw.length,p+8);at+=d.body.length;});
 const idx=Buffer.concat([u32(names.length),Buffer.from([0,1]),u32(t.length),t,entries]);
 /* whole dwords are encrypted, a tail of 1–3 bytes stays plain (as the engine does) */
 lucifen.cryptIndex(idx,idx.length,k2,scheme.pattern);const code=((idx.length&0xffffff)|(flags<<24))>>>0;
 return Buffer.concat([Buffer.from('LPK1','latin1'),u32((code^k2)>>>0),idx,...datas.map(d=>d.body)]);}

/* ---- KaGuYa (E594) ----------------------------------------------------------------------------------------------- */
/* groups: [{name|null, msgs:['…']}], choices: ['…'] -> message.dat ver4 */
function kaguya4(groups,choices,{enc=sjis,key=0}={}){const x=b=>key?Buffer.from(b.map(c=>c^key)):b;const names=[...new Set(groups.map(g=>g.name).filter(Boolean))];
 const str=s=>{const b=enc(s);const l=Buffer.alloc(2);l.writeInt16LE(b.length);return Buffer.concat([l,x(b)]);};
 const msgs=groups.flatMap(g=>g.msgs),blocks=msgs.map(m=>{const t=enc(m),blk=Buffer.concat([i32(t.length),t,Buffer.from([1]),Buffer.from('v001\0','utf16le')]);return Buffer.concat([i32(blk.length),x(blk)]);});
 let mi=0;const gs=groups.map(g=>Buffer.concat([i32(g.name?names.indexOf(g.name):-1),Buffer.from([g.msgs.length]),...g.msgs.map(()=>i32(mi++))]));
 const h=Buffer.alloc(0x15);h.write('[SCR-MESSAGE]ver4.0','latin1');if(key){h[0x13]=1;h[0x14]=key;}
 return Buffer.concat([h,i32(names.length),...names.map(str),i32(choices.length),...choices.map(str),i32(msgs.length),...blocks,i32(groups.length),...gs]);}
/* blocks: [{name, texts:['…']} | {choice:'…'}] -> early message.dat (version "ver2": its last byte 0x32 is ≥ 3, so 2 more header bytes) */
function kaguyaEarly(blocks,{enc=sjis}={}){const body=blocks.map(b=>{const p=b.choice!==undefined?Buffer.concat([z(b.choice,enc),Buffer.from([0])]):Buffer.concat([z(b.name,enc),Buffer.from([b.texts.length,0]),...b.texts.map(t=>z(t,enc))]);
  return Buffer.concat([u32(p.length),Buffer.from(p.map(c=>c^0xff))]);});
 return Buffer.concat([Buffer.from('[SCR-MESSAGE]ver2','latin1'),Buffer.from([0,0]),...body,u32(0)]);}
/* files: {name: Buffer} -> WFL1 archive (mode 0 members) */
function wfl1(files){return Buffer.concat([Buffer.from('WFL1','latin1'),...Object.entries(files).map(([n,d])=>{const nb=Buffer.from(sjis('\\'+n).map(c=>c^0xff));return Buffer.concat([i32(nb.length),nb,u16(0),u32(d.length),d]);})]);}

/* files: {name: Buffer} -> LINK4 archive (plain members): records {u32 size, u16 flags, 7 bytes, u8 name length, 2 bytes, name} */
function link4(files){const recs=Object.entries(files).map(([n,d])=>{const nb=Buffer.from(n,'latin1'),head=Buffer.concat([Buffer.alloc(4),u16(0),Buffer.alloc(7),Buffer.from([nb.length,0,0]),nb]);const r=Buffer.concat([head,d]);r.writeUInt32LE(r.length,0);return r;});
 const h=Buffer.alloc(0xA);h.write('LINK4','latin1');return Buffer.concat([h,...recs,u32(0)]);}

/* ---- LC-ScriptEngine (E595) -------------------------------------------------------------------------------------- */
/* items: ['name\x01text' | {choices:['a','b']} | {sys:'bg01'}] -> SNX XOR key */
function snx(items,{enc=sjis,key=2}={}){const strs=[],ins=[];let off=0;const add=s=>{const b=z(s,enc),p=off;strs.push(Buffer.concat([u32(b.length),b]));off+=4+b.length;return p;};
 for(const it of items){if(typeof it==='string'){ins.push([0x11,2,add(it)],[0x0d,0x2c,0]);}
  else if(it.choices){ins.push([0x11,2,add(it.choices[0])],[0x11,2,add(it.choices[1])],[0x0d,0x4f,0]);}
  else ins.push([0x11,2,add(it.sys)],[0x05,1,0]);}
 const table=Buffer.concat(strs),out=Buffer.concat([u32(ins.length),u32(table.length),...ins.map(([a,b,c])=>Buffer.concat([u32(a),u32(b),u32(c)])),table]);
 return key?Buffer.from(out.map(c=>c^key)):out;}
/* files: {name (no extension): {data, type}} -> {lst, pack} with index key */
function lcsePack(files,{key=1}={}){const kk=(key*0x01010101)>>>0,names=Object.keys(files);let at=0;const ents=[],datas=[];
 for(const n of names){const f=files[n],e=Buffer.alloc(76);e.writeUInt32LE((at^kk)>>>0,0);e.writeUInt32LE((f.data.length^kk)>>>0,4);const nb=sjis(n);for(let i=0;i<nb.length;i++)e[8+i]=nb[i]^key;e.writeUInt32LE((f.type^kk)>>>0,72);ents.push(e);datas.push(f.data);at+=f.data.length;}
 return {lst:Buffer.concat([u32((names.length^kk)>>>0),...ents]),pack:Buffer.concat(datas)};}

/* ---- Yuka (E596) ------------------------------------------------------------------------------------------------- */
/* items: [{name:'…'} | {say:'…'} | {call:'Wait', args:[n]}] -> YKS001 (data XOR 0xAA when encrypted) */
function yks(items,{enc=sjis,encrypted=true}={}){const data=[],els=[],code=[];let dat=0;const put=b=>{const p=dat;data.push(b);dat+=b.length;return p;};
 const func=new Map(),el=(type,f1,f2,f3)=>{els.push([type,f1,f2,f3]);return els.length-1;};
 const fn=n=>{if(!func.has(n))func.set(n,el(0,put(z(n,s=>Buffer.from(s,'latin1'))),0,0));return func.get(n);};
 const cstr=s=>el(5,0,put(z(s,enc)),0),cint=v=>el(4,0,put(i32(v)),0);
 code.push(el(1,put(z('{',s=>Buffer.from(s,'latin1'))),put(i32(-1)),0));
 for(const it of items){if(it.name!==undefined){code.push(fn('NameOut'),1,cstr(it.name));}else if(it.say!==undefined){code.push(fn('StrOut'),1,cstr(it.say));}
  else{code.push(fn(it.call),it.args.length,...it.args.map(a=>typeof a==='number'?cint(a):cstr(a)));}}
 const dataBuf=Buffer.concat(data),codeBuf=Buffer.concat(code.map(u32)),idxBuf=Buffer.concat(els.map(e=>Buffer.concat(e.map(u32)))),H=0x30;
 const h=Buffer.alloc(H);h.write('YKS001','latin1');h.writeInt16LE(encrypted?1:0,6);h.writeInt32LE(H,8);h.writeUInt32LE(H,0x10);h.writeUInt32LE(code.length,0x14);h.writeUInt32LE(H+codeBuf.length,0x18);h.writeUInt32LE(els.length,0x1C);h.writeUInt32LE(H+codeBuf.length+idxBuf.length,0x20);h.writeUInt32LE(dataBuf.length,0x24);
 return Buffer.concat([h,codeBuf,idxBuf,encrypted?Buffer.from(dataBuf.map(c=>c^0xaa)):dataBuf]);}
function ykc(files){const names=Object.keys(files);let at=0x18;const datas=[],offs=[];for(const n of names){offs.push(at);datas.push(files[n]);at+=files[n].length;}
 const nameOffs=[],nameBufs=[];for(const n of names){const b=z(n);nameOffs.push(at);nameBufs.push(b);at+=b.length;}
 const idx=Buffer.concat(names.map((n,i)=>Buffer.concat([u32(nameOffs[i]),u32(nameBufs[i].length),u32(offs[i]),u32(datas[i].length),u32(0)])));
 const h=Buffer.alloc(0x18);h.write('YKC001\0\0','latin1');h.writeUInt32LE(0x18,8);h.writeUInt32LE(at,0x10);h.writeUInt32LE(idx.length,0x14);
 return Buffer.concat([h,...datas,...nameBufs,idx]);}
module.exports={link4,ps2a,cpz,sob,lpk,trie,kaguya4,kaguyaEarly,wfl1,snx,lcsePack,yks,ykc,literals};
