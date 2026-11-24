// SPDX-License-Identifier: GPL-3.0-or-later
// Case of validation/games-regression.test.cjs (ctx.profile = this game's layered profile).
// 2026-11-21 ファタモルガーナの館 (KiriKiri2, owner's run 22:51:03Z-22:53:42Z in E:\MeguLit-Test-1421\logs, hook-events.log and
// hook-diagnostics-20261120-225350-542.log). The game fades each line in with a shuffled per-character effect drawn by
// tTVPNativeBaseBitmap::DrawText (「そしそて魂しそはて砕魂…」); its KAG message layer page lines and the KiriKiri2 hook (the line in pieces
// cut at its waits: 「が……」「たのだ。」) did not line up, and core logged 20 「krkr page: hook line drawn nowhere on the page, dropped」.
// The texts, their order and their times below are the log's; page lines are where the log placed them (「placement placed: line N, K
// characters」). Every story line must reach the reader once, the choice 「……おはよう………………」 must survive the choice filter, and core
// must count this game's lines as broken by the effect (read mode) while a game with clean lines is never switched.
const assert=require('node:assert/strict'),{mock}=require('node:test');
const {HookNative}=require('../../../../core/hook-native.cjs');
const Profiles=require('../../../../core/profiles/index.cjs');
let PROFILE=null;
const CASES=[];const test=(name,fn)=>CASES.push([name,fn]);
const DRAW='tTVPNativeBaseBitmap::DrawText';
function fixture(t){let now=100000;const events=[],traces=[],located=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>now);hook.trace=s=>traces.push(s);hook.locateChoices=o=>located.push(o);if(PROFILE)hook.setProfile(PROFILE);t.after(()=>hook.stop());
 const box={x0:56,y0:459,x1:748,y1:459,size:22,sw:804,sh:604,count:0};
 const at=ms=>{while(ms>now){const step=Math.min(50,ms-now);now+=step;mock.timers.tick(step);}};
 return {hook,events,traces,located,at,
  hookLine(ms,text,sourceName='KiriKiri2'){at(ms);hook.source({text,sourceName,origin:'live'},'');},
  aux(ms,text,sourceName=DRAW){at(ms);hook.auxText({text,sourceName,role:0});},
  begin(ms,line){at(ms);hook.pageLine({type:'hookEngineLine',engine:'krkr',phase:'begin',line,same:false,nvl:true,...box,text:''});},
  end(ms,line,text){at(ms);hook.pageLine({type:'hookEngineLine',engine:'krkr',phase:'end',line,same:false,nvl:true,...box,count:[...text].length,text});},
  clear(ms,line){at(ms);hook.charRects(`ToMe_CHARS engine=krkr line=${line} hidden=0 sw=800 sh=600 vx=0 vy=0 vw=0 vh=0 n=0 rects= text=`);},
  sources:()=>events.filter(m=>typeof m.hookSource==='string'&&m.hookSource).map(m=>m.hookSource)};}
const S=s=>{const [m,r]=s.split(':');return 100000+(Number(m)*60+Number(r))*1000;};/* 22:5m:ss.sss -> fixture ms */

