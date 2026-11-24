'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const nani=require('../services/original-engines/naninovel.cjs');
// E355: a Naninovel localization document gives the Japanese source and the release's own translation per line.
test('Naninovel localization document',()=>{
 const doc="; 日本語 <ja> to 简体中文 <zh-Hans> localization document for 'A/B' Naninovel scenario script\n\n# B_Ema001\n; > Ema: |#B_Ema001|\n; （このあたりを歩くの苦手なんだよな）\n（我还是有点害怕在这附近走动）\n\n# B_Narrative001\n; 見張りのためか、<br>いつのっそりと。\n看守经常会来。<br>\n它什么时候。\n";
 const r=nani.parse(Buffer.from(doc));
 assert.deepEqual(r.lines,['（このあたりを歩くの苦手なんだよな）','見張りのためか、\nいつのっそりと。']);
 assert.deepEqual(r.zh,['（我还是有点害怕在这附近走动）','看守经常会来。\n它什么时候。']);
 assert.deepEqual(r.anchors,['B_Ema001','B_Narrative001']);
});
const game='e:/steam/steamapps/common/manosaba_game';
test('a Unity shadow reads the same localization and voice directory as its source player',t=>{
 const os=require('node:os'),path=require('node:path');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nani-shadow-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'source'),shadow=path.join(root,'shadow'),exe='Player.exe';
 const data=path.join(source,'Player_Data'),relative=path.join('StreamingAssets','aa','StandaloneWindows64');
 fs.mkdirSync(path.join(data,relative),{recursive:true});fs.mkdirSync(shadow);
 for(const dir of [source,shadow])fs.writeFileSync(path.join(dir,exe),'fixture');
 fs.writeFileSync(path.join(data,relative,'game-localization-zhhans-scripts-route.bundle'),'fixture');
 const linked=path.join(shadow,'Player_Data'),manifest=path.join(shadow,'megulit-shadow.json');
 fs.symlinkSync(data,linked,'junction');
 assert.deepEqual(nani.sources(shadow),[]);
 fs.writeFileSync(manifest,JSON.stringify({game:source,exe}));
 assert.deepEqual(nani.sources(shadow),nani.sources(source));
 assert.equal(require('../services/original-engines/naninovel-voice.cjs').bundleDir(shadow),path.join(fs.realpathSync(data),relative));
 const other=path.join(root,'other');fs.mkdirSync(path.join(other,'Player_Data'),{recursive:true});
 fs.writeFileSync(path.join(other,exe),'fixture');fs.writeFileSync(manifest,JSON.stringify({game:other,exe}));
 assert.deepEqual(nani.sources(shadow),[]);
});
test('魔法少女ノ魔女裁判 (Steam): localization bundles are read',{skip:!fs.existsSync(game)&&'no local copy'},()=>{
 const sc=nani.scenes(game);assert.ok(sc.length>100);const r=nani.parse(sc.find(s=>/Adv29/.test(s.name)).read());
 assert.equal(r.lines[0],'（このあたりを歩くの苦手なんだよな）');assert.equal(r.zh[0],'（我还是有点害怕在这附近走动）');
});

