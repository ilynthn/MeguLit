// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-13 collected sentences keep the game's picture of that moment, only ever a frame without the dialogue box
   (services/sentence-scenes.cjs). The native side (GalWindowBridge sceneFrame / sceneProbe) is faked here; its own
   hashing is checked by GalWindowBridge.exe --scene-frame-self-test. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-sentence-scenes-'));process.env.MEGULIT_ROOT=root;
const {dispatch}=require('../services/bridge.cjs'),{openStore}=require('../services/store.cjs');
const saved=require('../services/saved-sentences.cjs'),scenes=require('../services/sentence-scenes.cjs'),{Reader}=require('../services/reader.cjs');
test.after(()=>{try{fs.rmSync(root,{recursive:true,force:true});}catch{}});
fs.mkdirSync(path.join(root,'data','config'),{recursive:true});
{const db=openStore(root);db.prepare("INSERT INTO games(id,title) VALUES('g1','Fixture'),('g2','Other')").run();db.close();}

const CLEAN='a5a5a5a5a5a5a5a5',NEAR='a5a5a5a5a5a5a5a4'/* 1 bit */,FAR='5a5a5a5a5a5a5a5a';
const picture=Buffer.from('clean-frame-jpeg').toString('base64');
function fakeReader({probe=CLEAN,frame={jpeg:picture,topHash:CLEAN,score:80}}={}){
 const r={root,gameId:'g1',frames:0,probes:0,gal:{sceneFrame:async()=>{r.frames++;r.onFrame?.();return frame;},sceneProbe:async()=>{r.probes++;return probe==null?null:{topHash:probe};}}};return r;}
const withDb=f=>{const db=openStore(root);try{return f(db);}finally{db.close();}};
const sentence=(text,gameId='g1')=>withDb(db=>saved.save(db,{gameId,text,translation:''}).id);
const sceneRow=id=>withDb(db=>scenes.sceneOf(db.prepare('SELECT original FROM saved_sentences WHERE id=?').get(id)?.original));
const files=(gameId='g1')=>{try{return fs.readdirSync(scenes.dirOf(root,gameId));}catch{return [];}};

test('a frame is remembered only while the dialogue box is hidden, and only the newest one, in memory',async()=>{
 const r=fakeReader();
 await scenes.remember(r);assert.equal(r.frames,0,'a new line (box shown) never captures');
 await scenes.remember(r,{hidden:true},0);assert.equal(r.frames,1);
 assert.deepEqual({...r.sentenceScene,at:0},{jpeg:picture,topHash:CLEAN,at:0,gameId:'g1'});
 assert.equal(files().length,0,'nothing is written to disk by remembering');
 /* the box comes back while the capture runs: the frame is dropped */
 const b=fakeReader();b.onFrame=()=>scenes.remember(b);await scenes.remember(b,{hidden:true},0);assert.equal(b.frames,1);assert.equal(b.sentenceScene,undefined);
 /* the box comes back during the settle wait: no capture at all */
 const c=fakeReader(),p=scenes.remember(c,{hidden:true},40);setTimeout(()=>scenes.remember(c),5);await p;assert.equal(c.frames,0);
 /* throttled: a second hide right away does not capture again */
 await scenes.remember(r,{hidden:true},0);assert.equal(r.frames,1);
 /* a fade (score 0) or a frame without a top hash is never remembered */
 const d=fakeReader({frame:{jpeg:picture,topHash:CLEAN,score:0}});await scenes.remember(d,{hidden:true},0);assert.equal(d.sentenceScene,undefined);
 const e=fakeReader({frame:{jpeg:picture,topHash:'',score:50}});await scenes.remember(e,{hidden:true},0);assert.equal(e.sentenceScene,undefined);
 /* the Library switch (library.json sceneShots:false) stops it */
 fs.writeFileSync(path.join(root,'data','config','library.json'),JSON.stringify({sceneShots:false}));
 try{const f=fakeReader();await scenes.remember(f,{hidden:true},0);assert.equal(f.frames,0);}finally{fs.rmSync(path.join(root,'data','config','library.json'));}
});