/* 22:51:40-22:51:53 the prologue: page lines 5-8 drew each sentence, the DrawText effect frames of it around them */
function prologue(f){
 const L=[['1:40.966','その瞬間、私は死体を見下ろしていた。',null],['1:44.880','……自分の死体だ。','1:45.226 ………自分……の自死……体…自だ…。自体だ分の死。体だ分の死。分体の死だ。体だ分の死。'],
  ['1:46.753','磔の場へと引きずられるその姿に……',null],['1:48.361','深い絶望を抱き……','1:48.716 深い深絶望い深を絶抱望い深き深絶…いを望抱…絶きを望…抱…きを望…抱…きを…抱…き……'],
  ['1:49.370','そして魂は砕け……','1:49.728 そしそて魂しそはて砕魂しそけそはて…し魂砕…てはけ魂…砕は…け魂…砕は…け…砕…け……'],['1:50.380','私のすべては、消滅した。',null],
  ['1:51.474','そう、一度はすべてを失った。',null],['1:52.418','……けれど……','1:52.777 ………けれ……どけ…れ…………どけ…れ…どけ……れ…どけ……れど………']];
 L.forEach(([ms,text,frame],i)=>{f.begin(S(ms)-200,i+1);f.end(S(ms),i+1,text);if(frame){const [fm,...ft]=frame.split(' ');f.aux(S(fm),ft.join(' '));}});
}
/* 22:51:53-22:52:04 the KiriKiri2 stream, selected: one line whole, then lines in pieces at their waits; page lines 9-12 */
function kirikiri2(f){
 f.begin(S('1:53.300'),9);f.hookLine(S('1:53.470'),'……とこしえの闇に溶けゆく中……');f.end(S('1:53.489'),9,'……とこしえの闇に溶けゆく中……');
 f.begin(S('1:55.129'),10);f.aux(S('1:55.272'),'を私呼ぶを私声呼ぶがを私…私声呼…をぶ');f.hookLine(S('1:55.268'),'が……');f.end(S('1:55.380'),10,'私を呼ぶ声が……届いたのだ。');
 f.hookLine(S('1:55.393'),'たのだ。');f.aux(S('1:55.409'),'が届呼声…いぶ…が声た声届…のがい…だ…届た。…いの');f.aux(S('1:55.580'),'届だたい。の届だたい。のだた。のだ。');
 f.begin(S('1:57.900'),11);f.hookLine(S('1:57.936'),'…');f.hookLine(S('1:58.073'),'…だから……');f.end(S('1:58.044'),11,'……だから……');f.aux(S('1:58.246'),'……だか……らだ…か…………らだか……らだ…か……らだ…か…ら………');
 /* page line 12 drew the effect frame (the reader's own pairing missed it): the hook line is its text */
 f.begin(S('2:01.900'),12);f.hookLine(S('2:02.010'),'もう一度、誓った。');f.end(S('2:02.036'),12,'もうも一度うも、一誓度うもっも、一たう誓度。一、っ誓度た、。っ誓度た、。っ誓た。った。');
 f.at(S('2:06.000'));
}

test('ファタ 22:51:40-22:52:06: every line reaches the reader once, effect frames and pieces never',t=>{
 const f=fixture(t);prologue(f);kirikiri2(f);
 const got=f.sources().map(HookNative.flat);
 const want=['その瞬間、私は死体を見下ろしていた。','……自分の死体だ。','磔の場へと引きずられるその姿に……','深い絶望を抱き……','そして魂は砕け……','私のすべては、消滅した。','そう、一度はすべてを失った。','……けれど……','……とこしえの闇に溶けゆく中……','私を呼ぶ声が……届いたのだ。','……だから……','もう一度、誓った。'];
 for(const w of want)assert.equal(got.filter(g=>g===w).length,1,w+' once in '+JSON.stringify(got));
 assert.ok(!got.some(g=>['が……','たのだ。','…','…だから……'].includes(g)),'no piece of a line is a line: '+JSON.stringify(got));
 assert.ok(!got.some(g=>HookNative.interleaved(g)),'no effect frame is a line');
 assert.equal(f.traces.filter(s=>/dropped/.test(s)).length,0,'nothing dropped');
 /* 2026-11-21 the self-check gate on the same traces: drop rate 0 */
 {const {SelfCheck}=require('../../../../core/self-check.cjs');const sc=new SelfCheck();for(const s of f.traces)sc.trace(s);assert.equal(sc.score().metrics.dropRate??0,0);}
});

