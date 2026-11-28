// SPDX-License-Identifier: GPL-3.0-or-later
/* E377 pure request validation for the MeguLit relay. No I/O here, so validation/relay.test.cjs can run it in Node. */
import Content from '../../core/content-word.cjs';

/* Nickname rules — keep in step with services/leaderboard.cjs cleanName (validation/leaderboard.test.cjs checks both). */
export const BLOCKED=['fuck','shit','bitch','cunt','nigger','nigga','faggot','rape','porn','penis','vagina','asshole','dick','whore','slut','hitler','nazi','傻逼','煞笔','傻b','sb','操你','草你','肏','日你','你妈','尼玛','妈逼','屌','鸡巴','婊子','贱人','强奸','做爱','色情','黄片','习近平','共产党','法轮','台独','死ね','殺す','ちんこ','まんこ','うんこ','セックス','レイプ','きちがい','キチガイ','admin','管理员','官方','megulit','hentai','nsfw','sex','loli','shota','cnm','nmsl','tmd','retard','kys','r18','18禁','成人向','巨乳','爆乳','乳头','裸体','全裸','约炮','卖淫','嫖','淫','骚货','痴汉','中出','av女优','エロ','ロリ','ショタ','おっぱい','パイズリ','中出し','ヘンタイ','変態','废物','垃圾人','去死','脑残','智障','弱智','狗东西','ばか野郎','クソ野郎','消えろ'];
const hidden=ch=>{const c=ch.codePointAt(0);return c<32||c>=0x7f&&c<=0x9f||c>=0x200b&&c<=0x200f||c>=0x2028&&c<=0x202e||c>=0x2060&&c<=0x206f||c===0xfeff;};
export function cleanName(value){
 if(typeof value!=='string')return {ok:false,error:'NAME_REQUIRED'};
 const name=value.normalize('NFKC').replace(/\s+/g,' ').trim();
 if(!name)return {ok:false,error:'NAME_REQUIRED'};
 const chars=[...name];if(chars.length<2||chars.length>16)return {ok:false,error:'NAME_LENGTH'};
 if(chars.some(hidden)||/[<>"'`\\]/.test(name)||/https?:|www\.|\.(?:com|net|org|cn|jp|io)\b|@/i.test(name))return {ok:false,error:'NAME_INVALID'};
 const lower=name.toLowerCase(),flat=lower.replace(/[\s._\-*·・]/g,''),tokens=lower.split(/[^a-z]+/).filter(Boolean);
 if(BLOCKED.some(word=>/^[a-z]+$/.test(word)?flat===word||tokens.some(t=>t.startsWith(word)):flat.includes(word)))return {ok:false,error:'NAME_BLOCKED'};
 return {ok:true,name};
}

export const PERIODS=['week','month','all'],METRICS=['characters','seconds','words','streak','reviews','kana','grammar','anki','practice','studySeconds'];
/* 2026-11-15 学习练习: `study` is not posted; the relay adds STUDY_PARTS. It is a board metric (BOARD_METRICS) only. */
export const STUDY_PARTS=['kana','grammar','anki','practice'],BOARD_METRICS=['characters','seconds','words','streak','reviews','kana','study'];
/* E401 reviews and kana arrived later: older clients leave them out and they count as 0 */
export const OPTIONAL_METRICS=['reviews','kana','grammar','anki','practice','studySeconds'];
/* Upper bounds a real reader cannot pass; anything above is rejected as a whole. */
export const CAPS={
 week:{characters:3_000_000,seconds:7*86400,words:20_000,streak:7,reviews:100_000,kana:200_000,grammar:200_000,anki:200_000,practice:200_000,studySeconds:7*86400},
 month:{characters:12_000_000,seconds:31*86400,words:80_000,streak:31,reviews:400_000,kana:800_000,grammar:800_000,anki:800_000,practice:800_000,studySeconds:31*86400},
 all:{characters:2_000_000_000,seconds:200_000_000,words:2_000_000,streak:40_000,reviews:50_000_000,kana:50_000_000,grammar:50_000_000,anki:50_000_000,practice:50_000_000,studySeconds:200_000_000}
};
export const LIMITS={body:64*1024,games:30,title:120,adaptationRecords:50,adaptationRecord:16*1024,keys:50,meta:16*1024,zip:20*1024*1024};
const isInt=v=>Number.isSafeInteger(v)&&v>=0;
export const INSTALL_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const HEX64=/^[a-f0-9]{64}$/;

/* ISO week / month keys of a UTC instant; the client sends its local keys, which are accepted within ±14 h. */
export function isoWeek(date){const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const year=d.getUTCFullYear(),first=new Date(Date.UTC(year,0,1));return `${year}-W${String(Math.ceil(((d-first)/86400000+1)/7)).padStart(2,'0')}`;}
export function periodKeysAt(date){return {week:isoWeek(date),month:`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`,all:'all'};}
export function allowedKeys(now=new Date()){const out={week:new Set(),month:new Set()};for(const h of [-14,0,14]){const k=periodKeysAt(new Date(now.getTime()+h*3600000));out.week.add(k.week);out.month.add(k.month);}return out;}
export function gameKey(title){return String(title||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();}

/* POST /api/leaderboard body → {ok,value} | {ok:false,error} */
export function validateLeaderboard(body,now=new Date()){
 if(!body||typeof body!=='object'||Array.isArray(body))return {ok:false,error:'INVALID_BODY'};
 if(body.version!==1)return {ok:false,error:'UNSUPPORTED_VERSION'};
 if(typeof body.id!=='string'||!INSTALL_ID.test(body.id))return {ok:false,error:'INVALID_ID'};
 const name=cleanName(body.name);if(!name.ok)return {ok:false,error:name.error};
 const allowed=allowedKeys(now),keys={week:String(body.keys?.week||''),month:String(body.keys?.month||''),all:'all'};
 if(!allowed.week.has(keys.week)||!allowed.month.has(keys.month))return {ok:false,error:'PERIOD_KEY_OUT_OF_RANGE'};
 const stats={};
 for(const period of PERIODS){const p=body.stats?.[period];if(!p||typeof p!=='object')return {ok:false,error:'INVALID_STATS'};stats[period]={};
  for(const metric of METRICS){const v=p[metric]===undefined&&OPTIONAL_METRICS.includes(metric)?0:p[metric];if(!isInt(v))return {ok:false,error:'INVALID_STATS'};if(v>CAPS[period][metric])return {ok:false,error:'STATS_OUT_OF_RANGE'};stats[period][metric]=v;}
  stats[period].study=STUDY_PARTS.reduce((n,k)=>n+stats[period][k],0);}
 if(stats.all.characters<stats.month.characters||stats.all.seconds<stats.month.seconds)return {ok:false,error:'INVALID_STATS'};
 let games=null;
 if(body.games!==undefined){if(!Array.isArray(body.games)||body.games.length>LIMITS.games)return {ok:false,error:'INVALID_GAMES'};games=[];const seen=new Set();
  for(const g of body.games){const title=typeof g?.title==='string'?g.title.normalize('NFKC').replace(/\s+/g,' ').trim():'';
   if(!title||[...title].length>LIMITS.title||[...title].some(hidden)||/[<>]/.test(title))return {ok:false,error:'INVALID_GAMES'};
   if(!isInt(g.characters)||!isInt(g.seconds)||g.characters>CAPS.all.characters||g.seconds>CAPS.all.seconds)return {ok:false,error:'INVALID_GAMES'};
   /* E397 optional last-read time (unix seconds), never in the future */
   const last=g.last===undefined?0:g.last;if(!isInt(last)||last>Math.floor(now.getTime()/1000)+86400)return {ok:false,error:'INVALID_GAMES'};
   const key=gameKey(title);if(seen.has(key))continue;seen.add(key);games.push({key,title,characters:g.characters,seconds:g.seconds,last});}}
 /* 2026-11-12 转职: optional element and level */
 const element=body.element===undefined?'':body.element;if(!['','fire','ice','thunder','wind','water','earth','light','dark'].includes(element))return {ok:false,error:'INVALID_ELEMENT'};
 const level=body.level===undefined?0:body.level;if(!isInt(level)||level>10000)return {ok:false,error:'INVALID_LEVEL'};
 return {ok:true,value:{id:body.id,name:name.name,keys,stats,games,element,level}};
}
/* GET /api/leaderboard query → {ok,value} */
export function validateBoardQuery(params,now=new Date()){
 const metric=params.get('metric')||'seconds',me=params.get('me')||'';
 if(me&&!HEX64.test(me))return {ok:false,error:'INVALID_QUERY'};
 if(metric==='games'){const game=params.get('game');if(game!==null&&(!game.trim()||[...game].length>LIMITS.title))return {ok:false,error:'INVALID_QUERY'};return {ok:true,value:{metric,game:game===null?null:gameKey(game),me}};}
 const period=params.get('period')||'week';if(!PERIODS.includes(period)||!BOARD_METRICS.includes(metric))return {ok:false,error:'INVALID_QUERY'};
 let key=period==='all'?'all':params.get('key')||periodKeysAt(now)[period];
 if(period==='week'&&!/^\d{4}-W\d{2}$/.test(key)||period==='month'&&!/^\d{4}-\d{2}$/.test(key))return {ok:false,error:'INVALID_QUERY'};
 return {ok:true,value:{period,metric,key,me}};
}

/* Shared adaptation records (services/shared-adaptation.cjs in the shared-config branch): schema megulit.adaptation v1,
   keyed by a 64-hex fingerprint key. The relay only checks the envelope and size; the client cleans fields again on pull. */
export function validateAdaptationRecord(record){
 if(!record||typeof record!=='object'||Array.isArray(record))return null;
 const key=typeof record.key==='string'?record.key:'';if(!HEX64.test(key))return null;
 if(record.schema!==undefined&&record.schema!=='megulit.adaptation')return null;
 if(record.version!==undefined&&record.version!==1)return null;
 let json;try{json=JSON.stringify(record);}catch{return null;}
 if(json.length>LIMITS.adaptationRecord)return null;
 /* never store anything that looks like a Windows path or a user folder */
 if(/[a-z]:\\\\|\\\\users\\\\|\/users\//i.test(json))return null;
 return {key,json};
}
export function validateKeys(list){if(!Array.isArray(list))return null;const keys=[...new Set(list.map(k=>String(k||'').toLowerCase()).filter(k=>HEX64.test(k)))];return keys.length<=LIMITS.keys?keys:null;}

/* Diagnostics meta (services/diagnostics-upload.cjs in the diagnostics branch). */
export function validateMeta(meta){
 if(!meta||typeof meta!=='object'||Array.isArray(meta))return {ok:false,error:'INVALID_META'};
 const s=(v,max)=>typeof v==='string'?[...v].filter(ch=>{const c=ch.codePointAt(0);return c===9||c===10||c===13||c>=32&&c!==127;}).join('').slice(0,max):'';
 const value={schema:Number(meta.schema)||1,version:s(meta.version,32),game:{id:s(meta.game?.id,80),title:s(meta.game?.title,200),engine:s(meta.game?.engine,40)},os:s(meta.os,60),size:Number.isSafeInteger(meta.size)?meta.size:null,sha256:HEX64.test(String(meta.sha256||''))?meta.sha256:'',createdAt:s(meta.createdAt,40),note:s(meta.note,2000)};
 if(value.version&&!/^\d+\.\d+\.\d+[a-z]?$/.test(value.version))return {ok:false,error:'INVALID_META'};
 return {ok:true,value};
}
/* Markdown-safe text for the GitHub issue body */
export function mdText(value){return String(value||'').replace(/[\\`*_{}\[\]<>()#+!|@~]/g,c=>'\\'+c).replace(/\r?\n/g,'  \n');}
export function issueBody(meta,link,days){
 const lines=['MeguLit diagnostics package uploaded through the relay.','',
  `- Version: ${mdText(meta.version||'?')}`,`- Game: ${mdText(meta.game.title||'?')} (${mdText(meta.game.engine||'unknown engine')})`,`- OS: ${mdText(meta.os||'?')}`,
  `- Size: ${meta.size??'?'} bytes`,`- SHA-256: \`${meta.sha256||'-'}\``,`- Created: ${mdText(meta.createdAt||'?')}`,'',
  `Download (expires in ${days} days): ${link}`];
 if(meta.note)lines.push('','User note:','',meta.note.split(/\r?\n/).map(l=>'> '+mdText(l)).join('\n'));
 return lines.join('\n');
}

/* ---- E379 weekly hot lookups ----------------------------------------------------------------------------------- */
/* Hot-word weeks run Monday 00:00 to Monday 00:00 in UTC+8 (China / Taiwan time; Japan is an hour later). */
export function hotWeekKey(date){return isoWeek(new Date(date.getTime()+8*3600000));}
/* smallWeek: fewer readers than this in a week and two readers are enough to rank (2026-11-28, W47 had 8 readers and empty boards) */
export const HOT={terms:100,count:1000,termChars:40,minUsers:3,smallWeek:20,top:50,podium:3,cards:10};
export const CATEGORIES=['word','phrase','sentence'];
const JAPANESE=/[぀-ヿ㐀-鿿ｦ-ﾟ]/;
const hiddenChar=ch=>{const c=ch.codePointAt(0);return c<32||c>=0x7f&&c<=0x9f||c>=0x200b&&c<=0x200f||c>=0x2028&&c<=0x202e||c>=0x2060&&c<=0x206f||c===0xfeff;};
/* The looked-up text itself, normalized; '' when it is not a Japanese lookup worth counting. */
export function cleanTerm(value){
 if(typeof value!=='string')return '';const term=value.normalize('NFKC').replace(/\s+/g,' ').trim();const chars=[...term];
 if(!chars.length||chars.length>HOT.termChars||chars.some(hiddenChar)||!JAPANESE.test(term)||/https?:|www\.|[<>@\\`]/i.test(term))return '';
 return term;
}
/* 短句: sentence punctuation or long; 短语: a particle between content words, or a 、/space; 词汇: everything else. */
// one rule for the relay and the app: core/content-word.cjs hotCategory
export const classifyTerm=term=>Content.hotCategory(term);
/* Term on the block list (R18 / abuse): never awarded. */
export function blockedTerm(term){const flat=term.toLowerCase().replace(/[\s._\-*·・]/g,'');return BLOCKED.some(word=>flat.includes(word));}
/* submit body .hot = {week:'2026-W46',terms:[{term,count}]} → {ok,value:{week,terms:Map}} ; absent → {ok,value:null} */
export function validateHot(hot,now=new Date()){
 if(hot===undefined||hot===null)return {ok:true,value:null};
 if(typeof hot!=='object'||Array.isArray(hot)||!Array.isArray(hot.terms)||hot.terms.length>HOT.terms)return {ok:false,error:'INVALID_LOOKUPS'};
 const week=String(hot.week||'');if(week!==hotWeekKey(now)&&week!==hotWeekKey(new Date(now.getTime()-3600000)))return {ok:false,error:'PERIOD_KEY_OUT_OF_RANGE'};
 const terms=new Map();
 for(const item of hot.terms){const term=cleanTerm(item?.term);if(!term||!Number.isSafeInteger(item.count)||item.count<1||item.count>HOT.count)return {ok:false,error:'INVALID_LOOKUPS'};terms.set(term,Math.min(HOT.count,(terms.get(term)||0)+item.count));}
 return {ok:true,value:{week,terms}};
}

/* ---- E379 avatars ---------------------------------------------------------------------------------------------- */
export const AVATAR={bytes:64*1024,max:256,min:32};
/* Width/height of a still WebP (VP8 / VP8L / VP8X); null for anything else, animated files included. */
export function webpInfo(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<30)return null;
 const tag=(o,s)=>String.fromCharCode(...bytes.subarray(o,o+4))===s;
 if(!tag(0,'RIFF')||!tag(8,'WEBP'))return null;
 const riff=bytes[4]|bytes[5]<<8|bytes[6]<<16|bytes[7]<<24;if(riff+8!==bytes.length&&riff+8!==bytes.length-1)return null;
 if(tag(12,'VP8 ')){if(bytes[23]!==0x9d||bytes[24]!==0x01||bytes[25]!==0x2a)return null;return {width:(bytes[26]|bytes[27]<<8)&0x3fff,height:(bytes[28]|bytes[29]<<8)&0x3fff};}
 if(tag(12,'VP8L')){if(bytes[20]!==0x2f)return null;const b=bytes[21]|bytes[22]<<8|bytes[23]<<16|bytes[24]<<24;return {width:(b&0x3fff)+1,height:(b>>>14&0x3fff)+1};}
 if(tag(12,'VP8X')){if(bytes[20]&0x02)return null;return {width:1+(bytes[24]|bytes[25]<<8|bytes[26]<<16),height:1+(bytes[27]|bytes[28]<<8|bytes[29]<<16)};}
 return null;
}
export function validateAvatar(bytes){
 if(!(bytes instanceof Uint8Array)||!bytes.length)return {ok:false,error:'AVATAR_REQUIRED'};
 if(bytes.length>AVATAR.bytes)return {ok:false,error:'PAYLOAD_TOO_LARGE'};
 const info=webpInfo(bytes);if(!info)return {ok:false,error:'AVATAR_NOT_WEBP'};
 if(info.width!==info.height||info.width>AVATAR.max||info.width<AVATAR.min)return {ok:false,error:'AVATAR_SIZE'};
 return {ok:true,value:info};
}

/* ---- E397 public profiles ------------------------------------------------------------------------------------- */
export const PROFILE={bio:60,favorites:5,follows:500,recent:5,kindred:20};
/* A one-line signature: same filter as nicknames (R18, abuse, links), up to 60 characters; empty is fine. Keep in step
   with services/leaderboard.cjs cleanBio. */
export function cleanBio(value){
 if(value===undefined||value===null)return {ok:true,bio:''};
 if(typeof value!=='string')return {ok:false,error:'BIO_INVALID'};
 /* E400 kept as typed (NFC): NFKC would turn kaomoji like ( ´∀｀) into a backtick and combining marks. Checks run on an
    NFKC copy so full-width links and words are still caught. Only links, e-mail addresses, control or invisible
    characters (the emoji joiner U+200D is fine) and blocked words are refused. */
 const bio=value.normalize('NFC').replace(/\s+/g,' ').trim();if(!bio)return {ok:true,bio:''};
 if([...bio].length>PROFILE.bio)return {ok:false,error:'BIO_LENGTH'};
 const folded=bio.normalize('NFKC');
 if([...bio].some(ch=>ch!=='\u200d'&&hidden(ch))||/https?:|www\.|\.(?:com|net|org|cn|jp|io)\b|[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(folded))return {ok:false,error:'BIO_INVALID'};
 const lower=folded.toLowerCase(),flat=lower.replace(/[\s._\-*·・]/g,''),tokens=lower.split(/[^a-z]+/).filter(Boolean);
 if(BLOCKED.some(word=>!NAME_ONLY.includes(word)&&(/^[a-z]+$/.test(word)?tokens.some(t=>t.startsWith(word)):flat.includes(word))))return {ok:false,error:'BIO_BLOCKED'};
 return {ok:true,bio};
}
/* words blocked in nicknames only (impersonation), fine inside a signature */
export const NAME_ONLY=['admin','管理员','官方','megulit'];
/* E397 profile reports */
export const REPORT_KINDS=['discrimination','nudity','racism','harassment','spam','other'];
export function cleanReportReason(value){
 if(value===undefined||value===null||value==='')return {ok:true,reason:''};
 if(typeof value!=='string')return {ok:false,error:'INVALID_REASON'};
 const reason=value.normalize('NFKC').replace(/\s+/g,' ').trim();
 if([...reason].length>500||[...reason].some(hidden))return {ok:false,error:'INVALID_REASON'};
 return {ok:true,reason};
}
export const VNDB=/^v[1-9]\d{0,6}$/;
export const PID=/^[0-9a-f]{16}$/;
/* PUT /api/profile body: {bio, favorites:[{title, vndb?}], public} */
export function validateProfile(body){
 if(!body||typeof body!=='object'||Array.isArray(body))return {ok:false,error:'INVALID_BODY'};
 const bio=cleanBio(body.bio);if(!bio.ok)return bio;
 if(body.public!==undefined&&typeof body.public!=='boolean')return {ok:false,error:'INVALID_BODY'};
 const list=body.favorites===undefined?[]:body.favorites;if(!Array.isArray(list)||list.length>PROFILE.favorites)return {ok:false,error:'INVALID_FAVORITES'};
 const favorites=[],seen=new Set();
 for(const g of list){const title=typeof g?.title==='string'?g.title.normalize('NFKC').replace(/\s+/g,' ').trim():'';
  if(!title||[...title].length>LIMITS.title||[...title].some(hidden)||/[<>]/.test(title))return {ok:false,error:'INVALID_FAVORITES'};
  const vndb=g.vndb===undefined||g.vndb===''?'':String(g.vndb).toLowerCase();if(vndb&&!VNDB.test(vndb))return {ok:false,error:'INVALID_FAVORITES'};
  const key=gameKey(title);if(seen.has(key))continue;seen.add(key);favorites.push({key,title,vndb});}
 return {ok:true,value:{bio:bio.bio,favorites,public:body.public===true}};
}
