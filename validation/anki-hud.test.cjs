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
test('the saved slot never moves; the frame is the content box inside it; the text size is the saved scale (user 2026-11-14)',()=>{
 const a=H.hugRect({x:10,y:10,w:80,h:20},400,100,1000,1000);/* no scale yet: 1, the 外观 size, whatever the card */
 assert.equal(a.fresh,true);assert.equal(a.scale,1);assert.deepEqual([a.rect.x,a.rect.y,a.rect.w,a.rect.h,a.rect.s],[10,10,80,20,1]);assert.equal(a.ox,200);
 const b=H.hugRect({x:10,y:10,w:80,h:40,s:2},400,100,1000,1000);/* the frame stays the box, content at its top */
 assert.deepEqual([b.rect.x,b.rect.y,b.rect.w,b.rect.h,b.rect.s],[10,10,80,40,2]);assert.equal(b.oy,0);assert.equal(b.scale,2);
 /* answer side taller: same box, same place; it may use the free space below before it shrinks */
 const q=H.hugRect({x:58,y:42,w:39,h:24,s:1.5},300,60,1360,800),ans=H.hugRect({x:58,y:42,w:39,h:24,s:1.5},300,260,1360,800);
 for(const r of [q.rect,ans.rect])assert.deepEqual([r.x,r.y,r.w,r.h],[58,42,39,24]);
 assert.equal(q.scale,1.5);assert.ok(ans.scale<1.5&&260*ans.scale<=24*8+.01,'no room: taller content shrinks into the box');
 const roomy=H.hugRect({x:58,y:42,w:39,h:24,s:1.5},300,260,1360,800,6,50);assert.equal(roomy.scale,1.5,'with room below it keeps its size');
 const d=H.hugRect({x:0,y:0,w:10,h:10,s:5},400,100,1000,1000);assert.ok(d.scale<=.25,'never wider than its box');
 /* free space under a box: down to the next block that shares its width, else the stage bottom */
 assert.equal(H.roomBelow({x:58,y:27,w:39,h:12},[{x:58,y:42,w:39,h:24},{x:2,y:9,w:52,h:74}]),14);assert.equal(H.roomBelow({x:58,y:42,w:39,h:24},[{x:2,y:9,w:52,h:74}]),58);
 /* both sides place content by the offsets; the card wraps text at the saved scale and passes the room */
 /* the frame (edit outline, drag target, snapping) is the content's real box: top of the slot, centred across */
 assert.deepEqual(a.frame,{x:30,y:10,w:40,h:10,s:1});assert.deepEqual([b.frame.x,b.frame.y,b.frame.w,b.frame.h],[10,10,80,20]);
 assert.match(read('anki-card.js'),/shown\[id\]=h\.frame;MeguHud\.applyRect\(el,h\.frame\)/);assert.match(read('anki-review.js'),/hostShown\[id\]=h\.frame;H\.applyRect\(el,h\.frame\)/);
 /* dragging / resizing the frame carries the same change to the saved slot, never replaces it with one card's content */
 const slot={x:58,y:42,w:39,h:24,s:1};assert.deepEqual(H.carry(slot,{x:70,y:42,w:15,h:5,s:1},{x:60,y:50,w:15,h:5,s:1}),{x:48,y:50,w:39,h:24,s:1});
 assert.deepEqual(H.carry({...slot,x:40},{x:52,y:42,w:15,h:5,s:1},{x:52,y:42,w:30,h:10,s:2}),{x:40,y:42,w:54,h:29,s:2});assert.equal(H.carry(slot,{x:70,y:42,w:15,h:5,s:1},{x:70,y:42,w:30,h:10,s:2}).x,46,'kept inside the stage');
 assert.match(read('anki-card.js'),/onCommit:\(r,from\)=>\{r=MeguHud\.carry\(hud\.layout\[id\],from,r\);/);assert.match(read('anki-review.js'),/onCommit:\(r,from\)=>\{hud\.layout\[id\]=H\.carry\(hud\.layout\[id\],from,r\);/);
 /* wrapped text: the box shrinks to its longest line; edit frames are plain rectangles; [例] flows with the sentence */
 assert.match(read('anki-card.js'),/rg\.selectNodeContents\(box\)/);assert.match(read('anki-layout.css'),/\.anki-hud\.editing \.anki-hud-block\{border-radius:0\}/);assert.ok(!/anki-hud-block\[data-hud=controls\]\{border-radius:999px\}/.test(read('anki-layout.css')));
 assert.match(read('anki-card.css'),/body\.hud-edit \.hud-block\{border-radius:0\}/);assert.match(read('anki-card.css'),/\[data-hud=example\] \.tm-ex\{display:block;text-align:center\}/);
 const card=read('anki-card.js');assert.match(card,/const s0=Number\.isFinite\(r\.s\)\?r\.s:1;if\(nw\*s0>r\.w\*SW\/100\+1\)/);assert.match(card,/MeguHud\.roomBelow\(/);
 /* the size is the user's: a move or a side keeps it, a corner scales it with the box */
 const drag=read('hud-drag.js');assert.match(drag,/r\.s=edge\.length===2\?/);assert.ok(!/delete r\.s/.test(drag));
});
test('the answer always has the reading: from WordReading, else from the example furigana (user 2026-11-14)',()=>{
 assert.equal(H.rubyReading('遠ざかる','<b class="tm-hl"><ruby>遠<rt>とお</rt></ruby>ざかって</b>いく'),'とおざかる');
 assert.equal(H.rubyReading('呼び鈴','<ruby>呼<rt>よ</rt></ruby>び<ruby>鈴<rt>りん</rt></ruby>'),'よびりん');
 assert.equal(H.rubyReading('理不尽','<ruby>理不尽<rp>(</rp><rt>リフジン</rt><rp>)</rp></ruby>'),'りふじん');
 assert.equal(H.rubyReading('理不尽','理不尽だ'),'','no ruby: nothing is guessed');assert.equal(H.rubyReading('かわいい','<ruby>可<rt>か</rt></ruby>'),'','kana words have no reading line');
 const card=read('anki-card.js');assert.match(card,/if\(m0&&!card\.querySelector\('\.tm-reading'\)/);assert.match(card,/d\.className='tm-reading';d\.dataset\.from='sentence'/);
});
test('a new render never reuses an older render\'s stage or dock; full screen keeps the window wallpaper (user 2026-11-14)',()=>{
 const src=read('anki-review.js'),css=read('anki-layout.css');
 assert.match(src,/let s=stage\(\);if\(s&&s\.__owner===owner\)return s;/);assert.match(src,/clearInterval\(poll\);leaveHud\(\);dockEl\?\.remove\(\);clearInterval\(dockWatch\);/);
 assert.match(src,/function syncBackdrop\(\)\{/);assert.match(src,/document\.querySelector\('\.app-backdrop:not\(\.anki-hud-backdrop\)'\)/);assert.match(src,/toggle\('anki-immersive',on\);spanCanvas\(\);syncBackdrop\(\);/);
 assert.match(css,/\.anki-hud\.immersive>\.app-backdrop\.anki-hud-backdrop\{z-index:-2;overflow:hidden\}/);
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
 assert.match(css,/\.anki-hud\.hud-moving \.anki-hud-edit,\.anki-hud-edit\.hud-moving\{opacity:\.08;pointer-events:none\}/);assert.match(css,/\.anki-hud-edit\.collapsed \.hud-dock-panel\{/);
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
test('the layout dock has its own remembered opacity and lives in a top-level layer clamped only to the window',()=>{
 /* user 2026-11-14: the panel covered the blocks and could not leave the HUD */
 const src=read('anki-review.js'),css=read('anki-layout.css');
 assert.match(src,/opacity:'透明度',place:'摆放'/);assert.match(src,/opacity:'Opacity',place:'Placement'/);assert.match(src,/opacity:'透明度',place:'配置'/);
 assert.match(src,/type="range" min="30" max="100" step="5" data-dock-op/);assert.match(src,/op:Number\.isFinite\(d\.op\)\?Math\.min\(100,Math\.max\(30,d\.op\)\):100/);
 assert.match(css,/\.anki-hud-edit \.hud-dock-panel\{opacity:var\(--dk-op,1\)\}/);
 assert.match(css,/\.anki-hud-edit:not\(\.op-live\) \.hud-dock-panel:is\(:hover,:focus-within\),\.anki-hud-edit\.dragging \.hud-dock-panel\{opacity:1\}/);assert.match(src,/box\.classList\.toggle\('op-live'/);
 /* out of the HUD: fixed, appended to <body> (or the full-screen element), clamped to innerWidth/innerHeight, not the canvas */
 assert.match(css,/\.anki-hud-edit\{[^}]*position:fixed;/);assert.match(src,/home=fs&&fs!==document\.documentElement\?fs:document\.body/);
 assert.match(src,/const dockClamp=\(box,x,y\)=>\{[^}]*innerWidth-W-m[^}]*innerHeight-Hh-m/);
 const paint=src.slice(src.indexOf('const paint=()=>'),src.indexOf('const move=e=>'));assert.ok(paint.includes('dockClamp('));assert.ok(!/c\.width-W/.test(paint),'drag must not clamp to the HUD canvas');
 /* the old canvas-relative fx/fy are not read any more, so an old saved spot cannot place it oddly */
 assert.ok(!/dock\.fx/.test(src));
});
test('the layout space is the whole content area of the window, the same in edit and play mode (user 2026-11-14)',()=>{
 const src=read('anki-review.js'),css=read('anki-layout.css');
 /* canvas and background break out of the centred column to the page area under the sub-nav, edge to edge */
 assert.match(src,/function spanCanvas\(\)\{/);assert.match(src,/main\.querySelector\(':scope>\.tabs'\)/);
 assert.match(src,/'--span-l':-at\[0\],'--span-t':top-at\[1\],'--span-w':main\.clientWidth,'--span-h':Math\.max\(200,main\.clientHeight-top\)/);
 /* offsets from offsetLeft/Top, not getBoundingClientRect: the column's enter transform must not skew them */
 const fn=src.slice(src.indexOf('function spanCanvas'),src.indexOf('const moving='));assert.ok(fn.includes('offsetLeft')&&!fn.includes('getBoundingClientRect'));
 assert.match(src,/new ResizeObserver\(\(\)=>spanCanvas\(\)\)\.observe\(s\.closest\('\.main'\)\)/);assert.match(src,/toggle\('anki-immersive',on\);spanCanvas\(\);/);
 assert.match(css,/\.anki-hud\.span:not\(\.immersive\) :is\(\.anki-hud-canvas,\.anki-hud-bg\)\{position:absolute;inset:auto;left:var\(--span-l\);top:var\(--span-t\);width:var\(--span-w\);height:var\(--span-h\)/);
 /* grid, card frame and blocks all live in that one canvas, so what is placed in edit mode is where it shows */
 const shell=src.slice(src.indexOf("s.innerHTML='<div class=\"anki-hud-bg\""));const cv=shell.slice(shell.indexOf('anki-hud-canvas'));
 for(const k of ['anki-hud-grid','anki-hud-frame-slot','anki-hud-layer'])assert.ok(cv.indexOf(k)>0&&cv.indexOf(k)<cv.indexOf('anki-hud-keys'),k);
 /* and the reveal / next-card rule still holds in the bigger space: a saved box comes back unchanged */
 const r={x:58,y:42,w:39,h:24,s:1.5};for(const nh of [60,260])assert.deepEqual((({x,y,w,h})=>[x,y,w,h])(H.hugRect(r,300,nh,1904,956).rect),[58,42,39,24]);
});
