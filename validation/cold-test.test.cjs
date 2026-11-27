// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 闲时冷测试) the idle-time cold test without a game and without MeguLit.exe: conditions, pick, save snapshot +
   restore (temp folders), the one-recording offline score (replays of the owner's incr9 logs: ファタモルガーナの館 fails,
   千恋＊万花 passes), the picture policy, the driver state machine, the run with a fake ColdDesk, the service end to end with a
   fake run, and the relay's retest list + 'cold' reports (D1 on node:sqlite). docs/cold-test.md */
process.env.MEGULIT_RELAY_BASE='https://relay.test';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const Cond=require('../core/cold-test/conditions.cjs'),Pick=require('../core/cold-test/pick.cjs'),Saves=require('../core/cold-test/saves.cjs'),Score=require('../core/cold-test/score.cjs');
const {Driver,VK}=require('../core/cold-test/drive.cjs');
const FIX=path.join(__dirname,'helpers','cold-test');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'cold-'));
const H=c=>c.repeat(64);
const idle={idleMs:20*60000,ac:true,fullscreen:false,gameRunning:false,cpu:.05,freeMb:50000};

test('conditions: idle, on AC, nothing full screen, no game, CPU quiet, within today\'s budget',()=>{const o={platform:'win32'};
 assert.equal(Cond.check(idle,o).ok,true);
 assert.equal(Cond.check({...idle,idleMs:60000},o).reason,'active');
 assert.equal(Cond.check({...idle,ac:false},o).reason,'battery');
 assert.equal(Cond.check({...idle,ac:null},o).ok,true,'a desktop without battery');
 assert.equal(Cond.check({...idle,fullscreen:true},o).reason,'fullscreen');
 assert.equal(Cond.check({...idle,gameRunning:true},o).reason,'gameRunning');
 assert.equal(Cond.check({...idle,cpu:.8},o).reason,'busy');
 assert.equal(Cond.check({...idle,freeMb:100},o).reason,'disk');
 assert.equal(Cond.check(idle,{...o,today:{ms:30*60000,games:1}}).reason,'dailyTime');
 assert.equal(Cond.check(idle,{...o,today:{ms:0,games:4}}).reason,'dailyGames');
 assert.equal(Cond.check(idle,{...o,enabled:false}).reason,'off');
 assert.equal(Cond.check(idle,{platform:'linux'}).reason,'notWindows');
 assert.equal(Cond.check(idle,{...o,helper:false}).reason,'noHelper');
 assert.equal(Cond.check(null,o).reason,'unknown');
 assert.equal(Cond.check(idle,{...o,busy:true}).reason,'running');
 assert.equal(Cond.budgetMs(Cond.DEFAULTS,{ms:0}),6*60000);assert.equal(Cond.budgetMs(Cond.DEFAULTS,{ms:28*60000}),2*60000,'never past today\'s budget');
 assert.equal(Cond.config({idleMinutes:3,evil:1,cpuBusy:-1}).idleMinutes,3);assert.equal(Cond.config({cpuBusy:-1}).cpuBusy,Cond.DEFAULTS.cpuBusy);
 assert.equal(Cond.mustStop({type:'input'}),'input');assert.equal(Cond.mustStop({type:'power',ac:false}),'battery');assert.equal(Cond.mustStop({type:'fullscreen',on:true}),'fullscreen');assert.equal(Cond.mustStop({type:'window'}),'');});