test('Naninovel: Japanese-source parsed-script assets reconstruct source dialogue and Chinese translations',t=>{
 const os=require('node:os'),path=require('node:path');
 const scenes=require('../services/original-engines/scenes.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nani-ja-parsed-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const data=path.join(root,'Game_Data');fs.mkdirSync(data,{recursive:true});
 const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;};
 const i32=v=>{const b=Buffer.alloc(4);b.writeInt32LE(v);return b;};
 const str=s=>{const b=Buffer.from(s,'utf8');return Buffer.concat([u32(b.length),b,Buffer.alloc((4-b.length%4)%4)]);};
 const comment=(line,hash,text)=>Buffer.concat([str('CommentScriptLine'),str('Naninovel'),str('Elringus.Naninovel.Runtime'),i32(line),...(hash?[str(hash)]:[]),str(text)]);
 const generic=(line,hash,count)=>Buffer.concat([str('GenericTextScriptLine'),str('Naninovel'),str('Elringus.Naninovel.Runtime'),i32(line),str(hash),u32(count),Buffer.alloc(count*8)]);
 const print=(script,line,inl,text)=>Buffer.concat([str('PrintText'),str('Naninovel.Commands'),str('Elringus.Naninovel.Runtime'),str(script),i32(line),i32(inl),str(text)]);
 // S01: Japanese-source parsed asset with zh-Hans (entries path: speaker prefix, untranslated gap, voice meta) + competing en asset
 const s01Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S01` naninovel script'),
  comment(2,'11111111','Ema: 「おはよう」'),
  print('S01',3,0,'「早上好」'),
  comment(5,'22222222','未翻訳の地の文。'),
  comment(7,'33333333','> Ema: |#S01_Ema001|'),
  comment(8,'44444444','元気ですか？'),
  print('S01',9,0,'你还好吗？'),
 ]);
 const s01En=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to English <en> localization document for `S01` naninovel script'),
  comment(2,'11111111','Ema: 「おはよう」'),
  print('S01',3,0,'Good morning'),
 ]);
 // S02: Japanese-source parsed asset with English only -> Japanese kept, zh stays empty
 const s02En=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to English <en> localization document for `S02` naninovel script'),
  comment(2,'55555555','一人きりの部屋。'),
  print('S02',3,0,'An empty room.'),
 ]);
 // S03: Japanese-source parsed asset without 8-hex hashes -> prints/byLine fallback path
 const s03Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S03` naninovel script'),
  comment(2,null,'Kasumi: 「行こう」'),
  generic(3,'',1),
  comment(5,null,'静かな夜。'),
  generic(6,'',1),
  print('S03',3,0,'「走吧」'),
  print('S03',6,0,'安静的夜晚。'),
 ]);
 // S04: Japanese-source parsed asset without hashes/byLine -> never guesses positional pairing even when counts match
 const s04Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S04` naninovel script'),
  comment(2,null,'一行目。'),
  comment(4,null,'二行目。'),
  print('S04',5,0,'第一行。'),
  print('S04',6,0,'第二行。'),
 ]);
 // S05: hashless parsed asset with > voice meta + byLine + non-Chinese dst check (S05En)
 const s05Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S05` naninovel script'),
  comment(1,null,'> Ema: |#S05_Ema001|'),
  comment(2,null,'声を聞く。'),
  generic(3,'',1),
  print('S05',3,0,'听到声音。'),
 ]);
 const s05En=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to English <en> localization document for `S05En` naninovel script'),
  comment(2,null,'英語のみ。'),
  generic(3,'',1),
  print('S05En',3,0,'English only.'),
 ]);
 // S06: strip author prefix (ASCII ": " only), inline commands [i] & escapes, empty-after-strip, and > with text not poisoning meta
 const s06Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S06` naninovel script'),
  comment(2,'60000001','Ema.Happy: 「待って[i]……\\[注意\\]」'),
  print('S06',3,0,'「等等……[注意]」'),
  comment(5,'60000002','時刻：午後三時。'),
  print('S06',6,0,'时刻：下午三点。'),
  comment(8,'60000003','12:30に駅前で待ち合わせ。'),
  print('S06',9,0,'12:30在站前碰头。'),
  comment(11,'60000004','http://example.jp を開いた。'),
  print('S06',12,0,'打开了 http://example.jp。'),
  comment(14,'60000005','えっと、つまり: こういうこと？'),
  print('S06',15,0,'呃，也就是说：这么回事？'),
  comment(17,'60000006','エマ：「おはよう」'),
  print('S06',18,0,'艾玛：「早上好」'),
  comment(20,'60000007','Ema: '),
  print('S06',21,0,'(空)'),
  comment(23,'60000008','> Ema: |#S06_Fake|'),
  print('S06',24,0,'非元注释'),
  comment(26,'60000009','地の文。'),
  print('S06',27,0,'第一行<br>\n# 注释'),
 ]);
 // S07: entries path with a 2-line translation (L+1 and L+2)
 const s07Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S07` naninovel script'),
  comment(2,'70000001','Aの台詞。'),
  print('S07',3,0,'A的第一行'),
  print('S07',4,0,'A的第二行'),
  comment(6,'70000002','Bの台詞。'),
  print('S07',7,0,'B的翻译'),
 ]);
 // S08 (2): hashless 2-line translation + untranslated gap (counts would match positionally and misalign without line bounds)
 const s08Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S08` naninovel script'),
  comment(2,null,'Aの台詞。'),generic(3,'',1),generic(4,'',1),
  comment(6,null,'Bの台詞（未翻訳）。'),
  comment(8,null,'Cの台詞。'),generic(9,'',1),
  print('S08',3,0,'A的第一行'),print('S08',4,0,'A的第二行'),print('S08',9,0,'C的翻译'),
 ]);
 // S09 (2b): hashless inline double-PrintText + untranslated gap
 const s09Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S09` naninovel script'),
  comment(2,null,'Aの台詞。'),generic(3,'',2),
  comment(5,null,'Bの台詞（未翻訳）。'),
  comment(7,null,'Cの台詞。'),generic(8,'',1),
  print('S09',3,0,'A前半'),print('S09',3,1,'A後半'),print('S09',8,0,'C的翻译'),
 ]);
 // S10 (2c): hashless 2-line translation with no gap
 const s10Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S10` naninovel script'),
  comment(2,null,'Aの台詞。'),generic(3,'',1),generic(4,'',1),
  comment(6,null,'Cの台詞。'),generic(7,'',1),
  print('S10',3,0,'A的第一行'),print('S10',4,0,'A的第二行'),print('S10',7,0,'C的翻译'),
 ]);
 // S11 (2d): hashless single untranslated gap, remaining lines keep their Chinese
 const s11Zh=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S11` naninovel script'),
  comment(2,null,'Aの台詞。'),generic(3,'',1),
  comment(5,null,'Bの台詞（未翻訳）。'),
  comment(7,null,'Cの台詞。'),generic(8,'',1),
  print('S11',3,0,'A的翻译'),print('S11',8,0,'C的翻译'),
 ]);
 fs.writeFileSync(path.join(data,'resources.assets'),Buffer.concat([s01En,s01Zh,s02En,s03Zh,s04Zh,s05Zh,s05En,s06Zh,s07Zh,s08Zh,s09Zh,s10Zh,s11Zh,Buffer.alloc(8)]));
 const read=scenes.read('naninovel',root);
 const byName=new Map(read.map(s=>[s.name,s]));
 const s1=byName.get('S01.nani');assert.ok(s1);
 assert.deepEqual(s1.lines,['「おはよう」','未翻訳の地の文。','元気ですか？']);
 assert.deepEqual(s1.zh,['「早上好」','','你还好吗？']);
 assert.deepEqual(s1.voices,[null,null,'S01_Ema001']);
 const s2=byName.get('S02.nani');assert.ok(s2);
 assert.deepEqual(s2.lines,['一人きりの部屋。']);
 assert.deepEqual(s2.zh,['']);
 const s3=byName.get('S03.nani');assert.ok(s3);
 assert.deepEqual(s3.lines,['「行こう」','静かな夜。']);
 assert.deepEqual(s3.zh,['「走吧」','安静的夜晚。']);
 const s4=byName.get('S04.nani');assert.ok(s4);
 assert.deepEqual(s4.lines,['一行目。','二行目。']);
 assert.deepEqual(s4.zh,['','']);
 const s5=byName.get('S05.nani');assert.ok(s5);
 assert.deepEqual(s5.lines,['声を聞く。']);
 assert.deepEqual(s5.zh,['听到声音。']);
 assert.deepEqual(s5.voices,['S05_Ema001']);
 const s5e=byName.get('S05En.nani');assert.ok(s5e);
 assert.deepEqual(s5e.lines,['英語のみ。']);
 assert.deepEqual(s5e.zh,['']);
 const s6=byName.get('S06.nani');assert.ok(s6);
 assert.deepEqual(s6.lines,['「待って……[注意]」','時刻：午後三時。','12:30に駅前で待ち合わせ。','http://example.jp を開いた。','えっと、つまり: こういうこと？','エマ：「おはよう」','地の文。']);
 assert.deepEqual(s6.zh,['「等等……[注意]」','时刻：下午三点。','12:30在站前碰头。','打开了 http://example.jp。','呃，也就是说：这么回事？','艾玛：「早上好」','第一行\n# 注释']);
 assert.equal(s6.voices,undefined);
 const s7=byName.get('S07.nani');assert.ok(s7);
 assert.deepEqual(s7.lines,['Aの台詞。','Bの台詞。']);
 assert.deepEqual(s7.zh,['A的第一行\nA的第二行','B的翻译']);
 const s8=byName.get('S08.nani');assert.ok(s8);
 assert.deepEqual(s8.lines,['Aの台詞。','Bの台詞（未翻訳）。','Cの台詞。']);
 assert.deepEqual(s8.zh,['A的第一行\nA的第二行','','C的翻译']);
 const s9=byName.get('S09.nani');assert.ok(s9);
 assert.deepEqual(s9.lines,['Aの台詞。','Bの台詞（未翻訳）。','Cの台詞。']);
 assert.deepEqual(s9.zh,['A前半A後半','','C的翻译']);
 const s10=byName.get('S10.nani');assert.ok(s10);
 assert.deepEqual(s10.lines,['Aの台詞。','Cの台詞。']);
 assert.deepEqual(s10.zh,['A的第一行\nA的第二行','C的翻译']);
 const s11=byName.get('S11.nani');assert.ok(s11);
 assert.deepEqual(s11.lines,['Aの台詞。','Bの台詞（未翻訳）。','Cの台詞。']);
 assert.deepEqual(s11.zh,['A的翻译','','C的翻译']);
 // Positional prints fallback is used only when no line numbers (commentLines) exist at all
 const mkNoLine=(dst,comments,prints)=>{const p=Object.assign([...prints],{comments});return {script:true,name:'NL.nani',src:'ja-jp',dst,text:'',prints:p};};
 const nlZh=nani.parse(Buffer.from(nani._internal.combine([mkNoLine('zh-hans',['> Ema: |#NL_1|','一。'],['一中'])])[0].text));
 assert.deepEqual(nlZh.lines,['一。']);assert.deepEqual(nlZh.zh,['一中']);assert.deepEqual(nlZh.voices,['NL_1']);
 const nlEn=nani.parse(Buffer.from(nani._internal.combine([mkNoLine('en',['一。'],['One'])])[0].text));
 assert.deepEqual(nlEn.lines,['一。']);assert.deepEqual(nlEn.zh,['']);
 const nlGap=nani.parse(Buffer.from(nani._internal.combine([mkNoLine('zh-hans',['一。','二。'],['二中'])])[0].text));
 assert.deepEqual(nlGap.lines,['一。','二。']);assert.deepEqual(nlGap.zh,['','']);
 const patched=nani.patchLines([s2]);
 assert.equal(patched,null,'non-Chinese translation must not become a Chinese patch');
});

