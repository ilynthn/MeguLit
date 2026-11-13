'use strict';
// E340 Unity TextAssets (月に寄りそう乙女の作法), E341 Higurashi Unity scripts, E342 MAGES SC3 (STEINS;GATE),
// E343 Capcom Unity Ace Attorney scriptmessage bundles (逆転検事 1&2). Synthetic data first, then real Steam installs.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const scenes=require('../services/original-engines/scenes.cjs');
const mages=require('../services/original-engines/mages.cjs');
function put(dir,files){for(const [rel,data] of Object.entries(files)){const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);}}
const tmp=p=>fs.mkdtempSync(path.join(os.tmpdir(),p));
const align=(b)=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]);
const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;};
// A TextAsset as Unity serializes it: name, padding, data.
const textAsset=(name,data)=>{const n=Buffer.from(name,'latin1'),d=Buffer.from(data,'utf8');return Buffer.concat([u32(n.length),align(n),u32(d.length),align(d)]);};

test('Unity TextAssets: 日本語※简体※繁體 lines read as Japanese with the Simplified part as translation, ruby kept',()=>{
 const dir=tmp('ut-');
 const scene=['^savescene,"秘密の相談"※"秘密商量"※"秘密商量"','//コメント※メモ','^bg01,file:bg/BG01a',
  '【大蔵りそな】※【大藏里想奈】※【大藏里想奈】','「大変です」※「不好了」※「不好了」',
  '　母が旅立って[rb,一月,ひとつき]が経ちました。[n]※　母亲驾鹤仙去之日，已足有一月。[n]※　母親駕鶴仙去之日，已足有一月。[n]'].join('\r\n');
 put(dir,{'Game.exe':'x','Game_Data/resources.assets':Buffer.concat([Buffer.alloc(64),textAsset('L12_01A',scene),textAsset('icon','no text here'),Buffer.alloc(32)])});
 assert.strictEqual(scenes.detect(dir),'unity-text');
 const list=scenes.read('unity-text',dir);assert.deepStrictEqual(list.map(s=>s.name),['L12_01A']);
 assert.deepStrictEqual(list[0].lines,['【大蔵りそな】','「大変です」','母が旅立って一月が経ちました。']);
 assert.deepStrictEqual(list[0].zh,['【大藏里想奈】','「不好了」','母亲驾鹤仙去之日，已足有一月。']);
 assert.deepStrictEqual(list[0].ruby[2],[['一月','ひとつき']]);
 const patched=scenes.ENGINES['unity-text'].patchLines(list,{dirs:[dir]});assert.strictEqual(patched[0].lines[1],'「不好了」');
 fs.rmSync(dir,{recursive:true,force:true});
});

test('Higurashi: OutputLine Japanese strings are the lines; English is not a translation, a Chinese second slot is',()=>{
 const dir=tmp('hg-');
 const body='void main()\n{\n\tOutputLine(NULL, "　夏を迎えても、朝の空気は冷たい。",\n\t\t   NULL, "Even though we were approaching summer, the air was cold.", Line_WaitForInput);\n'+
  '\tOutputLineAll(NULL, "\\n", Line_ContinueAfterTyping);\n\tOutputLine(NULL, "「圭ちゃん、<size=+6>遅いぞー</size>！」",\n\t\t   NULL, "\\"Kei-chan, you\'re late!\\"", Line_Normal);\n}\n';
 put(dir,{'HigurashiEp01.exe':'x','HigurashiEp01_Data/StreamingAssets/Scripts/onik_002.txt':body});
 assert.strictEqual(scenes.detect(dir),'higurashi');
 const list=scenes.read('higurashi',dir);
 assert.deepStrictEqual(list[0].lines,['　夏を迎えても、朝の空気は冷たい。','「圭ちゃん、遅いぞー！」']);
 assert.strictEqual(scenes.ENGINES.higurashi.patchLines(list,{dirs:[dir]}),null);
 put(dir,{'HigurashiEp01_Data/StreamingAssets/Scripts/onik_002.txt':body.replace('Even though we were approaching summer, the air was cold.','即使快到夏天了，早晨的空气依然寒冷。')});
 const zh=scenes.ENGINES.higurashi.patchLines(scenes.read('higurashi',dir),{dirs:[dir]});
 assert.deepStrictEqual(zh[0].lines,['即使快到夏天了，早晨的空气依然寒冷。','「圭ちゃん、遅いぞー！」']);
 fs.rmSync(dir,{recursive:true,force:true});
});

