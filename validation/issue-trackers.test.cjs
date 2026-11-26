// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 relay/src/issue-trackers.js: detail issues are closed and listed as one checkbox line in the open tracker
   issue of their kind. The relay runs in-process on node:sqlite (every migration) against an in-memory GitHub. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash,createHmac,randomUUID}=require('node:crypto');
const {fixture,database}=require('./helpers/torch-release.cjs');
const migrations=path.join(__dirname,'../relay/migrations');
const schema=fs.readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort().map(n=>fs.readFileSync(path.join(migrations,n),'utf8')).join('');
const repo='fixture/MeguLit',now=new Date('2026-11-26T03:00:00.000Z'),pepper='webhook-fixture';
const sha=value=>createHash('sha256').update(value).digest('hex');
const exact=(work,exe=sha(work))=>`${work} | kirikiri | ja | ${exe} | ${'b'.repeat(64)}`;

/* GitHub issues API in memory. delay: ms before each answer (lets concurrent workers interleave); afterPatch(number,
   issue) / afterGet(number, issue): run right after a PATCH is applied / a GET is answered, to play a second writer. */
function fakeGitHub({delay=0}={}){
 const issues=new Map(),comments=[],pins=[],calls=[];let next=1,hooks={};
 const answer=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
 const add=doc=>{const number=next++;const issue={number,node_id:'I_'+number,title:doc.title,body:doc.body,state:doc.state||'open',state_reason:null,
  labels:(doc.labels||[]).map(name=>({name})),user:{login:'relay-bot'},html_url:`https://github.com/${repo}/issues/${number}`};issues.set(number,issue);return issue;};
 const fetch=async(url,init={})=>{
  const method=init.method||'GET',body=init.body===undefined?undefined:JSON.parse(init.body);calls.push({method,url,body});
  if(delay)await new Promise(r=>setTimeout(r,Math.random()*delay));
  if(url==='https://api.github.com/graphql'){pins.push(body.variables.id);return answer({data:{}});}
  const u=new URL(url),route=u.pathname.replace(`/repos/${repo}`,'');
  if(route==='/issues'&&method==='POST')return answer(add(body),201);
  if(route==='/issues'&&method==='GET'){
   const labels=(u.searchParams.get('labels')||'').split(',').filter(Boolean),page=Number(u.searchParams.get('page')||1),per=Number(u.searchParams.get('per_page')||30);
   const list=[...issues.values()].filter(i=>u.searchParams.get('state')==='all'||i.state===u.searchParams.get('state'))
    .filter(i=>labels.every(l=>i.labels.some(x=>x.name===l))).sort((a,b)=>a.number-b.number);
   return answer(list.slice((page-1)*per,page*per));
  }
  const m=/^\/issues\/(\d+)(\/comments)?$/.exec(route),issue=m&&issues.get(Number(m[1]));
  if(!issue)return answer({message:'Not Found'},404);
  if(m[2]&&method==='POST'){comments.push({issue:issue.number,body:body.body});return answer({id:comments.length},201);}
  if(method==='GET'){const snapshot={...issue};await hooks.afterGet?.(issue.number,issue);return answer(snapshot);}
  if(method==='PATCH'){Object.assign(issue,body);await hooks.afterPatch?.(issue.number,issue);return answer({...issue});}
  return answer({message:'unexpected'},405);
 };
 return {issues,comments,pins,calls,fetch,add,on:h=>{hooks=h;},open:label=>[...issues.values()].filter(i=>i.state==='open'&&i.labels.some(l=>l.name===label))};
}

function relay(gh,extra={}){
 const db=database(schema),objects=new Map(),f=fixture();
 const env={...f.env,DB:db,HASH_SALT:'salt',LINK_SECRET:'link',GITHUB_REPO:repo,GITHUB_TOKEN:'fixture',GAME_REQUEST_ISSUE_AUTHOR:'relay-bot',
  ADAPTER_PROBE_WEBHOOK_SECRET:pepper,fetch:gh.fetch,BUCKET:{put:async(k,v)=>objects.set(k,typeof v==='string'?v:new Uint8Array(v)),
   get:async k=>objects.has(k)?{body:objects.get(k)}:null,delete:async k=>objects.delete(k),list:async({prefix})=>({objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))})},...extra};
 return {db,env,f};
}
const tracked=(db,issue)=>db.raw.prepare('SELECT * FROM issue_tracker_entries WHERE issue=?').get(issue);
const itemLines=body=>body.split('\n').filter(l=>/^- \[[ x]\] /.test(l));

