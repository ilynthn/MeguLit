/* SPDX-License-Identifier: GPL-3.0-or-later */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
test('card maker: spring curve settles at 1 and the linear() easing starts at 0 and ends at 1',async()=>{const {springCurve,springEasing,SPRING}=await import('../web/card-maker.js');
 for(const s of Object.values(SPRING)){const {points,duration}=springCurve(s);assert.equal(points[points.length-1],1);assert(duration>100&&duration<2500,String(duration));
  const e=springEasing(s);assert.match(e.easing,/^linear\(0,.*,1\)$/);}
 assert(Math.max(...springCurve(SPRING.bouncy).points)>1,'bouncy overshoots');});
test('card maker: still is clamped inside the picture and maps back to a frame that the card covers',async()=>{const {clampStill,stillRect,windowSize,CARD_RATIO,MAX_ZOOM}=await import('../web/card-maker.js');
 for(const [w,h] of [[1600,900],[600,800],[1000,1000],[300,2000]])for(const st of [{},{x:0,y:0,scale:1},{x:1,y:1,scale:3},{x:'bad',y:-4,scale:0},{x:.5,y:.5,scale:99}]){
  const c=clampStill(w,h,st),win=windowSize(w,h,c.scale);assert(c.scale>=1&&c.scale<=MAX_ZOOM);
  assert(c.x-win.w/2>=-1e-4&&c.x+win.w/2<=1+1e-4&&c.y-win.h/2>=-1e-4&&c.y+win.h/2<=1+1e-4,JSON.stringify([w,h,st,c]));
  const fw=252,fh=fw/CARD_RATIO,r=stillRect(w,h,fw,fh,c);assert(r.left<=.1&&r.top<=.1&&r.left+r.width>=fw-.1&&r.top+r.height>=fh-.1,'the picture always covers the card');}
 assert.deepEqual(clampStill(1600,900,{}),{x:.5,y:.5,scale:1});});
test('card maker: search finds a work by any of its names (Chinese / Japanese / English, kana folded)',async()=>{const {filterGames}=await import('../web/card-maker.js');
 const games=[{gameId:1,title:'千恋＊万花',aliases:['Senren Banka']},{gameId:2,title:'サクラノ詩',titleZh:'樱之诗'},{gameId:3,title:'Summer Pockets'}];
 assert.deepEqual(filterGames(games,'千恋').map(g=>g.gameId),[1]);assert.deepEqual(filterGames(games,'senren').map(g=>g.gameId),[1]);
 assert.deepEqual(filterGames(games,'樱之').map(g=>g.gameId),[2]);assert.deepEqual(filterGames(games,'さくら').map(g=>g.gameId),[2]);
 assert.deepEqual(filterGames(games,'summer pock').map(g=>g.gameId),[3]);assert.equal(filterGames(games,'').length,3);});
test('card maker: only what the API returned is shown, grouped CG / shot / cover',async()=>{const {groupUnlocked}=await import('../web/card-maker.js');
 const g=groupUnlocked([{id:'c',kind:'cover',src:'a',source:'cover'},{id:'1',kind:'cg',src:'b',source:'save'},{id:'s',kind:'shot',src:'c',source:'shot'},{id:'x',kind:'cg',source:'seen'},{id:'y',kind:'other',src:'d'}]);
 assert.deepEqual(g.map(x=>[x.kind,x.items.map(i=>i.id)]),[['cg',['1']],['shot',['s']],['cover',['c']]]);assert.deepEqual(groupUnlocked(null),[]);});
test('card maker: never reads game files itself and only animates transform/opacity',()=>{const js=fs.readFileSync(path.join(__dirname,'../web/card-maker.js'),'utf8');
 assert(!/game_cgs|game_cg\b|game_shots|readdir|scan/.test(js),'the maker asks only the cards_* API');
 for(const a of ['cards_games','cards_unlocked','cards_create','cards_insert','megulit:cards-changed','openCardMaker'])assert(js.includes(a),a);
 for(const m of js.matchAll(/\{(\w+):[^{}]*?\}/g))assert(!/^(width|height|left|top|filter|clipPath|borderRadius)$/.test(m[1])||!/animate\(\[\{/.test(js.slice(Math.max(0,m.index-30),m.index)),'animated '+m[1]);
 assert(js.includes('prefers-reduced-motion'));});
test('card maker: a refused insert is said plainly and a stale wall refreshes; the old status line was screen-reader only',async()=>{const {insertProblem}=await import('../web/card-maker.js');
 const w={full:'FULL',gone:'GONE',insertFail:'FAIL {e}'};
 assert.deepEqual(insertProblem(Error('TOPLOADER_FULL'),w),{text:'FULL',refresh:true});
 assert.deepEqual(insertProblem(Error('CARD_NOT_FOUND'),w),{text:'GONE',refresh:true});
 assert.deepEqual(insertProblem(Error('CARDS_BUSY'),w),{text:'FAIL CARDS_BUSY',refresh:false});
 const js=fs.readFileSync(path.join(__dirname,'..','web','card-maker.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','web','card-maker.css'),'utf8');
 assert.match(js,/<p class="cm-error" role="alert" hidden><\/p>/);assert.match(css,/\.cm-error\{position:absolute/);
 assert.doesNotMatch(js,/catch\(err\)\{printing=false;b\.classList\.remove\('is-picked'\);live\.textContent=/,'我的卡 failures are not silent');
 assert.match(js,/if\(insert&&card\?\.id!=null\)\{try\{const r=await call\('cards_insert'/,'make-and-sleeve checks the insert');});
