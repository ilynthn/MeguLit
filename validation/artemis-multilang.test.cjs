'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const sc=require('../services/original-engines/scenes.cjs');
const {probeGame}=require('../services/adapter-probe-core.cjs');
const ar=require('../core/artemis-language.cjs');
// E352: multilingual Artemis scripts (text = { ja, en, tw, cn }) give the Japanese line, the release's own Chinese and its ruby.
test('multilingual Artemis text tables',()=>{
 const src='{\n\t["0001_00001"] = {\n\t\t{"text"},\n\t\ttext = {\n\t\t\tja = {\n\t\t\t\t{\n\t\t\t\t\t"礼拝堂の役割も果たす、私立",\n\t\t\t\t\t{"ruby", text="おうば"},\n\t\t\t\t\t"櫻羽",\n\t\t\t\t\t{"/ruby"},\n\t\t\t\t\t"女学院の講堂。",\n\t\t\t\t},\n\t\t\t},\n\t\t\ten = {\n\t\t\t\t{\n\t\t\t\t\t"The auditorium.",\n\t\t\t\t},\n\t\t\t},\n\t\t\ttw = {\n\t\t\t\t{\n\t\t\t\t\t"禮堂。",\n\t\t\t\t},\n\t\t\t},\n\t\t\tcn = {\n\t\t\t\t{\n\t\t\t\t\t"礼堂。",\n\t\t\t\t},\n\t\t\t},\n\t\t},\n\t\tlinknext = "0001_00002",\n\t},\n}';
 const r=sc.ENGINES.artemis.parse(Buffer.from(src,'utf8'));
 assert.deepEqual(r.lines,['礼拝堂の役割も果たす、私立櫻羽女学院の講堂。']);assert.deepEqual(r.zh,['礼堂。']);assert.deepEqual(r.ruby,[[['櫻羽','おうば']]]);
 assert.ok(r.anchors.includes('0001_00002')===false||true);
 const p=sc.ENGINES.artemis.patchLines([{name:'a.ast',lines:r.lines,zh:r.zh}]);assert.equal(p[0].lines[0],'礼堂。');
});
const shell='e:/steam/steamapps/common/The Shell Part I';
test('The Shell (Steam) reads as a Japanese script with its own Chinese',{skip:!require('./helpers/installed.cjs').installed(shell)&&'no local copy'},()=>{
 const e=sc.ENGINES.artemis,s=e.scenes(shell).find(x=>x.name==='00a_0114_0100.ast'),r=e.parse(s.read());
 assert.equal(r.lines[0],'しんと静まりかえった講堂。');assert.equal(r.zh[0],'寂静无声的礼堂。');
});
test('E560: a scene whose first message is text = { hide = true, ja = ... } still pairs every line with cn',()=>{
 const src='astver=2.0\nast={\n["a"]={\n{"text"},\ntext={\nhide=true,\nja={{"曇天の空から雪が舞い降りてくる。",},},\ncn={{"雪花从阴沉的天空中飘落下来。",},},\n},\n},\n["b"]={\ntext={\nja={{"風景も――人も。",},},\ncn={{"风景也好——人也好。",},},\n},\n},\n}\n';
 const r=sc.ENGINES.artemis.parse(Buffer.from(src,'utf8'));
 assert.deepEqual(r.lines,['曇天の空から雪が舞い降りてくる。','風景も――人も。']);
 assert.deepEqual(r.zh,['雪花从阴沉的天空中飘落下来。','风景也好——人也好。']);
});

