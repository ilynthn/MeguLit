// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E645–E652 engines of family F4a whose archives are documented but whose script grammar is not public: each opens its
   own archive (or loose files), takes the entries that are not images / sound / video, and reads them with the generic
   kana scan (kit.decodeRuns). A Chinese patch packed the same way pairs line for line; the grammar of each still needs a
   real game (see ENGINE-ADAPTATION-NOTES E645–E652). Format references, all read from GARbro (morkt, MIT) unless named:
     ism        ArcFormats/Ism/ArcISA.cs      "ISM ARCHIVED", i16 count @0x0C, u16 version @0x0E (bit 15 encrypted
                                              index, not handled); entries from 0x10: name[0x0C] + 0x14 bytes (or
                                              name[0x30] + 0x10 bytes for version 1), offset at +4, size at +8 after the name
     glib2      ArcFormats/Glib2/ArcG2.cs     header 0x5C bytes under the scheme of key 0x8465B49B, "GLibArchiveData2."
                                              + '0' | '1'; index @0x54 size @0x58 decrypted by the schemes of the keys @0x44,
                                              0x34, 0x24, 0x14 in turn -> "CDBD", count, info base; 0x18-byte records {name
                                              offset, …, parent, attr 0x100 = file, info offset}; file info: size +8, offset
                                              +0xC, four chunk keys +0x10/+0x20/+0x30/+0x40; data in 0x20000-byte chunks,
                                              chunk k decrypted by key k & 3. A scheme is picked from 900 hashes of key ×
                                              0x5F >> 13: byte orders and two of six byte permutations
     cyberworks ArcFormats/Cyberworks/ArcDAT.cs  (C,system / TinkerBell) Arc04.dat is indexed by Arc01.dat (4→1, 5→2,
                                              6→3, 8→7; a letter after the digit picks the sub-archive): the index file is
                                              8 + 8 digits (byte ^ 0x7F, 0xFF = none: unpacked, packed) + LZSS; records
                                              {u32 size, u32 id, u32 unpacked, u32 packed, u32 offset, type[2], [u32, u8
                                              archive]}; older Arc02 / Arc03 / Arc05 use Arc00 / 01 / 04 with 4 digits and
                                              CSV lines "name,unpacked,packed,offset,type". Packed entries LZSS
     tanuki     ArcFormats/TanukiSoft/ArcTAC.cs  "TArc1.00" / "TArc1.10", count @0x14, buckets @0x18, index size @0x1C;
                                              index at 0x24 / 0x2C, Blowfish "TLibArchiveData" then zlib: buckets {u16 hash,
                                              u16 count, i32 first}, entries {u64 hash, i32 packed, u32 unpacked, u32 offset,
                                              u32 size}; packed entries zlib, others Blowfish with key "<hash>_tlib_secure_"
                                              (hash = entry hash << 16 | bucket hash, in decimal)
     yaneurao   Legacy/Yaneurao/ArcDAT.cs, ArcSDA.cs  "yanepkDx" (entries {name[0x100], offset, unpacked, size}),
                                              "yanepkEx" (count @8, {name[0x20], …}), "SQDARC" (folders {offset, count,
                                              name[10], ext[4]} of {name[0x28], offset, size}); packed entries LZSS
     rits       ArcFormats/Rits/ArcSAF.cs     u16 id 0x5xx / 0x6xx, u16 count: v5 records of 0x20 {name[0x14] (top bit of
                                              the first byte = folder), offset << 11, size, unpacked} (id 0x501 XOR from
                                              0xDF up per record); v6 {name offset, offset << 11, size, unpacked} + names
                                              (odd id: XOR from 0xEF up per record, names XOR from 0xFF down); packed: LZSS
                                              when id & 2, else zlib. Scripts are .str text
     bluegale   ArcFormats/BlueGale/ArcSNN.cs  <name>.snn indexed by <name>.inx: count, {name[0x40], offset, size}
     dxlib      DxArchive through the WOLF reader (wolf.cjs, unencrypted archives); DxLib titles write their own script
                                              formats, so only the scan applies
     slg        ArcFormats/Slg/ArcSZS.cs, ArcSPD.cs and TesterTesterov SLGSystemScriptTool SLG_Crypto.py (GPL-2.0):
                                              "SZS<d>0__" (count @0x0C, {name[0x100] ';' = '/', i64 offset, u32 size}, data
                                              XOR 0x90); .spd indexed by .spl ("SFP\0", align @0x0C, {name offset, size,
                                              offset × align} from 0x20); .sd code XORed with the MSVC rand() stream of a
                                              title key (the tool's known keys) — the key that turns the first five bytes
                                              into one of the tool's known openings is used */
const path=require('node:path'),zlib=require('node:zlib'),kit=require('./kit.cjs');
const {Blowfish}=require('./blowfish.cjs');

const MEDIA=/\.(png|bmp|jpe?g|gif|tga|dds|webp|ogg|wav|mp3|m4a|opus|flac|mpe?g|wmv|avi|mp4|webm|ogv|ttf|otf|ttc|fnt|psd|ico|cur|dll|exe|mid|midi)$/i;
const MEDIA_MAGIC=['OggS','RIFF','\x89PNG','BM','\xff\xd8','GIF8','ID3','fLaC','MZ','\x1aE\xdf\xa3','\0\0\0\x18ftyp','\0\0\0\x20ftyp'];
const isMedia=b=>{const t=b.subarray(0,12).toString('latin1');return MEDIA_MAGIC.some(m=>t.startsWith(m));};
function parse(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf);if(!b.length||isMedia(b))return {lines:[],anchors:[]};return {lines:kit.decodeRuns(b),anchors:[]};}
/* engine(): an archive family read with the scan. list(file) -> [{name, offset, size, read?}] | null */
function scanEngine({id,hint,name,magic,subs,list,read,loose,find}){
 return kit.engine({id,hint,archives:{name,magic,subs,find,list:f=>{const l=list(f);if(!l)return null;const keep=l.filter(e=>!MEDIA.test(e.name)&&e.size<(16<<20));return keep.length?keep:null;},read,keepPath:false},
  loose,parse,test:n=>!!loose&&loose.name.test(n)});}

