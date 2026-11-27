// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Colloquial and dialect fallback for the word lookup (QQ group: 舐めんなし found nothing). SudachiDict Full + JMdict read standard
   Japanese; a word squeezed in speech (舐めんな, わかんねえ, やっとく, 行かなきゃ, すげー) or ending in a dialect sentence ending
   (舐めんなし, ええやん, そうだべ) found no entry and the card stayed empty. Only when the normal lookup has found nothing:
   1. a dialect ending (core/colloquial-endings.json) is cut off, longest first;
   2. contractions are written out in full (ん→る/ら/れ/の, ちゃう→てしまう, とく→ておく, てる→ている, なきゃ→なければ, すげえ→すごい, っす→です);
   3. the standard form is deinflected by the rule table below to a dictionary form JMdict lists with a matching part of speech;
   4. if the whole string never resolves, the longest prefix that does is taken (the card marks the rest as not looked up).
   lookup(key) returns the JMdict entries indexed under key ({pos, freq_rank}); nothing here reads the dictionary itself. */
const DATA=require('./colloquial-endings.json');
const ENDINGS=[...DATA.endings].sort((a,b)=>[...b.ending].length-[...a.ending].length);
const WORDS=DATA.words||{};

const U=['う','く','ぐ','す','つ','ぬ','ぶ','む','る'],A=['わ','か','が','さ','た','な','ば','ま','ら'],I=['い','き','ぎ','し','ち','に','び','み','り'],
 E=['え','け','げ','せ','て','ね','べ','め','れ'],O=['お','こ','ご','そ','と','の','ぼ','も','ろ'];
const TE={'く':'い','ぐ':'い','す':'し','つ':'っ','う':'っ','る':'っ','ぬ':'ん','ぶ':'ん','む':'ん'},VOICED=new Set(['ぐ','ぬ','ぶ','む']);

/* Deinflection rules: an inflected ending `from` becomes `to`. `in` lists the kinds of form the ending may itself be (null: only the
   clicked text as written); `out` is the kind of word produced. A dictionary form ends the search when JMdict lists it with a
   part of speech of that kind. Kinds: v1 ichidan, v5 godan, vs する, vk 来る, adj い-adjective; te / ta / masu are forms only. */
const RULES=[];const add=(from,to,inKinds,out)=>RULES.push({from,to,in:inKinds,out});
/* The bare continuative stem as clicked (赤らめ｜て, 調べ｜て, 話し｜て): an ichidan stem first, then a godan one, both before the
   imperative reading of an え-row ending (赤らめ is 赤らめる, not 赤らむ) and long before a dialect ending is cut (調べ is not 調 + べ). */
add('','る',null,'v1');for(let k=0;k<U.length;k++)add(I[k],U[k],null,'v5');
for(let k=0;k<U.length;k++){const u=U[k],te=TE[u]+(VOICED.has(u)?'で':'て'),ta=TE[u]+(VOICED.has(u)?'だ':'た');
 add(A[k]+'ない',u,['adj'],'v5');add(I[k]+'ます',u,['masu'],'v5');add(I[k]+'ました',u,null,'v5');add(I[k]+'ません',u,null,'v5');add(I[k]+'たい',u,['adj'],'v5');
 add(E[k]+'ば',u,null,'v5');add(O[k]+'う',u,null,'v5');add(E[k],u,null,'v5');add(E[k]+'る',u,['v1'],'v5');add(A[k]+'れる',u,['v1'],'v5');add(A[k]+'せる',u,['v1'],'v5');
 add(te,u,['te'],'v5');add(ta,u,['ta'],'v5');}
add('行って','行く',['te'],'v5');add('行った','行く',['ta'],'v5');add('いって','いく',['te'],'v5');add('いった','いく',['ta'],'v5');
for(const [from,kinds]of [['ない',['adj']],['ます',['masu']],['ました',null],['ません',null],['たい',['adj']],['れば',null],['よう',null],['ろ',null],['られる',['v1']],['させる',['v1']],['て',['te']],['た',['ta']]])add(from,'る',kinds,'v1');
for(const [from,kinds]of [['しない',['adj']],['します',['masu']],['しました',null],['したい',['adj']],['すれば',null],['しよう',null],['しろ',null],['される',['v1']],['させる',['v1']],['して',['te']],['した',['ta']]])add(from,'する',kinds,'vs');
for(const stem of ['来','']){const k=stem?'来':'く';for(const [from,kinds]of [['ない',['adj']],['ます',['masu']],['た',['ta']],['て',['te']],['れば',null],['よう',null],['い',null]]){
 const head=stem||(from==='ない'||from==='よう'||from==='い'?'こ':from==='れば'?'く':'き');add(head+from,k+'る',kinds,'vk');}}