test('ファタ 22:51:55: a page line takes the held hook line its drawn text shows, not the oldest one',t=>{
 const f=fixture(t);prologue(f);
 /* the oldest held line is a late copy of the line before; page line 9 draws the next one */
 f.hookLine(S('1:53.000'),'……けれど……');f.hookLine(S('1:53.100'),'……とこしえの闇に溶けゆく中……');f.begin(S('1:53.200'),9);f.end(S('1:53.400'),9,'……とこしえの闇に溶けゆく中……');f.at(S('1:56.000'));
 const got=f.sources().map(HookNative.flat);
 assert.equal(got.filter(g=>g==='……けれど……').length,1,'the line before is not read twice: '+JSON.stringify(got));
 assert.equal(got[got.length-1],'……とこしえの闇に溶けゆく中……');
});

test('ファタ: a hook line no page line draws (its own layer) is delivered from the hook text; a page dump of read lines goes quietly',t=>{
 const f=fixture(t);prologue(f);
 f.hookLine(S('2:26.115'),'…待っていて欲しい…');f.at(S('2:28.000'));
 /* 22:52:22 KiriKiri1 dumped the page so far (216 characters) */
 f.hookLine(S('2:28.100'),'その瞬間、私は死体を見下ろしていた。……自分の死体だ。磔の場へと引きずられるその姿に……深い絶望を抱き……そして魂は砕け……私のすべては、消滅した。そう、一度はすべてを失った。','KiriKiri1');f.at(S('2:30.000'));
 const got=f.sources().map(HookNative.flat);
 assert.equal(got.filter(g=>g==='…待っていて欲しい…').length,1,JSON.stringify(got));
 assert.ok(!got.some(g=>g.length>60),'the page dump is not read again');
 assert.ok(f.traces.some(s=>/drawn off the page layer, delivered from the hook text/.test(s)));
 assert.ok(f.traces.some(s=>/hook (line already read|redraw with the drawn line at its end), skipped/.test(s)));
 /* 2026-11-21 the self-check gate (core/self-check.cjs) counts the delivered line as redrawn and the read dump as nothing: no drop */
 {const {SelfCheck}=require('../../../../core/self-check.cjs');const sc=new SelfCheck();for(const s of f.traces)sc.trace(s);const r=sc.score();assert.equal(r.drops,0,'no drop: '+JSON.stringify(r));assert.ok(r.redrawn>=1,'the delivered line is a redraw');}
});

test('Fata: redraws with unseen earlier text cannot replace the drawn dialogue, and hook-only short lines survive',t=>{
 const f=fixture(t);
 const first='「あなた」を待つ人がいます。',second='鍵のかかった扉を開けるには、もう少し時間がかかります。';
 const aside='（……旦那さま……）',another='（……まだ、いますか……）';
 const redraw='……。（なんて……、静かな部屋だろう……）（……外は暗い……）'+second;
 f.begin(100100,1);f.hookLine(100250,'「あなた死者」を待つ人がいます。');f.end(100400,1,first);
 f.hookLine(100900,aside);f.at(102700);
 f.begin(103000,2);f.hookLine(103030,redraw);f.end(103100,2,second);
 f.hookLine(103200,redraw.replace(second,second.replace('時間','時\n間')));
 f.at(105100);
 f.hookLine(105400,another+'（……ここにいます……）');f.at(107200);
 f.hookLine(107500,'「あなた死者」の声がする。');f.at(109300);
 assert.deepEqual(f.sources(),[first,aside,second,another,'（……ここにいます……）','「あなた」の声がする。']);
 assert.ok(f.traces.some(s=>/hook redraw with the drawn line at its end/.test(s)),JSON.stringify(f.traces));
});

