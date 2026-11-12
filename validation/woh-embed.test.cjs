// SPDX-License-Identifier: GPL-3.0-or-later
// E320 WITCH ON THE HOLY NIGHT (Steam, WoH.exe, LunaHook TYPEMOON ENHQ-4C@130160): user report 2026-11-10.
// Hiding stopped the game ("Micro Thread ... [0x80000012]") after a skip burst, every ruby line (<rふ>触</r>) kept its
// original, overlay lines were placed twice (the reader's flow page and the OCR page locator), the title-screen help
// was read as dialogue, and one line came in twice. Synthetic events and source checks; the C# rules run in
// HookBridge --self-test (Build-HookBridge.ps1).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
function fixture(t){t.mock.timers.enable({apis:['setTimeout']});let now=100000;const events=[],located=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>now);hook.trace=()=>{};t.after(()=>hook.stop());
 hook.flowPage=true;hook.locate=text=>located.push(text);
 return {hook,events,located,line(text){hook.source({text,sourceName:'typemoon',origin:'live'},'');},tick(ms){now+=ms;t.mock.timers.tick(ms);},
  sources:()=>events.filter(m=>typeof m.hookSource==='string'&&m.hookSource).map(m=>[m.hookSource,m.hookSourceEngine])};}

test('WoH lines are placed only by the reader\'s flow page: no OCR page lookups, OCR page reports ignored',t=>{
 const f=fixture(t);
 f.line('　山中の冬は寒すぎて、朝はいつも辛かった。');f.tick(500);
 f.hook.pageLine({type:'hookEngineLine',engine:'ocr',phase:'begin',line:1,same:false,nvl:true,x0:100,y0:-40,x1:900,y1:-40,size:30,sw:1280,sh:720,count:0,text:''});
 f.hook.pageLine({type:'hookEngineLine',engine:'ocr',phase:'end',line:1,same:false,nvl:true,x0:100,y0:-40,x1:900,y1:-40,size:30,sw:1280,sh:720,count:20,text:'山中の冬は寒すぎて、朝はいつも辛かった。'});
 f.line('　お父さんは自動車で駅まで送ってくれるけれど、');f.tick(500);
 assert.deepEqual(f.located,[],'no OCR lookups');
 assert.equal(f.events.filter(m=>m.type==='hookPage'||m.type==='hookTextPos').length,0,'no OCR page or position');
 assert.deepEqual(f.sources().map(s=>s[1]),['nvl','nvl'],'each line once, as a flow line');
});

test('WoH title-screen help text is not read as a story line',t=>{
 const f=fixture(t);
 f.line("Change text display speed.Change auto-scroll speed.Change window opacity.Don't show text outline.");f.tick(500);
 f.line('　彼女の家は山の中腹にあった。');f.tick(500);
 assert.deepEqual(f.sources(),[['　彼女の家は山の中腹にあった。','nvl']]);
});

test('a WoH line delivered twice in one piece is read once',t=>{
 const f=fixture(t);
 f.line('　山中の冬は寒すぎて、朝はいつも辛かった。　山中の冬は寒すぎて、朝はいつも辛かった。');f.tick(500);
 assert.deepEqual(f.sources(),[['　山中の冬は寒すぎて、朝はいつも辛かった。','nvl']]);
 assert.equal(HookNative.undouble('「はい」「はい」'),'「はい」「はい」','short repeats are real dialogue');
 assert.equal(HookNative.undouble('ふつうの文です。ちがう文です。'),'ふつうの文です。ちがう文です。');
});

test('other games keep OCR page lookups and English text',t=>{
 const f=fixture(t);f.hook.flowPage=false;
 f.line('Good evening, everyone.');f.tick(500);
 assert.deepEqual(f.located,['Good evening, everyone.']);
 assert.deepEqual(f.sources(),[['Good evening, everyone.','']]);
});