test('the body rules: dated lines, people lines joined by name, sections, counts and ticks',async()=>{
 const {applyEntries,retitle,trackerMarker,trackerName}=await import('../relay/src/issue-trackers.js');
 const probe=`intro\n\n### 解析失败（1）\n- [ ] A · 2026-11-25 · 详情和下载 #10\n\n${trackerMarker('adapter-probe')}`;
 let body=applyEntries(probe,'adapter-probe',[
  {issue:11,name:'B',day:'2026-11-26',section:'解析失败',list:true},
  {issue:12,name:'C',day:'2026-11-26',section:'not-japanese',list:true},
  {issue:13,name:'A',day:'2026-11-26',section:'解析失败',candidates:[10],list:true}]);
 assert.equal(body,`intro\n\n### 解析失败（2）\n- [ ] A · 2026-11-25 · 详情和下载 #13 #10\n- [ ] B · 2026-11-26 · 详情和下载 #11\n\n### not-japanese（1）\n- [ ] C · 2026-11-26 · 详情和下载 #12\n\n${trackerMarker('adapter-probe')}`);
 assert.equal(applyEntries(body,'adapter-probe',[{issue:11,name:'B',day:'x',section:'解析失败',list:true}]),body,'listing twice changes nothing');
 assert.equal(retitle('[适配探针] 汇总（27 条，逐条勾选）',body,'adapter-probe'),'[适配探针] 汇总（3 条，逐条勾选）');
 const game=`intro\n\n- [x] 海猫鸣泣之时（3 人：#1087 #690 #675）\n- [ ] ATRI（1 人：#5）\n\n${trackerMarker('game-request')}`;
 body=applyEntries(game,'game-request',[{issue:20,name:'atri',list:true},{issue:21,name:'千恋＊万花',list:true},{issue:22,name:'海猫鸣泣之时',list:true},{issue:5,tick:true}]);
 assert.deepEqual(itemLines(body),['- [ ] 海猫鸣泣之时（4 人：#22 #1087 #690 #675）','- [x] ATRI（2 人：#20 #5）','- [ ] 千恋＊万花（1 人：#21）'],'a new request unticks its game; a resolved one ticks');
 assert.equal(retitle('[想玩] 汇总（92 部游戏 / 104 条请求）',body,'game-request'),'[想玩] 汇总（3 部游戏 / 7 条请求）');
 assert.equal(trackerName('x\n#12 <!-- @me'),'x ＃12 ＜!-- @‍me');
 const bare=applyEntries('',`diagnostics`,[{issue:3,name:'D · v1',day:'2026-11-26',list:true}]);
 assert.deepEqual(bare.split('\n'),['','- [ ] D · v1 · 2026-11-26 · 详情和下载 #3','',trackerMarker('diagnostics')]);
});