// MAGES glyph words: 0x8000 | index into the character list (big-endian).
function sc3(strings){const cs=mages._internal.charset(),enc=t=>Buffer.concat(Array.from(t,ch=>{const i=cs.indexOf(ch);assert.ok(i>=0,ch);const b=Buffer.alloc(2);b.writeUInt16BE(0x8000|i);return b;}));
 const bodies=strings.map(s=>Buffer.concat([...s.map(p=>typeof p==='string'?enc(p):Buffer.from(p)),Buffer.from([0xff])]));
 const table=12,ret=table+bodies.length*4;let at=ret+4;const head=Buffer.alloc(ret+4);head.write('SC3\0',0,'latin1');head.writeUInt32LE(table,4);head.writeUInt32LE(ret,8);
 bodies.forEach((b,i)=>{head.writeUInt32LE(at,table+i*4);at+=b.length;});return Buffer.concat([head,...bodies]);}
function mpk(files){const head=Buffer.alloc(0x40+files.length*256);head.write('MPK\0',0,'latin1');head.writeUInt16LE(2,6);head.writeUInt32LE(files.length,8);let off=head.length;
 files.forEach(([name,data],i)=>{const p=0x40+i*256;head.writeUInt32LE(i,p+4);head.writeBigUInt64LE(BigInt(off),p+8);head.writeBigUInt64LE(BigInt(data.length),p+16);head.writeBigUInt64LE(BigInt(data.length),p+24);head.write(name,p+32,'latin1');off+=data.length;});
 return Buffer.concat([head,...files.map(f=>f[1])]);}

test('MAGES: SC3 strings decode through the character list; speaker is its own line, ruby kept; English releases are left out',()=>{
 const dir=tmp('mg-'),filler=Array.from({length:400},()=>['「これはテストです」']);
 const scx=sc3([[[0x01],'倫太郎',[0x02],'「おい、そこの貴様。」'],[[0x09],'貴様',[0x0a],'きさま',[0x0b],'に聞いている',[0x00],'のだ'],[[0x04,0x81,0x02,0x00],'まゆり']].concat(filler));
 put(dir,{'Game.exe':'x','USRDIR/script.mpk':mpk([['SG01_01.SCX',scx],['ZZ.SCX',sc3([['ん']])]])});
 assert.strictEqual(scenes.detect(dir),'mages');
 const sg=scenes.read('mages',dir).find(s=>s.name==='SG01_01.SCX');
 assert.deepStrictEqual(sg.lines.slice(0,4),['【倫太郎】','「おい、そこの貴様。」','貴様に聞いている\nのだ','まゆり']);
 assert.deepStrictEqual(sg.ruby[2],[['貴様','きさま']]);
 const en=tmp('mg-en-'),words=Array.from({length:400},()=>['Okabe looked at the screen.']);
 put(en,{'Game.exe':'x','USRDIR/script.mpk':mpk([['CC_01.SCX',sc3(words)]])});
 assert.deepStrictEqual(scenes.ENGINES.mages.scenes(en),[]);
 for(const d of [dir,en])fs.rmSync(d,{recursive:true,force:true});
});

// One Ace Attorney scene: n, n entries (id, id, label, length), then the messages as 32-bit words.
function gkScene(msgs){const words=msgs.map(m=>m.flatMap(p=>typeof p==='string'?Array.from(p,c=>c.codePointAt(0)):[0xffffff,...p]));
 const out=[msgs.length];words.forEach((w,i)=>out.push(i,i,0x15+i,w.length));for(const w of words)out.push(...w);
 const b=Buffer.alloc(out.length*4);out.forEach((v,i)=>b.writeUInt32LE(v>>>0,i*4));return b;}