/* ---- ISM ---------------------------------------------------------------------------------------------------------- */
function ismList(file){const h=kit.head(file,0x10);if(h.length<0x10||h.toString('latin1',0,12)!=='ISM ARCHIVED')return null;const count=h.readInt16LE(0x0c),version=h.readUInt16LE(0x0e)&0x7fff;if(count<=0)return null;
 const size=kit.size(file),idx=kit.readAt(file,0x10,count*0x40);
 const read=(nl,rl)=>{const out=[];let p=0;for(let i=0;i<count;i++){if(p+nl+12>idx.length)return null;const nb=kit.cstr(idx,p,p+nl);if(!nb||!nb.length||nb.some(c=>c<0x20))return null;
  const offset=idx.readUInt32LE(p+nl+4),sz=idx.readUInt32LE(p+nl+8);if(offset+sz>size)return null;out.push({name:kit.SJIS.decode(nb),offset,size:sz});p+=nl+rl;}return out;};
 return (version!==1?read(0x0c,0x14):null)||read(0x30,0x10);}

/* ---- GLib2 -------------------------------------------------------------------------------------------------------- */
const G2_HASHES='0df0b0b745b8c9b4cfb3f0b0a85f2c0b648dd4e111eadaa7fb5fe83a82a40f5dae646f6fec17040e25f2d2a13f4e9eb3a3c3126ccbe385976e19a4e5644ebd1243ff635db5fb8b1e7840ffb863858c222d2f479b185c19700c73e029e04df855a1f2dce5464b997a50f3c59d4fcf443403e64440b794ad98c4d3851c76430824624bf3088bc98fcd080528c67fda7171c93c3f85e0b964a8bf465652ebaa95074df4692c773d65cf22987d43c1f22de86758ea018b65e7fe54668f5944b21ccb92dab384c5c45179dc2ebc2aa07d74d534920bf6c3f5b68caabb114eb7b86636a419f92fe2b4273bcc0b4f642efebf77d00a4fa91aff5930c18b80bd22d2d8d28b8c1f8c6b4127a1e38af328910b6d9181a2c5aee7b998f7044d7851cf135ee38c5a5d13e3a9559960be077581ac63c880a11eabc3eb284729c65d02b5dbda13c3db8b4c034789b1874334079870a97dbc0f2452e7b510161759e21941fe6bee2eb6ae159010d4867c58bd7fbdc95385c1df55fd15439dd2df04561cb1840e81b14523d7bba84c08c6dc68feb6fca2e149c24c6e84743fbc4059e75cf74825423e891932aec31a7132295f8fdf6434eab7afbea45129ba1b00a007313f101b52d0d6cb010cd2c522aaf53b347eea1fe8ae3b144dca143cd49afb673a3b415ea08a5f02897ddc9fbb75dc59d3490783d5747cfc0d650bba84f6cf21afff7eacbac8e14dbbcbd934152bbb6da3349ed30bcedb739ee0f3cb447e1f274b3fceeec843067ec34cbf766b582c47d1688e15bceeead2b88674088be90e3a3ff70a239368b3871ef6fc4631fead89b51242d68c1214028ae3f3bc86679eb3012827c90fa4dd0e14422546ef0c6912bba14b431950541bbe114429b874e794c8a2172001e86f01b34713737a45b268bb86fd696db6040d2ec6436f656ec4cbc0e505067764276481b195e8774216d938d165bb7099801f0aa96c1db97b0ab400c63617ea129a46f840dcedc07bc5452115e5b0f54e1dd7aff85cf100490e74e69d7e112d50636704e9b9a519a6260cbc58808224f7062a08317b2e8646cffe7e9d15bc5e35fc9bcda1b09191fbfc54d9e1b3d381e3da41bdd27d9b0cbab2c6fab910d4c1ab62756dd4ffe1c4c05232e260636cdf8bd6bce0802663e8220198005572674cdd3b1e95e9ef698ef509a410ca5fd175b525ad0f4e443e58554e97b350f58bac5a3277aad14f3ed878925a020e668269120aadea82a1e1f08b35e7e1fd1ffd657e3ab4b75ffcf75ab2db5eeae63e13c7b5f902b99f2e620a210810bbb1246617774d49a593cdedeca50b79968e82178287a51d088c2372085fd53ffce23c182c0338a32b9c08907cdf0eaf615613acb78aa9f1ba6ac2cad5ed602c74a1724dc430ce02ab3c3c260eaeddcd278d188e4e94cd8a82573a84a85b108e931db28d7eb892cd2e4d24c8fd571d978e94e27471288c87227b9248ed2583be7f0d86347b90ee955f627764e3dafebc9b96ceebe4efba6c1942a8c2dea5fd68bdd46955116c69671e2e77cf3b205288ec6577ed28a811b7f5213f1f24eeb59511c44d6532d969aa6bf7e7c645c868b65b0029ead258a401539e906e05dc612f9b8cd4cc135621056cc7a3d66640cc4ed960710e4223e5e18f112648892af2acbb2ad3dc2b54e814789ff39dd063bb0430e5d491c9b055e9256292622814de4d80962a801e15762d36e3c36f7f07eaaa9fcae98f76d1cbe490695698ca4db0922e3e051538ffa34a24046779407b14d4e8a9e8f9d2ddd3cef23a55f118d0f25688e2bec0edfed333b1ac96a6f20f0be5960a88b346220818a1ae407ecca2e4b661bdeec14cd21882807f618fa34aa3a61bdd56b4ade4365af9e59586036ff3bf3f2fcdd446475a508fc27e60969a4219c46109ec7a5937218f6fff2033922c5c66c20de424f193159dcf987ae079baf8ac09270bace3f426a71c7c8d055a6a6a856947eb0703f4166f8de4fb48f82839775a674d08838dcbb8d7370efeed83f808b4ac721e1f51d55cd2e0e243301f463026d73d02c71e14f0e56aabc726b716091a11ada1cb416c4f84f2b45d1ce370a3966143746c5ae76c7333e26defa8f66a6e77f1ccb7e8043396f687798181f982d352633889e99c7530f74b4a2b4ee9421a26b237d4f45300c4d058efa81dd7331a6c8096a37c9b5b390de007ed2f8287a549b63ba3e4f115cd68f39ad1253f1647cd582e508ded45907360ef2591f9627c2eadb12fb5376f4f41a24a2aaafa2b5fa6adcf1644575e8583055d2ae7a51527005fc36001cb0e13517c19bfd3f360706c122764113649f8437cfe5dc3640d7e05251c8edf1f3139f8075b3bba75b84cbcaa60e1d435c93516b0d07b3bf8616b87336217047f1c587b966bd7dfbe5d82efe193d841bc829af9852670188e135e23f49d403591182c41826c561a5e7b38d4c2635979b15a4d89c11c85160343f590ff3883854b5beef299b4b11b94d68961e9f93138b3a009cc7a4f47dee478d9ffe62c94536d0c2fc27444';
const G2H=new Map();for(let i=0;i<G2_HASHES.length/4;i++)G2H.set(parseInt(G2_HASHES.substr(i*4,4),16),i);
const ORDERS=[[3,2,1,0],[0,2,1,3],[1,0,3,2],[3,0,2,1],[2,1,3,0],[3,2,1,0]];
const rotr=(x,n)=>kit.ror(x&255,n),rotl=(x,n)=>kit.rol(x&255,n);/* E605 kit rol/ror */
const PERMS=[(i,x)=>rotr(x,i),(i,x)=>x^i,(i,x)=>~x,(i,x)=>~(x-100),(i,x)=>x+i,(i,x)=>rotl(x,4)];
/* the inverse of each permutation, for building test archives: inv[k](i, y) gives x with PERMS[k](i, x) & 255 === y */
const PERMS_INV=[(i,y)=>rotl(y,i),(i,y)=>(y^i)&255,(i,y)=>~y&255,(i,y)=>((~y)+100)&255,(i,y)=>(y-i)&255,(i,y)=>rotr(y,4)];
function g2Scheme(key){const i=G2H.get((Math.imul(key>>>0,0x5f)>>>13)&0xffff);if(i===undefined)return null;
 const src=Math.floor(i/150);let dst=Math.floor(i/30)-5*src;if(dst>=src)dst++;const second=Math.floor(i/5)%6;let first=i%5;if(first>=second)first++;
 return {src:ORDERS[src],dst:ORDERS[dst],first,second};}
