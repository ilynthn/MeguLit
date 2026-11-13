'use strict';
/* E574 Ruby Marshal 4.8 encoder and RGSSAD v1 / v3 writers for RPG Maker XP / VX / VX Ace fixtures. Objects are written
   as Ruby would dump RPG:: classes: o + class symbol + ivars ("@code"...), strings as I" + E true (VX Ace) or bare ". */
const step=k=>(Math.imul(k,7)+3)>>>0;
class RObj{constructor(cls,ivars){this.cls=cls;this.ivars=ivars;}}
class RHash{constructor(entries){this.entries=entries;}}
function marshal(v,{ace=true}={}){const out=[Buffer.from([4,8])],syms=new Map();
 const w=b=>out.push(Buffer.isBuffer(b)?b:Buffer.from(b));
 const long=n=>{if(n===0)return w([0]);if(n>0&&n<123)return w([n+5]);if(n<0&&n>-124)return w([(n-5)&255]);const bytes=[];let x=n;if(n>0){while(x>0){bytes.push(x&255);x=Math.floor(x/256);}w([bytes.length,...bytes]);}else{x=-n-1;while(x>0||bytes.length===0){bytes.push(~x&255);x=Math.floor(x/256);}w([(-bytes.length)&255,...bytes]);}};
 const sym=s=>{if(syms.has(s)){w([0x3b]);long(syms.get(s));return;}syms.set(s,syms.size);const b=Buffer.from(s,'utf8');w([0x3a]);long(b.length);w(b);};
 const str=s=>{const b=Buffer.from(s,'utf8');if(ace){w([0x49,0x22]);long(b.length);w(b);long(1);sym('E');w([0x54]);}else{w([0x22]);long(b.length);w(b);}};
 const val=x=>{if(x===null||x===undefined)return w([0x30]);if(x===true)return w([0x54]);if(x===false)return w([0x46]);
  if(typeof x==='number'){w([0x69]);return long(x);}if(typeof x==='string')return str(x);
  if(Array.isArray(x)){w([0x5b]);long(x.length);x.forEach(val);return;}
  if(x instanceof RHash){w([0x7b]);long(x.entries.length);for(const [k,y] of x.entries){val(k);val(y);}return;}
  if(x instanceof RObj){w([0x6f]);sym(x.cls);const ks=Object.keys(x.ivars);long(ks.length);for(const k of ks){sym('@'+k);val(x.ivars[k]);}return;}
  throw Error('marshal '+typeof x);};
 val(v);return Buffer.concat(out);}
const cmd=(code,parameters,indent=0)=>new RObj('RPG::EventCommand',{code,indent,parameters});
const page=list=>new RObj('RPG::Event::Page',{list:[...list,cmd(0,[])]});
const map=events=>new RObj('RPG::Map',{width:20,height:15,events:new RHash(events.map((pages,i)=>[i+1,new RObj('RPG::Event',{id:i+1,name:'EV'+(i+1),x:0,y:0,pages:pages.map(page)})]))});
function rgssadV1(files){const parts=[Buffer.from('RGSSAD\0\x01','latin1')];let key=0xdeadcafe;
 for(const [name,data] of Object.entries(files)){const nb=Buffer.from(name,'utf8'),h=Buffer.alloc(4);h.writeUInt32LE((nb.length^key)>>>0);key=step(key);parts.push(h);
  const en=Buffer.alloc(nb.length);for(let i=0;i<nb.length;i++){en[i]=nb[i]^(key&255);key=step(key);}parts.push(en);
  const s=Buffer.alloc(4);s.writeUInt32LE((data.length^key)>>>0);key=step(key);parts.push(s,encrypt(data,key));}
 return Buffer.concat(parts);}
function rgssadV3(files,seed=0x1234){const key=(Math.imul(seed,9)+3)>>>0,kb=Buffer.alloc(4);kb.writeUInt32LE(key);const names=Object.keys(files);
 const idxLen=names.reduce((a,n)=>a+16+Buffer.byteLength(n),0)+16;let off=12+idxLen;const idx=[],datas=[];
 names.forEach((n,i)=>{const nb=Buffer.from(n,'utf8'),fk=0x9000+i,e=Buffer.alloc(16);e.writeUInt32LE((off^key)>>>0,0);e.writeUInt32LE((files[n].length^key)>>>0,4);e.writeUInt32LE((fk^key)>>>0,8);e.writeUInt32LE((nb.length^key)>>>0,12);
  idx.push(e,Buffer.from(nb.map((c,j)=>c^kb[j&3])));datas.push(encrypt(files[n],fk));off+=files[n].length;});
 const end=Buffer.alloc(16);end.writeUInt32LE(key,0);const head=Buffer.alloc(12);head.write('RGSSAD\0\x03','latin1');head.writeUInt32LE(seed,8);
 return Buffer.concat([head,...idx,end,...datas]);}
function encrypt(buf,key){const out=Buffer.from(buf),kb=Buffer.alloc(4);let k=key>>>0;kb.writeUInt32LE(k);for(let i=0;i<out.length;i++){if(i&&!(i&3)){k=step(k);kb.writeUInt32LE(k);}out[i]^=kb[i&3];}return out;}
module.exports={marshal,RObj,RHash,cmd,page,map,rgssadV1,rgssadV3};