test('pick: retest first, then skeleton, read, unknown; verified never; once per PC unless a newer retest; blocked never',()=>{
 const g=(id,seedStatus,extra={})=>({id,title:'G'+id,exe:'C:/g/'+id+'.exe',exeKey:H(String(id)),seedStatus,gameKey:'k'+id,...extra});
 const games=[g(1,'verified'),g(2,'read'),g(3,'skeleton'),g(4,''),g(5,'verified'),g(6,'skeleton'),g(7,'owner-ok')];
 const retest={keys:{[H('5')]:Date.now()},games:{}};
 let list=Pick.candidates(games,{retest,state:{tested:{[H('6')]:{at:new Date().toISOString(),verdict:'pass'}}}});
 assert.deepEqual(list.map(x=>x.id),[5,3,2,4],'verified 5 only through the retest; 6 tested here; 1 and 7 confirmed');
 assert.equal(list[0].why,'retest');
 list=Pick.candidates(games,{retest:{keys:{[H('6')]:Date.parse('2026-01-01')},games:{}},state:{tested:{[H('6')]:{at:'2026-02-01T00:00:00Z',verdict:'pass'}}}});
 assert.ok(!list.some(x=>x.id===6),'a retest older than this PC\'s test is done already');
 list=Pick.candidates(games,{state:{tested:{[H('3')]:{at:'2026-02-01T00:00:00Z',verdict:'stopped'}},blocked:{[H('2')]:{why:'no-save-place'}}}});
 assert.ok(list.some(x=>x.id===3),'a stopped run is tried again');assert.ok(!list.some(x=>x.id===2),'blocked');
 assert.equal(Pick.candidates(games,{running:e=>e.endsWith('3.exe')}).some(x=>x.id===3),false,'not while it runs');
 assert.equal(Pick.candidates(games,{exists:()=>false}).length,0);
 const r=Pick.retestOf({schema:'megulit.cold-retest',items:[{key:H('a'),game:H('b'),at:100},{key:'../x',game:null,at:5}]});
 assert.deepEqual(r,{keys:{[H('a')]:100000},games:{[H('b')]:100000}});assert.deepEqual(Pick.retestOf({items:[]}),{keys:{},games:{}});});

/* a fake PC: a game folder and the user folders, under one temp root */
function pc(){const base=tmp();const env={APPDATA:path.join(base,'AppData','Roaming'),LOCALAPPDATA:path.join(base,'AppData','Local'),USERPROFILE:path.join(base,'User')};
 for(const d of [env.APPDATA,env.LOCALAPPDATA,path.join(base,'AppData','LocalLow'),path.join(env.USERPROFILE,'Documents')])fs.mkdirSync(d,{recursive:true});
 const game=path.join(base,'Games','Senren');fs.mkdirSync(path.join(game,'savedata'),{recursive:true});fs.writeFileSync(path.join(game,'SenrenBanka.exe'),'MZ');
 fs.writeFileSync(path.join(game,'savedata','data0.kdt'),'save zero');fs.writeFileSync(path.join(game,'savedata','datasu.ksd'),'system');fs.writeFileSync(path.join(game,'config.ini'),'volume=3');
 fs.mkdirSync(path.join(env.APPDATA,'YuzuSoft','SenrenBanka'),{recursive:true});fs.writeFileSync(path.join(env.APPDATA,'YuzuSoft','SenrenBanka','global.sav'),'roaming');
 return {base,env,exe:path.join(game,'SenrenBanka.exe'),game,root:path.join(base,'MeguLit')};}
const tree=p=>{const out={};const walk=(d,rel)=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name),r=rel+'/'+e.name;if(e.isDirectory()){out[r]='<dir>';walk(f,r);}else out[r]=fs.readFileSync(f,'utf8');}};if(fs.existsSync(p))walk(p,'');return out;};

test('saves: places from the game folder, the user folders and the engine; snapshot + restore puts every byte back',()=>{const P=pc();
 const loc=Saves.locate({exe:P.exe,engine:'kirikiri',title:'千恋＊万花'},P.env);assert.equal(loc.ok,true,loc.why);
 const kinds=loc.places.map(p=>path.relative(P.base,p.path).replace(/\\/g,'/')).sort();
 assert.deepEqual(kinds,['AppData/Roaming/YuzuSoft/SenrenBanka','Games/Senren/savedata'],JSON.stringify(kinds));
 assert.deepEqual(loc.loose.names,['config.ini']);
 const before={game:tree(P.game),roam:tree(path.join(P.env.APPDATA,'YuzuSoft'))};
 const snap=Saves.snapshot(P.root,loc,{id:'t1',key:H('a')});assert.equal(snap.ok,true,snap.why);assert.equal(Saves.pending(P.root).length,1,'the journal is on disk while the game runs');
 /* the game plays: changes a save, adds one, deletes one, rewrites its settings, drops a log next to the exe */
 fs.writeFileSync(path.join(P.game,'savedata','data0.kdt'),'NEW GAME');fs.writeFileSync(path.join(P.game,'savedata','data1.kdt'),'extra');fs.unlinkSync(path.join(P.game,'savedata','datasu.ksd'));
 fs.writeFileSync(path.join(P.game,'config.ini'),'volume=0');fs.writeFileSync(path.join(P.game,'krkr.console.log'),'log');fs.writeFileSync(path.join(P.env.APPDATA,'YuzuSoft','SenrenBanka','global.sav'),'changed');
 const r=Saves.restore(P.root,snap.journal);assert.equal(r.ok,true,r.errors.join());
 assert.deepEqual(tree(P.game),before.game);assert.deepEqual(tree(path.join(P.env.APPDATA,'YuzuSoft')),before.roam);
 assert.equal(Saves.pending(P.root).length,0,'a clean restore drops the snapshot');});

