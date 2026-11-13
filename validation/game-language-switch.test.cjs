'use strict';
// E525 Japanese restore for multi-language releases: KiriKiri system-variable save, Unity settings, Steam language.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const LS=require('../core/game-language-switch.cjs'),{readKrkr,writeKrkr,japaneseLike,setAcfLanguage,decodeCf,prefPairs}=LS._internal;
const tmp=p=>fs.mkdtempSync(path.join(os.tmpdir(),'megulit-ls-'+p));
const enc=s=>[...s].map(c=>'\\x'+c.codePointAt(0).toString(16)).join('');
function ksd(text,prefix=Buffer.alloc(0)){const body=Buffer.from(text,'utf16le'),z=zlib.deflateSync(body),h=Buffer.alloc(21);Buffer.from([0xFE,0xFE,0x02,0xFF,0xFE]).copy(h);h.writeBigUInt64LE(BigInt(z.length),5);h.writeBigUInt64LE(BigInt(body.length),13);return Buffer.concat([prefix,h,z]);}
const noSteam={steamRunning:()=>false,registry:{query:()=>[],set:()=>{throw Error('no registry');}}};

test('language codes keep the style of the value they replace',()=>{
 assert.equal(japaneseLike('en'),'ja');assert.equal(japaneseLike('EN'),'JA');assert.equal(japaneseLike('English'),'Japanese');assert.equal(japaneseLike('english'),'japanese');
 assert.equal(japaneseLike('en-US'),'ja-JP');assert.equal(japaneseLike('zh_CN'),'ja_JP');assert.equal(japaneseLike('zh-Hans'),'japanese');assert.equal(japaneseLike('ja'),null);assert.equal(japaneseLike('bgm01'),null);
 assert.equal(decodeCf(enc('$(appdatapath)/ぱれっと/x')),'$(appdatapath)/ぱれっと/x');
});

test('KiriKiri: the language key in the system save (BMP-prefixed zlib .ksd) goes to Japanese and back',()=>{
 const game=tmp('krkr'),appData=tmp('app');fs.writeFileSync(path.join(game,'data.xp3'),'XP3');fs.mkdirSync(path.join(game,'plugin'));fs.writeFileSync(path.join(game,'plugin','krkrsteam.dll'),'x');
 fs.writeFileSync(path.join(game,'game.cf'),'datapath="'+enc('$(appdatapath)/メーカー/game')+'"\n');
 const dir=path.join(appData,'メーカー','game');fs.mkdirSync(dir,{recursive:true});
 const text='(const) %[\n "core" => (const) %[\n  "langStore" => void,\n  "textLanguageType" => 1,\n  "volume" => 80\n ]\n]';
 const file=path.join(dir,'data_anchor.ksd'),orig=ksd(text,Buffer.from('BM-thumbnail'));fs.writeFileSync(file,orig);
 const env={...noSteam,appData};
 let d=LS.detect(game,env);assert.equal(d.state,'restorable');assert.equal(d.engine,'kirikiri');assert.deepEqual(d.changes.map(c=>[c.key,c.from,c.to]),[['textLanguageType',1,0]]);
 const r=LS.apply(game,env);assert.equal(r.applied,1);
 const now=readKrkr(fs.readFileSync(file));assert.match(now.text,/"textLanguageType" => 0,/);assert.ok(now.prefix.equals(Buffer.from('BM-thumbnail')),'thumbnail kept');assert.match(now.text,/"volume" => 80/);
 assert.equal(LS.detect(game,env).state,'applied');
 /* the game rewrote its save on exit (other values changed): undo puts back only the language */
 fs.writeFileSync(file,writeKrkr(now,now.text.replace('"volume" => 80','"volume" => 50')));
 const u=LS.restore(game,env);assert.deepEqual(u.skipped,[]);
 const back=readKrkr(fs.readFileSync(file)).text;assert.match(back,/"textLanguageType" => 1,/);assert.match(back,/"volume" => 50/);
 assert.ok(!fs.existsSync(path.join(game,'.megulit-japanese')));
 /* unchanged since apply → byte-for-byte original */
 fs.writeFileSync(file,orig);LS.apply(game,env);LS.restore(game,env);assert.ok(fs.readFileSync(file).equals(orig));
 /* the user picked another language in the game after the switch: undo leaves that choice alone */
 LS.apply(game,env);const cur=readKrkr(fs.readFileSync(file));fs.writeFileSync(file,writeKrkr(cur,cur.text.replace('=> 0,','=> 3,')));
 assert.deepEqual(LS.restore(game,env).skipped,[file]);assert.match(readKrkr(fs.readFileSync(file)).text,/=> 3,/);fs.rmSync(path.join(game,'.megulit-japanese'),{recursive:true,force:true});
 /* already Japanese → nothing to do (no Steam change either) */
 fs.writeFileSync(file,ksd(text.replace('=> 1','=> 0')));assert.equal(LS.detect(game,env).state,'already');
 fs.rmSync(game,{recursive:true,force:true});fs.rmSync(appData,{recursive:true,force:true});
});