test('Naninovel: Addressables localization bundles keep Japanese alongside preferred Chinese for non-Japanese-source games',t=>{
 const os=require('node:os'),path=require('node:path');
 const scenes=require('../services/original-engines/scenes.cjs');
 const {packBundle}=require('../services/original-engines/utage-embedded.cjs')._internal;
 const {string}=require('./helpers/utage-embedded-fixture.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nani-bundles-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const aa=path.join(root,'Game_Data','StreamingAssets','aa','StandaloneWindows64');
 fs.mkdirSync(aa,{recursive:true});
 const zhDoc='; English <en> to Chinese (S) <zh-Hans> localization document for `Intro` naninovel script\n\n# L1\n; Hello world.\n你好，世界。\n\n# L2\n; Goodbye.\n再见。\n';
 const jaDoc='; English <en> to Japanese <ja-JP> localization document for `Intro` naninovel script\n\n# L1\n; Hello world.\nこんにちは、世界。\n\n# L2\n; Goodbye.\nさようなら。\n';
 const enDoc='; English <en> to Korean <ko> localization document for `Intro` naninovel script\n\n# L1\n; Hello world.\n안녕.\n';
 fs.writeFileSync(path.join(aa,'game-localization-zhhans-scripts-01.bundle'),packBundle('CAB-zh',string(zhDoc),'2020.3.7f1'));
 fs.writeFileSync(path.join(aa,'game-localization-ja-scripts-01.bundle'),packBundle('CAB-ja',string(jaDoc),'2020.3.7f1'));
 fs.writeFileSync(path.join(aa,'game-localization-ko-scripts-01.bundle'),packBundle('CAB-ko',string(enDoc),'2020.3.7f1'));
 const read=scenes.read('naninovel',root);
 assert.equal(read.length,1);
 assert.equal(read[0].name,'Intro.nani');
 assert.deepEqual(read[0].lines,['こんにちは、世界。','さようなら。']);
 assert.deepEqual(read[0].zh,['你好，世界。','再见。']);
 const picked=nani.sources(root).map(f=>path.basename(f));
 assert.deepEqual(picked,['game-localization-zhhans-scripts-01.bundle','game-localization-ja-scripts-01.bundle']);
 // Mixed-case and region-suffixed tags (zhHans + JA-JP / jajp) are also kept
 const rootCase=fs.mkdtempSync(path.join(os.tmpdir(),'nani-case-'));
 t.after(()=>fs.rmSync(rootCase,{recursive:true,force:true}));
 const aaCase=path.join(rootCase,'Game_Data','StreamingAssets','aa','StandaloneWindows64');
 fs.mkdirSync(aaCase,{recursive:true});
 fs.writeFileSync(path.join(aaCase,'game-localization-zhHans-scripts-01.bundle'),packBundle('CAB-zh',string(zhDoc),'2020.3.7f1'));
 fs.writeFileSync(path.join(aaCase,'game-localization-JA-JP-scripts-01.bundle'),packBundle('CAB-ja',string(jaDoc),'2020.3.7f1'));
 fs.writeFileSync(path.join(aaCase,'game-localization-en-scripts-01.bundle'),packBundle('CAB-en',string(enDoc),'2020.3.7f1'));
 const readCase=scenes.read('naninovel',rootCase);
 assert.equal(readCase.length,1);
 assert.deepEqual(readCase[0].lines,['こんにちは、世界。','さようなら。']);
 assert.deepEqual(readCase[0].zh,['你好，世界。','再见。']);
 // Japanese-source game without a ja bundle still reads only the preferred Chinese bundle
 const root2=fs.mkdtempSync(path.join(os.tmpdir(),'nani-ja-src-'));
 t.after(()=>fs.rmSync(root2,{recursive:true,force:true}));
 const aa2=path.join(root2,'Game_Data','StreamingAssets','aa','StandaloneWindows64');
 fs.mkdirSync(aa2,{recursive:true});
 fs.writeFileSync(path.join(aa2,'game-localization-zhhans-scripts-01.bundle'),'x');
 fs.writeFileSync(path.join(aa2,'game-localization-en-scripts-01.bundle'),'x');
 fs.writeFileSync(path.join(aa2,'game-localization-jav-scripts-01.bundle'),'x');
 assert.deepEqual(nani.sources(root2).map(f=>path.basename(f)),['game-localization-zhhans-scripts-01.bundle']);
 // Hyphenated/mixed-case Chinese tags (zh-CN, zh-TW, zhHans) beat English and zh-cn beats zh-tw
 const mkPick=langs=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'nani-ord-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
  const b=path.join(d,'Game_Data','StreamingAssets','aa','StandaloneWindows64');fs.mkdirSync(b,{recursive:true});
  for(const l of langs)fs.writeFileSync(path.join(b,`game-localization-${l}-scripts-01.bundle`),'x');
  return nani.sources(d).map(f=>path.basename(f).replace(/^game-localization-|-scripts-01\.bundle$/g,''));};
 assert.deepEqual(mkPick(['en','zh-CN']),['zh-CN']);
 assert.deepEqual(mkPick(['en','zhHans']),['zhHans']);
 assert.deepEqual(mkPick(['zh-tw','zh-cn']),['zh-cn']);
 assert.deepEqual(mkPick(['en','zh-tw']),['zh-tw']);
 // Japanese-source game that also ships a ja->ja bundle still prefers the Chinese translation
 const rootJa=fs.mkdtempSync(path.join(os.tmpdir(),'nani-ja-dup-'));
 t.after(()=>fs.rmSync(rootJa,{recursive:true,force:true}));
 const aaJa=path.join(rootJa,'Game_Data','StreamingAssets','aa','StandaloneWindows64');
 fs.mkdirSync(aaJa,{recursive:true});
 fs.writeFileSync(path.join(aaJa,'game-localization-zhhans-scripts-01.bundle'),packBundle('CAB-z',string('; Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `S` naninovel script\n\n# a\n; 原文。\n中文。\n'),'2020.3.7f1'));
 fs.writeFileSync(path.join(aaJa,'game-localization-ja-scripts-01.bundle'),packBundle('CAB-j',string('; Japanese <ja-JP> to Japanese <ja-JP> localization document for `S` naninovel script\n\n# a\n; 原文。\n校正後。\n'),'2020.3.7f1'));
 const readJa=scenes.read('naninovel',rootJa);
 assert.deepEqual(readJa[0].lines,['原文。']);
 assert.deepEqual(readJa[0].zh,['中文。']);
});

