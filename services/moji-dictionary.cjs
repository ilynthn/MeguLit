// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// MOJi 辞書 direct client. MeguLit talks to the official MOJi endpoints itself (no Luna, no local proxy).
// Sign-in reuses the official "scan with the MOJi app" flow: the QR id is public, the session token it yields
// is sealed with Windows DPAPI in data/config/moji and never logged or returned to the page.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');

const parseEndpoint='https://api.mojidict.com/parse/functions/';
const appEndpoint='https://api.mojidict.com/app/mojidict';
const site={origin:'https://www.mojidict.com',referer:'https://www.mojidict.com/'};
const installation=randomUUID();
const browserClient={_ApplicationId:'E62VyFVLMiW7kvbtVq3p',_ClientVersion:'js3.4.1',_InstallationId:installation,g_os:'PCWeb',g_ver:'v4.8.8.20240829'};
const array=value=>Array.isArray(value)?value:[];
const clean=(value,limit=1600)=>typeof value==='string'?value.trim().slice(0,limit):'';
const QR_LIFETIME=300000;

// Official part-of-speech and conjugation tables (MOJi web client, CN locale).
const POS={1:'名',2:'代名',3:'形动',4:'连体',5:'副',6:'接续',7:'感动',8:'动',9:'形',10:'助动',11:'助',12:'接头',13:'接尾',14:'惯用',15:'形动ナリ',16:'形动タリ',17:'形ク',18:'形シク',19:'枕词'};
const VERB={1:'五段',2:'一段',3:'カ变',4:'サ变',5:'ザ变',6:'文言四段',7:'文言上二段',8:'文言下二段',9:'文言カ变',10:'文言サ变',11:'文言ザ变',12:'文言ナ变',13:'文言ラ变'};
const GROUP={'五段':'一类','一段':'二类','カ变':'三类','サ变':'三类'};
const normalize=token=>token.replace(/[動変類續頭體詞]/g,c=>({動:'动',変:'变',類:'类',續:'续',頭:'头',體:'体',詞:'词'})[c]).replace(/^(?:自|他|自他)动$/,m=>m).trim();
const POS_TEXT=new Set([...Object.values(POS),'名词','动词','自动','他动','自他动','形容词','形容动词','副词','接续词','感叹词','代词','数词','连语','名词形容动词','形动词']);

