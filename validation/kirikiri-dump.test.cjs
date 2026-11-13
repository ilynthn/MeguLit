// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E293: KiriKiri Z games whose archives use strong per-game encryption (サノバウィッチ). MeguLitScn32/64.dll saves the
// scene files the engine decrypts to cache/kirikiri-scn/<key>/; the kirikiri-dump engine reads them, asks for the scenes
// they lead to, and the live provider gives each Japanese line the game's own Chinese as soon as its scene is saved.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-scn-'));
process.env.MEGULIT_SCN_CAPTURE=path.join(tmp,'capture');
const scenes=require('../services/original-engines/scenes.cjs'),ot=require('../services/original-text.cjs');
const eng=scenes.ENGINES['kirikiri-dump'];
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));

// A small PSB writer (FreeMote layout) for tests.
function arr(values){const max=Math.max(0,...values);const w=max<256?1:max<65536?2:4;const cn=values.length<256?1:2;const b=Buffer.alloc(2+cn+values.length*w);b[0]=0x0c+cn;b.writeUIntLE(values.length,1,cn);b[1+cn]=0x0c+w;values.forEach((v,i)=>b.writeUIntLE(v,2+cn+i*w,w));return b;}
function buildPsb(root){
 const names=[...new Set(collectKeys(root))].sort(),strings=[];
 // Name trie: every node gets its own block of 256 children; a terminator node points back at each name's last node.
 const nd=[0],cs=[0];let next=256;const child=new Map();
 const terminators=names.map(name=>{let node=0;for(const ch of Buffer.from(name,'latin1')){const key=node+':'+ch;if(!child.has(key)){if(cs[node]===undefined||cs[node]===0&&node!==0||node===0&&!child.size){}if(!cs[node]){cs[node]=next;next+=256;}const x=cs[node]+ch;nd[x]=node;child.set(key,x);}node=child.get(key);}
  const t=next++;nd[t]=node;return t;});
 for(let i=0;i<next;i++){if(nd[i]===undefined)nd[i]=0;if(cs[i]===undefined)cs[i]=0;}
 const idx=s=>{let i=strings.indexOf(s);if(i<0){strings.push(s);i=strings.length-1;}return i;};
 const parts=[];
 function enc(v){
  if(v===null)return Buffer.from([0x01]);
  if(typeof v==='string')return Buffer.from([0x15,idx(v)]);
  if(typeof v==='number')return Buffer.from([0x05,v&255]);
  if(Array.isArray(v)){const items=v.map(enc),offs=[];let o=0;for(const it of items){offs.push(o);o+=it.length;}return Buffer.concat([Buffer.from([0x20]),arr(offs),...items]);}
  const keys=Object.keys(v).sort(),items=keys.map(k=>enc(v[k])),offs=[];let o=0;for(const it of items){offs.push(o);o+=it.length;}
  return Buffer.concat([Buffer.from([0x21]),arr(keys.map(k=>names.indexOf(k))),arr(offs),...items]);
 }
 const body=enc(root);
 const nameBlock=Buffer.concat([arr(cs),arr(nd),arr(terminators)]);
 const sdata=[],soffs=[];let so=0;for(const s of strings){const b=Buffer.from(s+'\0','utf8');soffs.push(so);so+=b.length;sdata.push(b);}
 const header=Buffer.alloc(0x2c),offNames=0x2c,offEntries=offNames+nameBlock.length,offStrings=offEntries+body.length;
 const strArr=arr(soffs),offData=offStrings+strArr.length,data=Buffer.concat(sdata),chunkAt=offData+data.length;
 header.write('PSB\0',0,'latin1');header.writeUInt16LE(3,4);header.writeUInt32LE(0x2c,8);header.writeUInt32LE(offNames,12);header.writeUInt32LE(offStrings,16);header.writeUInt32LE(offData,20);
 header.writeUInt32LE(chunkAt,24);header.writeUInt32LE(chunkAt+3,28);header.writeUInt32LE(chunkAt+6,32);header.writeUInt32LE(offEntries,36);
 return Buffer.concat([header,nameBlock,body,strArr,data,Buffer.from([0x0d,0,0x0d,0x0d,0,0x0d])]);
}
function collectKeys(v){if(Array.isArray(v))return v.flatMap(collectKeys);if(v&&typeof v==='object')return [...Object.keys(v),...Object.values(v).flatMap(collectKeys)];return [];}
// The game's own layout: slot 0 Japanese, then other languages. This build puts Traditional before Simplified, so the
// Simplified slot has to be found by its text.
const line=(ja,tw,cn)=>[null,null,[[null,ja],[null,'English'],[null,tw],[null,cn]]];
const scene1={name:'001・はじまり.ks',scenes:[{label:'*start',nexts:[{storage:'002・つづき.ks',target:'*start',type:0}],texts:[
 line('「[し]志[な]那[つ]都荘まで行って欲しいんですけど」','「請送我到志那都莊。」','「请送我到志那都庄。」'),
 line('電車も走っておらず、\\n１時間に一本しかない。','這裡沒有電車，\\n一小時才一班。','这里没有电车，\\n一小时才一班。'),
 line('それでも、ここで待つしかなかった。','即使如此，也只能在這裡等。','即使如此，也只能在这里等。')]}]};