function unityGame(root,name,company,product){const g=path.join(root,'steamapps','common',name),data=path.join(g,name+'_Data');fs.mkdirSync(path.join(data,'StreamingAssets'),{recursive:true});fs.mkdirSync(path.join(data,'Managed'));
 fs.writeFileSync(path.join(data,'globalgamemanagers'),'x');fs.writeFileSync(path.join(data,'app.info'),company+'\n'+product);return {g,data};}

test('Unity: JSON settings, PlayerPrefs strings and BinaryFormatter preference dictionaries',()=>{
 const root=tmp('unity'),home=tmp('home'),localLow=path.join(home,'AppData','LocalLow');
 const {g,data}=unityGame(root,'Game','Maker','Game');fs.writeFileSync(path.join(data,'StreamingAssets','langja.cy'),'x');
 const low=path.join(localLow,'Maker','Game');fs.mkdirSync(path.join(low,'Saves'),{recursive:true});
 const json='{"objectJsonMap":{"keys":["Loc"],"values":["{\\"SelectedLocale\\":\\"en\\"}"]},"textLanguage":"English"}';fs.writeFileSync(path.join(low,'Saves','Settings.json'),json);
 /* Dictionary<Int32,Single>: first pair inline after the member list, the rest as records; key 13 = Language */
 const head=Buffer.from('System.Collections.Generic.KeyValuePair`2[[System.Int32, mscorlib, Version=4.0.0.0],[System.Single, mscorlib]]\x02\x00\x00\x00\x03key\x05value','latin1');
 const pair=(k,v,first)=>{const b=Buffer.alloc(first?16:17);if(first){b.writeUInt16LE(0,0);b[2]=8;b[3]=0x0b;b.writeInt32LE(2,4);b.writeInt32LE(k,8);b.writeFloatLE(v,12);}else{b[0]=1;b.writeInt32LE(-5-k,1);b.writeInt32LE(-4,5);b.writeInt32LE(k,9);b.writeFloatLE(v,13);}return b;};
 const sav=Buffer.concat([head,pair(0,52,true),pair(1,10,false),pair(13,0,false),pair(14,1,false),Buffer.from([0x0b])]);fs.writeFileSync(path.join(low,'save_preferences.sav'),sav);
 assert.deepEqual(prefPairs(sav,13).map(p=>p.value),[0]);
 const reg={'HKCU\\Software\\Maker\\Game':[{name:'language_h123',type:'REG_BINARY',data:Buffer.from('en\0').toString('hex').toUpperCase()},{name:'Screenmanager Width_h1',type:'REG_DWORD',data:'0x500'}]};
 const registry={query:k=>reg[k]||[],set:(k,n,t,d)=>{reg[k].find(v=>v.name===n).data=d;}};
 const env={home,localLow,registry,steamRunning:()=>false,prefKeyFor:()=>13};
 const d=LS.detect(g,env);assert.equal(d.state,'restorable');assert.equal(d.engine,'unity');assert.equal(d.files,3);
 LS.apply(g,env);
 assert.equal(fs.readFileSync(path.join(low,'Saves','Settings.json'),'utf8'),'{"objectJsonMap":{"keys":["Loc"],"values":["{\\"SelectedLocale\\":\\"ja\\"}"]},"textLanguage":"Japanese"}');
 assert.equal(Buffer.from(reg['HKCU\\Software\\Maker\\Game'][0].data,'hex').toString(),'ja\0');
 assert.deepEqual(prefPairs(fs.readFileSync(path.join(low,'save_preferences.sav')),13).map(p=>p.value),[22]);
 assert.deepEqual(prefPairs(fs.readFileSync(path.join(low,'save_preferences.sav')),1).map(p=>p.value),[10],'other preferences untouched');
 LS.restore(g,env);
 assert.equal(fs.readFileSync(path.join(low,'Saves','Settings.json'),'utf8'),json);assert.ok(fs.readFileSync(path.join(low,'save_preferences.sav')).equals(sav));
 assert.equal(Buffer.from(reg['HKCU\\Software\\Maker\\Game'][0].data,'hex').toString(),'en\0');
 /* no Japanese resources → never switched */
 fs.rmSync(path.join(data,'StreamingAssets','langja.cy'));assert.notEqual(LS.detect(g,env).state,'restorable');
 fs.rmSync(root,{recursive:true,force:true});fs.rmSync(home,{recursive:true,force:true});
});

