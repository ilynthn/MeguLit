// E531 (user: CLANNAD said "这个游戏暂时不能隐藏原文"). Replay of the CLANNAD HD hook log: on the title menu only the
// read-only SiglusEngine4 stream carries text ("タイトルメニュー", "プロローグ"); the embeddable EmbedSiglus stream is created
// with the first story line ("一面、白い世界…"). The bridge now reports the inserted embed hook, and the title menu waits.
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const {HookControl}=require('../core/hook-control.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

function host(){
 const notes=[];let t=0;
 const h={state:{bound:true,coverEnabled:true,gameProcessId:13160,gameStarted:'1700000000000'},preferences:{hookProfile:'read',hookHide:true,hookAutoStart:true,autoGameStyle:true,hookFast:true},
  hooks:{preflight:false,enabled:false,state:{hookThreads:[]},configure(){},trace(){},select(){}},
  styleSync:{latest:null,status(){},request(){},begin(){}},send(){},save(p){h.preferences=p;},notify:m=>notes.push(m),onEvent(){}};
 const c=new HookControl(h);c.now=()=>t;c.plan='read';c.running=true;
 return {h,c,notes,tick:ms=>{t+=ms;}};
}
const title=['タイトルメニュー','プロローグ'];
const step=(h,c,threads)=>{h.hooks.state.hookThreads=threads;c.apply();};

test('title menu with an embed hook pending: no "unsupported" feedback, embed starts on the first story line',()=>{
 const {h,c,notes,tick}=host();h.hooks.state.hookEmbedPending=true;
 for(const s of title){step(h,c,[{id:'897c49',name:'SiglusEngine4',sample:s,selected:true,embeddable:false}]);tick(9000);step(h,c,h.hooks.state.hookThreads);}
 assert.ok(!notes.some(n=>n.hookEmbedUnsupported===true),'title menu is not reported as unsupported');
 step(h,c,[{id:'897c49',name:'SiglusEngine4',sample:'一面、白い世界…',selected:true},{id:'7fdaa0',name:'EmbedSiglus',sample:'一面、白い世界…',embeddable:true}]);
 assert.equal(c.plan,'embed');
 assert.equal(h.hooks.preferredThread,'7fdaa0');
});

test('no embed hook inserted: the feedback still appears after 8 s (engines that really cannot embed)',()=>{
 const {h,c,notes,tick}=host();
 step(h,c,[{id:'1',name:'GDI',sample:'タイトルメニュー',selected:true}]);tick(9000);step(h,c,h.hooks.state.hookThreads);
 assert.ok(notes.some(n=>n.hookEmbedUnsupported===true));
});

test('embed hook pending but never speaks: feedback after four different lines',()=>{
 const {h,c,notes,tick}=host();h.hooks.state.hookEmbedPending=true;
 for(const s of ['あ、今日は晴れだ。','そうだね。','行こうか。','うん。']){step(h,c,[{id:'1',name:'SiglusEngine4',sample:s,selected:true}]);tick(9000);}
 step(h,c,h.hooks.state.hookThreads);
 assert.ok(notes.some(n=>n.hookEmbedUnsupported===true));
});

test('bridge emits hookEmbedPending for E hook codes; hook-native resets it per process',()=>{
 const b=read('native/HookBridge.cs'),n=read('core/hook-native.cjs');
 assert.match(b,/StartsWith\("E"\)&&!EmbedPendingSent\)\{EmbedPendingSent=true;Emit\(new\{type="hookEmbedPending"/);
 assert.match(n,/m\.type==='hookEmbedPending'/);
 assert.match(n,/this\.state\.hookEmbedPending=false;/);
});
