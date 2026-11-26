'use strict';
const fs=require('node:fs');
const {kana}=require('./furigana.js');
const {numberTokens}=require('./counter-reading.cjs');
const {contextReadings}=require('./context-reading.cjs');
const hasKanji=s=>/[\p{Script=Han}々〆]/u.test(s||'');
/* Readings consumers may show: settled by the dictionary, read from a number and its counter or a VNDB character name, not the tokenizer's guess. */
const settled=t=>t?.readingSource==='dictionary'||t?.readingSource==='number'||t?.readingSource==='name'||t?.readingSource==='context'||t?.readingSource==='game';function pronunciation(s){return kana(s).replace(/([おこそとのほもよろごぞどぼぽょ])(?:う|お)/g,'$1ー').replace(/([うくすつぬふむゆるぐずづぶぷゅ])う/g,'$1ー').replace(/([いきしちにひみりぎじぢびぴ])い/g,'$1ー').replace(/[びぴ]/g,'ひ').replace(/[ぶぷ]/g,'ふ');}
function createReadingResolver(file=require('node:path').join(require('./paths.cjs').resources,'jmdict.json')){
  let index;
  function load(){
    if(index)return;index=new Map();
    try{for(const entry of JSON.parse(fs.readFileSync(file,'utf8'))){
      if(!Array.isArray(entry.spellings)||!Array.isArray(entry.readings))continue;
      for(const [k,spelling] of entry.spellings.entries()){if(typeof spelling!=='string'||!hasKanji(spelling))continue;const list=index.get(spelling)||[];if(!list.headed)list.headed=new Set();
        // Entries headed by this spelling are its own readings; entries listing it only as a variant (下る for 降る) are secondary.
        for(const r of entry.readings)if(typeof r==='string'){const v=kana(r);if(!list.includes(v))list.push(v);if(k===0)list.headed.add(v);}
        if(list.length)index.set(spelling,list);
      }
    }}catch{}
  }
  function choose(surface,expected,strict=false){
    const list=index.get(surface);if(!list?.length)return '';
    const target=pronunciation(expected),hit=list.find(r=>pronunciation(r)===target);
    // A tokenizer reading that only fits a variant spelling (降って as くだって) yields to the single headword reading (ふる).
    const own=[...(list.headed||[])];if(hit&&!list.headed?.has(hit)&&own.length===1)return own[0];if(hit&&strict&&!list.headed?.has(hit))return '';
    return hit||(strict||list.length!==1?'':list[0]);
  }
  function resolve(tokens){
    load();if(!Array.isArray(tokens)||tokens.length>4000)return [];
    // Usually done by LocalLearning.tokenize already; tokens from the UniDic engine come here directly.
    tokens=contextReadings(numberTokens(tokens));
    const result=[];
    for(let i=0;i<tokens.length;i++){
      const token=tokens[i];if(!token||typeof token.surface!=='string')continue;
      if(token.readingSource==='game'||token.readingSource==='context'){result.push(token);continue;}
      let surface=token.surface,expected=token.reading||'',best,stop=i;
      if(hasKanji(surface)){
        let merged=surface,pron=expected;
        // Compound words such as 月曜日 must not become 月曜 + 日(ひ).
        for(let j=i+1;j<Math.min(tokens.length,i+6);j++){
          const next=tokens[j]?.surface;if(!next||tokens[j].readingSource==='game'||/[\s。、！？「」『』]/u.test(next)||merged.length+next.length>16)break;
          merged+=next;pron+=tokens[j].reading||'';
          const reading=choose(merged,pron,true);if(reading){best={surface:merged,reading};stop=j;}
        }
      }
      if(best){result.push({...token,...best,readingSource:'dictionary'});i=stop;continue;}
      if(token.readingSource==='number'||token.readingSource==='name'||token.readingSource==='context'){result.push(token);continue;}
      if(!hasKanji(surface)){result.push(token);continue;}
      let reading=choose(surface,expected);
      if(!reading&&typeof token.base_form==='string'){
        const base=token.base_form;let prefix=0;
        while(prefix<base.length&&prefix<surface.length&&base[prefix]===surface[prefix])prefix++;
        const oldTail=kana(base.slice(prefix)),newTail=kana(surface.slice(prefix)),said=kana(expected);
        // Compare the dictionary form (降っ クダッ -> くだる), so the headword rule can apply to conjugated verbs too.
        const baseReading=choose(base,newTail&&said.endsWith(newTail)?said.slice(0,-newTail.length)+oldTail:expected);
        if(baseReading&&oldTail&&!hasKanji(oldTail)&&!hasKanji(newTail)&&baseReading.endsWith(oldTail))reading=baseReading.slice(0,-oldTail.length)+newTail;
      }
      // Unknown names keep their supplied reading; an unresolved pronunciation
      // long mark on kanji is omitted instead of inventing う/お/い spellings.
      /* readingSource tells a dictionary reading from the tokenizer's own guess (sentence cards drop the guess). */
      result.push({...token,reading:reading||(String(expected).includes('ー')?'':expected),readingSource:reading?'dictionary':'tokenizer'});
    }
    return result;
  }
  /* Furigana, the speech button and lookup (LocalLearning.tokenize): a word whose tokenizer reading JMdict does not know
     takes the dictionary's only reading (Sudachi gave 一回 いちかい, 箱 after の ばこ). Nothing else changes: a tested
     run over 1500 game lines showed that wider rules (the single reading for conjugated words, names, pieces of a split
     compound, or the headword rule) turned more right readings wrong (来て らい, 乾 けん, 分 ふん, 街 がい) than they fixed. */
  function settle(tokens){
    load();if(!Array.isArray(tokens))return tokens;
    const kanjiAt=(t,end)=>!!t&&hasKanji(end?String(t.surface||'').slice(-1):String(t.surface||'').slice(0,1));
    const touches=(a,b)=>!Number.isInteger(a?.end)||!Number.isInteger(b?.start)||a.end===b.start;
    const same=(a,b)=>pronunciation(a).replace(/ぢ/g,'じ').replace(/づ/g,'ず')===pronunciation(b).replace(/ぢ/g,'じ').replace(/づ/g,'ず');
    return tokens.map((token,i)=>{
      if(!token||typeof token.surface!=='string'||token.readingSource==='number'||token.readingSource==='name'||token.readingSource==='context'||token.readingSource==='game'||!hasKanji(token.surface)||!token.reading)return token;
      const g=Array.isArray(token.grammar)?token.grammar:[];
      if(token.base_form!==token.surface||g[1]==='固有名詞'||['接頭辞','接尾辞'].includes(g[0]))return token;
      if((kanjiAt(tokens[i-1],true)&&touches(tokens[i-1],token))||(kanjiAt(tokens[i+1],false)&&touches(token,tokens[i+1])))return token;
      const list=index.get(token.surface);if(!list||list.length!==1||list.some(r=>same(r,token.reading)))return token;
      // The UniDic accent belonged to the old reading; speech estimates the accent of the new one.
      return {...token,reading:list[0],readingSource:'dictionary',pitch:[]};
    });
  }
  /* JMdict readings of one spelling (a kanji's own readings tell あきづき from あきずき for 明月). */
  function lookup(surface){load();return index.get(surface)||[];}
  return {resolve,settle,lookup};
}
module.exports={createReadingResolver,pronunciation,settled};