function g2Decrypt(sc,input){const out=Buffer.alloc(input.length),n=input.length&~3;let i=0;
 for(;i<n;i++){const s=(i&~3)+sc.src[i&3],d=(i&~3)+sc.dst[i&3];out[d]=PERMS[sc.second](i,PERMS[sc.first](i,input[s]))&255;}
 for(;i<input.length;i++)out[i]=PERMS[sc.second](i,PERMS[sc.first](i,input[i]))&255;return out;}
function g2Encrypt(sc,plain){const out=Buffer.alloc(plain.length),n=plain.length&~3;let i=0;
 for(;i<n;i++){const s=(i&~3)+sc.src[i&3],d=(i&~3)+sc.dst[i&3];out[s]=PERMS_INV[sc.first](i,PERMS_INV[sc.second](i,plain[d]));}
 for(;i<plain.length;i++)out[i]=PERMS_INV[sc.first](i,PERMS_INV[sc.second](i,plain[i]));return out;}
const G2_HEADER_KEY=0x8465b49b;
function g2List(file){const h0=kit.head(file,0x5c);if(h0.length<0x5c)return null;const h=g2Decrypt(g2Scheme(G2_HEADER_KEY),h0);if(h.toString('latin1',0,17)!=='GLibArchiveData2.'||h[0x12]!==0||(h[0x11]!==0x30&&h[0x11]!==0x31))return null;
 const at=h.readUInt32LE(0x54),len=h.readUInt32LE(0x58),size=kit.size(file);if(at+len>size)return null;let idx=kit.readAt(file,at,len);
 for(const k of [0x44,0x34,0x24,0x14]){const sc=g2Scheme(h.readUInt32LE(k));if(!sc)return null;idx=g2Decrypt(sc,idx);}
 if(idx.toString('latin1',0,4)!=='CDBD')return null;const count=idx.readInt32LE(4),info=0x10+idx.readInt32LE(8),names=0x10+count*0x18;if(count<=0||names>idx.length)return null;
 const all=[],out=[];for(let i=0;i<count;i++){const p=0x10+i*0x18,nb=kit.cstr(idx,names+idx.readInt32LE(p),info),parent=idx.readInt32LE(p+8),attr=idx.readInt32LE(p+12);let name=nb?kit.SJIS.decode(nb):'';
  if(parent>=0&&parent<all.length)name=all[parent]+'/'+name;all.push(name);if(attr!==0x100)continue;const q=info+idx.readInt32LE(p+0x10);if(q+0x44>idx.length)return null;
  const sz=idx.readUInt32LE(q+8),offset=idx.readUInt32LE(q+12);if(offset+sz>size)return null;out.push({name,offset,size:sz,keys:[0,1,2,3].map(j=>idx.readUInt32LE(q+0x10+j*0x10))});}
 return out;}
