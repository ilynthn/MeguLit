/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 语法 › 怎么接 (2026-11-14, user: 「怎么做部分太空了 完全不知道啥意思」 — a 蓝宝书 lesson showed one box saying する).
   Built at run time from what every lesson already has, by rules, for all points alike (MeguLit's own N5–N0 and the
   learner's 蓝宝书 cards, which are read from their Anki and never shipped):
   - the connection in plain words: 蓝宝书 shorthand (動辞書形, ナ形語幹, 名詞修飾形 …) spelled out in Chinese, and when
     a card has no connection field, the 接在…之后 sentence of its explanation turned into a formula;
   - for verb patterns, which form the verb takes, shown on 行く and 食べる (行く → 行き + がてら → 行きがてら);
   - two or three example lines with their Chinese and furigana (the deck's own furigana, or JMdict readings generated
     by tools/build-grammar-ruby.cjs for MeguLit's own lines); one line from the learner's own reading when there is one;
   - one 注意 line from the lesson's pitfalls or the card's notes. */
import {RUBY} from './grammar-ruby.js';

const VERBS=[
 {word:'行く',zh:'去',dict:'行く',masu:'行き',te:'行って',ta:'行った',nai:'行か',vol:'行こう',ba:'行けば',mai:'行くまい'},
 {word:'食べる',zh:'吃',dict:'食べる',masu:'食べ',te:'食べて',ta:'食べた',nai:'食べ',vol:'食べよう',ba:'食べれば',mai:'食べまい'}
];
const OTHERS={noun:{word:'学生',form:'学生'},i:{word:'高い',form:'高い',stem:'高'},na:{word:'静か',form:'静か'}};
/* what the verb (or word) in front must look like; checked in this order */
const KINDS=[
 {k:'vol',re:/意向形/,zh:'动词意向形（～よう／～おう）'},
 {k:'mai',re:/まい形/,zh:'动词＋まい（一类用原形，二类去る）'},
 {k:'naiStem',re:/ない形\s*(?:[－―]|去掉?)\s*ない/,zh:'动词ない形去掉ない'},
 {k:'masu',re:/ます形|連用形|连用形/,zh:'动词ます形去掉ます'},
 {k:'te',re:/て形/,zh:'动词て形'},
 {k:'ta',re:/た形/,zh:'动词た形'},
 {k:'nai',re:/ない形/,zh:'动词ない形'},
 {k:'ba',re:/ば形|仮定形|假定形|条件形/,zh:'动词假定形（～ば）'},
 {k:'dict',re:/辞書形|辞书形|原形|基本形/,zh:'动词原形（辞书形）'},
 {k:'plain',re:/普通形|名詞修飾形|名词修饰形|简体/,zh:'普通形（简体）'}
];
/* 蓝宝书 shorthand → plain Chinese; longer keys first */
const PLAIN=[[/名詞修飾形/g,'修饰名词的形式（普通形，な形用な、名词用の）'],[/動/g,'动词'],[/名詞/g,'名词'],[/名(?![词詞])/g,'名词'],[/イ形/g,'い形容词'],
 [/ナ形語幹/g,'な形容词词干'],[/ナ形/g,'な形容词'],[/語幹/g,'词干'],[/辞書形/g,'辞书形（原形）'],[/[－―]\s*(ない|ます|る|い|な)/g,'去掉$1'],[/[－―]/g,''],
 [/\s*[＋+]\s*/g,' + '],[/[·・]/g,'、']];
export const plainFormula=s=>PLAIN.reduce((t,[re,to])=>t.replace(re,to),String(s||'')).replace(/\s+/g,' ').trim();
/* the grammar itself: the part after the last +, first of its alternatives, without brackets or ～ */
export function headOf(formula){const parts=String(formula||'').split(/\s*[＋+]\s*/);if(parts.length<2)return '';
 return parts.at(-1).replace(/[（(][^）)]*[）)]/g,'').split(/\s*[／/]\s*/)[0].replace(/[～~〜…]/g,'').trim();}
/* 行く → 行き + がてら → 行きがてら. Kana parts between the verb and the grammar join in (普通形 + の + はおろか →
   行くのはおろか); 「Ⅰ类／Ⅱ类动词」 shows only that class; ない形 before れる／せる／ず… is the form without ない */
const kanaOnly=t=>/^[\u3040-\u30ff]+$/.test(t);
const firstAlt=t=>String(t||'').replace(/[「」『』]/g,'').replace(/[（(][^）)]*[）)]/g,'').split(/\s*[／/、]\s*/)[0].replace(/[～~〜…]/g,'').trim();
export function demoOf(formula){
 const parts=String(formula||'').split(/\s*[＋+]\s*/);if(parts.length<2)return [];
 const at=parts.slice(0,-1).findIndex(p=>KINDS.some(x=>x.re.test(p)));if(at<0)return [];
 const kind=KINDS.find(x=>x.re.test(parts[at]));let tail='';
 for(const p of parts.slice(at+1)){const t=firstAlt(p);if(!t||!kanaOnly(t))return [];tail+=t;}
 if(!tail)return [];
 const stem=kind.k==='naiStem'||kind.k==='nai'&&/^(られる|れる|させる|せる|ずに|ず|ぬ|ん)/.test(tail);
 const verbs=/Ⅰ类|一类|五段/.test(parts[at])?VERBS.slice(0,1):/Ⅱ类|二类|一段/.test(parts[at])?VERBS.slice(1):/Ⅲ类|三类|サ变|カ变/.test(parts[at])?[]:VERBS;
 if(kind.k==='plain')return [{from:'行く',to:'行く'+tail},{from:'行った',to:'行った'+tail}];
 const pick=v=>stem?v.nai:kind.k==='nai'?v.nai+'ない':v[kind.k==='naiStem'?'nai':kind.k];
 return verbs.map(v=>({from:v.word,mid:pick(v),to:pick(v)+tail}));}
