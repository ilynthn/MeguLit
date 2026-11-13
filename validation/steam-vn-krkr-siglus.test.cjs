// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Steam VN adaptation (KiriKiri Z cx: 9-nine- Episode 4, ATRI -My Dear Moments-; Siglus multi-language: Summer Pockets).
   A: the cx program generator keeps its random state from one stage to the next (GARbro CxProgram.Clear keeps m_seed);
      restarting it decoded about half the entries of a cx archive wrong.
   B: KiriKiri Z Steam archives name entries by MD5 of the lower-case UTF-16LE path; a script's voice name is found
      under its own name, a folder named by its prefix or its last _part (sf/sf0001.ogg, ep1/kr0085_ep1.ogg).
   C: the library picks the program a Steam folder can start: SiglusEngine_Steam.exe is the engine's program, and an
      exe whose bitness has no steam_api DLL beside it is not the game.
   D (local copies, read only): pairing and voice counts on the installed games. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const cx=require('../services/original-engines/cx-filter.cjs');

test('A: cx decoding of ATRI entries over many program seeds',()=>{
 const scheme=cx.schemes().find(s=>s.titles.includes('ATRI -My Dear Moments-'));assert.ok(scheme&&scheme.cb,'ATRI scheme known');
 const dec=cx.filter(scheme);
 /* [adlr hash, first four encrypted bytes] of Ogg clips in ATRI's vol1.xp3, one per program seed (hash & 0x7f) */
 const vectors=[[2241691665,"8fa7a793"],[137479504,"cae2e2d6"],[2234533133,"4e666652"],[2819668052,"f5666652"],[993368455,"89a1a195"],[1062025600,"4e666652"],[3361174438,"a68e8eba"],[3706497954,"351d1d29"],[282358836,"557d7d49"],[3100929264,"99b1b185"],[379205837,"4e666652"],[3043211990,"95bdbd89"],[2603921241,"4e666652"],[4150001948,"2109093d"],[31761804,"e3d3cbff"],[786933422,"cfe7e7d3"],[4186596469,"6c444470"],[1190919730,"6f474773"],[3002061624,"58707044"],[1485033620,"8ca4a490"],[4167833526,"a58d8db9"],[1424741440,"270f0f3b"],[4075176826,"4e666652"],[771132175,"78505064"],[1672548837,"a98181b5"],[1624749631,"220a0a3e"],[2521935050,"90b8b88c"],[4280845694,"4169695d"],[2120244491,"7a525266"],[944009938,"9cb4b480"],[2949890582,"d2faface"],[1491834849,"6f474773"],[540015992,"b39b9baf"],[757910419,"2008083c"],[873762926,"7c545460"],[3547013836,"3f171723"],[2234974759,"259c9ca8"],[1711306783,"fbd3d3e7"],[3934426319,"4e666652"],[2071550854,"daf2f2c6"]];
 assert.ok(new Set(vectors.map(v=>v[0]&0x7f)).size>=30);
 for(const [hash,hex] of vectors)assert.equal(dec(hash,0,Buffer.from(hex,'hex')).toString('latin1'),'OggS','hash '+hash);
 const src=fs.readFileSync(path.join(__dirname,'..','services','original-engines','cx-filter.cjs'),'utf8');
 const gen=src.slice(src.indexOf('function generate('),src.indexOf('function run('));
 assert.ok(gen.indexOf('lcg(seed)')<gen.indexOf('for(let stage=5'),'random made once, before the stage loop');
});

test('B: hashed KiriKiri voice paths',()=>{
 const gv=require('../services/game-voice.cjs');
 assert.ok(gv.hashedPaths('sf0001').includes('sf/sf0001.ogg'));
 assert.ok(gv.hashedPaths('CAT_b101_001').includes('cat_b101_001.opus'));
 assert.ok(gv.hashedPaths('kr0085_ep1').includes('ep1/kr0085_ep1.ogg'));
 assert.deepEqual(gv.hashedPaths('voice/a01.wav').filter(p=>p.endsWith('a01.wav')).length>0,true);
 const md=s=>crypto.createHash('md5').update(Buffer.from(s,'utf16le')).digest('hex');
 /* a catalog's hashed map: md5 -> reader; a voice name resolves through it */
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-hx-'));
 try{const c=gv.catalog(dir);c.hashed.set(md('sf/sf0001.ogg'),()=>Buffer.from('OggS'));assert.equal(c.get('sf0001')().toString(),'OggS');assert.equal(c.get('zz9999'),null);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});

function pe(file,machine,size=210000){const b=Buffer.alloc(size);b.write('MZ',0,'latin1');b.writeUInt32LE(0x80,0x3c);b.write('PE\0\0',0x80,'latin1');b.writeUInt16LE(machine,0x84);fs.writeFileSync(file,b);}
test('C: Steam Siglus folder: SiglusEngine_Steam.exe, not a larger exe of the other bitness',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-exe-')),dir=path.join(root,'Summer Game');fs.mkdirSync(dir);
 try{pe(path.join(dir,'SiglusEngine_Steam.exe'),0x14c);pe(path.join(dir,'SummerGameRB.exe'),0x8664,400000);fs.writeFileSync(path.join(dir,'steam_api.dll'),'x');fs.writeFileSync(path.join(dir,'Scene.pck'),'x');
  const lib=require('../core/library.cjs');assert.equal(path.basename(lib.findGame(dir).exe),'SiglusEngine_Steam.exe');
  /* with the 64-bit steam_api the 64-bit program is the game */
  fs.rmSync(path.join(dir,'steam_api.dll'));fs.writeFileSync(path.join(dir,'steam_api64.dll'),'x');fs.renameSync(path.join(dir,'SiglusEngine_Steam.exe'),path.join(dir,'helper.exe'));
  assert.equal(path.basename(lib.findGame(dir).exe),'SummerGameRB.exe');}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});

