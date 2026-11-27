// SPDX-License-Identifier: GPL-3.0-or-later
export function cardinalTenPoint(value){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)return '未知';
 // Only a perfect normalized score may display 10 after rounding.
 return Math.min(value===1?10:9.99,Math.round(value*1000)/100)+' / 10';
}
export function seedAdminClient(score){
 'use strict';
 score=score||cardinalTenPoint;
 const root=document.getElementById('seed-admin');if(!root)return;
 const $=id=>root.querySelector('[data-admin="'+id+'"]');
 const T=s=>typeof window.__t==='function'?window.__t(s):s,put=(e,s)=>{e.textContent=T(String(s));},ask=s=>window.confirm(T(s));
 let lastOverview=null,lastAudit=null;
 const labels={pending:'待核查',reviewing:'核查中','needs-change':'需修改',passed:'旧人工标记（非质量结论）',deleted:'已删除'};
 let token='',epoch=0,busy=false,uncertain=false,items=[],selected=null,cursor=null,filter='',kind='',uploaderCursor=null,uploaderRows=[];
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=T(String(text));if(cls)e.className=cls;return e;};
 const unknown=v=>typeof v==='number'&&Number.isFinite(v)?String(v):'未知';
 const notice=s=>{put($('notice'),s);};
 let policy=null,policyRead=0,policyWriting=false;
 const scannerLabels={online:'在线',offline:'离线',unknown:'未确认',busy:'繁忙',unready:'未就绪',unconfigured:'未配置'};
 function drawPolicy(p){
  policy=p;
  const control=$('policy-toggle');
  control.setAttribute('aria-checked',String(p?.enabled===true));
  control.dataset.locked=String(!p||policyWriting);
  const state=p?.enabled?'已开启':'已暂停';
  const scanner=p?scannerLabels[p.scanner]||'未确认':'未确认';
  const next=!p?.enabled||p.scanner==='offline'||p.scanner==='unready'||p.scanner==='unconfigured'?'上传留在队列':p.scanner==='online'?'扫描通过后自动签发下发':p.scanner==='busy'?'等待空闲后继续处理':'等待确认扫描服务状态';
  put($('policy-state'),p?state+'，待处理 '+p.pending+' 份，扫描服务'+scanner+'，'+next:'正在确认自动处理状态');
  if(p?.enhanced)put($('policy-state'),state+' · 待处理任务 '+p.pendingSeeds+' 项 · 扫描中 '+p.scanning+' · 实测中 '+p.enhanced.active+' · 扫描服务'+scanner+' · '+(p.enhanced.host==='online'?'实测宿主在线':'等待可信实测宿主'));
  buttons();
 }
 async function readPolicy(){
  const seq=++policyRead,session=epoch;
  try{
   const p=await api('ordinary-policy');
   if(seq!==policyRead||session!==epoch)return;
   if(typeof p.enabled!=='boolean'||!Number.isSafeInteger(p.revision)||!Number.isSafeInteger(p.pending)||!Number.isSafeInteger(p.scanning))throw Error();
   $('workspace').hidden=false;drawPolicy(p);put($('policy-note'),'');
  }catch{if(seq===policyRead&&session===epoch){drawPolicy(null);put($('policy-state'),'状态读取失败，请刷新');}}
 }
 async function changePolicy(){
  if(!policy||!token||policyWriting||!ask(policy.enabled?'暂停 Seed 自动发布？已发布版本仍可接收，新的上传将排队。':'恢复 Seed 自动发布并处理等待中的任务？'))return;
  const session=epoch,want=!policy.enabled,revision=policy.revision;policyWriting=true;++policyRead;drawPolicy(policy);
  let message='';
  try{await api('ordinary-policy',{enabled:want,revision});}
  catch(e){message=e.message==='CONFLICT'?'策略已由其他管理员更改，请核对当前状态':'操作结果待核对';}
  finally{if(session===epoch){policyWriting=false;await readPolicy();if(message&&session===epoch)put($('policy-note'),message);}}
 }
 function buttons(){root.querySelectorAll('[data-connected]').forEach(b=>{b.disabled=!token||b.dataset.locked==='true'||(b!==$('policy-toggle')&&(busy||b.hasAttribute('data-write')&&uncertain));});$('connect').disabled=busy;}
 async function api(route,body){
  if(!token)throw Error('NOT_CONNECTED');const id=epoch,key=token;
  const target=route.startsWith('@torch/')?'/api/torch-release/'+route.slice(7):'/api/seed-admin/'+route;
  const r=await fetch(target,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,...body?{'content-type':'application/json'}:{}},body:body?JSON.stringify(body):undefined,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(id!==epoch)throw Error('STALE_SESSION');
  if(r.status===401){await r.body?.cancel();disconnect();notice('授权未通过，凭证已清除，需要重新授权');throw Error('UNAUTHORIZED');}
  if(r.status===404){await r.body?.cancel();throw Error('ADMIN_NOT_CONNECTED');}if(r.status===503){await r.body?.cancel();throw Error('ADMIN_NOT_READY');}
  const reader=r.body.getReader(),chunks=[];let size=0;try{for(;;){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>(route.startsWith('@torch/history?')?8*1024*1024:1024*1024))throw Error('RESPONSE_LIMIT');chunks.push(v.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  if(id!==epoch)throw Error('STALE_SESSION');const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!data||typeof data!=='object')throw Error('INVALID_RESPONSE');if(!r.ok)throw Error(r.status===409&&data.error==='REVISION_CONFLICT'?'CONFLICT':data.error==='SIGNED_REVOCATION_REQUIRED'?'SIGNED_REVOCATION_REQUIRED':data.error==='TORCH_REVOCATION'||data.error==='TORCH_SIGNATURE'?'REVOCATION_REJECTED':'REQUEST_FAILED');return data;
 }
 function error(e){const m={REVOCATION_REJECTED:'撤回文档或签名未通过服务器验证，请核对离线签名和受信公钥，未确认撤回',ADMIN_NOT_READY:'管理接口或数据库尚未就绪，公共 dashboard 仍可查看；没有把失败当作空队列',ADMIN_NOT_CONNECTED:'管理接口尚未接入，公共统计仍可查看',UNAUTHORIZED:'授权未通过，凭证已清除；需要重新授权',CONFLICT:'记录已改变，请刷新后重新确认',SIGNED_REVOCATION_REQUIRED:'此版本已签名，必须走独立签名撤回流程，未执行删除',STALE_SESSION:'已断开或换会话，忽略旧响应',NOT_CONNECTED:'先连接管理员会话'};notice(m[e.message]||'本次请求未确认完成，请先刷新核实，不自动重试操作');}
 function disconnect(){token='';kind=filter='';$('filter').value=$('search').value='';policy=null;policyWriting=false;++policyRead;$('workspace').hidden=true;$('advanced').open=false;epoch++;busy=false;uncertain=false;items=[];selected=null;cursor=null;uploaderCursor=null;uploaderRows=[];$('token').value='';$('counts').replaceChildren();$('items').replaceChildren();$('detail').replaceChildren();$('uploaders').replaceChildren();$('uploader-more').hidden=true;$('auth').hidden=false;$('connected').hidden=true;notice('已断开，凭证只存在过本页内存');buttons();}
 const kindNames={repository:'仓库版本',report:'配置上报',pick:'自动候选',signed:'已签名版本',proposal:'发布提案',release:'签发记录','probe-skeleton':'探测记录','probe-backlog':'探测待办'};
 const recordName=item=>item.title||((kindNames[item.kind]||'审核记录')+' · '+item.id.slice(0,10));
 function summary(d){
  lastOverview=d;const box=$('counts');box.replaceChildren();
  const openKind=value=>{kind=value;filter='';$('filter').value='';$('search').value='';return load();};
  const links=[['','审核目录共',d.counts.total],...Object.entries(d.byKind||{}).map(([k,n])=>[k,kindNames[k]||k,n])];
  for(const [k,label,n] of links){const b=el('button',label+' '+unknown(n));b.type='button';b.dataset.connected='';b.setAttribute('aria-pressed',String(k===kind&&!filter));b.addEventListener('click',()=>openKind(k));box.append(b);}
  for(const [k,label] of Object.entries(labels).filter(([key])=>key!=='deleted')){
   const b=el('button',label+' '+unknown(d.counts?.[k]));b.type='button';b.dataset.connected='';
   b.addEventListener('click',()=>{kind='';filter=k;$('filter').value=k;return load();});box.append(b);
  }
  const stats=[['收到上传',d.uploadCount],['上传标识',d.uniqueUploaders],['不同产物',d.newIngestDistinctArtifacts],['采用会话',d.usage?.count]];
  const observed=stats.filter(([,value])=>Number.isFinite(value)).map(([label,value])=>label+' '+value);
  if(observed.length)box.append(el('p',observed.join(' · ')+(d.coverageSince?' · 统计始于 '+d.coverageSince:''),'sa-muted'));
  box.append(el('p','作品名取自目录或已记录的标题。新上传事件可补充次数和标识，标识去重不等于真实人数。Cardinal 有对应版本的评分或评审时才显示。','sa-muted'));
  if(d.repository)box.append(el('p','仓库快照 '+d.repository.games+' 部 / '+d.repository.versions+' 版本 · '+String(d.repository.sourceCommit||'').slice(0,12),'sa-muted'));
 }
 function showList(){const box=$('items');box.replaceChildren();const q=$('search').value.toLowerCase().trim();for(const item of items.filter(i=>[recordName(i),i.id,kindNames[i.kind],i.engine,i.seedRev,i.author?.name,i.probe?.step,i.probe?.probeIdentity].join(' ').toLowerCase().includes(q))){
  const row=el('button',undefined,'sa-row');row.type='button';row.setAttribute('aria-pressed',selected?.id===item.id?'true':'false');row.append(el('strong',recordName(item)));
  const source=[item.title?kindNames[item.kind]:null,item.engine,item.seedRev].filter(Boolean);
  if(source.length)row.append(el('span',source.join(' · ')));
  const state=[labels[item.state],item.publicationStatus==='revoked'?'已撤回下发':item.published===true?'已签名下发':null].filter(Boolean);
  if(state.length)row.append(el('span',state.join(' / ')));
  const counts=[['上传',item.uploadCount],['标识',item.uniqueUploaders]].filter(([,v])=>Number.isFinite(v)).map(([label,v])=>label+' '+v);
  if(counts.length)row.append(el('span',counts.join(' / ')));
  const grade=score(item.cardinal?.total);if(grade!=='未知')row.append(el('span','Cardinal '+grade));
  row.append(el('span','查看详情'));row.addEventListener('click',()=>detail(item));box.append(row);
 }if(!box.children.length){box.append(el('p','当前筛选无记录 · '+(kindNames[kind]||'全部来源')+' · '+(labels[filter]||'全部状态')+(q?' · 搜索 '+q:'')));const b=el('button','查看全部');b.type='button';b.addEventListener('click',()=>{kind=filter='';$('filter').value=$('search').value='';return load();});box.append(b);};$('more').hidden=!cursor;}
 async function load(more=false){if(busy||!token)return;busy=true;buttons();notice('正在读取管理记录…');const id=epoch;try{
  const query=new URLSearchParams();if(filter==='probe')query.set('source','probe');else if(filter)query.set('state',filter);if(more&&cursor)query.set('cursor',cursor);if(kind)query.set('kind',kind);query.set('limit',kind?'20':'30');
  const [overview,list]=await Promise.all([api('overview'),api('items?'+query)]);if(id!==epoch)return;
  if(!Array.isArray(list.items)||list.items.length>100||list.items.some(i=>!i||!/^[a-f0-9]{64}$/.test(i.id)||!Number.isSafeInteger(i.revision)||i.revision<1))throw Error('INVALID_RESPONSE');items=more?items.concat(list.items):list.items;cursor=typeof list.nextCursor==='string'?list.nextCursor:null;uncertain=false;selected=null;$('detail').replaceChildren(el('p','请选择一份记录查看最新详情','sa-muted'));$('workspace').hidden=false;summary(overview);showList();notice('已读取 '+items.length+' 份记录，统计和使用量只按接口已观测数据展示');
 }catch(e){if(id===epoch)error(e);}finally{if(id===epoch){busy=false;buttons();}}}
 function field(box,label,value){if(value==null||value===''||value==='未知'||value==='暂无数据')return;const p=el('p');p.append(el('span',T(label)+T('：'),'sa-muted'),el('span',value===null||value===undefined?'未知':value));box.append(p);}
 function malwarePanel(box,item){
  const panel=el('section',undefined,'sa-malware');panel.append(el('h3','病毒检查（人工）'),el('p','只记录维护者实际完成的病毒扫描，不运行扫描器，不代替 Cardinal 自动质量判断','sa-muted'));
  const state=el('p','尚未读取此产物的病毒检查记录'),identity=el('p',undefined,'sa-muted'),load=el('button','读取病毒检查记录');load.type='button';load.dataset.connected='';load.dataset.admin='malware-load';panel.append(state,identity,load);
  const input=(name,label,max,type='text')=>{const wrap=el('label',label),i=el('input');i.type=type;i.maxLength=max;i.dataset.admin='malware-'+name;i.setAttribute('aria-label',T(label));wrap.append(i);panel.append(wrap);return i;};
  const name=input('scanner','扫描软件',80),version=input('version','软件版本',120),definitions=input('definitions','病毒库版本',120),time=input('time','扫描完成时间（本地时间）',40,'datetime-local'),evidence=input('evidence','扫描结果或证据摘要（单行，最多 300 字）',300);
  panel.append(el('p','只写扫描结论和证据编号，不写本机路径、邮箱、账号或存档内容；重新待查不表示扫描通过','sa-muted'));let current=null;const controls=[];
  const active=id=>id===epoch&&selected?.id===item.id&&panel.isConnected!==false;
  const valid=d=>d?.itemId===item.id&&d.identity?.itemId===item.id&&/^[a-f0-9]{64}$/.test(d.identity.hash||'')&&d.identity.key===item.key&&['pending','clean','infected'].includes(d.review?.state)&&Number.isSafeInteger(d.review.revision)&&d.review.revision>=0;
  const show=d=>{if(!valid(d))throw Error('MALWARE_SHAPE');current=d;put(state,'检查状态：'+({pending:'待检查',clean:'病毒检查通过',infected:'发现风险'}[d.review.state])+' · 检查修订 '+d.review.revision);put(identity,'绑定摘要 '+d.identity.hash+(d.identity.bindsSignedProfile===true?' · 精确已签名产物':' · 未绑定完整签名产物，本记录不能许可后来未知签名稿发布'));name.value=d.review.scanner?.name||'';version.value=d.review.scanner?.version||'';definitions.value=d.review.scanner?.definitionsVersion||'';evidence.value=d.review.evidenceSummary||'';time.value=d.review.scannedAt?new Date(Date.parse(d.review.scannedAt)-new Date(d.review.scannedAt).getTimezoneOffset()*60000).toISOString().slice(0,16):'';for(const b of controls)b.dataset.locked='false';};
  load.addEventListener('click',async()=>{if(busy)return;const id=epoch;busy=true;buttons();try{const d=await api('malware?id='+encodeURIComponent(item.id));if(!active(id))return;show(d);notice('已读取检查记录，尚未提交新结论');}catch(e){if(active(id)){current=null;for(const b of controls)b.dataset.locked='true';error(e);}}finally{if(active(id)){busy=false;buttons();}}});
  async function submit(verdict){if(busy||uncertain||!current||selected?.id!==item.id)return;const summary=evidence.value.trim();if(!summary||summary.length>300||/[\x00-\x1f\x7f]|[A-Za-z]:[\\/]|\\\\|\/(?:Users|home)\/|[^\s@]+@[^\s@]+/.test(summary))return notice('请填写不含路径、邮箱或换行的简短证据摘要，最多 300 字');let scanner=null,scannedAt=null;if(verdict!=='pending'){const values=[name.value.trim(),version.value.trim(),definitions.value.trim()];if(values.some((s,i)=>!s||s.length>[80,120,120][i]||/[\x00-\x1f\x7f]/.test(s))||!time.value||!Number.isFinite(new Date(time.value).getTime()))return notice('请填写扫描软件、版本、病毒库版本与实际扫描时间');scanner={name:values[0],version:values[1],definitionsVersion:values[2]};scannedAt=new Date(time.value).toISOString();}
   const labels={clean:'病毒检查通过',infected:'发现风险',pending:'重新待查'};if(!ask(labels[verdict]+'\n作品：'+(item.title||'未知')+'\n版本：'+(item.seedRev||'未知')+'\n绑定摘要：'+current.identity.hash+'\n证据：'+summary+'\n这不是适配质量验收，确认记录？'))return;
   const id=epoch,before=current;busy=true;buttons();try{const latest=await api('malware?id='+encodeURIComponent(item.id));if(!active(id))return;if(!valid(latest)||latest.identity.hash!==before.identity.hash||latest.review.revision!==before.review.revision){show(latest);notice('检查记录或绑定身份已变化，已回读最新状态，请核对后手动提交');return;}
    const body={id:item.id,expectedRevision:before.review.revision,verdict,scanner,scannedAt,evidenceSummary:summary},answer=await api('malware',body);if(!active(id))return;if(answer.ok!==true||answer.itemId!==item.id||answer.identity?.hash!==before.identity.hash||answer.review?.revision!==before.review.revision+1||answer.review.state!==verdict||typeof answer.auditId!=='string')throw Error('MALWARE_ACK');const fresh=await api('malware?id='+encodeURIComponent(item.id));if(!active(id))return;
    if(!valid(fresh)||fresh.identity.hash!==before.identity.hash||fresh.review.revision!==answer.review.revision||fresh.review.state!==verdict||fresh.review.evidenceSummary!==summary||fresh.review.scannedAt!==scannedAt||(scanner===null?fresh.review.scanner!==null:!fresh.review.scanner||['name','version','definitionsVersion'].some(k=>fresh.review.scanner[k]!==scanner[k]))||!Array.isArray(fresh.audit)||!fresh.audit.some(a=>a.auditId===answer.auditId&&a.itemId===item.id&&a.beforeRevision===before.review.revision&&a.afterRevision===answer.review.revision&&a.newState===verdict))throw Error('MALWARE_READBACK');show(fresh);notice('病毒检查记录已确认并回读，审计 '+answer.auditId+'；自动质量与发布仍由独立流程判断');
   }catch(e){if(active(id)){if(e.message==='CONFLICT'){try{const d=await api('malware?id='+encodeURIComponent(item.id));if(!active(id))return;show(d);notice('病毒检查修订冲突，已回读当前记录，请核对后手动提交；没有自动重试');return;}catch{}}uncertain=true;error(e);notice($('notice').textContent+'；检查写入尚未确认，先刷新核实');}}finally{if(active(id)){busy=false;buttons();}}
  }
  const actions=el('div',undefined,'sa-actions');for(const [verdict,label] of Object.entries({clean:'病毒检查通过',infected:'发现风险',pending:'重新待查'})){const b=el('button',label);b.type='button';b.dataset.connected='';b.dataset.write='';b.dataset.locked='true';b.dataset.admin='malware-'+verdict;b.addEventListener('click',()=>submit(verdict));controls.push(b);actions.append(b);}panel.append(actions);box.append(panel);
 }
 function artifactButtons(box,rows){
  if(!Array.isArray(rows)||rows.length>50||rows.some(a=>!a||!/^[a-f0-9]{64}$/.test(a.itemId)))throw Error('UPLOADER_SHAPE');
  for(const a of rows){const b=el('button',(a.title||('作品名未知 / '+(a.engine||'引擎未知')))+' · '+(a.seedRev||'版本未知')+' · 收到上传次数 '+unknown(a.uploadCount));b.type='button';b.dataset.connected='';b.addEventListener('click',()=>detail({id:a.itemId}));box.append(b);}
 }
 function renderUploaders(){
  const box=$('uploaders');box.replaceChildren();for(const row of uploaderRows){
   const block=el('details');block.append(el('summary',(row.alias||'匿名上传标识')+' · 收到上传次数 '+unknown(row.uploadCount)+' · 不同 Seed 产物数 '+unknown(row.distinctArtifacts)));
   field(block,'当前公开署名',row.publicNames?.length?row.publicNames.join(' / '):'未提供公开署名');if(row.publicNamesTruncated)block.append(el('p','公开署名列表仅显示部分','sa-muted'));
   const links=el('div',undefined,'sa-actions');artifactButtons(links,row.artifacts||[]);block.append(links);let next=row.artifactsCursor||null;
   if(row.artifactsTruncated&&!next)block.append(el('p','作品明细仅返回部分，后续游标未提供，不能认作完整清单','sa-muted'));
   if(next){const more=el('button','继续读取此标识的作品');more.type='button';more.dataset.connected='';more.addEventListener('click',async()=>{if(busy||!next)return;const id=epoch;busy=true;buttons();try{const d=await api('uploaders?artifactsCursor='+encodeURIComponent(next)+'&limit=20');if(id!==epoch)return;if(d.id!==row.id||d.scope!=='accepted-new-ingest-identifiers-not-people')throw Error('UPLOADER_SHAPE');if((row.artifacts?.length||0)+(d.artifacts?.length||0)>1000)throw Error('UPLOADER_LIMIT');artifactButtons(links,d.artifacts);row.artifacts=(row.artifacts||[]).concat(d.artifacts);next=typeof d.nextCursor==='string'?d.nextCursor:null;row.artifactsCursor=next;row.artifactsTruncated=!!next;more.hidden=!next;notice('已读取后续作品页，仍仅覆盖新接收统计期');}catch(e){if(id===epoch)error(e);}finally{if(id===epoch){busy=false;buttons();}}});block.append(more);}
   box.append(block);
  }if(!uploaderRows.length)box.append(el('p','新接收统计期暂无上传标识记录，历史上传情况未知','sa-muted'));$('uploader-more').hidden=!uploaderCursor;
 }
 async function loadUploaders(more=false){if(busy||!token)return;const id=epoch;busy=true;buttons();try{const d=await api('uploaders?limit=20'+(more&&uploaderCursor?'&cursor='+encodeURIComponent(uploaderCursor):''));if(id!==epoch)return;if(d.scope!=='accepted-new-ingest-identifiers-not-people'||!Array.isArray(d.uploaders)||d.uploaders.length>50||d.uploaders.some(r=>!r||!/^[a-f0-9]{64}$/.test(r.id)||!Array.isArray(r.publicNames)||r.publicNames.length>50||r.publicNames.some(n=>typeof n!=='string'||n.length>200)))throw Error('UPLOADER_SHAPE');if((more?uploaderRows.length:0)+d.uploaders.length>1000)throw Error('UPLOADER_LIMIT');uploaderRows=more?uploaderRows.concat(d.uploaders):d.uploaders;uploaderCursor=typeof d.nextCursor==='string'?d.nextCursor:null;renderUploaders();put($('upload-coverage'),'覆盖始于 '+(d.coverageSince||'未知')+' · 上传标识不是人数，旧历史不回填');notice('已读取上传者明细；点作品可复用当前详情，不自动执行核查');}catch(e){if(id===epoch)error(e);}finally{if(id===epoch){busy=false;buttons();}}}
 function revocation(text,item){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>8192)throw Error('REVOCATION_LIMIT');
  const d=JSON.parse(text),exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
  if(!exact(d,['schema','version','profileHash','reason','signature'])||d.schema!=='megulit.torch-revocation'||d.version!==1||d.profileHash!==item.revokeProfileHash||!/^[a-f0-9]{64}$/.test(d.profileHash)||!['compatibility-failed','review-withdrawn','signature-revoked'].includes(d.reason)||!exact(d.signature,['alg','keyId','value'])||d.signature.alg!=='ed25519'||typeof d.signature.keyId!=='string'||!/^[A-Za-z0-9._+-]{1,80}$/.test(d.signature.keyId)||typeof d.signature.value!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(d.signature.value))throw Error('REVOCATION_SHAPE');
  return d;
 }
 function revokePanel(box,item){
  const panel=el('details');panel.append(el('summary','停止下发：导入离线签名撤回文档'));panel.append(el('p','网页不持有私钥、不生成签名，导入后仍由服务器验签；撤回保留历史，不删除已安装 builtin','sa-muted'));
  const reasons=el('select');reasons.setAttribute('aria-label',T('撤回模板原因'));for(const value of ['compatibility-failed','review-withdrawn','signature-revoked']){const o=el('option',value);o.value=value;reasons.append(o);}reasons.value='compatibility-failed';
  const template=el('textarea');template.readOnly=true;template.rows=5;template.dataset.admin='revoke-template';template.setAttribute('aria-label',T('未签名撤回模板'));
  const update=()=>{template.value=JSON.stringify({schema:'megulit.torch-revocation',version:1,profileHash:item.revokeProfileHash,reason:reasons.value},null,2);};reasons.addEventListener('change',update);update();panel.append(reasons,template,el('p','维护者在离线环境执行 node tools/torch-release.cjs sign-revocation <unsigned-template.json>，使用仓库外既有 MEGULIT_PROFILE_KEY 与 KEY_ID；将输出以 UTF-8 保存或粘贴到下方，服务器仍须配置匹配的受信公钥，CLI 成功不等于线上已信任。不要用 PowerShell 5 默认重定向写成 UTF-16','sa-muted'));
  const download=el('button','下载未签名模板');download.type='button';download.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([template.value],{type:'application/json'})),a=el('a');a.href=url;a.download='torch-revocation-unsigned.json';a.click();URL.revokeObjectURL(url);});panel.append(download);
  const signed=el('textarea');signed.rows=5;signed.maxLength=8192;signed.dataset.admin='revoke-json';signed.setAttribute('aria-label',T('已签名撤回 JSON'));signed.placeholder=T('粘贴已由可信维护者离线签名的 JSON（最多 8 KiB）');
  const file=el('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label',T('选择已签名撤回 JSON 文件'));file.addEventListener('change',async()=>{const id=epoch;try{const f=file.files?.[0];if(!f||f.size>8192)throw Error();const text=await f.text();if(id!==epoch||selected?.id!==item.id)return;revocation(text,item);signed.value=text;notice('已载入文档，尚未发送或验签');}catch{notice('撤回文件无效、目标不符或超过 8 KiB，未发送');}finally{file.value='';}});
  const submit=el('button','确认导入并停止下发');submit.type='button';submit.dataset.connected='';submit.dataset.write='';submit.addEventListener('click',async()=>{
   if(busy||uncertain||selected?.id!==item.id||selected.revision!==item.revision||selected.capabilities?.revoke!==true||selected.publicationStatus==='revoked'||item.capabilities?.revoke!==true)return;let doc;try{doc=revocation(signed.value,item);if(!/^[a-f0-9]{64}$/.test(item.revokeKey))throw Error();}catch{return notice('撤回 JSON 不符合严格格式或目标摘要不符，未发送');}
   if(!ask('停止下发已签名版本\n作品：'+(item.title||'未知')+'\n版本：'+(item.seedRev||'未知')+'\n目标：'+doc.profileHash+'\n原因：'+doc.reason+'\n服务器验签后撤回，保留历史，是否继续？'))return;
   const id=epoch;busy=true;buttons();try{const answer=await api('@torch/revoke',doc);if(id!==epoch)return;if(answer.status!=='revoked')throw Error();const history=await api('@torch/history?exe='+encodeURIComponent(item.revokeKey));if(id!==epoch)return;if(history.key!==item.revokeKey||!Array.isArray(history.revoked)||!history.revoked.includes(doc.profileHash))throw Error();const fresh=await api('item?id='+encodeURIComponent(item.id));if(id!==epoch)return;if(fresh.item?.id!==item.id||fresh.item.publicationStatus!=='revoked')throw Error();selected=fresh.item;items=items.map(v=>v.id===item.id?selected:v);showList();renderDetail(selected,fresh.audit);notice('已验签撤回，并从签名历史回读确认停止下发；已有安装不会被删除');}catch(e){if(id===epoch){uncertain=true;error(e);notice($('notice').textContent+'；撤回尚未确认，先刷新核实，不自动重发');}}finally{if(id===epoch){busy=false;buttons();}}});panel.append(file,signed,submit);box.append(panel);
 }
 async function mutate(action,body,label){if(action==='status'&&body.state==='passed'){notice('适配质量由自动流程判断，不能在此人工通过');return;}if(busy||uncertain||!selected||selected.capabilities?.[action]!==true)return;const reason=$('reason').value.trim();if(!reason||reason.length>200||/[\x00-\x1f\x7f]/.test(reason)){notice('请填写 1 至 200 字且不含换行或控制字符的操作原因，便于留痕');$('reason').focus();return;}
  if(!ask(label+'\n作品：'+(selected.title||'未知')+'\n版本：'+(selected.seedRev||'未知')+'\n原因：'+reason+'\n此操作会写入服务端并留痕，是否继续？'))return;
  const id=epoch,item=selected;let submitted=false;busy=true;buttons();try{const answer=await api(action,{id:item.id,expectedRevision:item.revision,reason,...body});if(id!==epoch)return;if(answer.ok!==true||typeof answer.auditId!=='string')throw Error('UNCONFIRMED_WRITE');submitted=true;const fresh=await api('item?id='+encodeURIComponent(item.id));if(id!==epoch)return;if(!answer.item||answer.item.id!==item.id||answer.item.revision!==item.revision+1||!fresh.item||fresh.item.id!==item.id||!Number.isSafeInteger(fresh.item.revision)||fresh.item.revision<answer.item.revision||!Array.isArray(fresh.audit)||!fresh.audit.some(a=>a.auditId===answer.auditId&&a.action===action&&a.beforeRevision===item.revision&&a.afterRevision===answer.item.revision&&a.newState===answer.item.state))throw Error('READBACK_FAILED');selected=fresh.item;items=items.map(i=>i.id===selected.id?selected:i);showList();renderDetail(selected,fresh.audit);notice('操作已确认并回读，审计记录 '+answer.auditId+(fresh.item.revision>answer.item.revision?'；当前记录随后又被更新，请核对':'；刷新可核对汇总与队列'));}catch(e){if(id===epoch){uncertain=true;if(e.message==='CONFLICT'){try{const fresh=await api('item?id='+encodeURIComponent(item.id));if(id!==epoch)return;if(!fresh.item||fresh.item.id!==item.id||!Number.isSafeInteger(fresh.item.revision))throw Error();selected=fresh.item;renderDetail(selected,fresh.audit);uncertain=false;notice('版本冲突，已回读当前记录，请核对后手动重新操作；没有自动重试');return;}catch{}}error(e);notice((submitted?'提交已确认，但回读未完成；':$('notice').textContent+'；')+'写操作已暂停，先刷新核实');}}finally{if(id===epoch){busy=false;buttons();}}}
 async function detail(item){if(busy)return;const id=epoch;busy=true;buttons();try{const d=await api('item?id='+encodeURIComponent(item.id));if(id!==epoch)return;if(!d.item||d.item.id!==item.id||!Number.isSafeInteger(d.item.revision)||d.item.revision<1)throw Error('INVALID_RESPONSE');selected=d.item;showList();renderDetail(selected,d.audit);$('detail').tabIndex=-1;$('detail').focus({preventScroll:true});$('detail').scrollIntoView?.({block:'nearest'});}catch(e){if(id===epoch)error(e);}finally{if(id===epoch){busy=false;buttons();}}}
 function renderDetail(d,audit){lastAudit=audit;const box=$('detail');box.replaceChildren();box.append(el('h3',recordName(d)));field(box,'状态',labels[d.state]||'未知');field(box,'作者',d.author?.name??(d.author?.torchNo!=null?'传火编号 '+d.author.torchNo:null));field(box,'上传时间',d.uploadedAt);field(box,'版本',d.seedRev);field(box,'产物类型',d.kind);field(box,'信任来源',d.trust);field(box,'产物摘要',d.profileHash||d.settingsHash);field(box,'客户端回报采用会话',d.usageCount==null?'暂无数据':d.usageCount);field(box,'队列优先级',d.priority);field(box,'最近处理原因',d.reason);field(box,'Cardinal 可靠性',d.cardinal?.reliable===true?'有可靠记录':d.cardinal?.reliable===false?'不可靠':'未知');field(box,'Cardinal 依据',d.cardinal?.basis);field(box,'复测范围',d.queueScope==='exe-current-seed-retest'?'按 EXE 复测当前可用种子，尚不能指定某个种子版本执行':null);
  const quality=el('section',undefined,'sa-quality');quality.append(el('h3','自动质量与下发（只读）'),el('p','适配质量、Cardinal 与择优下发由自动流程判断，人工状态不作为质量许可','sa-muted'));field(quality,'Cardinal 得分',score(d.cardinal?.total));field(quality,'可靠观测',d.cardinal?.reliable===true?'服务端有可靠记录':d.cardinal?.reliable===false?'尚无可靠记录':'未知');field(quality,'可信质量收据',d.trust==='trusted-release'?'服务端已验证 release 评审签名':'尚未提供可信自动评审结论');field(quality,'自动比较结果','当前接口未提供独立比较证据');field(quality,'当前下发',d.publicationStatus==='revoked'?'已停止下发':d.publicationStatus==='published'?'服务端标记已发布':'未发布或状态未知');box.append(quality);
  const scores=el('div',undefined,'sa-score');for(const [k,label] of Object.entries({row:'正文',stable:'稳定',clean:'杂字',clear:'翻页清除',choice:'选项',pair:'配对',leak:'残留'})){const grade=score(d.cardinal?.scores?.[k]);if(grade!=='未知')scores.append(el('span',label+' '+grade));}if(scores.children.length)box.append(scores);
  if(d.probe){field(box,'????',d.probe.step);field(box,'??',d.engine||null);field(box,'????',d.probe.engineEvidence);field(box,'???????',d.probe.probeAppVersion);field(box,'????',d.probe.probeIdentity);field(box,'EXE ????',d.probe.exeHeadFingerprint);field(box,'????',d.probe.missing?.join('?'));}
  else malwarePanel(box,d);
  const reason=el('textarea');reason.dataset.admin='reason';reason.rows=1;reason.maxLength=200;reason.placeholder=T('单行操作原因，最多 200 字，不写凭证或个人信息');box.append(reason);
  const actions=el('div',undefined,'sa-actions');const caps=d.capabilities||{};
  const add=(text,cb)=>{const b=el('button',text);b.type='button';b.dataset.connected='';b.dataset.write='';b.addEventListener('click',cb);actions.append(b);};
  if(caps.queue===true&&d.queueLane==='version-retest'&&['pending','reviewing'].includes(d.state)&&d.published!==true){add('插到队首',()=>mutate('queue',{action:'prioritize'},'将此项插到队首'));const before=el('select');before.setAttribute('aria-label',T('移动到此记录之前'));for(const row of items.filter(i=>i.id!==d.id&&i.state!=='deleted'&&i.published!==true&&i.capabilities?.queue===true&&i.queueLane===d.queueLane&&['pending','reviewing'].includes(i.state))){const o=el('option',row.title||row.id.slice(0,12));o.value=row.id;before.append(o);}actions.append(before);add('移到所选项之前',()=>{if(!before.value)return notice('当前没有其它已读取队列项，请刷新或读取下一页');mutate('queue',{action:'move',beforeId:before.value},'调整队列排序');});}
  if(caps.status===true){const select=el('select');for(const [k,v] of Object.entries(labels).filter(([key])=>key!=='deleted'&&key!=='passed')){const o=el('option',v);o.value=k;select.append(o);}select.value=d.state;select.setAttribute('aria-label',T('新的核查状态'));actions.append(select);add('更新核查状态',()=>mutate('status',{state:select.value},'更新核查状态'));}
  if(caps.restore===true&&d.state==='deleted')add('恢复到待核查',()=>mutate('restore',{},'恢复此项到待核查，不改签名或下发版本'));
  if(caps.delete===true&&d.published!==true&&d.state!=='deleted')add(d.kind==='repository'?'停用此仓库条目':'删除此项',()=>mutate('delete',{},d.kind==='repository'?'停用远端条目，保留 GitHub 与已安装 builtin，不抹除历史':'确认删除此项（操作留痕，版本历史不应被抹除）'));
  if(d.published===true)box.append(el('p','已下发版本不能普通删除；仅已验证且允许撤回的版本可导入离线签名文档','sa-muted'));
  if(d.capabilities?.revoke===true&&d.trust==='trusted-release'&&d.published===true&&d.publicationStatus!=='revoked'&&/^[a-f0-9]{64}$/.test(d.revokeProfileHash||'')&&/^[a-f0-9]{64}$/.test(d.revokeKey||''))revokePanel(box,d);
  else if(d.publicationStatus==='revoked')box.append(el('p','服务端标记已撤回，发布历史保留；不代表删除已安装副本','sa-muted'));
  if(!actions.children.length)actions.append(el('p','此项暂未提供可执行管理能力','sa-muted'));box.append(actions);
  const history=el('details');history.append(el('summary','管理操作留痕'));if(Array.isArray(audit)&&audit.length){for(const h of audit.slice(0,100)){const p=el('p');put(p,[h.action||'操作未知',h.at||'时间未知',h.reason||''].join(' · '));history.append(p);}}else history.append(el('p','未返回操作留痕，不代表没有历史'));box.append(history,el('p','发布与撤回历史仍需签名协议接口核验，未接入项保持未知；本页面不生成签名','sa-muted'));buttons();}
 $('auth').addEventListener('submit',async e=>{e.preventDefault();const value=$('token').value.trim();if(!value||value.length>4096)return notice('请输入有效管理员凭证');epoch++;token=value;$('token').value='';$('auth').hidden=true;$('connected').hidden=false;$('workspace').hidden=true;drawPolicy(null);await Promise.all([readPolicy(),load()]);});
 $('disconnect').addEventListener('click',disconnect);$('refresh').addEventListener('click',()=>Promise.all([readPolicy(),load()]));$('policy-toggle').addEventListener('click',changePolicy);$('filter').addEventListener('change',()=>{kind='';filter=$('filter').value;load();});$('search').addEventListener('input',showList);$('more').addEventListener('click',()=>load(true));$('uploader-load').addEventListener('click',()=>loadUploaders());$('uploader-more').addEventListener('click',()=>loadUploaders(true));window.addEventListener('pagehide',disconnect);buttons();
 window.__adminRedraw=()=>{if(!token)return;try{drawPolicy(policy);if(lastOverview)summary(lastOverview);showList();if(selected)renderDetail(selected,lastAudit);else $('detail').replaceChildren(el('p','请选择一份记录查看最新详情','sa-muted'));if(uploaderRows.length)renderUploaders();}catch{}};
}
export const SEED_ADMIN_HTML=String.raw`<section class="pane c12 gold" id="seed-admin"><header class="ch"><span class="ct" data-i18n="a.title">The Seed 管理</span><span class="chint" data-i18n="a.hint">管理 · 需手动确认</span></header><style>
#seed-admin{font:14px/1.65 var(--sans);color:var(--fg)}
#seed-admin .sa-muted{color:var(--dim)}
#seed-admin h2{font-size:17px;font-weight:600;margin:0 0 8px;color:var(--gold);letter-spacing:.01em}
#seed-admin h3{font-size:15px;font-weight:600;margin:14px 0 6px;color:var(--hi)}
#seed-admin p{line-height:1.65;margin:8px 0}
#seed-admin button,#seed-admin input,#seed-admin select,#seed-admin textarea{font:inherit;font-size:13px;color:var(--fg);background:var(--field);border:1px solid var(--line2);border-radius:10px;padding:8px 12px;max-width:100%;transition:border-color .15s,background .15s,box-shadow .15s}
#seed-admin button{cursor:pointer;background:var(--btn)}
#seed-admin button:hover:not(:disabled){border-color:var(--gold-line);background:var(--btn-h)}
#seed-admin button:disabled{opacity:.45;cursor:default}
#seed-admin input::placeholder,#seed-admin textarea::placeholder{color:var(--dim);opacity:.85}
#seed-admin input:focus-visible,#seed-admin select:focus-visible,#seed-admin textarea:focus-visible,#seed-admin button:focus-visible,#seed-admin summary:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.sa-auth,.sa-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.sa-auth input{width:330px}
.sa-session{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.sa-notice{min-height:24px;color:var(--gold);font-size:13px}
.sa-policy{padding:16px 18px;border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:12px;background:var(--panel2);margin:16px 0 24px}
#seed-admin .sa-policy button{display:flex;align-items:center;gap:12px;border:0;padding:4px 0;background:transparent;font-size:17px;font-weight:600;color:var(--hi)}
#seed-admin .sa-policy button::after{content:"";width:42px;height:24px;border:1px solid currentColor;border-radius:18px;background:radial-gradient(circle at 11px center,currentColor 7px,transparent 8px);opacity:.8}
#seed-admin .sa-policy button[aria-checked="true"]::after{color:var(--gold);opacity:1;background:radial-gradient(circle at 30px center,currentColor 7px,transparent 8px)}
.sa-policy small:empty{display:none}.sa-policy p{color:var(--fg)}
.sa-advanced>summary,.sa-uploaders summary,.sa-detail summary{cursor:pointer;color:var(--gold);padding:8px 0}
.sa-counts{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.sa-counts p{flex-basis:100%}
.sa-toolbar{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0;align-items:end}.sa-toolbar label{display:grid;gap:4px;min-width:0;color:var(--dim);font-size:12px}.sa-toolbar input{width:100%}.sa-toolbar label:last-child{flex:1}
.sa-layout{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(270px,1fr);gap:18px}
.sa-row{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:8px;text-align:left;width:100%;margin-bottom:8px;overflow-wrap:anywhere;border-radius:12px!important}
.sa-row strong{color:var(--gold);font-weight:600}.sa-row span{font-size:12px;color:var(--dim)}
#seed-admin .sa-row[aria-pressed="true"]{border-color:var(--gold-line);box-shadow:inset 3px 0 var(--gold)}
.sa-detail{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:4px 16px 14px;min-width:0;overflow-wrap:anywhere}
.sa-detail textarea{width:100%}
.sa-quality,.sa-malware{border-top:1px solid var(--line);margin-top:14px;padding-top:10px}.sa-malware label{display:block;margin:9px 0;font-size:12px;color:var(--dim)}.sa-malware input{width:100%}
#seed-admin [data-admin="items"],#seed-admin [data-admin="uploaders"]{max-height:min(70vh,760px);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
#seed-admin .sa-detail{position:sticky;top:12px;align-self:start;max-height:calc(100vh - 30px);overflow-y:auto;scrollbar-gutter:stable}
.sa-score{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0;font-size:12px}.sa-score span{border:1px solid var(--gold-line);color:var(--gold);border-radius:999px;padding:1px 10px}
.sa-detail details{margin:14px 0}
.sa-uploaders{border-top:1px solid var(--line);margin-top:20px;padding-top:12px}
#seed-admin dt{color:var(--dim)}
#seed-admin [hidden]{display:none!important}
#seed-admin:has([data-admin="workspace"]:not([hidden])):not(:has(.sa-advanced[open]))>.sa-notice{display:none}
@media(max-width:800px){.sa-layout{grid-template-columns:1fr}#seed-admin .sa-detail{position:static;max-height:none;overflow:visible}.sa-row{grid-template-columns:1fr 1fr}.sa-row strong{grid-column:1/-1}}
@media(max-width:650px){.sa-auth label,.sa-auth input{width:100%}.sa-toolbar{display:grid;grid-template-columns:1fr}.sa-policy small{display:block;margin:8px 0 0}}
</style><div class="sa-session"><h2 data-i18n="a.h2">Seed 管理控制台</h2><form class="sa-auth" data-admin="auth" autocomplete="off"><label><span data-i18n="a.token">管理员凭证</span> <input data-admin="token" type="password" autocomplete="off" aria-label="管理员凭证" data-i18n-aria="a.token" placeholder="仅本页内存，不保存" data-i18n-ph="a.tokenph"></label><button data-admin="connect" data-i18n="a.connect">连接管理接口</button></form><div data-admin="connected" hidden><button data-admin="disconnect" type="button" data-i18n="a.disconnect">断开并清除凭证</button> <button data-admin="refresh" data-connected type="button" data-i18n="a.refresh">刷新管理记录</button></div></div><p class="sa-notice" data-admin="notice" role="status" aria-live="polite">未连接管理员会话，未发送管理请求</p><div data-admin="workspace" hidden><section class="sa-policy"><button type="button" role="switch" aria-checked="false" aria-describedby="ordinary-status" data-admin="policy-toggle" data-connected data-locked="true" disabled data-i18n="a.policy">自动处理 Seed</button><p id="ordinary-status" data-admin="policy-state" role="status">正在确认自动处理状态</p><small data-admin="policy-note" role="status"></small></section><details class="sa-advanced" data-admin="advanced"><summary data-i18n="a.adv">高级管理</summary><h3 data-i18n="a.catalog">历史审核目录</h3><p class="sa-muted" data-i18n="a.catalogd">这里汇总仓库版本、配置上报和候选等审核记录，实时待处理任务数见上方开关</p><div class="sa-counts" data-admin="counts"></div><div class="sa-toolbar"><label><span data-i18n="a.state">状态</span> <select data-admin="filter" data-connected><option value="" data-i18n="a.all">全部</option><option value="pending" data-i18n="s.pending">待核查</option><option value="reviewing" data-i18n="s.reviewing">核查中</option><option value="needs-change" data-i18n="s.needs">需修改</option><option value="passed" data-i18n="s.passed">旧人工标记（非质量结论）</option><option value="deleted" data-i18n="s.deleted">已删除</option></select></label><label><span data-i18n="a.search">搜索</span> <input data-admin="search" type="search" placeholder="作品、引擎、作者或版本" data-i18n-ph="a.searchph"></label></div><div class="sa-layout"><div><div data-admin="items"></div><button data-admin="more" data-connected type="button" hidden data-i18n="a.more">读取下一页</button></div><aside class="sa-detail" data-admin="detail" aria-label="作品管理详情" data-i18n-aria="a.detailaria"><p class="sa-muted" data-i18n="a.detail0">连接后选择一份记录查看证据与可用操作</p></aside></div><details class="sa-uploaders"><summary data-i18n="a.up">上传者与各作品明细</summary><p class="sa-muted" data-admin="upload-coverage" data-i18n="a.upcov">仅统计新接收事件，上传标识不等于真人；旧历史未知</p><button data-admin="uploader-load" data-connected type="button" data-i18n="a.upload">读取上传者明细</button><div data-admin="uploaders"></div><button data-admin="uploader-more" data-connected type="button" hidden data-i18n="a.upmore">读取更多上传标识</button></details></details></div></section>`;
// Wrangler preserves function names using __name. The browser runs in a separate realm.
export const SEED_ADMIN_SCRIPT='(()=>{const __name=(fn)=>fn;('+seedAdminClient.toString()+')('+cardinalTenPoint.toString()+');})();';