const scene2={name:'002・つづき.ks',scenes:[{label:'*start',nexts:[],texts:[
 line('魔女のお茶会へようこそ。','歡迎來到魔女的茶會。','欢迎来到魔女的茶会。'),
 line('ここからが本番だからね。','從這裡開始才是正題。','从这里开始才是正题。'),
 line('……ちょっと待って。','……等一下。','……等一下。')]}]};
// mdf: "mdf\0", the size, then zlib (how the PSB plug-in stores scene files).
const mdf=doc=>{const plain=buildPsb(doc),head=Buffer.alloc(8);head.write('mdf\0',0,'latin1');head.writeUInt32LE(plain.length,4);return Buffer.concat([head,zlib.deflateSync(plain)]);};
function fnv(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){let c=s.charCodeAt(i);if(c>=65&&c<=90)c+=32;h=Math.imul(h^c,16777619)>>>0;}return h.toString(16).padStart(8,'0');}
function makeGame(name){const dir=path.join(tmp,name);fs.mkdirSync(path.join(dir,'plugin'),{recursive:true});fs.writeFileSync(path.join(dir,'plugin','psbfile.dll'),'');fs.writeFileSync(path.join(dir,'scn.xp3'),'XP3');fs.writeFileSync(path.join(dir,'Game.exe'),'');return dir;}
let tick=0;
function save(dir,file,data){const d=eng.captureDir(dir);fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,file),data);
 const t=new Date(Date.now()+(++tick)*60000);fs.utimesSync(d,t,t);} // the DLL saves by rename, which touches the folder

test('capture folder key is FNV-1a of the lower-case game folder, as the DLL computes it',()=>{
 assert.strictEqual(eng.captureKey('E:\\GAL\\Sanoba Witch'),fnv('e:\\gal\\sanoba witch'));
 assert.strictEqual(eng.captureKey('E:\\GAL\\Sanoba Witch\\'),eng.captureKey('e:\\gal\\SANOBA WITCH'));
 const dll=fs.readFileSync(path.join(__dirname,'..','native','scncapture','ScnCapture.cpp'),'utf8');
 assert.match(dll,/hash = 2166136261u/);assert.match(dll,/\(hash \^ \(unsigned\)c\) \* 16777619u/);assert.match(dll,/cache\\\\kirikiri-scn\\\\%08x/);
});

test('a saved scene is read with its Simplified Chinese slot; scenes it leads to go to want.txt',()=>{
 const dir=makeGame('read');
 save(dir,'001・はじまり.ks.scn',mdf(scene1));
 save(dir,'garbage.scn',Buffer.from('random bytes, not a scene'));
 const list=eng.scenes(dir);
 assert.deepStrictEqual(list.map(s=>s.name),['001・はじまり.ks']);
 const parsed=eng.parse(list[0].read());
 assert.deepStrictEqual(parsed.lines,['「志那都荘まで行って欲しいんですけど」','電車も走っておらず、\n１時間に一本しかない。','それでも、ここで待つしかなかった。']);
 assert.deepStrictEqual(parsed.zh,['「请送我到志那都庄。」','这里没有电车，\n一小时才一班。','即使如此，也只能在这里等。']);
 assert.deepStrictEqual(parsed.ruby[0],[['志那都','しなつ']]);
 assert.strictEqual(fs.readFileSync(path.join(eng.captureDir(dir),'want.txt'),'utf8'),'002・つづき.ks.scn');
 // Once that scene is saved nothing is left to ask for.
 save(dir,'002・つづき.ks.scn',buildPsb(scene2));
 assert.strictEqual(eng.scenes(dir).length,2);
 assert.strictEqual(fs.readFileSync(path.join(eng.captureDir(dir),'want.txt'),'utf8'),'');
});

