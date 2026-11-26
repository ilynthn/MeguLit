'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startWeb,startEdge}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(file=>file&&fs.existsSync(file));

test('the profile avatar crop accepts clicks above the profile and displays the approved upload',{skip:!hasEdge&&'Edge not installed',timeout:45000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-avatar-dialog-'));
 let server,browser;
 try{
  server=await startWeb({call:async()=>null});
  browser=await startEdge(path.join(temp,'edge'));
  const base=`http://127.0.0.1:${server.address().port}`;
  await browser.send('Page.navigate',{url:base+'/background-crop.css'});
  const crop=await browser.evaluate(`(async()=>{
   for(const name of ['background-crop.css','controls.css','leaderboard.css']){
    const link=Object.assign(document.createElement('link'),{rel:'stylesheet',href:'/'+name});
    await new Promise(resolve=>{link.onload=resolve;document.head.append(link);});
   }
   const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#ab4521';ctx.fillRect(0,0,128,128);
   const png=await new Promise(resolve=>canvas.toBlob(resolve));
   const originalClick=HTMLInputElement.prototype.click;
   HTMLInputElement.prototype.click=function(){
    if(this.type!=='file')return originalClick.call(this);
    const files=new DataTransfer();files.items.add(new File([png],'avatar.png',{type:'image/png'}));
    this.files=files.files;this.dispatchEvent(new Event('change'));
   };
   const profile=await import('/profile-panel.js');
   let name='Reader';
   const api=async(action,args)=>{
    if(action==='account_status')return {configured:true,loggedIn:true};
    if(action==='leaderboard_profile')return {configured:true,joined:true,name};
    if(action==='leaderboard_profile_get')return {state:'ok',joined:true,favorites:[]};
    if(action==='leaderboard_avatar_status')return {state:'ok',status:'none'};
    if(action==='leaderboard_avatar_set'){window.upload=args.data;window.uploads=(window.uploads||0)+1;return {state:'ok',status:window.uploadStatus||'approved'};}
    if(action==='profile_name_save'){if(window.rejectRename)throw Error('LEADERBOARD_BAD_NAME');window.savedName=name=args.name;return {name};}
    return [];
   };
   window.profileToasts=[];
   const panel=await profile.openProfilePanel({api,locale:'en',esc:String,toast:message=>window.profileToasts.push(message)});
   const button=panel.querySelector('[data-hero-avatar]');button.click();
   for(let i=0;i<100&&!document.querySelector('.avatar-crop');i++)await new Promise(r=>setTimeout(r,20));
   const box=document.querySelector('.avatar-crop');
   const confirm=box?.querySelector('[data-ok]');
   if(!confirm)return null;
   const rect=confirm.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
   return {x,y,clickable:document.elementFromPoint(x,y)===confirm,focused:document.activeElement===confirm,panelOpen:panel.open};
  })()`);
  assert.ok(crop,'the normal avatar action opens the crop');
  assert.deepEqual({clickable:crop.clickable,focused:crop.focused,panelOpen:crop.panelOpen},{clickable:true,focused:true,panelOpen:true});
  await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x:crop.x,y:crop.y,button:'left',clickCount:1});
  await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:crop.x,y:crop.y,button:'left',clickCount:1});
  const result=await browser.evaluate(`(async()=>{
   for(let i=0;i<100&&!document.querySelector('[data-hero-avatar] img');i++)await new Promise(r=>setTimeout(r,20));
   const img=document.querySelector('[data-hero-avatar] img');
   return {uploaded:window.upload?.startsWith('data:image/webp;base64,')===true,picture:!!img&&img.src===window.upload,
    cropClosed:!document.querySelector('.avatar-crop'),profileOpen:document.querySelector('.profile-panel').open};
  })()`);
  assert.deepEqual(result,{uploaded:true,picture:true,cropClosed:true,profileOpen:true});
  const rename=await browser.evaluate(`(async()=>{
   document.querySelector('[data-hero-name]').click();
   const input=document.querySelector('.profile-hero-name-input');
   input.value='New reader';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
   const {navigation}=await import('/settings-layout.js');
   return {savedName:window.savedName,shownName:document.querySelector('[data-hero-name]')?.textContent,
    pictured:!!document.querySelector('[data-hero-avatar] img'),profileInSettings:navigation.some(category=>category.ids.includes('personal'))};
  })()`);
  assert.deepEqual(rename,{savedName:'New reader',shownName:'New reader',pictured:true,profileInSettings:true});

  const reopen=`(async()=>{
   const avatar=document.querySelector('[data-hero-avatar]');avatar.focus();avatar.click();
   for(let i=0;i<100&&!document.querySelector('.avatar-crop');i++)await new Promise(r=>setTimeout(r,20));
   return !!document.querySelector('.avatar-crop');
  })()`;
  assert.equal(await browser.evaluate(reopen),true);
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});
  await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',windowsVirtualKeyCode:27});
  assert.deepEqual(await browser.evaluate(`({closed:!document.querySelector('.avatar-crop'),
   focused:document.activeElement.matches('[data-hero-avatar]'),uploads:window.uploads})`),{closed:true,focused:true,uploads:1});

  assert.equal(await browser.evaluate(reopen),true);
  await browser.evaluate(`window.uploadStatus='rejected';document.querySelector('.avatar-crop input').focus()`);
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',windowsVirtualKeyCode:13});
  await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',windowsVirtualKeyCode:13});
  const rejection=await browser.evaluate(`(async()=>{
   for(let i=0;i<100&&window.uploads!==2;i++)await new Promise(r=>setTimeout(r,20));
   const note=document.querySelector('.profile-hero-note');
   return {status:note.dataset.status,noteVisible:!note.hidden,message:window.profileToasts.at(-1),
    pictured:!!document.querySelector('[data-hero-avatar] img')};
  })()`);
  assert.deepEqual(rejection,{status:'rejected',noteVisible:true,message:'Picture not approved',pictured:false});
  const unified=await browser.evaluate(`(async()=>{
   document.querySelector('[data-edit-profile]').click();
   const form=document.querySelector('.profile-identity-form');
   form.elements.nickname.value='Third name';
   form.querySelector('[data-picture]').click();
   const wait=async predicate=>{for(let i=0;i<100&&!predicate();i++)await new Promise(r=>setTimeout(r,20));};
   await wait(()=>document.querySelector('.avatar-crop [data-ok]'));
   document.querySelector('.avatar-crop [data-ok]').click();
   await wait(()=>!form.querySelector('img').hidden);
   const before=window.uploads;
   window.rejectRename=true;form.requestSubmit();
   await wait(()=>!form.inert);
   const retained=form.isConnected&&!form.querySelector('img').hidden&&form.elements.nickname.value==='Third name';
   const previous=document.querySelector('[data-hero-name-text]').textContent;
   window.rejectRename=false;window.uploadStatus='approved';form.requestSubmit();
   await wait(()=>window.uploads===before+1&&!form.isConnected);
   return {previous,retained,uploadsBeforeSubmit:before,uploadsAfterRetry:window.uploads,savedName:window.savedName};
  })()`);
  assert.deepEqual(unified,{previous:'New reader',retained:true,uploadsBeforeSubmit:2,uploadsAfterRetry:3,savedName:'Third name'});
 }finally{await browser?.stop();server?.close();try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:150});}catch(error){if(!['EBUSY','EPERM','ENOTEMPTY'].includes(error?.code))throw error;}}
});
