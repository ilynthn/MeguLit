'use strict';
/* 2026-11-13 (user: Anki 复习界面大改) HUD blocks: layout percentages, look settings, review keys, wiring */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const H=require('../web/hud-drag.js'),M=require('../web/anki-hud-model.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..','web',f),'utf8');
test('a block rect stays inside the stage and keeps a minimum size',()=>{
 assert.deepEqual(H.normRect({x:-20,y:150,w:300,h:1},{x:0,y:0,w:10,h:10}),{x:0,y:97,w:100,h:3});
 assert.deepEqual(H.normRect({x:'junk'},{x:5,y:6,w:7,h:8}),{x:5,y:6,w:7,h:8});
 assert.deepEqual(H.normRect({x:95,y:0,w:20,h:20}),{x:80,y:0,w:20,h:20});
});
test('saved layouts are merged over the sketch defaults block by block',()=>{
 const l=M.cleanLayout({word:{x:1,y:2,w:30,h:10},bogus:{x:1}});
 assert.deepEqual(l.word,{x:1,y:2,w:30,h:10});assert.deepEqual(l.shot,M.LAYOUT.shot);assert.equal(l.bogus,undefined);
 for(const id of ['progress','word','info','example','shot','card','controls'])assert.ok(l[id],id);
 /* the sketch: word on top, reading band under it, example, big screenshot, Next at the bottom */
 const L=M.LAYOUT;assert.ok(L.word.y<L.info.y&&L.info.y<L.example.y&&L.example.y<L.shot.y&&L.shot.y<L.controls.y);assert.ok(L.info.w>=85&&L.shot.w*L.shot.h>L.example.w*L.example.h);
});
test('look settings refuse anything that could break out of CSS',()=>{
 const s=M.cleanStyle({jaFont:'Yu Mincho";}body{display:none',zhFont:'KaiTi',size:{word:9999},color:{word:'red',text:'#ABCDEF'},bg:{mode:'evil',image:'javascript:alert(1)',blur:-5,dim:500}});
 assert.equal(s.jaFont,'');assert.equal(s.zhFont,'KaiTi');assert.equal(s.size.word,160);assert.equal(s.color.word,M.STYLE.color.word);assert.equal(s.color.text,'#abcdef');
 assert.equal(s.bg.mode,'none');assert.equal(s.bg.image,'');assert.equal(s.bg.blur,0);assert.equal(s.bg.dim,90);
 assert.equal(M.cleanStyle({bg:{mode:'image',image:'data:image/jpeg;base64,AAAA'}}).bg.image,'data:image/jpeg;base64,AAAA');
 const v=M.cssVars({jaFont:'Meiryo'});assert.match(v['--hud-ja-font'],/^"Meiryo",/);assert.equal(v['--hud-size-word'],M.STYLE.size.word+'px');
});
test('settings survive a round trip through storage and reset to defaults on junk',()=>{
 const store={v:null,getItem(){return this.v;},setItem(k,v){assert.equal(k,M.KEY);this.v=v;}};
 assert.ok(M.save(store,{layout:{word:{x:3,y:3,w:40,h:10}},style:{zhFont:'SimSun',bg:{mode:'color',color:'#112233'}}}));
 const back=M.load(store);assert.deepEqual(back.layout.word,{x:3,y:3,w:40,h:10});assert.equal(back.style.zhFont,'SimSun');assert.equal(back.style.bg.mode,'color');
 store.v='{broken';assert.deepEqual(M.load(store).style,M.cleanStyle({}));
});
test('review keys: space flips then rates Good, digits rate, F/L/Esc drive full screen and layout',()=>{
 const k=M.keyAction,all=[1,2,3,4];
 assert.equal(k(' ',{answerShown:false}),'primary');assert.equal(k(' ',{answerShown:true,ratings:all}),'rate-3');assert.equal(k('Enter',{answerShown:true,ratings:[]}),'primary');
 assert.equal(k('2',{answerShown:true,ratings:all}),'rate-2');assert.equal(k('2',{answerShown:false}),null);assert.equal(k('4',{answerShown:true,ratings:[1,3]}),null);
 assert.equal(k('f'),'fullscreen');assert.equal(k('L'),'layout');assert.equal(k('Escape',{editing:true,immersive:true}),'layout');assert.equal(k('Escape',{immersive:true}),'fullscreen');assert.equal(k('Escape'),null);
 assert.equal(k('1',{answerShown:true,ratings:all,editing:true}),null);
});
test('the card frame loads the shared drag code and splits MeguLit notes into blocks',()=>{
 assert.match(read('anki-card.html'),/<script defer src="hud-drag\.js"><\/script>/);
 const card=read('anki-card.js');assert.match(card,/MeguHud\.attach/);assert.match(card,/'\.tm-head'/);assert.match(card,/'\.tm-shot'/);assert.match(card,/hud-whole/);
 assert.match(card,/type:'tome-anki-hud-move'/);assert.match(card,/type:'tome-anki-lookup'/);assert.match(card,/type:'tome-anki-key'/);
});
test('the review page keeps every tool and adds layout, appearance and full screen',()=>{
 const src=read('anki-review.js');
 for(const s of ['mountMixer()','mountAutoplay(toolbar)','data-replay','data-fit','data-reload','data-stop','copy.endPractice','anki_grade','anki_show_answer','card.position','data-hud-layout','data-hud-full','mountLook(bar)','resetHud',"'fullscreen_on'","api('dictionary'"])assert.ok(src.includes(s),s);
 assert.doesNotMatch(src,/2055492159/);
 const css=read('anki-layout.css');assert.match(css,/\.anki-hud\.immersive\{position:fixed;inset:0/);assert.match(css,/prefers-reduced-motion/);assert.doesNotMatch(css.slice(css.indexOf('Review HUD')),/:has\(/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','desktop','src','main.rs'),'utf8'),/"fullscreen_on"\|"fullscreen_off"/);
});
test('the card magnifier looks words up in MOJi first and falls back to the local dictionary',()=>{
 const src=read('anki-review.js'),i=src.indexOf('function lookup(word)'),body=src.slice(i,src.indexOf('\n }\n',i));
 assert.ok(i>0);assert.match(body,/q\('moji'\)/);assert.match(body,/\.catch\(\(\)=>q\('local'\)\)/);assert.ok(body.indexOf("q('moji')")<body.indexOf("q('local')"));
 assert.match(body,/api\('dictionary',\{query:word,source,operationId/);
});
