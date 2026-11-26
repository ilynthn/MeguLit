'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Anki,answerReading,fields}=require('../core/anki.cjs'),{cleanV4}=require('../core/v4-config.cjs');
const plain=v=>String(v||'').replace(/<[^<>]*>/g,'').replace(/&nbsp;/gi,' ').trim();
async function removeManagedReading(root,config,anki=new Anki()){
 const c=cleanV4(config);if(!['MeguLit','ToMe','tomoyo_megumin'].includes(c.ankiModel))throw Error('ANKI_MODEL_NOT_MANAGED');
 const before=await anki.call(c,'modelFieldNames',{modelName:c.ankiModel});if(fields.some(f=>!before.includes(f)))throw Error('ANKI_MODEL_NOT_MANAGED');
 const templates=await anki.call(c,'modelTemplates',{modelName:c.ankiModel}),styling=await anki.call(c,'modelStyling',{modelName:c.ankiModel});
 const ids=await anki.call(c,'findNotes',{query:'note:"'+c.ankiModel.replace(/"/g,'\\"')+'"'}),readings=[],toMigrate=[];
 if(before.includes('Reading'))for(let i=0;i<ids.length;i+=500){
  const notes=await anki.call(c,'notesInfo',{notes:ids.slice(i,i+500)});
  for(const note of notes){
   const reading=String(note.fields?.Reading?.value||'');
   readings.push({noteId:note.noteId,Reading:reading});
   const cleanReading=plain(reading);
   if(plain(note.fields?.WordReading?.value)||!cleanReading)continue;
   const word=plain(note.fields?.Word?.value);
   const want=answerReading(word,cleanReading);
   if(want)toMigrate.push({noteId:note.noteId,WordReading:want});
  }
 }
 const folder=path.join(root,'migration','anki-model-backups');fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,Date.now()+'-'+crypto.randomUUID()+'.json');
 fs.writeFileSync(file,JSON.stringify({schema:1,model:c.ankiModel,createdAt:new Date().toISOString(),fields:before,templates,styling,readings},null,2),{flag:'wx'});
 // Suppress background fixReadings() while migrating and removing Reading so no concurrent writes race or mutate on failure.
 const {available}=await anki.prepareModel(c,{fixReadings:false});
 let readingsMigrated=0;
 if(before.includes('Reading')){
  if(!available.includes('WordReading'))throw Error('ANKI_MODEL_UPGRADE_INCOMPLETE');
  for(const item of toMigrate){
   await anki.call(c,'updateNoteFields',{note:{id:item.noteId,fields:{WordReading:item.WordReading}}});
   readingsMigrated++;
  }
  await anki.call(c,'modelFieldRemove',{modelName:c.ankiModel,fieldName:'Reading'});
 }
 const after=await anki.call(c,'modelFieldNames',{modelName:c.ankiModel});if(after.includes('Reading')||!after.includes('Screenshot'))throw Error('ANKI_MODEL_UPGRADE_INCOMPLETE');
 return {model:c.ankiModel,readingRemoved:before.includes('Reading'),readingsMigrated,screenshotsEnabled:true,backup:file,notesPreserved:ids.length};
}
module.exports={removeManagedReading};
