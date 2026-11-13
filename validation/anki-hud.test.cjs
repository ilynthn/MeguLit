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
 /* 2026-11-13 English interface asks Jisho instead of MOJi */assert.ok(i>0);assert.match(body,/q\(locale==='en'\?'jisho':'moji'\)/);assert.match(body,/\.catch\(\(\)=>q\('local'\)\)/);assert.ok(body.indexOf("'jisho':'moji')")<body.indexOf("q('local')"));
 assert.match(body,/api\('dictionary',\{query:word,source,operationId/);
});
test('a block frame hugs its content and keeps its scale once known',()=>{
 const a=H.hugRect({x:10,y:10,w:80,h:20},400,100,1000,1000);/* 800x200 px area for a 4:1 content: fills it */
 assert.equal(a.fresh,true);assert.equal(a.scale,2);assert.deepEqual([a.rect.x,a.rect.y,a.rect.w,a.rect.h],[10,10,80,20]);
 const b=H.hugRect({x:10,y:10,w:80,h:40},400,100,1000,1000);/* too tall: frame shrinks to the content, centred */
 assert.deepEqual([b.rect.x,b.rect.y,b.rect.w,b.rect.h,b.rect.s],[10,20,80,20,2]);
 const c=H.hugRect(b.rect,450,100,1000,1000);/* a longer sentence at the same scale grows its box */
 assert.equal(c.fresh,false);assert.equal(c.scale,2);assert.equal(c.rect.w,90);
 const d=H.hugRect({x:0,y:0,w:10,h:10,s:5},400,100,1000,1000);assert.ok(d.scale<=2.475,'never wider than the stage');
});
test('free placement snaps to other blocks, the stage centre and equal gaps; grid mode rounds to the grid',()=>{
 const o={mode:'free',SW:1000,SH:1000,thr:7};
 let r=H.snapRect({x:20.4,y:50,w:10,h:10},[{x:20,y:10,w:30,h:10}],'move',o);assert.equal(r.rect.x,20);assert.ok(r.guides.some(g=>g.axis==='x'&&g.at===20));
 r=H.snapRect({x:44.6,y:70,w:10,h:10},[],'move',o);assert.equal(r.rect.x,45);assert.ok(r.guides.some(g=>g.kind==='centre'));
 /* A at 0-10, B at 20-30 in the same row: placing a 10-wide block at 39.6 snaps to 40 (gap 10) */
 r=H.snapRect({x:39.6,y:0,w:10,h:10},[{x:0,y:0,w:10,h:10},{x:20,y:0,w:10,h:10}],'move',o);assert.equal(r.rect.x,40);assert.ok(r.guides.some(g=>g.kind==='gap'));
 r=H.snapRect({x:33,y:33,w:10,h:10},[],'move',o);assert.deepEqual(r.guides,[]);
 r=H.snapRect({x:13,y:27,w:20,h:10},[],'move',{mode:'grid',grid:50,SW:1000,SH:1000});assert.deepEqual([r.rect.x,r.rect.y],[15,25]);
 r=H.snapRect({x:10,y:10,w:21.7,h:10},[],'se',{mode:'grid',grid:50,SW:1000,SH:1000});assert.equal(r.rect.w,20);
 r=H.snapRect({x:10,y:10,w:29.7,h:10},[{x:40,y:50,w:5,h:5}],'e',o);assert.equal(r.rect.w,30,'a resized right edge snaps to another block');
});
test('four layout presets cover every block and the user can keep their own layouts',()=>{
 assert.deepEqual(Object.keys(M.PRESETS),['classic','split','subtitle','minimal']);
 for(const name of Object.keys(M.PRESETS)){const l=M.preset(name);for(const id of Object.keys(M.LAYOUT)){const r=l[id];assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=100.01&&r.y+r.h<=100.01,name+'.'+id);}}
 assert.notDeepEqual(M.preset('split').shot,M.preset('classic').shot);
 const store={v:null,getItem(){return this.v;},setItem(k,v){this.v=v;}};
 M.save(store,{layout:M.preset('minimal'),style:{},snap:{mode:'grid',grid:32},saved:[{name:'<b>mine',layout:M.preset('split')},...Array(9).fill({name:'x',layout:{}})]});
 const back=M.load(store);assert.equal(back.snap.mode,'grid');assert.equal(back.snap.grid,32);assert.equal(back.saved.length,6);assert.equal(back.saved[0].name,'bmine');assert.deepEqual(back.saved[0].layout.shot,M.preset('split').shot);
 assert.deepEqual(back.layout.word,M.preset('minimal').word);
});
test('the layout editor offers presets, saved layouts, free/grid placement and draws guides',()=>{
 const src=read('anki-review.js'),card=read('anki-card.js'),css=read('anki-layout.css');
 for(const s of ['data-hud-preset','data-hud-saved','data-hud-save','data-hud-mode','data-hud-grid','H.snapRect','H.hugRect','H.drawGuides','tome-anki-hud-frames'])assert.ok(src.includes(s),s);
 for(const s of ['MeguHud.snapRect','MeguHud.hugRect','MeguHud.drawGuides','tome-anki-hud-frames',"id==='shot'"])assert.ok(card.includes(s),s);
 assert.match(css,/\.anki-hud\.editing\[data-snap=grid\] \.anki-hud-grid\{opacity:1\}/);assert.match(read('anki-card.css'),/\.hud-guide-x/);
});