function g2Read(file,e){const b=kit.readAt(file,e.offset,e.size),dec=e.keys.map(g2Scheme),out=Buffer.alloc(b.length);
 for(let o=0,k=0;o<b.length;o+=0x20000,k=(k+1)&3){const chunk=b.subarray(o,Math.min(b.length,o+0x20000));(dec[k]?g2Decrypt(dec[k],chunk):chunk).copy(out,o);}return out;}

/* ---- Cyberworks (C,system) ---------------------------------------------------------------------------------------- */
function tocUnpack(file,digits){const b=kit.head(file,1<<26);if(b.length<=digits*2)return null;
 const num=at=>{let v=0,r=1;for(let i=digits-1;i>=0;i--,r*=10){const c=b[at+i];if(c!==0xff)v+=(c^0x7f)*r;}return v;};
 const unpacked=num(0),packed=num(digits);if(unpacked<=4||unpacked>0x1000000||!packed||packed>b.length-digits*2)return null;
 const out=kit.lzss(b.subarray(digits*2,digits*2+packed),unpacked);return out.length===unpacked?out:null;}
function cwTocOf(file){const dir=path.dirname(file),n=path.basename(file);let m=/^(.+)(\d)([a-z])?(\.[^.]*)?$/i.exec(n);
 if(m){const num=m[2],idx=num>='4'&&num<='6'?num-3:num==='8'?7:null;if(idx!==null){const toc=path.join(dir,m[1]+idx+(m[4]||'')),arc=m[3]?m[3].toUpperCase().charCodeAt(0)-64:0;if(kit.isFile(toc))return {toc,arc,binary:true};}}
 m=/^Arc0(\d)\.(.*)$/i.exec(n);if(m){const map={2:0,3:1,5:4}[m[1]];if(map!==undefined){const toc=path.join(dir,'Arc0'+map+'.'+m[2]);if(kit.isFile(toc))return {toc,arc:0,binary:false};}}
 return null;}
