const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const load=()=>import(pathToFileURL(path.join(__dirname,'..','web','kana','data.js')).href);
test('kana choices: always 4 distinct options with the target, even from a short pool',async()=>{const D=await load();
 const near=D.ORDER.slice();
 for(let r=0;r<300;r++)for(const [t,pool] of [['う',['い']],['あ',[]],['ん',['を','わ','ん']],['か',['き','く','け','こ','さ']]]){
  const o=D.pickChoices(t,pool,near);assert.equal(o.length,4);assert.equal(new Set(o).size,4);assert.ok(o.includes(t));}
});
test('kana achievement: capped at 101 and shown with one decimal',async()=>{const D=await load();
 assert.equal(D.fmtPct(102),'101.0%');assert.equal(D.fmtPct(95.86),'95.9%');assert.equal(D.fmtPct(0),'0.0%');
 const log=Array.from({length:10},()=>({show:'シ',ok:true,t:0.5,brk:true}));assert.ok(D.achievement(log).pct<=101);
});
