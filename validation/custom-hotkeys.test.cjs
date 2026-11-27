'use strict';
/* 2026-11-27 (owner: 支持Alt+T alt+H L之类的热键可以自定义设置 也可以绑定在鼠标上 热键设置入口在alt+t菜单和设置里面都加一下).
   Every MeguLit key can be chosen (a combination, a mouse side button, the middle button with a modifier); the choice is kept
   in data/config/hotkeys.json, a key another action holds is refused, a key Windows or games use gets a note, and every hint
   (the Alt+T menu key row, the guide, the bind messages) shows the current key. */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const repo=path.join(__dirname,'..');
const tempRoot=()=>fs.mkdtempSync(path.join(os.tmpdir(),'megulit-hotkeys-'));
const cfg=root=>path.join(root,'data','config');
const load=f=>{try{return require(path.join(repo,f));}catch(error){return {loadError:error};}};
/* the page side: web/hotkeys.js + web/hotkeys-panel.js as classic scripts in one window object */
function page(){
 const win={CustomEvent:class{constructor(type,init){this.type=type;this.detail=init&&init.detail;}},dispatchEvent(){},addEventListener(){},removeEventListener(){}};
 win.globalThis=win;const ctx=vm.createContext(win);
 for(const f of ['web/hotkeys.js','web/hotkeys-panel.js']){const file=path.join(repo,f);if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:f});}
 return win;
}

