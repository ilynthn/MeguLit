const test=require('node:test'),assert=require('node:assert');
const store=require('../services/store.cjs');
test('home showcase keeps only ids and a known mode',()=>{
 assert.deepEqual(store.cleanHomeShowcase({mode:'pick',order:['a','a',3,'b'],pinned:['b'],hidden:null,extra:1}),{mode:'pick',order:['a','b'],pinned:['b'],hidden:[]});
 assert.deepEqual(store.cleanHomeShowcase('x'),{mode:'auto',order:[],pinned:[],hidden:[]});
});
test('home showcase order: pinned first, picks, recent fallback, hidden never',async()=>{
 const {showcaseGames}=await import('../web/home-tv.js');
 const games=[{id:'a',lastPlayedAt:3},{id:'b',lastPlayedAt:2},{id:'c',lastPlayedAt:1},{id:'d',lastPlayedAt:9,available:false}];
 assert.deepEqual(showcaseGames(games,null).map(g=>g.id),['a','b','c']);
 assert.deepEqual(showcaseGames(games,{pinned:['c'],hidden:['a']}).map(g=>g.id),['c','b']);
 assert.deepEqual(showcaseGames(games,{mode:'pick',order:['b','a'],pinned:['c']}).map(g=>g.id),['c','b','a']);
 assert.deepEqual(showcaseGames(games,{mode:'pick',order:['a'],hidden:['a']}).map(g=>g.id),['b','c']);
});
test('page veil defaults and clamping',()=>{
 const fs=require('fs'),os=require('os'),path=require('path'),root=fs.mkdtempSync(path.join(os.tmpdir(),'veil-'));fs.mkdirSync(path.join(root,'data'),{recursive:true});
 let p=store.publicPreferences(root);assert.deepEqual(p.pageVeils,{home:{a:.35,s:0,b:14},detail:{a:.25,s:0,b:8},leaderboard:{a:.3,s:0,b:10},history:{a:.3,s:0,b:10}});
 fs.writeFileSync(path.join(root,'data','preferences.json'),JSON.stringify({pageVeils:{home:{a:3,s:2,b:-5},history:{a:.4,s:.5,b:99}}}));
 p=store.publicPreferences(root);assert.deepEqual(p.pageVeils.home,{a:1,s:1,b:0});assert.deepEqual(p.pageVeils.history,{a:.4,s:.5,b:40});assert.deepEqual(p.pageVeils.detail,{a:.25,s:0,b:8});
});