test('saves: a predicted place that did not exist is removed again; a crash is undone at the next start',()=>{const P=pc();
 const data=path.join(P.game,'Senren_Data');fs.mkdirSync(data);fs.writeFileSync(path.join(data,'app.info'),'Yuzu Co\nSenren Unity\n');
 const loc=Saves.locate({exe:P.exe,engine:'unity',title:'x'},P.env);const pred=loc.places.find(p=>p.predicted&&/LocalLow/.test(p.path));
 assert.ok(!pred,'app.info belongs to <exe>_Data: this one is Senren_Data, not SenrenBanka_Data');
 fs.renameSync(data,path.join(P.game,'SenrenBanka_Data'));
 const loc2=Saves.locate({exe:P.exe,engine:'unity',title:'x'},P.env);const p2=loc2.places.find(p=>p.predicted);assert.ok(p2&&/LocalLow[\\/]Yuzu Co[\\/]Senren Unity$/.test(p2.path),JSON.stringify(loc2.places));
 const snap=Saves.snapshot(P.root,loc2,{id:'t2'});fs.mkdirSync(p2.path,{recursive:true});fs.writeFileSync(path.join(p2.path,'save.dat'),'x');
 /* MeguLit dies here; the next start restores */
 const left=Saves.pending(P.root);assert.equal(left.length,1);assert.equal(Saves.restore(P.root,left[0]).ok,true);assert.ok(!fs.existsSync(p2.path),'the folder the run created is gone');
 assert.equal(snap.ok,true);});

test('saves: a save folder named in the game\'s own .bat is predicted (ハミダシクリエイティブ, Artemis)',()=>{const P=pc();
 const g=path.join(P.base,'Games','Hamidashi');fs.mkdirSync(g,{recursive:true});const exe=path.join(g,'hamidashi.exe');fs.writeFileSync(exe,'MZ');
 const game={exe,engine:'artemis',title:'ハミダシクリエイティブ'};
 assert.equal(Saves.locate(game,P.env).ok,false,'no bat yet -> no place');
 /* Shift-JIS, as the game ships it: explorer "%APPDATA%\まどそふと\ハミダシ" */
 const sjis=[0x82,0xdc,0x82,0xc7,0x82,0xbb,0x82,0xd3,0x82,0xc6,0x5c,0x83,0x6e,0x83,0x7e,0x83,0x5f,0x83,0x56];
 fs.writeFileSync(path.join(g,'open-save.bat'),Buffer.concat([Buffer.from('@echo off\r\nexplorer "%APPDATA%\\'),Buffer.from(sjis),Buffer.from('"\r\n')]));
 fs.writeFileSync(path.join(g,'delete-save.bat'),'del /F /Q "%APPDATA%\\Vendor\\Game2\\*"\r\necho %APPDATA%\r\n');
 const loc=Saves.locate(game,P.env);assert.equal(loc.ok,true,loc.why);
 const ps=loc.places.filter(p=>p.predicted).map(p=>path.relative(P.env.APPDATA,p.path)).sort();
 assert.deepEqual(ps,[path.join('Vendor','Game2'),path.join('まどそふと','ハミダシ')].sort(),'Shift-JIS path decoded, wildcard dropped, bare %APPDATA% ignored');});