test('a sentence takes the clean frame only when the frame on screen matches it',async()=>{
 const r=fakeReader({probe:NEAR});await scenes.remember(r,{hidden:true},0);
 const id=sentence('一致する場面');const scene=await scenes.attach(r,id);
 assert.ok(scene);assert.equal(scene.hash,CLEAN);assert.match(scene.file,/^a5a5a5a5a5a5a5a5-\d+\.jpg$/);
 assert.deepEqual(sceneRow(id),scene);
 assert.equal(fs.readFileSync(path.join(scenes.dirOf(root,'g1'),scene.file)).toString(),'clean-frame-jpeg');
 /* attaching again keeps the first picture */
 assert.deepEqual(await scenes.attach(r,id),scene);
});

test('no clean frame, another scene, no probe or another game: nothing is stored',async()=>{
 const before=files().length;
 const none=fakeReader();const a=sentence('場面なし');assert.equal(await scenes.attach(none,a),null);assert.equal(none.probes,0);
 const far=fakeReader({probe:FAR});await scenes.remember(far,{hidden:true},0);const b=sentence('別の場面');assert.equal(await scenes.attach(far,b),null);
 const blind=fakeReader({probe:null});await scenes.remember(blind,{hidden:true},0);const c=sentence('見えない');assert.equal(await scenes.attach(blind,c),null);
 const moved=fakeReader();await scenes.remember(moved,{hidden:true},0);moved.gameId='g2';const d=sentence('別ゲーム','g2');assert.equal(await scenes.attach(moved,d),null);
 /* a probe that fails must not break anything */
 const broken=fakeReader();await scenes.remember(broken,{hidden:true},0);broken.gal.sceneProbe=async()=>{throw Error('native gone');};const e=sentence('壊れた');assert.equal(await scenes.attach(broken,e),null);
 for(const id of [a,b,c,e])assert.equal(sceneRow(id),null);assert.equal(sceneRow(d),null);
 assert.equal(files().length,before);assert.equal(files('g2').length,0);
});

test('sentences on the same remembered frame share one file, deleted with the last of them',async()=>{
 const r=fakeReader();await scenes.remember(r,{hidden:true},0);
 const a=sentence('共有その一'),b=sentence('共有その二');
 const sa=await scenes.attach(r,a),sb=await scenes.attach(r,b);
 assert.equal(sa.file,sb.file);assert.equal(files().filter(f=>f===sa.file).length,1);
 const file=path.join(scenes.dirOf(root,'g1'),sa.file);
 await dispatch({action:'sentence_delete',id:a});assert.ok(fs.existsSync(file),'still used by the other sentence');
 await dispatch({action:'sentence_delete',gameId:'g1',text:'共有その二'});assert.equal(fs.existsSync(file),false,'removed with the last sentence');
});

test('the reader attaches on the manual save and on the automatic (Anki) save, without waiting',async()=>{
 const events=[],runtime={root,folder:path.join(root,'data','config'),emit:(n,p)=>events.push(p),config:()=>({}),learning:()=>({installed:()=>true})};
 const reader=new Reader(runtime);reader.gameId='g1';let release;
 reader.gal={sceneFrame:async()=>({jpeg:picture,topHash:CLEAN,score:70}),sceneProbe:()=>new Promise(r=>{release=()=>r({topHash:CLEAN});})};
 await scenes.remember(reader,{hidden:true},0);
 const r=await reader.message({type:'sentenceSave',text:'手動で保存',translation:''});
 assert.deepEqual(r.replies[0].args,['手動で保存',true,'',true],'the save answered before the probe came back');
 const id=withDb(db=>saved.find(db,'g1','手動で保存').id);assert.equal(sceneRow(id),null);
 release();for(let i=0;i<50&&!sceneRow(id);i++)await new Promise(r=>setTimeout(r,10));
 assert.equal(sceneRow(id)?.hash,CLEAN);
 reader.gal.sceneProbe=async()=>({topHash:NEAR});
 await reader.mine({entry:{id:9001,spellings:['自動'],readings:['じどう']},args:{text:'自動で保存',translation:''},noteId:1});
 const auto=withDb(db=>saved.find(db,'g1','自動で保存'));assert.equal(auto.source,'auto');
 for(let i=0;i<50&&!sceneRow(auto.id);i++)await new Promise(r=>setTimeout(r,10));
 assert.equal(sceneRow(auto.id)?.hash,CLEAN);
 /* deleting from the reader removes the shared picture once the last sentence on it is gone */
 const file=path.join(scenes.dirOf(root,'g1'),sceneRow(id).file);
 await reader.message({type:'sentenceDelete',text:'手動で保存'});assert.ok(fs.existsSync(file));
 await reader.message({type:'sentenceDelete',text:'自動で保存'});assert.equal(fs.existsSync(file),false);
});

