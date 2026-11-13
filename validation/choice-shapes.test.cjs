// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 choice shapes seen live (strings copied from hook-events.log of the real games) */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const {ChoiceCapture,placeChoices}=require('../core/choice-capture.cjs');
test('choices: bullet list (Summer Pockets) is split, ordered, and the glued copy goes away',()=>{
 let t=1000;const c=new ChoiceCapture(()=>t);c.noteDialogue('さしずめ俺は……');
 c.add('♪・さしずめ俺は……さしずめ俺は……','さしずめ俺は……');
 c.add('傷ついた渡り鳥歌を忘れたカナリア拳を壊したボクサー口説き方を忘れたホスト','さしずめ俺は……');
 c.add('♪・傷ついた渡り鳥♪・歌を忘れたカナリア♪・拳を壊したボクサー♪・口説き方を忘れたホスト','さしずめ俺は……');
 c.add('口説き方を忘れたホスト','さしずめ俺は……');
 assert.deepStrictEqual(c.options(),['傷ついた渡り鳥','歌を忘れたカナリア','拳を壊したボクサー','口説き方を忘れたホスト']);
});
test('choices: glued pair with a name prefix and slash (CLANNAD) becomes two options',()=>{
 let t=1000;const c=new ChoiceCapture(()=>t);const d='流れてきたのは、一昔前に流行った、歌謡ヒップホップ。（ダッサ…）（こんなの聴かねぇだろ…）';
 c.add('上書きで何か吹き込む／',d);c.add('上書きで何か吹き込むやめておく',d);c.add('【朋也】朋也【朋也】朋也やめておく',d);c.add('【朋也】',d);c.add('／上書きで何か吹き込む',d);
 assert.deepStrictEqual(c.options().sort(),['やめておく','上書きで何か吹き込む'].sort());
 c.noteDialogue('「出ねぇってのっ」','春原');c.noteDialogue('「よう」','朋也');c.add('朋也',d);c.add('春原春原朋也',d);assert.deepStrictEqual(c.options().sort(),['やめておく','上書きで何か吹き込む'].sort(),'speaker names are not options');
});
test('choices: a frame drawn twice (ATRI) is one candidate that OCR may cut; short doubled names are not',()=>{
 let t=1000;const c=new ChoiceCapture(()=>t);
 c.add('アトリアトリ','x');assert.strictEqual(c.options(),null);
 c.reset();c.add('アトリアトリ','x');c.add('　　アトリを行かせるアトリは俺が預かるアトリを行かせるアトリは俺が預かる','x');
 assert.ok(c.options().includes('アトリを行かせるアトリは俺が預かる'),'a name never cuts the glued options');
});
test('choices: an ellipsis-only option counts, but never alone (ファタモルガーナの館)',()=>{
 let t=1000;const c=new ChoiceCapture(()=>t);
 c.add('……おはよう……\n…………','前の行');assert.deepStrictEqual(c.options(),['……おはよう……','…………']);
 c.reset();c.add('…………\n‥‥','x');assert.strictEqual(c.options(),null);
 c.reset();c.noteDialogue('おはようございます、旦那さま……。');c.noteDialogue('……おはよう……');c.add('……おはよう……\n…………','x');c.add('…………。おはようございます、旦那さま……。……おはよう………………','……おはよう……');
 assert.deepStrictEqual(c.options(),['……おはよう……','…………'],'the maid line glued on is not an option');
});
test('choices: candidates that arrive with the new line survive it; older ones do not',()=>{
 let t=1000;const c=new ChoiceCapture(()=>t);c.add('はい\nいいえ','x');t+=300;c.reset(400);assert.deepStrictEqual(c.options(),['はい','いいえ']);
 t+=500;c.reset(400);assert.strictEqual(c.options(),null);
});
test('choices: a row OCR misread is placed on the evenly spaced column; overlapping boxes keep the shorter text',()=>{
 const order=['傷ついた渡り鳥','歌を忘れたカナリア','拳を壊したボクサー','口説き方を忘れたホスト'];
 const items=[{text:'口説き方を忘れたホスト',x0:555,y0:430,x1:864,y1:457},{text:'拳を壊したボクサー',x0:627,y0:347,x1:814,y1:373},{text:'歌を忘れたカナリア',x0:627,y0:264,x1:840,y1:291}];
 const out=placeChoices(items,order,['傷ついた渡り鳥'],order);
 assert.strictEqual(out.length,4);assert.strictEqual(out[0].text,'傷ついた渡り鳥');assert.ok(Math.abs((out[0].y0+out[0].y1)/2-194.5)<3,'one step above');
 const glued=placeChoices([{text:'AとB',x0:0,y0:0,x1:100,y1:100},{text:'A',x0:10,y0:10,x1:90,y1:40}],['A','B'],[],null);assert.deepStrictEqual(glued.map(i=>i.text),['A']);
 assert.strictEqual(placeChoices(items.slice(0,2),order,['傷ついた渡り鳥'],null).length,2,'no order, no guess');
});
test('choices: native side splits a glued option at rows standing apart and passes dialogue-stream batches on',()=>{
 const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 assert.match(read('native/PageLocator.cs'),/apart = b\.Top - a\.Bottom >= 0\.8 \* Math\.Min/);
 assert.match(read('native/HookBridge.cs'),/ChoiceBatch\(name,EmbedBatch\.Recent\(DateTime\.UtcNow\)\)/);
 assert.match(read('core/hook-native.cjs'),/if\(this\.choice\?\.active\)return false;/);
});
test('choices: the reader stays up for the options but drops the old line when the game hid its text box',()=>{
 const {Immersion}=require('../core/immersion.cjs');const out=[];const im=new Immersion(m=>out.push(m));im.configure({immersion:true,dialogDetection:'hook'});
 im.choices(true);out.length=0;im.set(false,'scene');assert.deepStrictEqual(out,[{dialogVisible:true,choiceOnly:true}]);
 im.choices(false);assert.deepStrictEqual(out.pop(),{dialogVisible:true,choiceOnly:false});
 const src=fs.readFileSync(path.join(__dirname,'..','web/reader/bootstrap.js'),'utf8');assert.match(src,/megulit-choice-only/);
});
test('multi-language row: a Chinese tail glued after the Japanese sentence goes (ATRI)',()=>{
 const {japaneseTrack}=require('../core/language-tracks.cjs');
 assert.strictEqual(japaneseTrack('アトリが助けを求めるように俺を見た。足になります！成为你的右腿！成為你的右腿！'),'アトリが助けを求めるように俺を見た。足になります！');
 assert.strictEqual(japaneseTrack('東京へ行こう。東京駅前広場'),'東京へ行こう。東京駅前広場');
 assert.strictEqual(japaneseTrack('「はい」'),'「はい」');
 const {foreignLine}=require('../core/language-tracks.cjs');assert.ok(foreignLine('成為你的右腿！')&&foreignLine('成为你的右腿！'),'a short Chinese line is dropped, the Japanese one stays');assert.ok(!foreignLine('東京駅前広場')&&!foreignLine('右足義足'));
});