test('saves: no place -> not tested; too big -> not tested; unguarded writes are found',()=>{const P=pc();
 const bare=path.join(P.base,'Games','Bare');fs.mkdirSync(bare,{recursive:true});fs.writeFileSync(path.join(bare,'Bare.exe'),'MZ');fs.writeFileSync(path.join(bare,'setting.ini'),'a');
 const none=Saves.locate({exe:path.join(bare,'Bare.exe'),engine:'',title:'Bare Game'},P.env);assert.equal(none.ok,false);assert.equal(none.why,'找不到存档位置','settings files alone are not a save place');
 const loc=Saves.locate({exe:P.exe,engine:'kirikiri',title:'千恋＊万花'},P.env);
 assert.equal(Saves.snapshot(P.root,loc,{id:'big',cap:4}).ok,false,'over the cap');
 const t=Date.now()-5000;const other=path.join(P.env.LOCALAPPDATA,'SenrenBanka');fs.mkdirSync(other);fs.writeFileSync(path.join(other,'x'),'y');
 assert.deepEqual(Saves.sweep(loc,t,P.env),[other]);
 assert.deepEqual(Saves.sweep(loc,Date.now()+60000,P.env),[],'nothing written after the run started');});

const fixture=n=>Score.eventsOf({hookEvents:fs.readFileSync(path.join(FIX,n,'hook-events.log'),'utf8')});
test('score: one recording, every candidate offline: ファタモルガーナ fails (drops), 千恋＊万花 passes',()=>{
 const fata=Score.score(fixture('fata'),{}),senren=Score.score(fixture('senren'),{});
 assert.deepEqual(Score.verdict(fata,{}),{verdict:'fail',why:'dropRate'});assert.equal(fata.mode,'read');assert.equal(fata.settings.hide.textEffectsRead,true);
 assert.deepEqual(Score.verdict(senren,{}),{verdict:'pass',why:''});assert.equal(senren.mode,'hide');assert.ok(senren.measured.includes('dropRate'));
 assert.ok(fata.candidates.length>=5,'all combinations were scored on the one recording');
 /* the seed's own mark: a seed that says hide on Fata fails, read mode passes */
 assert.equal(Score.score(fixture('fata'),{seedSettings:{hide:{textEffectsRead:false}}}).seed.pass,false);
 assert.equal(Score.score(fixture('fata'),{seedSettings:{hide:{textEffectsRead:true}}}).seed.pass,true);});

test('score: edge, and what is inconclusive (black hidden desktop, too few lines, stopped, Steam relaunch)',()=>{
 const ev=[];let at=Date.parse('2026-11-21T00:00:00Z');for(let i=0;i<40;i++){ev.push({kind:'line',at:at+=500,chars:20,seq:i});if(i%8===3)ev.push({kind:'drop',at:at+=10,chars:12});}
 const r=Score.score(ev,{});assert.equal(r.mode,'hide');assert.ok(r.near>=Score.EDGE,'drops at '+r.best.metrics.dropRate+' near '+r.near);assert.equal(Score.verdict(r,{}).verdict,'edge');
 const few=Score.score(ev.slice(0,5),{});assert.equal(Score.verdict(few,{}).why,'few-lines');
 assert.equal(Score.verdict(Score.score([],{}),{black:true}).why,'black-screen');
 assert.equal(Score.verdict(Score.score([],{}),{}).why,'no-lines');
 assert.equal(Score.verdict(r,{stopped:'input'}).why,'stopped:input');assert.equal(Score.verdict(r,{relaunched:true}).why,'steam-relaunch');
 assert.equal(Score.verdict(r,{black:true}).verdict,'edge','a black picture with lines is just a picture: the hook still read');});

test('pictures: a pass sends none; fail / edge 2-3 spread over the run; the switch off sends none',()=>{const shots=['a','b','c','d','e'];
 assert.deepEqual(Score.shotsToUpload('pass',shots),[]);assert.deepEqual(Score.shotsToUpload('inconclusive',shots),[]);
 assert.deepEqual(Score.shotsToUpload('fail',shots),['a','c','e']);assert.deepEqual(Score.shotsToUpload('edge',['a','b']),['a','b']);
 assert.deepEqual(Score.shotsToUpload('fail',shots,{shotsOn:false}),[]);assert.deepEqual(Score.shotsToUpload('fail',shots,{shareOn:false}),[]);});

