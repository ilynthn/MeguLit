'use strict';
/* 2026-11-14 (recording, 语法 › N0): clicking stage 05, 15, 18 … only changed a lesson list a screen below the five-column
   stage map, 下一课 stayed on 01 / 186 and a 700 ms loop forced the scroll back against the wheel. A picked stage now
   drives the hero, its lessons open inside the map under its row, and finishing a lesson moves on in stage order. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const load=()=>import(pathToFileURL(path.join(__dirname,'..','web','grammar.js')).href);
const esc=s=>String(s??'');
const kicker=html=>/gm-kicker">[^<]*?(\d+) \/ (\d+)</.exec(html);
const heroGo=html=>/class="primary gm-hero-go" data-point="([^"]+)"/.exec(html)?.[1];

test('a picked stage is where 下一课 and 开始这一课 point',async()=>{
 const g=await load(),{keys,order}=g.stageOrder('N0');
 assert.ok(keys.length>=10,'N0 has its stages');
 const stage=keys[14],first=order.find(p=>p.group===stage),at=order.indexOf(first)+1;
 const html=g.listHTML({progress:{}},{locale:'zh',esc,level:'N0',group:stage});
 assert.equal(heroGo(html),first.id,'开始这一课 starts the picked stage');
 assert.equal(Number(kicker(html)[1]),at,'the number follows the stage order');
 assert.match(html,new RegExp(`class="gm-card next" data-point="${first.id}"`),'the panel marks the same lesson as next');
 /* nothing picked: the overall next lesson, stage 01 */
 const plain=g.listHTML({progress:{}},{locale:'zh',esc,level:'N0'});
 assert.equal(kicker(plain)[1],'01');assert.equal(heroGo(plain),order[0].id);
 /* a picked stage that is all learned falls back to the overall next lesson */
 const done=Object.fromEntries(order.filter(p=>p.group===stage).map(p=>[p.id,{learned:true}]));
 assert.equal(heroGo(g.listHTML({progress:done},{locale:'zh',esc,level:'N0',group:stage})),order[0].id);
});

test('the stage lessons open inside the stage map, not a screen below it',async()=>{
 const g=await load(),{keys}=g.stageOrder('N0');
 const html=g.listHTML({progress:{}},{locale:'zh',esc,level:'N0',group:keys[4]});
 const nav=/<nav class="gm-stgs">[\s\S]*<\/nav>/.exec(html)?.[0];
 assert.ok(nav,'one stage map');
 assert.match(nav,/<div class="gm-tracks one" id="gm-stage-panel">[\s\S]*data-point=/,'the lesson panel is inside the map');
 assert.match(nav,new RegExp(`class="gm-stg on[^"]*" data-gtab="${keys[4]}" aria-expanded="true" aria-controls="gm-stage-panel"`));
 assert.doesNotMatch(nav,/role="tab/,'disclosure buttons, not tabs holding a foreign row');
 const css=fs.readFileSync(path.join(__dirname,'..','web','unify.css'),'utf8');
 assert.match(css,/\.gm-stgs>#gm-stage-panel\{grid-column:1\/-1/,'the panel spans the whole row of the grid');
});

test('stage clicks keep the card in place and never hold the scroll against the wheel',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','web','grammar.js'),'utf8');
 const click=/querySelectorAll\('\[data-gtab\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{[\s\S]*?\}\}\);/.exec(src)?.[0];
 assert.ok(click,'stage click handler');
 assert.doesNotMatch(click,/requestAnimationFrame/,'no loop forcing scrollTop back');
 assert.match(click,/sc\.scrollTop\+=card\.getBoundingClientRect\(\)\.top-before/,'the clicked card is kept where it was');
 assert.match(click,/sc\.scrollBy\(\{top:over/,'the page only glides down when the lessons would start off screen');
 assert.match(src,/const placePanel=\(\)=>/);assert.match(src,/placePanel\(\);watchPanel\(\);/);
});

test('progress, NEXT and the next lesson after finishing one follow the stage order',async()=>{
 const g=await load(),{keys,order}=g.stageOrder('N0');
 const stage=keys[14],items=order.filter(p=>p.group===stage);
 /* finishing the first lesson of a stage goes to the next one in that stage */
 let prog={[items[0].id]:{learned:true}};
 assert.equal(g.nextAfter(prog,items[0],'N0').id,items[1].id);
 /* finishing the stage moves on to the first unlearned lesson in stage order */
 prog=Object.fromEntries(items.map(p=>[p.id,{learned:true}]));
 assert.equal(g.nextAfter(prog,items.at(-1),'N0').id,order[0].id);
 /* the stage card counts it and NEXT moves */
 const first=order.filter(p=>p.group===keys[0]);prog={[first[0].id]:{learned:true}};
 const html=g.listHTML({progress:prog},{locale:'zh',esc,level:'N0'});
 const card=new RegExp(`<button[^>]*data-gtab="${keys[0]}"[\\s\\S]*?</button>`).exec(html)[0];
 assert.match(card,new RegExp(`gm-stg-sub">1 / ${first.length}<`));
 assert.match(card,/gm-stg-flag">next/);
 assert.equal(kicker(html)[1],'02');
 const all=Object.fromEntries(first.map(p=>[p.id,{learned:true}]));
 const after=g.listHTML({progress:all},{locale:'zh',esc,level:'N0'});
 assert.match(new RegExp(`<button[^>]*data-gtab="${keys[0]}"[\\s\\S]*?</button>`).exec(after)[0],/gm-stg-flag">clear/);
 assert.match(new RegExp(`<button[^>]*data-gtab="${keys[1]}"[\\s\\S]*?</button>`).exec(after)[0],/gm-stg-flag">next/);
 /* the lesson page hands this back: 下一课 uses the stage order, and the list returns on that stage */
 const src=fs.readFileSync(path.join(__dirname,'..','web','grammar.js'),'utf8');
 assert.match(src,/n=on\?nextAfter\(data\.progress,point,lv,memo\.goal\):null/);
 assert.match(src,/memo\.groupOf=\{\.\.\.\(memo\.groupOf\|\|\{\}\),\[lv\]:n\.group\};openPoint\(n\.id\)/);
});
