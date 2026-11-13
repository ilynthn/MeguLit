'use strict';
/* 2026-11-13 opening live test of 9-nine Ep4 / 千恋＊万花 / 魔法少女ノ魔女裁判: KiriKiri krkrsteam builds keep the text language in
   Steam's remote storage (userdata/<user>/<appid>/remote/datasc.ksd) or SteamEmu/Saves, not in data_anchor.ksd; only the text
   language key is switched (not uiLanguageType, subLanguageType, langinit_cn or a per-backlog textlang); an undo whose value
   the game already put back finishes; the reader window is put back when anything moved it while bound. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const LS=require('../core/game-language-switch.cjs'),{readKrkr,writeKrkr}=LS._internal;
const tmp=p=>fs.mkdtempSync(path.join(os.tmpdir(),'megulit-o3-'+p));
const enc=s=>[...s].map(c=>'\\x'+c.codePointAt(0).toString(16)).join('');
function ksd(text){const body=Buffer.from(text,'utf16le'),z=zlib.deflateSync(body),h=Buffer.alloc(21);Buffer.from([0xFE,0xFE,0x02,0xFF,0xFE]).copy(h);h.writeBigUInt64LE(BigInt(z.length),5);h.writeBigUInt64LE(BigInt(body.length),13);return Buffer.concat([h,z]);}
const noSteam={steamRunning:()=>false,registry:{query:()=>[],set:()=>{throw Error('no registry');}}};

function steamGame(){
 const root=tmp('steam'),appData=tmp('app'),game=path.join(root,'steamapps','common','Nine');fs.mkdirSync(path.join(game,'plugin'),{recursive:true});
 fs.writeFileSync(path.join(game,'data.xp3'),'XP3');fs.writeFileSync(path.join(game,'plugin','krkrsteam.dll'),'x');
 fs.writeFileSync(path.join(game,'nine.cf'),'datapath="'+enc('$(appdatapath)/maker/nine')+'"\n');
 fs.writeFileSync(path.join(root,'steamapps','appmanifest_1424660.acf'),'"AppState"\n{\n\t"appid"\t\t"1424660"\n\t"installdir"\t\t"Nine"\n}\n');
 const anchor=path.join(appData,'maker','nine');fs.mkdirSync(anchor,{recursive:true});
 fs.writeFileSync(path.join(anchor,'data_anchor.ksd'),ksd('%[\n "langStore" => void,\n "volume" => 80\n]'));
 const remote=path.join(root,'userdata','12345','1424660','remote');fs.mkdirSync(remote,{recursive:true});
 const sc=path.join(remote,'datasc.ksd');
 fs.writeFileSync(sc,ksd('%[\n "languageType" => 1,\n "langUserFontFace0" => "x",\n "langinit_cn" => 1,\n "subLanguageType" => -1,\n "uiLanguageType" => 1,\n "log" => [ %[ "textlang" => "cn" ], %[ "textlang" => "jp" ] ]\n]'));
 return {root,appData,game,sc,env:{...noSteam,appData}};
}

test('krkrsteam: the text language is read and switched in Steam remote storage, only languageType',()=>{
 const g=steamGame();
 const d=LS.detect(g.game,g.env);assert.equal(d.state,'restorable');assert.deepEqual(d.changes.map(c=>[path.basename(c.where),c.key,c.from,c.to]),[['datasc.ksd','languageType',1,0]]);
 LS.apply(g.game,g.env);const t=readKrkr(fs.readFileSync(g.sc)).text;
 assert.match(t,/"languageType" => 0,/);assert.match(t,/"uiLanguageType" => 1,/);assert.match(t,/"subLanguageType" => -1,/);assert.match(t,/"langinit_cn" => 1,/);assert.match(t,/"textlang" => "cn"/);
 /* the game was closed by the user after picking English again: the value is back, the undo finishes and drops its backup */
 const now=readKrkr(fs.readFileSync(g.sc));fs.writeFileSync(g.sc,writeKrkr(now,now.text.replace('"languageType" => 0','"languageType" => 1').replace('%[','%[\n "volume" => 3,')));
 assert.deepEqual(LS.restore(g.game,g.env).skipped,[]);assert.ok(!fs.existsSync(path.join(g.game,'.megulit-japanese')));
 for(const d of [g.root,g.appData])fs.rmSync(d,{recursive:true,force:true});
});
test('a Steam emulator keeps the same save in SteamEmu/Saves; already Japanese text is left alone',()=>{
 const game=tmp('emu');fs.writeFileSync(path.join(game,'data.xp3'),'XP3');fs.mkdirSync(path.join(game,'SteamEmu','Saves'),{recursive:true});
 fs.writeFileSync(path.join(game,'SteamEmu','Saves','datasc.ksd'),ksd('%[\n "languageType" => 0,\n "uiLanguageType" => 2\n]'));
 assert.equal(LS.detect(game,{...noSteam,appData:tmp('a')}).state,'already');
 fs.writeFileSync(path.join(game,'SteamEmu','Saves','datasc.ksd'),ksd('%[\n "languageType" => 2,\n "uiLanguageType" => 2\n]'));
 assert.deepEqual(LS.detect(game,{...noSteam,appData:tmp('b')}).changes.map(c=>c.key),['languageType']);
 fs.rmSync(game,{recursive:true,force:true});
});
test('the reader window is put back when its real rect strayed from the cached one',()=>{
 const cs=fs.readFileSync(path.join(__dirname,'..','native','GalWindowBridge.cs'),'utf8');
 assert.match(cs,/bool strayed=HasLastRect&&GetWindowRect\(Overlay,out placed\)/);assert.match(cs,/if\(strayed\|\|!HasLastRect\|\|!IsShown/);
});