function cwList(file){const t=cwTocOf(file);if(!t)return null;const size=kit.size(file),out=[];
 if(t.binary){const toc=tocUnpack(t.toc,8);if(!toc||toc.length<4)return null;let p=0;
  while(p+4<=toc.length){const es=toc.readInt32LE(p);if(es<0x11||p+4+es>toc.length)return out.length?out:null;const q=p+4,id=toc.readUInt32LE(q),unpacked=toc.readUInt32LE(q+4),sz=toc.readUInt32LE(q+8),offset=toc.readUInt32LE(q+12);
   const t0=toc[q+16],t1=toc[q+17];let arc=0;if(es>=0x17)arc=toc[q+22];p=q+es;if(arc!==t.arc||offset+sz>size)continue;
   let ext=t0>0x20&&t0<0x7f?String.fromCharCode(t0)+(t1>0x20&&t1<0x7f?String.fromCharCode(t1):''):'';if(/^(b0?|n0|o0|0b|j0?|k0?|u0)$/.test(ext))continue;
   out.push({name:String(id).padStart(6,'0')+(ext?'.'+ext:''),offset,size:sz,unpacked});}
  return out;}
 const toc=tocUnpack(t.toc,4);if(!toc)return null;for(const line of toc.toString('latin1').split(/\r?\n/)){const f=line.split(',');if(f.length!==5)continue;if(/^[bjk]$/.test(f[4]))continue;
  const unpacked=+f[1],sz=+f[2],offset=+f[3];if(!(offset+sz<=size))return null;out.push({name:f[0]+'.'+f[4],offset,size:sz,unpacked});}
 return out;}
const cwRead=(file,e)=>{const b=kit.readAt(file,e.offset,e.size);return e.unpacked!==e.size?kit.lzss(b,e.unpacked):b;};
const cwFind=dir=>kit.names(dir).filter(n=>/\.(dat|app)$/i.test(n)).map(n=>path.join(dir,n)).filter(f=>!!cwTocOf(f));