/* 2026-11-13 (user) the screenshot frame changes shape freely and the picture always covers it, framed by focus and zoom */
test('the screenshot keeps its framing (focus, zoom) in the layout and the picture always covers its frame',()=>{
 assert.deepEqual(H.normRect({x:1,y:2,w:30,h:40,fx:150,fy:-3,z:9}),{x:1,y:2,w:30,h:40,fx:100,fy:0,z:4});
 assert.equal(H.normRect({x:1,y:2,w:30,h:40,z:1}).z,undefined);
 const o=H.coverOverflow(1600,900,400,400,1);assert.equal(o.y,0);assert.ok(Math.abs(o.x-311.11)<.1);
 assert.ok(H.coverOverflow(1600,900,400,400,2).y>0,'zoom lets the picture move up and down too');
 const M2=M.cleanLayout({shot:{x:5,y:5,w:20,h:60,fx:70,fy:30,z:1.5}});assert.deepEqual(M2.shot,{x:5,y:5,w:20,h:60,fx:70,fy:30,z:1.5});
 const card=read('anki-card.js'),css=read('anki-card.css'),drag=read('hud-drag.js');
 assert.match(card,/ratio:id==='shot'/);assert.match(card,/function frameShot/);assert.match(card,/objectPosition/);assert.match(card,/addEventListener\('wheel'/);
 assert.match(css,/\[data-hud=shot\] img\{[^}]*object-fit:cover/);assert.doesNotMatch(css,/object-fit:fill/);
 /* edges move one side; corners scale freely, Shift keeps the proportions (screenshot only) */
 assert.match(drag,/ratio&&edge\.length===2&&last\.shiftKey/);assert.match(drag,/for\(const k of \['fx','fy','z'\]\)if\(start\[k\]!==undefined\)r\[k\]=start\[k\]/);
});
test('blocks never overlap: a long example pushes the screenshot, which gives up space before the buttons',()=>{
 const word={x:30,y:4,w:40,h:12},info={x:10,y:17,w:80,h:8},example={x:5,y:26,w:90,h:28},shot={x:17,y:43,w:66,h:43},controls={x:30,y:88,w:40,h:9};
 const r=H.settle({word,info,example,shot},[controls],'shot',1.6).rects;
 const ov=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
 const all=[...Object.values(r),controls];for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)assert.ok(!ov(all[i],all[j]),'overlap '+i+'/'+j);
 assert.ok(r.shot.y>=example.y+example.h);assert.ok(r.shot.y+r.shot.h<=controls.y);assert.equal(r.example.h,example.h);
 /* a long meaning pushes the example (a text block keeps its size), and the screenshot after it */
 const s2=H.settle({info:{x:10,y:17,w:80,h:20},example:{x:5,y:30,w:90,h:14},shot},[controls],'shot');
 assert.equal(s2.rects.example.h,14);assert.ok(s2.rects.example.y>=37);assert.ok(s2.nudged.includes('example')&&s2.nudged.includes('shot'));
 /* a hand-made layout that overlaps is also pulled apart, side by side blocks are left alone */
 const s3=H.settle({shot:{x:2,y:9,w:52,h:74},word:{x:58,y:10,w:39,h:15},example:{x:58,y:20,w:39,h:24}},[],'shot');
 assert.deepEqual(s3.rects.shot,{x:2,y:9,w:52,h:74});assert.ok(s3.rects.example.y>=25);
 assert.match(read('anki-card.js'),/MeguHud\.settle\(own,fixed,'shot'/);assert.match(read('anki-card.css'),/\.hud-label\[data-nudge\]::after/);
});
test('the layout tools are a compact floating dock that moves, folds and keeps out of the way',()=>{
 const src=read('anki-review.js'),css=read('anki-layout.css');
 for(const s of ['data-dock-grip','data-dock-collapse','data-dock-expand','hud-dock-presets','hud-dock-seg','hud-dock-menu','hud-dock-tip','function placeDock','megulit-anki-hud-dock',"'tome-anki-hud-drag'"])assert.ok(src.includes(s),s);
 assert.match(css,/\.anki-hud\.hud-moving \.anki-hud-edit\{opacity:\.08;pointer-events:none\}/);assert.match(css,/\.anki-hud-edit\.collapsed \.hud-dock-panel\{/);
 assert.match(css,/@media \(prefers-reduced-motion:reduce\)\{\.anki-hud-edit,/);assert.doesNotMatch(css,/transition:all/);
 /* Done is the dock's own quiet button, never the site's red sweep (unify.css button.primary) */
 assert.match(src,/class="hud-dock-done" data-hud-done/);assert.doesNotMatch(src,/class="primary" data-hud-done/);
 /* review buttons: one set with their keys, no site primary sweep */
 assert.match(src,/button\.className='hud-primary'/);assert.match(src,/<kbd>'\+ease\+'<\/kbd>/);assert.match(css,/review-controls :is\(button\.hud-primary,button\.anki-rating\):hover:not\(:disabled\)::after\{transform:scaleX\(1\)/);
});
test('full screen covers the window and the top bar, never hides the window, and leaves layout editing alone',()=>{
 const src=read('anki-review.js'),i=src.indexOf('async function setImmersive'),body=src.slice(i).split(/\r?\n \}\r?\n/)[0];
 assert.match(body,/s\.showPopover\(\)/);assert.match(body,/s\.requestFullscreen\(\)/);assert.doesNotMatch(body,/documentElement\.requestFullscreen/);assert.doesNotMatch(body,/setEditing/);
 assert.match(src,/if\(!stage\(\)\|\|event\.repeat\)return;/);
 assert.match(read('anki-layout.css'),/\.anki-hud\.immersive:fullscreen,\.anki-hud\.immersive:popover-open\{position:fixed;inset:0/);
 const rs=fs.readFileSync(path.join(__dirname,'..','desktop','src','main.rs'),'utf8');
 assert.match(rs,/fn fill_monitor\(/);assert.doesNotMatch(rs,/set_fullscreen\(action/);assert.match(rs,/restore_home_surface\(window\);window\.show\(\)/);assert.match(rs,/current_monitor\(\)/);
});