test('sentence_scene reads only strict file names of that game',async()=>{
 const r=fakeReader();await scenes.remember(r,{hidden:true},0);const id=sentence('読める画像');const scene=await scenes.attach(r,id);
 assert.deepEqual(await dispatch({action:'sentence_scene',id:'g1',file:scene.file}),{mime:'image/jpeg',data:picture});
 fs.writeFileSync(path.join(root,'data','secret.jpg'),'secret');
 for(const file of ['../../secret.jpg','..\\..\\secret.jpg','a5a5a5a5a5a5a5a5-1.jpg/../x','a5a5a5a5a5a5a5a5-1.png','A5A5A5A5A5A5A5A5-1.jpg','/etc/passwd','',null,{},['x'],scene.file+'\0','a5a5a5a5a5a5a5a5-12.jpg'])
  await assert.rejects(dispatch({action:'sentence_scene',id:'g1',file}),/SCENE_NOT_FOUND/,String(file));
 await assert.rejects(dispatch({action:'sentence_scene',id:'g2',file:scene.file}),/SCENE_NOT_FOUND/,'another game cannot read it');
 await assert.rejects(dispatch({action:'sentence_scene',file:scene.file}),/SCENE_NOT_FOUND/);
});

test('game_detail gives every sentence its scene (or null) and its source',async()=>{
 const r=fakeReader();await scenes.remember(r,{hidden:true},0);const id=sentence('詳細の場面');const scene=await scenes.attach(r,id);const plain=sentence('場面のない詳細');
 withDb(db=>db.prepare("INSERT INTO saved_sentences(game_id,text,translation,created_at,original) VALUES('g1','壊れた原本','',1,'not json')").run());
 withDb(db=>db.prepare("INSERT INTO saved_sentences(game_id,text,translation,created_at,original) VALUES('g1','偽の場面','',1,?)").run(JSON.stringify({scene:{file:'../x.jpg',hash:CLEAN,at:1}})));
 const detail=await dispatch({action:'game_detail',id:'g1',locale:'zh'});
 const by=Object.fromEntries(detail.sentences.map(s=>[s.text,s]));
 assert.deepEqual(by['詳細の場面'].scene,scene);assert.equal(by['場面のない詳細'].scene,null);
 assert.equal(by['壊れた原本'].scene,null);assert.equal(by['偽の場面'].scene,null);
 for(const s of detail.sentences){assert.ok(['manual','auto'].includes(s.source));assert.equal('original' in s,false);}
 assert.equal(by['場面のない詳細'].id,plain);
});

test('removing a game for good removes its sentence pictures',async()=>{
 withDb(db=>db.prepare("INSERT INTO games(id,title) VALUES('g3','Gone')").run());
 const r=fakeReader();r.gameId='g3';await scenes.remember(r,{hidden:true},0);const id=sentence('消える','g3');assert.ok(await scenes.attach(r,id));
 assert.equal(files('g3').length,1);
 await dispatch({action:'remove_game',id:'g3',permanent:true});
 assert.equal(fs.existsSync(scenes.dirOf(root,'g3')),false);
});
