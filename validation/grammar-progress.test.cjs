'use strict';
/* 2026-11-14 (user: 「点开地图体系之后 回到课程列表又要从头开始」; recording 04.33.17): lesson at step 2 → 在体系地图上 →
   ← 课程列表 → the lesson started over at step 1 and the list was back at the top. Each lesson now keeps its step and the
   ✓ steps, the list keeps its scroll and stage, the map returns to the lesson it came from, and ‹ › follows these views. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const store=new Map();globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const web=f=>pathToFileURL(path.join(__dirname,'..','web',f)).href;
const esc=s=>String(s??'');
const read=f=>fs.readFileSync(path.join(__dirname,'..','web',f),'utf8');

test('a lesson keeps its step and the steps already done, across visits and restarts',async()=>{
 const g=await import(web('grammar.js'));
 assert.deepEqual(g.stepOf('wa'),{step:0,max:0});
 g.keepStep('wa',3);g.keepStep('wa',1);
 assert.deepEqual(g.stepOf('wa'),{step:1,max:3},'going back to step 2 keeps the ✓ on what was reached');
 assert.deepEqual(JSON.parse(store.get('megulit-grammar-steps')).wa,{step:1,max:3},'kept in browser storage, so a restart keeps it');
 const html=g.lessonHTML(g.pointsOf('N5').find(p=>p.id==='wa'),{progress:{}},{locale:'zh',esc,step:1,reached:3});
 const dots=[...html.matchAll(/class="gm-step-dot([^"]*)" data-step="(\d)"/g)].map(m=>[m[2],m[1].trim()]);
 assert.deepEqual(dots.slice(0,4),[['0','passed'],['1','active'],['2','passed'],['3','']]);
 g.keepStep('wa',2,6);assert.equal(g.stepOf('wa').max,6,'a lesson marked learned has every step done');
});

test('every way into a lesson restores its step; the map returns to it; the list keeps its place',()=>{
 const src=read('grammar.js');
 assert.match(src,/const openPoint=id=>\{point=pointById\(id\);step=Math\.min\(STEPS\.length-1,stepOf\(id\)\.step\|\|0\);/,'list, map, 下一课 and 开始这一课 all go through openPoint');
 assert.match(src,/step=Math\.max\(0,Math\.min\(STEPS\.length-1,n\)\);save\(\);keepStep\(point\?\.id,step\);/);
 assert.match(src,/if\(on\)keepStep\(point\.id,step,STEPS\.length\);/);
 assert.match(src,/back\.onclick=\(\)=>\{memo\.mapFrom='';go\(fromLesson\?'lesson':'list'\);\}/);
 assert.match(src,/if\(view==='list'&&next!=='list'\)memo\.listY=scroller\(\)\?\.scrollTop\|\|0;/,'leaving the list remembers its scroll');
 assert.match(src,/root\.addEventListener\('wheel',stopRestore/,'the reader\'s own scrolling always wins');
});

test('‹ › history: page views are recorded and handed back to the page',async()=>{
 const {pageNav}=await import(web('page-nav.js'));const seen=[];pageNav.record=(s,r)=>seen.push([s,r]);
 pageNav.push({view:'lesson',point:'wa'});pageNav.replace(null);assert.deepEqual(seen,[[{view:'lesson',point:'wa'},false],[null,true]]);
 const off=pageNav.listen(s=>{seen.push(['got',s]);});assert.equal(pageNav.apply({view:'map'}),true);assert.deepEqual(seen.at(-1),['got',{view:'map'}]);
 off();assert.equal(pageNav.apply({view:'lesson'}),false);assert.deepEqual(pageNav.take(),{state:{view:'lesson'}},'kept for the page that mounts next');
 assert.equal(pageNav.take(),undefined);pageNav.expect(null);assert.deepEqual(pageNav.take(),{state:null});
 const stale=pageNav.listen(()=>false);assert.equal(pageNav.apply({view:'list'}),false,'a page no longer on screen declines');stale();pageNav.reset();
 const app=read('app.js');
 assert.match(app,/const navEntry=\(\)=>\(\{route,subtab,game:selectedGameId,series:selectedSeriesId,origin:gameOrigin,page:pageState\}\);/);
 assert.match(app,/if\(samePage&&pageNav\.apply\(pageState\)\)\{updateNavButtons\(\);return;\}if\(!samePage\)pageNav\.expect\(pageState\);/);
 const src=read('grammar.js');
 assert.match(src,/if\(!replay\)pageNav\.push\(stateOf\(\)\);/,'list, lesson and map moves are history steps');
 assert.match(src,/const unlisten=pageNav\.listen\(st=>\{if\(!isCurrent\(\)\|\|!root\.isConnected\)return false;go\(takeState\(st\),true\);return true;\}\);/);
});
