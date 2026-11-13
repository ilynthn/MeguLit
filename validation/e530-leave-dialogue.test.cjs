'use strict';
/* E530 (DDLC Plus: boot prompt stayed in the reader on the main menu): the reader is cleared once the game leaves the
   dialogue screen (shown line's stream silent 12 s + three different short labels on other streams), never during dialogue. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs');
function fixture(){let now=1000;const out=[];const h=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>out.push(m),()=>{},()=>now);h.trace=()=>{};h.send=()=>{};
 const threads=list=>{h.state.hookThreads=list;return h.leaveCheck();};return {h,out,threads,tick:ms=>{now+=ms;},cleared:()=>out.some(m=>m.hookSource===''&&m.hookSourceOrigin==='leave')};}
const sel={id:'a',selected:true,sample:'Press HELP key to show the help screen.'};
test('menu labels after a silent dialogue stream clear the reader',()=>{const f=fixture();f.h.lastSource='Press HELP key to show the help screen.';f.h.lastSourceAt=1000;
 f.threads([sel,{id:'b',sample:''}]);f.tick(3000);f.threads([sel,{id:'b',sample:'New Game'}]);f.threads([sel,{id:'b',sample:'Load Game'},{id:'c',sample:'Settings'}]);
 assert.equal(f.cleared(),false,'not before 12 s');f.tick(10000);assert.equal(f.threads([sel,{id:'b',sample:'Load Game'},{id:'c',sample:'Settings'}]),true);assert.equal(f.cleared(),true);assert.equal(f.h.lastSource,'');
 assert.equal(f.threads([sel,{id:'b',sample:'Extras'}]),false,'only once');});
test('a slow reader, clocks and prose on other streams never clear',()=>{const f=fixture();f.h.lastSource='「今日はいい天気だね」';f.h.lastSourceAt=1000;
 for(let i=0;i<20;i++){f.tick(5000);f.threads([sel,{id:'clock',sample:'12:'+(10+i)},{id:'log',sample:'He walked slowly to the station and waited there for a while.'}]);}
 assert.equal(f.cleared(),false);});
test('labels that arrive with the line do not count after a new line',()=>{const f=fixture();f.h.lastSource='x';f.h.lastSourceAt=1000;
 f.threads([sel,{id:'b',sample:'Auto'},{id:'c',sample:'Skip'},{id:'d',sample:'Save'}]);f.h.lastSource='「次の台詞」';f.h.lastSourceAt=2000;f.tick(20000);
 assert.equal(f.threads([sel,{id:'b',sample:'Auto'},{id:'c',sample:'Skip'},{id:'d',sample:'Save'}]),false);});
test('leaveLabel and the side-by-side switch',()=>{assert.equal(HookNative.leaveLabel('タイトルメニュー'),true);assert.equal(HookNative.leaveLabel('12:30'),false);assert.equal(HookNative.leaveLabel('「そうだね」'),false);
 assert.match(fs.readFileSync(path.join(__dirname,'..','desktop','src','main.rs'),'utf8'),/MEGULIT_SIDE_BY_SIDE/);});