/* ---- Tanuki (TAC) ------------------------------------------------------------------------------------------------- */
function tacList(file){const h=kit.head(file,0x2c);if(h.length<0x2c||h.toString('latin1',0,4)!=='TArc')return null;const ver=h.toString('latin1',4,8);if(ver!=='1.00'&&ver!=='1.10')return null;
 const count=h.readInt32LE(0x14),buckets=h.readInt32LE(0x18),isz=h.readUInt32LE(0x1c),at=ver==='1.10'?0x2c:0x24,base=at+isz,size=kit.size(file);if(count<=0||count>500000||buckets<0||base>size)return null;
 const enc=kit.readAt(file,at,isz);new Blowfish('TLibArchiveData').decryptBuffer(enc.subarray(0,enc.length&~7));let idx;try{idx=zlib.inflateSync(enc);}catch{return null;}
 if(idx.length<buckets*8+count*24)return null;const out=[];
 for(let i=0;i<count;i++){const p=buckets*8+i*24;out.push({hash:idx.readBigUInt64LE(p),packed:idx.readInt32LE(p+8)!==0,unpacked:idx.readUInt32LE(p+12),offset:base+idx.readUInt32LE(p+16),size:idx.readUInt32LE(p+20)});}
 for(let b=0;b<buckets;b++){const bh=idx.readUInt16LE(b*8),n=idx.readUInt16LE(b*8+2),first=idx.readInt32LE(b*8+4);for(let k=0;k<n&&first+k<out.length;k++){const e=out[first+k];e.hash=((e.hash<<16n)|BigInt(bh))&0xffffffffffffffffn;}}
 for(const e of out){e.name=e.hash.toString(16).toUpperCase().padStart(16,'0');if(e.offset+e.size>size)return null;}
 return out;}
function tacRead(file,e){const b=kit.readAt(file,e.offset,e.size);if(e.packed){try{return zlib.inflateSync(b);}catch{return Buffer.alloc(0);}}
 const o=Buffer.from(b);new Blowfish(Buffer.from(e.hash.toString()+'_tlib_secure_','latin1')).decryptBuffer(o.subarray(0,o.length&~7));return o;}

/* ---- Yaneurao ----------------------------------------------------------------------------------------------------- */
function yaneList(file){const h=kit.head(file,0x120);if(h.length<0x18)return null;const tag=h.toString('latin1',0,8),size=kit.size(file),sj=kit.SJIS,out=[];
 const rec=(idx,count,nl,start)=>{for(let i=0;i<count;i++){const p=start+i*(nl+12);if(p+nl+12>idx.length)return null;const nb=kit.cstr(idx,p,p+nl);if(!nb||!nb.length)return null;const offset=idx.readUInt32LE(p+nl),unpacked=idx.readUInt32LE(p+nl+4),sz=idx.readUInt32LE(p+nl+8);if(offset+sz>size)return null;out.push({name:sj.decode(nb).replace(/\\/g,'/'),offset,size:sz,unpacked});}return out;};
 if(tag==='yanepkDx'&&h.length>=0x110){const first=h.readUInt32LE(0x10c);if(first<0x118||first>=size)return null;const count=Math.floor((first-0xc)/0x10c);return rec(kit.readAt(file,0,first),count,0x100,0xc);}
 if(tag==='yanepkEx'){const count=h.readInt32LE(8);if(count<=0||count>100000)return null;return rec(kit.readAt(file,0,0xc+count*0x2c),count,0x20,0xc);}
 if(tag.startsWith('SQDARC')){const dirs=h.readInt32LE(0x10);if(dirs<=0||dirs>10000)return null;const top=kit.readAt(file,0x14,dirs*0x18);
  for(let d=0;d<dirs;d++){const q=d*0x18;let at=top.readUInt32LE(q);const n=top.readInt32LE(q+4),ext=kit.cstr(top,q+0x12,q+0x16)?.toString('latin1')||'';if(n<0||n>100000)return null;const blk=kit.readAt(file,at,n*0x30);
   for(let i=0;i<n;i++){const p=i*0x30,nb=kit.cstr(blk,p,p+0x28);if(!nb)return null;const base=sj.decode(nb).replace(/\.[^.]*$/,''),offset=blk.readUInt32LE(p+0x28),sz=blk.readUInt32LE(p+0x2c);if(offset+sz>size)return null;out.push({name:base+(ext?'.'+ext:''),offset,size:sz,unpacked:sz});}}
  return out;}
 return null;}
const yaneRead=(file,e)=>{const b=kit.readAt(file,e.offset,e.size);return e.unpacked!==e.size?kit.lzss(b,e.unpacked):b;};

