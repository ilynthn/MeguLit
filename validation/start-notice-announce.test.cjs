// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 11-27 start notice 「MeguLit 还在开发中」 (user): the 「一键上传问题反馈」 button in the corner goes (「没啥用 没人会在公告的地方传反馈」;
   the About page keeps it), the forward button only says 下一步 (「根本不用加入下一页：the seed这种蠢话 丑」) and is no longer the red
   folded block, and 「怎样才算适配成功？」 says calibration is automatic: no 「一定要先校准」, and the manual fallback names the real
   Alt+T page 「校准」 and its button 「校准当前句」. The notice is mounted for real (feedback-ui.js) in a headless Edge with every
   stylesheet of web/index.html, in all three languages. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch}=require('../services/cardinal/cdp.cjs');
const web=path.join(__dirname,'../web'),ORIGIN='https://notice.invalid';
const read=f=>fs.readFileSync(path.join(web,f),'utf8');
/* the real names in the Alt+T panel: the page (i18n of 校准) and the button (game-style-sync-ui.js sync label) */
const calibrateButton={zh:'校准当前句',en:'Calibrate current line',ja:'現在の文を調整'};
const calibratePage={zh:'校准',en:'Calibration',ja:'調整'};

test('the Alt+T names the notice quotes are the real ones',()=>{
 const sync=read('reader/modules/game-style-sync-ui.js'),i18n=read('reader/modules/i18n.js');
 for(const l of ['zh','en','ja'])assert.ok(sync.includes(`sync:'${calibrateButton[l]}'`),l+' button');
 assert.ok(i18n.includes(`'校准':['${calibratePage.en}','${calibratePage.ja}']`));
});

test('start notice: no upload button, a plain 下一步, and the success steps say calibration is automatic',async()=>{
 const links=[...read('index.html').matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(m=>`<link rel="stylesheet" href="${ORIGIN}/${m[1]}">`).join('');
 const page=`<!doctype html><html lang="zh-CN" data-theme="dark"><head><meta charset="utf-8">${links}</head><body><main class="main" id="main"></main></body></html>`;
 const browser=await launch({viewport:{width:1200,height:900}}),p=browser.page;
 try{
  p.route(url=>{const u=new URL(url);if(u.origin!==ORIGIN)return 'abort';if(u.pathname==='/__notice.html')return {body:Buffer.from(page),headers:{'content-type':'text/html; charset=utf-8'}};
   const f=path.resolve(web,'.'+decodeURIComponent(u.pathname));if(!f.startsWith(web+path.sep)||!fs.existsSync(f))return {status:404,body:''};
   return {body:fs.readFileSync(f),headers:{'content-type':f.endsWith('.css')?'text/css':f.endsWith('.js')?'text/javascript':f.endsWith('.json')?'application/json':'application/octet-stream'}};});
  await p.goto(ORIGIN+'/__notice.html');
  const problems=[];
  for(const locale of ['zh','en','ja']){
   const seen=await p.evaluate(async locale=>{
    try{localStorage.clear();sessionStorage.clear();}catch{}
    document.querySelector('.startup-notice')?.remove();
    const {mountDevNotice}=await import('/feedback-ui.js');
    mountDevNotice({api:async()=>[],locale,esc:s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),toast:()=>{},version:'test',force:true});
    await new Promise(r=>setTimeout(r,300));
    const d=document.querySelector('.startup-notice'),one=d.querySelector('[data-page="1"]');
    const visible=el=>!!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
    const next=one.querySelector('[data-next]'),cs=getComputedStyle(next);
    const out={buttons:[...one.querySelectorAll('.dev-notice-actions button')].filter(visible).map(b=>b.textContent.trim()),next:next.textContent.trim(),
     nextBg:cs.backgroundColor+' '+cs.backgroundImage,nextClip:cs.clipPath,
     steps:[...d.querySelectorAll('.guide-success li')].map(li=>li.textContent.trim()),successText:d.querySelector('.guide-success').textContent};
    next.click();await new Promise(r=>setTimeout(r,100));
    const seed=d.querySelector('[data-page="seed"]');out.seedNext=seed.hidden?null:seed.querySelector('[data-next-guide]').textContent.trim();
    d.close();return out;
   },locale);
   const tag=`[${locale}]`;
   if(seen.buttons.length!==1)problems.push(`${tag} page 1 shows ${seen.buttons.length} action buttons (${seen.buttons.join(' / ')}), expected only the forward one`);
   for(const [name,text] of [['page 1 forward button',seen.next],['The Seed page forward button',seen.seedNext]]){
    if(text==null){problems.push(`${tag} ${name} missing`);continue;}
    if(/The Seed|[:：]|使用教程|how to use|使い方/i.test(text))problems.push(`${tag} ${name} says 「${text}」`);
   }
   if(/rgb\(2\d\d, \d{1,2}, \d{1,2}\)/.test(seen.nextBg)||/polygon/.test(seen.nextClip))problems.push(`${tag} the forward button is still the red folded block (${seen.nextBg}; ${seen.nextClip})`);
   if(seen.steps.length!==3)problems.push(`${tag} ${seen.steps.length} success steps`);
   if(/一定要先校准|先校准一次|Calibrate once|一度校正|まず一度/.test(seen.successText))problems.push(`${tag} success box still asks for a manual calibration first`);
   const last=seen.steps[2]||'';
   if(!last.includes(calibrateButton[locale])||!last.includes(calibratePage[locale])||!last.includes('Alt+T'))problems.push(`${tag} step 3 does not name Alt+T / ${calibratePage[locale]} / ${calibrateButton[locale]}: ${last}`);
  }
  assert.deepEqual(problems,[]);
 }finally{await browser.close();}
});
