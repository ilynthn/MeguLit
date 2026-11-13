const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const {ChoiceCapture}=require('../core/choice-capture.cjs');
test('E407 choices: two short lines from other streams become candidates; dialogue, names and noise do not',()=>{
 let t=1000;const c=new ChoiceCapture(()=>t);
 assert.deepStrictEqual(c.add('洋食を食べたい','想像するだに恐ろしい、やっぱり考えなおそう！','由良'),['洋食を食べたい']);
 assert.strictEqual(c.options(),null);
 c.add('和食を食べたい\n間をとって中華','想像するだに恐ろしい');
 assert.deepStrictEqual(c.options(),['洋食を食べたい','和食を食べたい','間をとって中華']);
 assert.deepStrictEqual(c.add('由良','x','由良'),[]);
 assert.deepStrictEqual(c.add('想像するだに恐ろしい','想像するだに恐ろしい'),[]);
 assert.deepStrictEqual(c.add('bg/forest01.png'),[]);
 t+=5000;c.add('はい');assert.strictEqual(c.options(),null,'old candidates expire');
 c.reset();assert.strictEqual(c.options(),null);
});
test('E407 choices: overlay ruby markup and box mapping',()=>{
 const o=require('../web/reader/modules/choice-overlay.js');
 assert.strictEqual(o.rubyHtml('洋食を食べたい',[{start:0,end:2,reading:'ようしょく'},{start:3,end:4,reading:'た'}]),'<ruby>洋食<rt>ようしょく</rt></ruby>を<ruby>食<rt>た</rt></ruby>べたい');
 assert.strictEqual(o.rubyHtml('<b>',[]),'&lt;b&gt;');
 const b=o.mapBox({x0:100,y0:200,x1:300,y1:240},1280,720,{clientX:0,clientY:0,clientWidth:2560,clientHeight:1440},2);
 assert.deepStrictEqual(b,{x:100,y:200,width:200,height:40});
});
test('E407 choices: read-only capture wired end to end, never written back',()=>{
 const bridge=read('native/HookBridge.cs');assert.match(bridge,/type="hookAuxText"/);assert.match(bridge,/aux\.role!=2/);
 assert.match(read('native/PageLocator.cs'),/public void RequestChoices/);assert.match(read('native/GalWindowBridge.cs'),/type=="choiceLocate"/);
 const hook=read('core/hook-native.cjs');assert.match(hook,/m\.type==='hookAuxText'/);assert.match(hook,/clearChoices\('new dialogue line',400,text\)/);assert.match(hook,/'choice ocr '/);
 assert.match(read('core/gal-native.cjs'),/message\.type==='hookChoiceBoxes'/);
 assert.ok(JSON.parse(read('web/reader/modules.json')).includes('choice-overlay'));assert.match(read('web/reader/module-list.js'),/"choice-overlay"/);
 assert.match(read('services/reader.cjs'),/case 'layoutDiagnostic'/);
 const policy=read('native/EmbedTextPolicy.cs');assert.match(policy,/Writable\(int role\) \{ return role == 0 \|\| role == 1; \}/);
});
test('E407 choices: the overlay never covers the game text (no backing, invisible Japanese copy, ruby and translation only)',()=>{
 const src=read('web/reader/modules/choice-overlay.js');
 assert.doesNotMatch(src,/megulit-choice-mask/);
 assert.match(src,/\.megulit-choice-jp\{[^}]*color:transparent/);
 for(const rule of src.match(/'\.megulit-choice[^']*\{[^}]*\}'/g)||[])assert.doesNotMatch(rule,/background:(?!none)/,rule);
 assert.match(read('web/reader/modules/interaction.js'),/\.megulit-choice,\.megulit-choice-cn'/);
});