// Pull word class facts from MOJi's own labels ("[自他动·二类]", "動詞·五段") and structured codes. Unknown stays unknown.
function grammar(...sources){
 const pos=new Set();let verb='',group='';
 const take=raw=>{
  const token=normalize(String(raw||''));if(!token)return;
  if(GROUP[token]){verb||=token;group||=GROUP[token];return;}
  if(/^[一二三]类$/.test(token)){group||=token;return;}
  if(Object.values(VERB).includes(token)){verb||=token;return;}
  if(POS_TEXT.has(token))pos.add(token);
 };
 for(const source of sources){
  if(!source)continue;
  if(typeof source==='string'){
   const bracket=source.match(/^\s*[\[［【]([^\]］】]{1,40})[\]］】]/);
   for(const part of (bracket?bracket[1]:source).split(/[·・#\/\s,，、]+/))take(part);
   continue;
  }
  if(typeof source==='object'){
   const codes=source.partOfSpeech&&typeof source.partOfSpeech==='object'&&!Array.isArray(source.partOfSpeech)?source.partOfSpeech:source;
   for(const [key,value] of Object.entries(codes)){
    const list=array(value).length?array(value):Number.isInteger(value)?[value]:[];
    if(/^partOfSpeech$/i.test(key))for(const code of list)if(POS[code])pos.add(POS[code]);
    if(/verb/i.test(key))for(const code of list)if(VERB[code]){verb||=VERB[code];group||=GROUP[VERB[code]]||'';}
   }
  }
 }
 if(verb&&!group)group=GROUP[verb]||'';
 return {partOfSpeech:[...pos].slice(0,6),verbType:verb,verbGroup:group};
}

class MojiSession{
 constructor(root,vault){this.folder=path.join(root,'data','config','moji');this.launcher=path.join(root,'native','KeyVault.exe');this.vault=vault;this.device=installation;this.cached=undefined;}
 store(){const {SecretStore}=require('../core/secrets.cjs');fs.mkdirSync(this.folder,{recursive:true});return new SecretStore(this.folder,this.vault,this.launcher);}
 token(){
  if(this.cached!==undefined)return this.cached;
  try{this.cached=fs.existsSync(path.join(this.folder,'secrets.dpapi'))?(Object.fromEntries(this.store().entries()).session||''):'';}catch{this.cached='';}
  return this.cached;
 }
 profile(){try{return JSON.parse(fs.readFileSync(path.join(this.folder,'profile.json'),'utf8'));}catch{return {};}}
 save(token,profile){this.store().set('session',token);this.cached=token;fs.writeFileSync(path.join(this.folder,'profile.json'),JSON.stringify({name:clean(profile?.name,60),signedInAt:Date.now()}));}
 clear(){try{this.store().set('session','');}catch{}this.cached='';try{fs.rmSync(path.join(this.folder,'profile.json'),{force:true});}catch{}}
}
const sessions=new Map();
const sessionFor=(root,vault)=>{const key=path.resolve(root);if(!sessions.has(key))sessions.set(key,new MojiSession(key,vault));return sessions.get(key);};

function client({root,fetcher=fetch,vault}={}){
 const session=root?sessionFor(root,vault):null;
 const token=()=>session?.token()||'';
 async function app(method,url,body){
  const headers={accept:'application/json',...site,'X-MOJI-OS':'PCWeb','x-MOJI-APP-ID':'com.mojitec.mojidict','X-MOJI-DEVICE-ID':session?.device||installation};
  const auth=token();if(auth){headers['X-MOJI-TOKEN']=auth;headers['X-MOJI-SESSION-ID']=auth;}
  if(body)headers['content-type']='application/json';
  const response=await fetcher(appEndpoint+url,{method,redirect:'error',signal:AbortSignal.timeout(8000),headers,body:body?JSON.stringify(body):undefined});
  let data={};try{data=await response.json();}catch{}
  if(response.status===400&&auth&&/session|token/i.test(String(data?.code||data?.error||''))){session?.clear();throw Error('MOJI_SESSION_EXPIRED');}
  if(!response.ok)throw Error('MOJI_UNAVAILABLE');
  return data;
 }
 async function parse(method,params){
  const auth=token();
  const response=await fetcher(parseEndpoint+method,{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(6500),
   headers:{accept:'application/json','content-type':method==='union-api'?'text/plain':'application/json',...site},
   body:JSON.stringify({...browserClient,...(auth?{_SessionToken:auth}:{}),...params})
  });
  if(!response.ok)throw Error('MOJI_UNAVAILABLE');
  const body=await response.json();
  if(body.error||!body.result)throw Error('MOJI_UNAVAILABLE');
  return body.result;
 }
 return {session,app,parse};
}

function summary(word,details,extra){
 const facts=grammar(...array(details).map(d=>clean(d?.title,80)),word?.partOfSpeech?{partOfSpeech:word.partOfSpeech}:null,extra);
 const accent=Number.isFinite(word?.accent)?String(word.accent):clean(word?.accent,20);
 return {id:clean(word?.objectId,40),spelling:clean(word?.spell,100),pron:clean(word?.pron,100),accent,reading:[clean(word?.pron,100),accent].filter(Boolean).join('  '),...facts};
}

// Group MOJi subdetails (meanings) with their examples, the way the official page does: by relaId / subdetailsId.
function meanings(subdetails,examples){
 const groups=new Map();
 for(const item of array(subdetails).slice(0,80)){
  const key=item?.relaId??item?.objectId;if(key==null)continue;const title=clean(item?.title,800);if(!title)continue;
  const group=groups.get(key)||{zh:'',ja:'',examples:[]};
  if(item.lang==='zh-CN')group.zh||=title;else if(item.lang==='ja')group.ja||=title;else group.zh||=title;
  groups.set(key,group);
 }
 const pairs=new Map();
 for(const item of array(examples).slice(0,200)){
  const key=item?.relaId??item?.objectId;if(key==null)continue;const title=clean(item?.title,800);if(!title)continue;
  const pair=pairs.get(key)||{owner:item.subdetailsId,ja:'',zh:''};
  if(item.lang==='ja')pair.ja||=title;else pair.zh||=title;pair.owner??=item.subdetailsId;pairs.set(key,pair);
 }
 for(const pair of pairs.values()){const group=groups.get(pair.owner);if(group&&pair.ja&&group.examples.length<6)group.examples.push({ja:pair.ja,zh:pair.zh});}
 return [...groups.values()].filter(g=>g.zh||g.ja).slice(0,30);
}

async function lookupMoji(query,fetcher=fetch,options={}){
 const word=typeof query==='string'?query.trim().slice(0,100):'';
 if(!word)return [];
 const {parse}=client({root:options.root,fetcher,vault:options.vault});
 const results=[],seen=new Set();
 try{
  const details=(await parse('word-clickSearchV2',{searchText:word,langEnv:'zh-CN_ja'})).result;
  const entry=array(details?.word).find(item=>clean(item?.spell));
  if(entry){
   const head=summary(entry,details.details);
   const groups=meanings(details.subdetails,details.examples);
   results.push({...head,source:'moji',definition:groups.map(g=>[g.zh,g.ja].filter(Boolean).join(' / ')).slice(0,3).join('\n')||clean(entry.excerpt)});
   if(head.id)seen.add(head.id);
  }
 }catch(error){if(error.message!=='MOJI_UNAVAILABLE')throw error;}
 try{
  const result=await parse('union-api',{functions:[{name:'search-all',params:{text:word,types:[102]}}]});
  for(const item of array(result.results?.['search-all']?.result?.word?.searchResult).slice(0,12)){
   const title=clean(item?.title,200),id=clean(item?.targetId||item?.objectId,40);if(!title||(id&&seen.has(id)))continue;
   const [spelling,rest='']=title.split(/\s*\|\s*/),excerpt=clean(item.excerpt);
   const reading=rest.replace(/[◎①-⑳⓪]+/g,' ').trim();const accent=(rest.match(/[◎①-⑳⓪]+/)||[''])[0];
   results.push({id,spelling:spelling.trim(),pron:reading,accent,reading:[reading,accent].filter(Boolean).join('  '),source:'moji',...grammar(excerpt),definition:excerpt.replace(/^\s*[\[［【][^\]］】]{1,40}[\]］】]\s*/,'')});
   if(id)seen.add(id);
  }
 }catch(error){if(!results.length)throw error;}
 return results.slice(0,12);
}

// Word-card facts from MOJi: class, JLPT level and MOJi lookup count for one word (2026-11-13: the card shows MOJi's own
// labels instead of tokenizer classes). Only an entry whose spelling or reading matches is used; no match means no facts.
const kana=text=>String(text||'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
function jlpt(tags){const levels=String(tags||'').split('#').map(t=>t.trim().match(/^N([1-5])$/i)).filter(Boolean).map(m=>Number(m[1]));
 return levels.length?{jlpt:'N'+Math.max(...levels),jlptAll:[...new Set(levels)].sort((a,b)=>b-a).map(n=>'N'+n)}:{jlpt:'',jlptAll:[]};}
function facts(word,details){
 const excerpt=clean(word?.excerpt,200),codes=array(details).map(d=>({partOfSpeech:d?.partOfSpeech}));
 const own=grammar(excerpt),coded=grammar(...codes);let pos=own.partOfSpeech.length?own.partOfSpeech:coded.partOfSpeech;
 if(pos.some(p=>/.动$/.test(p)&&p!=='形动'))pos=pos.filter(p=>p!=='动');
 const viewed=Number(word?.viewedNum);
 return {id:clean(word?.objectId,40),spelling:clean(word?.spell,100),pron:clean(word?.pron,100),partOfSpeech:pos,verbType:own.verbType||coded.verbType,verbGroup:own.verbGroup||coded.verbGroup,
  ...jlpt(word?.tags),views:Number.isFinite(viewed)&&viewed>=0?Math.round(viewed):null};
}
async function wordFacts(spelling,reading='',options={}){
 const word=typeof spelling==='string'?spelling.trim().slice(0,100):'',pron=kana(typeof reading==='string'?reading.trim().slice(0,100):'');
 if(!word)return null;
 const {parse}=client({root:options.root,fetcher:options.fetcher||fetch,vault:options.vault});
 const result=(await parse('word-clickSearchV2',{searchText:word,langEnv:'zh-CN_ja'})).result||{};
 const list=array(result.word).filter(w=>clean(w?.spell));
 const pick=list.find(w=>w.spell===word&&(!pron||kana(w.pron)===pron))||(pron?null:list.find(w=>w.spell===word));
 if(pick)return facts(pick,array(result.details).filter(d=>!d?.wordId||d.wordId===pick.objectId));
 if(!pron)return null;
 /* Same spelling, other reading (今日 こんにち): find that entry in the full search, then read its detail. */
 const {app}=client({root:options.root,fetcher:options.fetcher||fetch,vault:options.vault});
 const found=await parse('union-api',{functions:[{name:'search-all',params:{text:word,types:[102]}}]});
 const hit=array(found.results?.['search-all']?.result?.word?.searchResult).slice(0,12).find(item=>{const [head,rest='']=clean(item?.title,200).split(/\s*\|\s*/);
  return head.trim()===word&&kana(rest.replace(/[◎①-⑳⓪]+/g,'').trim())===pron;});
 const id=clean(hit?.targetId||hit?.objectId,40);if(!validId(id))return null;
 const data=await app('GET','/api/v1/word/detailInfo?wordId='+encodeURIComponent(id));const entry=array(data.word).length?data.word[0]:data.word;
 return entry&&!data.code?facts(entry,data.details):null;
}
const cachedFacts=(spelling,reading,options={})=>cached('f:'+String(spelling||'').slice(0,100)+'|'+String(reading||'').slice(0,100),()=>wordFacts(spelling,reading,options));

async function wordDetail(id,options={}){
 const wordId=typeof id==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(id)?id:'';if(!wordId)throw Error('INVALID_MOJI_WORD');
 const {app}=client(options);
 const {parse}=client(options);
 const [data,community]=await Promise.all([app('GET','/api/v1/word/detailInfo?wordId='+encodeURIComponent(wordId)),parse('comment-list',{targetId:wordId,targetType:102,page:1}).catch(()=>null)]);
 const word=array(data.word).length?data.word[0]:data.word;
 if(!word||data.code)throw Error('MOJI_UNAVAILABLE');
 return {...summary(word,data.details),excerpt:clean(word.excerpt),meanings:meanings(data.subdetails,data.examples),notes:notes(data.notes),comments:comments(community)};
}

// MOJi word notes (detailInfo.notes). Content may be HTML or JSON rich text; reduce to plain paragraphs.
function plain(value){
 if(typeof value!=='string')return '';
 let text=value;
 try{const doc=JSON.parse(value);const out=[];const walk=n=>{if(!n)return;if(typeof n.text==='string')out.push(n.text);if(['paragraph','heading','listItem'].includes(n.type))out.push('\n');array(n.content).forEach(walk);};walk(doc);if(out.length)text=out.join('');}catch{}
 return text.replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/\n{3,}/g,'\n\n').trim().slice(0,4000);
}
function notes(list){
 return array(list).slice(0,20).map(n=>({title:clean(n?.title,200),content:plain(n?.content??n?.text??n?.note),author:clean(n?.user?.name||n?.author?.name||n?.createdBy?.name,60)})).filter(n=>n.content||n.title);
}

// Public MOJi user notes on a word (comment-list, targetType 102). Only name, text, likes and date leave this module.
function comments(result){
 const one=c=>({author:clean(c?.author?.name,60),content:plain(clean(c?.content,2000)),likes:Number(c?.likedNum)||0,date:clean(c?.createdAt,10)});
 return array(result?.result?.comments).slice(0,30).map(c=>({...one(c),replies:array(c?.sub?.comments).slice(0,3).map(one).filter(r=>r.content),replyCount:Number(c?.sub?.count)||0})).filter(c=>c.content);
}

// Official MOJi TTS for a word, downloaded here and returned as a data URL (page CSP blocks remote media).
async function wordAudio(id,options={}){
 const wordId=typeof id==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(id)?id:'';if(!wordId)throw Error('INVALID_MOJI_WORD');
 const fetcher=options.fetcher||fetch;
 const {parse}=client({...options,fetcher});
 const result=await parse('fetchTts_v2',{tarId:wordId,tarType:102});
 const url=result?.result?.url;
 if(typeof url!=='string'||!/^https:\/\/oss\.mojidict\.com\//.test(url))throw Error('MOJI_AUDIO_UNAVAILABLE');
 const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('MOJI_AUDIO_UNAVAILABLE');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(!bytes.length||bytes.length>2_000_000)throw Error('MOJI_AUDIO_UNAVAILABLE');
 return {audio:'data:audio/mpeg;base64,'+bytes.toString('base64')};
}

// Official app-scan sign-in. Stateless for the page: it only ever holds the public QR id.
async function loginStart(options={}){
 const {app}=client(options);
 const data=await app('GET','/api/v1/account/qrcode');
 const qrcodeId=clean(data?.objectId,40);if(!/^[A-Za-z0-9]{8,40}$/.test(qrcodeId))throw Error('MOJI_UNAVAILABLE');
 return {qrcodeId,content:`https://m.mojidict.com/authLogin/scan?qrcodeId=${qrcodeId}&app=dict`,expiresIn:QR_LIFETIME};
}
async function loginPoll(qrcodeId,options={}){
 if(typeof qrcodeId!=='string'||!/^[A-Za-z0-9]{8,40}$/.test(qrcodeId))throw Error('INVALID_MOJI_QR');
 const {app,session}=client(options);
 const data=await app('GET','/api/v1/account/qrcode?qrcodeId='+encodeURIComponent(qrcodeId));
 if(!data?.objectId)return {state:'expired'};
 if(data.status==='scanned')return {state:'scanned'};
 if(data.status!=='accept')return {state:'waiting'};
 const auth=data.authData||{};
 let result=auth.sessionToken?{sessionToken:auth.sessionToken,needBindMobile:auth.needBindMobile}:null;
 if(!result){
  const name=auth.authName||'SessionAuth';
  if(!['SessionAuth','WeChatAuth'].includes(name)||!auth.code)throw Error('MOJI_LOGIN_UNSUPPORTED');
  result=await app('POST','/api/v1/account/unifiedLogin',{authPayload:name==='WeChatAuth'?{code:auth.code,platform:3}:{code:auth.code},authName:name});
 }
 if(result?.needBindMobile)return {state:'bind'};
 const token=clean(result?.sessionToken,400);if(!token)throw Error('MOJI_LOGIN_FAILED');
 session.save(token,result.user||auth.user);warm.clear();
 return {state:'signed-in',...status(options)};
}
function status(options={}){const session=sessionFor(options.root,options.vault);return {signedIn:Boolean(session.token()),name:session.token()?clean(session.profile().name,60):''};}
function logout(options={}){warm.clear();sessionFor(options.root,options.vault).clear();return {signedIn:false,name:''};}

// Warm cache: detail and audio per word id, shared by moji_word / moji_audio / moji_prefetch. Failures are not cached.
const warm=new Map(),WARM_TTL=10*60000,WARM_MAX=80;
function cached(key,make){
 const hit=warm.get(key);if(hit&&Date.now()-hit.at<WARM_TTL)return hit.value;
 const value=make();warm.set(key,{at:Date.now(),value});value.catch(()=>warm.delete(key));
 while(warm.size>WARM_MAX)warm.delete(warm.keys().next().value);
 return value;
}
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(id);
const cachedDetail=(id,options={})=>validId(id)?cached('w:'+id,()=>wordDetail(id,options)):wordDetail(id,options);
const cachedAudio=(id,options={})=>validId(id)?cached('a:'+id,()=>wordAudio(id,options)):wordAudio(id,options);
// Fire-and-forget warm-up of the first few results so opening a detail / pressing play is instant.
function prefetch(ids,options={}){
 const list=[...new Set(array(ids).filter(validId))].slice(0,3);
 list.forEach((id,i)=>{cachedDetail(id,options).catch(()=>{});if(i===0)cachedAudio(id,options).catch(()=>{});});
 return {warming:list.length};
}
// More user notes (page >= 2) for "load more".
async function wordComments(id,page=1,options={}){
 if(!validId(id))throw Error('INVALID_MOJI_WORD');
 const n=Math.max(1,Math.min(50,Number(page)||1));
 const {parse}=client(options);
 const result=await parse('comment-list',{targetId:id,targetType:102,page:n});
 const items=comments(result);
 return {page:n,comments:items,hasMore:items.length>=20};
}
const clearWarm=()=>warm.clear();

module.exports={cachedFacts,wordFacts,facts,jlpt,cachedDetail,cachedAudio,prefetch,wordComments,clearWarm,lookupMoji,wordDetail,wordAudio,notes,comments,loginStart,loginPoll,status,logout,grammar,meanings};
