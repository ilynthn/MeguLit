// 2026-11-15 (死に逝く君、館に芽吹く憎悪, KiriKiri, 1.4.10): lines were read twice. Replay of the live hook log:
// Krkr2wcs draws many lines twice in one frame (「X　X　」), repeat-normalizer collapsed some of them first, so DoubleLine lost its
// "this stream draws twice" evidence and 「そこには普段と変わらない日常の姿があった。」 was shown and translated twice; the side stream's
// doubled frame reached the art path before the dialogue line; tTVPNativeBaseBitmap::DrawText's typewriter dump
// (「公公園公園で公園での…」) became a choice.
const hookBridgeChild=require('./helpers/hook-bridge-child.cjs');
const test=require('node:test'),assert=require('node:assert');
const {HookNative}=require('../core/hook-native.cjs');
const {DoubleLine}=require('../core/double-line.cjs');
const {ChoiceCapture}=require('../core/choice-capture.cjs');
const {typedOut}=require('../core/language-tracks.cjs');
const twice=s=>s+'　'+s+'　';

function fixture(t){
 let now=1e6;const art=[];
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},()=>{},()=>{},()=>now);hook.trace=()=>{};t.after(()=>hook.stop());
 hook.artLocate=text=>art.push(text);hook.process=hookBridgeChild();
 const line=text=>{hook.source({text,sourceName:'Krkr2wcs',sourceCode:'EXHQXN8@17527C:bug02_yakata.exe',origin:'live'},'');now+=1500;return String(hook.lastSource||'').trim();};
 return {hook,art,line,tick:ms=>{now+=ms;}};
}

test('a stream that draws lines twice keeps its evidence after repeat-normalizer collapsed some lines itself',t=>{
 const f=fixture(t);
 f.line(twice('　特に何かの説明があったわけでもなく、それは起こった。'));
 assert.equal(f.line(twice('『彼ら』は突然現れて、世界を蹂躙し始めた。')),'『彼ら』は突然現れて、世界を蹂躙し始めた。');
 for(const s of ['窃盗。','器物破損。','強姦。'])f.line(twice(s));
 assert.equal(f.line('そして――殺人――――。'),'そして――殺人――――。','a line with its own repeated dashes is kept as it is');
 f.line('人間の側の法律を当てはめれば、ほとんどの罪に該当するだろう。');
 f.line(twice('当時、街には多くの人々が溢れていた。'));
 f.line('デパートで買い物をしたり、レストランで食事をしたり、公園でのんびりと過ごしたり……。');
 assert.equal(f.line(twice('そこには普段と変わらない日常の姿があった。')),'そこには普段と変わらない日常の姿があった。');
 assert.equal(f.line(twice('きっと今日も平和な一日。')),'きっと今日も平和な一日。');
});

test('a line said twice from a stream that never drew twice stays (E408)',()=>{
 const d=new DoubleLine(()=>0);
 for(const s of ['今日は晴れ。','明日も晴れ。','その次も晴れ。'])d.fix('s',s,'',s);
 assert.equal(d.fix('s','はい。はい。','x').text,'はい。はい。');
 /* the evidence is taken from the frame as drawn, before another normalizer collapsed it */
 const e=new DoubleLine(()=>0);e.fix('k','窃盗。','',twice('窃盗。'));
 assert.equal(e.fix('k','そうだ。そうだ。','x').text,'そうだ。');
});

test("the side stream's doubled frame of the coming line is not art text",async t=>{
 const f=fixture(t);f.line('デパートで買い物をしたり、レストランで食事をしたり。');
 const text=twice('きっと今日も平和な一日。');
 f.hook.auxText({text,sourceName:'KiriKiri2',role:0});
 f.line(text);
 await new Promise(r=>setTimeout(r,250));
 assert.deepEqual(f.art,[]);
});

test('typewriter dumps (growing prefixes glued) are no choice and no art text',async t=>{
 const dumps=['公公園公園で公園での公園でのん','公公公園公園公園で公園で公園での公園での公園でのん公園でのん','窃窃窃窃窃窃盗盗窃窃盗盗。。窃窃盗盗。。','強強強強強姦強姦強姦。強姦。強姦。強姦。'];
 for(const s of dumps)assert.equal(typedOut(s),true,s);
 for(const s of ['そして――殺人――――。','わ、わた、わたし','ままま待って','さささささ寒い','なななななんで','ああああああああ！','ドキドキドキドキ','はいはいはい',twice('そこには普段と変わらない日常の姿があった。'),'上書きで何か吹き込む'])assert.equal(typedOut(s),false,s);
 const c=new ChoiceCapture(()=>0);for(const s of dumps)assert.deepEqual(c.add(s,'デパートで買い物をしたり。'),[],s);
 assert.equal(c.options(),null);
 const f=fixture(t);f.line('デパートで買い物をしたり。');
 for(const s of dumps)f.hook.auxText({text:s,sourceName:'tTVPNativeBaseBitmap::DrawText',role:0});
 await new Promise(r=>setTimeout(r,250));
 assert.deepEqual(f.art,[]);
});