test('driver: waits for the window, skips the intro by polling, clicks はじめから not つづきから, holds Ctrl, pictures, choices, ends',()=>{
 const d=new Driver({introEvery:100,advanceEvery:100,ctrlEvery:1000,targetLines:30,stallMs:5000});let t=0;const step=(obs={})=>d.next({t:t+=100,deadline:600000,window:{w:1280,h:720},lines:0,choices:0,menu:[],...obs});
 assert.deepEqual(new Driver({bootMs:1000}).next({t:1000,window:null}),[{do:'end',why:'no-window'}]);
 const intro=[];for(let i=0;i<8;i++)intro.push(...step());
 assert.ok(intro.some(a=>a.do==='click')&&intro.some(a=>a.vk===VK.enter)&&intro.some(a=>a.vk===VK.esc)&&intro.some(a=>a.vk===VK.ctrl),JSON.stringify(intro));
 const load=step({menu:[{role:'button',text:'つづきから',x:100,y:100,w:100,h:30}]});assert.ok(!load.some(a=>a.do==='click'&&a.x===150),'never Load');
 const start=step({menu:[{role:'button',text:'つづきから',x:100,y:100,w:100,h:30},{role:'button',text:'はじめから',x:100,y:200,w:100,h:30}]});
 assert.deepEqual(start,[{do:'click',x:150,y:215,watch:'start'}]);
 const adv=step({lines:1});assert.deepEqual(adv[0],{do:'keydown',vk:VK.ctrl},'fast forward from the first line');
 const shot=step({lines:3});assert.ok(shot.some(a=>a.do==='shot'&&a.tag==='line-3'));
 step({lines:4,choices:1});t+=600;const pickIt=step({lines:4,choices:1,menu:[{role:'choice',text:'A',x:400,y:300,w:200,h:40}]});assert.deepEqual(pickIt,[{do:'click',x:500,y:320}]);
 const end=step({lines:30});assert.deepEqual(end,[{do:'keyup',vk:VK.ctrl},{do:'end',why:'enough'}]);assert.deepEqual(step({lines:40}),[],'ended stays ended');
 const s=new Driver({stallMs:1000});s.next({t:0,window:{w:10,h:10}});s.next({t:10,window:{w:10,h:10},lines:1});assert.equal(s.next({t:2000,window:{w:10,h:10},lines:1}).pop().why,'stalled');
 const b=new Driver({blackAfter:1000,introShotAt:500});b.next({t:0,window:{w:10,h:10}});assert.ok(b.next({t:600,window:{w:10,h:10}}).some(a=>a.do==='shot'));assert.equal(b.next({t:1200,window:{w:10,h:10},black:true}).pop().why,'black');
 const tm=new Driver();tm.next({t:0,window:{w:10,h:10}});assert.equal(tm.next({t:5000,deadline:4000,window:{w:10,h:10}}).pop().why,'time-intro');});

/* a fake native/ColdDesk.exe: a child with stdin/stdout that plays a script */
function fakeHelper(script){const sent=[];const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();
 child.stdin.on('data',b=>{for(const l of String(b).split('\n').filter(Boolean)){sent.push(l);if(l==='kill')setImmediate(()=>{child.stdout.write(JSON.stringify({type:'ended',why:'killed'})+'\n');child.stdout.end();child.emit('exit',0);});
  if(l.startsWith('shot '))child.stdout.write(JSON.stringify({type:'shot',ok:true,path:l.split(' ').slice(2).join(' '),w:960,h:540,black:false})+'\n');}});
 child.kill=()=>{};setImmediate(()=>script(m=>child.stdout.write(JSON.stringify(m)+'\n')));return {spawn:()=>child,sent};}
class FakeHook{constructor(layout){this.layout=layout;FakeHook.last=this;}configure(p,s){this.state=s;let n=0;this.timer=setInterval(()=>{if(n>=12)return;n++;FakeHook.traceTap?.('2026-11-21T00:00:0'+(n%10)+'.000Z source chars=20 sequence='+n);},5);}tick(){}stop(){clearInterval(this.timer);this.stopped=true;}drawLog(){}}