test('Naninovel: #947 review regressions (empty classic doc, multiline/special-prefix roundtrip, LabelScriptLine bounds, extra ja->ja classic doc, hashless translated >)',t=>{
 const os=require('node:os'),path=require('node:path');
 const scenes=require('../services/original-engines/scenes.cjs');
 const {packBundle}=require('../services/original-engines/utage-embedded.cjs')._internal;
 const {string}=require('./helpers/utage-embedded-fixture.cjs');
 const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;};
 const i32=v=>{const b=Buffer.alloc(4);b.writeInt32LE(v);return b;};
 const str=s=>{const b=Buffer.from(s,'utf8');return Buffer.concat([u32(b.length),b,Buffer.alloc((4-b.length%4)%4)]);};
 const comment=(line,hash,text)=>Buffer.concat([str('CommentScriptLine'),str('Naninovel'),str('Elringus.Naninovel.Runtime'),i32(line),...(hash!==null?[str(hash)]:[]),str(text)]);
 const label=(line,hash,text)=>Buffer.concat([str('LabelScriptLine'),str('Naninovel'),str('Elringus.Naninovel.Runtime'),i32(line),...(hash!==null?[str(hash)]:[]),str(text)]);
 const generic=(line,hash,count)=>Buffer.concat([str('GenericTextScriptLine'),str('Naninovel'),str('Elringus.Naninovel.Runtime'),i32(line),str(hash),u32(count),Buffer.alloc(count*8)]);
 const print=(script,line,inl,text)=>Buffer.concat([str('PrintText'),str('Naninovel.Commands'),str('Elringus.Naninovel.Runtime'),str(script),i32(line),i32(inl),str(text)]);

 // 1. Empty classic ja->zh document followed by an unrelated compiled script must not scan 4MB ahead into it
 const emptyClassic=Buffer.concat([
  Buffer.alloc(8),
  str('; Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `EmptyClassic` naninovel script\n'),
  comment(2,'10000001','無関係なスクリプトの台詞。'),
  print('Other',3,0,'无关剧本台词。'),
 ]);
 const docs1=nani._internal.scan(emptyClassic,[]);
 assert.equal(docs1.length,1);
 const c1=nani._internal.combine(docs1);
 assert.deepEqual(nani.parse(Buffer.from(c1[0].text)).lines,[]);

 // 2. Non-Japanese-source parsed entries escape multiline (\n) and leading #/; translations cleanly
 const nonJaEnToJa=Buffer.concat([
  Buffer.alloc(8),
  str('English <en> to Japanese <ja-JP> localization document for `NonJa` naninovel script'),
  comment(2,'20000001','Src one'),print('NonJa',3,0,'日本語一。'),
  comment(5,'20000002','Src two'),print('NonJa',6,0,'日本語二。'),
  comment(8,'20000003','Src three'),print('NonJa',9,0,'日本語三。'),
  comment(11,'20000004','Src four'),print('NonJa',12,0,'>日本語四。'),
 ]);
 const nonJaEnToZh=Buffer.concat([
  Buffer.alloc(8),
  str('English <en> to Chinese (S) <zh-Hans> localization document for `NonJa` naninovel script'),
  comment(2,'20000001','Src one'),print('NonJa',3,0,'第一行'),print('NonJa',4,0,'# 假块'),
  comment(6,'20000002','Src two'),print('NonJa',7,0,'第二行'),print('NonJa',8,0,'; 假原文'),
  comment(10,'20000003','Src three'),print('NonJa',11,0,'# 首行井号'),
  comment(13,'20000004','Src four'),print('NonJa',14,0,'; 首行分号'),
 ]);
 const docs2=nani._internal.scan(Buffer.concat([nonJaEnToJa,nonJaEnToZh,Buffer.alloc(8)]),[]);
 const p2=nani.parse(Buffer.from(nani._internal.combine(docs2)[0].text));
 assert.deepEqual(p2.lines,['日本語一。','日本語二。','日本語三。','>日本語四。']);
 assert.deepEqual(p2.zh,['第一行\n# 假块','第二行\n; 假原文','# 首行井号','; 首行分号']);

 // 3. LabelScriptLine stops untranslated comments in docEntries (empty hash + 8-hex label, normal hash) and printed()
 const lblEmptyHash=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `LblEmpty` naninovel script'),
  comment(2,'30000001','未翻訳A。'),
  label(4,'','deadbeef'),
  print('LblEmpty',5,0,'别块译文A'),
  comment(7,'30000002','已翻訳B。'),
  print('LblEmpty',8,0,'B的翻译'),
 ]);
 const lblNormalHash=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `LblHash` naninovel script'),
  comment(2,'30000003','未翻訳C。'),
  label(4,'abcdef01','NextBlock'),
  print('LblHash',5,0,'别块译文C'),
  comment(7,'30000004','已翻訳D。'),
  print('LblHash',8,0,'D的翻译'),
 ]);
 const lblHashless=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `LblPrint` naninovel script'),
  comment(2,null,'未翻訳E。'),
  label(4,null,'MidLabel'),
  generic(5,'',1),
  comment(8,null,'已翻訳F。'),
  generic(9,'',1),
  print('LblPrint',5,0,'误吞译文E'),
  print('LblPrint',9,0,'F的翻译'),
 ]);
 const docs3=nani._internal.scan(Buffer.concat([lblEmptyHash,lblNormalHash,lblHashless,Buffer.alloc(8)]),[]);
 const by3=new Map(nani._internal.combine(docs3).map(d=>[d.name,nani.parse(Buffer.from(d.text))]));
 assert.deepEqual(by3.get('LblEmpty.nani').lines,['未翻訳A。','已翻訳B。']);
 assert.deepEqual(by3.get('LblEmpty.nani').zh,['','B的翻译']);
 assert.deepEqual(by3.get('LblHash.nani').lines,['未翻訳C。','已翻訳D。']);
 assert.deepEqual(by3.get('LblHash.nani').zh,['','D的翻译']);
 assert.deepEqual(by3.get('LblPrint.nani').lines,['未翻訳E。','已翻訳F。']);
 assert.deepEqual(by3.get('LblPrint.nani').zh,['','F的翻译']);

 // 4. Extra classic ja->ja script in a ja bundle keeps Japanese + voice but never becomes a Chinese patch
 const rootExtra=fs.mkdtempSync(path.join(os.tmpdir(),'nani-ja-extra-'));
 t.after(()=>fs.rmSync(rootExtra,{recursive:true,force:true}));
 const aaExtra=path.join(rootExtra,'Game_Data','StreamingAssets','aa','StandaloneWindows64');
 fs.mkdirSync(aaExtra,{recursive:true});
 fs.writeFileSync(path.join(aaExtra,'game-localization-zhhans-scripts-01.bundle'),packBundle('CAB-z',string('; Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `Main` naninovel script\n\n# m1\n; 本編。\n正篇。\n'),'2020.3.7f1'));
 fs.writeFileSync(path.join(aaExtra,'game-localization-ja-scripts-01.bundle'),packBundle('CAB-j',Buffer.concat([
  string('; Japanese <ja-JP> to Japanese <ja-JP> localization document for `Main` naninovel script\n\n# m1\n; 本編。\n本編校正。\n'),
  string('; Japanese <ja-JP> to Japanese <ja-JP> localization document for `Extra` naninovel script\n\n# e1\n; > Ema: |#Extra_01|\n; 原文。\n校正後。\n'),
 ]),'2020.3.7f1'));
 const readExtra=new Map(scenes.read('naninovel',rootExtra).map(s=>[s.name,s]));
 assert.deepEqual(readExtra.get('Main.nani').zh,['正篇。']);
 const extraScene=readExtra.get('Extra.nani');
 assert.deepEqual(extraScene.lines,['原文。']);
 assert.deepEqual(extraScene.voices,['Extra_01']);
 assert.deepEqual(extraScene.zh,['']);
 assert.equal(nani.patchLines([extraScene]),null);

 // 5. parsedJaSrc roundtrip: leading #/; translations, pure \n translations, >-prefixed source after author strip, and hashless translated > not poisoning voices
 const edgeEntries=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `EdgeE` naninovel script'),
  comment(2,'50000001','Ema: >矢印原文。'),print('EdgeE',3,0,'# 标题译文'),
  comment(5,'50000002','二行目。'),print('EdgeE',6,0,'; 分号译文'),
  comment(8,'50000003','三行目。'),print('EdgeE',9,0,'纯换行上\n# 假块\n; 假源文'),
 ]);
 const edgeHashless=Buffer.concat([
  Buffer.alloc(8),
  str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `EdgeP` naninovel script'),
  comment(1,null,'> Ema: |#EdgeP_Fake|'),generic(2,'',1),
  comment(4,null,'Ema: >無ハッシュ原文。'),generic(5,'',1),
  comment(7,null,'純改行テスト。'),generic(8,'',1),
  print('EdgeP',2,0,'有译文非元注释'),
  print('EdgeP',5,0,'# 无哈希井号'),
  print('EdgeP',8,0,'纯换行甲\n; 假源文乙'),
 ]);
 const docs5=nani._internal.scan(Buffer.concat([edgeEntries,edgeHashless,Buffer.alloc(8)]),[]);
 const by5=new Map(nani._internal.combine(docs5).map(d=>[d.name,nani.parse(Buffer.from(d.text))]));
 assert.deepEqual(by5.get('EdgeE.nani').lines,['>矢印原文。','二行目。','三行目。']);
 assert.deepEqual(by5.get('EdgeE.nani').zh,['# 标题译文','; 分号译文','纯换行上\n# 假块\n; 假源文']);
 assert.equal(by5.get('EdgeE.nani').voices,undefined);
 assert.deepEqual(by5.get('EdgeP.nani').lines,['>無ハッシュ原文。','純改行テスト。']);
 assert.deepEqual(by5.get('EdgeP.nani').zh,['# 无哈希井号','纯换行甲\n; 假源文乙']);
 assert.equal(by5.get('EdgeP.nani').voices,undefined);
});