test('the hotkeys are kept in data/config/hotkeys.json and read back',()=>{
 const store=load('core/hotkeys.cjs');assert.ok(!store.loadError,'core/hotkeys.cjs loads: '+(store.loadError&&store.loadError.message));
 const root=tempRoot();
 try{
  assert.deepStrictEqual(store.read(cfg(root)),{bind:'Alt+M',menu:'Alt+T',cover:'Alt+H',log:'Alt+L'},'nothing saved: the keys MeguLit always had');
  const saved=store.save(cfg(root),{menu:'ctrl + shift + k',cover:'MouseX1'});
  assert.strictEqual(saved.menu,'Ctrl+Shift+K','written the one way');
  assert.strictEqual(saved.cover,'MouseX1','a side button alone is a key');
  const disk=JSON.parse(fs.readFileSync(path.join(root,'data','config','hotkeys.json'),'utf8'));
  assert.strictEqual(disk.menu,'Ctrl+Shift+K');
  assert.deepStrictEqual(store.read(cfg(root)),{bind:'Alt+M',menu:'Ctrl+Shift+K',cover:'MouseX1',log:'Alt+L'},'read back after a restart');
  assert.strictEqual(store.save(cfg(root),{log:''}).log,'','a key can be switched off');
  assert.strictEqual(store.save(cfg(root),{menu:null}).menu,'Alt+T','恢复默认');
  assert.strictEqual(store.save(cfg(root),{bind:'Ctrl+MouseMiddle'}).bind,'Ctrl+MouseMiddle','the middle button with a modifier');
  /* a broken file is not the end: every action falls back to its default */
  fs.writeFileSync(path.join(root,'data','config','hotkeys.json'),'{"menu":"Nope+?","cover":42}');
  assert.deepStrictEqual(store.read(cfg(root)),{bind:'Alt+M',menu:'Alt+T',cover:'Alt+H',log:'Alt+L'});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('keys that cannot work are refused and nothing is written',()=>{
 const store=load('core/hotkeys.cjs');assert.ok(!store.loadError);
 const root=tempRoot();
 try{
  store.save(cfg(root),{menu:'Alt+K'});
  assert.throws(()=>store.save(cfg(root),{menu:'T'}),/HOTKEY_MODIFIER/,'a bare letter would be taken from every program');
  assert.throws(()=>store.save(cfg(root),{cover:'MouseMiddle'}),/HOTKEY_MODIFIER/,'the middle button alone is everyone\'s');
  assert.throws(()=>store.save(cfg(root),{cover:'Alt+Tab'}),/HOTKEY_RESERVED/);
  assert.throws(()=>store.save(cfg(root),{cover:'Alt+F4'}),/HOTKEY_RESERVED/);
  assert.throws(()=>store.save(cfg(root),{cover:'Hyper+Q'}),/HOTKEY_INVALID/);
  assert.throws(()=>store.save(cfg(root),{nope:'Alt+Q'}),/HOTKEY_INVALID/);
  assert.strictEqual(store.read(cfg(root)).menu,'Alt+K','the earlier choice stays');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('a key another action holds is refused with that action named',()=>{
 const store=load('core/hotkeys.cjs');assert.ok(!store.loadError);
 const root=tempRoot();
 try{
  assert.throws(()=>store.save(cfg(root),{cover:'Alt+T'}),e=>/HOTKEY_CONFLICT:menu/.test(e.message)&&e.other==='menu');
  assert.throws(()=>store.save(cfg(root),{log:'alt+m'}),/HOTKEY_CONFLICT:bind/,'written another way, still the same key');
  assert.strictEqual(store.read(cfg(root)).cover,'Alt+H');
  /* the same key on two actions in a hand-edited file: the later action goes back to its default */
  fs.mkdirSync(path.join(root,'data','config'),{recursive:true});
  fs.writeFileSync(path.join(root,'data','config','hotkeys.json'),JSON.stringify({menu:'MouseX2',cover:'MouseX2'}));
  const r=store.read(cfg(root));assert.strictEqual(r.menu,'MouseX2');assert.strictEqual(r.cover,'Alt+H');
  /* moving one key away frees it for another */
  store.save(cfg(root),{menu:'Alt+K'});assert.strictEqual(store.save(cfg(root),{cover:'Alt+T'}).cover,'Alt+T');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('the panel names the conflict and notes keys Windows or games use',()=>{
 const H=page().MeguHotkeys;assert.ok(H&&H.judge,'web/hotkeys-panel.js gives MeguHotkeys.judge');
 const now={bind:'Alt+M',menu:'Alt+T',cover:'Alt+H',log:'Alt+L'};
 const clash=H.judge(now,'log','Alt+T','zh');assert.strictEqual(clash.ok,false);assert.match(clash.text,/开关菜单/);
 assert.match(H.judge(now,'log','Alt+T','en').text,/Toggle menu/);
 const same=H.judge(now,'menu','Alt+T','zh');assert.strictEqual(same.ok,true,'its own key is no conflict');
 const win=H.judge(now,'menu','Ctrl+C','zh');assert.strictEqual(win.ok,true);assert.strictEqual(win.level,'warn');assert.match(win.text,/Windows/);
 const game=H.judge(now,'menu','Alt+Enter','zh');assert.strictEqual(game.ok,true);assert.strictEqual(game.level,'warn');assert.match(game.text,/游戏/);
 const side=H.judge(now,'menu','MouseX1','ja');assert.strictEqual(side.ok,true);assert.strictEqual(side.level,'warn');
 const fine=H.judge(now,'menu','Ctrl+Shift+K','zh');assert.deepStrictEqual([fine.ok,fine.level,fine.text],[true,'','']);
 assert.strictEqual(H.judge(now,'menu','Alt+Tab','zh').ok,false);
 assert.match(H.errorText(new Error('HOTKEY_CONFLICT:cover'),'zh'),/开关内嵌/);
});

test('a key pressed while recording becomes the binding (keyboard and mouse)',()=>{
 const H=page().MeguHotkeys;assert.ok(H&&H.fromKeyboard);
 assert.strictEqual(H.fromKeyboard({code:'KeyK',ctrlKey:true,shiftKey:true}),'Ctrl+Shift+K');
 assert.strictEqual(H.fromKeyboard({code:'F7',altKey:true}),'Alt+F7');
 assert.strictEqual(H.fromKeyboard({code:'AltLeft',altKey:true}),'','modifier alone: keep waiting');
 assert.strictEqual(H.fromMouse({button:3}),'MouseX1');
 assert.strictEqual(H.fromMouse({button:4,altKey:true}),'Alt+MouseX2');
 assert.strictEqual(H.fromMouse({button:1,ctrlKey:true}),'Ctrl+MouseMiddle');
 assert.strictEqual(H.fromMouse({button:0}),'','the left button never');
});

test('the bridge gets each key as Windows numbers (keyboard VK or mouse button)',()=>{
 const store=load('core/hotkeys.cjs');assert.ok(!store.loadError);
 const root=tempRoot();
 try{
  const base=store.nativeCommand(cfg(root));
  assert.deepStrictEqual([base.type,base.menuMods,base.menuKey,base.menuMouse],['hotkeys',1,0x54,0],'Alt+T as before');
  assert.deepStrictEqual([base.coverMods,base.coverKey,base.bindMods,base.bindKey,base.logMods,base.logKey],[1,0x48,1,0x4D,1,0x4C]);
  store.save(cfg(root),{menu:'Ctrl+Alt+F2',cover:'MouseX2',bind:'Shift+MouseMiddle',log:''});
  const spec=JSON.parse(store.nativeEnv(cfg(root)));
  assert.deepStrictEqual([spec.menuMods,spec.menuKey,spec.menuMouse],[3,0x71,0]);
  assert.deepStrictEqual([spec.coverMods,spec.coverKey,spec.coverMouse],[0,0,3]);
  assert.deepStrictEqual([spec.bindMods,spec.bindKey,spec.bindMouse],[4,0,1]);
  assert.deepStrictEqual([spec.logMods,spec.logKey,spec.logMouse],[0,0,0],'off');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('a save reaches the bridge and every page at once',()=>{
 const store=load('core/hotkeys.cjs');assert.ok(!store.loadError);
 const root=tempRoot(),sent=[],events=[];
 try{
  store.save(cfg(root),{menu:'Alt+K'});
  store.publish(cfg(root),{reader:{gal:{send:m=>sent.push(m)}},emit:(channel,m)=>events.push([channel,m])});
  assert.strictEqual(sent.length,1);assert.strictEqual(sent[0].type,'hotkeys');assert.strictEqual(sent[0].menuKey,0x4B);
  assert.deepStrictEqual(events,[['reader-event',{type:'hotkeys',bindings:{bind:'Alt+M',menu:'Alt+K',cover:'Alt+H',log:'Alt+L'}}]]);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('the Alt+T menu key row and other hints follow the settings',()=>{
 const win=page(),H=win.MeguHotkeys;assert.ok(H&&H.hintRow,'MeguHotkeys.hintRow');
 assert.match(H.hintRow('zh'),/<kbd>Alt\+T<\/kbd>开关菜单/,'defaults before anything is saved');
 H.set({menu:'Ctrl+Shift+K',cover:'MouseX1',log:''});
 const row=H.hintRow('zh');
 assert.match(row,/<kbd>Ctrl\+Shift\+K<\/kbd>开关菜单/);
 assert.match(row,/<kbd>鼠标侧键 1<\/kbd>开关内嵌/);
 assert.doesNotMatch(row,/Alt\+T|Alt\+H|打开日志/,'old keys gone; a switched-off key is not shown');
 assert.match(H.hintRow('en'),/<kbd>Mouse 4<\/kbd>Toggle inline/);
 assert.strictEqual(H.display('menu','zh'),'Ctrl+Shift+K');
 assert.strictEqual(H.display('log','zh'),'未设置');
 assert.strictEqual(H.localize('按 Alt+T 打开菜单，Alt+H 对比原文','zh'),'按 Ctrl+Shift+K 打开菜单，鼠标侧键 1 对比原文');
 /* swapped keys are swapped once, not twice */
 H.set({menu:'Alt+H',cover:'Alt+T'});assert.strictEqual(H.localize('Alt+T / Alt+H'),'Alt+H / Alt+T');
});

test('the bind messages of the service name the current key',()=>{
 const store=load('core/hotkeys.cjs'),bind=require(path.join(repo,'services/bind-hotkey.cjs'));assert.ok(!store.loadError);
 const root=tempRoot();
 try{
  assert.match(bind.message('own','zh'),/Alt\+M/);
  store.save(cfg(root),{bind:'Ctrl+Alt+B'});
  assert.match(bind.message('own','zh',undefined,root),/Ctrl\+Alt\+B/);
  assert.doesNotMatch(bind.message('own','zh',undefined,root),/Alt\+M/);
  assert.match(bind.runningHint([{title:'X'}],'zh',root),/Ctrl\+Alt\+B/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('the guide shows the chosen keys',async()=>{
 const {pathToFileURL}=require('node:url');const win=page();assert.ok(win.MeguHotkeys);
 const before=globalThis.MeguHotkeys;globalThis.MeguHotkeys=win.MeguHotkeys;
 try{
  const g=await import(pathToFileURL(path.join(repo,'web','guide-content.js')).href+'?hotkeys');
  const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]);
  win.MeguHotkeys.set({menu:'Ctrl+Shift+K',cover:'MouseX2'});
  const html=g.guideHTML('zh',esc)+g.successHTML('zh',esc);
  assert.match(html,/<kbd>Ctrl\+Shift\+K<\/kbd>/);assert.match(html,/<kbd>鼠标侧键 2<\/kbd>/);
  assert.doesNotMatch(html,/<kbd>Alt\+T<\/kbd>|<kbd>Alt\+H<\/kbd>/);
  assert.match(html,/<kbd>Alt\+M<\/kbd>/,'an unchanged key stays');
 }finally{globalThis.MeguHotkeys=before;}
});

test('a log key chosen in the log page before is taken over once',()=>{
 const store=load('core/hotkeys.cjs');assert.ok(!store.loadError);
 const root=tempRoot();
 try{
  assert.strictEqual(store.adoptLog(cfg(root),'Ctrl+Alt+L').log,'Ctrl+Alt+L');
  assert.strictEqual(store.adoptLog(cfg(root),'Alt+B'),null,'only while the hotkeys file has no log key');
  assert.strictEqual(store.read(cfg(root)).log,'Ctrl+Alt+L');
  const other=tempRoot();try{assert.strictEqual(store.adoptLog(cfg(other),'').log,'','「不用快捷键」stays off');}finally{fs.rmSync(other,{recursive:true,force:true});}
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('the reader page fallback keys follow the settings too (the bridge does not hold the key)',()=>{
 const s=fs.readFileSync(path.join(repo,'web','reader','modules','settings.js'),'utf8').replace(/\r\n/g,'\n');
 const start=s.indexOf("document.addEventListener('keydown', event => {");assert.ok(start>0);
 const handler=s.slice(start+"document.addEventListener('keydown', ".length,s.indexOf('}, true);',start)+1);
 const win=page();let toggles=0,covers=0;
 win.__tomoyoTranslateRequest=()=>covers++;
 const bridge={nativeHotkeys:{menu:false,cover:false},toggleGalMenu:()=>toggles++};
 const fn=new Function('bridge','dialog','window',`return ${handler};`)(bridge,null,win);
 const ev=(code,mods={})=>({code,altKey:!!mods.alt,ctrlKey:!!mods.ctrl,shiftKey:!!mods.shift,metaKey:false,repeat:false,preventDefault(){},stopImmediatePropagation(){}});
 fn(ev('KeyT',{alt:true}));assert.equal(toggles,1,'Alt+T by default');
 win.MeguHotkeys.set({menu:'Ctrl+Shift+K',cover:'Alt+J'});
 fn(ev('KeyT',{alt:true}));fn(ev('KeyH',{alt:true}));assert.deepEqual([toggles,covers],[1,0],'the old keys do nothing any more');
 fn(ev('KeyK',{ctrl:true,shift:true}));fn(ev('KeyJ',{alt:true}));assert.deepEqual([toggles,covers],[2,1],'the chosen keys work');
});