for(const [from,kinds]of [['くない',['adj']],['かった',['ta']],['ければ',null],['くて',['te']],['く',null]])add(from,'い',kinds,'adj');
add('たら','た',null,'ta');add('だら','だ',null,'ta');add('ては','て',null,'te');add('では','で',null,'te');add('ても','て',null,'te');add('でも','で',null,'te');
for(const [aux,kind]of [['いる','v1'],['みる','v1'],['おく','v5'],['しまう','v5'],['いく','v5'],['ある','v5'],['くる','vk']]){add('て'+aux,'て',[kind],'te');add('で'+aux,'で',[kind],'te');}
const POS={v1:/Ichidan/i,v5:/Godan/i,vs:/suru verb/i,vk:/Kuru verb/i,adj:/adjective \(keiyoushi\)/i};

/* Contractions written out in full. Each rule rewrites one place in the word; up to three are combined (わかんねえ: ねえ→ない, ん→ら). */
const CONTRACTIONS=[
 [/なきゃ$/u,['なければ'],'なきゃ→なければ'],[/なけりゃ$/u,['なければ'],'なけりゃ→なければ'],[/なくっ?ちゃ$/u,['なくては'],'なくちゃ→なくては'],
 [/ちゃ(?=[うわいえおっ])/u,['てしま'],'ちゃう→てしまう'],[/じゃ(?=[うわいえおっ])/u,['でしま'],'じゃう→でしまう'],
 [/ちゃ/u,['ては'],'ちゃ→ては'],[/じゃ/u,['では'],'じゃ→では'],
 [/(?<=[っん])と(?=[くかきけこいっ])/u,['てお'],'とく→ておく'],[/(?<=ん)ど(?=[くかきけこいっ])/u,['でお'],'どく→でおく'],
 [/て(?=[るたなれろまんっ]|$)/u,['てい'],'てる→ている'],[/で(?=[るたなれろまんっ]|$)/u,['でい'],'でる→でいる'],
 [/て(?=[くかきけこっ])/u,['てい'],'てく→ていく'],[/で(?=[くかきけこっ])/u,['でい'],'でく→でいく'],
 [/っす(?=$|[ねよか])/u,['です'],'っす→です'],
 // ん→の only before だ/で/じ (行くんだ → 行くのだ): elsewhere ええやん would read as ええや + の
 [/ん$/u,['ない'],'ん→ない'],[/ん(?=[だでじ])/u,['の'],'ん→の'],[/ん/u,['る','ら','れ'],'ん→る/ら/れ'],
];
const EROW='えけげせてねべめれぜでへぺ',AROW='あかがさたなばまらざだはぱ',OROW='おこごそとのぼもろぞどほぽ',IROW='いきぎしちにびみりじぢひぴ',UROW='うくぐすつぬぶむるずづふぷ';
// すげえ/すげー → すごい, うめえ → うまい, ねえ → ない, 行きてえ → 行きたい, さみい → さむい
const longVowel=word=>{const out=[];const chars=[...word];for(let i=0;i+1<chars.length;i++){const c=chars[i],n=chars[i+1];
 if(EROW.includes(c)&&/[えぇー]/u.test(n)){const k=EROW.indexOf(c);for(const v of [AROW[k],OROW[k]])out.push({text:chars.slice(0,i).join('')+v+'い'+chars.slice(i+2).join(''),rule:c+n+'→'+v+'い'});}
 if(IROW.includes(c)&&/[いぃー]/u.test(n)&&(i+2===chars.length)&&i>0){const k=IROW.indexOf(c);out.push({text:chars.slice(0,i).join('')+UROW[k]+'い',rule:c+n+'→'+UROW[k]+'い'});}}
 return out;};
function rewrites(word){const out=[];for(const [re,tos,rule]of CONTRACTIONS){const g=new RegExp(re.source,'gu');let m;while((m=g.exec(word))){for(const to of tos)out.push({text:word.slice(0,m.index)+to+word.slice(m.index+m[0].length),rule});if(!m[0].length)g.lastIndex++;}}
 return out.concat(longVowel(word));}
// The written-out forms, fewest rewrites first.
function variants(word,depth=3,limit=400){const seen=new Map([[word,[]]]);let layer=[word];
 for(let d=0;d<depth&&layer.length;d++){const next=[];for(const w of layer)for(const r of rewrites(w)){if(seen.has(r.text)||seen.size>=limit)continue;seen.set(r.text,[...seen.get(w),r.rule]);next.push(r.text);}layer=next;}
 return [...seen].map(([text,rules])=>({text,rules}));}

// Sentence particles after a word (舐めるな, するの, すごいです): cut before deinflecting; they are standard, not dialect.
const PARTICLES=['です','だよ','だね','って','なあ','なぁ','よね','わよ','かな','もん','の','な','よ','ね','ぞ','ぜ','さ','わ','か','だ','や'];
function particleCuts(word){const out=[{text:word,cut:''}];for(const p of PARTICLES)if(word.endsWith(p)&&word.length>p.length){const rest=word.slice(0,-p.length);out.push({text:rest,cut:p});
 for(const q of PARTICLES)if(rest.endsWith(q)&&rest.length>q.length)out.push({text:rest.slice(0,-q.length),cut:q+p});}return out;}