test('Steam language: guide while Steam runs, local appmanifest write when it is closed, undo',()=>{
 const root=tmp('steam'),home=tmp('home2');const {g,data}=unityGame(root,'Mano','Studio','mano');
 fs.writeFileSync(path.join(data,'Managed','Assembly-CSharp.dll'),'..SteamApps.GetCurrentGameLanguage..');
 const acf=path.join(root,'steamapps','appmanifest_42.acf'),text='"AppState"\n{\n\t"appid"\t\t"42"\n\t"installdir"\t\t"Mano"\n\t"UserConfig"\n\t{\n\t\t"language"\t\t"english"\n\t}\n\t"MountedConfig"\n\t{\n\t\t"language"\t\t"english"\n\t}\n}\n';fs.writeFileSync(acf,text);
 let running=true;const env={home,localLow:path.join(home,'LL'),registry:{query:()=>[],set:()=>{}},steamRunning:()=>running,steamJapanese:true};
 let d=LS.detect(g,env);assert.equal(d.state,'steam-guide');assert.equal(d.appid,'42');assert.equal(d.steamLanguage,'english');
 assert.throws(()=>LS.apply(g,env),/NOTHING_TO_RESTORE|STEAM_RUNNING/);
 assert.equal(LS.detect(g,{...env,steamJapanese:false}).state,'none','store without Japanese: nothing offered');
 running=false;d=LS.detect(g,env);assert.equal(d.state,'restorable');assert.equal(d.mode,'steam');
 assert.equal(LS.apply(g,env).mode,'steam');const now=fs.readFileSync(acf,'utf8');
 assert.match(now,/"UserConfig"\s*\{\s*"language"\s+"japanese"/);assert.match(now,/"MountedConfig"\s*\{\s*"language"\s+"english"/,'only the user choice changes; Steam does the rest');
 /* Steam rewrote the manifest meanwhile */
 fs.writeFileSync(acf,now.replace('"Mano"','"Mano"\n\t"LastPlayed"\t\t"1"'));LS.restore(g,env);assert.match(fs.readFileSync(acf,'utf8'),/"UserConfig"\s*\{\s*"language"\s+"english"/);
 assert.match(setAcfLanguage('"AppState"\n{\n\t"appid"\t\t"1"\n}\n','japanese'),/"UserConfig"\n\t\{\n\t\t"language"\t\t"japanese"/);
 fs.rmSync(root,{recursive:true,force:true});fs.rmSync(home,{recursive:true,force:true});
});

test('the Japanese restore tool offers the language switch for KiriKiri and Unity folders',()=>{
 const jr=require('../core/japanese-restore.cjs'),game=tmp('jr'),appData=tmp('jra');fs.writeFileSync(path.join(game,'data.xp3'),'XP3');
 fs.writeFileSync(path.join(game,'g.cf'),'datapath="'+enc('$(appdatapath)/g')+'"\n');fs.mkdirSync(path.join(appData,'g'));fs.writeFileSync(path.join(appData,'g','datasu.ksd'),ksd('%[ "textLanguageType" => 2 ]'));
 const d=jr.detect(game,{...noSteam,appData});assert.equal(d.adapter,'language-switch');assert.equal(d.state,'restorable');
 const app=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8');assert.match(app,/'steam-guide':n=>/);assert.match(app,/data-jr-steam/);
 assert.match(fs.readFileSync(path.join(__dirname,'../services/bridge.cjs'),'utf8'),/case 'jp_restore_steam'/);
 fs.rmSync(game,{recursive:true,force:true});fs.rmSync(appData,{recursive:true,force:true});
});

test('cf datapath: plain text and mixed escapes decode without throwing',()=>{
 assert.equal(decodeCf('savedata'),'savedata');assert.equal(decodeCf('$(appdatapath)\\x30d1'),'$(appdatapath)パ');
});

test('JSON settings: undo after the game rewrote the file puts back every switched key',()=>{
 const root=tmp('unity2'),home=tmp('home2'),localLow=path.join(home,'AppData','LocalLow');
 const {g,data}=unityGame(root,'Game','Maker','Game');fs.writeFileSync(path.join(data,'StreamingAssets','langja.cy'),'x');
 const low=path.join(localLow,'Maker','Game');fs.mkdirSync(path.join(low,'Saves'),{recursive:true});
 const file=path.join(low,'Saves','Settings.json');
 fs.writeFileSync(file,'{"objectJsonMap":{"keys":["Loc"],"values":["{\\"SelectedLocale\\":\\"en\\"}"]},"textLanguage":"English","volume":1}');
 const env={home,localLow,registry:{query:()=>[],set:()=>{}},steamRunning:()=>false,prefKeyFor:()=>13};
 LS.apply(g,env);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('"volume":1','"volume":2'));
 const u=LS.restore(g,env);assert.deepEqual(u.skipped,[]);
 assert.equal(fs.readFileSync(file,'utf8'),'{"objectJsonMap":{"keys":["Loc"],"values":["{\\"SelectedLocale\\":\\"en\\"}"]},"textLanguage":"English","volume":2}');
 fs.rmSync(root,{recursive:true,force:true});fs.rmSync(home,{recursive:true,force:true});
});