test('a folder saved under another spelling of the path is found through game.txt',()=>{
 const dir=makeGame('spelling'),other=path.join(process.env.MEGULIT_SCN_CAPTURE,'0badc0de');
 fs.mkdirSync(other,{recursive:true});fs.writeFileSync(path.join(other,'game.txt'),dir.toUpperCase());
 assert.strictEqual(eng.captureDir(dir),other);
});

test('no saved scene: the game is not readable yet and nothing breaks',()=>{
 const dir=makeGame('empty');
 assert.deepStrictEqual(eng.scenes(dir),[]);
 assert.strictEqual(scenes.readable('kirikiri-dump',dir),false);
 assert.strictEqual(eng.eligible(dir),true);
 assert.strictEqual(eng.eligible(path.join(tmp,'nowhere')),false);
});

test("live provider: lines get the game's Chinese as soon as their scene is saved, with no restart",()=>{
 const root=path.join(tmp,'root'),dir=makeGame('live'),exe=path.join(dir,'Game.exe'),id='g1';
 fs.mkdirSync(path.join(root,'data','config'),{recursive:true});
 assert.strictEqual(ot.scanRunning(root,id,exe).status,'unsupported');
 const p=ot.provider(root,exe);
 assert.ok(p&&p.live,'a live provider before any scene is saved');
 assert.strictEqual(p.resolve('魔女のお茶会へようこそ。').status,'none');
 save(dir,'001・はじまり.ks.scn',mdf(scene1));
 let r=p.resolve('それでも、ここで待つしかなかった。');
 assert.strictEqual(r.translation,'即使如此，也只能在这里等。');
 // The next scene arrives while the game runs: its first line already reads.
 save(dir,'002・つづき.ks.scn',mdf(scene2));
 r=p.resolve('魔女のお茶会へようこそ。');
 assert.strictEqual(r.translation,'欢迎来到魔女的茶会。');
 assert.ok(Array.isArray(p.upcoming(4)));
 const state=JSON.parse(fs.readFileSync(path.join(root,'data','config','original-text.json'),'utf8'))[id];
 assert.strictEqual(state.patchStatus,'ready');assert.strictEqual(state.engine,'kirikiri-dump');
 assert.strictEqual(fs.readdirSync(path.dirname(state.runtime.index)).filter(f=>f.startsWith('runtime-')).length,1,'older runtime indexes are removed');
});

test('a game a file-side engine reads keeps that engine (no live provider)',()=>{
 const root=path.join(tmp,'root2'),dir=path.join(tmp,'plain'),exe=path.join(dir,'Game.exe');
 fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(path.join(root,'data','config'),{recursive:true});
 fs.writeFileSync(path.join(dir,'a.ks'),'*start\r\n「こんにちは、ここはテストです」\r\n');
 const state=ot.scanRunning(root,'g2',exe);
 assert.strictEqual(state.engine,'kirikiri');
 const p=ot.provider(root,exe);assert.ok(!p||!p.live);
});

test('the hook loads the capture DLL only through the bound-game injector, and only for KiriKiri folders',()=>{
 const read=f=>fs.readFileSync(path.join(__dirname,'..','native',f),'utf8');
 const inj=read('HookInjector.cs'),bridge=read('HookBridge.cs'),dll=read(path.join('scncapture','ScnCapture.cpp'));
 assert.match(inj,/"MeguLitScn32\.dll"/);assert.match(inj,/"MeguLitScn64\.dll"/);
 assert.match(bridge,/ScnCapture\(bit,loader,args\);\r?\n(\s*RuntimeDump\(bit,loader,args\);\r?\n)?\s*new Thread\(Input\)/);
 assert.match(bridge,/GetFiles\(Path\.GetDirectoryName\(exe\),"\*\.xp3"\)\.Length==0\)return;/);
 // Read-only on the game: only streams opened for reading are copied, and only into MeguLit's cache.
 assert.match(dll,/\(flags & 0x0f\) == 0/);
});
