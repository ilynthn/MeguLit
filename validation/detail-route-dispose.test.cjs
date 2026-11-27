// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(process.env.MEGULIT_DETAIL_ROUTE_TARGET||process.env.ORIGINAL_SCAN_TARGET||path.join(__dirname,'..'));
const app=fs.readFileSync(path.join(root,'web/app.js'),'utf8'),detail=fs.readFileSync(path.join(root,'web/game-detail.js'),'utf8');
const routeStart=app.indexOf('let stopDetailPage=')>=0?app.indexOf('let stopDetailPage='):app.indexOf('async function renderRoute()');
const routeEnd=app.indexOf('\nconst navStack=',routeStart);
assert.ok(routeStart>=0&&routeEnd>routeStart,'actual route source boundaries');
const routeSource=app.slice(routeStart,routeEnd);
console.log('route-dispose sources '+JSON.stringify({root,app:crypto.createHash('sha256').update(app).digest('hex'),detail:crypto.createHash('sha256').update(detail).digest('hex')}));
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function routeFixture(){
 const events=[],pending=new Map(),disposed=[];
 const classList={toggle(){},remove(){},contains(){return true;}};
 const main={dataset:{},classList,children:[],querySelector:()=>null,closest:()=>({classList})};
 Object.defineProperty(main,'innerHTML',{set(value){events.push('paint:'+value);}});
 const noop=()=>{},context={console:{error(...args){throw Error('Unexpected render error: '+String(args.at(-1)));}},document:{querySelector:()=>main,documentElement:{dataset:{},classList}},
  watchStage:noop,stopHistoryTranslations:noop,pageToken:0,stageFor:()=>'',applyVeil:noop,syncStage:noop,model:{preferences:{},games:[{id:'A'},{id:'B'}]},
  matchMedia:()=>({matches:true}),stopShelf:noop,paintGlow:noop,stopGlow:noop,stopSimpleGrid:noop,stopField:noop,home:()=>events.push('paint:home'),
  loading:()=> 'loading',api:noop,invoke:noop,locale:'zh',text:{},esc:String,icon:noop,cover:noop,duration:noop,datetime:noop,relativeTime:noop,number:noop,definitions:noop,
  route:'home',selectedGameId:'',gameTab:'',gameOrigin:'library',navigate:noop,startGame:noop,editGame:noop,removeGame:noop,japaneseRestore:noop,toast:noop,
  enhanceSelects:noop,dockPageTools:noop,moveTabInk:noop,alignSubtabs:noop,subtab:'',tabsGroup:null,pageEnter:noop,requestAnimationFrame:noop,setupMarquees:noop,
  renderGamePage({id,isCurrent}){const d=deferred();pending.set(id,{...d,isCurrent});events.push('start:'+id);return d.promise;}};
 vm.createContext(context);vm.runInContext(routeSource+'\nglobalThis.start=(next,id)=>{route=next;selectedGameId=id;return renderRoute();};',context,{timeout:1000});
 return {events,disposed,pending,start:context.start,finish(id){pending.get(id).resolve(()=>{disposed.push(id);events.push('dispose:'+id);});}};
}
test('completed detail is disposed once before the next page paints',{timeout:2000},async()=>{
 const f=routeFixture(),a=f.start('game','A');f.finish('A');await a;
 assert.deepEqual(f.disposed,[]);await f.start('home');
 assert.deepEqual(f.disposed,['A']);assert.ok(f.events.indexOf('dispose:A')<f.events.indexOf('paint:home'));
 await f.start('home');assert.deepEqual(f.disposed,['A']);
});
test('old asynchronous detail disposes immediately on completion after leaving',{timeout:2000},async()=>{
 const f=routeFixture(),a=f.start('game','A');await f.start('home');assert.equal(f.pending.get('A').isCurrent(),false);
 f.finish('A');await a;assert.deepEqual(f.disposed,['A']);await f.start('home');assert.deepEqual(f.disposed,['A']);
});
test('A/B interleavings cannot replace or dispose the current detail cleanup',{timeout:2000},async()=>{
 for(const first of ['A','B']){const f=routeFixture(),a=f.start('game','A'),b=f.start('game','B');assert.equal(f.pending.get('A').isCurrent(),false);assert.equal(f.pending.get('B').isCurrent(),true);
  f.finish(first);await (first==='A'?a:b);const second=first==='A'?'B':'A';f.finish(second);await (second==='A'?a:b);
  assert.deepEqual(f.disposed,['A']);await f.start('home');assert.deepEqual(f.disposed,['A','B']);await f.start('home');assert.deepEqual(f.disposed,['A','B']);}
});
test('actual game-detail return cleans first-player and active collection mount',{timeout:2000},async()=>{
 const events=[],node=()=>({}),nodes=new Map(),main={querySelector(selector){if(['.detail-cover.tv-holo','.detail-title>h1','[data-jp-restore]','[data-warn-restore]'].includes(selector))return null;if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);},querySelectorAll:()=>[]};
 let styleLoads=0;const noop=()=>{},context={ensureStoryStyles:()=>{styleLoads++;return Promise.resolve();},loadGsap:()=>Promise.resolve(),embedStatus:()=>({kind:'safe',label:''}),attachEmbedPopover:noop,mountFirstPlayer:()=>({dispose:()=>events.push('firstPlayer.dispose')}),mountDetailDeveloper:()=>({}),mountCnGuide:noop,
  zeroLatencyLabel:()=>'',zeroActivityLabel:()=>'',originalLabel:()=>'',localeToggleHTML:()=>'',bindLocaleToggle:noop,durHTML:()=>'',launchReason:()=>'',receptionMessages:{zh:{}},requestAnimationFrame:noop,matchMedia:()=>({matches:true}),
  mountWords:()=>()=>events.push('words.unmount'),window:{addEventListener:noop,removeEventListener:()=>events.push('focus.remove')},document:{},Promise};
 vm.createContext(context);
 // Preserve the actual function and its lexical labels; only module import/export syntax is removed
 vm.runInContext(detail.replace(/^import .*;\r?\n/gm,'').replace('export async function renderGamePage','async function renderGamePage')+'\nglobalThis.renderActual=renderGamePage;',context,{timeout:1000});
 const game={title:'Synthetic detail',available:true},data={game,info:{},counts:{sessions:0},words:[],sentences:[],sessions:[]};
 const cleanup=await context.renderActual({main,id:'fixture',tab:'words',locale:'zh',text:{},esc:String,icon:noop,cover:()=>'',number:String,relativeTime:()=>'',isCurrent:()=>true,
  api:action=>action==='game_detail'?Promise.resolve(data):new Promise(()=>{}),onBack:noop,onEdit:noop,onLaunch:noop,toast:noop});
 assert.equal(styleLoads,1);assert.equal(typeof cleanup,'function');assert.deepEqual(events,[]);cleanup();assert.deepEqual(events,['focus.remove','firstPlayer.dispose','words.unmount']);
});