// A stored (uncompressed) UnityFS bundle around a format-22 SerializedFile of TextAssets.
function bundle(assets){
 const objs=assets.map(([name,data])=>Buffer.concat([u32(name.length),align(Buffer.from(name,'latin1')),u32(data.length),align(data)]));
 const ver=Buffer.from('2022.3.17f1\0','latin1'),meta=[ver,u32(19),Buffer.from([0]),u32(1),u32(49),Buffer.from([0]),Buffer.from([0xff,0xff]),Buffer.alloc(16),u32(assets.length)];
 let len=48+meta.reduce((s,b)=>s+b.length,0);const entries=[];let dataAt=0;
 objs.forEach((o,i)=>{const pad=Buffer.alloc((4-len%4)%4);len+=pad.length;const e=Buffer.alloc(24);e.writeBigInt64LE(BigInt(i+1),0);e.writeBigUInt64LE(BigInt(dataAt),8);e.writeUInt32LE(o.length,16);e.writeInt32LE(0,20);entries.push(pad,e);len+=24;dataAt+=o.length;});
 const dataOffset=(len+15)&~15,head=Buffer.alloc(48);head.writeUInt32BE(22,8);head[16]=0;head.writeUInt32BE(len-48,20);head.writeBigUInt64BE(BigInt(dataOffset+dataAt),24);head.writeBigUInt64BE(BigInt(dataOffset),32);
 const file=Buffer.concat([head,...meta,...entries,Buffer.alloc(dataOffset-len),...objs]);
 const name=Buffer.from('CAB-test\0','utf8'),info=Buffer.concat([Buffer.alloc(16),(()=>{const b=Buffer.alloc(4);b.writeUInt32BE(1);return b;})(),(()=>{const b=Buffer.alloc(10);b.writeUInt32BE(file.length,0);b.writeUInt32BE(file.length,4);return b;})(),(()=>{const b=Buffer.alloc(4);b.writeUInt32BE(1);return b;})(),(()=>{const b=Buffer.alloc(20);b.writeBigUInt64BE(0n,0);b.writeBigUInt64BE(BigInt(file.length),8);b.writeUInt32BE(4,16);return b;})(),name]);
 const hdr=Buffer.concat([Buffer.from('UnityFS\0','latin1'),(()=>{const b=Buffer.alloc(4);b.writeUInt32BE(8);return b;})(),Buffer.from('5.x.x\0','latin1'),ver,Buffer.alloc(8),(()=>{const b=Buffer.alloc(12);b.writeUInt32BE(info.length,0);b.writeUInt32BE(info.length,4);b.writeUInt32BE(0x200,8);return b;})()]);
 const pad1=Buffer.alloc((16-hdr.length%16)%16),mid=Buffer.concat([hdr,pad1,info]),pad2=Buffer.alloc((16-mid.length%16)%16);
 return Buffer.concat([mid,pad2,file]);}

test('Capcom Ace Attorney: Japanese and Chinese scriptmessage bundles pair message by message; commands and their arguments are skipped',()=>{
 const dir=tmp('gk-'),aa=path.join('GK12_Data','StreamingAssets','aa','StandaloneWindows64');
 const ja=gkScene([[[7,0],'同日　午後１１時３３分\n',[7,0],'永世中立劇場ロビー',[3,0]],['‥‥',[0x16,3],[0x1f,0x57],'ロウ捜査官。',[3,0]]]);
 const zh=gkScene([[[7,0],'同日，晚上11点33分\n',[7,0],'永世中立剧场大厅',[3,0]],['……',[0x16,3],[0x1f,0x57],'狼调查员。',[3,0]]]);
 put(dir,{'GK12.exe':'x',[path.join(aa,'gk1_scriptmessage_jpn_assets_all_0123abcd.bundle')]:bundle([['gk1_sce4_c3_00',ja]]),[path.join(aa,'gk1_scriptmessage_sim_assets_all_4567ef01.bundle')]:bundle([['gk1_sce4_c3_00',zh]]),
  [path.join(aa,'gk1_scriptmessage_jpn_trial_assets_all_89abcdef.bundle')]:bundle([['gk1_trial',ja]])});
 assert.strictEqual(scenes.detect(dir),'capcom-msg');
 const list=scenes.read('capcom-msg',dir);assert.deepStrictEqual(list.map(s=>s.name),['gk1/gk1_sce4_c3_00']);
 assert.deepStrictEqual(list[0].lines,['同日　午後１１時３３分\n永世中立劇場ロビー','‥‥ロウ捜査官。']);
 assert.deepStrictEqual(list[0].zh,['同日，晚上11点33分\n永世中立剧场大厅','……狼调查员。']);
 fs.rmSync(dir,{recursive:true,force:true});
});

