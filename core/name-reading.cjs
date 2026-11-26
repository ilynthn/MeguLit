'use strict';
/* Character names of the running game (user, 2026-11-23: 「猜不准就去联网查，直到你保证他准确」). SudachiDict guesses an unknown
   name kanji by kanji (Cafe Stella: 昂晴 のぼるはる for Kousei, 明月 めいげつ for Akizuki, 希 まれ for Nozomi). VNDB lists every
   character with the name as written (高嶺 昂晴) and in romaji (Takamine Kousei), so the reading comes from there. */
const fs=require('node:fs'),path=require('node:path');
const {kana}=require('./furigana.js');
const {COUNTERS}=require('./counter-reading.cjs');
const hasKanji=s=>/[\p{Script=Han}々]/u.test(s||'');

const SYLLABLES={a:'あ',i:'い',u:'う',e:'え',o:'お',
 ka:'か',ki:'き',ku:'く',ke:'け',ko:'こ',sa:'さ',shi:'し',si:'し',su:'す',se:'せ',so:'そ',ta:'た',chi:'ち',ti:'ち',tsu:'つ',tu:'つ',te:'て',to:'と',
 na:'な',ni:'に',nu:'ぬ',ne:'ね',no:'の',ha:'は',hi:'ひ',fu:'ふ',hu:'ふ',he:'へ',ho:'ほ',ma:'ま',mi:'み',mu:'む',me:'め',mo:'も',
 ya:'や',yu:'ゆ',yo:'よ',ra:'ら',ri:'り',ru:'る',re:'れ',ro:'ろ',wa:'わ',wo:'を',
 ga:'が',gi:'ぎ',gu:'ぐ',ge:'げ',go:'ご',za:'ざ',ji:'じ',zi:'じ',zu:'ず',ze:'ぜ',zo:'ぞ',da:'だ',di:'ぢ',du:'づ',dzu:'づ',de:'で',do:'ど',
 ba:'ば',bi:'び',bu:'ぶ',be:'べ',bo:'ぼ',pa:'ぱ',pi:'ぴ',pu:'ぷ',pe:'ぺ',po:'ぽ',
 kya:'きゃ',kyu:'きゅ',kyo:'きょ',sha:'しゃ',shu:'しゅ',sho:'しょ',she:'しぇ',cha:'ちゃ',chu:'ちゅ',cho:'ちょ',che:'ちぇ',
 nya:'にゃ',nyu:'にゅ',nyo:'にょ',hya:'ひゃ',hyu:'ひゅ',hyo:'ひょ',mya:'みゃ',myu:'みゅ',myo:'みょ',rya:'りゃ',ryu:'りゅ',ryo:'りょ',
 gya:'ぎゃ',gyu:'ぎゅ',gyo:'ぎょ',ja:'じゃ',ju:'じゅ',jo:'じょ',je:'じぇ',bya:'びゃ',byu:'びゅ',byo:'びょ',pya:'ぴゃ',pyu:'ぴゅ',pyo:'ぴょ',
 fa:'ふぁ',fi:'ふぃ',fe:'ふぇ',fo:'ふぉ',va:'ゔぁ',vi:'ゔぃ',vu:'ゔ',ve:'ゔぇ',vo:'ゔぉ'};
const LONG={'ā':'aa','â':'aa','ī':'ii','î':'ii','ū':'uu','û':'uu','ē':'ee','ê':'ee','ō':'ou','ô':'ou'};

