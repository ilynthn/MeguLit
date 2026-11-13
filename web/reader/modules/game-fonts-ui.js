// SPDX-License-Identifier: GPL-3.0-or-later
// 文字页: fonts found in the current game's folder become named choices, with a status light and a rescan button.
(function installGameFonts(){
 'use strict';
 if(!window.__tomoyoChinese||!window.TomoyoGameStyle){document.addEventListener('DOMContentLoaded',installGameFonts,{once:true});return;}
 const b=window.__tomoyoChinese,gs=window.TomoyoGameStyle;if(b.gameFontsInstalled)return;b.gameFontsInstalled=true;
 let info=null,busy=false;const loaded=new Set();
 const send=m=>{try{window.__tomoyoTranslateRequest(JSON.stringify(m));}catch{}};
 const prefs=()=>{try{return b.galPreferences?.()||JSON.parse(localStorage.getItem('tomoyo-gal-settings')||'{}')||{};}catch{return {};}};
 const style=document.createElement('style');style.textContent=`
 .tome-gamefont{margin:4px 0 12px;padding:11px 13px;border-radius:12px;border:1px solid var(--theme-border,#3a3a40);background:color-mix(in srgb,var(--theme-text,#eee) 3%,transparent)}
 .tome-gamefont-head{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:600}
 .tome-gamefont-head i{width:10px;height:10px;border-radius:50%;flex:none;background:#6b6b73}
 .tome-gamefont[data-state=on] i{background:#43c47f;box-shadow:0 0 8px #43c47fb0}
 .tome-gamefont[data-state=found] i{background:#e2b04a;box-shadow:0 0 6px #e2b04a80}
 .tome-gamefont[data-state=on]{border-color:color-mix(in srgb,#43c47f 45%,transparent)}
 .tome-gamefont small{display:block;margin-top:6px!important;line-height:1.6}
 .tome-gamefont-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
 .tome-gamefont-actions button{font-size:12px!important;padding:5px 11px!important;border-radius:8px!important;cursor:pointer}
 .tome-gamefont-actions button[hidden]{display:none!important}`;
 document.head.append(style);

 const T={
 zh:{waiting:'游戏字体文件',waitHelp:'绑定游戏后，可把游戏目录中的独立字体文件加入上方字体列表；不读取游戏当前字号、颜色或排版',failed:'游戏字体文件暂不可用',empty:'未发现可导入的游戏字体文件',choose:'仍可在上方日文／中文字体列表中选择系统字体，选择后保存并应用',loaded:'已选择游戏字体文件',found:'可选择的游戏字体文件已加载',detail:'请在上方日文／中文字体列表中选择，或使用下方按钮；保存并应用后保留选择',apply:'选用找到的字体',rescan:'重新扫描字体文件',busy:'正在扫描游戏目录中的字体文件…',file:'游戏文件',systemGothic:'系统字体 · 日文黑体',systemMincho:'系统字体 · 日文明朝体',loadError:'找到了字体文件，但浏览器无法加载；可先在上方选择系统字体'},
 en:{waiting:'Game font files',waitHelp:'After binding a game, standalone fonts in its folder can be added to the font lists above; this does not detect current size, colour or layout',failed:'Game font files unavailable',empty:'No importable game font files found',choose:'Choose a system font in the Japanese / Chinese lists above, then Save and apply',loaded:'Game font files selected',found:'Game font files are available to select',detail:'Select them in the Japanese / Chinese lists above, or use the button below; Save and apply keeps the selection',apply:'Select detected fonts',rescan:'Scan font files again',busy:'Scanning the game folder for font files…',file:'game file',systemGothic:'system font · Japanese Gothic',systemMincho:'system font · Japanese Mincho',loadError:'Font files were found but could not be loaded; choose a system font above'},
 ja:{waiting:'ゲームのフォントファイル',waitHelp:'ゲームを固定すると、フォルダ内の独立したフォントを上の一覧に追加できます。現在の文字サイズ・色・配置は取得しません',failed:'ゲームのフォントを利用できません',empty:'取り込めるフォントファイルはありません',choose:'上の日本語／中国語フォントからシステムフォントを選び、保存して適用してください',loaded:'ゲームのフォントを選択中',found:'ゲームのフォントを選択できます',detail:'上の日本語／中国語フォント一覧か下のボタンから選択し、保存して適用してください',apply:'検出したフォントを選択',rescan:'フォントを再スキャン',busy:'ゲームフォルダのフォントをスキャン中…',file:'ゲーム内ファイル',systemGothic:'システムフォント・ゴシック体',systemMincho:'システムフォント・明朝体',loadError:'フォントは見つかりましたが読み込めませんでした。上からシステムフォントを選択できます'}};
 const t=k=>(T[window.__tomeI18n?.get?.()]||T.zh)[k];
 const fontsOf=lang=>(info?.fonts||[]).filter(f=>f.lang===lang&&loaded.has(f.id));
 const label=()=>info?.label||'游戏';
 function register(f){const fam='ToMeGF-'+f.id,stack='"'+fam+'",'+(f.lang==='zh'?'"Microsoft YaHei",SimHei,sans-serif':'"MS Gothic","ＭＳ ゴシック",sans-serif');(f.lang==='zh'?gs.chineseFonts:gs.japaneseFonts)['game:'+f.id]=stack;return fam;}
 b.gameFonts=async payload=>{
  info=payload&&typeof payload==='object'?payload:null;busy=false;
  for(const f of info?.fonts||[]){const fam=register(f);if(f.data&&!loaded.has(f.id)){try{const face=new FontFace(fam,`url(data:font/${f.format==='opentype'?'otf':'ttf'};base64,${f.data})`,{weight:'400',style:'normal'});await face.load();document.fonts.add(face);loaded.add(f.id);}catch{}}}
  b.restoreGalSettings?.({});paint();
 };
 function state(){
  const p={...prefs()},zh=fontsOf('zh'),ja=fontsOf('ja');for(const [name,key]of [['galJapaneseFont','japaneseFont'],['galChineseFont','chineseFont']]){const select=document.querySelector('select[name='+name+']');if(select)p[key]=select.value;}
  if(!info)return {state:'off',title:t('waiting'),detail:t('waitHelp')};
  if(info.status==='error')return {state:'off',title:t('failed'),detail:t('choose')};
  if(!zh.length&&!ja.length)return {state:'off',title:t('empty'),detail:info.fonts?.length?t('loadError'):t('choose')};
  const using=ja.some(f=>p.japaneseFont==='game:'+f.id)||zh.some(f=>p.chineseFont==='game:'+f.id);
  return {state:using?'on':'found',title:t(using?'loaded':'found'),detail:t('detail'),apply:!using};
 }
 function ensureBox(){
  const select=document.querySelector('.tomoyo-cn-dialog select[name=galJapaneseFont]');if(!select)return null;
  // The game-font scan has its own fold (游戏字体) under the text groups, not inside 日文设置 (user, 2026-11-02).
  const panel=select.closest('[data-menu-category=text]'),host=panel?.querySelector('[data-text-game-font]')||panel||select.closest('.tomoyo-gal-fields'),anchor=null;let box=document.querySelector('.tomoyo-cn-dialog .tome-gamefont');
  if(!box){box=document.createElement('div');box.className='tome-gamefont';box.dataset.noI18n='';box.innerHTML='<div class="tome-gamefont-head"><i></i><span data-gf-title></span></div><small data-gf-detail></small><div class="tome-gamefont-actions"><button type="button" data-gf-apply>使用游戏字体</button><button type="button" data-gf-follow>恢复为游戏原字体</button><button type="button" data-gf-rescan>重新查找游戏字体</button></div>';
   box.querySelector('[data-gf-apply]').onclick=()=>send({type:'gameFontsApply'});
   box.querySelector('[data-gf-follow]').onclick=()=>{for(const s of document.querySelectorAll('select[name=galJapaneseFont]'))if(s.querySelector('option[value="@game"]'))s.value='@game';send({type:'gameFontFollow'});};
   box.querySelector('[data-gf-rescan]').onclick=()=>{busy=true;paint();send({type:'gameFontsRescan'});};
  }
  if(host&&(anchor?anchor.nextElementSibling!==box:host.lastElementChild!==box))anchor?anchor.after(box):host.append(box);
  return box;
 }
 function options(){
  const p=prefs();
  for(const [name,lang,key] of [['galJapaneseFont','ja','japaneseFont'],['galChineseFont','zh','chineseFont'],['galRubyFont','ja','rubyFont'],['galEnglishFont','en','englishFont']])for(const select of document.querySelectorAll(`select[name=${name}]`)){
   const pending=select.dataset.gfPopulated?select.value:p[key];select.dataset.gfPopulated='1';
   for(const o of [...select.querySelectorAll('option[data-game]')])o.remove();
   const ui=window.__tomeI18n?.get?.()||document.documentElement.lang.slice(0,2);
   const notes=({
    zh:{sans:'系统字体 · 黑体',serif:'系统字体 · 明朝／衬线',mono:'系统字体 · 等宽',round:'圆润字形',inherit:'跟随正文',patch:'《素晴日》汉化字体',original:'游戏字体',optional:'需本机安装'},
    en:{sans:'System font · sans-serif',serif:'System font · serif',mono:'System font · monospace',round:'Rounded',inherit:'Follow body text',patch:'Subahibi Chinese patch font',original:'Game font',optional:'Requires installation'},
    ja:{sans:'システム · ゴシック',serif:'システム · 明朝',mono:'システム · 等幅',round:'丸みのある字形',inherit:'本文に合わせる',patch:'素晴らしき日々の中国語パッチ',original:'作品フォント',optional:'要インストール'}
   })[ui]||{};
   const option=(id,family,note)=>{const o=new Option(family,id);o.dataset.fontName=family;o.dataset.fontNote=note;o.dataset.noI18n='';return o;};
   const built=gs.fontOptions[key].map(([id,family,kind,optional])=>option(id,family||notes.inherit,kind==='inherit'?'':optional?notes.optional:notes[kind]));
   const game=fontsOf(lang).map(f=>{register(f);const o=option('game:'+f.id,f.family,label()+' · '+notes.original);o.title=f.source||'';return o;});
   /* user 2026-11-13: 恢复为游戏原字体 — the game's own font (reported by the engine / font probe, or loaded from its memory) */
   const follow=key==='japaneseFont'?[option('@game',({zh:'游戏原字体（自动）',en:'Game font (automatic)',ja:'ゲームのフォント（自動）'})[ui]||'游戏原字体（自动）',({zh:'恢复为游戏原字体',en:'Restore the game font',ja:'ゲームのフォントに戻す'})[ui]||'恢复为游戏原字体')]:[];
   select.replaceChildren(...follow,...game,...built);
   const want=key==='japaneseFont'&&!select.dataset.gfPopulatedOnce&&p.japaneseFontSource!=='user'?'@game':pending||p[key];if(key==='japaneseFont')select.dataset.gfPopulatedOnce='1';if(want&&select.value!==want&&select.querySelector(`option[value="${want}"]`))select.value=want;
  }
 }
 function paint(){
  options();const box=ensureBox();if(!box)return;const s=state();box.dataset.state=s.state;
  box.querySelector('[data-gf-title]').textContent=busy?t('busy'):s.title;box.querySelector('[data-gf-detail]').textContent=busy?'':s.detail;
  box.querySelector('[data-gf-apply]').textContent=t('apply');box.querySelector('[data-gf-rescan]').textContent=t('rescan');box.querySelector('[data-gf-follow]').textContent=({zh:'恢复为游戏原字体',en:'Restore the game font',ja:'ゲームのフォントに戻す'})[window.__tomeI18n?.get?.()||'zh']||'恢复为游戏原字体';
  box.querySelector('[data-gf-apply]').hidden=!s.apply;box.querySelector('[data-gf-rescan]').disabled=busy;
 }
 b.gameFontsRefresh=paint;addEventListener('tome-language-change',paint);
 document.addEventListener('change',e=>{if(e.target?.matches?.('select[name=galJapaneseFont],select[name=galChineseFont]'))setTimeout(paint,50);},true);
 let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(document.querySelector('.tomoyo-cn-dialog select[name=galJapaneseFont]')&&(!document.querySelector('.tomoyo-cn-dialog .tome-gamefont')||document.querySelector('select[name=galJapaneseFont]:not([data-gf-done])'))){for(const s of document.querySelectorAll('select[name=galJapaneseFont]'))s.dataset.gfDone='1';paint();}});}).observe(document.documentElement,{childList:true,subtree:true});
 send({type:'gameFontsLoad'});
})();