// Real Steam installs (skipped elsewhere).
const STEAM=path.join('E:/','Steam','steamapps','common');
const tsuki=path.join(STEAM,'Tsukiniyorisou');
test('real data: 月に寄りそう乙女の作法 (Steam) reads with its Chinese',{skip:!fs.existsSync(path.join(tsuki,'Tsukiniyorisou_Data','resources.assets'))&&'not installed'},()=>{
 const list=scenes.read('unity-text',tsuki);assert.ok(list.length>200,String(list.length));
 const lines=list.flatMap(s=>s.lines),zh=list.flatMap(s=>s.zh);assert.ok(lines.length>40000);assert.ok(zh.filter(Boolean).length>=lines.length*.95);
 const k=lines.indexOf('「大変です」');assert.ok(k>=0);assert.strictEqual(zh[k],'「不好了」');
});
const hig=path.join(STEAM,'Higurashi When They Cry');
test('real data: ひぐらし 奉 鬼隠し編 (Steam) reads its Japanese OutputLine strings',{skip:!fs.existsSync(path.join(hig,'HigurashiEp01_Data','StreamingAssets','Scripts'))&&'not installed'},()=>{
 const lines=scenes.read('higurashi',hig).flatMap(s=>s.lines);assert.ok(lines.length>10000);assert.ok(lines.includes('「圭ちゃん、遅いぞー！」'));
});
const sg=path.join(STEAM,'STEINS;GATE');
test('real data: STEINS;GATE (Steam, Japanese script) decodes through the SGHD character list',{skip:!fs.existsSync(path.join(sg,'USRDIR','script.mpk'))&&'not installed'},()=>{
 const list=scenes.read('mages',sg);assert.ok(list.length>150);const s=list.find(x=>x.name==='SG01_01.SCX');
 assert.deepStrictEqual(s.lines.slice(0,2),['【倫太郎】','「おい、そこの貴様。俺たちが見えているか？」']);
});
const cc=path.join(STEAM,'CHAOS;CHILD');
/* the Japanese install reads (validation/mages-charsets.test.cjs); an English one is left out */
test('real data: CHAOS;CHILD (Steam) English text is not taken for Japanese',{skip:!fs.existsSync(path.join(cc,'USRDIR','script.mpk'))&&'not installed'},()=>{
 const sc=scenes.ENGINES.mages.scenes(cc);if(!sc.length)return;
 assert.ok(sc.some(x=>mages.parse(x.read()).lines.some(l=>/[ぁ-ゖ]/.test(l))));
});
const aai=path.join(STEAM,'Ace Attorney Investigations Collection');
test('real data: 逆転検事 1&2 (Steam) pairs Japanese with Simplified Chinese',{skip:!fs.existsSync(path.join(aai,'GK12_Data','StreamingAssets','aa'))&&'not installed'},()=>{
 const list=scenes.read('capcom-msg',aai),lines=list.flatMap(s=>s.lines),zh=list.flatMap(s=>s.zh);
 assert.ok(lines.length>20000);const k=lines.indexOf('どういう意味だろうか？');assert.ok(k>=0);assert.strictEqual(zh[k],'这句话是什么意思？');
 assert.ok(!lines.some(t=>/[\x21-\x7e]/.test(t)&&/[ぁ-ん]/.test(t)&&/[\]\[W%^\\]/.test(t)),'command arguments leaked into the text');
});

