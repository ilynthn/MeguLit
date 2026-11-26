// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
function schema(db){db.exec(`CREATE TABLE IF NOT EXISTS anki_links(word_id INTEGER PRIMARY KEY,note_id INTEGER NOT NULL UNIQUE);CREATE TABLE IF NOT EXISTS anki_synced_reviews(review_id INTEGER PRIMARY KEY,word_id INTEGER NOT NULL);`);
 if(!db.prepare("SELECT value FROM meta WHERE key='anki-links-imported-v1'").get()){
  for(const row of db.prepare("SELECT payload FROM preserved_records WHERE collection='tome_anki_links'").all()){const link=JSON.parse(row.payload);if(Number.isSafeInteger(link.word_id)&&Number.isSafeInteger(link.note_id))db.prepare('INSERT OR IGNORE INTO anki_links VALUES(?,?)').run(link.word_id,link.note_id);}
  for(const row of db.prepare("SELECT payload FROM preserved_records WHERE collection='tome_anki_reviews'").all()){const review=JSON.parse(row.payload);if(Number.isSafeInteger(review.word_id)&&Number.isSafeInteger(review.review_id))db.prepare('INSERT OR IGNORE INTO anki_synced_reviews VALUES(?,?)').run(review.review_id,review.word_id);}
  db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run('anki-links-imported-v1',new Date().toISOString());
 }
}
function link(db,wordId,noteId){schema(db);if(Number.isSafeInteger(wordId)&&Number.isSafeInteger(noteId))db.prepare('INSERT OR REPLACE INTO anki_links VALUES(?,?)').run(wordId,noteId);}
const KANJI=/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff々〆ヶ]/;
const hira=s=>String(s||'').trim().replace(/[\u30a1-\u30f4]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
function matchesReading(entry,reading){
 const want=hira(reading);if(!want)return true;
 return Array.isArray(entry?.readings)&&entry.readings.some(r=>hira(r)===want);
}
function pickEntry(entries,word,reading=''){
 const list=Array.isArray(entries)?entries.filter(Boolean):[],w=String(word||'').trim(),r=hira(reading);
 if(!list.length||!w)return null;
 if(r){
  const byReading=list.filter(e=>Array.isArray(e.readings)&&e.readings.some(x=>hira(x)===r));
  const bySpelling=byReading.filter(e=>Array.isArray(e.spellings)&&e.spellings.includes(w));
  const hits=bySpelling.length?bySpelling:byReading.filter(e=>e.readings.some(x=>hira(x)===hira(w)));
  return hits[0]||null;
 }
 const bySpelling=list.filter(e=>Array.isArray(e.spellings)&&e.spellings.includes(w));
 const byKana=list.filter(e=>Array.isArray(e.readings)&&e.readings.some(x=>hira(x)===hira(w)));
 const hits=bySpelling.length?bySpelling:byKana;
 if(!hits.length)return null;
 if(!KANJI.test(w))return hits[0];
 if(hits.length===1)return hits[0];
 const distinct=new Set(hits.flatMap(e=>Array.isArray(e.readings)?e.readings.map(hira).filter(Boolean):[]));
 return distinct.size===1?hits[0]:null;
}
class AnkiSync{
 constructor({db,anki,config,resolveEntry=async()=>null}){this.db=db;this.anki=anki;this.config=config;this.resolve=resolveEntry;schema(db);}
 async run(){
  const notes=await this.anki.stats(this.config);if(!Array.isArray(notes))throw Error('ANKI_INVALID_RESPONSE');
  const {ankiUrl,ankiDeck,ankiModel}=require('../core/v4-config.cjs').cleanV4(this.config);
  const key='anki-lookup-after:'+JSON.stringify([ankiUrl,ankiDeck,ankiModel]);
  const progress=this.db.prepare('SELECT value FROM meta WHERE key=?'),saved=progress.get(key)?.value;
  const start=saved?notes.findIndex(n=>n.noteId===Number(saved))+1:0,matches=[];
  let attempts=0,lastAttempt,more=false;
  for(let i=0;i<notes.length;i++){
   const index=(start+i)%notes.length,note=notes[index];if(!Number.isSafeInteger(note.noteId))continue;
   const linked=this.db.prepare('SELECT word_id FROM anki_links WHERE note_id=?').get(note.noteId);let entry=null,wordId=linked?.word_id;
   if(!linked){
    const rawWord=String(note.word||''),rawReading=String(note.reading||''),wantReading=hira(rawReading)||(!KANJI.test(rawWord)?hira(rawWord):'');
    const rows=this.db.prepare('SELECT id,reading FROM vocabulary WHERE spelling=?').all(rawWord);
    const existing=rows.find(row=>String(row.reading||'')===rawReading)||(wantReading?rows.find(row=>hira(row.reading)===wantReading):null);
    wordId=existing?.id;
    if(!wordId&&note.word){
     if(attempts<300){attempts++;lastAttempt=note.noteId;try{const found=await this.resolve(note.word,rawReading);if(found&&matchesReading(found,rawReading)){entry=found;wordId=entry.id;}}catch{}}
     else more=true;
    }
   }
   if(Number.isSafeInteger(wordId))matches[index]={note,wordId,entry,linked:!!linked};
  }
  const resolved=matches.filter(Boolean);
  const result={linked:0,imported:0,reviews:0,status:0,skipped:notes.length-resolved.length};this.db.exec('BEGIN IMMEDIATE');
  try{for(const{note,wordId,entry,linked}of resolved){let word=this.db.prepare('SELECT id FROM vocabulary WHERE id=?').get(wordId);
    // A user deletion has priority over importing an Anki note again.
    if(!word&&(linked||this.db.prepare('SELECT 1 FROM word_trash WHERE word_id=?').get(wordId))){result.skipped++;continue;}
    if(!word&&entry){this.db.prepare('INSERT INTO vocabulary(id,spelling,reading,definitions,status,created_at,original) VALUES(?,?,?,?,0,?,?)').run(wordId,entry.spellings?.[0]||note.word,entry.readings?.[0]||note.reading||'',JSON.stringify(entry.definitions||[]),Math.floor(note.noteId/1000),JSON.stringify({entry,noteId:note.noteId,origin:'anki'}));result.imported++;word={id:wordId};}
    if(!word)continue;link(this.db,wordId,note.noteId);result.linked++;
    const status=Number(note.status);if(Number.isInteger(status)&&status>=0&&status<=4)result.status+=Number(this.db.prepare('UPDATE vocabulary SET status=? WHERE id=? AND status!=?').run(status,wordId,status).changes);
    for(const id of note.reviews||[]){if(!Number.isSafeInteger(id)||id<0)continue;const inserted=this.db.prepare('INSERT OR IGNORE INTO anki_synced_reviews VALUES(?,?)').run(id,wordId);if(inserted.changes){this.db.prepare('INSERT INTO review_events(word_id,reviewed_at) VALUES(?,?)').run(wordId,Math.floor(id/1000));result.reviews++;}}
   }
   if((more||saved)&&progress.get(key)?.value===saved){
    if(more)this.db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)').run(key,String(lastAttempt));
    else this.db.prepare('DELETE FROM meta WHERE key=?').run(key);
   }
   this.db.exec('COMMIT');return result;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
}
module.exports={AnkiSync,link,schema,pickEntry,matchesReading};