/* ---- Rits (SAF) --------------------------------------------------------------------------------------------------- */
function safList(file){const h=kit.head(file,8);if(h.length<8)return null;const id=h.readUInt16LE(0),count=h.readInt16LE(2),size=kit.size(file),out=[];if(count<=0)return null;
 if((id&0xff00)===0x500){const idx=kit.readAt(file,4,count*32);if(idx.length<count*32)return null;if(id===0x501)for(let i=0;i<count;i++){let k=0xdf;for(let j=0;j<32;j++)idx[i*32+j]^=(k++)&255;}
  for(let i=0;i<count;i++){const p=i*32;if(idx[p]>0x7f)continue;const nb=kit.cstr(idx,p,p+0x14);if(!nb||!nb.length)return null;const offset=idx.readUInt32LE(p+0x14)*2048,sz=idx.readUInt32LE(p+0x18),unpacked=idx.readUInt32LE(p+0x1c);if(offset+sz>size)return null;
   out.push({name:kit.SJIS.decode(nb).trimEnd(),offset,size:sz,unpacked,lzss:false});}
  return out;}
 if((id&0xff00)===0x600){const nlen=h.readInt32LE(4);if(nlen<=0||nlen>=size)return null;const idx=kit.readAt(file,8,count*16),names=kit.readAt(file,8+count*16,nlen);
  if(id&1){for(let i=0;i<count;i++){let k=0xef;for(let j=0;j<16;j++)idx[i*16+j]^=(k++)&255;}let k=0xff;for(let i=0;i<names.length;i++){names[i]^=k;k=(k-1)&255;}}
  for(let i=0;i<count;i++){const p=i*16;if(idx[p+3]>0x7f)continue;const nb=kit.cstr(names,idx.readUInt32LE(p)&0x7fffffff);if(!nb||!nb.length)return null;const offset=idx.readUInt32LE(p+4)*2048,sz=idx.readUInt32LE(p+8),unpacked=idx.readUInt32LE(p+12);if(offset+sz>size)return null;
   out.push({name:kit.SJIS.decode(nb),offset,size:sz,unpacked,lzss:!!(id&2)});}
  return out;}
 return null;}
function safRead(file,e){const b=kit.readAt(file,e.offset,e.size);if(!e.unpacked)return b;if(e.lzss)return kit.lzss(b,e.unpacked);try{return zlib.inflateSync(b);}catch{return b;}}

/* ---- BlueGale (SNN + INX) ----------------------------------------------------------------------------------------- */
function snnList(file){const inx=file.replace(/\.snn$/i,'.inx'),alt=file.replace(/\.snn$/i,'.Inx');const ix=kit.isFile(inx)?inx:kit.isFile(alt)?alt:null;if(!ix)return null;
 const b=kit.head(ix,64<<20);if(b.length<4)return null;const count=b.readInt32LE(0);if(count<=0||4+count*0x48>b.length)return null;const size=kit.size(file),out=[];
 for(let i=0;i<count;i++){const p=4+i*0x48,nb=kit.cstr(b,p,p+0x40);if(!nb||!nb.length)return null;const offset=b.readUInt32LE(p+0x40),sz=b.readUInt32LE(p+0x44);if(offset+sz>size)return null;out.push({name:kit.SJIS.decode(nb),offset,size:sz});}
 return out;}

/* ---- DxLib (unencrypted DXArchive through wolf.cjs) --------------------------------------------------------------- */
const wolfDxa=()=>require('./wolf.cjs')._internal;
function dxaList(file){const t=wolfDxa().dxaList(file);return t&&t.state==='plain'?t.files:null;}

/* ---- SLG System --------------------------------------------------------------------------------------------------- */
function szsList(file){const h=kit.head(file,0x10);if(h.length<0x10||h.toString('latin1',0,3)!=='SZS'||h.toString('latin1',5,8)!=='0__')return null;const count=h.readInt32LE(0xc);if(count<=0||count>100000)return null;
 const idx=kit.readAt(file,0x10,count*0x110),size=kit.size(file),out=[];if(idx.length<count*0x110)return null;
 for(let i=0;i<count;i++){const p=i*0x110,nb=kit.cstr(idx,p,p+0x100);if(!nb||!nb.length)return null;const offset=Number(idx.readBigInt64LE(p+0x100)),sz=idx.readUInt32LE(p+0x108);if(offset+sz>size)return null;out.push({name:kit.SJIS.decode(nb).replace(/;/g,'/'),offset,size:sz,xor:0x90});}
 return out;}