// MAGES voices: a label table pointing at code whose Mes instructions name the voice.mpk index and the string.
function sc3Voiced(strings,mes){const cs=mages._internal.charset(),enc=t=>Buffer.concat(Array.from(t,ch=>{const i=cs.indexOf(ch);const b=Buffer.alloc(2);b.writeUInt16BE(0x8000|i);return b;}));
 const code=Buffer.concat(mes.map(([type,voice,line])=>{const id=Buffer.alloc(2);id.writeUInt16LE(line);
  const v=voice===null?[]:[0xc0|(voice>>16&0x1f),voice&0xff,voice>>8&0xff,0,0];/* type 0: character only; 1/3: voice, character */
  return Buffer.from([1,0x0c,type,...v,0x28,0x0a,0x85,0x14,0x00,0x86,0,0,...id,1,0x0d,0]);}));
 const bodies=strings.map(s=>Buffer.concat([...s.map(p=>typeof p==='string'?enc(p):Buffer.from(p)),Buffer.from([0xff])]));
 const codeAt=16,so=codeAt+code.length,ro=so+bodies.length*4,head=Buffer.alloc(16);head.write('SC3\0',0,'latin1');head.writeUInt32LE(so,4);head.writeUInt32LE(ro,8);head.writeUInt32LE(codeAt,12);
 const table=Buffer.alloc(bodies.length*4+4);let at=so+table.length;bodies.forEach((b,i)=>{table.writeUInt32LE(at,i*4);at+=b.length;});
 return Buffer.concat([head,code,table,...bodies]);}
test('MAGES: Mes voice indexes give each spoken line its voice.mpk clip; narration has none',()=>{
 const scx=sc3Voiced([[[0x01],'倫太郎',[0x02],'「おい」'],['地の文だ'],[[0x01],'まゆり',[0x02],'「トゥットゥルー」']],[[3,7159,0],[0,null,1],[1,2,2]]);
 const p=mages.parse(scx);
 assert.deepStrictEqual(p.lines,['【倫太郎】','「おい」','地の文だ','【まゆり】','「トゥットゥルー」']);
 assert.deepStrictEqual(p.voices,[null,'mpkvoice_7159',null,null,'mpkvoice_2']);
 const dir=tmp('mgv-');put(dir,{'USRDIR/voice.mpk':mpk([['_NOVOICE.OGG',Buffer.from('OggS-novoice')],['OKA_0000.OGG',Buffer.from('OggS-okabe')]])});
 const a=mages.audio(path.join(dir,'USRDIR','voice.mpk'));const by=new Map(a.map(e=>[e.name,e]));
 assert.strictEqual(by.get('mpkvoice_1.ogg').read().toString(),'OggS-okabe');assert.strictEqual(by.get('OKA_0000.OGG').read().toString(),'OggS-okabe');
 assert.strictEqual(mages.audio(path.join(dir,'USRDIR','script.mpk')),null);
 fs.rmSync(dir,{recursive:true,force:true});
});

// Spike Chunsoft AGAR .wad holding .lin scripts.
const spike=require('../services/original-engines/spike-wad.cjs');
function lin(strings,{lastZero=false}={}){const code=Buffer.from([0x70,0x00,0x00,0x01,0x70,0x02,0x00,0x00]);const bodies=strings.map(s=>Buffer.from('\ufeff'+s+'\0','utf16le'));
 const n=strings.length,offs=Buffer.alloc(4+(n+1)*4);offs.writeUInt32LE(n,0);let at=offs.length;bodies.forEach((b,i)=>{offs.writeUInt32LE(at,4+i*4);at+=b.length;});offs.writeUInt32LE(lastZero?0:at,4+n*4);
 const text=Buffer.concat([offs,...bodies]),head=Buffer.alloc(16);head.writeUInt32LE(2,0);head.writeUInt32LE(16,4);head.writeUInt32LE(16+code.length,8);head.writeUInt32LE(16+code.length+text.length,12);
 return Buffer.concat([head,code,text]);}