function fits(entries,kind){return entries.some(e=>!kind||(e.pos||[]).some(p=>POS[kind]?.test(p)));}
// The dictionary form of an inflected standard word, or null. Among forms found at the same depth, the most frequent entry wins.
function deinflect(word,lookup,maxDepth=6){
 const rank=key=>Math.min(...lookup(key).map(e=>e.freq_rank||999999));let layer=[{text:word,kind:null}],seen=new Set([word+'|']);
 for(let d=0;d<=maxDepth&&layer.length;d++){
  const found=layer.filter(f=>(f.kind===null||POS[f.kind])&&fits(lookup(f.text),f.kind));
  if(found.length)return found.sort((a,b)=>rank(a.text)-rank(b.text))[0].text;
  const next=[];for(const f of layer)for(const r of RULES){if(!f.text.endsWith(r.from)||f.text.length<=r.from.length&&!r.to)continue;if(f.kind!==null&&!(r.in||[]).includes(f.kind))continue;
   const text=f.text.slice(0,f.text.length-r.from.length)+r.to;if(!text||seen.has(text+'|'+r.out))continue;seen.add(text+'|'+r.out);next.push({text,kind:r.out});}
  layer=next;}
 return null;}

function lettered(s){return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]/u.test(s);}
/* The whole word, read colloquially. Returns {base, matched, rules, dialect, cut} or null. */
function resolveWhole(word,lookup,{depth=3,limit=400,memo=new Map()}={}){
 const listed=key=>lookup(key).length>0;
 const dein=t=>{if(!memo.has(t))memo.set(t,deinflect(t,lookup));return memo.get(t);};
 const tries=[{text:word,dialect:null}];for(const d of ENDINGS)if(word.endsWith(d.ending)&&[...word].length>[...d.ending].length)tries.push({text:word.slice(0,-d.ending.length)+(d.as||''),dialect:d});
 for(const t of tries){
  if(t.dialect&&WORDS[t.text]&&listed(WORDS[t.text]))return {base:WORDS[t.text],matched:word,rules:[t.text+'→'+WORDS[t.text]],dialect:t.dialect,cut:''};
  for(const v of variants(t.text,depth,limit))for(const c of particleCuts(v.text)){if(!lettered(c.text))continue;
   if(t.dialect&&WORDS[c.text]&&listed(WORDS[c.text]))return {base:WORDS[c.text],matched:word,rules:[...v.rules,c.text+'→'+WORDS[c.text]],dialect:t.dialect,cut:c.cut};
   const base=dein(c.text);if(base)return {base,matched:word,rules:v.rules,dialect:t.dialect,cut:c.cut,standard:v.text};}}
 return null;}

/* resolve(surface, lookup): the whole surface, else its longest prefix that resolves ({prefix:true, rest}). */
function resolve(surface,lookup,{maxLength=24}={}){
 const word=String(surface||'').trim();if(!word||[...word].length>maxLength||!lettered(word))return null;
 const memo=new Map(),whole=resolveWhole(word,lookup,{memo});if(whole)return {...whole,prefix:false,rest:''};
 const chars=[...word];for(let n=chars.length-1;n>=1;n--){const head=chars.slice(0,n).join('');if(n===1&&!/[\p{Script=Han}々]/u.test(head))break;
  const hit=resolveWhole(head,lookup,{depth:n>6?1:2,limit:60,memo});if(hit)return {...hit,matched:head,prefix:true,rest:chars.slice(n).join('')};}
 return null;}

const TEXT={
 contraction:{zh:'口语缩约',en:'Colloquial contraction',ja:'口語の縮約'},dialect:{zh:'方言语尾',en:'Dialect ending',ja:'方言の語尾'},
 base:{zh:'辞书原形',en:'Dictionary form',ja:'辞書形'},prefix:{zh:'整串查不到，只查了前面的',en:'The whole string is not listed; looked up the first part',ja:'全体は見つからず、先頭部分だけを引きました'},
 rest:{zh:'未查',en:'not looked up',ja:'未検索'},
};
// The note under the headword, in the learner's language.
function describe(r,language='zh'){const l=TEXT.base[language]?language:'zh',parts=[];
 if(r.prefix)parts.push(TEXT.prefix[l]+'：'+r.matched+'｜'+TEXT.rest[l]+'：'+r.rest);
 if(r.dialect)parts.push(TEXT.dialect[l]+'「'+r.dialect.ending+'」（'+(r.dialect.region?.[l]||r.dialect.region?.zh||'')+'）：'+(r.dialect.note?.[l]||r.dialect.note?.zh||''));
 if(r.rules.length)parts.push(TEXT.contraction[l]+'：'+r.rules.join('，'));
 parts.push(TEXT.base[l]+'：'+r.base);return parts.join('\n');}

module.exports={resolve,resolveWhole,deinflect,variants,describe,ENDINGS,WORDS};
