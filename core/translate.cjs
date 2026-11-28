// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

function parseGoogle(body){
 if(!Array.isArray(body?.[0]))throw Error('TRANSLATION_INVALID_RESPONSE');
 return body[0].map(part=>typeof part?.[0]==='string'?part[0]:'').join('').trim();
}

const clients=new WeakMap();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function client(fetcher){
 if(!clients.has(fetcher))clients.set(fetcher,{queue:new Set(),foreground:new Set(),running:false,next:0,blocked:new Map(),pending:new Map(),cache:new Map()});
 return clients.get(fetcher);
}
function isForeground(job){
 return job.foreground.some(current=>{try{return current();}catch{return false;}});
}
function nextJob(state){
 for(const job of state.foreground)if(isForeground(job))return job;
 return state.queue.values().next().value;
}
async function drain(state){
 if(state.running)return;
 state.running=true;
 await Promise.resolve();
 while(state.queue.size){
  const job=nextJob(state);
  try{
   const result=await job.step();
   // Choose again after the interval or a failed attempt, when another line may be visible.
   if(typeof result==='number'){await pause(result);continue;}
   if(result===undefined)continue;
   job.resolve(result);
  }catch(error){job.reject(error);}
  state.queue.delete(job);state.foreground.delete(job);
 }
 state.running=false;
}
const language=lang=>({zh:'zh-CN','zh-Hans':'zh-CN','zh-Hant':'zh-TW'}[lang]||lang);
function translateFree(text,{fetcher=fetch,source='auto',target='zh',preferred='google',signal,isCurrent=()=>true,foreground}={}){
 if(typeof text!=='string'||!text.trim()||text.length>8000)return Promise.reject(Error('TRANSLATION_INVALID_TEXT'));
 target=language(target);source=language(source);
 const state=client(fetcher),key=JSON.stringify([preferred,source,target,text]);
 if(state.cache.has(key))return Promise.resolve(state.cache.get(key));
 const visible=foreground&&(()=>isCurrent()&&foreground());
 const pending=state.pending.get(key);
 if(pending&&!signal){
  // A late caller must not override another view that still needs the same request.
  if(visible&&state.queue.has(pending)){pending.foreground.push(visible);state.foreground.add(pending);}
  return pending.promise;
 }
 const providers=preferred==='google-only'?['google','google-web']:preferred==='microsoft'?['microsoft','google','google-web']:['google','microsoft','google-web'];
 let providerIndex=0,limited=false,lastStatus=0;
 const job={foreground:visible?[visible]:[],async step(){
  while(providerIndex<providers.length){
   signal?.throwIfAborted();
   if(!isCurrent()&&!isForeground(job))throw Error('Superseded sentence');
   const provider=providers[providerIndex],blocked=state.blocked.get(provider);
   if(blocked?.until>Date.now()){providerIndex++;limited||=blocked.status===429;lastStatus=blocked.status||lastStatus;continue;}
   const wait=state.next-Date.now();if(wait>0)return wait;
   providerIndex++;
   const timeout=AbortSignal.timeout(5500),options={redirect:'error',signal:signal?AbortSignal.any([timeout,signal]):timeout};
   try{
    let response;
    if(provider==='microsoft'){
     const ms=lang=>({'zh-CN':'zh-Hans','zh-TW':'zh-Hant'}[lang]||lang);
     const query=new URLSearchParams({isEnterpriseClient:'False',to:ms(target)});
     if(source!=='auto')query.set('from',ms(source));
     response=await fetcher('https://edge.microsoft.com/translate/translatetext?'+query,{...options,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([text])});
    }else{
     const host=provider==='google'?'translate.googleapis.com':'translate.google.com';
     const query=new URLSearchParams({client:'gtx',sl:source,tl:target,dt:'t'});
     response=await fetcher('https://'+host+'/translate_a/single?'+query,{...options,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',Accept:'application/json'},body:new URLSearchParams({q:text}).toString()});
    }
    if(!response.ok){
     lastStatus=response.status;
     let cooldown=30000;
     if(response.status===429){
      const retry=response.headers?.get('retry-after'),seconds=Number(retry),date=Date.parse(retry);
      cooldown=Math.max(60000,retry&&Number.isFinite(seconds)?seconds*1000:Number.isFinite(date)?date-Date.now():0);
      limited=true;
     }else if([401,403,404].includes(response.status))cooldown=600000;
     state.blocked.set(provider,{until:Date.now()+cooldown,status:response.status});
     if(response.status===429&&provider.startsWith('google'))for(const alias of ['google','google-web'])state.blocked.set(alias,{until:Date.now()+cooldown,status:429});
     return;
    }
    const body=await response.json();
    const translated=provider==='microsoft'?body?.[0]?.translations?.[0]?.text:parseGoogle(body);
    const result=typeof translated==='string'?translated.trim():'';
    if(!result)throw Error('TRANSLATION_EMPTY');
    state.cache.set(key,result);
    if(state.cache.size>400)state.cache.delete(state.cache.keys().next().value);
    return result;
   }catch(error){
    signal?.throwIfAborted();
    state.blocked.set(provider,{until:Date.now()+30000,status:0});
   }finally{state.next=Date.now()+350;}
   return;
  }
  throw Error(limited?'TRANSLATION_HTTP_429':lastStatus?'TRANSLATION_HTTP_'+lastStatus:'TRANSLATION_UNAVAILABLE');
 }};
 job.promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});
 if(!signal){
  state.pending.set(key,job);
  job.promise.finally(()=>state.pending.delete(key)).catch(()=>{});
 }
 state.queue.add(job);
 if(visible)state.foreground.add(job);
 void drain(state);
 return job.promise;
}
function createTranslator(fetcher=fetch){
 return (text,isCurrent=()=>true,lang='zh',foreground)=>translateFree(text,{fetcher,isCurrent,source:'ja',target:lang,foreground});
}
module.exports={parseGoogle,createTranslator,translateFree};