test('real choices still pass',()=>{
 const c=new ChoiceCapture(()=>0);c.add('館を探索する\n部屋に戻る','前の台詞。');
 assert.deepEqual(c.options(),['館を探索する','部屋に戻る']);
});

/* #1118 (owner 2026-11-24 06:16:28, hook-events.log): on every line of 血塗れの男 the side streams hand over the name plate and the coming line
   doubled with one ellipsis (「…」) 4 ms before the dialogue stream's line (「……」). The doubled copy was kept as a candidate, located
   with the name plate (choice locate options=["血塗れの男","「しかも、…何年振りか…」","男男"]), OCR found both and the game's own line got
   the choice overlay's ruby and translation. */
test('the side stream copy of the coming line (other ellipsis count) and its name plate are no choice',async t=>{
 const f=fixture(t),asked=[];f.hook.locateChoices=o=>asked.push(o);
 f.line('「餌風情が、私の食事の邪魔をするとは……」');
 const aux=(text,sourceName)=>f.hook.auxText({text,sourceName,role:0});
 aux('血塗れの男','tTVPNativeBaseBitmap::DrawText');aux('血塗れの男','KiriKiri1');aux('血塗れの男血塗れの男','KiriKiri1');
 aux(twice('「しかも、肉体を傷付けられるなど何年振りか…」'),'KiriKiri2');f.tick(4);
 f.hook.source({text:'「しかも、肉体を傷付けられるなど何年振りか……」',sourceName:'Krkr2wcs',sourceCode:'EXHQXN8@17527C:bug02_yakata.exe',origin:'live'},'');f.tick(16);
 aux('男男','KiriKiri2');
 await new Promise(r=>setTimeout(r,1100));
 assert.ok(asked.every(o=>!o.some(x=>/肉体を傷付け/.test(x))),'the line itself never goes to OCR as an option: '+JSON.stringify(asked));
 assert.deepEqual(asked,[],'nothing left that looks like a choice screen');
});

test('ChoiceCapture: a candidate that is the new line with other punctuation goes with the line, a real option stays',()=>{
 let now=0;const c=new ChoiceCapture(()=>now);
 c.add('館を探索する\n部屋に戻る','前の台詞。');c.add('「しかも、何年振りか…」','前の台詞。');
 c.noteDialogue('「しかも、何年振りか……」','');c.reset(400,'「しかも、何年振りか……」');
 assert.deepEqual(c.options(),['館を探索する','部屋に戻る']);
 const d=new ChoiceCapture(()=>now);d.add('血塗れの男','前。');d.add('男男','前。');d.noteDialogue('「まあ……」','血塗れの男');d.reset(400,'「まあ……」');
 assert.equal(d.options(),null,'the name plate of the line is not kept as an option');
});
/* Codex #1198: two equal glyphs are dropped only as the tail of a name plate drawn glyph by glyph, never next to a real option */
test('ChoiceCapture: 「いい」 beside an option ending in い stays a choice; 「男男」 beside a name plate goes',()=>{
 let now=0;const c=new ChoiceCapture(()=>now);c.add('いい\nよくない','どう思う？');
 assert.deepEqual(c.options(),['いい','よくない']);
 const e=new ChoiceCapture(()=>now);e.add('いい\nよくない\nわからない','どう思う？');
 assert.deepEqual(e.options(),['いい','よくない','わからない']);
 const d=new ChoiceCapture(()=>now);d.add('血塗れの男','前。');d.add('血塗れの男血塗れの男','前。');d.add('男男','前。');d.add('館を出る','前。');
 assert.ok(!(d.options()||[]).includes('男男'),'the doubled last glyph of a text this stream draws twice is no option');
});
/* integration live test 2026-11-26 (死に逝く君, every line of 美亜): 「美亜」「亜亜」「美亜美亜」 in one burst went to OCR as two options and both were found */
test('ChoiceCapture: the doubled last glyph of a two-glyph name plate drawn twice is no option either',()=>{
 let now=0;const c=new ChoiceCapture(()=>now);c.add('美亜','前。');c.add('亜亜','前。');c.add('美亜美亜','前。');
 assert.equal(c.options(),null);
 const d=new ChoiceCapture(()=>now);d.add('ああ\nいああ','前。');assert.deepEqual(d.options(),['ああ','いああ'],'no drawn-twice frame: both stay');
});
