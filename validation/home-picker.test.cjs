/* 2026-11-13 hand editor: a tab docked on the right edge (slides out on hover, tucks back) opens a window where library games are ticked
   into or out of the home hand; the old "全部作品" card and the "+" card are gone */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const WEB=path.join(__dirname,'..','web');

test('ticked games become the hand in order; nothing ticked goes back to recently played',async()=>{
 const {applyHandPick,HAND_MAX}=await import('../web/home-picker.js');
 const prev={mode:'auto',order:['x'],pinned:['a','z'],hidden:['b','q']};
 assert.deepEqual(applyHandPick(prev,['b','a','b','c']),{mode:'pick',order:['b','a','c'],pinned:['a'],hidden:['q']});
 assert.deepEqual(applyHandPick(prev,[]),{mode:'auto',order:[],pinned:[],hidden:['b','q']});
 assert.equal(applyHandPick({},Array.from({length:20},(_,i)=>'g'+i)).order.length,HAND_MAX);
 const {showcaseGames}=await import('../web/home-tv.js');
 const games=['a','b','c','d'].map((id,i)=>({id,title:id,lastPlayedAt:i}));
 assert.deepEqual(showcaseGames(games,applyHandPick({},['c','a'])).map(g=>g.id),['c','a'],'the home hand shows exactly the ticked games');
});

test('the window lists the current hand first, then the rest of the library by recent play; full hand blocks adding',async()=>{
 const {pickerRows,togglePick,HAND_MAX}=await import('../web/home-picker.js');
 const games=[{id:'a',lastPlayedAt:1},{id:'b',lastPlayedAt:5},{id:'c',lastPlayedAt:3},{id:'gone',available:false},{id:'d',lastLaunchedAt:9}];
 assert.deepEqual(pickerRows(games,['c','a']).map(g=>g.id),['c','a','d','b']);
 assert.deepEqual(togglePick(['a'],'b'),['a','b']);assert.deepEqual(togglePick(['a','b'],'a'),['b']);
 const full=Array.from({length:HAND_MAX},(_,i)=>'g'+i);assert.equal(togglePick(full,'new'),full);assert.equal(togglePick(full,'g0').length,HAND_MAX-1);
});

test('home page: no 全部作品 / + cards in the hand; a docked tab slides out on hover and opens the picker',()=>{
 const js=fs.readFileSync(path.join(WEB,'home-tv.js'),'utf8'),css=fs.readFileSync(path.join(WEB,'home-tv.css'),'utf8'),pick=fs.readFileSync(path.join(WEB,'home-picker.js'),'utf8');
 for(const gone of ['tv-hc-add','tv-hc-all','tv-drawer','hand.setExtras('])assert.ok(!js.includes(gone),gone+' is gone');
 assert.ok(js.includes('createDock(')&&js.includes('openHandPicker('));
 assert.match(css,/\.tv-dock\{[^}]*right:0;[^}]*width:(\d+)px;min-height:(\d+)px;[^}]*border-radius:12px!important;[^}]*transform:translateX\(calc\(100% - \d+px\)\)/,'portrait card tab tucked into the right edge');
 assert.match(css,/\.tv-dock span\{[^}]*writing-mode:vertical-rl/,'label runs down the card');
 /* the plus is drawn, not a glyph, and plus + label centre as one group with even room above and below */
 assert.match(css,/\.tv-dock b\{[^}]*font-size:0\}/,'drawn plus');assert.match(css,/\.tv-dock b::before\{[^}]*border-left:2px solid/,'plus strokes are pixel-snapped borders');
 assert.match(css,/\.tv-dock::after\{[^}]*inset:4px;[^}]*border-radius:7px/,'inner frame concentric with the 12px outer radius');
 assert.match(css,/\.tv-dock\{[^}]*justify-content:center;[^}]*padding:21px 0 21px!important/,'even padding top and bottom');
 assert.match(css,/\.tv-dock\.out\{transform:translateX\(-\d+px\);/,'slides fully into view, never rotated (sharp text)');
 const [,dw,dh]=css.match(/\.tv-dock\{[^}]*width:(\d+)px;min-height:(\d+)px/);assert.ok(+dh/+dw>1.4,'portrait card');assert.ok(!/\.tv-dock\.out\{[^}]*rotate/.test(css));
 assert.ok(pick.includes("addEventListener('pointerenter'")&&pick.includes("addEventListener('pointerleave'"),'opens on hover, tucks back when the pointer leaves');
 assert.ok(pick.includes('aria-modal="true"')&&pick.includes("e.key==='Escape'"),'the window is a modal that Escape closes');
});

test('the hand holds at most 10 cards in every mode',async()=>{
 const {HAND_MAX}=await import('../web/home-picker.js'),{showcaseGames}=await import('../web/home-tv.js');assert.equal(HAND_MAX,10);
 const games=Array.from({length:30},(_,i)=>({id:'g'+i,title:'g'+i,lastPlayedAt:i}));
 assert.equal(showcaseGames(games,{mode:'auto'}).length,10);
 assert.equal(showcaseGames(games,{mode:'pick',order:games.map(g=>g.id),pinned:['g1','g2']}).length,10);
});

test('bottom bar: the small game name rises in letter by letter and a line types itself out',()=>{
 const js=fs.readFileSync(path.join(WEB,'home-tv.js'),'utf8'),css=fs.readFileSync(path.join(WEB,'home-tv.css'),'utf8'),judge=fs.readFileSync(path.join(WEB,'judge-r2.css'),'utf8');
 assert.ok(js.includes('<span class="tv-who"></span><span class="tv-line"></span>'));assert.ok(js.includes('nameIn(g);type('));assert.ok(!js.includes('const type=()=>{}'));
 assert.match(css,/\.tv-dialog \.tv-who\{[^}]*font-size:12px/);assert.match(css,/\.tv-who\.in i\{opacity:1;transform:none\}/);
 assert.ok(!/\.tv-dialog \.tv-who\{display:none/.test(judge),'the name is no longer hidden');
});