test('diagnostics: detail issue closed with a note, line appended to the open tracker; missing tracker is opened and pinned',async t=>{
 const gh=fakeGitHub(),{db,env}=relay(gh);t.after(()=>db.raw.close());
 const {handle,sha256}=await import('../relay/src/worker.js');
 const zip=new Uint8Array([0x50,0x4b,3,4,...new Array(40).fill(1)]);
 const upload=async title=>{const form=new FormData();form.set('meta',JSON.stringify({schema:1,version:'1.4.25',game:{id:'g',title,engine:'kirikiri'},os:'10',sha256:await sha256(zip)}));
  form.set('package',new Blob([zip],{type:'application/zip'}),'d.zip');
  const r=await handle(new Request('https://relay.test/api/diagnostics',{method:'POST',headers:{'cf-connecting-ip':'198.51.100.'+gh.issues.size},body:form}),env,now);
  assert.equal(r.status,201);return Number((await r.json()).issueUrl.split('/').pop());};
 const first=await upload('ATRI');
 const tracker=gh.open('diagnostics');assert.equal(tracker.length,1,'only the tracker stays open');
 const T=tracker[0];assert.match(T.body,/<!-- tracker:diagnostics -->$/);assert.equal(T.title,'[诊断] 汇总（1 条，逐条勾选）');
 assert.deepEqual(gh.pins,[T.node_id],'a new tracker is pinned');
 assert.deepEqual(itemLines(T.body),[`- [ ] ATRI · v1.4.25 · 2026-11-26 · 详情和下载 #${first}`]);
 const detail=gh.issues.get(first);assert.equal(detail.state,'closed');assert.equal(detail.state_reason,'not_planned');
 assert.match(detail.body,/Download \(expires in 30 days\)/,'the detail issue keeps its link');
 assert.deepEqual(gh.comments,[{issue:first,body:`已登记到汇总 #${T.number}，在汇总里逐条勾选处理。`}]);
 assert.ok(tracked(db,first).closed_at);
 const second=await upload('Sugar @someone #3');
 assert.equal(gh.open('diagnostics').length,1,'the same tracker is reused');
 assert.deepEqual(itemLines(gh.issues.get(T.number).body).slice(1),[`- [ ] Sugar @‍someone ＃3 · v1.4.25 · 2026-11-26 · 详情和下载 #${second}`]);
 assert.equal(gh.pins.length,1);
 /* the tracker closed by hand: the next package opens a new one */
 gh.issues.get(T.number).state='closed';
 const third=await upload('Third');
 const fresh=gh.open('diagnostics');assert.equal(fresh.length,1);assert.notEqual(fresh[0].number,T.number);
 assert.deepEqual(itemLines(fresh[0].body),[`- [ ] Third · v1.4.25 · 2026-11-26 · 详情和下载 #${third}`]);
});

test('game requests: same game joins its line (people +1), new game gets a line, title counts follow',async t=>{
 const gh=fakeGitHub(),{db,env}=relay(gh);t.after(()=>db.raw.close());
 const T=gh.add({title:'[想玩] 汇总（1 部游戏 / 1 条请求）',labels:['game-request'],body:'所有「想玩」请求汇总在这里。\n\n- [ ] ATRI（1 人：#900）\n\n<!-- tracker:game-request -->'});
 const {handle}=await import('../relay/src/worker.js');
 const submit=async(text,ip)=>{const r=await handle(new Request('https://relay.test/api/feedback',{method:'POST',headers:{'cf-connecting-ip':ip},body:JSON.stringify({kind:'game',text,lang:'zh',page:'/'})}),env,now);
  assert.equal(r.status,201);return Number((await r.json()).url.split('/').pop());};
 const a=await submit('atri','198.51.100.1'),b=await submit('ファタモルガーナの館','198.51.100.2'),c=await submit('ATRI ','198.51.100.3');
 assert.deepEqual(itemLines(gh.issues.get(T.number).body),[`- [ ] ATRI（3 人：#${c} #${a} #900）`,`- [ ] ファタモルガーナの館（1 人：#${b}）`]);
 assert.equal(gh.issues.get(T.number).title,'[想玩] 汇总（2 部游戏 / 4 条请求）');
 for(const n of [a,b,c])assert.equal(gh.issues.get(n).state,'closed');
 assert.deepEqual(gh.open('game-request').map(i=>i.number),[T.number]);
 /* website feedback (not a game request) keeps its own open issue */
 await handle(new Request('https://relay.test/api/feedback',{method:'POST',headers:{'cf-connecting-ip':'198.51.100.9'},body:JSON.stringify({kind:'feedback',text:'hi'})}),env,now);
 assert.equal(gh.open('website-feedback').length,1);
});

