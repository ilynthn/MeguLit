process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* #117 交流 on the app side: services/forum.cjs reads signed out, writes only with the account, cleans every reply from
   the relay and throws FORUM_<CODE> for the page; web/forum-view.js draws the tab escaped and in three languages; the
   leaderboard page has the fourth switch and the game detail page links to the work's discussions. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const forum=require('../services/forum.cjs');
const BASE_ENV={MEGULIT_RELAY_BASE:'https://relay.test'};
const tmp=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-forum-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};
const ID='0123456789abcdef',RID='fedcba9876543210';
const person={name:'Megumin',avatar:null,pid:null,mine:false};

test('reads signed out, writes need the account, replies are cleaned',async t=>{
 const root=tmp(t),seen=[];
 const replies={'GET /api/forum':[200,{posts:[{id:ID,title:'T'.repeat(300),excerpt:'e',tag:'weird',game:'ATRI',engine:'Kirikiri',replies:'3',created:5,active:6,author:{name:'A',avatar:'../x',pid:'nope',mine:'yes'}},{id:'../bad',title:'x'}],more:true,page:0}],
  [`GET /api/forum/${ID}`]:[200,{post:{id:ID,title:'t',body:'b',tag:'hook',author:person},replies:[{id:RID,body:'r',created:1,author:{...person,mine:true}},{id:'aaaaaaaaaaaaaaaa',deleted:true,created:2},{id:'bad'}]}],
  'POST /api/forum':[422,{ok:false,error:'MODERATION_SPAM'}],[`POST /api/forum/${ID}/replies`]:[201,{ok:true,id:RID}],[`DELETE /api/forum/${ID}/replies/${RID}`]:[200,{ok:true}]};
 const fetch=async(url,init)=>{const u=new URL(url);seen.push({route:u.pathname+u.search,method:init.method,auth:init.headers.authorization||''});const [status,data]=replies[init.method+' '+u.pathname]||[404,{ok:false,error:'NOT_FOUND'}];return new Response(JSON.stringify(data),{status});};
 const out={env:BASE_ENV,account:null,fetch};
 const list=await forum.list(root,{tag:'hook',game:'ATRI',page:2},out);
 assert.equal(list.state,'ok');assert.equal(list.signedIn,false);assert.equal(list.posts.length,1,'bad ids dropped');
 assert.deepEqual(list.posts[0].author,{name:'A',avatar:null,pid:null,mine:false});assert.equal(list.posts[0].title.length,60);assert.equal(list.posts[0].tag,'other');assert.equal(list.posts[0].replies,3);
 assert.equal(seen[0].route,'/api/forum?game=ATRI&tag=hook&page=2');assert.equal(seen[0].auth,'');
 const thread=await forum.get(root,ID,out);assert.equal(thread.replies.length,2);assert.deepEqual(thread.replies[1],{id:'aaaaaaaaaaaaaaaa',deleted:true,created:2});
 assert.deepEqual(await forum.get(root,'../x',out),{state:'error',error:'NOT_FOUND'});
 /* signed out: writes never leave the PC */
 const n=seen.length;
 await assert.rejects(()=>forum.create(root,{title:'hi',body:'b',tag:'question'},out),/FORUM_UNAUTHORIZED/);
 await assert.rejects(()=>forum.reply(root,ID,'x',out),/FORUM_UNAUTHORIZED/);
 assert.equal(seen.length,n);
 assert.equal((await forum.list(root,{mine:true},out)).state,'login');
 /* with the account: bearer token, relay reasons come back as FORUM_<CODE> */
 const account={accountId:'acc1',token:()=>'mgl_'+'A'.repeat(43),save:()=>{}},inn={env:BASE_ENV,account,fetch};
 await assert.rejects(()=>forum.create(root,{title:'hi',body:'b',tag:'question'},inn),/FORUM_MODERATION_SPAM/);
 assert.equal(seen.at(-1).auth,'Bearer mgl_'+'A'.repeat(43));
 assert.deepEqual(await forum.reply(root,ID,'thanks',inn),{state:'ok',id:RID});
 assert.deepEqual(await forum.remove(root,ID,RID,inn),{state:'ok'});
 await assert.rejects(()=>forum.remove(root,'x',RID,inn),/FORUM_NOT_FOUND/);
 assert.equal((await forum.list(root,{},inn)).signedIn,true);
 assert.deepEqual(forum.status(root,{env:{MEGULIT_RELAY_BASE:'off'},account:null}),{configured:false,signedIn:false});
 assert.equal((await forum.list(root,{},{env:{MEGULIT_RELAY_BASE:'off'},account:null,fetch})).state,'not-configured');
});

test('forum page: three languages share the keys, text is escaped, wiring is in place',async()=>{
 const view=await import('../web/forum-view.js');
 const keys=Object.keys(view.forumWords('zh')).sort();for(const l of ['ja','en'])assert.deepEqual(Object.keys(view.forumWords(l)).sort(),keys,l);
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 view.setForumFilter({game:'<b>x</b>',engine:'',tag:'hook',mine:false});
 const row=view.forumSubRow('zh',esc);assert.ok(!row.includes('<b>x</b>'));assert.match(row,/作品：&lt;b&gt;/);assert.match(row,/data-forum-tag="hook" aria-pressed="true"/);
 assert.equal(view.errorText(Error('FORUM_MODERATION_ADULT'),'zh'),'审核未通过：疑似成人内容');assert.equal(view.errorText(Error('FORUM_WHATEVER'),'en'),'Cannot reach the online service right now');
 for(const code of ['UNAUTHORIZED','RATE_LIMITED','TITLE_LENGTH','BODY_LENGTH','TEXT_LINK','TEXT_BLOCKED','TEXT_INVALID','MODERATION_ABUSE','MODERATION_SPAM','THREAD_FULL','FORBIDDEN'])assert.ok(view.forumWords('ja')[code],code);
 const web=f=>fs.readFileSync(path.join(__dirname,'..','web',f),'utf8');
 assert.match(web('leaderboard-view.js'),/\['board','hot',\.\.\.CHART_BOARDS,'follow','forum'\]/);
 assert.match(web('game-detail.js'),/这部作品的讨论/);assert.match(web('app.js'),/setForumFilter\(\{game:/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8'),/case 'forum_post':/);
});
/* 2026-11-28 (user: Hook 适配 改成游戏针对适配请求的命名) the category keeps its id `hook`; only the name changes, and a new
   post in it asks for the game name, engine and problem */
test('forum: the hook category is shown as 适配请求 / 対応リクエスト / Adaptation requests with its own writing hint',async()=>{
 const {pathToFileURL}=require('node:url');const view=await import(pathToFileURL(path.join(__dirname,'..','web','forum-view.js')).href);
 assert.deepEqual(['zh','ja','en'].map(l=>view.forumWords(l).hook),['适配请求','対応リクエスト','Adaptation requests']);
 for(const l of ['zh','ja','en'])assert.match(view.forumWords(l).hookBodyHint,/游戏名|ゲーム名|game name/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','forum-view.js'),'utf8'),/tag==='hook'\?w\.hookBodyHint:w\.bodyHint/);
});