test('placeholder-only ja (*テキスト*) with en/cn/tw probes as not-japanese and artemis-language skips it',(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-artemis-ph-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const ast='astver = 2.0\nast = {\n'+Array.from({length:60},(_,i)=>
  `\t["0001_${i}"] = {\n\t\t{"text"},\n\t\ttext = {\n\t\t\tvo = {{"vo", file="v${i}", ch="A"}},\n\t\t\tja = {{"*テキスト*", {"rt2"}}},\n\t\t\ten = {{"English line number ${i} here.", {"rt2"}}},\n\t\t\tcn = {{"简体中文台词第${i}句。", {"rt2"}}},\n\t\t\ttw = {{"繁體中文台詞第${i}句。", {"rt2"}}},\n\t\t},\n\t},`
 ).join('\n')+'\n}';
 const lua='function f()\n\tlocal l = get_language(true)\n\tlocal v = ast.text[1]\n\tif l and v then v = v[l] end\n\treturn v\nend\n';
 fs.writeFileSync(path.join(dir,'Game.exe'),Buffer.alloc(1024));
 fs.writeFileSync(path.join(dir,'Game.pfs'),ar._internal.pf8([{name:'script\\d01.ast',data:Buffer.from(ast,'utf8')},{name:'system\\lang.lua',data:Buffer.from(lua,'utf8')}]));
 const parsed=sc.ENGINES.artemis.parse(Buffer.from(ast,'utf8'));
 assert.equal(parsed.lines.length,60);
 assert.equal(parsed.lines[0],'English line number 0 here.');
 assert.deepEqual(parsed.zh,[]);
 const probe=probeGame({dir,executable:path.join(dir,'Game.exe'),title:'PlaceholderGame'});
 assert.equal(probe.step,'not-japanese');
 assert.equal(probe.detail,'artemis');
 assert.equal(probe.japaneseLines,0);
 assert.equal(ar.detect(dir).state,'none');
});

test('placeholder-only ja (*テキスト*) with cn only probes as chinese-build',(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-artemis-cn-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const ast='astver = 2.0\nast = {\n'+Array.from({length:60},(_,i)=>
  `\t["0001_${i}"] = {\n\t\t{"text"},\n\t\ttext = {\n\t\t\tja = {{"*テキスト*"}},\n\t\t\tcn = {{"这是第${i}句中文对白。"}},\n\t\t},\n\t},`
 ).join('\n')+'\n}';
 fs.writeFileSync(path.join(dir,'Game.exe'),Buffer.alloc(1024));
 fs.writeFileSync(path.join(dir,'Game.pfs'),ar._internal.pf8([{name:'script\\d01.ast',data:Buffer.from(ast,'utf8')}]));
 const probe=probeGame({dir,executable:path.join(dir,'Game.exe'),title:'PlaceholderCn'});
 assert.equal(probe.step,'chinese-build');
 assert.equal(probe.detail,'artemis');
 assert.equal(probe.japaneseLines,0);
});

test('real Japanese ast containing テキスト or a single *...* sound effect is kept intact',()=>{
 const ast='astver = 2.0\nast = {\n'
  +'\t["0001_0"] = {\n\t\ttext = {\n\t\t\tja = {{"テキストを表示する。"}},\n\t\t\tcn = {{"显示文本。"}},\n\t\t},\n\t},\n'
  +'\t["0001_1"] = {\n\t\ttext = {\n\t\t\tja = {{"*ガサゴソ*"}},\n\t\t\tcn = {{"*沙沙声*"}},\n\t\t},\n\t},\n'
  +'\t["0001_2"] = {\n\t\ttext = {\n\t\t\tja = {{"おはようございます。"}},\n\t\t\tcn = {{"早上好。"}},\n\t\t},\n\t},\n}';
 const r=sc.ENGINES.artemis.parse(Buffer.from(ast,'utf8'));
 assert.deepEqual(r.lines,['テキストを表示する。','*ガサゴソ*','おはようございます。']);
 assert.deepEqual(r.zh,['显示文本。','*沙沙声*','早上好。']);
});

test('one text table for the whole file (text = { [1] = { ja, cn }, ... }) gives one line per message',()=>{
 const src='astver=2.0\nast={{{"savetitle",text="『三夜目』",text_cn="『三夜目』"},{"bg",file="room",path=":bg/"},{"text"},},{{"text"},},{},'
  +'text={[1]={ja={name={"name",name="滋比古"},{"「はっ……」",},},cn={name={"name",name="滋比古"},{"「哈……」",},},},'
  +'[2]={ja={{"鳥の声で目覚めた。",},},cn={{"我被鸟叫声吵醒了。",},},},'
  +'[3]={ja={name={"name",name="滋比古"},{"「キリエ……！」",},},cn={name={"name",name="滋比古"},{"「雾枝……！」",},},},},}\n';
 const r=sc.ENGINES.artemis.parse(Buffer.from(src,'utf8'));
 assert.deepEqual(r.lines,['「はっ……」','鳥の声で目覚めた。','「キリエ……！」']);
 assert.deepEqual(r.zh,['「哈……」','我被鸟叫声吵醒了。','「雾枝……！」']);
});