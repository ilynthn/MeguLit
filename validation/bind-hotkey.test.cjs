'use strict';
/* 2026-11-15 (user: alt+m从开关主页的快捷键改一下 改成绑定当前游戏窗口的快捷键): Alt+M binds the window in front through the
   same bind as the Alt+T window picker, refuses MeguLit itself, the desktop and Explorer with a hint, says 「已绑定：<标题>」
   once the bridge reports that window bound, and nothing in the UI still calls Alt+M the home toggle. Offline only. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const lib=require('../services/bind-hotkey.cjs');
const fake=()=>{const calls=[];return {calls,reader:{gal:{preferences:{fontSize:30,bindEnabled:false},bind:(hwnd,settings)=>calls.push({hwnd,settings})},translator:()=>({clearContext:()=>calls.push('clear')})}};};

test('Alt+M: only a real game window in front is bound',()=>{
 const game={hwnd:'4523',pid:900,title:'さくらの詩',className:'SakuraWindow',processName:'sakura',own:false};
 assert.equal(lib.classify(game),'ok');
 assert.equal(lib.classify({...game,own:true}),'own');
 assert.equal(lib.classify({...game,processName:'MeguLit'}),'own');
 assert.equal(lib.classify({...game,processName:'msedgewebview2'}),'own');
 assert.equal(lib.classify({...game,className:'Progman',processName:'explorer'}),'desktop');
 assert.equal(lib.classify({...game,className:'WorkerW',processName:'explorer'}),'desktop');
 assert.equal(lib.classify({...game,className:'Shell_TrayWnd',processName:'explorer'}),'desktop');
 assert.equal(lib.classify({...game,className:'CabinetWClass',processName:'explorer'}),'explorer');
 assert.equal(lib.classify({...game,hwnd:'0'}),'none');
 assert.equal(lib.classify({...game,hwnd:'abc'}),'none');
});

test('Alt+M binds like the window picker and reports 「已绑定：<标题>」 when that window is bound',()=>{
 const {calls,reader}=fake(),out=[];
 assert.equal(lib.request(reader,{type:'bindHotkey',hwnd:'4523',title:'さくらの詩',className:'SakuraWindow',processName:'sakura'},e=>out.push(e),'zh'),true);
 const bind=calls.find(c=>c.hwnd);assert.equal(bind.hwnd,'4523');assert.equal(bind.settings.bindEnabled,true);assert.equal(bind.settings.fontSize,30,'current reader settings go with the bind');
 assert.ok(calls.includes('clear'),'translation context restarts for the new game');assert.equal(out.length,0,'nothing said before the bridge confirms');
 lib.follow(reader,{type:'bound',gameHwnd:'999',gameTitle:'other'},e=>out.push(e),'zh');assert.equal(out.length,0,'another window bound is not this one');
 lib.follow(reader,{type:'bound',bound:true,gameHwnd:'4523',gameTitle:'さくらの詩 ver1.0'},e=>out.push(e),'zh');
 assert.deepEqual(out,[{type:'bindHotkeyResult',ok:true,kind:'bound',title:'さくらの詩 ver1.0',message:'已绑定：さくらの詩 ver1.0'}]);
 assert.equal(reader.hotkeyBind,null);
 lib.follow(reader,{type:'bound',gameHwnd:'4523'},e=>out.push(e),'zh');assert.equal(out.length,1,'said once');
});

test('Alt+M refuses MeguLit, the desktop and Explorer with a hint in the UI language, and reports a failed bind',()=>{
 for(const [m,word] of [[{hwnd:'7',processName:'MeguLit',own:true},'MeguLit'],[{hwnd:'7',className:'Progman',processName:'explorer'},'桌面'],[{hwnd:'7',className:'CabinetWClass',processName:'explorer'},'资源管理器']]){
  const {calls,reader}=fake(),out=[];assert.equal(lib.request(reader,{type:'bindHotkey',...m},e=>out.push(e),'zh'),false);
  assert.equal(calls.length,0,'nothing bound');assert.equal(out[0].ok,false);assert.match(out[0].message,new RegExp(word));assert.match(out[0].message,/Alt\+M/);}
 const out=[];lib.request(fake().reader,{hwnd:'7',className:'Progman',processName:'explorer'},e=>out.push(e),'ja');assert.match(out[0].message,/デスクトップ/);
 lib.request(fake().reader,{hwnd:'7',className:'CabinetWClass',processName:'explorer'},e=>out.push(e),'en');assert.match(out[1].message,/File Explorer/);
 const {reader}=fake(),fail=[];lib.request(reader,{hwnd:'55',title:'x',processName:'game'},e=>fail.push(e),'zh');lib.follow(reader,{type:'error',message:'请选择有效的游戏窗口'},e=>fail.push(e),'zh');
 assert.equal(fail[0].ok,false);assert.equal(fail[0].message,'绑定失败：请选择有效的游戏窗口');
 const none=[];lib.request({gal:null},{hwnd:'55',processName:'game'},e=>none.push(e),'en');assert.equal(none[0].kind,'busy');
});

test('the native hotkey reports the window in front, the service binds it, the home toggle is gone',()=>{
 const cs=read('native/GalWindowBridge.cs');
 assert.match(cs,/else if\(id==0x543\)\{BindHotkey\(\);\}/,'Alt+M (or the key chosen for it) runs BindHotkey');
 assert.match(cs,/static void BindHotkey\(bool pick=false\)\{[^\n]*GetForegroundWindow\(\)[^\n]*GetAncestor\(fg,2\)/);assert.match(cs,/type="bindHotkey",hwnd=/);
 assert.doesNotMatch(cs,/type="homeHotkey"/);
 assert.match(read('core/gal-native.cjs'),/message\.type==='bindHotkey'\)\) \{ this\.onEvent\(message\)/);
 const reader=read('services/reader.cjs');assert.match(reader,/message\.type==='bindHotkey'\)\{require\('\.\/bind-hotkey\.cjs'\)\.request/);assert.doesNotMatch(reader,/home-toggle/);
 assert.match(read('web/reader/bootstrap.js'),/bindHotkeyResult'\)\{b\.bindHotkeyResult/);assert.match(read('web/reader/modules/gal.js'),/bridge\.bindHotkeyResult = message =>/);
 assert.match(read('web/app.js'),/type==='bindHotkeyResult'\|\|response\.payload\?\.type==='runningGameHint'\)\{if\(!document\.hidden/);
});

test('every Alt+M label says it binds the current window (zh / ja / en), none calls it the home toggle',()=>{
 const files=['web/reader/modules/menu-layout.js','web/reader/modules/polish.js','web/reader/modules/settings.js','web/reader/modules/i18n.js','web/guide-content.js','site/public/assets/js/guide.js','native/GalWindowBridge.cs'];
 for(const f of files){const s=read(f);assert.doesNotMatch(s,/Alt\+M[^'"\n]{0,12}(开关主页|开关 MeguLit 主页|显示／隐藏 MeguLit 主页|切换翻译文本框|切换普通界面)/,f);assert.doesNotMatch(s,/k\('M'\) \+ ' (显示 \/ 隐藏 MeguLit 主页|MeguLit ホームの表示|shows or hides the MeguLit home)/,f);}
 /* 2026-11-27 the key row is built from the chosen keys (web/hotkeys.js); its default names Alt+M 绑定窗口 */
 assert.match(read('web/reader/modules/polish.js'),/H\.hintRow\(/);{const H=require(path.join(__dirname,'..','web','hotkeys.js'));assert.equal(H.label(H.DEFAULTS.bind,'zh'),'Alt+M');assert.equal(H.actionName('bind','zh'),'绑定窗口');}
 assert.match(read('web/reader/modules/menu-layout.js'),/Alt\+M 绑定窗口 · Alt\+T/);
 assert.match(read('web/reader/modules/settings.js'),/Alt\+M 绑定当前游戏窗口，Alt\+T 开关菜单/);
 const i18n=read('web/reader/modules/i18n.js');for(const k of ['绑定窗口','Alt+M 绑定当前游戏窗口，Alt+T 开关菜单','Alt+M 绑定窗口 · Alt+T 开关菜单 · 拖动即时预览','绑定游戏窗口','先开游戏后开 MeguLit，或 MeguLit 重开后，用这里或 Alt+M 重新连接'])assert.ok(i18n.includes(`'${k}':[`),'i18n en/ja for '+k);
 const guide=read('web/guide-content.js');assert.equal((guide.match(/\['Alt\+M', '/g)||[]).length,3,'in-app guide lists Alt+M in zh, ja and en');
 const site=read('site/public/assets/js/guide.js');for(const w of ['把当前在前面的游戏窗口绑定给 MeguLit','前面のゲームウィンドウを MeguLit に割り当て','binds the game window in front to MeguLit'])assert.ok(site.includes(w),w);
});

/* 2026-11-15 (user: 方便先开游戏再开megulit 或者megulit不小心关了中途要链接) */
test('a game started before MeguLit: one bind for Alt+M, 点选 and the list; the process is remembered for the next MeguLit start',()=>{
 const saved=[],binds=[],out=[];const reader={gal:{preferences:{fontSize:30,gameProcess:'old',bindEnabled:true},bind:(h,s)=>binds.push({h,s}),save:(v,c)=>saved.push({v,c})}};
 lib.bindWindow(reader,{hwnd:'77',title:'さくら',processName:'sakura.exe'},{fontSize:28},e=>out.push(e));
 assert.deepEqual(binds,[{h:'77',s:{fontSize:28,bindEnabled:true}}],'the page settings of the list bind go with it');
 lib.follow(reader,{type:'bound',bound:true,gameHwnd:'77',gameTitle:'さくら'},e=>out.push(e),'zh');
 assert.equal(out[0].message,'已绑定：さくら');assert.deepEqual(saved,[{v:{fontSize:30,gameProcess:'sakura',gameExecutable:'',bindEnabled:true},c:false}],'gameProcess kept: a MeguLit restart binds this game again by itself (its full path is written by the bound event, validation/autobind-path.test.cjs)');
 const pick=[];lib.request({gal:reader.gal},{hwnd:'9',className:'Progman',processName:'explorer',pick:true},e=>pick.push(e),'zh');assert.equal(pick[0].pick,true);assert.match(pick[0].message,/桌面/);
 const reader2=read('services/reader.cjs');
 assert.match(reader2,/case 'galBind':[^\n]*require\('\.\/bind-hotkey\.cjs'\)\.bindWindow\(this,\{hwnd:r\.hwnd,title:r\.title,processName:r\.processName\},r\.settings/,'the list bind goes the same way');
 assert.match(reader2,/case 'galPickWindow':g\?\.send\(\{type:'pickWindow',active:r\.active===true\}\)/);
 const cs=read('native/GalWindowBridge.cs');assert.match(cs,/static void PickTick\(\)\{[^\n]*\n[^\n]*root==PickSkip\)return;[^\n]*\n\s*if\(pid==\(uint\)OverlayPid\|\|pid==\(uint\)Process\.GetCurrentProcess\(\)\.Id\)return;PickUntil=DateTime\.MinValue;BindHotkey\(true\);\}/,'点选 takes the next non-MeguLit window in front');
 assert.match(cs,/try\{ModeRequestTick\(\);PickTick\(\);Tick\(\);\}catch\{\}/);
});

test('reconnecting to a game an earlier MeguLit injected: HookBridge connects first and injects only when needed, our DLLs redial their pipes',()=>{
 const hb=read('native/HookBridge.cs');
 const start=hb.indexOf('Luna_Start(connected'),connect=hb.indexOf('Luna_ConnectProcess(Pid)',start),check=hb.indexOf('Reattach=!Luna_CheckIfNeedInject(Pid)',start);
 assert.ok(start>0&&connect>start&&check>connect,'ConnectProcess, then inject only if Luna_CheckIfNeedInject');
 /* #468 an already injected process gets the hooks it had again; 490a7b5b the DLL may connect before Reattach is set (CHAOS;CHILD rig: OnConnect ran first, nothing reinserted), so it runs once more when already connected, and only once */
 assert.ok(hb.includes('Connected=true;ReattachHooks();'));
 assert.ok(hb.includes('Reattach=!Luna_CheckIfNeedInject(Pid);if(Reattach){')&&hb.includes('if(Connected)ReattachHooks();}'),'run once more when the DLL connected first');
 assert.ok(hb.includes('static void ReattachHooks(){if(!Reattach||ReattachDone'),'runs once');
 assert.match(hb,/Luna_DetachProcess\(Pid\)/,'a clean exit detaches, so the next start injects a fresh hook');
 const font=read('native/fontprobe/FontProbe.cpp');assert.match(font,/if \(pipe == INVALID_HANDLE_VALUE\) \{ pipe = CreateFileW\(name[^\n]*continue; fresh = true; \}/,'FontProbe redials and replays to a new HookBridge');
 assert.match(font,/CloseHandle\(p\); InterlockedExchange\(&CtlConnected, 0\); Command\("OFF"\)/,'with HookBridge gone nothing stays hidden');
 assert.match(read('native/gpuhide/GpuHide.cpp'),/if \(pipe == INVALID_HANDLE_VALUE\) \{\s*pipe = CreateFileW\(name/);
 /* perf/inject-hotpath: the pipe is dialled by the background Writer (never on the game thread), at most every 2 s */assert.match(read('native/fontdot/FontDot.cpp'),/if \(Pipe == INVALID_HANDLE_VALUE\) \{\s*DWORD now = GetTickCount\(\); if \(!first && now - tried < 2000\) continue;[^\n]*\n\s*Pipe = CreateFileA\(name/);
});

test('MeguLit started while a library game runs: the home window says 「检测到…正在运行…Alt+M」 once, not for the game it rebinds itself',async t=>{
 const games=[{id:'a',title:'さくらの詩',executable:'D:\\Games\\Sakura\\sakura.exe'},{id:'b',title:'Old',executable:'D:/G/old.exe'},{id:'c',title:'NoExe',executable:''}];
 const wins=[{hwnd:'1',processName:'sakura',title:'さくらの詩'},{hwnd:'2',processName:'old',title:'Old'},{hwnd:'3',processName:'notepad',title:'x'},{hwnd:'4',processName:'Sakura',title:'second window'}];
 assert.deepEqual(lib.runningGames(wins,games,'old'),[{id:'a',title:'さくらの詩',hwnd:'1',processName:'sakura'}]);
 assert.equal(lib.runningHint(lib.runningGames(wins,games),'zh'),'检测到「さくらの詩、Old」正在运行：先点一下游戏窗口，再按 Alt+M 连接');
 assert.match(lib.runningHint([{title:'X'}],'ja'),/Alt\+M/);assert.match(lib.runningHint([{title:'X'}],'en'),/is running/);
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
 const sent=[],out=[],reader={gal:{preferences:{bindEnabled:true,gameProcess:'old'},send:m=>sent.push(m)}};
 lib.startupScan(reader,{type:'ready'},e=>out.push(e),'zh',()=>games);lib.startupScan(reader,{type:'ready'},e=>out.push(e),'zh',()=>games);
 t.mock.timers.tick(4000);assert.deepEqual(sent,[{type:'windows'}],'asked once, after the bridge had its own auto-bind chance');
 lib.startupScan(reader,{type:'windows',windows:wins},e=>out.push(e),'zh',()=>games);
 assert.equal(out.length,1);assert.equal(out[0].type,'runningGameHint');assert.equal(out[0].message,'检测到「さくらの詩」正在运行：先点一下游戏窗口，再按 Alt+M 连接');
 lib.startupScan(reader,{type:'windows',windows:wins},e=>out.push(e),'zh',()=>games);assert.equal(out.length,1,'a later window list (the Alt+T picker) says nothing');
 const bound={gal:{preferences:{},send:m=>sent.push(m)},gamePid:5};lib.startupScan(bound,{type:'ready'},()=>{},'zh',()=>games);t.mock.timers.tick(4000);assert.equal(sent.length,1,'a bound game: no scan');
 assert.match(read('web/app.js'),/type==='runningGameHint'\)\{if\(!document\.hidden&&response\.payload\.message\)toast/);
});
