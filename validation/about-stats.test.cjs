process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* Owner report: the About page's 「一起走过」 showed 0.0 小时 / 77,706 字 / 0 次 查词. The page read the home model's
   today-only stats (readingSeconds, lookups) next to an all-time character sum. It now shows the all-time totals the
   service computes with the leaderboard's own sums (services/leaderboard.cjs journeyTotals / collectStats), and shows
   minutes under an hour. Real store.home + real mountJourney from web/about.js, fake DOM cells. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url');
const store=require('../services/store.cjs'),lb=require('../services/leaderboard.cjs');
const at=(y,m,d,h=12)=>Math.floor(new Date(y,m-1,d,h).getTime()/1000);
const NOW=new Date(2026,10,20,20,0,0);/* a day on which nothing was read or looked up */
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-about-'));
 process.env.MEGULIT_ROOT=root;const db=store.openStore(root);t.after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});return {root,db};
}
function seed(db,{seconds=[1800,2400]}={}){
 db.prepare("INSERT INTO games(id,title) VALUES('g1','ATRI'),('g2','千恋＊万花')").run();
 const s=db.prepare('INSERT INTO reading_sessions(game_id,started_at,ended_at,active_seconds,characters) VALUES(?,?,?,?,?)');
 s.run('g1',at(2026,11,10),at(2026,11,10,13),seconds[0],40000);s.run('g2',at(2026,11,2),at(2026,11,2,13),seconds[1],37706);
 const l=db.prepare('INSERT INTO lookup_events(game_id,surface,occurred_at,operation_id) VALUES(?,?,?,?)');
 l.run('g1','言葉',at(2026,11,10),'op-1');l.run('g1','気持ち',at(2026,11,10,13),'op-2');l.run('g2','約束',at(2026,11,2),'op-3');
}
async function journey(model,lang='zh-CN'){
 globalThis.document={documentElement:{lang},addEventListener(){},querySelector:()=>null};
 const {mountJourney}=await import(pathToFileURL(path.join(__dirname,'..','web','about.js')).href);
 const cells=[0,1,2].map(()=>({textContent:'',nextElementSibling:{textContent:'unit'}}));
 const box={hidden:false,querySelectorAll:()=>cells},empty={hidden:true},page={querySelector:q=>q==='[data-journey]'?box:empty};
 mountJourney(page,model,true,{jMin:{'zh-CN':'分钟','ja-JP':'分','en-US':'min'}[lang]});
 return {hours:cells[0].textContent,unit:cells[0].nextElementSibling.textContent,chars:cells[1].textContent,looks:cells[2].textContent,hidden:box.hidden};
}
test('about page shows all-time reading time and lookups, not today-only zeros (77k characters with 0 hours / 0 lookups)',async t=>{
 const {root,db}=fixture(t);seed(db,{seconds:[7200,5400]});/* 3.5 h in total */
 const model=store.home(db,root,NOW);
 /* what the about page is given: all-time totals (before the fix it only had today's time and lookups, both 0 here) */
 assert.deepEqual({seconds:model.stats.total?.seconds,lookups:model.stats.total?.lookups},{seconds:12600,lookups:3},'all-time time and lookups reach the about page');
 const shown=await journey(model);
 assert.equal(shown.hidden,false);
 assert.equal(shown.hours,'3.5','3.5 hours, not 0.0');
 assert.equal(shown.unit,'unit','hours keep the hours unit');
 assert.equal(shown.chars.replace(/\D/g,''),'77706');
 assert.equal(shown.looks,'3','all three lookups, from days before today');
 /* the same numbers as the leaderboard's local stats (and so the upload) */
 const all=lb.collectStats(db,NOW,root).stats.all;
 assert.equal(model.stats.total.seconds,all.seconds);
 assert.equal(model.stats.total.characters,all.characters);
});
test('under an hour the page shows minutes in each language, never 0.0 hours',async t=>{
 const {root,db}=fixture(t);seed(db,{seconds:[1500,1140]});/* 44 min */
 const model=store.home(db,root,NOW);
 assert.deepEqual([await journey(model,'zh-CN'),await journey(model,'ja-JP'),await journey(model,'en-US')].map(s=>s.hours+' '+s.unit),['44 分钟','44 分','44 min']);
});
test('lookups recorded by the reader (click, drag-select and Alt+T cards all report lookupViewed) are counted',async t=>{
 const {root,db}=fixture(t);seed(db);
 const {recordLookup}=require('../services/unknown-words.cjs');
 recordLookup(root,{surface:'約束',gameId:'g2',operationId:'live-op-0001'});
 const now=new Date(Date.now()+1000);
 assert.equal(store.home(db,root,now).stats.total.lookups,4);
 assert.equal((await journey(store.home(db,root,now))).looks,'4');
});
test('a PC with no history still shows the empty state',async t=>{
 const {root,db}=fixture(t);
 const shown=await journey(store.home(db,root,NOW));
 assert.equal(shown.hidden,true);
});
