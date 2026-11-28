'use strict';
const POLICY=2;
const approved=source=>/^(?:VNDB|Official|官方|公式|Manual|用户|萌娘百科)/i.test(String(source||''));
const isMoegirl=source=>/^萌娘百科/.test(source||'');
const isBangumi=source=>/^Bangumi\b/.test(source||'');
/* Bangumi · 星光咖啡馆与死神之蝶 · 7.6 */
const bangumiSource=b=>['Bangumi',b.nameCn||b.name,Number(b.score)>0?Number(b.score).toFixed(1):''].filter(Boolean).join(' · ');
const isVndb=source=>/^VNDB\b/i.test(source||'');
const languages={zh:['zh','ja','en'],en:['en','zh','ja'],ja:['ja','zh','en']};

function forWork(entry,{appid='',vndbId='',rejectLegacy=false}){
 if(!entry)return null;
 if(appid&&entry.steamIdentity!==appid+':'+vndbId)return null;
 if(entry.vndbId===undefined&&rejectLegacy&&!appid)return null;
 if(entry.vndbId!==undefined&&entry.vndbId!==String(vndbId||''))return null;
 return entry;
}

function synopsis(text,source,lang){
 const clean=String(text||'').replace(/<[^>]+>/g,'').trim();
 return {text:clean,source:clean?String(source||''):'',lang};
}

/* order: the sources to walk (services/info-source.cjs order), first with a text wins; true/false are the older Moegirlpedia switch.
   bangumi-zh is Bangumi only when its text is Chinese. Bangumi and Moegirlpedia are kept beside the VNDB texts, never in them. */
const ORDER=o=>Array.isArray(o)?o:o?['moegirl','vndb']:['vndb'];
function views(entry,locale,order,localText=''){
 const lang=Object.hasOwn(languages,locale)?locale:'zh',empty=synopsis('','',lang),list=ORDER(order);
 const variants=languages[lang].map(l=>synopsis(entry?.[l],entry?.src?.[l],l)).filter(x=>x.text&&approved(x.source));
 const wiki=entry?.moegirl;
 const mg=isMoegirl(wiki?.src)?synopsis(wiki.text,wiki.src,'zh'):empty;
 const b=entry?.bangumi,bg=isBangumi(b?.src)?{...synopsis(b.text,bangumiSource(b),b.lang==='zh'?'zh':'ja'),title:String(b.nameCn||b.name||''),score:Number(b.score)||0,url:String(b.url||'')}:empty;
 const vndb=variants.find(x=>isVndb(x.source))||empty;
 const cached=vndb.text?vndb:variants.find(x=>!isMoegirl(x.source))||synopsis(localText,'',lang);
 const of={moegirl:mg,bangumi:bg,'bangumi-zh':bg.lang==='zh'?bg:empty,vndb:cached};
 /* the dropdown on the game page starts on the source that gave the text, else on the first source of the order */
 const used=list.find(s=>of[s]?.text),preferred=used?used.replace(/-zh$/,''):(list.find(s=>s!=='bangumi-zh')||'vndb');
 return {
  synopsis:used?of[used]:list.includes('vndb')?cached:synopsis(localText,'',lang),
  synopsisChoices:{preferred,moegirl:mg,vndb,bangumi:bg},
 };
}

module.exports={POLICY,approved,forWork,views};