test('run: the hook gets the game, lines are counted, pictures asked, the game is ended; the user\'s input stops it at once',async()=>{const run=require('../services/cold-test-run.cjs');const dir=tmp();
 const h=fakeHelper(emit=>{emit({type:'started',pid:4242,started:'638700000000000000'});emit({type:'window',hwnd:'1234',w:1280,h:720,title:'千恋＊万花'});});
 const r=await run.runOne({exe:'C:/g/SenrenBanka.exe',runDir:path.join(dir,'run1'),budgetMs:60000},{spawn:h.spawn,helper:'ColdDesk.exe',Hook:FakeHook,layout:{native:dir},tick:10,driver:{targetLines:10,introEvery:10,advanceEvery:10}});
 assert.equal(r.end,'enough');assert.ok(r.lines>=10);assert.equal(FakeHook.last.state.gameProcessId,4242);assert.equal(FakeHook.last.state.gameHwnd,'1234');assert.equal(FakeHook.last.layout.logs,path.join(dir,'run1'),'the hook logs into the run folder');
 assert.ok(FakeHook.last.stopped);assert.ok(h.sent.includes('kill'));assert.ok(h.sent.some(l=>l.startsWith('shot 960 ')&&l.includes('line-3')));assert.ok(h.sent.includes('keydown 17'));
 assert.ok(fs.existsSync(path.join(dir,'run1','run.json')));
 const h2=fakeHelper(emit=>{emit({type:'started',pid:1,started:'638700000000000000'});emit({type:'window',hwnd:'9',w:800,h:600});setTimeout(()=>emit({type:'input'}),30);});
 const r2=await run.runOne({exe:'C:/g/x.exe',runDir:path.join(dir,'run2'),budgetMs:60000},{spawn:h2.spawn,helper:'ColdDesk.exe',Hook:FakeHook,layout:{native:dir},tick:10,driver:{targetLines:1000}});
 assert.equal(r2.stopped,'input');assert.ok(h2.sent.includes('kill'));
 const h3=fakeHelper(emit=>{emit({type:'started',pid:2,started:'638700000000000000'});emit({type:'relaunched',pid:3});});
 const r3=await run.runOne({exe:'C:/g/y.exe',runDir:path.join(dir,'run3'),budgetMs:60000},{spawn:h3.spawn,helper:'ColdDesk.exe',Hook:FakeHook,layout:{native:dir},tick:10});assert.equal(r3.relaunched,true);
 assert.equal((await run.runOne({exe:'x',runDir:path.join(dir,'run4')},{helper:''})).end,'no-helper');});