test('Naninovel: #947 r3 regressions (empty/cn/chs/unknown classic dst, prefixed parsed assets, stale meta cleared on translated >)',async t=>{
 const os=require('node:os'),path=require('node:path');
 const scenes=require('../services/original-engines/scenes.cjs');
 const {packBundle}=require('../services/original-engines/utage-embedded.cjs')._internal;
 const {string}=require('./helpers/utage-embedded-fixture.cjs');
 const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;};
 const i32=v=>{const b=Buffer.alloc(4);b.writeInt32LE(v);return b;};
 const str=s=>{const b=Buffer.from(s,'utf8');return Buffer.concat([u32(b.length),b,Buffer.alloc((4-b.length%4)%4)]);};
 const comment=(line,hash,text)=>Buffer.concat([str('CommentScriptLine'),str('Naninovel'),str('Elringus.Naninovel.Runtime'),i32(line),...(hash!==null?[str(hash)]:[]),str(text)]);
 const generic=(line,hash,count)=>Buffer.concat([str('GenericTextScriptLine'),str('Naninovel'),str('Elringus.Naninovel.Runtime'),i32(line),str(hash),u32(count),Buffer.alloc(count*8)]);
 const print=(script,line,inl,text)=>Buffer.concat([str('PrintText'),str('Naninovel.Commands'),str('Elringus.Naninovel.Runtime'),str(script),i32(line),i32(inl),str(text)]);

 await t.test('classic empty/cn/chs/unknown dst keeps translations and patchLines',st=>{
  const classicCases=[
   ['Legacy.nani','; localization document for `Legacy` naninovel script\n\n# l1\n; おはよう。\n早上好。\n\n# l2\n; 今日はいい天気ですね。\n今天天气真好啊。\n',['早上好。','今天天气真好啊。']],
   ['CnTag.nani','; Japanese <ja-JP> to Chinese <cn> localization document for `CnTag` naninovel script\n\n# c1\n; おはよう。\n早上好。\n\n# c2\n; 今日はいい天気ですね。\n今天天气真好啊。\n',['早上好。','今天天气真好啊。']],
   ['ChsTag.nani','; Japanese <ja-JP> to Chinese <chs> localization document for `ChsTag` naninovel script\n\n# s1\n; おはよう。\n早上好。\n\n# s2\n; 今日はいい天気ですね。\n今天天气真好啊。\n',['早上好。','今天天气真好啊。']],
   ['CustomTag.nani','; Japanese <ja-JP> to Fan <custom> localization document for `CustomTag` naninovel script\n\n# u1\n; おはよう。\n早上好。\n',['早上好。']],
  ];
  const root1=fs.mkdtempSync(path.join(os.tmpdir(),'nani-r3-classic-'));
  st.after(()=>fs.rmSync(root1,{recursive:true,force:true}));
  const aa1=path.join(root1,'Game_Data','StreamingAssets','aa','StandaloneWindows64');
  fs.mkdirSync(aa1,{recursive:true});
  fs.writeFileSync(path.join(aa1,'game-localization-zhhans-scripts-01.bundle'),packBundle('CAB-c',Buffer.concat(classicCases.map(([,doc])=>string(doc))),'2020.3.7f1'));
  const by1=new Map(scenes.read('naninovel',root1).map(s=>[s.name,s]));
  for(const [name,,wantZh] of classicCases){
   const sc=by1.get(name);assert.ok(sc,name);
   assert.deepEqual(sc.zh,wantZh,name);
   const patched=nani.patchLines([sc]);
   assert.ok(patched&&patched[0].patched,name+' should patch');
   assert.deepEqual(patched[0].lines,wantZh,name);
  }
  const parsedCn=Buffer.concat([
   Buffer.alloc(8),
   str('Japanese <ja-JP> to Chinese <cn> localization document for `ParsedCn` naninovel script'),
   comment(2,'80000001','おはよう。'),print('ParsedCn',3,0,'早上好。'),
  ]);
  const pCn=nani.parse(Buffer.from(nani._internal.combine(nani._internal.scan(parsedCn,[]))[0].text));
  assert.deepEqual(pCn.lines,['おはよう。']);
  assert.deepEqual(pCn.zh,['早上好。']);
 });

 await t.test('parsed assets with leading "; " or trailing "\\n" still read while empty classic docs stay empty',()=>{
  const prefNonJa=Buffer.concat([
   Buffer.alloc(8),
   str('; Chinese (T) <zh-TW> to Japanese <ja-JP> localization document for `PrefNonJa` naninovel script\n'),
   str('LabelScriptLine'),Buffer.alloc(8),
   str('PrintText'),str('Naninovel.Commands'),str('Elringus.Naninovel.Runtime'),str('PrefNonJa'),str('「あい」'),Buffer.alloc(4),
   str('PrintText'),str('Naninovel.Commands'),str('Elringus.Naninovel.Runtime'),str('PrefNonJa'),str('うう'),Buffer.alloc(4),
   Buffer.alloc(8),
   str('; Chinese (T) <zh-TW> to Chinese (S) <zh-CN> localization document for `PrefNonJa` naninovel script\n'),
   str('LabelScriptLine'),Buffer.alloc(8),
   str('PrintText'),str('Naninovel.Commands'),str('Elringus.Naninovel.Runtime'),str('PrefNonJa'),str('你好'),Buffer.alloc(4),
   str('PrintText'),str('Naninovel.Commands'),str('Elringus.Naninovel.Runtime'),str('PrefNonJa'),str('好'),Buffer.alloc(4),
  ]);
  const pNonJa=nani.parse(Buffer.from(nani._internal.combine(nani._internal.scan(prefNonJa,[]))[0].text));
  assert.deepEqual(pNonJa.lines,['「あい」','うう']);
  assert.deepEqual(pNonJa.zh,['你好','好']);

  const prefJa=Buffer.concat([
   Buffer.alloc(8),
   str('; Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `PrefJa` naninovel script\n'),
   comment(2,'81000001','おはよう。'),
   print('PrefJa',3,0,'早上好。'),
   Buffer.alloc(8),
   str('; Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `Sub/PrefSub` naninovel script\n'),
   comment(2,'81000002','サブ。'),
   print('PrefSub',3,0,'子目录。'),
   Buffer.alloc(8),
   str('; Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `EmptyNoPrint` naninovel script\n'),
   comment(2,'81000003','無関係なコメント。'),
   Buffer.alloc(8),
   str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `AllUntrans` naninovel script'),
   comment(2,'81000004','未翻訳のみ。'),
  ]);
  const by2=new Map(nani._internal.combine(nani._internal.scan(prefJa,[])).map(d=>[d.name,nani.parse(Buffer.from(d.text))]));
  assert.deepEqual(by2.get('PrefJa.nani').lines,['おはよう。']);
  assert.deepEqual(by2.get('PrefJa.nani').zh,['早上好。']);
  assert.deepEqual(by2.get('PrefSub.nani').lines,['サブ。']);
  assert.deepEqual(by2.get('PrefSub.nani').zh,['子目录。']);
  assert.deepEqual(by2.get('EmptyNoPrint.nani').lines,[]);
  assert.deepEqual(by2.get('AllUntrans.nani').lines,['未翻訳のみ。']);
  assert.deepEqual(by2.get('AllUntrans.nani').zh,['']);
 });

 await t.test('N3: translated "> " line clears stale voice meta in both entries and hashless paths',()=>{
  const staleEntries=Buffer.concat([
   Buffer.alloc(8),
   str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `StaleE` naninovel script'),
   comment(1,'82000001','> Ema: |#StaleE_Voice|'),
   comment(3,'82000002','> Ema: |#StaleE_Fake|'),print('StaleE',4,0,'带译文行'),
   comment(6,'82000003','次の台詞。'),print('StaleE',7,0,'下一句。'),
  ]);
  const staleHashless=Buffer.concat([
   Buffer.alloc(8),
   str('Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `StaleP` naninovel script'),
   comment(1,null,'> Ema: |#StaleP_Voice|'),
   comment(3,null,'> Ema: |#StaleP_Fake|'),generic(4,'',1),
   comment(6,null,'無ハッシュ次行。'),generic(7,'',1),
   print('StaleP',4,0,'无哈希带译文行'),
   print('StaleP',7,0,'无哈希下一句。'),
  ]);
  const by3=new Map(nani._internal.combine(nani._internal.scan(Buffer.concat([staleEntries,staleHashless,Buffer.alloc(8)]),[])).map(d=>[d.name,nani.parse(Buffer.from(d.text))]));
  assert.deepEqual(by3.get('StaleE.nani').lines,['次の台詞。']);
  assert.deepEqual(by3.get('StaleE.nani').zh,['下一句。']);
  assert.equal(by3.get('StaleE.nani').voices,undefined);
  assert.deepEqual(by3.get('StaleP.nani').lines,['無ハッシュ次行。']);
  assert.deepEqual(by3.get('StaleP.nani').zh,['无哈希下一句。']);
  assert.equal(by3.get('StaleP.nani').voices,undefined);
 });
});

