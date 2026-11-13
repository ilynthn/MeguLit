'use strict';
/* Furigana for grammar example lines, in Anki markup 「 漢字[かんじ]」 (a space before each base). Shared by
   tools/build-grammar-ruby.cjs (MeguLit's own lines, shipped in web/grammar-ruby.js) and the grammar_ruby service
   action (蓝宝书 deck lines and anything else, at run time). Review rule: only JMdict dictionary readings, and only
   where they agree with how the tokenizer heard that spot (私 わたし not わたくし; 来ます き not らい); anything else
   stays bare and is returned in `bare` for review. */
const hasKanji=s=>/[\p{Script=Han}々〆ヶ]/u.test(s||'');
const hira=v=>String(v||'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));
function bracket(surface,reading){
 const r=hira(reading);if(!r||r===surface)return surface;
 const head=surface.match(/^[ぁ-ゖァ-ヺー]*/)[0],tail=surface.match(/[ぁ-ゖァ-ヺー]*$/)[0],core=surface.slice(head.length,surface.length-tail.length);
 if(core&&r.startsWith(hira(head))&&r.endsWith(hira(tail))&&r.length>head.length+tail.length)return `${head} ${core}[${r.slice(head.length,r.length-tail.length)}]${tail}`;
 return ` ${surface}[${r}]`;
}
async function rubyLine(learning,text){
 const chars=[...String(text||'')],bare=[];if(!hasKanji(text))return {rb:'',bare};
 const raw=await learning.tokenize(text),tokens=learning.readings.resolve(raw.map(t=>({...t})));let s='',pos=0;
 for(const t of [...tokens].filter(t=>Number.isInteger(t.start)).sort((a,b)=>a.start-b.start)){
  if(t.start<pos)continue;s+=chars.slice(pos,t.start).join('');
  /* a dictionary compound (大人っぽい) keeps the first token's start: its own surface sets the end */
  const surface=typeof t.surface==='string'&&chars.slice(t.start,t.start+[...t.surface].length).join('')===t.surface?t.surface:chars.slice(t.start,t.end).join(''),end=t.start+[...surface].length;
  const heard=hira(raw.filter(r=>r.start>=t.start&&r.start<end).map(r=>r.reading||'').join('')),said=hira(t.reading);
  if(hasKanji(surface)&&t.reading&&t.readingSource==='dictionary'&&heard===said)s+=bracket(surface,t.reading);
  else{s+=surface;if(hasKanji(surface))bare.push(`${surface}=${t.reading||'?'} (heard ${heard||'?'})`);}
  pos=end;}
 s+=chars.slice(pos).join('');s=s.replace(/^ /,'');return {rb:s===text?'':s,bare};
}
module.exports={rubyLine,bracket,hasKanji};
/* the service side (grammar_ruby): up to 40 lines per call, each line worked out once per run */
const cache=new Map();
async function rubies(learning,texts){
 const out={};if(!learning?.installed?.())return out;
 for(const t of (Array.isArray(texts)?texts:[]).map(String).filter(t=>t&&t.length<=300).slice(0,40)){
  if(!cache.has(t)){if(cache.size>4000)cache.clear();cache.set(t,(await rubyLine(learning,t)).rb);}out[t]=cache.get(t);}
 return out;}
module.exports.rubies=rubies;