function wad(files){const ents=Object.entries(files),parts=[Buffer.from('AGAR','latin1'),u32(1),u32(1),u32(0),u32(ents.length)];let off=0;
 for(const [name,data] of ents){const nb=Buffer.from(name,'utf8'),s=Buffer.alloc(16);s.writeBigUInt64LE(BigInt(data.length),0);s.writeBigUInt64LE(BigInt(off),8);parts.push(u32(nb.length),nb,s);off+=data.length;}
 parts.push(u32(0));return Buffer.concat([...parts,...ents.map(e=>e[1])]);}
test('Spike .wad: the Japanese .lin set gives the lines, a Chinese set pairs by script and string; English alone is left out',()=>{
 const dir=tmp('dr-');
 put(dir,{'DR1_us.exe':'x','dr1_data_us.wad':wad({'Dr1/data/us/script/e00_001_000.lin':lin(['<CLT 4>希望ヶ峰学園…\n<CLT>','','「よろしくな」']),'Dr1/data/us/script/e00_002_000.lin':lin(['こんにちは','さようなら'],{lastZero:true})}),
  'dr1_data_ch.wad':wad({'Dr1/data/ch/script/e00_001_000.lin':lin(['<CLT 4>希望之峰学园……\n<CLT>','','「请多关照」']),'Dr1/data/ch/script/e00_002_000.lin':lin(['只有一句'])})});
 assert.strictEqual(scenes.detect(dir),'spike-wad');
 const list=scenes.read('spike-wad',dir);assert.deepStrictEqual(list.map(s=>s.name),['e00_001_000.lin','e00_002_000.lin']);
 assert.deepStrictEqual(list[0].lines,['希望ヶ峰学園…','「よろしくな」']);assert.deepStrictEqual(list[0].zh,['希望之峰学园……','「请多关照」']);
 assert.deepStrictEqual(list[1].lines,['こんにちは','さようなら']);assert.deepStrictEqual(list[1].zh,['','']);/* string counts differ: not paired */
 assert.strictEqual(spike.patchLines(list)[0].lines[1],'「请多关照」');
 const en=tmp('dr-en-');put(en,{'dr1_data_us.wad':wad({'Dr1/data/us/script/e00_001_000.lin':lin(['Hope\'s Peak Academy...','Nice to meet you.'])})});
 assert.deepStrictEqual(spike.scenes(en),[]);
 for(const d of [dir,en])fs.rmSync(d,{recursive:true,force:true});
});
test('real data: STEINS;GATE (Steam) spoken lines carry their voice.mpk clip',{skip:!fs.existsSync(path.join(sg,'USRDIR','voice.mpk'))&&'not installed'},()=>{
 const list=scenes.read('mages',sg),s=list.find(x=>x.name==='SG01_01.SCX');assert.strictEqual(s.voices[1],'mpkvoice_7159');
 const names=mages._internal.mpkList(path.join(sg,'USRDIR','voice.mpk'));assert.strictEqual(names[7159].name,'OKA_0102.OGG');
 let spoken=0,voiced=0;for(const x of list)for(let i=1;i<x.lines.length;i++)if(/^【.*】$/.test(x.lines[i-1])){spoken++;if(x.voices?.[i])voiced++;}
 assert.ok(spoken>14000&&voiced>=spoken*.99,voiced+'/'+spoken);
});
for(const [title,exe] of [['Danganronpa Trigger Happy Havoc','dr1_data_us.wad'],['Danganronpa 2 Goodbye Despair','dr2_data_us.wad']]){const d=path.join(STEAM,title);
 test('real data: '+title+' (Steam, English text) reads its .lin scripts but is not taken for Japanese',{skip:!fs.existsSync(path.join(d,exe))&&'not installed'},()=>{
  const sets=spike._internal.sets(d);assert.ok(sets.length>=1);let n=0;for(const s of sets){assert.strictEqual(s.lang,'other');for(const [,r] of s.scripts)n+=(spike._internal.linStrings(r())||[]).length;}
  assert.ok(n>40000,String(n));assert.deepStrictEqual(spike.scenes(d),[]);
 });}
