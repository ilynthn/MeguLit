// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// The KiriKiri readers return the game's own menu choices ({after, options}) next to the lines, and leave lines alone.
// Synthetic scripts only.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-krkr-choices-'));
process.env.MEGULIT_ROOT=root;process.env.MEGULIT_WORK=root;
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
const {ENGINES}=require('../services/original-engines/scenes.cjs');
const krkrLang=require('../services/original-engines/krkr-lang.cjs'),cxWorker=require('../services/original-engines/cx-worker.cjs');
const ks=text=>ENGINES.kirikiri.parse(Buffer.from('﻿'+text,'utf16le'));

test('[link]…[endlink] options group until [s], after the lines read so far',()=>{
 const r=ks('どちらへ行く？[p]\n[link target=*a]右へ行く[endlink][r]\n[link storage="b.ks"]左へ[ruby text="ひだり"]戻る[endlink][r]\n[s]\n次の話。[p]\n');
 assert.deepEqual(r.choices,[{after:2,options:['右へ行く','左へ戻る']}]);
 assert.deepEqual(r.lines,['どちらへ行く？','右へ行く','左へ戻る','次の話。']);
});
test('[glink] and [seladd] / @seladd, one set per [s]',()=>{
 const r=ks('問い。\n[glink text="はい" target=*y]\n[glink text="いいえ" target=*n]\n[s]\n続き。\n@seladd text=逃げる target=*run\n@seladd text="戦う" target=*fight\n@s\n[seladd text="立つ"][s]\n');
 assert.deepEqual(r.choices.map(c=>c.options),[['はい','いいえ'],['逃げる','戦う'],['立つ']]);
 assert.deepEqual(r.choices.map(c=>c.after),[0,1,1]);
});
test('graphic button: a Japanese target label is the option, an ASCII one is ignored',()=>{
 const r=ks('どうする？[p]\n[button graphic="a" target=*手を伸ばした][button graphic="b" target=*back][button graphic="c" target=*待つ text="様子を見る"][s]\n[button graphic="menu" target=*config][s]\n');
 assert.deepEqual(r.choices,[{after:0,options:['手を伸ばした','様子を見る']}]);
});
test('a page clear ends a set; a script without choices has no key; choices before any line are -1',()=>{
 const r=ks('[link target=*a]はじめ[endlink]\n[cm]\n普通の台詞。[p]\n');
 assert.deepEqual(r.choices,[{after:0,options:['はじめ']}]);
 const none=ks('台詞だけ。[p]\n[cm]\n別の台詞。[p]\n');assert.equal('choices' in none,false);assert.deepEqual(none.lines,['台詞だけ。','別の台詞。']);
 assert.deepEqual(ks('@seladd text=最初\n@s\n台詞。[p]\n').choices,[{after:-1,options:['最初']}]);
});
test('krkr-lang reads the Japanese script\'s choices with the paired line index',()=>{
 const ja='*scenario_A|\n問いかけ。[p]\n*scenario_B|\n[glink text="行く"]\n[glink text="残る"]\n[s]\n答え。[p]\n[cm]\n',zh='*scenario_A|\n提问。[p]\n*scenario_B|\n[glink text="去"]\n[glink text="留"]\n[s]\n回答。[p]\n[cm]\n';
 const r=krkrLang.parse(Buffer.from(JSON.stringify({ja,zh})));
 assert.deepEqual(r.lines,['問いかけ。','答え。']);assert.deepEqual(r.zh,['提问。','回答。']);
 assert.deepEqual(r.choices,[{after:0,options:['行く','残る']}]);
 const plain=krkrLang.parse(Buffer.from(JSON.stringify({ja:'*scenario_A|\n台詞。[p]\n[cm]\n',zh:null})));assert.equal('choices' in plain,false);
});
test('.scn selects: cx-worker keeps them, kirikiri-cx returns them after the scene\'s last line',()=>{
 const doc={root:{name:'s',scenes:[
  {label:'a',texts:[['n',null,[[null,'一行目'],[null,'line one']],[]],['n',null,[[null,'二行目[ひ]左'],[null,'line two']],[]]],
   selects:[{text:'逃げる',language:[null,{text:'run'}],tag:'x'},{text:'[た]戦う',tag:'y'},{tag:'z'}]},
  {label:'b',texts:[['n',null,[[null,'三行目']],[]]]},
  {label:'c',texts:[],selects:[{text:'孤立'}]}]}};
 const cached={name:'s',scenes:cxWorker.textsOf(doc)};
 assert.deepEqual(cached.scenes.map(s=>s.selects?.map(o=>o.text)),[['逃げる','戦う'],undefined,['孤立']]);
 const r=ENGINES['kirikiri-cx'].parse(Buffer.from(JSON.stringify(cached)));
 assert.deepEqual(r.lines,['一行目','二行目左','三行目']);
 assert.deepEqual(r.choices,[{after:1,options:['逃げる','戦う']},{after:2,options:['孤立']}]);
 const none=ENGINES['kirikiri-cx'].parse(Buffer.from(JSON.stringify({scenes:[cached.scenes[1]]})));assert.equal('choices' in none,false);
});
