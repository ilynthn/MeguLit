'use strict';
/* E560 Unity setter streams, replayed from live recordings (MeguLit HookBridge, read-only, games run off screen):
   月に寄りそう乙女の作法 (UI.Text.set_text: typewriter steps, <size=12> ruby, whole NVL page per call) and
   ひぐらしのなく頃に 奉 (07th TextController.SetText). The reader gets whole paragraphs, no tags, no ruby, no typewriter states. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {replay}=require('./helpers/hook-replay.cjs'),u=require('../core/unity-source.cjs');
const dir=path.join(__dirname,'helpers','unity-replay');
const lines=(file,exe)=>{const r=replay(path.join(dir,file),{name:exe});const out=[];for(const e of r.events)if(e&&typeof e.hookSource==='string'&&e.hookSource&&e.hookSource!==out[out.length-1])out.push(e.hookSource);return out;};
test('Tsuki: paragraphs, no tags, no ruby, no typewriter states',()=>{
 const out=lines('tsuki.jsonl','Tsukiniyorisou.exe');
 assert.ok(out.length>=15,'lines '+out.length);
 for(const l of out){assert.doesNotMatch(l,/<\/?size|<color|<\/|\[n\]|\[rb,/,l);assert.doesNotMatch(l,/\n/,'one paragraph: '+l);}
 assert.ok(out.some(l=>l.includes('闘病生活の長かった母が旅立って一月が経ちました。')),'ruby ひとつき dropped');
 assert.ok(!out.some(l=>/一月ひとつき|遊星ユウセイ/.test(l)),'no ruby in text');
 assert.ok(out.includes('　母が死んだので、ぼくも死のうと思います。'));
 const done=out.filter(l=>/[。！？」』…]$/.test(l.trim())).length;/* recorded while the unfocused game typed in slow bursts (seconds between steps), so some held paragraphs time out */assert.ok(done/out.length>=0.6,'complete paragraphs '+done+'/'+out.length);
});
test('Higurashi: every OutputLine reaches the reader once',()=>{
 const out=lines('higurashi.jsonl','HigurashiEp01.exe');
 assert.ok(out.length>=30,'lines '+out.length);
 assert.ok(out.includes('ひぐらしの声だけが…いやに騒がしい。'));
 for(const l of out)assert.doesNotMatch(l,/<|\n/);
});
test('unity-source helpers',()=>{
 assert.equal(u.rubySize('<size=36>　一月<size=12>ひとつき</size>が経った</size>'),'<size=36>　一月が経った</size>');
 assert.equal(u.rubySize('<size=36>　大蔵遊星<size=12>ユウセ'),'<size=36>　大蔵遊星');
 assert.equal(u.rubySize('<size=36>あ<size=12>小さい</size></size>'),'<size=36>あ<size=12>小さい</size></size>','not after kanji: kept');
 assert.equal(u.typewriter('　\n　母\n　母が\n　母が死んだ。'),'　母が死んだ。');
 assert.deepEqual(u.paragraphs('　その程度の\n身を晒す。\n「はい」'),['　その程度の身を晒す。','「はい」']);
});
test('UnityBox holds a paragraph still being typed and drops repeats',()=>{
 const out=[],timers=[];const realSet=global.setTimeout,realClear=global.clearTimeout;
 global.setTimeout=(fn)=>{const t={fn,unref(){}};timers.push(t);return t;};global.clearTimeout=t=>{const i=timers.indexOf(t);if(i>=0)timers.splice(i,1);};
 try{const b=new u.UnityBox(()=>0,l=>out.push(l));
  b.feed('s','　前略。\n　母が死ん');assert.deepEqual(out,[]);
  b.feed('s','　前略。\n　母が死んだので。');assert.deepEqual(out,['　母が死んだので。']);
  b.feed('s','　前略。\n　母が死んだので。');assert.equal(out.length,1);
  b.feed('s','　あの');timers.shift().fn();assert.deepEqual(out,['　母が死んだので。','　あの']);
 }finally{global.setTimeout=realSet;global.clearTimeout=realClear;}
});
test('HookBridge Unity embed safety (source)',()=>{
 const b=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8'),p=fs.readFileSync(path.join(__dirname,'..','native','EmbedTextPolicy.cs'),'utf8');
 assert.match(b,/!TypewriterStep\(LastEmbedText,text\)/,'typewriter steps are not a skip burst');
 assert.match(b,/MarkUnsafe\("unity-readback"\)/,'veil read back -> cover mode');
 assert.match(b,/MarkUnsafe\("unity-colour-reveal"\)/);
 assert.match(b,/MarkUnsafe\("unity-many-contexts"\)/);
 assert.match(b,/finally\{foreach\(var a in later\)a\(\);\}/,'UseEmbed outside Gate in Select');
 assert.match(p,/Resource\.IsMatch\(visible\)/,'rich-text </size> is not a path');
 assert.match(p,/UnityVeilOpen = "<color=#01010100>"/);
});
