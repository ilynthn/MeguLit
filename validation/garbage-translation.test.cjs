'use strict';
/* 2026-11-14 (user, beta.36, ダストマニア・グロテスク with a Chinese patch): Shift-JIS read as GBK went to the translator,
   whose reply 「这句话看起来是乱码…请提供完整的游戏台词原文」 was drawn as the translation, over MeguLit's own window. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {repairShiftJisAsGbk,garbledSource,metaReply}=require('../core/text-sanity.cjs');
const {createTranslationService}=require('../core/providers.cjs');
const {artNoTranslation}=require('../core/art-filter.cjs');
const MOJI='偙偺儊僢僙乕僕偼弶夞婲摦帪偺傒昞帵偝傟傑偡丅';
const MOJI_LONG='娐嫬愝掕偺乽僇乕僜儖堏摦惂尷乿傪乽偡傞乿偵愝掕偟偰偍偔偲丄僇乕僜儖偑';
const REFUSAL='这句话看起来是乱码或识别错误，请提供完整的游戏台词原文。';

test('Shift-JIS read as GBK comes back as the Japanese line',()=>{
 assert.equal(repairShiftJisAsGbk(MOJI),'このメッセージは初回起動時のみ表示されます。');
 assert.equal(repairShiftJisAsGbk(MOJI_LONG),'環境設定の「カーソル移動制限」を「する」に設定しておくと、カーソルが');
});
test('real Japanese, Chinese and kanji-only lines are never "repaired"',()=>{
 for(const t of['余計な不安を煽るかのように、鳥の鳴き声が響いていた。','这是一个测试，我们走吧。','东京大学的学生们','東京大学','漢字だけ','「……」','Hello world'])assert.equal(repairShiftJisAsGbk(t),null,t);
});
test('garbage is recognised, real text is not',()=>{
 for(const t of[MOJI,MOJI_LONG,'寳懐ｯｹ莠・ｯｹ莠・ｼ瑚ｿ呎ｬ｡諸槫−口謌ｦ','ã‚ã‚ŠãŒã¨ã†','���あ�','abc\u0001\u0002def'])assert.equal(garbledSource(t),true,t);
 for(const t of['余計な不安を煽るかのように、鳥の鳴き声が響いていた。','这是一个测试，我们走吧。','東京大学','「……」','Café au lait','I love you.','……！？'])assert.equal(garbledSource(t),false,t);
});
test('meta replies are recognised in Chinese, Japanese and English',()=>{
 for(const t of[REFUSAL,'抱歉，我无法识别这段文本，请提供原文。','这段文字似乎不是有效的日文。','请提供完整的日文台词，我来帮你翻译。','I cannot translate this text because it appears to be garbled.','Please provide the original Japanese text.','This does not look like Japanese text.','As an AI language model, I…','申し訳ありませんが、翻訳できません。','原文を提供してください。'])assert.equal(metaReply(t,'あいう'),true,t);
});
test('ordinary translations are never taken for meta replies',()=>{
 for(const [t,s] of[['对不起，我来晚了。','ごめん、遅れた。'],['我不能原谅你。','許せない。'],['请给我看看你的作业。','宿題を見せて。'],['这件事看起来不简单。','簡単じゃなさそうだ。'],['你不是日本人吧？','日本人じゃないでしょ？'],['I can\'t believe it.','信じられない。'],['Please give me the key.','鍵をちょうだい。']])assert.equal(metaReply(t,s),false,t);
});
test('a line that talks about translation itself may translate into those words',()=>{
 assert.equal(metaReply('这句我翻译不了啦，是乱码。','これ、文字化けしてて翻訳できないよ。'),false);
});

function service(reply){const calls=[];const fetcher=async(url,init)=>{calls.push(JSON.parse(init.body));return {ok:true,status:200,json:async()=>({choices:[{message:{content:typeof reply==='function'?reply(calls.length):reply}}]})};};
 const s=createTranslationService(fetcher);s.setKey('https://api.example.com/v1','k');return {s,calls};}
const opts={provider:'gpt',baseUrl:'https://api.example.com/v1',model:'m'};
test('garbage is never sent to the translator',async()=>{
 const {s,calls}=service('X');
 assert.equal(await s.translate(MOJI,opts),'');assert.equal(await s.translate('��あ�',opts),'');assert.equal(calls.length,0);
});
test('a translator\'s meta reply is dropped, not shown, not cached, not used as context',async()=>{
 const {s,calls}=service(n=>n===1?REFUSAL:'好的。');
 assert.equal(await s.translate('はい。',opts),'');
 assert.equal(await s.translate('はい。',opts),'好的。');assert.equal(calls.length,2);
 await s.translate('いいえ。',opts);const ctx=JSON.parse(calls[2].messages[1].content);assert.equal(ctx.previous.some(p=>p.translation===REFUSAL),false);
});
test('a normal translation passes through',async()=>{const {s}=service('早上好。');assert.equal(await s.translate('おはよう。',opts),'早上好。');});
test('the art layer drops meta replies too',()=>{assert.equal(artNoTranslation('ミき=ミミミ',REFUSAL),true);assert.equal(artNoTranslation('おはよう',REFUSAL),true);assert.equal(artNoTranslation('おはよう','早上好'),false);});
test('the hook repairs Shift-JIS read as GBK before anything else sees the line',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../core/hook-native.cjs'),'utf8');
 const i=src.indexOf("repairShiftJisAsGbk(m.text)"),j=src.indexOf("this.languageCheck(m.text)");assert.ok(i>0&&j>i);
});
test('with a MeguLit window in front the reading layer stays directly above the game, never above MeguLit',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../native/GalWindowBridge.cs'),'utf8');
 assert.doesNotMatch(src,/SetWindowPos\(Overlay,fg,/);assert.doesNotMatch(src,/homeOwned\?fg:/);
 assert.match(src,/if\(homeOwned\)StayAboveGameOnly\(gameRoot\);/);
 assert.match(src,/static void StayAboveGameOnly\(IntPtr gameRoot\)\{[\s\S]{0,300}IntPtr above=GetWindow\(gameTop,3\);if\(above==Overlay\)return;\s*SetWindowPos\(Overlay,above,/);
});
