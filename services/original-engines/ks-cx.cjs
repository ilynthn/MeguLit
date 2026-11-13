// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');
// E296 (user, 2026-11-10: 魔法使いの夜): KiriKiri 2 archives whose entries are XORed with one byte up to a per-file
// boundary and another byte after it (the cx family, here on .ks / .tjs text). The keys and the boundary are recovered
// from the text itself, without the game's plug-in:
//   UTF-16LE  every ASCII character has a zero high byte, so the most common odd byte near the start is the first key
//             and near the end the second; the boundary is where decoding with the first key stops making sense.
//   8-bit     (Shift_JIS) the key that turns the start into readable ASCII lines, then the same for the end.
// A few files carry a stray byte with an extra XOR; those characters stay wrong (a line or two per file at most).
const plausible16=u=>u===9||u===10||u===13||(u>=0x20&&u<0x7f)||(u>=0xa0&&u<=0x24f)||(u>=0x370&&u<=0x4ff)||(u>=0x2000&&u<=0x27bf)||(u>=0x3000&&u<=0x30ff)||(u>=0x3400&&u<=0x9fff)||(u>=0xf900&&u<=0xfaff)||(u>=0xff00&&u<=0xffef)||u===0xfeff;
// Scripts are mostly ASCII commands: a key that turns them into ideographs scores below the one that gives ASCII back.
const score16=u=>u===9||u===10||u===13||(u>=0x20&&u<0x7f)?2:plausible16(u)?1:0;
const plausible8=c=>c===9||c===10||c===13||(c>=0x20&&c<0x7f)||c>=0x81&&c!==0xa0&&c<=0xfc;
const score8=c=>c===9||c===10||c===13||(c>=0x20&&c<0x7f)?2:plausible8(c)?1:0;
function mode(buf,from,to,step){const count=new Uint32Array(256);let n=0;for(let i=from;i<Math.min(to,buf.length);i+=step){count[buf[i]]++;n++;}let best=0;for(let k=1;k<256;k++)if(count[k]>count[best])best=k;return {key:best,share:n?count[best]/n:0};}
// Best split of a sequence scored by "plausible with the first key" before it and "with the second key" after it.
function split(n,ok1,ok2){const before=new Int32Array(n+1),after=new Int32Array(n+1);
 for(let i=0;i<n;i++)before[i+1]=before[i]+Number(ok1(i));for(let i=n-1;i>=0;i--)after[i]=after[i+1]+Number(ok2(i));
 let best=-1,at=0;for(let i=0;i<=n;i++){const s=before[i]+after[i];if(s>best){best=s;at=i;}}return {at,best};}
function utf16(raw){
 const head=mode(raw,1,1201,2);if(head.share<.35)return null;
 // The byte order mark gives the first key when it is intact (the boundary may come before most of the first 1200 bytes).
 const k1=(raw[0]^0xff)===(raw[1]^0xfe)?raw[0]^0xff:head.key,k2=raw.length>4000?mode(raw,raw.length-3999|1,raw.length,2).key:raw[raw.length-1],units=raw.length>>1;
 const unit=(u,ka,kb)=>(raw[2*u]^ka)|((raw[2*u+1]^kb)<<8);
 const s=split(units,u=>score16(unit(u,k1,k1)),u=>score16(unit(u,k2,k2)));
 let bad=0;for(let u=0;u<units;u++)if(!plausible16(u<s.at?unit(u,k1,k1):unit(u,k2,k2)))bad++;
 // The boundary can fall between the two bytes of a character: of the three places around it, take the one whose
 // neighbouring characters read best (an ASCII letter between ASCII letters rather than a stray ideograph).
 const at16=(b,u)=>u<0||u>=units?0:(raw[2*u]^(2*u<b?k1:k2))|((raw[2*u+1]^(2*u+1<b?k1:k2))<<8);
 let at=2*s.at,top=-1;for(const b of [2*s.at,2*s.at-1,2*s.at+1]){if(b<0)continue;const sc=score16(at16(b,s.at-1))+score16(at16(b,s.at));if(sc>top){top=sc;at=b;}}
 const out=Buffer.from(raw);for(let i=0;i<out.length;i++)out[i]^=i<at?k1:k2;
 const bom=out[0]===0xff&&out[1]===0xfe;
 return {text:out.toString('utf16le',bom?2:0,out.length&~1),encoding:'utf16le',keys:[k1,k2],boundary:at,bad,units};
}
function sjis(raw){
 const keyFor=(from,to)=>{let best=0,score=-1;for(let k=0;k<256;k++){let s=0;for(let i=from;i<to;i++){const c=raw[i]^k;if(c===10||c===13||(c>=0x20&&c<0x7f))s++;}if(s>score){score=s;best=k;}}return best;};
 const k1=keyFor(0,Math.min(400,raw.length)),k2=keyFor(Math.max(0,raw.length-400),raw.length);
 const s=split(raw.length,i=>score8(raw[i]^k1),i=>score8(raw[i]^k2));s.bad=0;for(let i=0;i<raw.length;i++)if(!plausible8(raw[i]^(i<s.at?k1:k2)))s.bad++;
 const out=Buffer.from(raw);for(let i=0;i<out.length;i++)out[i]^=i<s.at?k1:k2;
 const text=kit.SJIS.decode(out),broken=(text.match(/�/g)||[]).length;
 return {text,encoding:'shift_jis',keys:[k1,k2],boundary:s.at,bad:s.bad+broken,units:raw.length};
}
// The decrypted text, or null when neither reading looks like a script.
function decryptText(raw){
 if(!raw||raw.length<4)return null;
 const r=utf16(raw)||sjis(raw);
 if(r.bad>Math.max(8,r.units*.02))return null;
 if(!/[\r\n]/.test(r.text)||!/[@*\[;]/.test(r.text))return null;
 return r;
}
module.exports={decryptText};