const steam='e:/steam/steamapps/common/',have=n=>fs.existsSync(steam+n);
const sc=()=>require('../services/original-engines/scenes.cjs');
function cxPairs(dir){const e=sc().ENGINES['kirikiri-cx'];let total=0,paired=0;for(const s of e.scenes(dir)){const r=e.parse(s.read());r.lines.forEach((l,i)=>{if(!l.trim())return;total++;if((r.zh[i]||'').trim())paired++;});}return {total,paired};}
for(const [name,min] of [['9-nine-Episode 4',11690],['ATRI -My Dear Moments-',11201]])
 test('D: '+name+' Japanese lines paired with the release Chinese',{skip:!have(name)&&'no local copy',timeout:20*60e3},async()=>{
  /* a cold cx cache (fresh TEMP) decrypts in a worker first; wait for it, not for GARbro */
  const dir=steam+name;let id=sc().detect(dir);for(const end=Date.now()+18*60e3;sc().cxBuilds.size&&Date.now()<end;id=sc().detect(dir))await new Promise(r=>setTimeout(r,2000));
  assert.equal(id,'kirikiri-cx');const r=cxPairs(dir);if(!r.total)return;/* cache still building */assert.ok(r.paired>=min,JSON.stringify(r));});
test('D: Summer Pockets (Siglus dat tables): every story line has its Chinese column',{skip:!have('Summer Pockets')&&'no local copy'},()=>{
 const dir=steam+'Summer Pockets',e=sc().ENGINES.siglus,base=e.scenes(dir).filter(s=>/^\d\d_/.test(s.name)).map(s=>({name:s.name,lines:e.parse(s.read()).lines}));
 const p=e.patchLines(base,{dirs:[dir]});assert.ok(p);let total=0,paired=0;
 p.forEach((s,i)=>s.lines.forEach((t,j)=>{const ja=base[i].lines[j];if(!ja.trim())return;total++;if(t!==ja||!/[\u3040-\u30ff]/.test(ja)||/^[「]?『?[a-z]/i.test(ja.replace(/^「『/,'')))paired++;}));
 assert.ok(total>65000&&total-paired<=4,JSON.stringify({total,paired}));
});
test('D: game voices found for the scripts',{skip:!(have('ATRI -My Dear Moments-')&&have('Summer Pockets'))&&'no local copy'},()=>{
 const gv=require('../services/game-voice.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-gv-'));
 try{const a=gv.scan(root,steam+'ATRI -My Dear Moments-');if(a.voiced)assert.ok(a.found>=a.voiced-1,JSON.stringify(a));
  const s=gv.scan(root,steam+'Summer Pockets');assert.equal(s.found,s.voiced);assert.ok(s.voiced>27000);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('E: a translation slot quoted with ASCII quotes takes the Japanese brackets',()=>{
 const {unquoteSlot}=require('../services/original-engines/scenes.cjs');
 assert.equal(unquoteSlot('"救救我——"','「誰か助けて――」'),'「救救我——」');
 assert.equal(unquoteSlot('"（虽然是下定决心了）"','（色々決意したはいいが）'),'（虽然是下定决心了）');
 assert.equal(unquoteSlot('"这颗星球正在沉没——"','この星は沈みゆこうとしている――'),'这颗星球正在沉没——');
 assert.equal(unquoteSlot('他说""好""','「x」'),'他说""好""');
 assert.equal(unquoteSlot('"a""b"','「x」'),'「a"b」');
});
/* F (live test 2026-11-13, Summer Pockets + CLANNAD): Siglus draws and wraps Chinese itself, so the embed hooks no longer
   put a space after each character Shift-JIS lacks ("连 成一片", "几间 民房"). */
test('F: Siglus embed hooks insert no spaces into translations',()=>{
 for(const f of ['megulithook','siglus']){const src=fs.readFileSync(path.join(__dirname,'..','native',f,'Siglus.cpp'),'utf8');
  assert.ok(!/EMBED_INSERT_SPACE_AFTER_UNENCODABLE/.test(src),f);assert.ok((src.match(/EMBED_ABLE \| CODEC_UTF16/g)||[]).length>=4,f);}
});
/* G: a pairing made for another running script whose source folder is gone (Summer Pockets: paired from
   .megulit-japanese\dat, then the Japanese restore was undone) is searched for again instead of pairing nothing. */
test('G: Summer Pockets re-pairs after its old pairing source vanished',{skip:!have('Summer Pockets')&&'no local copy'},async()=>{
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');
 const exe=path.join(steam+'Summer Pockets','SiglusEngine_Steam.exe');db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',exe);
 const ot=require('../services/original-text.cjs'),data=fs.mkdtempSync(path.join(os.tmpdir(),'ot-sp-'));
 try{
  const first=await ot.autoPatch(data,db,'1',{drives:false,force:true});assert.ok(first.found,JSON.stringify(first));
  const file=path.join(data,'data','config','original-text.json'),s=JSON.parse(fs.readFileSync(file,'utf8'));
  s['1'].patch={...s['1'].patch,source:path.join(data,'gone','dat'),dir:path.join(data,'gone','dat'),runtimeSha:'0'.repeat(64)};s['1'].patchSearch={...s['1'].patchSearch,at:Date.now(),runtimeSha:s['1'].runtime.sha256};fs.writeFileSync(file,JSON.stringify(s));
  assert.equal((ot.scriptPairs(data,exe)?.tr||[]).filter(Boolean).length,0,'stale pairing pairs nothing');
  const again=await ot.autoPatch(data,db,'1',{drives:false});assert.ok(again.found,JSON.stringify(again));
  const p=ot.scriptPairs(data,exe);assert.ok(p.tr.filter(Boolean).length>60000,String(p.tr.filter(Boolean).length));
 }finally{fs.rmSync(data,{recursive:true,force:true});}
});
/* H (live test 2026-11-13, ATRI): the embed call also carries each line's Simplified and Traditional Chinese slot; the
   reader leaves those as the game has them instead of machine-translating Chinese. */
test('H: Chinese language slots in the embed call are not translated',async()=>{
 const {notJapanese,Reader}=require('../services/reader.cjs');
 for(const t of ['"我吗？\n这个嘛……算他的情妇吧？"','"我嗎？\n這個嘛……算他的情婦吧？"','只是个非法入室的陌生人'])assert.ok(notJapanese(t),t);
 for(const t of ['「あ・い・じ・ん！！？」','東京大学','完了','目的地','会議室','「……」','人間'])assert.ok(!notJapanese(t),t);
 const replies=[];const r=Object.create(Reader.prototype);r.gal={hooks:{embedReply:(id,trans)=>replies.push([id,trans])}};r.embedCached=()=>{throw new Error('no lookup for a Chinese slot');};
 await r.embedTranslate(7,'"我吗？这个嘛……算他的情妇吧？"');assert.deepEqual(replies,[[7,'']]);
});
/* I (live test 2026-11-13, PureStation): the slot after the Japanese is the release's own order (ja/zh-Hans/zh-Hant
   there, ja/en/zh-Hans/zh-Hant in ATRI); the game showed Traditional Chinese where its own UI is Simplified. */
test('I: KiriKiri cx takes the Simplified slot wherever it sits',()=>{
 const e=require('../services/original-engines/scenes.cjs').ENGINES['kirikiri-cx'];
 const rows=n=>Array.from({length:n},(_,k)=>['「これは'+k+'です」','「这是第'+k+'个，我们说过」','「這是第'+k+'個，我們說過」']);
 const r=e.parse(Buffer.from(JSON.stringify({scenes:[{rows:rows(10)}]})));assert.equal(r.zh[3],'「这是第3个，我们说过」');
 const en=Array.from({length:10},(_,k)=>['「これは'+k+'です」','"This is '+k+'"','「這是第'+k+'個，我們說過」']);
 assert.equal(e.parse(Buffer.from(JSON.stringify({scenes:[{rows:en}]}))).zh[2],'「這是第2個，我們說過」');
});
/* J (live test 2026-11-13, サノバウィッチ): a folder run through SmartSteamEmu starts the launcher's Target; the original
   exe beside it quits without Steam. */
test('J: SmartSteamEmu launcher target is the game program',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-sse-')),dir=path.join(root,'Witch');fs.mkdirSync(path.join(dir,'SmartSteamEmu'),{recursive:true});
 try{pe(path.join(dir,'Witch.exe'),0x14c,400000);pe(path.join(dir,'Witch_crack.exe'),0x14c,300000);fs.writeFileSync(path.join(dir,'data.xp3'),'XP3');
  const bs=String.fromCharCode(92),nl='\r\n',ini='# generated'+nl+'[Launcher]'+nl+'Target = '+['C:','Games','Witch','Witch_crack.exe'].join(bs)+nl+'StartIn = C:'+bs+'Games'+bs+nl;
  fs.writeFileSync(path.join(dir,'SmartSteamEmu','launcher.ini'),Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(ini,'utf16le')]));
  const lib=require('../core/library.cjs');assert.equal(path.basename(lib.findGame(dir).exe),'Witch_crack.exe');
  fs.rmSync(path.join(dir,'SmartSteamEmu'),{recursive:true});assert.equal(path.basename(lib.findGame(dir).exe),'Witch.exe');}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
