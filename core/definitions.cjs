// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Each original JMdict definitions[] item is a sense, not a separate synonym. Keep its boundary and deduplicate aliases without
   inventing semantic senses.
   2026-11-27 (「JMdict 全面优化」): a jmdict.json built by tools/build-jmdict.cjs carries entry.senses, one per definition, with
   JMdict's misc / field / dial tags. Senses JMdict marks archaic, obsolete, obscure, rare or dated go after the others (the card
   shows three senses before 展开), and each group gets a label from its tags (〔古语〕〔口语〕〔数学〕〔关西方言〕); the
   text stays the definition itself, so Anki cards and search are unchanged. An older jmdict.json without senses, or one whose
   senses do not pair one to one with the definitions, gives the groups as before. */
const LATE=new Set(['arch','obs','obsc','rare','dated']);
const MISC={arch:'古语',obs:'旧用法',obsc:'罕见',rare:'罕用',dated:'旧时说法',col:'口语',sl:'俚语','net-sl':'网络用语',hon:'尊敬语',hum:'谦让语',pol:'礼貌语',form:'书面语',
 fem:'女性用语',male:'男性用语',vulg:'粗俗',derog:'贬义',joc:'戏谑',poet:'诗歌用语',chn:'儿语',euph:'委婉语',id:'惯用语',yoji:'四字熟语',proverb:'谚语',
 'on-mim':'拟声拟态',abbr:'略语',sens:'敏感词'};
const FIELD={math:'数学',med:'医学',law:'法律',comp:'计算机',Buddh:'佛教',Shinto:'神道',Christn:'基督教',biol:'生物',chem:'化学',physics:'物理',music:'音乐',
 sports:'体育',food:'饮食',mil:'军事',ling:'语言学',gramm:'语法',finc:'金融',econ:'经济',bus:'商业',baseb:'棒球',sumo:'相扑',MA:'武术',shogi:'将棋',go:'围棋',
 mahj:'麻将',cards:'纸牌',anat:'解剖',bot:'植物',zool:'动物',astron:'天文',geol:'地质',geogr:'地理',hist:'历史',archit:'建筑',engr:'工程',elec:'电学',
 psych:'心理',phil:'哲学',art:'美术',film:'电影',tv:'电视',vidg:'电子游戏',internet:'网络',print:'印刷',photo:'摄影',mech:'机械',agric:'农业',fish:'渔业'};
const DIAL={ksb:'关西方言',kyb:'京都方言',osb:'大阪方言',hob:'北海道方言',thb:'东北方言',kyu:'九州方言',ktb:'关东方言',tsb:'土佐方言',tsug:'津轻方言',rkb:'琉球方言',nab:'长野方言',bra:'巴西日语'};
function senseLabel(sense){
 const names=[...(sense?.misc||[]).map(m=>MISC[m]),...(sense?.field||[]).map(f=>FIELD[f]),...(sense?.dial||[]).map(d=>DIAL[d])].filter(Boolean);
 return [...new Set(names)].map(n=>'〔'+n+'〕').join('');
}
function definitionGroups(entry,language='zh'){
 const definitions=entry.definitions||[],senses=Array.isArray(entry.senses)&&entry.senses.length===definitions.length?entry.senses:null;
 const items=definitions.map((raw,i)=>({raw,sense:senses?.[i]||null,late:!!senses?.[i]?.misc?.some(m=>LATE.has(m))}));
 if(senses)items.sort((a,b)=>a.late-b.late);
 const seen=new Set(),groups=[];
 for(const {raw,sense} of items){const terms=String(raw).split(/[；;]/u).map(s=>s.trim()).filter(Boolean),unique=[];for(const term of terms){const key=term.replace(/[\s。．.]+$/u,'');if(!seen.has(key)){seen.add(key);unique.push(term);}}
  if(!unique.length)continue;const group={title:unique[0],terms:unique,text:unique.join('；'),source:'JMdict'};const label=language==='zh'&&sense?senseLabel(sense):'';if(label)group.label=label;groups.push(group);}
 return groups;
}
module.exports={definitionGroups,senseLabel};
