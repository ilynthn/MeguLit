// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Furigana for example sentences taken from the user's own read lines (2026-11-14, user: 所有地方提取例句出来的时候记得注音啊).
   One place decides which reading a kanji run gets, in the owner's order:
   1. the game's own ruby captured with the line (source ruby: <rよみ>漢字</r>, ｜漢字《よみ》, ISLAND pairs …);
   2. the reading the dictionary settled for that word in this context (readings.resolve → readingSource 'dictionary');
   3. never the tokenizer's own guess, never a name (固有名詞) without game ruby: those stay bare.
   Output is a list of spans {start,end,reading,source} in characters (code points) of the plain text; kana runs never
   get ruby and okurigana is kept outside the ruby (泣い → <ruby>泣<rt>な</rt></ruby>い). */
const {extractSourceRuby}=require('./source-ruby.cjs');
const KANJI=/[\p{Script=Han}々〆ヶ]/u;
const hira=v=>String(v||'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));
const isName=t=>{const g=Array.isArray(t.grammar)?t.grammar:[];return g.includes('固有名詞')||/固有名詞/.test(String(t.pos||''))||/固有名詞/.test(String(t.pos_detail||''));};

/* A recorded line (may still carry the engine's ruby markup) → plain text and [[base,reading],…] */
function plainWithRuby(raw){const r=extractSourceRuby(raw);return {text:r.text,ruby:r.ruby};}

/* The span for one word: okurigana outside, the kanji core inside; '' when the reading does not fit the word. */
function coreSpan(chars,start,end,reading){
  const surface=chars.slice(start,end).join(''),r=hira(reading);if(!r||!KANJI.test(surface)||r===hira(surface))return null;
  const head=(surface.match(/^[ぁ-ゖ]*/)||[''])[0],tail=(surface.match(/[ぁ-ゖ]*$/)||[''])[0];
  if(head.length+tail.length>=surface.length)return null;
  if((head||tail)&&r.startsWith(head)&&r.endsWith(tail)&&r.length>head.length+tail.length)
    return {start:start+[...head].length,end:end-[...tail].length,reading:r.slice(head.length,r.length-tail.length)};
  if(head||tail)return null;
  return {start,end,reading:r};
}

/* text: plain line; tokens: resolved tokens (learning.readings.resolve(tokenize(text))); pairs: game ruby [[base,reading]] */
function exampleSpans(text,tokens,pairs=[]){
  const chars=[...String(text||'')],out=[],taken=new Uint8Array(chars.length+1);
  const free=(a,b)=>{for(let i=a;i<b;i++)if(taken[i])return false;return true;},take=(a,b)=>{for(let i=a;i<b;i++)taken[i]=1;};
  /* 1. game ruby, wherever its base appears in the line */
  for(const p of Array.isArray(pairs)?pairs:[]){if(!Array.isArray(p))continue;const base=[...String(p[0]||'')],reading=hira(p[1]);
    if(!base.length||!reading||!KANJI.test(base.join('')))continue;
    for(let i=0;i+base.length<=chars.length;i++){let ok=true;for(let k=0;k<base.length;k++)if(chars[i+k]!==base[k]){ok=false;break;}
      if(!ok||!free(i,i+base.length))continue;const c=coreSpan(chars,i,i+base.length,reading)||{start:i,end:i+base.length,reading};
      out.push({...c,source:'game'});take(i,i+base.length);i+=base.length-1;}}
  /* 2. dictionary readings from the resolver; names and tokenizer guesses stay bare */
  let cursor=0;
  for(const t of Array.isArray(tokens)?tokens:[]){
    const surface=[...String(t?.surface||'')];if(!surface.length)continue;
    let start=Number.isInteger(t.start)?t.start:-1;
    /* the resolver may have merged following tokens into one word (月曜日): its own start, its own length */
    if(start<0||chars.slice(start,start+surface.length).join('')!==surface.join('')){start=chars.join('').length?indexOf(chars,surface,cursor):-1;}
    if(start<0)continue;const end=start+surface.length;cursor=end;
    if(!KANJI.test(surface.join('')))continue;
    if(t.readingSource!=='dictionary'||t.rawReading===true)continue;
    if(isName(t))continue;
    const s=coreSpan(chars,start,end,t.reading);if(!s||!free(s.start,s.end))continue;
    out.push({...s,source:'dictionary'});take(s.start,s.end);
  }
  return out.sort((a,b)=>a.start-b.start);
}
function indexOf(chars,part,from){outer:for(let i=Math.max(0,from);i+part.length<=chars.length;i++){for(let k=0;k<part.length;k++)if(chars[i+k]!==part[k])continue outer;return i;}return -1;}

/* HTML of a line with ruby on the spans and an optional highlight [start,end) kept as <b class="tm-hl">. */
function exampleHtml(text,spans,{start=0,end=0,mark='b',markClass='tm-hl'}={}){
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const chars=[...String(text||'')],open=`<${mark}${markClass?` class="${markClass}"`:''}>`,close=`</${mark}>`;
  const cuts=new Set([0,chars.length]);if(end>start){cuts.add(start);cuts.add(end);}
  const at=new Map();for(const s of spans||[])at.set(s.start,s);
  let html='',i=0;const inMark=k=>end>start&&k>=start&&k<end;
  while(i<chars.length){
    const s=at.get(i);
    if(s&&!(end>start&&((s.start<start&&s.end>start)||(s.start<end&&s.end>end)))){const piece='<ruby>'+esc(chars.slice(s.start,s.end).join(''))+'<rt>'+esc(s.reading)+'</rt></ruby>';
      html+=inMark(i)?open+piece+close:piece;i=s.end;continue;}
    const m=inMark(i);let j=i+1;while(j<chars.length&&inMark(j)===m&&!at.has(j))j++;
    html+=m?open+esc(chars.slice(i,j).join(''))+close:esc(chars.slice(i,j).join(''));i=j;
  }
  return html.replace(new RegExp(close.replace('/','\\/')+open.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'');
}
/* Anki SentenceFurigana and any other HTML export of one line: the same spans, highlight [start,end) as <b class="tm-hl">.
   gameRuby: the game's per-surface readings (GameRuby.dict) — used like captured pairs. */
function exampleCardHtml(text,tokens,{pairs=[],gameRuby=null,start=0,end=0}={}){
  const all=[...(Array.isArray(pairs)?pairs:[])];if(gameRuby&&typeof gameRuby==='object')for(const [k,v] of Object.entries(gameRuby))if(k&&v&&String(text).includes(k))all.push([k,v]);
  return exampleHtml(text,exampleSpans(text,tokens,all),{start,end});
}
module.exports={exampleSpans,exampleHtml,exampleCardHtml,plainWithRuby,coreSpan};
