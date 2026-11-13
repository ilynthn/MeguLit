'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const account=require('../services/account.cjs'),{openStore}=require('../services/store.cjs');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'megulit-116-'));
test('#116: a synced sentence for a game not in this library keeps its title and is linked once the game is added',()=>{
 const dir=temp(),db=openStore(dir);
 try{
  account.kinds.sentences.apply(db,'s:x',{key:'s:x',updated_at:Date.now(),data:{text:'テスト文。',translation:'',created_at:1,game:'魔法使いの夜'}},dir,{now:Date.now});
  const collected=[...account.kinds.sentences.collect(db,dir,{now:Date.now}).values()][0];
  assert.equal(collected.game,'魔法使いの夜','sent back with its title, not as "no game"');
  db.prepare("INSERT INTO games(id,title) VALUES('g1','魔法使いの夜')").run();
  assert.equal(account.relinkGames(db),1);
  assert.equal(db.prepare('SELECT game_id FROM saved_sentences').get().game_id,'g1');
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('#116: nickname, a small avatar and the global style travel in the settings kind and never overwrite local values',()=>{
 const a=temp(),b=temp(),c=temp();
 try{
  fs.mkdirSync(path.join(a,'data','config'),{recursive:true});
  fs.writeFileSync(path.join(a,'data','config','online.json'),JSON.stringify({leaderboardName:'めぐみん',leaderboardEnabled:true}));
  fs.writeFileSync(path.join(a,'data','config','gal-preferences.json'),JSON.stringify({fontSize:40,gameProcess:'X.exe',fontPath:'C:\f.ttf'}));
  const png=path.join(a,'a.png');fs.writeFileSync(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'));require('../services/assets.cjs').set(a,'avatar',png);
  const records=account.kinds.settings.collect(null,a);
  assert.equal(records.get('profile').nickname,'めぐみん');assert.match(records.get('profile').avatar,/^data:image\/png;base64,/);
  assert.deepEqual(records.get('global-style').prefs,{fontSize:40});
  for(const key of ['profile','global-style'])account.kinds.settings.apply(null,key,{key,updated_at:Date.now(),data:records.get(key)},b);
  assert.equal(JSON.parse(fs.readFileSync(path.join(b,'data','config','online.json'),'utf8')).leaderboardName,'めぐみん');
  assert.ok(require('../services/assets.cjs').find(b,'avatar'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(b,'data','config','gal-preferences.json'),'utf8')).fontSize,40);
  fs.mkdirSync(path.join(c,'data','config'),{recursive:true});fs.writeFileSync(path.join(c,'data','config','online.json'),JSON.stringify({leaderboardName:'local'}));
  account.kinds.settings.apply(null,'profile',{key:'profile',updated_at:Date.now(),data:records.get('profile')},c);
  assert.equal(JSON.parse(fs.readFileSync(path.join(c,'data','config','online.json'),'utf8')).leaderboardName,'local');
 }finally{for(const d of [a,b,c])fs.rmSync(d,{recursive:true,force:true});}
});
test('#115: the lookup card picture is taken before the card shows, and its background follows the scroll',()=>{
 assert.match(read('web/reader/modules/selection.js'),/b\.precaptureReader\?\.\(\);\s*if\(shot\)card\.__megulitShot=shot;/);
 assert.match(read('web/reader/modules/v4.js'),/card\.__megulitShot/);
 /* 2026-11-14: the picture is the game window alone, so the card is never hidden for it */
 assert.doesNotMatch(read('web/reader/modules/selection.js'),/megulit-precapture/);
 assert.match(read('web/reader/modules/background.js'),/translateY\('\+n\.scrollTop\+'px\)/);
 assert.match(read('services/reader.cjs'),/cardScreenshots\.set\(id,\{id,image,expires:Date\.now\(\)\+180000\}\)/);
});
test('#115: a new thread context of the selected hook takes over and the new choice is remembered',()=>{
 const cs=read('native/HookBridge.cs');
 assert.match(cs,/static bool SameHookNewContext\(Candidate cur,Candidate sib\)/);
 assert.match(cs,/follow new context of the selected hook[^\n]*MemorySaved=false;Select\(tp\.Key\(\)\)/);
 assert.match(cs,/if\(chosen!=Selected\)MemorySaved=false;/);
});