function spdList(file){const spl=file.replace(/\.spd$/i,'.spl'),ix=kit.isFile(spl)?spl:kit.isFile(file.replace(/\.spd$/i,'.SPL'))?file.replace(/\.spd$/i,'.SPL'):null;if(!ix)return null;
 const b=kit.head(ix,64<<20);if(b.length<0x30||b.toString('latin1',0,4)!=='SFP\0')return null;const align=b.readUInt32LE(0xc)||1,names=b.readUInt32LE(0x20);if(names<=0x20||names>b.length)return null;
 const count=Math.floor((names-0x20)/16),size=kit.size(file),out=[];for(let i=0;i<count;i++){const p=0x20+i*16,nb=kit.cstr(b,b.readUInt32LE(p));if(!nb||!nb.length)return null;const sz=b.readUInt32LE(p+4),offset=b.readUInt32LE(p+8)*align;if(offset+sz>size)return null;out.push({name:kit.SJIS.decode(nb),offset,size:sz});}
 return out;}
const slgRead=(file,e)=>{const b=kit.readAt(file,e.offset,e.size);return e.xor?kit.xor(b,e.xor):b;};
/* SLG_Crypto.py basic_keys and common_script_attacks */
const SLG_KEYS=[0xbf8766f5,0xca92f12b,0x08461c4d,0x3e9f9d19,0x5e950de7,0x00501e37],SLG_OPEN=[[2,0,0,2,0],[2,0,2,0,0],[2,2,0,0,0],[2,0,0,0,0],[2,0,0,0,2]];
const slgOpening=b=>b.length>=5&&SLG_OPEN.some(o=>o.every((v,i)=>b[i]===v));
function slgDecrypt(b,keys=SLG_KEYS){if(slgOpening(b))return b;for(const k of keys){const d=kit.xorStream(b,kit.msvcRand(k));if(slgOpening(d))return d;}return null;}
function slgParse(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf);const d=slgDecrypt(b);return d?{lines:kit.decodeRuns(d),anchors:[]}:parse(b);}

const SLG_SD=/\.sd$/i;
const ENGINES={
 ism:scanEngine({id:'ism',hint:'*.isa',name:/\.isa$/i,magic:'ISM ',list:ismList}),
 glib2:scanEngine({id:'glib2',hint:'*.g2 / *.stx',name:/\.(g2|stx)$/i,list:g2List,read:g2Read}),
 cyberworks:scanEngine({id:'cyberworks',hint:'Arc0x.dat',name:/\.(dat|app)$/i,find:cwFind,list:cwList,read:cwRead}),
 tanuki:scanEngine({id:'tanuki',hint:'*.tac',name:/\.tac$/i,magic:'TArc',list:tacList,read:tacRead}),
 yaneurao:scanEngine({id:'yaneurao',hint:'*.dat（yanepk）/ *.sda',name:/\.(dat|sda)$/i,list:yaneList,read:yaneRead}),
 rits:scanEngine({id:'rits',hint:'*.saf（*.str）',name:/\.saf$/i,list:safList,read:safRead,loose:{name:/\.str$/i,subs:['','script','str']}}),
 bluegale:scanEngine({id:'bluegale',hint:'*.snn + *.inx',name:/\.snn$/i,list:snnList}),
 dxlib:scanEngine({id:'dxlib',hint:'*.dxa',name:/\.dxa$/i,list:dxaList,read:(f,e)=>wolfDxa().dxaRead(f,e)})};
ENGINES.slg=kit.engine({id:'slg',hint:'*.szs / *.spd（*.sd）',
 archives:{find:dir=>kit.files(dir,{name:/\.(szs|spd)$/i}),list:f=>{const l=/\.spd$/i.test(f)?spdList(f):szsList(f);return l&&l.some(e=>SLG_SD.test(e.name))?l.filter(e=>SLG_SD.test(e.name)):null;},read:slgRead},
 loose:{name:SLG_SD,subs:['','script','data']},parse:slgParse});
module.exports={ENGINES,parse,ismList,g2List,g2Read,g2Scheme,g2Decrypt,g2Encrypt,G2_HEADER_KEY,cwList,cwTocOf,tocUnpack,tacList,tacRead,yaneList,safList,snnList,szsList,spdList,slgDecrypt,slgParse,SLG_KEYS,isMedia};