test('Naninovel: #947 r4 regressions (primary bundle beats extra ja, ja->ja ranked below headerless/underscore zh, Sub/Name.nani sameScript, bare zh/jp bundles)',async t=>{
 const os=require('node:os'),path=require('node:path');
 const scenes=require('../services/original-engines/scenes.cjs');
 const {packBundle}=require('../services/original-engines/utage-embedded.cjs')._internal;
 const {string}=require('./helpers/utage-embedded-fixture.cjs');
 const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;};
 const i32=v=>{const b=Buffer.alloc(4);b.writeInt32LE(v);return b;};
 const str=s=>{const b=Buffer.from(s,'utf8');return Buffer.concat([u32(b.length),b,Buffer.alloc((4-b.length%4)%4)]);};
 const comment=(line,hash,text)=>Buffer.concat([str('CommentScriptLine'),str('Naninovel'),str('Elringus.Naninovel.Runtime'),i32(line),...(hash!==null?[str(hash)]:[]),str(text)]);
 const print=(script,line,inl,text)=>Buffer.concat([str('PrintText'),str('Naninovel.Commands'),str('Elringus.Naninovel.Runtime'),str(script),i32(line),i32(inl),str(text)]);

 await t.test('CE-r3-1/2/3: extra ja bundle never overrides headerless or underscore-locale zhhans bundle',st=>{
  const runPair=(zhDoc,jaDoc)=>{
   const root=fs.mkdtempSync(path.join(os.tmpdir(),'nani-r4-'));
   st.after(()=>fs.rmSync(root,{recursive:true,force:true}));
   const aa=path.join(root,'Game_Data','StreamingAssets','aa','StandaloneWindows64');
   fs.mkdirSync(aa,{recursive:true});
   fs.writeFileSync(path.join(aa,'game-localization-zhhans-scripts-01.bundle'),packBundle('CAB-z',string(zhDoc),'2020.3.7f1'));
   fs.writeFileSync(path.join(aa,'game-localization-ja-scripts-01.bundle'),packBundle('CAB-j',string(jaDoc),'2020.3.7f1'));
   assert.deepEqual(nani.sources(root).map(f=>path.basename(f)),['game-localization-zhhans-scripts-01.bundle','game-localization-ja-scripts-01.bundle']);
   return scenes.read('naninovel',root);
  };
  // CE-r3-1: headerless zhhans + ja->ja
  const r1=runPair(
   '; localization document for `S` naninovel script\n\n# a\n; おはよう。\n早上好。\n',
   '; Japanese <ja-JP> to Japanese <ja-JP> localization document for `S` naninovel script\n\n# a\n; おはよう。\nおはよう（校正）。\n'
  );
  assert.deepEqual(r1[0].zh,['早上好。']);
  assert.ok(nani.patchLines(r1)?.[0]?.patched);

  // CE-r3-2: headerless zhhans + headerless ja
  const r2=runPair(
   '; localization document for `S` naninovel script\n\n# a\n; おはよう。\n早上好。\n',
   '; localization document for `S` naninovel script\n\n# a\n; おはよう。\nおはよう。\n'
  );
  assert.deepEqual(r2[0].zh,['早上好。']);
  assert.ok(nani.patchLines(r2)?.[0]?.patched);

  // CE-r3-3: underscore locale <ja_JP> to <zh_CN> + ja->ja
  const r3=runPair(
   '; Japanese <ja_JP> to Chinese <zh_CN> localization document for `S` naninovel script\n\n# a\n; おはよう。\n早上好。\n',
   '; Japanese <ja-JP> to Japanese <ja-JP> localization document for `S` naninovel script\n\n# a\n; おはよう。\nおはよう（校正）。\n'
  );
  assert.deepEqual(r3[0].zh,['早上好。']);
  assert.ok(nani.patchLines(r3)?.[0]?.patched);

  // Even when ja->ja precedes a headerless or unknown-tag classic doc in the same buffer, zhRank ranks ja->ja below them
  const sameBuf=nani._internal.combine([
   {script:true,name:'Same.nani',src:'ja-jp',dst:'ja-jp',text:'; Japanese <ja-JP> to Japanese <ja-JP> localization document for `Same` naninovel script\n\n# a\n; おはよう。\n校正。\n'},
   {script:true,name:'Same.nani',src:'ja',dst:'',text:'; localization document for `Same` naninovel script\n\n# a\n; おはよう。\n早上好。\n'},
  ]);
  assert.deepEqual(nani.parse(Buffer.from(sameBuf[0].text)).zh,['早上好。']);

  // Underscore locale <ja_JP> to <zh_CN> is normalized to ja-jp / zh-cn (ranks Simplified ahead of zh-TW, and works in parsed assets)
  const underBuf=Buffer.concat([
   Buffer.alloc(8),str('; Japanese <ja-JP> to Chinese (T) <zh-TW> localization document for `U1` naninovel script\n\n# a\n; おはよう。\n早安繁體。\n'),
   Buffer.alloc(8),str('; Japanese <ja_JP> to Chinese (S) <zh_CN> localization document for `U1` naninovel script\n\n# a\n; おはよう。\n早上好简体。\n'),
  ]);
  assert.deepEqual(nani.parse(Buffer.from(nani._internal.combine(nani._internal.scan(underBuf,[]))[0].text)).zh,['早上好简体。']);
 });

 await t.test('Sub/S02.nani header matches PrintText short name S02, and bare zh / jp bundles are recognized in order',st=>{
  const subNani=Buffer.concat([
   Buffer.alloc(8),
   str('; Japanese <ja-JP> to Chinese (S) <zh-Hans> localization document for `Sub/S02.nani` naninovel script\n'),
   comment(2,'90000001','サブ拡張子付き。'),
   print('S02',3,0,'子目录带后缀。'),
  ]);
  const parsed=nani.parse(Buffer.from(nani._internal.combine(nani._internal.scan(subNani,[]))[0].text));
  assert.deepEqual(parsed.lines,['サブ拡張子付き。']);
  assert.deepEqual(parsed.zh,['子目录带后缀。']);

  const root=fs.mkdtempSync(path.join(os.tmpdir(),'nani-r4-ord-'));
  st.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const aa=path.join(root,'Game_Data','StreamingAssets','aa','StandaloneWindows64');
  fs.mkdirSync(aa,{recursive:true});
  for(const l of ['en','zh','jp','jav'])fs.writeFileSync(path.join(aa,`game-localization-${l}-scripts-01.bundle`),'x');
  assert.deepEqual(nani.sources(root).map(f=>path.basename(f)),['game-localization-zh-scripts-01.bundle','game-localization-jp-scripts-01.bundle']);
 });
});