/* VNDB romaji (Hepburn, long vowels spelled out: Kousei, Yuuki, Shin'ya) as hiragana; '' when any letter does not fit. */
function romajiKana(text){
 const s=String(text||'').toLowerCase().replace(/[āâīîūûēêōô]/g,c=>LONG[c]);if(!s||/[^a-z']/.test(s))return '';
 let out='';
 for(let i=0;i<s.length;){
  const c=s[i],next=s[i+1]||'';
  if(c==="'"){i++;continue;}
  if(c==='n'&&(next===''||next==="'"||!/[aiueoy]/.test(next))){out+='ん';i++;continue;}
  if(c==='m'&&/[bmp]/.test(next)){out+='ん';i++;continue;}
  if(c===next&&!/[aiueon]/.test(c)||c==='t'&&next==='c'){out+='っ';i++;continue;}
  let hit='';for(const n of [3,2,1]){const k=s.slice(i,i+n);if(SYLLABLES[k]){hit=k;break;}}
  if(!hit)return '';out+=SYLLABLES[hit];i+=hit.length;
 }
 return out;
}

/* ず and じ are also how づ and ぢ sound: 明月 Akizuki is あきづき because its last kanji 月 reads つき (香月 かづき). Only the
   last kanji of one name part is checked; 中津静流 is not しづる because 津 reads つ. */
function spelled(surface,reading,lookup){
 const last=[...surface].at(-1);
 for(const r of lookup(last)||[]){
  if(!/^[つち]/.test(r)||r.length>=reading.length)continue;const plain=r.replace(/^つ/,'ず').replace(/^ち/,'じ');
  if(reading.endsWith(plain))return reading.slice(0,-plain.length)+r.replace(/^つ/,'づ').replace(/^ち/,'ぢ');
 }
 return reading;
}

/* VNDB characters → [surface, reading] for each name part that has kanji and for the whole name written together.
   A spelling two characters read differently is left out. */
function characterNames(characters,lookup=()=>[]){
 const found=new Map();const add=(surface,reading)=>{if(!hasKanji(surface)||!reading)return;
  // A title such as 覆面選手 Fukumen reads only its first word.
  const chars=[...surface];if(chars.some((_,k)=>k&&k<chars.length&&(lookup(chars.slice(0,k).join(''))||[]).includes(reading)))return;
  const seen=found.get(surface);found.set(surface,seen===undefined||seen===reading?reading:null);};
 for(const c of Array.isArray(characters)?characters:[]){
  const written=String(c?.original||'').trim().split(/[\s　・]+/u).filter(Boolean),latin=String(c?.name||'').trim().split(/\s+/).filter(Boolean);
  if(!written.length||written.length!==latin.length)continue;const readings=latin.map(romajiKana);if(readings.some(r=>!r))continue;
  const parts=written.map((w,i)=>spelled(w,readings[i],lookup));
  written.forEach((w,i)=>add(w,parts[i]));if(written.length>1)add(written.join(''),parts.join(''));
 }
 return [...found].filter(([,r])=>r);
}

/* A full name as the family and given name it was made from (高嶺昂晴 → 高嶺 たかみね ｜ 昂晴 こうせい), so the speech button says
   them as two phrases; null for a single name. */
function nameParts(surface,reading,names){
 const chars=[...surface];
 for(let k=1;k<chars.length;k++){
  const a=chars.slice(0,k).join(''),b=chars.slice(k).join(''),ra=names.get(a),rb=names.get(b);
  if(ra&&rb&&ra+rb===reading)return [{surface:a,reading:ra},{surface:b,reading:rb}];
 }
 return null;
}
/* A reading without the long vowels romaji without macrons drops: ou → o, uu → u, ei → e (えいぞう → えぞ, ゆうま → ゆま).
   Nothing wider: 青海 あおうみ and おうみ must stay different. */
function withoutLong(s){return String(s||'').replace(/([おこそとのほもよろごぞどぼぽょうくすつぬふむゆるぐずづぶぷゅ])う/g,'$1').replace(/([えけせてねへめれげぜでべぺ])い/g,'$1');}
const NAME=['名詞','固有名詞','人名','一般'];
const TITLES=new Set(['様','君','殿','氏','嬢','先輩','先生','姉','兄','姉さん','兄さん','姉ちゃん','兄ちゃん','本人','自身','達','家','一人','姫','ちゃん','さん','くん']);
/* Tokens that spell a known name (one token, or pieces the tokenizer cut 昂｜晴) read as the name. Tokens that keep their
   own boundaries only: 希 inside 希望 is not the name. */
function nameTokens(tokens,names){
 if(!Array.isArray(tokens)||!names?.size)return tokens;const out=[];
 for(let i=0;i<tokens.length;i++){
  let hit=null;
  for(let j=Math.min(tokens.length,i+4)-1;j>=i&&!hit;j--){
   // Empty tokens (SudachiDict splits … into … and two empty marks) are never part of a name.
   const part=tokens.slice(i,j+1);if(part.some((t,k)=>typeof t?.surface!=='string'||!t.surface||t.readingSource==='game'||k&&Number.isInteger(part[k-1].end)&&part[k-1].end!==t.start))continue;
   const surface=part.map(t=>t.surface).join(''),reading=names.get(surface);if(!reading)continue;
   // A one-kanji name right before another word is the kanji's own use: 新 in 新技, 新食感 reads しん, and so does the prefix
   // in 新スキル (篝シナリオ is still Kagari's). A title, 家 or 本人 after it is still the name (希本人, 希先輩, 鳳家).
   // Otherwise the game's own cast is trusted: Cafe Stella writes 希に and 希な 133 times, all for Nozomi (希に起こされ, 希なら).
   const next=tokens[j+1],touching=next&&(!Number.isInteger(next.start)||next.start===part.at(-1).end),word=next?.surface||'';
   // A name written in numerals before a counter is the count: 九十九 (Tsukumo) in 九十九回目 is きゅうじゅうきゅう.
   if(/^[〇一二三四五六七八九十百千万]+$/u.test(surface)&&touching&&Object.hasOwn(COUNTERS,word))continue;
   if([...surface].length===1&&touching&&!TITLES.has(word)&&(/^\p{Script=Han}/u.test(word)||/^\p{Script=Katakana}/u.test(word)&&['接頭辞','接尾辞'].includes((part[0].grammar||[])[0])))continue;
   hit={part,surface,reading,stop:j};
   // VNDB romaji often drops long vowels (戸崎 瑛三 Tosaki Eizo, as the official site's thumb_eizo.jpg): when the tokenizer
   // reads the same sounds with the long vowel written out (えいぞう), its spelling is kept.
   const said=kana(part.map(t=>t.reading||'').join(''));if(said.length>reading.length&&withoutLong(said)===withoutLong(reading))hit.reading=said;
  }
  if(!hit){out.push(tokens[i]);continue;}
  const first=hit.part[0],last=hit.part.at(-1),same=hit.part.length===1,parts=nameParts(hit.surface,hit.reading,names);
  out.push({...first,surface:hit.surface,reading:hit.reading,base_form:hit.surface,normalized:hit.surface,end:last.end,
   ...(same?{}:{grammar:NAME,pos:'名詞',subtokens:hit.part}),...(parts?{parts}:{}),pitch:[],lexeme:null,reading_ambiguous:false,readingSource:'name'});
  i=hit.stop;
 }
 return out;
}

const WEEK=7*24*3600e3,DAY=24*3600e3;
/* A library game without a VNDB id (added by hand: The Song of Saya, 去人たち) is looked up by its titles, and only a VNDB
   title that is the same after normalizing counts (vndbTitle). The answer is kept in titles.json: a found id
   for a week, "not on VNDB" for a day, nothing when VNDB was unreachable. */
/* VNDB search for one title. A VNDB title or alias counts when it, or one part of it around ~ or : (Saya no Uta ~ The Song
   of Saya), is the same title after normalizing; undefined when VNDB could not be asked. */
async function vndbTitle(title,fetcher=fetch){
 const {norm}=require('./library.cjs'),want=norm(title);if(!want)return null;
 try{
  const r=await fetcher('https://api.vndb.org/kana/vn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters:['search','=',title],fields:'title,alttitle,titles.title,aliases',sort:'searchrank',results:20}),signal:AbortSignal.timeout(9000)});
  if(!r.ok)return undefined;
  for(const vn of (await r.json()).results||[]){
   const names=[vn.title,vn.alttitle,...(vn.titles||[]).map(t=>t?.title),...(vn.aliases||[])].filter(n=>typeof n==='string');
   if(names.some(n=>[n,...n.split(/\s*[~～〜:：]\s*/u)].some(p=>norm(p)===want)))return {id:vn.id};
  }
  return null;
 }catch{return undefined;}
}
/* A cache entry written less than ttl ago; one dated in the future (a clock set back) is stale. */
const fresh=(entry,now,ttl)=>Number.isFinite(entry?.at)&&entry.at<=now&&now-entry.at<ttl;
async function vnForTitles(titles,{folder,find,now}){
 const file=folder?path.join(folder,'titles.json'):'';let known={};try{if(file)known=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 if(!known||typeof known!=='object'||Array.isArray(known))known={};
 const search=find||vndbTitle;let found='',changed=false;
 for(const title of [...new Set((titles||[]).map(t=>String(t||'').trim()).filter(Boolean))]){
  const seen=known[title];if(fresh(seen,now,seen?.id?WEEK:DAY)){if(seen.id){found=seen.id;break;}continue;}
  // VNDB unreachable: an id found before still names the game, so its cached characters are used.
  const vn=await search(title);if(vn===undefined){if(seen?.id){found=seen.id;break;}continue;}
  known[title]={id:vn?.id||null,at:now};changed=true;if(vn?.id){found=vn.id;break;}
 }
 if(file&&changed){fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(known));fs.renameSync(file+'.tmp',file);}
 return found;
}
/* The game's names from VNDB, kept in cache/vndb-names/<id>.json for a week and used as they are when VNDB is unreachable. */
async function gameNames(vndbId,{folder,fetcher=fetch,lookup,now=Date.now(),titles,find}={}){
 if(!vndbId&&titles?.length)vndbId=await vnForTitles(titles,{folder,find,now});
 const id=/^v?(\d+)$/i.exec(String(vndbId||''))?.[1];if(!id)return new Map();
 const file=folder?path.join(folder,'v'+id+'.json'):'';let cached=null;
 try{if(file)cached=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 if(Array.isArray(cached?.characters)&&fresh(cached,now,WEEK))return new Map(characterNames(cached.characters,lookup));
 try{
  const characters=[];
  for(let page=1;page<=20;page++){
   const r=await fetcher('https://api.vndb.org/kana/character',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters:['vn','=',['id','=','v'+id]],fields:'name,original',results:100,page}),signal:AbortSignal.timeout(9000)});
   if(!r.ok)throw Error('VNDB '+r.status);const j=await r.json();
   for(const c of j.results||[])characters.push({id:c.id,name:c.name,original:c.original});if(!j.more)break;
  }
  if(file){fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify({at:now,vndbId:'v'+id,characters}));fs.renameSync(file+'.tmp',file);}
  return new Map(characterNames(characters,lookup));
 }catch{return new Map(characterNames(cached?.characters||[],lookup));}
}

module.exports={romajiKana,characterNames,nameTokens,gameNames,vndbTitle};