test('service: snapshot, run, restore, score, report; pictures only for fail, and never with the switch off',async()=>{const svc=require('../services/cold-test.cjs');
 for(const [name,verdict] of [['senren','pass'],['fata','fail']]){const P=pc();fs.mkdirSync(path.join(P.root,'data','config'),{recursive:true});
  const before=tree(P.game);const reports=[],uploads=[];
  const game={id:'7',title:'千恋＊万花',exe:P.exe,engine:'kirikiri',exeKey:H(name==='senren'?'1':'2')};
  const out=await svc.testOne(P.root,game,{budgetMs:60000,deps:{env:P.env,
   runner:async o=>{fs.mkdirSync(o.runDir,{recursive:true});fs.copyFileSync(path.join(FIX,name,'hook-events.log'),path.join(o.runDir,'hook-events.log'));
    for(let i=1;i<=4;i++)fs.writeFileSync(path.join(o.runDir,'shot-'+i+'.jpg'),Buffer.from([0xff,0xd8,0xff,0xe0,1,2,3]));
    fs.writeFileSync(path.join(P.game,'savedata','data0.kdt'),'played');return {cleanupConfirmed:true,pid:9,lines:20,shots:['shot-1.jpg','shot-2.jpg','shot-3.jpg','shot-4.jpg'],end:'enough',stopped:''};},
   report:async(root,x)=>{reports.push(x);return {state:'sent'};},upload:async(root,x)=>{uploads.push(x);return {state:'sent'};}}});
  assert.equal(out.verdict,verdict,JSON.stringify(out));assert.equal(out.restored,true);assert.deepEqual(tree(P.game),before,'saves back as they were');
  assert.equal(reports.length,1);assert.equal(uploads.length,verdict==='pass'?0:1,'a pass sends no picture');
  const st=svc.load(P.root);assert.equal(st.tested[game.exeKey].verdict,verdict);assert.ok(st.days[Cond.dayOf()].ms>=0);assert.equal(st.days[Cond.dayOf()].games,1);
  if(verdict==='fail'){fs.writeFileSync(path.join(P.root,'data','config','library.json'),JSON.stringify({coldTestShots:false}));
   const b=svc.bundleOf(out.runDir,game.exeKey,{shots:Score.shotsToUpload('fail',uploads[0].result.shots,{shotsOn:svc.shotsEnabled(P.root)})});
   const doc=JSON.parse(require('node:zlib').gunzipSync(b.data));assert.ok(!doc.files.some(f=>f.kind==='shot'),'switch off: not one picture');
   const b2=svc.bundleOf(out.runDir,game.exeKey,{shots:Score.shotsToUpload('fail',uploads[0].result.shots)});const doc2=JSON.parse(require('node:zlib').gunzipSync(b2.data));
   assert.equal(doc2.files.filter(f=>f.kind==='shot').length,3);assert.ok(doc2.files.some(f=>f.name==='hook-events.log'));}}});

test('service: a stopped run is retried later; no save place blocks; a Steam build without Steam running waits',async()=>{const svc=require('../services/cold-test.cjs');const P=pc();
 const game={id:'8',title:'千恋＊万花',exe:P.exe,engine:'kirikiri',exeKey:H('3')};
 const out=await svc.testOne(P.root,game,{budgetMs:60000,deps:{env:P.env,runner:async o=>{fs.mkdirSync(o.runDir,{recursive:true});return {cleanupConfirmed:true,pid:9,stopped:'input',shots:[]};},report:async()=>{throw new Error('no report for a stopped run');}}});
 assert.equal(out.verdict,'inconclusive');assert.equal(svc.load(P.root).tested[game.exeKey].verdict,'stopped');
 assert.equal(Pick.candidates([{...game,seedStatus:'skeleton'}],{state:svc.load(P.root)}).length,1,'tried again');
 const bare=path.join(P.base,'Games','Bare');fs.mkdirSync(bare,{recursive:true});fs.writeFileSync(path.join(bare,'Bare.exe'),'MZ');
 const b=await svc.testOne(P.root,{id:'9',title:'Bare',exe:path.join(bare,'Bare.exe'),exeKey:H('4')},{deps:{env:P.env,runner:async()=>{throw new Error('must not run');}}});assert.deepEqual(b,{verdict:'blocked',why:'no-save-place'});
 fs.writeFileSync(path.join(P.game,'steam_api64.dll'),'MZ Valve Corporation');
 const s=await svc.testOne(P.root,{...game,steamAppId:'1144400'},{deps:{env:P.env,steamRunning:()=>false,runner:async()=>{throw new Error('must not run');}}});assert.deepEqual(s,{verdict:'skipped',why:'steam-not-running'});
 /* with Steam running: the app id is there for the run and gone after (the game still goes through Steam) */
 let seen=null;await svc.testOne(P.root,{...game,steamAppId:'1144400',exeKey:H('5')},{deps:{env:P.env,steamRunning:()=>true,report:async()=>({}),runner:async o=>{seen=fs.readFileSync(path.join(P.game,'steam_appid.txt'),'utf8');fs.mkdirSync(o.runDir,{recursive:true});return {cleanupConfirmed:true,pid:1,shots:[]};}}});
 assert.equal(seen,'1144400');assert.ok(!fs.existsSync(path.join(P.game,'steam_appid.txt')));});