/* a 蓝宝书 card without a connection field: 「以「をする」形式接在表示动作或行为的名词之后」 → 名词 + をする */
export function formulaFromExplain(lines,word){
 for(const line of lines||[]){const m=/接在([^。；;]*?)(?:之后|后面|后边|的后面|后)/.exec(line)||/前接([^。；;，,]*)/.exec(line);if(!m)continue;
  const cat=(m[1].match(/名词|动词[^，。、]{0,6}?形|动词|い形容词|な形容词|形容词|数量词|疑问词|句子|句末|普通形/g)||[]).pop();if(!cat)continue;
  const pat=(/「([^」]+)」/.exec(line)||[])[1]||word;return {formula:`${cat} + ${pat.replace(/^[～~〜]/,'')}`,rule:line};}
 return null;}
/* Anki furigana 「 漢字[かんじ]」: a base runs back to the previous space or the start */
export function rubyParts(rb){const out=[];const re=/ ?([^ \[\]]+)\[([^\]]*)\]/g;let at=0,m;
 while((m=re.exec(rb))){if(m.index>at)out.push({t:rb.slice(at,m.index)});out.push({t:m[1],rt:m[2]});at=re.lastIndex;}
 if(at<rb.length)out.push({t:rb.slice(at)});return out;}
/* the line with its furigana and the grammar marked; plain text when the markup does not match the line */
export function rubyHTML(text,{rb='',start=-1,end=-1,esc}){
 const src=rb||RUBY[text]||'',parts=src?rubyParts(src):[],ok=parts.length&&parts.map(p=>p.t).join('')===text;
 /* plain runs become single characters so the mark can start and stop anywhere; a ruby word is marked whole */
 const units=(ok?parts:[{t:String(text||'')}]).flatMap(p=>p.rt!=null?[p]:[...p.t].map(t=>({t})));
 let pos=0,html='',open=false;
 for(const u of units){const a=pos,b=pos+[...u.t].length;pos=b;const on=start>=0&&a<end&&b>start;
  if(on!==open){html+=on?'<mark class="gm-hl">':'</mark>';open=on;}
  html+=u.rt!=null?`<ruby>${esc(u.t)}<rt>${esc(u.rt)}</rt></ruby>`:esc(u.t);}
 return html+(open?'</mark>':'');}
