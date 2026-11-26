// SPDX-License-Identifier: GPL-3.0-or-later
import {trackIssue} from './issue-trackers.js';
const faults=new Set(['instance-failed','runtime-unavailable','hot-reload-failed','desktop-failed','webview-failed','service-failed','service-timeout','service-disconnected','startup-failed','route-failed','frontend-error','frontend-rejection']);
const stages=new Set([...faults,'native-entry','process-start','runtime-ready','splash-start','webview-build-start','webview-built','service-start','service-replied','document','home-ready','content-painted','notice-open','notice-painted','notice-closed','hot-reload','first-window-ready','window-revealed','closed','service-home-start','service-home-done']);
export async function yuiPost(request,env,{readJSON,fail,json,hit},ip,now){
 if(!await hit(env,'diag',ip,now.getTime()))return fail('RATE_LIMITED',429);
 const {value:v,error}=await readJSON(request,512);
 if(error||!v||Object.keys(v).length!==4||typeof v.id!=='string'||!/^[a-f0-9]{64}$/.test(v.id)||!faults.has(v.stage)||!stages.has(v.previous)||!Number.isSafeInteger(v.ms)||v.ms<0||v.ms>86400000)return fail('INVALID_REPORT',400);
 await env.DB.prepare('INSERT INTO yui_events(id,stage,previous,ms) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(v.id,v.stage,v.previous,v.ms).run();
 return json({ok:true});
}
// A single D1 lease owns the GitHub write per failure type. On an ambiguous
// create response the next owner finds the marker before it attempts creation.
export async function syncYui(env){
 if(!env.DB||!env.GITHUB_TOKEN)return;
 const repo=env.GITHUB_REPO||'ilynthn/MeguLit';
 const gh=async(route,method='GET',body)=>{
  const r=await (env.fetch||fetch)('https://api.github.com/repos/'+repo+route,{method,headers:{authorization:'Bearer '+env.GITHUB_TOKEN,accept:'application/vnd.github+json','user-agent':'megulit-relay','content-type':'application/json'},body:body&&JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('YUI_GITHUB_'+r.status);return r.json();
 };
 const now=Date.now(),rows=await env.DB.prepare('SELECT stage FROM yui_issues WHERE synced<count AND lease<? LIMIT 12').bind(now).all();
 for(const {stage} of rows.results){
  const lease=Date.now()+120000;
  const row=await env.DB.prepare('UPDATE yui_issues SET lease=? WHERE stage=? AND lease<? AND synced<count RETURNING *').bind(lease,stage,Date.now()).first();
  if(!row)continue;
  const marker='<!-- megulit-yui:'+stage+' -->',body=marker+'\nOccurrences: '+row.count+'\nPrevious stage: '+row.previous+'\nLatest elapsed time since launch: '+row.ms+' ms';
  let number=row.issue;
  if(!number){
   for(let page=1;!number;page++){
    const items=await gh('/issues?state=all&labels=yui-report&per_page=100&page='+page);
    number=items.find(i=>!i.pull_request&&i.body?.startsWith(marker))?.number;
    if(items.length<100)break;
   }
  }
  if(number)await gh('/issues/'+number,'PATCH',{body});
  else number=(await gh('/issues','POST',{title:'[Yui] '+stage,body,labels:['yui-report','diagnostics']})).number;
  if(!Number.isSafeInteger(number))throw Error('YUI_ISSUE_NUMBER');
  await env.DB.prepare('UPDATE yui_issues SET issue=?,synced=?,lease=0 WHERE stage=? AND lease=?').bind(number,row.count,stage,lease).run();
  /* 2026-11-26 a new failure type: listed in the [Yui] 汇总 tracker, its own issue closed (issue-trackers.js); the
     counts above keep going to the closed issue */
  if(!row.issue)await trackIssue(env,{id:'yui:'+stage,tracker:'yui-report',issue:number,name:stage});
 }
}