test('service: tick waits on the conditions and takes the first candidate',async()=>{const svc=require('../services/cold-test.cjs');const P=pc();
 const test2=path.join(P.game,'TestGame.exe');fs.writeFileSync(test2,'MZ');/* 千恋＊万花 itself is verified in The Seed: never cold-tested */
 const w=await svc.tick(P.root,{deps:{reading:async()=>({...idle,idleMs:1000}),helper:true,platform:'win32'}});assert.deepEqual(w,{state:'waiting',reason:'active'});
 let ran=null;const t=await svc.tick(P.root,{deps:{reading:async()=>idle,freeMb:()=>idle.freeMb,helper:true,platform:'win32',playing:()=>false,retest:async()=>({keys:{},games:{}}),env:P.env,
  games:()=>[{id:'1',title:'テストゲーム',exe:test2,engine:'kirikiri'}],report:async()=>({}),runner:async o=>{ran=o;fs.mkdirSync(o.runDir,{recursive:true});return {cleanupConfirmed:true,pid:1,shots:[]};}}});
 assert.equal(t.state,'tested',JSON.stringify(t));assert.equal(ran.exe,test2);assert.ok(ran.budgetMs<=6*60000);
 assert.equal((await svc.tick(P.root,{deps:{reading:async()=>idle,helper:true,platform:'win32',playing:()=>true}})).reason,'gameRunning');
 for(const l of ['zh','en','ja']){const w=svc.explain(l);assert.ok(w.steam&&w.saves&&w.share&&w.body);}
 assert.match(svc.explain('zh').steam,/游戏时长/);assert.match(svc.explain('zh').steam,/成就/);});

test('relay: the retest list is the open repair queue, hashes only; a cold report keeps its source',async()=>{
 const {DatabaseSync}=require('node:sqlite'),{pathToFileURL}=require('node:url');const relayDir=path.join(__dirname,'..','relay');
 const MIG=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
 const db=new DatabaseSync(':memory:');db.exec(MIG);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true};}});
 const ENV={DB:{prepare:sql=>stmt(sql),batch:async l=>Promise.all(l.map(s=>s.run())),exec:async s=>db.exec(s)},BUCKET:{put:async()=>{},get:async()=>null,delete:async()=>{}},HASH_SALT:'salt',ADAPTER_ADMIN_TOKEN:'admin-token'};
 const {handle}=await import(pathToFileURL(path.join(relayDir,'src','worker.js')).href);const call=(url,init={})=>handle(new Request(url,{method:init.method||'GET',headers:{'cf-connecting-ip':'5.5.5.5',...(init.headers||{})},body:init.body}),ENV,new Date());
 const ap=require('../core/auto-profile.cjs');const rec=(source,extra={})=>({schema:1,key:H('c'),engine:'krkr',exe:'fata.exe',version:'1.4.22',at:new Date().toISOString(),source,mode:'read',reason:'有台词没有画到阅读层（漏句）',settings:{hide:{textEffectsRead:true}},score:{metrics:{dropRate:.4},cost:3},candidates:[],gate:{over:['dropRate']},...extra});
 const post=r=>call('https://relay.test/api/game-profile/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,profile:ap.diagnostic(r).profile,prints:{exe:H('c'),title:H('d')}})});
 assert.equal((await post(rec('gate'))).status,201);
 const r=await call('https://relay.test/api/game-profile/retest');assert.equal(r.status,200);const body=await r.json();
 assert.equal(body.schema,'megulit.cold-retest');assert.equal(body.items.length,1);assert.equal(body.items[0].key,H('c'));assert.deepEqual(Object.keys(body.items[0]).sort(),['at','game','key']);
 assert.ok(!JSON.stringify(body).includes('fata'),'no names, no reasons');
 assert.deepEqual(Pick.retestOf(body).keys[H('c')]>0,true);
 const {validateReport}=await import(pathToFileURL(path.join(relayDir,'src','auto-profile.js')).href);
 assert.equal(validateReport({version:1,profile:ap.diagnostic(rec('cold',{cold:{verdict:'fail'}})).profile}).value.source,'cold');
 assert.equal(validateReport({version:1,profile:ap.diagnostic(rec('whatever')).profile}).value.source,'calibration');
 assert.equal((await call('https://relay.test/api/game-profile/retest',{method:'POST'})).status,405);});