test('a resolved game request ticks its tracker line; the webhook on the closed detail issue is harmless',async t=>{
 const gh=fakeGitHub(),{db,env}=relay(gh);t.after(()=>db.raw.close());
 const {handle}=await import('../relay/src/worker.js');
 const request=(url,body,headers={})=>handle(new Request('https://relay.test'+url,{method:body===undefined?'GET':'POST',body:typeof body==='string'?body:body===undefined?undefined:JSON.stringify(body),headers}),env,now);
 const webhook=issue=>{const body=JSON.stringify({repository:{full_name:repo},action:'opened',issue});
  return request('/api/probe/issue-webhook',body,{'x-github-event':'issues','x-hub-signature-256':'sha256='+createHmac('sha256',pepper).update(body).digest('hex')});};
 const wanted=exact('v1');
 const r=await request('/api/feedback',{kind:'game',text:wanted,lang:'zh',page:'app/1.4.25'},{'cf-connecting-ip':'198.51.100.4'});
 const number=Number((await r.json()).url.split('/').pop()),detail=gh.issues.get(number);
 assert.equal(detail.state,'closed');assert.ok(tracked(db,number).listed_at);
 const hook=await webhook(detail);assert.equal(hook.status,200);assert.equal((await hook.json()).gameRequest,'open','closed detail issue: tracked, nothing to resolve yet');
 assert.equal((await webhook(detail)).status,200,'a repeated delivery is fine');
 const T=gh.open('game-request')[0];assert.match(T.body,/^- \[ \] .*（1 人：#\d+）$/m);
 const patchesBefore=gh.calls.filter(c=>c.method==='PATCH'&&c.url.endsWith('/issues/'+number)).length;
 const reg=await request('/api/seed-admin/game-request-evidence',{selector:wanted,kind:'generating',ref:randomUUID()},{authorization:'Bearer test-admin'});
 assert.equal(reg.status,201);
 assert.match(gh.issues.get(T.number).body,new RegExp(`^- \\[x\\] .*#${number}）$`,'m'),'the tracker line is ticked');
 assert.ok(tracked(db,number).ticked_at);
 assert.equal(gh.calls.filter(c=>c.method==='PATCH'&&c.url.endsWith('/issues/'+number)).length,patchesBefore,'the detail issue is not touched again');
 assert.ok(db.raw.prepare('SELECT closed_at FROM game_request_jobs WHERE issue=?').get(number).closed_at);
 /* the next request for the same game joins the ticked line, unticks it, and is ticked again once it resolves */
 const again=await request('/api/feedback',{kind:'game',text:wanted,lang:'zh',page:'/'},{'cf-connecting-ip':'198.51.100.5'});
 const second=Number((await again.json()).url.split('/').pop());
 assert.match(gh.issues.get(T.number).body,new RegExp(`^- \\[ \\] .*（2 人：#${second} #${number}）$`,'m'));
 assert.equal((await webhook(gh.issues.get(second))).status,200);
 assert.match(gh.issues.get(T.number).body,new RegExp(`^- \\[x\\] .*（2 人：#${second} #${number}）$`,'m'));
});

test('probes: closed detail issue (key, link, SHA-256) under its reason, a better probe of the same game joins its line, the webhook ignores it',async t=>{
 const gh=fakeGitHub(),{db,env}=relay(gh);t.after(()=>db.raw.close());
 const T=gh.add({title:'[适配探针] 汇总（1 条，逐条勾选）',labels:['adapter-probe'],body:'所有适配探针汇总在这里。\n\n### 解析失败（1）\n- [ ] Old · 2026-11-23 · 详情和下载 #800\n\n<!-- tracker:adapter-probe -->'});
 const {handle}=await import('../relay/src/worker.js');
 const identity=sha('probe identity'),other=sha('other identity');
 const upload=async(game,headers={})=>{const bundle=JSON.stringify({schema:'megulit.probe-bundle',version:1,app:'1.4.25',games:[game]});
  const r=await handle(new Request('https://relay.test/api/probe',{method:'POST',headers:{'cf-connecting-ip':'198.51.100.7','x-megulit-version':'1.4.25',...headers},
   body:JSON.stringify({version:1,upload:randomUUID(),part:0,parts:1,size:Buffer.byteLength(bundle),sha256:sha(bundle),data:Buffer.from(bundle).toString('base64'),identity:game.identity,state:game.state,items:game.items})}),env,now);
  assert.equal(r.status,201,await r.clone().text());return sha(bundle);};
 const digest=await upload({identity,title:'Nurse Love',key:identity,step:'parse-failed',state:'partial',items:1,inventory:{archives:[{magic:'5850330d0a'}]}});
 const tracker=()=>gh.issues.get(T.number).body;
 const detail=[...gh.issues.values()].find(i=>i.number!==T.number);
 assert.equal(detail.state,'closed');assert.equal(detail.title,'[适配探针] Nurse Love · parse-failed');
 assert.ok(detail.body.includes(`- SHA-256: \`${digest}\``)&&detail.body.includes(`- key: \`${identity}\``));
 assert.match(detail.body,/Download \(expires in 30 days\): https:\/\/relay\.test\/api\/probe\/download\/[0-9a-f-]{36}\?exp=\d+&sig=[0-9a-f]{64}/);
 assert.deepEqual(tracker().split('\n').slice(2,5),['### 解析失败（2）','- [ ] Old · 2026-11-23 · 详情和下载 #800',`- [ ] Nurse Love · 2026-11-26 · 详情和下载 #${detail.number}`]);
 assert.equal(gh.issues.get(T.number).title,'[适配探针] 汇总（2 条，逐条勾选）');
 assert.equal(db.raw.prepare("SELECT count(*) n FROM seed_admin_items WHERE kind='probe-skeleton'").get().n,1,'Seed drafts still queued by the intake');
 await upload({identity:other,title:'Katawa',key:other,step:'not-japanese',state:'complete',items:3});
 assert.match(tracker(),/\n### not-japanese（1）\n- \[ \] Katawa · 2026-11-26 · 详情和下载 #\d+\n\n<!-- tracker:adapter-probe -->$/,'a new reason gets its own section');
 db.raw.prepare(`UPDATE issue_tracker_entries SET created_at='2026-11-25T00:00:00.000Z'`).run();
 await upload({identity,title:'Nurse Love',key:identity,step:'parse-failed',state:'complete',items:4});
 const latest=Math.max(...gh.issues.keys());
 const firstBundle=/\/api\/probe\/download\/([0-9a-f-]{36})\?/.exec(detail.body)[1];
 const kept=db.raw.prepare('SELECT object_key FROM probe_bundles WHERE id=?').get(firstBundle);
 assert.ok(kept&&await env.BUCKET.get(kept.object_key),'the replaced probe keeps the download its detail issue advertises');
 assert.notEqual(db.raw.prepare('SELECT bundle_id FROM probe_games WHERE identity=?').get(identity).bundle_id,firstBundle,'the better probe is the current one');
 assert.match(tracker(),new RegExp(`^- \\[ \\] Nurse Love · 2026-11-26 · 详情和下载 #${latest} #${detail.number}$`,'m'),'same game: joins its line');
 assert.equal(itemLines(tracker()).length,3);
 /* GitHub delivers "opened" for the detail issue: it is not a legacy probe issue, so nothing is processed or closed twice */
 const body=JSON.stringify({repository:{full_name:repo},action:'opened',issue:gh.issues.get(latest)});
 const hook=await handle(new Request('https://relay.test/api/probe/issue-webhook',{method:'POST',body,headers:{'x-github-event':'issues','x-hub-signature-256':'sha256='+createHmac('sha256',pepper).update(body).digest('hex')}}),env,now);
 assert.equal((await hook.json()).ignored,true);
 assert.equal(db.raw.prepare('SELECT count(*) n FROM probe_issue_disposition').get().n,0);
 assert.deepEqual(gh.open('adapter-probe').map(i=>i.number),[T.number]);
});

test('concurrency: entries queued at the same moment all land, a busy lease leaves them to the holder or the cron, a stale overwrite is redone',async t=>{
 const gh=fakeGitHub({delay:8}),{db,env}=relay(gh);t.after(()=>db.raw.close());
 const {trackIssue,syncTrackers}=await import('../relay/src/issue-trackers.js');
 const details=Array.from({length:6},(_,i)=>gh.add({title:'[Yui] stage-'+i,labels:['yui-report','diagnostics'],body:'<!-- megulit-yui:stage-'+i+' -->'}).number);
 await Promise.all(details.map((issue,i)=>trackIssue(env,{id:'yui:stage-'+i,tracker:'yui-report',issue,name:'stage-'+i},now)));
 const open=gh.open('yui-report');assert.equal(open.length,1,'one tracker even when six workers start together');
 const lines=itemLines(open[0].body);assert.equal(lines.length,6);
 for(const n of details){assert.equal(lines.filter(l=>l.endsWith('#'+n)).length,1);assert.equal(gh.issues.get(n).state,'closed');}
 assert.equal(db.raw.prepare('SELECT count(*) n FROM issue_tracker_locks').get().n,0,'every lease released');

 /* a lease held elsewhere: the row waits (detail stays open), then the cron lists it */
 db.raw.prepare('INSERT INTO issue_tracker_locks(tracker,owner,until) VALUES(?,?,?)').run(repo+' yui-report','other-worker',Date.now()+60000);
 const late=gh.add({title:'[Yui] late',labels:['yui-report','diagnostics'],body:'x'}).number;
 assert.deepEqual(await trackIssue(env,{id:'yui:late',tracker:'yui-report',issue:late,name:'late'},now),{busy:true});
 assert.equal(gh.issues.get(late).state,'open');
 db.raw.prepare('DELETE FROM issue_tracker_locks').run();
 assert.equal(await syncTrackers(env,now),1);
 assert.ok(itemLines(gh.issues.get(open[0].number).body).some(l=>l.endsWith('#'+late)));assert.equal(gh.issues.get(late).state,'closed');

 /* a maintainer ticks a box in a page loaded before our write: GitHub keeps their (stale) body, our line is gone;
    the relay reads again, sees its line missing and writes it on top of their tick */
 const T=open[0].number;let once=true;
 gh.on({afterPatch:(number,issue)=>{if(number!==T||!once)return;once=false;
  issue.body=issue.body.split('\n').filter(l=>!l.includes('stage-race')).join('\n').replace('- [ ] stage-0','- [x] stage-0');}});
 const race=gh.add({title:'[Yui] race',labels:['yui-report','diagnostics'],body:'x'}).number;
 await trackIssue(env,{id:'yui:race',tracker:'yui-report',issue:race,name:'stage-race'},now);
 const final=gh.issues.get(T).body;
 assert.match(final,/^- \[x\] stage-0 /m,'the maintainer tick survives');
 assert.match(final,new RegExp(`^- \\[ \\] stage-race · 2026-11-26 · 详情和下载 #${race}$`,'m'),'our line is written again');
 assert.equal(itemLines(final).length,8);
});

test('GitHub down: nothing is lost, the detail issue stays open until the cron gets through',async t=>{
 const gh=fakeGitHub(),{db,env}=relay(gh);t.after(()=>db.raw.close());
 const {trackIssue,syncTrackers}=await import('../relay/src/issue-trackers.js');
 const n=gh.add({title:'[诊断] X · v1',labels:['diagnostics'],body:'x'}).number;
 const up=env.fetch;let down=true;env.fetch=(url,init)=>down?Promise.resolve(new Response('down',{status:502})):up(url,init);
 assert.equal((await trackIssue(env,{id:'d:1',tracker:'diagnostics',issue:n,name:'X · v1'},now)).ok,true);
 assert.match(tracked(db,n).last_error,/GITHUB_502/);assert.equal(gh.issues.get(n).state,'open');
 down=false;await syncTrackers(env,now);
 assert.equal(gh.issues.get(n).state,'closed');assert.ok(tracked(db,n).closed_at);assert.equal(tracked(db,n).last_error,null);
 assert.equal(await syncTrackers(env,now),0,'nothing left');
});

/* ---- PR #1209 review ------------------------------------------------------------------------------------------------ */
test('a box ticked by a maintainer after the relay read the tracker survives the relay write',async t=>{
 const gh=fakeGitHub(),{db,env}=relay(gh);t.after(()=>db.raw.close());
 const {trackIssue}=await import('../relay/src/issue-trackers.js');
 const T=gh.add({title:'[诊断] 汇总（1 条，逐条勾选）',labels:['diagnostics'],body:'intro\n\n- [ ] A · v1 · 2026-11-25 · 详情和下载 #50\n\n<!-- tracker:diagnostics -->'});
 db.raw.prepare('INSERT INTO issue_trackers(repo,tracker,issue) VALUES(?,?,?)').run(repo,'diagnostics',T.number);
 let ticked=false;
 gh.on({afterGet:(number,issue)=>{if(number!==T.number||ticked)return;ticked=true;issue.body=issue.body.replace('- [ ] A','- [x] A');}});
 const n=gh.add({title:'[诊断] B · v1',labels:['diagnostics'],body:'x'}).number;
 await trackIssue(env,{id:'d:b',tracker:'diagnostics',issue:n,name:'B · v1'},now);
 assert.ok(ticked);
 assert.deepEqual(itemLines(gh.issues.get(T.number).body),['- [x] A · v1 · 2026-11-25 · 详情和下载 #50',`- [ ] B · v1 · 2026-11-26 · 详情和下载 #${n}`]);
});

test('a request listed in a tracker that was closed since is ticked in that tracker, not the new one',async t=>{
 const gh=fakeGitHub(),{db,env}=relay(gh);t.after(()=>db.raw.close());
 const {trackIssue,requestTrackerTick}=await import('../relay/src/issue-trackers.js');
 const first=gh.add({title:'[想玩] X',labels:['game-request'],body:'x'}).number;
 await trackIssue(env,{id:'g:1',tracker:'game-request',issue:first,name:'Old Game'},now);
 const old=gh.open('game-request')[0];gh.issues.get(old.number).state='closed';
 const second=gh.add({title:'[想玩] Y',labels:['game-request'],body:'y'}).number;
 await trackIssue(env,{id:'g:2',tracker:'game-request',issue:second,name:'New Game'},now);
 const fresh=gh.open('game-request')[0];assert.notEqual(fresh.number,old.number);
 assert.equal(await requestTrackerTick(env,repo,first,now),true);
 assert.deepEqual(itemLines(gh.issues.get(old.number).body),[`- [x] Old Game（1 人：#${first}）`]);
 assert.deepEqual(itemLines(gh.issues.get(fresh.number).body),[`- [ ] New Game（1 人：#${second}）`]);
 assert.ok(tracked(db,first).ticked_at);assert.equal(tracked(db,first).last_error,null);
});

test('a detail issue created by GitHub whose answer was lost is found again, not created twice',async t=>{
 const gh=fakeGitHub(),{db,env}=relay(gh);t.after(()=>db.raw.close());
 const {trackIssue,syncTrackers}=await import('../relay/src/issue-trackers.js');
 let lose=true;const real=env.fetch;
 env.fetch=async(url,init={})=>{const r=await real(url,init);
  if(lose&&init.method==='POST'&&url.endsWith('/issues')&&JSON.parse(init.body).title.startsWith('[适配探针] Lost')){lose=false;throw Error('response lost');}
  return r;};
 const draft={title:'[适配探针] Lost · parse-failed',body:'MeguLit probe received by the relay',labels:['adapter-probe']};
 await trackIssue(env,{id:'probe:lost',tracker:'adapter-probe',name:'Lost',section:'解析失败',draft},now);
 const row=db.raw.prepare("SELECT * FROM issue_tracker_entries WHERE id='probe:lost'").get();
 assert.equal(row.issue,null);assert.ok(row.creating_at);assert.match(row.last_error,/response lost/);
 await syncTrackers(env,now);
 const details=[...gh.issues.values()].filter(i=>i.title.startsWith('[适配探针] Lost'));
 assert.equal(details.length,1,'no second detail issue');assert.equal(details[0].state,'closed');
 assert.match(details[0].body,/<!-- tracker-entry:probe:lost -->$/);
 assert.equal(db.raw.prepare("SELECT issue FROM issue_tracker_entries WHERE id='probe:lost'").get().issue,details[0].number);
 assert.ok(itemLines(gh.open('adapter-probe')[0].body).some(l=>l.endsWith('#'+details[0].number)));
});

test('a request resolved by the opened webhook before its tracker entry existed is listed ticked',async t=>{
 const gh=fakeGitHub(),{db,env}=relay(gh);t.after(()=>db.raw.close());
 const {handle}=await import('../relay/src/worker.js');
 const request=(url,body,headers={})=>handle(new Request('https://relay.test'+url,{method:body===undefined?'GET':'POST',body:typeof body==='string'?body:body===undefined?undefined:JSON.stringify(body),headers}),env,now);
 const wanted=exact('v42');
 assert.equal((await request('/api/seed-admin/game-request-evidence',{selector:wanted,kind:'generating',ref:randomUUID()},{authorization:'Bearer test-admin'})).status,201);
 const real=env.fetch;let hooked=false;
 env.fetch=async(url,init={})=>{const r=await real(url,init);
  const doc=init.method==='POST'&&url.endsWith('/issues')?JSON.parse(init.body):null;
  if(!hooked&&doc?.title.startsWith('[官网想玩]')){
   hooked=true;const issue=await r.clone().json(),body=JSON.stringify({repository:{full_name:repo},action:'opened',issue});
   const hook=await request('/api/probe/issue-webhook',body,{'x-github-event':'issues','x-hub-signature-256':'sha256='+createHmac('sha256',pepper).update(body).digest('hex')});
   assert.equal((await hook.json()).gameRequest,'closed','resolved before the relay registered it');}
  return r;};
 const r=await request('/api/feedback',{kind:'game',text:wanted,lang:'zh',page:'/'},{'cf-connecting-ip':'198.51.100.6'});
 const number=Number((await r.json()).url.split('/').pop());
 assert.ok(hooked);assert.equal(gh.issues.get(number).state,'closed');
 assert.match(gh.open('game-request')[0].body,new RegExp(`^- \\[x\\] .*（1 人：#${number}）$`,'m'));
 assert.ok(tracked(db,number).ticked_at);
});

test('a better probe of a game known only from a legacy issue joins the line of that issue',async t=>{
 const gh=fakeGitHub(),{db,env}=relay(gh,{ADAPTER_PROBE_WEBHOOK_SECRET:undefined});t.after(()=>db.raw.close());
 const T=gh.add({title:'[适配探针] 汇总（1 条，逐条勾选）',labels:['adapter-probe'],body:'intro\n\n### 解析失败（1）\n- [ ] Old · 2026-11-23 · 详情和下载 #800\n\n<!-- tracker:adapter-probe -->'});
 const {handle}=await import('../relay/src/worker.js');
 const identity=sha('legacy identity');
 db.raw.prepare("INSERT INTO probe_games(identity,bundle_id,state,items,issue_url,first_at,updated_at) VALUES(?,'legacy-bundle','partial',1,?,1,1)").run(identity,`https://github.com/${repo}/issues/800`);
 const bundle=JSON.stringify({schema:'megulit.probe-bundle',version:1,app:'1.4.25',games:[{identity,title:'Old',key:identity,step:'parse-failed'}]});
 const r=await handle(new Request('https://relay.test/api/probe',{method:'POST',headers:{'cf-connecting-ip':'198.51.100.7','x-megulit-version':'1.4.25'},
  body:JSON.stringify({version:1,upload:randomUUID(),part:0,parts:1,size:Buffer.byteLength(bundle),sha256:sha(bundle),data:Buffer.from(bundle).toString('base64'),identity,state:'complete',items:5})}),env,now);
 assert.equal(r.status,201,await r.clone().text());
 const latest=Math.max(...gh.issues.keys());
 assert.equal(db.raw.prepare('SELECT merge_ref FROM issue_tracker_entries WHERE issue=?').get(latest).merge_ref,800);
 assert.deepEqual(itemLines(gh.issues.get(T.number).body),[`- [ ] Old · 2026-11-23 · 详情和下载 #${latest} #800`]);
});
