const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Anki,fields,BACK}=require('../core/anki.cjs'),{removeManagedReading}=require('../services/anki-model.cjs');
function fake(){const anki=new Anki(),calls=[],state={fields:[...fields,'Reading'],note:null};anki.call=async(c,action,params={})=>{calls.push({action,params});switch(action){case'modelNames':return ['ToMe'];case'modelFieldNames':return [...state.fields];case'modelTemplates':return {JP:{Front:'{{Word}}',Back:'{{Reading}}'}};case'modelStyling':return {css:'old'};case'modelFieldAdd':state.fields.push(params.fieldName);return null;case'modelFieldRemove':state.fields=state.fields.filter(f=>f!==params.fieldName);return null;case'findNotes':return params.query.startsWith('note:')?[123]:[];case'notesInfo':return [{noteId:123,fields:{Reading:{value:'オビエル'}}}];case'addNote':state.note=params.note;return 123;case'updateModelTemplates':case'updateModelStyling':case'createDeck':case'storeMediaFile':return null;default:throw Error('Unexpected '+action);}};return {anki,calls,state};}
test('legacy ToMe mining gets a screenshot field and a card without standalone reading',async()=>{
 const {anki,calls,state}=fake();const result=await anki.sync({surface:'怯える',reading:'オビエル',sentence:'例文',meaning:'be afraid',pitch:[3]},{ankiModel:'ToMe',ankiDeck:'ToMe'},null,{screenshot:'jpeg-fixture'});
 assert(calls.some(c=>c.action==='modelFieldAdd'&&c.params.fieldName==='Screenshot'));assert(calls.some(c=>c.action==='storeMediaFile'&&c.params.data==='jpeg-fixture'));assert.match(state.note.fields.Screenshot,/<img src=/);assert(!Object.hasOwn(state.note.fields,'Reading'));assert.equal(result.screenshotAttached,true);assert.doesNotMatch(BACK,/\{\{Reading\}\}/);assert.match(BACK,/\{\{Screenshot\}\}/);
});
test('removing the obsolete managed reading field first backs up its values and leaves note identities intact',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-model-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const {anki,calls}=fake();const result=await removeManagedReading(root,{ankiModel:'ToMe'},anki),backup=JSON.parse(fs.readFileSync(result.backup,'utf8'));assert.equal(backup.readings[0].Reading,'オビエル');assert.equal(result.notesPreserved,1);assert.equal(result.readingRemoved,true);assert.equal(result.screenshotsEnabled,true);assert(!calls.some(c=>/guiAnswer|deleteNotes|deleteDeck/.test(c.action)));
 await assert.rejects(removeManagedReading(root,{ankiModel:'Imported deck'},anki),/ANKI_MODEL_NOT_MANAGED/);
});
test('managed mined notes attach manual audio, with original game voice identified separately',async()=>{
 const {anki,state}=fake();
 await anki.sync({surface:'word',reading:'reading',sentence:'sentence'},{ankiModel:'ToMe'},{data:'word-wave'},{sentenceAudio:{data:'game-wave'},gameAudio:true});
 assert.match(state.note.fields.Audio,/^<audio controls preload="none" src="tomoyo_/);
 assert.match(state.note.fields.SentenceAudio,/^<audio controls preload="none" src="tomoyo_g_/);
 assert.doesNotMatch(state.note.fields.Audio+state.note.fields.SentenceAudio,/autoplay|\[sound:/);
});

test('migrates legacy Reading values into empty WordReading fields before removing Reading',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-migrate-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const calls=[],state={
  fields:[...fields,'Reading'],
  notes:new Map([
   [1,{noteId:1,fields:{Word:{value:'怯える'},Reading:{value:'<div>オビエル</div>'}}}],
   [2,{noteId:2,fields:{Word:{value:'<span title="漢">しかし</span>'},Reading:{value:'しかし'}}}],
   [3,{noteId:3,fields:{Word:{value:'押し切る'},Reading:{value:'オシキル'},WordReading:{value:'おしきる（自定）'}}}],
   [4,{noteId:4,fields:{Word:{value:'<b>誰</b>'},Reading:{value:'&nbsp;<span class="カタ">ダレ</span><br>'},WordReading:{value:'<!-- メモ -->'}}}],
   [5,{noteId:5,fields:{Word:{value:'空白'},Reading:{value:'<br>&nbsp;'}}}]
  ])
 };
 const anki=new Anki();
 anki.call=async(_c,action,params={})=>{
  calls.push({action,params});
  switch(action){
   case'modelNames':return ['ToMe'];
   case'modelFieldNames':return [...state.fields];
   case'modelTemplates':return {JP:{Front:'{{Word}}',Back:'{{Reading}}'}};
   case'modelStyling':return {css:'old'};
   case'modelFieldAdd':
    state.fields.push(params.fieldName);
    for(const n of state.notes.values())if(!n.fields[params.fieldName])n.fields[params.fieldName]={value:''};
    return null;
   case'modelFieldRemove':
    state.fields=state.fields.filter(f=>f!==params.fieldName);
    for(const n of state.notes.values())delete n.fields[params.fieldName];
    return null;
   case'findNotes':return [...state.notes.keys()];
   case'notesInfo':return params.notes.map(id=>{const n=state.notes.get(id);return {noteId:n.noteId,fields:structuredClone(n.fields)};});
   case'updateNoteFields':{
    await new Promise(r=>setTimeout(r,5));
    assert.ok(state.fields.includes('WordReading'),'WordReading must exist before migration writes it');
    assert.ok(state.fields.includes('Reading'),'Reading must still exist while migration runs');
    const n=state.notes.get(params.note.id);
    for(const [k,v] of Object.entries(params.note.fields))n.fields[k]={value:v};
    return null;
   }
   case'updateModelTemplates':case'updateModelStyling':return null;
   default:throw Error('Unexpected '+action);
  }
 };
 const result=await removeManagedReading(root,{ankiModel:'ToMe'},anki);
 await new Promise(r=>setTimeout(r,20));
 assert.equal(result.readingRemoved,true);
 assert.equal(result.readingsMigrated,2);
 assert.equal(state.notes.get(1).fields.WordReading.value,'おびえる','HTML wrappers are stripped from migrated Reading');
 assert.equal(state.notes.get(2).fields.WordReading.value,'','kana-only words with kanji in HTML attributes stay blank');
 assert.equal(state.notes.get(3).fields.WordReading.value,'おしきる（自定）','existing WordReading is preserved');
 assert.equal(state.notes.get(4).fields.WordReading.value,'だれ','HTML/nbsp stripped and comment-only WordReading not overwritten by background fixReadings');
 assert.equal(state.notes.get(5).fields.WordReading.value,'');
 assert.ok(!state.fields.includes('Reading'));
 assert.equal(calls.filter(c=>c.action==='findNotes').length,1,'no background fixReadings scan runs during migration');
 const lastUpdateIdx=calls.findLastIndex(c=>c.action==='updateNoteFields');
 const removeIdx=calls.findIndex(c=>c.action==='modelFieldRemove'&&c.params.fieldName==='Reading');
 assert.ok(lastUpdateIdx>0&&removeIdx>lastUpdateIdx,'all WordReading updates must finish before Reading is removed');
});

test('keeps Reading intact when migration update fails or WordReading is unavailable, with no background writes',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-migrate-fail-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const calls=[],state={
  fields:[...fields,'Reading'],
  notes:new Map([
   [1,{noteId:1,fields:{Word:{value:'怯える'},Reading:{value:'オビエル'}}}],
   [2,{noteId:2,fields:{Word:{value:'誰'},Reading:{value:'ダレ'}}}],
   [3,{noteId:3,fields:{Word:{value:'押し切る'},Reading:{value:'オシキル'},WordReading:{value:'オシキル'}}}]
  ])
 };
 const anki=new Anki();
 anki.call=async(_c,action,params={})=>{
  calls.push({action,params});
  switch(action){
   case'modelNames':return ['ToMe'];
   case'modelFieldNames':return [...state.fields];
   case'modelTemplates':return {JP:{Front:'{{Word}}',Back:'{{Reading}}'}};
   case'modelStyling':return {css:'old'};
   case'modelFieldAdd':
    state.fields.push(params.fieldName);
    for(const n of state.notes.values())if(!n.fields[params.fieldName])n.fields[params.fieldName]={value:''};
    return null;
   case'modelFieldRemove':state.fields=state.fields.filter(f=>f!==params.fieldName);return null;
   case'findNotes':return [...state.notes.keys()];
   case'notesInfo':return params.notes.map(id=>{const n=state.notes.get(id);return {noteId:n.noteId,fields:structuredClone(n.fields)};});
   case'updateNoteFields':
    if(params.note.id===2)throw Error('AnkiConnect: failed to update note');
    state.notes.get(params.note.id).fields.WordReading={value:params.note.fields.WordReading};
    return null;
   case'updateModelTemplates':case'updateModelStyling':return null;
   default:throw Error('Unexpected '+action);
  }
 };
 await assert.rejects(removeManagedReading(root,{ankiModel:'ToMe'},anki),/failed to update note/);
 await new Promise(r=>setTimeout(r,20));
 assert.ok(state.fields.includes('Reading'),'Reading must not be removed if migration fails');
 assert.ok(!calls.some(c=>c.action==='modelFieldRemove'),'modelFieldRemove must not be called on migration failure');
 assert.equal(state.notes.get(3).fields.WordReading.value,'オシキル','background fixReadings must not mutate unrelated notes on failure');

 // If prepareModel does not provide WordReading (e.g. reused upgraded Anki instance), refuse to remove Reading.
 const noFieldCalls=[];
 const reused=new Anki();reused.upgraded=true;
 reused.call=async(_c,action)=>{
  noFieldCalls.push(action);
  if(action==='modelNames')return ['ToMe'];
  if(action==='modelFieldNames')return [...fields,'Reading','Screenshot'];
  if(action==='modelTemplates')return {JP:{Front:'{{Word}}',Back:'{{Reading}}'}};
  if(action==='modelStyling')return {css:'old'};
  if(action==='findNotes')return [];
  throw Error('Unexpected '+action);
 };
 await assert.rejects(removeManagedReading(root,{ankiModel:'ToMe'},reused),/ANKI_MODEL_UPGRADE_INCOMPLETE/);
 assert.ok(!noFieldCalls.includes('modelFieldRemove'),'Reading stays intact when WordReading is missing');
});
