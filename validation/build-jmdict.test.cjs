'use strict';
/* tools/build-jmdict.cjs turns the official JMdict_e.gz and JmdictFurigana.txt into the files core/learning-native.cjs reads.
   Run against the real 2026-11-26 release (219,246 entries, 1,202 new since the 2026-10 copy): every entry of the old
   jmdict.json keeps its Chinese definitions and freq_rank by id, and spellings / readings / pos / priority / ke_inf / re_inf /
   re_restr / misc / kana_only match the old file except where EDRDG edited the entry since (spellings 312, readings 179, ke_inf
   439, pos 149, misc 200, priority 53 entries). Here: a two-entry excerpt, nothing downloaded. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {execFileSync}=require('node:child_process');

const XML=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE JMdict [
<!ENTITY adv "adverb (fukushi)">
<!ENTITY n "noun (common) (futsuumeishi)">
<!ENTITY uk "word usually written using kana alone">
<!ENTITY rK "rarely used kanji form">
<!ENTITY arch "archaic">
<!ENTITY math "mathematics">
]>
<!-- JMdict created: 2026-11-26 -->
<JMdict>
<entry>
<ent_seq>1188850</ent_seq>
<k_ele><keb>いつの間にか</keb><ke_pri>ichi1</ke_pri><ke_pri>spec1</ke_pri></k_ele>
<k_ele><keb>何時の間にか</keb></k_ele>
<r_ele><reb>いつのまにか</reb><re_pri>ichi1</re_pri></r_ele>
<sense><pos>&adv;</pos><gloss>before one knows</gloss><gloss>unawares</gloss></sense>
</entry>
<entry>
<ent_seq>9999990</ent_seq>
<k_ele><keb>試験語</keb><ke_inf>&rK;</ke_inf></k_ele>
<r_ele><reb>しけんご</reb></r_ele>
<r_ele><reb>ためしご</reb><re_restr>試験語</re_restr><re_pri>nf12</re_pri></r_ele>
<sense><pos>&n;</pos><misc>&uk;</misc><gloss>test word</gloss></sense>
<sense><field>&math;</field><misc>&arch;</misc><gloss>old sense &amp; more</gloss></sense>
</entry>
</JMdict>`;

test('builds jmdict.json, jmdict.english.json and jmdict-furigana.json from the official files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-build-jmdict-')),cache=path.join(dir,'cache'),previous=path.join(dir,'old'),out=path.join(dir,'out');
 fs.mkdirSync(cache);fs.mkdirSync(previous);
 fs.writeFileSync(path.join(cache,'JMdict_e.gz'),zlib.gzipSync(XML));
 fs.writeFileSync(path.join(cache,'JmdictFurigana.txt'),'﻿何時の間にか|いつのまにか|0-1:いつ;3:ま\nいつの間にか|いつのまにか|3:ま\n後一歩|あといっぽ|0:あと;1:いっ;2:ぽ\n');
 fs.writeFileSync(path.join(previous,'jmdict.json'),JSON.stringify([{id:1188850,definitions:['不知不觉；不知何时；未察觉中'],freq_rank:1113}]));
 execFileSync(process.execPath,[path.join(__dirname,'..','tools','build-jmdict.cjs'),out,'--previous',previous,'--cache',cache],{stdio:'pipe'});
 const zh=JSON.parse(fs.readFileSync(path.join(out,'jmdict.json'),'utf8')),en=JSON.parse(fs.readFileSync(path.join(out,'jmdict.english.json'),'utf8'));
 const [itsu,word]=zh;
 assert.deepEqual([itsu.spellings,itsu.readings,itsu.definitions,itsu.freq_rank,itsu.priority],[['いつの間にか','何時の間にか'],['いつのまにか'],['不知不觉；不知何时；未察觉中'],1113,['ichi1','spec1']]);
 assert.deepEqual([itsu.ke_pri,itsu.re_pri,itsu.pos,itsu.kana_only],[[['ichi1','spec1'],[]],[['ichi1']],['adverb (fukushi)'],false]);
 assert.equal(itsu.definitions_lang,undefined,'Chinese kept by id');
 assert.deepEqual([word.ke_inf,word.re_restr,word.re_pri,word.misc,word.kana_only,word.freq_rank],[[['rK']],[[],['試験語']],[[],['nf12']],['arch','uk'],true,6000]);
 assert.deepEqual([word.definitions,word.definitions_lang],[['test word','old sense & more'],'en'],'new entry: English per sense');
 assert.deepEqual(word.senses,[{pos:['noun (common) (futsuumeishi)'],misc:['uk']},{pos:['noun (common) (futsuumeishi)'],misc:['arch'],field:['math']}],'pos carries to the next sense');
 assert.deepEqual(en[1].senses[1].gloss,['old sense & more']);assert.deepEqual(en[0].definitions,['before one knows','unawares']);
 const furigana=JSON.parse(fs.readFileSync(path.join(out,'jmdict-furigana.json'),'utf8'));
 assert.deepEqual(furigana,{'何時の間にか|いつのまにか':'0-1:いつ;3:ま','後一歩|あといっぽ':'0:あと;1:いっ;2:ぽ'},'only spellings with two kanji in a row');
 assert.equal(JSON.parse(fs.readFileSync(path.join(out,'jmdict.version.json'),'utf8')).jmdict,'2026-11-26');
 fs.rmSync(dir,{recursive:true,force:true});
});