test('Fata: a late redraw cannot replace the current line, and the next scripted aside survives in the auxiliary stream',t=>{
 const f=fixture(t),{Matcher}=require('../../../../services/original-text.cjs');
 const previous='黙ったまま、彼はゆっくりうなずいた。',aside='……わかった……。',next='では参りましょう。',rows=[previous,aside,next];
 const m=new Matcher(rows,rows);f.hook.originalText={pageParts:s=>m.pageParts(s),pageNext:(a,b)=>m.pageNext(a,b)};
 f.begin(100100,101);f.end(100180,101,previous);
 f.hookLine(100200,previous);f.clear(101400,101);
 f.aux(101455,'……ちがう……。','KiriKiri4');
 f.aux(101460,aside,'KiriKiri4');f.aux(101463,aside,'KiriKiri4');
 f.begin(101600,102);
 f.begin(101700,103);f.end(101770,103,next);
 f.end(101780,102,'');
 f.begin(101800,104);f.hookLine(101820,previous);f.end(101840,104,'');
 assert.deepEqual(f.sources(),[previous,aside,next]);
 assert.equal(f.hook.lastSource,next);
 f.begin(102000,105);f.end(102060,105,previous);f.end(102100,105,previous);
 assert.deepEqual(f.sources(),[previous,aside,next,previous]);
 assert.ok(f.traces.some(s=>s.includes('next script aside recovered')));
 assert.ok(f.traces.some(s=>s.includes('unconfirmed hook text ignored')));
});

test('Fata: a late draw cannot publish a queued packet, while the script recovers the individual rows in order',t=>{
 const f=fixture(t),{Matcher}=require('../../../../services/original-text.cjs');
 const previous='扉がゆっくりと開いた。',pause='…………。',short='（……まだ寒い……）',next='では、ここでお待ちください。';
 const rows=[previous,pause,short,pause,next],m=new Matcher(rows,rows),packet=rows.slice(1,4).join('');
 f.hook.originalText={pageParts:s=>m.pageParts(s),pageBetween:(a,b,c)=>m.pageBetween(a,b,c)};
 f.begin(100100,80);f.end(100200,80,previous);f.clear(101000,80);
 f.begin(101010,81);f.hookLine(101070,packet);f.hookLine(101080,packet);
 f.begin(101270,82);f.end(101300,82,next);f.end(101310,81,'');
 f.hookLine(101330,packet);f.at(103100);
 assert.deepEqual(f.sources(),rows);
 assert.equal(f.hook.lastSource,next);
 assert.ok(f.traces.some(s=>s.includes('recovered 3 script row(s)')));
 const unconfirmed=fixture(t);unconfirmed.begin(110000,1);unconfirmed.hookLine(110010,short);unconfirmed.end(110050,1,'');
 assert.deepEqual(unconfirmed.sources(),[]);
 unconfirmed.at(111800);assert.deepEqual(unconfirmed.sources(),[short]);
});

test('Fata: authored suffixes, fragments, and emphatic repetition pass both source and reader filters',t=>{
 const f=fixture(t),{Matcher}=require('../../../../services/original-text.cjs');
 const tail='扉の向こうには静かな部屋があります。',whole='いま見えました。'+tail,short='静かな部屋',cry='なああァァァぁぁああ、分からんのだろうゥゥゥ！！？',repeat='変よ！　すごく変！';
 const rows=[tail,whole,short,cry,repeat];const m=new Matcher(rows,rows);
 f.hook.originalText={pageParts:s=>m.pageParts(s)};
 f.begin(100100,1);f.end(100300,1,tail);
 f.hookLine(100500,whole);f.at(102100);
 f.hookLine(102300,short);f.at(103900);
 f.hookLine(104100,cry);f.at(105700);
 f.hookLine(105900,repeat);f.at(107500);
 f.begin(108000,2);f.end(108090,2,cry);
 assert.deepEqual(f.sources(),[tail,whole,short,cry,repeat,cry]);
});

