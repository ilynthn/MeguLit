// SPDX-License-Identifier: GPL-3.0-or-later
// Japanese original text for translated System4 builds. Synthetic AIN files only; no game files are read or written.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const ot=require('../services/original-text.cjs');
function ain(lines,encoding,functions=['main','scene'],table1=false){
 const encode=encoding==='gbk'?gbk:sjis;
 const table=(tag,items)=>{const n=Buffer.alloc(4);n.writeUInt32LE(items.length);return Buffer.concat([Buffer.from(tag,'latin1'),n,...items.flatMap(b=>[b,Buffer.from([0])])]);};
 const vers=Buffer.alloc(8);vers.write('VERS',0,'latin1');vers.writeUInt32LE(6,4);
 const msg1=items=>{const head=Buffer.alloc(12);head.write('MSG1',0,'latin1');head.writeUInt32LE(items.length,4);return Buffer.concat([head,...items.flatMap(b=>{const len=Buffer.alloc(4);len.writeUInt32LE(b.length);const x=Buffer.from(b);for(let k=0;k<x.length;k++)x[k]=(x[k]+k+0x60)&255;return [len,x];})]);};
 const body=Buffer.concat([vers,table1?msg1(lines.map(encode)):table('MSG0',lines.map(encode)),table('FNAM',functions.map(f=>Buffer.from(f,'latin1')))]),packed=zlib.deflateSync(body),head=Buffer.alloc(16);
 head.write('AI2\0',0,'latin1');head.writeUInt32LE(body.length,8);head.writeUInt32LE(packed.length,12);return Buffer.concat([head,packed]);
}
// Minimal encoders for the characters used below (kana, a few kanji, punctuation) via iconv-free tables.
const SJIS=new Map(),GBK=new Map();
for(const [table,enc] of [[SJIS,'shift_jis'],[GBK,'gbk']]){const dec=new TextDecoder(enc);for(let hi=0x81;hi<=0xfe;hi++)for(let lo=0x40;lo<=0xfe;lo++){const ch=dec.decode(Buffer.from([hi,lo]));if(ch.length===1&&ch!=='�'&&!table.has(ch))table.set(ch,[hi,lo]);}}
const encodeWith=table=>s=>Buffer.from([...s].flatMap(c=>c.charCodeAt(0)<128?[c.charCodeAt(0)]:table.get(c)||[0x3f]));
const sjis=encodeWith(SJIS),gbk=encodeWith(GBK);
const original=['「やっと来たね」','　ずっと待ってたんだから','「はい」','「はい」','あたしの名前はヒカリ','「はい」','くくく……いいザマだな'];
const patched=['「你终于来了啊」','　我一直在等你呢','「是」','「是」','我的名字是光','「是」','くくく……いいザマだな'];
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-ot-'));fs.writeFileSync(path.join(dir,'zh.ain'),ain(patched,'gbk'));fs.writeFileSync(path.join(dir,'ja.ain'),ain(original,'sjis'));return dir;}
test('AI2 message tables decode with the right code page per file',()=>{
 const dir=fixture();const zh=ot.readAin(path.join(dir,'zh.ain')),ja=ot.readAin(path.join(dir,'ja.ain'));
 assert.equal(zh.codepage,'gbk');assert.equal(ja.codepage,'shift_jis');assert.deepEqual(zh.lines,patched);assert.deepEqual(ja.lines,original);assert.equal(zh.version,6);
 assert.equal(zh.structure.functionHash,ja.structure.functionHash);fs.rmSync(dir,{recursive:true,force:true});
});
test('alignment uses the lines the patch left in Japanese and the script structure',()=>{
 const a=ot.align({lines:patched,structure:{messages:7,functionHash:'x'}},{lines:original,structure:{messages:7,functionHash:'x'}});
 assert.equal(a.sameStructure,true);assert.equal(a.keptJapanese,1);assert.equal(a.keptRate,1);assert.equal(a.reliable,true);
 const shifted=ot.align({lines:patched,structure:{messages:7,functionHash:'x'}},{lines:['x',...original.slice(0,6)],structure:{messages:7,functionHash:'x'}});assert.equal(shifted.reliable,false);
 assert.equal(ot.align({lines:patched,structure:{messages:7,functionHash:'x'}},{lines:original,structure:{messages:8,functionHash:'x'}}).reliable,false);
});
test('matcher covers multi-line captures, refuses ambiguous repeats and resolves them by reading position',()=>{
 const m=new ot.Matcher(patched,original);
 const first=m.match('「你终于来了啊」\n　我一直在等你呢');assert.equal(first.status,'exact');assert.deepEqual(first.indices,[0,1]);assert.equal(first.japanese,'「やっと来たね」\n　ずっと待ってたんだから');
 assert.equal(m.match('「是」').status,'high');assert.equal(m.last,2);assert.equal(m.match('「是」').indices[0],3);
 const fresh=new ot.Matcher(patched,original);{const r=fresh.match('「是」');/* E520: every 「是」 is 「はい」, so the answer is the same wherever it is */assert.equal(r.status,'high');assert.equal(r.method,'same-text');assert.equal(r.japanese,'「はい」');assert.equal(fresh.last,-1);}
 assert.equal(fresh.match('完全不相关的句子').status,'none');assert.equal(fresh.match('').status,'none');
 assert.equal(new ot.Matcher(patched,original).match('くくく……いいザマだな').alreadyJapanese,true);
});
test('the hook keeps the captured line unless a match is exact or position-confirmed',()=>{
 const {HookNative}=require('../core/hook-native.cjs');const hook=Object.create(HookNative.prototype);hook.trace=()=>{};
 const m=new ot.Matcher(patched,original);hook.originalText={resolve:text=>m.match(text)};
 assert.equal(hook.originalTextFor('「你终于来了啊」'),'「やっと来たね」');
 assert.equal(hook.originalTextFor('没有对应的句子'),'没有对应的句子');
 hook.originalText={resolve:()=>{throw Error('broken index');}};assert.equal(hook.originalTextFor('文本'),'文本');
 hook.originalText=null;assert.equal(hook.originalTextFor('文本'),'文本');
});
test('local search finds same-named scripts outside the running folder only',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-find-'));for(const sub of ['running','backup/jp','other'])fs.mkdirSync(path.join(dir,sub),{recursive:true});
 for(const f of ['running/Game.ain','backup/jp/game.AIN','other/Other.ain'])fs.writeFileSync(path.join(dir,f),'x');
 const r=await ot.findCandidates('Game',path.join(dir,'running').toLowerCase(),{roots:[dir],deadline:Date.now()+5000});
 assert.deepEqual(r.found.map(f=>path.relative(dir,f).split(path.sep).join('/')),['backup/jp/game.AIN']);assert.equal(r.complete,true);
 fs.rmSync(dir,{recursive:true,force:true});
});
test('AIN v12+ MSG1 tables are de-obfuscated',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-msg1-'));fs.writeFileSync(path.join(dir,'x.ain'),ain(original,'sjis',['main'],true));assert.deepEqual(ot.readAin(path.join(dir,'x.ain')).lines,original);fs.rmSync(dir,{recursive:true,force:true});});
test('BGI scenario archives decompress to Japanese script lines (local install, skipped when absent)',{skip:!fs.existsSync('E:/GAL/素晴日/素晴らしき日々HD版/data01101.arc')},()=>{const bgi=require('../services/original-engines/bgi.cjs');const entry=bgi.readArc('E:/GAL/素晴日/素晴らしき日々HD版/data01101.arc')[0];const lines=bgi.scriptLines(bgi.dsc(entry.data));assert(lines.includes('ボクたちは'));assert.equal(ot.locate('E:/GAL/素晴日/素晴らしき日々HD版','BGI').engine,'bgi');});

// Chinese patch import (user, 2026-11-09): the game runs in Japanese; a translation group's patch (even nested in an
// unpacked folder) is lined up with it, and each captured Japanese line gets the group's line as its translation.
test('an imported Chinese patch gives each Japanese line the group\'s translation, keeping the Japanese text',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-patch-root-')),game=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-patch-game-')),pack=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-patch-pack-'));
 try{
  fs.writeFileSync(path.join(game,'Game.ain'),ain(original,'sjis'));fs.writeFileSync(path.join(game,'Game.exe'),'x');
  fs.mkdirSync(path.join(pack,'汉化补丁','data'),{recursive:true});fs.writeFileSync(path.join(pack,'汉化补丁','data','Game.ain'),ain(patched,'gbk'));
  const row={id:'g1',executable:path.join(game,'Game.exe')},db={prepare:()=>({get:id=>id==='g1'?row:undefined})};
  assert.throws(()=>ot.importPatch(root,db,'g1',game),/PATCH_IS_RUNNING_COPY/);
  ot.importPatch(root,db,'g1',pack);
  const s=ot.status(root,db,'g1');assert.equal(s.status,'native-japanese');assert.equal(s.patchStatus,'ready');assert.equal(s.patch.lines,7);
  const p=ot.provider(root,row.executable);assert.equal(p.kind,'patch');
  const r=p.resolve('「やっと来たね」');assert.equal(r.status,'exact');assert.equal(r.translation,'「你终于来了啊」');
  const {HookNative}=require('../core/hook-native.cjs'),hook=Object.create(HookNative.prototype),events=[];hook.trace=()=>{};hook.emit=e=>events.push(e);hook.originalText=p;
  assert.equal(hook.originalTextFor('「やっと来たね」'),'「やっと来たね」','the Japanese line is kept');
  assert.deepEqual(events,[{type:'hookPatchTranslation',japanese:'「やっと来たね」',chinese:'「你终于来了啊」',machine:false}]);
  events.length=0;hook.originalTextFor('くくく……いいザマだな');assert.deepEqual(events,[],'a line the patch left in Japanese is no translation');
  ot.clearPatch(root,'g1');{const left=ot.provider(root,row.executable);assert.equal(left.patch,false,'without the patch only filled lines are translated');assert.equal(left.resolve('「やっと来たね」').status,'none');}
  // A folder whose script is still Japanese is not taken as a patch.
  const same=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-patch-ja-'));fs.writeFileSync(path.join(same,'Game.ain'),ain([...original.slice(0,6),'違う行'],'sjis'));
  assert.throws(()=>ot.importPatch(root,db,'g1',same),/PATCH_NOT_TRANSLATED/);fs.rmSync(same,{recursive:true,force:true});
 }finally{for(const d of [root,game,pack])fs.rmSync(d,{recursive:true,force:true});}
});
test('YU-RIS 女装山脈: speaker-prefixed script lines, ruby and masked letters still meet the captured line',()=>{
 const rt=['行人「ここは≪何処／どこ≫だ……」','完全に迷った……','由良「いい大人が、年下の男の娘にチ●ポを拘束されてるのよ？　まさか本気で逃げられないわけないわよね？」'];
 const zh=['行人「这里是哪里……」','完全迷路了啊……','由良「是大人的话，怎么会被比自己年纪小的伪娘控制住肉棒呢？真的想逃的话不可能逃不掉吧？」'];
 const m=new ot.Matcher(rt,zh);
 assert.equal(m.match('「ここは何処だ……」').japanese,'「这里是哪里……」');
 assert.equal(m.match('完全に迷った……').japanese,'完全迷路了啊……');
 assert.equal(m.match('「いい大人が、年下の男の娘にチ○ポを拘束されてるのよ？　まさか本気で\n逃げられないわけないわよね？」').japanese,zh[2].slice(2));
 assert.equal(new ot.Matcher(rt,zh).match('行人「ここは何処だ……」').japanese,'行人「这里是哪里……」');
});
/* #136 戦国ランス / ランス・クエスト era: the AIN is MT19937-XOR encrypted (seed 0x5D3E3) instead of zlib wrapped.
   28b050e9 / 0d a8 are the keystream bytes 0-3, 1250 and 1299 from a line-by-line port of libsys4's mt19937int.c. */
test('MT19937-encrypted AIN files decrypt and read; a stray tag in the code is skipped',()=>{
 const ks=ot._ain.mtXor(Buffer.alloc(1300),0x5D3E3);assert.equal(ks.subarray(0,4).toString('hex'),'28b050e9');assert.equal(ks[1250],0x0d);assert.equal(ks[1299],0xa8);
 const packed=ain(original,'sjis',['main'],true),body=zlib.inflateSync(packed.subarray(16));
 const code=Buffer.concat([Buffer.from('CODE','latin1'),Buffer.from([16,0,0,0]),Buffer.from('MSG1','latin1'),Buffer.from([255,255,255,127]),Buffer.alloc(8)]);
 const plain=Buffer.concat([body.subarray(0,8),code,body.subarray(8)]);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-ainx-'));fs.writeFileSync(path.join(dir,'x.ain'),ot._ain.mtXor(plain,0x5D3E3));
 const r=ot.readAin(path.join(dir,'x.ain'));assert.equal(r.version,6);assert.deepEqual(r.lines,original);fs.rmSync(dir,{recursive:true,force:true});});