test('background route refresh preserves an open novel reader but navigation disposes it',async()=>{
 const events=[];
 const main={dataset:{},classList:{toggle(){},remove(){}},querySelector:()=>null,closest:()=>null};
 const noop=()=>{};
 const context={route:'novel',watchStage:()=>events.push('render'),document:{
  querySelector:selector=>selector==='#main' || selector==='#main.nv-reading' ? main : null,
  documentElement:{dataset:{},classList:{contains:()=>false}}
 },window:{},stopHistoryTranslations:noop,pageToken:0,stageFor:()=>'',applyVeil:noop,syncStage:noop,
  model:{preferences:{}},stopShelf:noop,stopGlow:noop,stopSimpleGrid:noop,stopField:noop,
  mountNovel:async()=>{events.push('mount');return ()=>events.push('dispose');},
  api:noop,invoke:noop,locale:'zh',text:{},esc:String,toast:noop,navigate:noop,
  enhanceSelects:noop,dockPageTools:noop,moveTabInk:noop,alignSubtabs:noop,subtab:'',tabsGroup:null,pageEnter:noop,requestAnimationFrame:noop};
 context.events=events;
 vm.createContext(context);
 vm.runInContext(routeSource+"\nstopDetailPage=()=>events.push('dispose');globalThis.render=renderRoute;",context);
 await context.render();
 assert.deepEqual(events,[]);
 await context.render({navigation:true});
 assert.deepEqual(events,['render','dispose','mount']);
});