test('Fata: the script can divide a hook-only packet without moving the translation cursor or skipping its first short line',t=>{
 const f=fixture(t),{Matcher}=require('../../../../services/original-text.cjs');
 const base='窓辺に明かりが残っている。',a='もう夜です。',b='お静かに。',rows=[base,a,b];
 const matcher=new Matcher(rows,rows);
 f.hook.originalText={kind:'patch',resolve:text=>matcher.match(text),pageParts:text=>matcher.pageParts(text),save:()=>matcher.save(),load:v=>matcher.load(v),position:()=>matcher.last};
 f.begin(100100,1);f.end(100300,1,base);
 const before=matcher.last;
 assert.deepEqual(matcher.pageParts(a+b),[a,b]);assert.equal(matcher.last,before);
 f.hookLine(100500,a+b);f.at(102400);
 assert.deepEqual(f.sources(),[base,a,b]);
});

test('ファタ 22:52:51-22:52:54: the option 「……おはよう………………」 survives the choice filter, the screen label does not; its hook line is left to the choice layer',t=>{
 const f=fixture(t);prologue(f);f.at(S('2:51.000'));
 assert.equal(HookNative.interleaved('……おはよう………………'),false,'ellipses are no effect frame');
 assert.equal(HookNative.interleaved('……おはよう……………おはよう……………'),true,'the effect frame of it is');
 assert.deepEqual(f.hook.choiceFilter(['選択肢','……おはよう………………','…………']),['……おはよう………………','…………']);
 f.aux(S('2:51.584'),'選択肢','Krkr2wcs');f.aux(S('2:52.629'),'……おはよう……………おはよう……………');
 f.hookLine(S('2:52.634'),'選択肢選択肢……おはよう………………','Krkr2wcs');f.aux(S('2:52.636'),'……おはよう………………','KiriKiri4');
 f.at(S('2:55.000'));
 const got=f.sources();
 assert.ok(!got.some(g=>/おはよう/.test(g)),'the choice screen is not read as a dialogue line (that cleared the choice layer): '+JSON.stringify(got));
 assert.ok(f.traces.some(s=>/left to the choice layer/.test(s)),JSON.stringify(f.traces.slice(-8)));
 assert.equal(f.traces.filter(s=>/dropped/.test(s)).length,0);
});

/* incr11 (owner, 2026-11-20 23:33:41Z, hook-diagnostics-20261120-232903-812.log): the option came on the selected dialogue stream (KiriKiri4)
   while the side streams carried the music title and the screen's labels. The game now draws the link text itself (script.inc keeps link
   text visible); OCR finds the option, the other candidate is only an ellipsis row: the choice layer shows the one option */
test('ファタ incr11 23:33:41: labels and the music title are no options; the option OCR finds is shown, never read as a line',t=>{
 const f=fixture(t);prologue(f);f.at(S('3:40.000'));
 f.aux(S('3:41.210'),'女中のテーマピアノソロ','Krkr2wcs');f.begin(S('3:41.400'),44);f.hookLine(S('3:41.451'),'おはようございます、旦那さま……。','KiriKiri4');f.end(S('3:41.900'),44,'おはようございます、旦那さま……。');
 f.aux(S('3:41.465'),'…………。　　　おはようございます、旦那さま……。');f.aux(S('3:41.466'),'おはようございます、旦那さま……。','KiriKiri2');
 f.aux(S('3:41.511'),'選択肢選択肢選択肢……おはよう………………','Krkr2wcs');f.aux(S('3:41.512'),'……おはよう………………');
 f.hookLine(S('3:41.513'),'……おはよう………………','KiriKiri4');f.aux(S('3:41.709'),'選択ライン選択ライン','Krkr2wcs');
 f.at(S('3:42.400'));
 const asked=f.located[f.located.length-1]||[];
 assert.ok(asked.includes('……おはよう………………'),'the option is located: '+JSON.stringify(f.located)+JSON.stringify(f.traces.filter(s=>/choice/.test(s)).slice(-8)));
 assert.ok(!asked.some(o=>/テーマ|選択/.test(o)),'no label or music title: '+JSON.stringify(asked));
 f.hook.choiceBoxes({type:'hookChoiceBoxes',status:'found',sw:804,sh:604,items:[{text:'……おはよう………………',x0:300,y0:262,x1:520,y1:290}],missed:asked.filter(o=>o!=='……おはよう………………'),rows:['……おはよう……']});
 const shown=f.events.filter(m=>m&&m.hookChoices).pop();
 assert.ok(shown&&shown.hookChoices.items.length===1&&shown.hookChoices.items[0].text==='……おはよう………………','the choice layer shows the option: '+JSON.stringify(asked)+JSON.stringify(f.traces.filter(s=>/choice/.test(s)).slice(-6)));
 f.at(S('3:46.000'));
 assert.ok(!f.sources().some(g=>/おはよう………/.test(g)),'the option is not read as a dialogue line: '+JSON.stringify(f.sources().slice(-3)));
 assert.ok(!f.events.slice(f.events.indexOf(shown)+1).some(m=>m&&m.hookChoices===null),'the choice stays up');
});