test('hiding rules: HuneX ruby lines are blanked with their tags, skip bursts go back unchanged, old unsafe marks expire',()=>{
 const policy=read('native/EmbedTextPolicy.cs'),bridge=read('native/HookBridge.cs');
 assert.match(policy,/public const int Version = 3;/);
 assert.match(policy,/if \(Ruby\.IsMatch\(value\)\) return HideRuby\(value\);\r?\n(?:\s+\/\/[^\n]*\n)*\s+if \(\(Resource\.IsMatch\(value\) && !Prose\.IsMatch\(value\)\) \|\| Container\(value\)\) return "";/,'ruby is handled before the path check that "</r>" tripped');
 assert.match(policy,/Hide\("　彼女がはじめて命に<rふ>触<\/r>れた、<rしず>厳<\/r>かな朝の出来事だ。"\) == "　+<r　>　<\/r>　+<r　　>　<\/r>　+"/,'self-test covers a two-ruby line');
 assert.match(bridge,/if\(burst&&replacement\.Length>0\)\{replacement="";/,'every engine goes back unchanged while skipping (E463)');
 assert.match(bridge,/text!=LastEmbedText/,'a redraw of the same line is still hidden');
 assert.match(bridge,/\{"policy",EmbedTextPolicy\.Version\}/);
 assert.match(bridge,/Convert\.ToInt32\(p\)>=EmbedTextPolicy\.Version/);
});

test("E323: the wait marker moving up the page is the game's page turn; moving down is the next line",t=>{
 const f=fixture(t);const pages=()=>f.events.filter(m=>m.type==='hookPage').map(m=>[m.engine,m.same,m.line]);
 const marker=(y,active=true)=>f.hook.markerTarget({active,x:900,y,width:24,height:24,clientWidth:1378,clientHeight:775});
 marker(300);marker(360);marker(420);assert.deepEqual(pages(),[],'down the page: same page');
 marker(425);assert.deepEqual(pages(),[],'a wobble smaller than the marker is not a turn');
 marker(180);assert.deepEqual(pages(),[['nvl',false,1]],'up by rows: new page');
 marker(240);marker(170);assert.deepEqual(pages(),[['nvl',false,1],['nvl',false,2]]);
 f.hook.flowPage=false;marker(500);marker(100);assert.equal(pages().length,2,'other games: no flow page turns');
 const {Page}=require('../web/reader/modules/island-page.js');const model=new Page();
 model.flow('古いページの文。',1);model.records[0].at=Date.now()-5000;model.flow('新しいページの一文目。',2);
 assert.equal(model.clearFlow(),true);assert.deepEqual(model.records.map(r=>r.source),['新しいページの一文目。']);
 model.records[0].at=Date.now()-5000;model.clearFlow();assert.deepEqual(model.records,[],'a turn with no fresh line clears everything');
});

test("E323 wiring: per-sentence indent, marker on the current line, box probes off on a flow page",()=>{
 const gal=read('web/reader/modules/gal.js'),wait=read('web/reader/modules/wait-marker.js'),imm=read('core/immersion.cjs'),view=read('web/reader/modules/island-page.js');
 assert.match(gal,/for\(const sentence of document\.querySelectorAll\('\.sentence-text'\)\)\{\r?\n\s+let leading=!sentence\.closest\('\.tome-island-flow'\);/);
 assert.match(wait,/\.tome-island-pair\.tome-island-current/);
 assert.match(imm,/source\(text,engine\)\{const flow=engine==='nvl';/);assert.match(imm,/scene\(visible,why='scene'\)\{[^\n]*if\(this\.isFlow\(\)\)\{/);assert.match(imm,/autoBox\(visible\)\{[^}]*\|\|this\.isFlow\(\)\)return;/);
 assert.match(view,/\.tome-island-flow \.sentence-text\[data-megulit-native-breaks\]\{white-space:pre-wrap!important/,"a paragraph with the game's own breaks still wraps at the box width");
 assert.doesNotMatch(view,/--tomoyo-gal-gap'\)\)\|\|8/,'the slider gap is not added between lines');
});

test('E349: the TYPE-MOON hint stream (same hook code as the story) is never the WoH source; the story stream is selected',t=>{
 const f=fixture(t);const sent=[];f.hook.process={stdin:{write(){},end(){}},kill(){},removeAllListeners(){}};f.hook.send=m=>sent.push(m);
 f.hook.originalText={kind:'patch',resolve:text=>text.includes('ボイス')||text.includes('早送り')?{status:'none',method:'no-cover'}:{status:'exact'}};
 assert.equal(f.hook.flowStory('ボイスを再生します'),false);assert.equal(f.hook.flowStory('　彼女がはじめて命に<rふ>触</r>れた。'),true);
 f.hook.state.hookThreads=[{id:'hint',name:'typemoon',selected:true,embeddable:true,sample:'押している間、早送りします'},{id:'story',name:'typemoon',selected:false,embeddable:true,sample:'　数分後。'}];
 f.line('ボイスを再生します');f.tick(500);
 assert.deepEqual(f.sources(),[],'a control hint is not read');
 assert.deepEqual(sent.filter(m=>m.type==='select').map(m=>m.id),['story'],'the story stream is selected instead');
 delete f.hook.originalText;
 assert.equal(f.hook.flowStory('押している間、早送りします'),false,'without the script table: no indent, no quote, no sentence end');
 assert.equal(f.hook.flowStory('　もっとも、それは夏だけの話。'),true);
});

test('E349: 重新选取文本流 on WoH skips hint streams; earlier lines fade to 30 %; an overtaken page translation is asked again, never shown',()=>{
 const gal=read('core/gal-native.cjs'),view=read('web/reader/modules/island-page.js'),ui=read('web/reader/modules/game-style-sync-ui.js');
 assert.match(gal,/flow&&!this\.hooks\.flowStory\(t\)\?-5:0/);
 assert.match(view,/Superseded sentence\|AbortError\|aborted\|已跳过过期\/i\.test\(String\(message\|\|''\)\)\)\{r\.requested=false;r\.state='pending';scheduleRetry\(\);return true;\}/);
 assert.match(ui,/整页游戏：请在一页的第一句时校准/);
});

test('E350: hovering the control bar (tooltips run together) never reaches the page, never wins a stream pick, and the story stream wins back',t=>{
 const f=fixture(t);const sent=[];f.hook.process={stdin:{write(){},end(){}},kill(){},removeAllListeners(){}};f.hook.send=m=>sent.push(m);
 const joined='前のシーン、選択肢までジャンプします押している間、早戻ししますオートモードのＯＮ、ＯＦＦを切り替えますクイックセーブを行いますボイスを再生します';
 assert.equal(HookNative.uiHelp(joined),true);assert.equal(HookNative.uiHelp('ボイスを再生します'),true);
 for(const story of ['　もっとも、それは夏だけの話。','「わかりました」','そっちこそ、一度した約束は絶対守','鳶丸は開けっぱなしの扉を閉め、鍵をかけて'])assert.equal(HookNative.uiHelp(story),false,story);
 // Even when the script table would (wrongly) accept it, a tooltip is not story.
 f.hook.originalText={kind:'patch',resolve:()=>({status:'exact'})};assert.equal(f.hook.flowStory(joined),false);
 // The tooltip stream got selected (hover on the bar); the next story line on the other stream takes the pick back.
 f.hook.state.hookThreads=[{id:'hint',name:'typemoon',selected:true,embeddable:true,sample:joined},{id:'story',name:'typemoon',selected:false,embeddable:true,sample:'　数分後。'}];
 f.line(joined);f.tick(500);
 assert.deepEqual(f.sources(),[]);assert.deepEqual(sent.filter(m=>m.type==='select').map(m=>m.id),['story']);
 // 重新选取文本流 never picks a tooltip stream, in any game.
 const {GalNative}=require('../core/gal-native.cjs');const picked=[];
 const g=Object.create(GalNative.prototype);g.state={gameProcessId:1,gameStarted:'1'};g.hooks={flowPage:false,state:{hookThreads:[{id:'a',selected:true,sample:'　数分後。'},{id:'help',selected:false,sample:'クイックロードを行います'},{id:'b',selected:false,sample:'「それは夏だけの話」'}]},select:id=>picked.push(id),flowStory:()=>true,flowStreamCheck(){}};
 g.userStart=(profile,force,id)=>picked.push(id);
 assert.deepEqual(g.reselectStream(),{selected:'b',name:undefined});assert.deepEqual(picked,['b'],'tooltip stream skipped');
 // 校准当前句 (onlyIfBad) on a selected tooltip stream switches away from it.
 g.hooks.state.hookThreads=[{id:'help',selected:true,sample:'クイックロードを行います'},{id:'a',selected:false,sample:'　数分後。'}];picked.length=0;g.skippedRun=null;
 assert.deepEqual(g.reselectStream(true),{selected:'a',name:undefined});
});

test('E352: a full-screen page with the game\'s own translation table is written back by the game (translate embed); others keep their setting',t=>{
 const f=fixture(t);const sent=[];f.hook.process={stdin:{write(){},end(){}},kill(){},removeAllListeners(){}};f.hook.send=m=>sent.push(m);f.hook.enabled=true;f.hook.preferences={embedTranslation:false};
 f.hook.syncEmbedMode();assert.deepEqual(sent.filter(m=>m.type==='embedMode').map(m=>m.mode),['hide'],'no script table yet: hide as set');
 f.hook.originalText={kind:'patch',resolve:()=>({status:'exact'}),tableDrawable:()=>true};f.hook.scriptAllowed=()=>true;
 f.line('　もっとも、それは夏だけの話。');f.tick(100);
 assert.deepEqual(sent.filter(m=>m.type==='embedMode').map(m=>m.mode),['hide','translate'],'the official table is there: the game draws the translation');
 f.hook.scriptAllowed=()=>false;f.hook.syncEmbedMode();assert.equal(sent.filter(m=>m.type==='embedMode').at(-1).mode,'hide','零延迟翻译 off: back to hiding');
 f.hook.flowPage=false;f.hook.scriptAllowed=()=>true;f.hook.syncEmbedMode();assert.equal(sent.filter(m=>m.type==='embedMode').at(-1).mode,'hide','ADV games keep the user\'s choice');
});

test('E352 wiring: writeback keeps indent and engine codes; embed lookups drop ruby markup; MeguLit draws nothing over a page the game translates',()=>{
 const policy=read('native/EmbedTextPolicy.cs'),bridge=read('native/HookBridge.cs'),reader=read('services/reader.cjs'),view=read('web/reader/modules/island-page.js');
 assert.match(policy,/public static string Writeback\(string original, string translation\)/);
 assert.match(policy,/Writeback\("　彼女がはじめて命に<rふ>触<\/r>れた。", "她第一次触碰到生命。"\) == "　她第一次触碰到生命。"/);
 assert.match(bridge,/string reply=hide\?\(p\.hidden\?\?\"\"\):EmbedTextPolicy\.Writeback\(p\.text,trans\);/);
 assert.match(reader,/extractSourceRuby\(text\)\.text;if\(plain\.trim\(\)\)text=plain;/);
 assert.equal(require('../core/source-ruby.cjs').extractSourceRuby('　彼女がはじめて命に<rふ>触</r>れた。').text,'　彼女がはじめて命に触れた。');
 assert.match(view,/\.tome-island-pair\.tome-island-game-drawn\{visibility:hidden!important\}/);
});

// E358 (user report on 1.2.8, WoH prologue: the Chinese the game drew had a blank for every third character). The game
// draws from its own bitmap font, which in Japanese holds only the characters of the Japanese script.
test('E358: a translation the game font cannot draw is hidden in the game and drawn by MeguLit; WoH is not switched to translate mode',t=>{
 const f=fixture(t);const sent=[];f.hook.process={stdin:{write(){},end(){}},kill(){},removeAllListeners(){}};f.hook.send=m=>sent.push(m);f.hook.enabled=true;f.hook.preferences={embedTranslation:false};f.hook.scriptAllowed=()=>true;
 f.hook.originalText={kind:'patch',resolve:()=>({status:'exact'}),tableDrawable:()=>false,drawable:()=>false};
 f.hook.syncEmbedMode();assert.equal(sent.filter(m=>m.type==='embedMode').at(-1).mode,'hide','the game font cannot draw the official table: hide + overlay');
 f.hook.originalText.tableDrawable=()=>true;f.hook.syncEmbedMode();assert.equal(sent.filter(m=>m.type==='embedMode').at(-1).mode,'translate','a font that has the glyphs: the game draws');
 f.events.length=0;f.hook.embedReply(7,'',{hide:true,source:'　数分後。',text:'　几分钟后。'});
 assert.deepEqual(sent.at(-1),{type:'embedReply',id:7,trans:'',hide:true});
 const n=f.events.filter(m=>m.embedLine).at(-1);assert.equal(n.embedTranslating,false);assert.deepEqual(n.embedLine,{source:'　数分後。',text:'',drawn:false});
 f.hook.embedReply(8,'　几分钟后。',{hide:false,source:'　数分後。',text:'　几分钟后。'});
 assert.deepEqual(sent.at(-1),{type:'embedReply',id:8,trans:'　几分钟后。'});assert.equal(f.events.filter(m=>m.embedLine).at(-1).embedLine.drawn,true);
});

test('E358 wiring: the reader checks the game glyphs before writing back; the bridge hides a line it was told to',()=>{
 const reader=read('services/reader.cjs'),bridge=read('native/HookBridge.cs'),text=read('services/original-text.cjs');
 assert.match(reader,/hide=this\.gal\?\.hooks\?\.originalText\?\.drawable\?\.\(trans\)===false/);
 assert.match(reader,/embedReply\(id,hide\?'':trans,\{hide,source:text,text:trans\}\)/);
 assert.match(bridge,/string reply=hide\?\(p\.hidden\?\?""\):EmbedTextPolicy\.Writeback\(p\.text,trans\);/);
 assert.match(bridge,/new PendingEmbed\{tp=tp,text=text,hidden=replacement\}/);
 assert.match(bridge,/d\.TryGetValue\("hide",out hv\)&&Convert\.ToBoolean\(hv\)/);
 assert.match(text,/const api=\{kind:'patch',patch:!!patched,fill,drawable,tableDrawable,/);
});

test('E358 real data: WoH\'s Japanese font cannot draw the reported line; every line it can draw has all its glyphs',t=>{
 const dir='E:\\Steam\\steamapps\\common\\WITCH ON THE HOLY NIGHT';if(!fs.existsSync(dir)){t.skip('WoH not installed');return;}
 const h=require('../services/original-engines/hunex.cjs'),g=h.glyphs(dir,'ja');assert.ok(g&&g.size>2000,'the Japanese body font');
 const zc=h.tableLines(h.tables(dir).zc),line=h.clean(zc.find(x=>/河川/.test(x)&&/莫大/.test(x)));
 assert.deepEqual([...line].filter(c=>!g.has(c)),[...'虽许满但那丽还给这记忆乡样'],'exactly the blanks the user saw');
 assert.equal(require('../services/original-engines/scenes.cjs').ENGINES.hunex.glyphs(dir).size,g.size);
});

// E410 (user: WoH kept the previous page's lines on the next page, drew a line twice, and the original showed under the
// overlay). Page breaks come from the game's compiled scripts; a full-screen page never runs the baseline preflight.
test('E410: HuneX compiled scripts give page starts (wait 2 + clear) and row continuations (@x)',()=>{
 const {scriptPages}=require('../services/original-engines/hunex.cjs');
 const head=Buffer.alloc(0x30);head.write('HunexCompiledScriptVer1.00','latin1');
 const pool=['$000000','$000001','$000002','@x$000003','$000004\n$000005'],words=[],strs=[];let off=0;const ptr=[];
 for(const s of pool){ptr.push(off);strs.push(Buffer.from(s+'\0','utf8'));off+=Buffer.byteLength(s)+1;}
 const text=(k,wait,clear)=>words.push(127,0,k,123,0x12345678,k,0,0,wait,0,1,0,0,0,0,3,0,320,...(clear?[321]:[]));
 text(0,1,false);text(1,2,true);text(2,0,false);text(3,1,false);text(4,2,true);
 const body=Buffer.alloc(words.length*4),base=0x30+body.length;
 /* string pointers are file offsets - 0x30 */let t=0;for(let i=0;i<words.length;i++){if(words[i]===123&&words[i+1]===0x12345678){words[i+3]=base+ptr[t]-0x30;words[i+13]=words[i+3];t++;}}
 words.forEach((w,i)=>body.writeUInt32LE(w>>>0,i*4));
 const out={starts:new Set(),cont:new Set(),known:new Set()};scriptPages(Buffer.concat([head,body,...strs]),out);
 assert.deepEqual([...out.starts],[0,2],'the first line, and the line after the wait-and-clear');
 assert.deepEqual([...out.cont],[3]);assert.deepEqual([...out.known].sort((a,b)=>a-b),[0,1,2,3,4,5]);
});

test('E410: a flow line carries its page start, row and script line; a flow page never lets a baseline line through',t=>{
 const f=fixture(t);
 f.hook.originalText={kind:'patch',resolve:text=>({status:'exact',indices:[text.includes('中腹')?2:3]}),flowLayout:i=>({index:i[0],pageStart:i[0]===2,row:'new'})};
 f.line('　彼女の家は山の中腹にあった。');f.tick(500);f.line('　まわりは何もない荒れ地。');f.tick(500);
 const s=f.events.filter(m=>typeof m.hookSource==='string'&&m.hookSource);
 assert.deepEqual(s.map(m=>[m.hookFlowPageStart,m.hookFlowRow,m.hookSourceIndex]),[[true,'new',2],[false,'new',3]]);
 f.hook.preflight=true;assert.equal(f.hook.preflight,false,'flow page');f.hook.flowPage=false;assert.equal(f.hook.preflight,true,'other games keep the preflight');
});

test('E410 real data: WoH pages match the game (prologue pages start at lines 0, 2, 6, 10; 「数分後。」 and the next line share a row)',t=>{
 const dir='E:\\Steam\\steamapps\\common\\WITCH ON THE HOLY NIGHT';if(!fs.existsSync(dir)){t.skip('WoH not installed');return;}
 const P=require('../services/original-engines/hunex.cjs').pages(dir);
 for(const i of [0,2,6,10])assert.ok(P.starts.has(i),'page start '+i);for(const i of [1,3,4,5,7,11])assert.ok(!P.starts.has(i),'same page '+i);
 assert.ok(P.cont.has(20)&&!P.cont.has(19));assert.ok(P.known.size>23000);
});

// E411 (user, WoH: "老是判定错误自动隐藏"; 『■■■■■―――』 stuck). Reader log: dialogVisibility false "marker" every few seconds.
test('E411: on a full-screen page the layer is not hidden when the wait marker leaves or a box probe says no box; skip still hides',()=>{
 const {Immersion}=require('../core/immersion.cjs'),events=[];let now=5000;
 const im=new Immersion(e=>events.push([e.dialogVisible,e.dialogReason||e.reason]),()=>now);
 im.configure({immersion:true,dialogDetection:'marker'});im.bind('woh');
 im.source('　彼女の家は山の中腹にあった。','nvl');im.marker(true);now+=2000;im.tick();
 im.marker(false);now+=3000;im.tick();im.tick();
 im.evidence(false,'visual');im.evidence(false,'auto');now+=2000;im.tick();
 assert.ok(!events.some(e=>e[0]===false),'never hidden by the marker or a box probe: '+JSON.stringify(events));
 im.skip(true);now+=400;im.tick();assert.equal(events.at(-1)[0],false,'held fast-forward still hides');
 const other=[],im2=new Immersion(e=>other.push(e.dialogVisible),()=>now);im2.configure({immersion:true,dialogDetection:'marker'});im2.bind('adv');
 im2.source('普通の台詞。','krkr');im2.marker(true);now+=2000;im2.tick();im2.input();im2.marker(false);now+=1000;im2.tick();assert.equal(other.at(-1),false,'ADV games keep the marker rule');
});

// E414 (user: ファタモルガーナの館 / The House in Fata Morgana, "做成通用解法"): multilingual KiriKiri scripts, and page games
// recognised by their own script instead of a program list.
test('E414: multilingual KiriKiri blocks pair by label, [l] continues the row, [cm] starts a page, inline [if] keeps one name',()=>{
 const {pair}=require('../services/original-engines/krkr-lang.cjs');
 const ja='*start\r\n[jinobun]\r\n\t「[if exp="sf.e!=1"]あなた[endif][if exp="sf.e==1"]死者[endif]」は目を覚ました。[p]\r\n*s_AAA|\r\n[cm]\r\n[jinobun]\r\n\t窓は暗い。[l]雨の音がする。[p]\r\n*s_BBB|\r\n[cm]\r\n[unknown]\r\n\t声がする。[l][r]\r\n\t誰だろう。[p]\r\n*s_CCC|\r\n[cm]\r\n[soul]\r\n…………。[p]\r\n*s_DDD|\r\n[cm]\r\n';
 const zh='*start\r\n[jinobun]\r\n\t「[if exp="sf.e!=1"]你[endif][if exp="sf.e==1"]死者[endif]」醒了过来。[p]\r\n*s_AAA|\r\n[cm]\r\n[jinobun]\r\n\t窗外漆黑。[l]能听到雨声。[p]\r\n*s_BBB|\r\n[cm]\r\n[unknown]\r\n\t有人在说话。[l][r]\r\n\t会是谁呢。[p]\r\n*s_CCC|\r\n[cm]\r\n[soul]\r\n…………[p][cm]\r\n';
 const p=pair(ja,zh);
 assert.deepEqual(p.lines,['「あなた」は目を覚ました。','窓は暗い。','雨の音がする。','声がする。','誰だろう。','…………。']);
 assert.deepEqual(p.zh,['「你」醒了过来。','窗外漆黑。','能听到雨声。','有人在说话。','会是谁呢。','…………'],'paired by label; a block without a shared label pairs in order after the last shared one');
 const extra=pair(ja,zh.replace('…………[p][cm]','…………[p][cm]\r\n多出来的一句。[p][cm]'));assert.equal(extra.zh.at(-1),'','a stretch with a different number of blocks stays unpaired');
 assert.deepEqual(p.starts,[0,1,3,5]);assert.deepEqual(p.cont,[2],'only the sentence after [l] on the same physical line continues the row');
});

test('E414: a page game by its own script turns on every page rule; a game whose pages hold one line does not',t=>{
 const f=fixture(t);f.hook.flowPage=false;
 const page=(starts,known)=>({kind:'patch',resolve:()=>({status:'exact',indices:[0]}),flowGame:()=>{let multi=0;for(const i of starts)if(known.includes(i+1)&&!starts.includes(i+1))multi++;return multi/starts.length>=.15;},flowLayout:()=>null});
 f.hook.originalText=page([0,1,2,3,4,5,6,7,8,9],[0,1,2,3,4,5,6,7,8,9]);assert.equal(f.hook.flowPage,false,'one line per page: an ADV game');
 f.hook.originalText=page([0,2,4,5,6,7,8,9],[0,1,2,3,4,5,6,7,8,9]);assert.equal(f.hook.flowPage,true,'two of eight pages hold two lines');
 f.hook.preflight=true;assert.equal(f.hook.preflight,false,'no baseline preflight on a page game');
 f.line('　窓は暗い。');f.tick(500);const s=f.events.filter(m=>typeof m.hookSource==='string'&&m.hookSource).at(-1);
 assert.equal(s.hookSourceEngine,'nvl');assert.equal(s.hookFlowGrid,'','no grid: the calibrated box');
 f.hook.originalText={kind:'patch',resolve:()=>({status:'exact'})};f.hook.scriptAllowed=()=>true;assert.equal(f.hook.autoTranslateEmbed(),false,'the game draws translations only when its glyphs are known to cover them');
});

test('E414 real data: The House in Fata Morgana (multilingual KiriKiri) reads Japanese with the release\'s Chinese and its pages',t=>{
 const dir='E:\\GAL\\海市蜃楼之馆';if(!fs.existsSync(path.join(dir,'data_jp.xp3'))){t.skip('Fata Morgana not installed');return;}
 const sc=require('../services/original-engines/scenes.cjs');assert.equal(sc.detect(dir),'kirikiri-lang');
 const list=sc.read('kirikiri-lang',dir),lines=list.flatMap(x=>x.lines),zh=list.flatMap(x=>x.zh||[]);
 assert.ok(lines.length>40000);assert.ok(zh.filter(Boolean).length/lines.length>.95);
 const i=lines.indexOf('まるで屋敷全体を暗闇が包み込んでいるようだ。');assert.equal(zh[i],'如同整间屋子都在黑暗的怀抱中一般。');
 const P=sc.ENGINES['kirikiri-lang'].pages(dir);assert.ok(P.cont.has(i)&&P.starts.has(i-1));
 assert.equal(sc.ENGINES['kirikiri-ks'].eligible(dir),false,'not routed to the live capture');
});

test('E411 WoH flow page: the translation is indented only when its sentence starts a row with the paragraph indent',()=>{
 const view=read('web/reader/modules/island-page.js');
 assert.match(view,/const shown=r\.translation\?\(at\.col===0&&\/\^(\u3000|　)\/\.test\(String\(r\.source\|\|''\)\)\?/);
 assert.match(view,/r\.translation\.replace\(\/\^\[ (\u3000|　)\]\+\/,''\)/);
});

// E422 (user, WoH 1.3.8: the original still showed now and then, the layer still hid by itself, the drag frame flew away).
test('E422: lines a page shows together are hidden; only a held skip key or a run past the longest group passes through',()=>{
 const bridge=read('native/HookBridge.cs');
 assert.match(bridge,/bool quick=\(embedNow-LastEmbedAt\)\.TotalMilliseconds<250&&text!=LastEmbedText;BurstRun=quick\?BurstRun\+1:0;bool burst=quick&&\(SkipHeld\|\|BurstRun>=BurstSkipLines\);/);
 assert.match(bridge,/const int BurstSkipLines=8;/);assert.match(bridge,/type=="skipHeld"\)\{object hv;SkipHeld=/);
 assert.match(read('services/reader.cjs'),/this\.gal\?\.hooks\?\.skipHeld\?\.\(message\.skipHeld\)/);
});

test('E422: the skip key reaches the bridge once per change',t=>{
 const f=fixture(t);const sent=[];f.hook.process={stdin:{write(){},end(){}},kill(){},removeAllListeners(){}};f.hook.send=m=>sent.push(m);
 f.hook.skipHeld(true);f.hook.skipHeld(true);f.hook.skipHeld(false);
 assert.deepEqual(sent.filter(m=>m.type==='skipHeld'),[{type:'skipHeld',held:true},{type:'skipHeld',held:false}]);
});

test('E422 real data: no WoH group shown without a click is long enough to count as a skip',t=>{
 const dir='E:\\Steam\\steamapps\\common\\WITCH ON THE HOLY NIGHT';if(!fs.existsSync(dir)){t.skip('WoH not installed');return;}
 const h=require('../services/original-engines/hunex.cjs');let max=0;
 for(const f of fs.readdirSync(dir).filter(f=>/\.hfa$/i.test(f))){const l=h.hfaList(path.join(dir,f));if(!l)continue;for(const e of l){if(!/\.chs$/i.test(e.name))continue;
  const x=h.lenzu(h.hfaRead(path.join(dir,f),e)),n=x.length>>2,w=i=>x.readUInt32LE(i*4);let run=0;
  for(let i=0;i+15<n;i++){if(w(i)!==123||w(i+1)!==0x12345678)continue;const p=w(i+3)+0x30;if(p>=x.length)continue;const s=x.toString('utf8',p,Math.max(p,x.indexOf(0,p)));if(!/\$\d{6}/.test(s))continue;run+=(s.match(/\$\d{6}/g)||[]).length;if(w(i+5)!==0){max=Math.max(max,run);run=0;}}}}
 assert.ok(max>=2&&max<8,'longest group '+max+' must stay under the skip threshold');
});

test('E422: a scene hide before the first page line is lifted; a page game is known before any line',()=>{
 const {Immersion}=require('../core/immersion.cjs'),events=[];let now=5000;
 const im=new Immersion(e=>events.push(e.dialogVisible),()=>now);im.configure({immersion:true,dialogDetection:'marker'});im.bind('woh');
 im.scene(false);assert.equal(events.at(-1),false,'not known yet: hidden');
 im.source('　彼女の家は山の中腹にあった。','nvl');im.marker(true);now+=800;im.tick();assert.equal(events.at(-1),true,'the first page line lifts it');
 im.scene(false);now+=1000;im.tick();assert.equal(events.at(-1),true,'scene probes never hide a page');
 const ev2=[],im2=new Immersion(e=>ev2.push(e.dialogVisible),()=>now);im2.flowGame=()=>true;im2.configure({immersion:true,dialogDetection:'marker'});im2.bind('woh');
 im2.scene(false);im2.evidence(false,'visual');now+=1000;im2.tick();assert.ok(!ev2.includes(false),'known from the hook: never hidden by a probe');
});

test('E422: the drag frame goes around the page lines, not the 0x0 text window',()=>{
 const view=read('web/reader/modules/island-page.js');
 assert.match(view,/body\.tome-box-dragging \.sentence-window\.tome-island-page\{outline:none!important\}/);
 assert.match(view,/body\.tome-box-dragging \.sentence-window\.tome-island-page \.tome-island-pair:not\(\[hidden\]\)\{outline:2px dashed/);
});

test('E422: dragging over a page selects only inside the sentence it began in; the native selection never starts on a line',()=>{
 const sel=read('web/reader/modules/selection.js');
 assert.match(sel,/document\.addEventListener\('selectstart',e=>\{if\(e\.target\?\.closest\?\.\('\.sentence-text'\)/);
 assert.match(sel,/if\(!root\|\|!end\|\|!root\.contains\(end\)\)\{if\(down\.drag\?\.anchor\)/);
});