const span=(text,hl)=>{if(!hl)return [-1,-1];const at=text.indexOf(hl);if(at<0)return [-1,-1];const s=[...text.slice(0,at)].length;return [s,s+[...hl].length];};
const LABEL={zh:{speak:'朗读',place:'在句子里的位置',start:'句首',end:'句末',rule:'接法',demo:'动词这样变',examples:'例句',mine:'你读过的台词',note:'注意',from:'来自'},ja:{speak:'読み上げ',place:'文の中の位置',start:'文頭',end:'文末',rule:'接続',demo:'動詞の形',examples:'例文',mine:'あなたが読んだセリフ',note:'注意',from:''},
 en:{speak:'Read aloud',place:'Where it sits',start:'start',end:'end',rule:'How it attaches',demo:'The verb becomes',examples:'Examples',mine:'From your reading',note:'Watch out',from:'from'}};
/* all the pieces of 怎么接 for one lesson; never empty: at least one rule and one example */
export function howTo(point,real=[]){
 const cards=point.source==='anki'?[]:point.anki||[];
 /* examples: lines with a translation, the grammar marked */
 const ex=[];const add=(ja,zh,hl,rb)=>{if(!ja||ex.some(e=>e.ja===ja)||ex.length>=3)return;const [s,e]=span(ja,hl);ex.push({ja,zh:zh||'',rb:rb||'',start:s,end:e});};
 for(const b of point.builtin||[])add(b.ja,b.zh,b.hl,b.rb);
 const hits=[...(point.hits||[]),...(point.choices||[])].filter(Boolean);
 for(const u of point.uses||[])add(u.ja,u.zh,hits.find(h=>u.ja?.includes(h))||'',u.rb);
 for(const c of cards)for(const e of c.examples||[])add(e.ja,e.zh,e.hl,e.rb);
 const rows=[];
 for(const [a,b] of point.form||[]){const raw=String(a||'').trim();if(!raw)continue;const isWord=!/[＋+]|形|词|詞|名|動|作为|念作/.test(raw);
  if(isWord&&point.source==='anki')continue;rows.push({formula:plainFormula(raw),raw,example:b||'',demo:demoOf(raw)});}
 if(point.source==='anki'&&!rows.length){const f=formulaFromExplain([point.gist?.zh,...(point.explain||[])],point.title?.ja||'');
  /* no connection field and no 接在… sentence (これ／それ, しかし, いつ …): show where it sits in its first example */
  const e=ex.find(x=>x.start>=0),word=String(point.title?.ja||'').replace(/^[～~〜]/,'');
  if(f)rows.push({formula:f.formula,raw:f.formula,example:'',demo:demoOf(f.formula),rule:f.rule});
  else if(e){const c=[...e.ja],before=c.slice(0,e.start).join('').replace(/[、，,\s]+$/,''),after=c.slice(e.end).join('').replace(/^[、，,\s]+/,'').replace(/[。！？!?]+$/,'');
   rows.push({formula:[before?'…'+[...before].slice(-5).join(''):'{start}',c.slice(e.start,e.end).join(''),after?[...after].slice(0,5).join('')+'…':'{end}'].join(' + '),raw:'',example:'',demo:[],rule:point.gist?.zh||'',place:true});}
  else rows.push({formula:`～ + ${word}`,raw:'',example:'',demo:[],rule:point.gist?.zh||''});}
 for(const c of cards)for(const f of c.form.slice(0,2)){if(!/[＋+]/.test(f))continue;const p=plainFormula(f);if(!rows.some(r=>r.formula===p))rows.push({formula:p,raw:f,example:'',demo:demoOf(f),anki:true});}
 const mine=(real||[]).find(e=>e&&e.text&&e.origin!=='anki'&&e.origin!=='builtin'&&(e.title||e.label))||null;
 const note=String((point.pitfalls||[])[0]||cards.flatMap(c=>c.notes||[])[0]||'').trim();
 return {rows,examples:ex,mine,note};
}
export function howToHTML(point,real,{esc,locale='zh',source=e=>e.title||''}){
 const L=LABEL[locale]||LABEL.zh,h=howTo(point,real);
 const rows=h.rows.map((r,i)=>`<li class="gm-how-row" style="--row:${i}">${r.place?`<p class="gm-how-demo"><small>${esc(L.place)}</small></p>`:''}<div class="gm-formula">${r.formula.split(/\s+\+\s+/).map((part,k)=>`${k?'<i class="gm-plus" aria-hidden="true">+</i>':''}<span class="gm-block" style="--i:${k}"${r.place?' lang="ja"':''}>${esc(part==='{start}'?L.start:part==='{end}'?L.end:part)}</span>`).join('')}</div>${r.example?`<span class="gm-arrow" aria-hidden="true">→</span><button type="button" class="gm-formula-ex" data-speak="${esc(r.example)}" lang="ja">${rubyHTML(r.example,{esc})}</button>`:''}${r.demo.length?`<p class="gm-how-demo"><small>${esc(L.demo)}</small>${r.demo.map(d=>`<span lang="ja">${esc(d.from)}${d.mid&&d.mid+''!==d.from?` → ${esc(d.mid)}`:''} → <b>${esc(d.to)}</b></span>`).join('')}</p>`:''}${r.rule?`<p class="gm-how-rule">${esc(r.rule)}</p>`:''}</li>`).join('');
 const exs=h.examples.map(e=>`<li>${jaLine(e.ja,{rb:e.rb,start:e.start,end:e.end,esc})}${e.zh?`<p class="gm-tr">${esc(e.zh)}</p>`:''}<button type="button" class="gm-link" data-speak="${esc(e.ja)}">${esc(L.speak)}</button></li>`).join('');
 const m=h.mine,mine=m?`<section class="gm-how-mine"><h4>${esc(L.mine)}</h4>${jaLine(m.text,{start:m.start,end:m.end,esc})}${m.translation?`<p class="gm-tr">${esc(m.translation)}</p>`:''}<p class="gm-cap">${esc(source(m))}</p></section>`:'';
 return `<section class="gm-how"><h4>${esc(L.rule)}</h4><ol class="gm-formulas gm-how-rows">${rows}</ol>${exs?`<h4>${esc(L.examples)}</h4><ol class="gm-how-ex">${exs}</ol>`:''}${mine}${h.note?`<p class="gm-how-note"><b>${esc(L.note)}</b>${esc(h.note)}</p>`:''}</section>`;
}
/* one example line; when it has kanji but no furigana yet it carries data-ruby so fillRuby can add it later */
function jaLine(text,{rb='',start=-1,end=-1,esc}){const html=rubyHTML(text,{rb,start,end,esc}),need=!html.includes('<ruby>')&&/[\p{Script=Han}々]/u.test(text||'');
 return `<p class="gm-ja" lang="ja"${need?` data-ruby="${esc(text)}" data-s="${start}" data-e="${end}"`:''}>${html}</p>`;}
/* after the lesson is on screen: furigana for the lines MeguLit has none for (蓝宝书 lines, your own lines), from the
   grammar_ruby service (JMdict readings that agree with the tokenizer); silently nothing when the reading pack is missing */
const asked=new Map();
export async function fillRuby(root,{api,esc,isCurrent=()=>true}){
 const els=[...root.querySelectorAll('[data-ruby]')];if(!els.length)return;
 const want=[...new Set(els.map(el=>el.dataset.ruby))].filter(t=>!asked.has(t)).slice(0,40);
 if(want.length){try{const r=await api('grammar_ruby',{texts:want});for(const t of want)asked.set(t,r?.rubies?.[t]||'');}catch{for(const t of want)asked.set(t,'');}}
 if(!isCurrent())return;
 for(const el of els){const rb=asked.get(el.dataset.ruby);if(!rb||!el.isConnected)continue;el.innerHTML=rubyHTML(el.dataset.ruby,{rb,start:Number(el.dataset.s),end:Number(el.dataset.e),esc});el.removeAttribute('data-ruby');}
}