/* test pack v2 02:45Z: the Fata seed (owner-ok, hide) turns the judge off: no verdict, the hide stays; the judge itself, on, still
   counts ファタ's broken lines once */
test('core read-mode judge: off in the Fata seed; on, ファタ\'s lines broken by the effect switch once',t=>{
 {const f=fixture(t);prologue(f);kirikiri2(f);assert.equal(f.events.filter(m=>m.type==='hookTextEffects').length,0,'the seed keeps hide mode');}
 const save=PROFILE;PROFILE={...PROFILE,safeMode:{...PROFILE.safeMode,effectJudge:true}};try{
  const f=fixture(t);prologue(f);kirikiri2(f);
  const fx=f.events.filter(m=>m.type==='hookTextEffects');
  assert.equal(fx.length,1,JSON.stringify(f.traces.filter(s=>/text effects/.test(s))));
  assert.ok(fx[0].orphan/(fx[0].orphan+fx[0].paired)>.3);}finally{PROFILE=save;}
});

test('core read-mode judge: clean lines (千恋＊万花 22:53:50Z on: ADV lines, side streams only carry the name plate) never switch',t=>{
 const g=fixture(t);
 const lines=['「おはようございます」','今日も朝から暑い。','穂織の町は山に囲まれている。','「将臣、起きてるか？」','祖父の声が聞こえた。','俺は布団から起き上がる。','窓の外では蝉が鳴いていた。','「今行くよ」'];
 lines.forEach((l,i)=>{g.aux(200000+i*3000,'【 将臣 】','KiriKiriZ');g.hookLine(200100+i*3000,l,'KiriKiriZ');});
 g.at(240000);
 assert.equal(g.events.filter(m=>m.type==='hookTextEffects').length,0,JSON.stringify(g.traces.filter(s=>/text effects/.test(s))));
});

/* the kernel (every other game, 千恋＊万花 among them) keeps its behaviour: a held hook line no page line takes is dropped as before */
test('kernel profile: unchanged, the held line is dropped and the judge is off',t=>{
 const save=PROFILE;PROFILE=Profiles.profileFor({});try{const f=fixture(t);prologue(f);f.hookLine(S('2:26.115'),'…待っていて欲しい…');f.at(S('2:30.000'));
  assert.ok(!f.sources().map(HookNative.flat).includes('…待っていて欲しい…'));assert.ok(f.traces.some(s=>/drawn nowhere on the page, dropped/.test(s)));
  assert.equal(f.events.filter(m=>m.type==='hookTextEffects').length,0);assert.equal(HookNative.interleaved('……おはよう………………',false),true,'kernel counting unchanged');}finally{PROFILE=save;}
});
module.exports=async({profile})=>{PROFILE=profile;
 for(const [name,fn] of CASES){mock.timers.enable({apis:['setTimeout']});const after=[];try{fn({after:f=>after.push(f)});}catch(e){e.message=name+': '+e.message;throw e;}finally{for(const f of after)try{f();}catch{}mock.timers.reset();}}};