test('Naninovel: classic documents fall back per block to Chinese source when zh translation is partial',t=>{
 const os=require('node:os'),path=require('node:path');
 const scenes=require('../services/original-engines/scenes.cjs');
 const {packBundle}=require('../services/original-engines/utage-embedded.cjs')._internal;
 const {string}=require('./helpers/utage-embedded-fixture.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nani-classic-fb-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const aa=path.join(root,'Game_Data','StreamingAssets','aa','StandaloneWindows64');
 fs.mkdirSync(aa,{recursive:true});
 const jaZhSrc=
  '; Chinese (T) <zh-TW> to Japanese <ja-JP> localization document for `Ch01` naninovel script\n\n'+
  '# L1\n; 繁體第一句。\n日本語の一行目。\n\n'+
  '# L2\n; 繁體第二句前半。<br>\n; 繁體第二句後半。\n日本語の二行目。\n\n'+
  '# L3\n; 繁體第三句。\n日本語の三行目。\n\n'+
  '# L4\n; 繁體第四句。\n日本語の四行目。\n\n'+
  '# L5\n日本語の五行目。\n';
 const zhPartial=
  '; Chinese (T) <zh-TW> to Chinese (S) <zh-Hans> localization document for `Ch01` naninovel script\n\n'+
  '# L1\n; 繁體第一句。\n简体第一句。\n\n'+
  '# L3\n; 繁體第三句。\n\n'+
  '# L4\n; 繁體第四句。\n<br>\n<i> </i>\n';
 fs.writeFileSync(path.join(aa,'game-localization-ja-scripts-01.bundle'),packBundle('CAB-ja',string(jaZhSrc),'2020.3.7f1'));
 fs.writeFileSync(path.join(aa,'game-localization-zhhans-scripts-01.bundle'),packBundle('CAB-zh',string(zhPartial),'2020.3.7f1'));
 const read=scenes.read('naninovel',root);
 assert.equal(read.length,1);
 assert.deepEqual(read[0].lines,['日本語の一行目。','日本語の二行目。','日本語の三行目。','日本語の四行目。','日本語の五行目。']);
 assert.deepEqual(read[0].zh,['简体第一句。','繁體第二句前半。\n繁體第二句後半。','繁體第三句。','繁體第四句。','']);
 const patched=nani.patchLines(read);
 assert.deepEqual(patched[0].lines,['简体第一句。','繁體第二句前半。\n繁體第二句後半。','繁體第三句。','繁體第四句。','日本語の五行目。']);

 // Empty zh-Hans document (header only) still falls back to Chinese source for every block
 const jaOnlyDoc={script:true,name:'Ch02.nani',src:'zh-tw',dst:'ja-jp',text:
  '; Chinese (T) <zh-TW> to Japanese <ja-JP> localization document for `Ch02` naninovel script\n\n# A\n; 繁體甲。\n日本語甲。\n'};
 const zhEmptyDoc={script:true,name:'Ch02.nani',src:'zh-tw',dst:'zh-hans',text:
  '; Chinese (T) <zh-TW> to Chinese (S) <zh-Hans> localization document for `Ch02` naninovel script\n'};
 const fromEmpty=nani.parse(Buffer.from(nani._internal.combine([jaOnlyDoc,zhEmptyDoc])[0].text));
 assert.deepEqual(fromEmpty.lines,['日本語甲。']);
 assert.deepEqual(fromEmpty.zh,['繁體甲。']);
 const fromNoZh=nani.parse(Buffer.from(nani._internal.combine([jaOnlyDoc])[0].text));
 assert.deepEqual(fromNoZh.lines,['日本語甲。']);
 assert.deepEqual(fromNoZh.zh,['繁體甲。']);

 // Non-Chinese source (English) never falls back to English source for missing/empty/tag-only zh blocks
 const jaEnSrc={script:true,name:'Ch03.nani',src:'en',dst:'ja-jp',text:
  '; English <en> to Japanese <ja-JP> localization document for `Ch03` naninovel script\n\n'+
  '# E1\n; First.\n一。\n\n# E2\n; Second.\n二。\n\n# E3\n; Third.\n三。\n\n# E4\n; Fourth.\n四。\n'};
 const zhEnPartial={script:true,name:'Ch03.nani',src:'en',dst:'zh-hans',text:
  '; English <en> to Chinese (S) <zh-Hans> localization document for `Ch03` naninovel script\n\n'+
  '# E1\n; First.\n第一。\n\n# E3\n; Third.\n\n# E4\n; Fourth.\n<br>\n'};
 const enRes=nani.parse(Buffer.from(nani._internal.combine([jaEnSrc,zhEnPartial])[0].text));
 assert.deepEqual(enRes.lines,['一。','二。','三。','四。']);
 assert.deepEqual(enRes.zh,['第一。','','','']);
});
