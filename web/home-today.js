/* 2026-11-13 home "today" column: the activity card and, under it, the day's top story as a fourth, larger picture
   (user: "左侧热力图卡片下面有第四张尺寸更大的第一头条", "左下角不要字"). No headline text is drawn on the page; the story's title
   only labels the picture (tooltip / screen readers), in the UI language: zh/en go through daily_translate (the engine chain the
   daily reader uses), a remembered translation is used at once, and a failed or slow one leaves the whole original title,
   never a partial or mixed string. A year without any reading gets an honest empty state instead of a grey grid. */

const STORE='megulit-home-hl-tr-v1',KEEP=40;
const hasPicture=x=>!!x&&/^data:image\//.test(String(x.image||''))&&!!x.link&&!x.flat;

/* the top story of the chosen daily tab (gal/acg) for the big picture, and up to three other pictured stories for the small row */
export function pickHeadline(items,cat='gal',count=3){const list=(Array.isArray(items)?items:[]).filter(hasPicture);
 const top=list.find(x=>(x.cat||'gal')===cat)||list[0]||null;return {top,small:list.filter(x=>x!==top).slice(0,count)};}

/* 'zh' | 'en' for a UI that needs the Japanese title translated, '' for a Japanese UI */
export function headlineTarget(locale){const l=String(locale||'');return l.startsWith('ja')?'':l.startsWith('en')?'en':'zh';}
const langOf=target=>target==='en'?'en':'zh-CN';

function readStore(storage){try{const v=JSON.parse(storage?.getItem(STORE)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
function writeStore(storage,map){try{const keys=Object.keys(map).slice(-KEEP);storage?.setItem(STORE,JSON.stringify(Object.fromEntries(keys.map(k=>[k,map[k]]))));}catch{}}
export function cleanTranslation(s){return String(s??'').replace(/\s+/g,' ').trim();}

/* the title as it can be used right now without waiting: the original for a Japanese UI, a remembered translation, or null */
export function cachedHeadline(title,locale,storage=globalThis.localStorage){const src=String(title||'').trim(),target=headlineTarget(locale);
 if(!target)return {text:src,lang:'ja',state:'original'};const hit=readStore(storage)[target+'|'+src];
 return typeof hit==='string'&&hit?{text:hit,lang:langOf(target),state:'translated'}:null;}

/* resolves to the whole title in the UI language, or to the whole original when no translation comes back in time */
export async function translateHeadline(api,title,locale,{storage=globalThis.localStorage,timeout=8000}={}){
 const src=String(title||'').trim(),target=headlineTarget(locale),original={text:src,lang:'ja',state:'original'};if(!src)return original;
 const hit=cachedHeadline(src,locale,storage);if(hit)return hit;
 let timer=0;try{const res=await Promise.race([api('daily_translate',{texts:[src],target}),new Promise((_,fail)=>{timer=setTimeout(()=>fail(Error('TIMEOUT')),timeout);})]);
  const list=Array.isArray(res)?res:res?.texts,text=cleanTranslation(Array.isArray(list)?list[0]:'');if(!text||text===src)return original;
  const map=readStore(storage);delete map[target+'|'+src];map[target+'|'+src]=text;writeStore(storage,map);return {text,lang:langOf(target),state:'translated'};}
 catch{return original;}finally{clearTimeout(timer);}}

/* tooltip for the big picture: the title in the UI language, with the original under it when it was translated */
export function headlineLabel(r,original){const o=String(original||'').trim();return r?.state==='translated'&&r.text!==o?`${r.text}\n${o}`:o;}

/* activity summary of the cells on the card; empty when the whole year (all records, not only the shown weeks) has no reading */
export function activitySummary(cells,all=cells){let run=0,best=0,secs=0,active=0;for(const c of cells){run=c.level?run+1:0;best=Math.max(best,run);secs+=c.seconds||0;if(c.level)active++;}
 const empty=!all.some(c=>(c.seconds||0)>0||(c.lookups||0)>0||(c.characters||0)>0);return {active,secs,best,empty};}

export const EMPTY_COPY={zh:{title:'还没有阅读记录',body:'开始游玩后，每天读了多少会在这里点亮'},ja:{title:'まだ読書の記録がありません',body:'ゲームを遊ぶと、読んだ日がここに灯ります'},
 en:{title:'No reading yet',body:'Play a game and every day you read lights up here'}};

/* the empty card: this week's seven days as hairline squares with today marked, and one honest line */
export function emptyActivityHTML(locale,esc,today=new Date()){const w=EMPTY_COPY[locale]||EMPTY_COPY.zh,dow=today.getDay();
 return `<div class="tv-heat-empty"><div class="tv-heat-week" aria-hidden="true">${Array.from({length:7},(_,i)=>`<i class="${i===dow?'today':i>dow?'later':''}"></i>`).join('')}</div><p><b>${esc(w.title)}</b><span>${esc(w.body)}</span></p></div>`;}
