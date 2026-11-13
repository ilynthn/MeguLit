import {mountSettingsAutosave,leaveSettings,flushSettings} from './settings-autosave.js';
// SPDX-License-Identifier: GPL-3.0-or-later
import {mountPathPickers} from './path-picker.js';
import {renderBackup} from './backup-ui.js';
import {mountSettingsReset} from './settings-reset.js';
import {renderAccount,accountLabel} from './account-ui.js';
import {profileLabel} from './profile-settings.js';
import {openProfilePanel} from './profile-panel.js';

import {enhanceSelects} from './select-control.js';
import {configureSpeech} from './speech-settings.js';
import {mountRuntimePacks} from './runtime-packs.js';
let stopPacks=()=>{};
const categoryStateKey='tome-settings-open-categories';
let savedCategories=null;
try{const value=JSON.parse(localStorage.getItem(categoryStateKey));if(Array.isArray(value))savedCategories=value.filter(id=>typeof id==='string');}catch{}
const openCategories=new Set(savedCategories||[]);
const saveCategories=()=>{try{localStorage.setItem(categoryStateKey,JSON.stringify([...openCategories]));}catch{}};
import {configureTranslation} from './translation-settings.js';
import {mountGuide} from './settings-guides.js';
import {mountSettingsSearch} from './settings-search.js';
import {configureDictionary,fieldHelp} from './settings-help.js';
import {mountSettingsPreview} from './settings-preview.js';
let stopTranslation=()=>{};
import {navigation,fieldPages,visibleFields} from './settings-layout.js';
const selectedPages=new Map();
let settingsRender=0;
/* v1.1.5 (user: redundant labels): under a tab named "Alt+T 菜单", show "背景模糊" instead of "Alt+T 菜单 · 背景模糊" */
function pageLabel(label,page){if(!page||!label||!label.startsWith(page))return label;const rest=label.slice(page.length).replace(/^\s*[·・:：-]?\s*/,'');return rest||label;
 }
export async function renderSettings({main,api,invoke,text,locale,esc,toast,heading,basicSettings,isCurrent,onSaved,section,setSection,profile,setProfile}){
 await leaveSettings();stopTranslation();stopTranslation=()=>{};const renderId=++settingsRender;
 const labels={zh:{general:'常规与外观',global:'全局默认',profile:'按游戏设置',apiKey:'API 密钥',keyHint:'留空保留已有密钥，密钥仅由当前 Windows 账户加密保存',saveKey:'保存密钥',keySaved:'密钥已加密保存',invalid:'设置值无效，请检查后重试',
  selectProfile:'选择已保存的游戏配置',saved:'设置已保存',savedHint:'游戏内设置将由独立阅读服务读取',emptyProfiles:'绑定并保存游戏设置后，可在这里选择',models:'离线模型',modelHint:'保留已下载的模型文件；只在使用对应引擎时运行',refreshVoices:'刷新声音列表',
  voice:'声音',style:'说话风格',keyRequired:'请填写密钥',restore:'恢复历史配置',history:'配置历史'},ja:{general:'一般・外観',global:'全体の既定値',profile:'作品別の設定',apiKey:'API キー',keyHint:'空欄では既存キーを保持します。現在の Windows アカウントで暗号化保存します',
  saveKey:'キーを保存',keySaved:'キーを暗号化して保存しました',invalid:'設定値を確認してください',selectProfile:'保存済みの作品設定を選択',saved:'設定を保存しました',savedHint:'独立した読書サービスがゲーム内設定を読み込みます',emptyProfiles:'ゲームの設定を保存すると、ここで選択できます',
  models:'オフラインモデル',modelHint:'ダウンロード済みモデルを保持し、対象エンジンの使用時だけ起動します',refreshVoices:'声の一覧を更新',voice:'声',style:'話し方',keyRequired:'キーを入力してください',restore:'設定履歴から復元',history:'設定履歴'},
  en:{general:'General and appearance',global:'Global defaults',profile:'Per-game settings',apiKey:'API key',keyHint:'Leave empty to keep existing keys. Encrypted with the current Windows account',
  saveKey:'Save key',keySaved:'Key saved encrypted',invalid:'Check the setting values and try again',selectProfile:'Choose a saved game profile',saved:'Settings saved',
  savedHint:'The independent reading service reads in-game settings',emptyProfiles:'Saved game settings will be selectable here',models:'Offline models',modelHint:'Downloaded models are retained and run only when their engine is used',
  refreshVoices:'Refresh voices',voice:'Voice',style:'Speaking style',keyRequired:'Enter a key',restore:'Restore settings history',history:'Settings history'}}[locale];
 if(!main.querySelector('.settings-layout'))main.innerHTML=heading(text.settings)+'<div class="loading-screen"><span class="spinner"></span></div>';
 const cacheKey=profile||'';const data=main.__settingsData?.key===cacheKey?main.__settingsData.data:await api('settings_get',{profile});main.__settingsData={key:cacheKey,
  data};if(!isCurrent()||renderId!==settingsRender)return;
 /* E404 个人主页 is a panel now: an old link or a search hit opens it over 联网服务 */
 if(section==='personal'){openProfilePanel({api,locale,esc,toast,openSettings:next=>{setSection(next);renderSettings({main,api,invoke,text,locale,esc,toast,heading,
  basicSettings,isCurrent,onSaved,section:next,setSection,profile,setProfile}).catch(()=>toast(text.serviceFailed));}}).catch(()=>toast(text.serviceFailed));section='online';
  setSection(section);}
 if(section&&!data.groups.some(group=>group.id===section)&&section!=='data'&&section!=='account')section='general';
 const sectionName=id=>id==='general'?labels.general:id==='personal'?profileLabel[locale]||profileLabel.zh:id==='account'?accountLabel[locale]||accountLabel.zh:id==='data'?{
  zh:'数据与备份',en:'Data and backup',ja:'データ・バックアップ'}[locale]:data.groups.find(g=>g.id===id)?.label[locale];
 if(savedCategories===null){for(const category of navigation)if(category.ids.includes(section))openCategories.add(category.ids[0]);}
 const navScroll=main.querySelector('.settings-nav')?.scrollTop??main.__settingsNavScroll??0;main.__settingsNavScroll=navScroll;
 {const shell=heading(text.settings)+`<div class="settings-layout"><nav class="settings-nav" aria-label="${text.settings}">${navigation.map(category=>`<details class="settings-category" data-category="${category.ids[0]}" ${openCategories.has(category.ids[0])?'open':''}><summary>${category.label[locale]}</summary><div class="settings-category-items">${category.ids.map(id=>`<button data-section="${id}" class="${section===id?'active':''}" ${section===id?'aria-current="page"':''}>${esc(sectionName(id))}</button>`).join('')}</div></details>`).join('')}</nav><div class="settings-content"></div></div>`;
  const old=main.querySelector('.settings-layout');if(old&&old.querySelector('.settings-nav')){const t=document.createElement('div');t.innerHTML=shell;const nav=t.querySelector('.settings-nav'),
  oldNav=old.querySelector('.settings-nav');/* 2026-11-14 every nav button, incl. ones other modules inject without data-section (特效), or they stay .active */oldNav.querySelectorAll('.settings-category-items>button').forEach(b=>{const on=b.dataset.section===section;b.classList.toggle('active',
  on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});nav.querySelectorAll('details').forEach(d=>{const o=oldNav.querySelector(`details[data-category="${d.dataset.category}"]`);
  if(o&&d.open&&!o.open)o.open=true;});const existingContent=old.querySelector('.settings-content');[...existingContent.children].forEach(child=>{if(!child.matches('.settings-search,.settings-search-results'))child.remove();
  });existingContent.classList.remove('searching');}else main.innerHTML=shell;}
 const nav=main.querySelector('.settings-nav');if(nav){nav.scrollTop=navScroll;/* 2026-11-11 the current section is always in view */requestAnimationFrame(()=>{
  const cur=nav.querySelector('[data-section].active');if(cur){const a=cur.getBoundingClientRect(),b=nav.getBoundingClientRect();if(a.top<b.top+8||a.bottom>b.bottom-24)cur.scrollIntoView({
  block:'nearest'});}});nav.addEventListener('scroll',()=>{main.__settingsNavScroll=nav.scrollTop;},{passive:true});}
 const content=main.querySelector('.settings-content');
 main.querySelectorAll('.settings-category').forEach(category=>{let animation;const items=category.querySelector('.settings-category-items');category.querySelector('summary').onclick=event=>{
  event.preventDefault();const height=category.open?items.getBoundingClientRect().height:0;const opacity=category.open?getComputedStyle(items).opacity:0;animation?.cancel();
  const expand=!openCategories.has(category.dataset.category);if(expand)openCategories.add(category.dataset.category);else openCategories.delete(category.dataset.category);
  savedCategories=[...openCategories];saveCategories();category.open=true;category.dataset.expanded=String(expand);items.style.boxSizing='border-box';const fullHeight=items.getBoundingClientRect().height;
  animation=items.animate([{height:height+'px',opacity},{height:(expand?fullHeight:0)+'px',opacity:expand?1:0}],{duration:matchMedia('(prefers-reduced-motion:reduce)').matches?0:190,
  easing:'cubic-bezier(.2,.8,.2,1)'});animation.onfinish=()=>{category.open=expand;delete category.dataset.expanded;};};});
 main.querySelectorAll('[data-section]').forEach(button=>button.onclick=()=>{setSection(button.dataset.section);renderSettings({main,api,invoke,text,locale,esc,
  toast,heading,basicSettings,isCurrent,onSaved,section:button.dataset.section,setSection,profile,setProfile}).catch(()=>toast(text.serviceFailed));});
 const search=mountSettingsSearch({content,data,text,locale,esc,navigate:async item=>{setSection(item.scope);await renderSettings({main,api,invoke,text,locale,esc,
  toast,heading,basicSettings,isCurrent,onSaved,section:item.scope,setSection,profile,setProfile});const area=main.querySelector('.settings-content');const field=area.querySelector('form')?.elements.namedItem(item.key);
  if(field){const row=field.closest('.settings-row'),page=row?.closest('[data-page-panel]');if(page)area.querySelector(`[data-page="${page.dataset.pagePanel}"]`)?.click();
  if(item.scope==='dictionary'&&item.key.startsWith('lookupProfiles.')){const provider=area.querySelector('[name=lookupProvider]');provider.value=item.key.split('.')[1];
  provider.dispatchEvent(new Event('change',{bubbles:true}));}if(row?.dataset.unavailable==='true')area.querySelector('[data-kind=api]')?.click();row?.scrollIntoView({
  block:'center'});}else area.querySelector('.background-tools,.panel')?.scrollIntoView({block:'start'});}});
 if(!section)return;
 main.querySelector('.settings-autosave-status')?.remove();
 const saveStatus=document.createElement('span');saveStatus.className='settings-autosave-status';saveStatus.hidden=true;saveStatus.setAttribute('role','status');
  saveStatus.setAttribute('aria-live','polite');main.querySelector('.page-tools').append(saveStatus);
 if(section==='general'){/* 2026-11-11 the general page gets the same serif title as every other section */content.insertAdjacentHTML('beforeend',`<h2 class="settings-section-title">${esc(sectionName('general')||'')}</h2>`);
  const body=document.createElement('div');content.append(body);basicSettings(body);import('./learning-goal.js').then(m=>m.mountGoalSettings({target:content,api,
  esc,toast,locale})).catch(()=>{});body.querySelector('.page-header')?.remove();enhanceSelects(body);try{mountGlassSettings({body,data,locale,esc,api,toast,text,
  main,onSaved});}catch(error){console.warn('glass settings',error);}return;}
 if(section==='data'){const body=document.createElement('div');content.append(body);renderBackup({target:body,api,invoke,locale,esc,toast,onSaved});mountSettingsReset({
  target:body,api,locale,esc,toast,onSaved:async detail=>{delete main.__settingsData;await onSaved(detail);}});return;}
 /* E378 账号 page (web/account-ui.js) */
 if(section==='account'){const body=document.createElement('div');content.append(body);renderAccount({target:body,api,locale,esc,toast}).catch(()=>toast(text.serviceFailed));
  return;}
 const group=data.groups.find(g=>g.id===section),fields=visibleFields(section,data.fields),values=data.values[section];
 const scoped=['text','embedding','position'].includes(section);
 const pages=fieldPages(section,fields);let activePage=selectedPages.get(section)||pages[0].id;if(!pages.some(p=>p.id===activePage))activePage=pages[0].id;
 const input=field=>{
  const value=values[field.key],name=esc(field.key);
  if(field.type==='boolean')return `<input class="switch" name="${name}" type="checkbox" ${value?'checked':''}>`;
  if(field.type==='select')return `<select name="${name}">${field.options.filter(option=>!option.hidden||option.value===value).map(option=>`<option value="${esc(option.value)}" ${option.value===value?'selected':''}>${esc(option.label[locale])}</option>`).join('')}${value&&!field.options.some(o=>o.value===value)?`<option value="${esc(value)}" selected>${esc(value)}</option>`:''}</select>`;
  if(field.type==='multiline')return `<textarea name="${name}" rows="4">${esc(value)}</textarea>`;
  if(field.type==='color')return `<input type="color" name="${name}" data-empty="${value===''?'true':'false'}" value="${esc(/^#[0-9a-f]{6}$/i.test(value)?value:'#ffffff')}">`;
  if(field.type==='number'&&Number.isFinite(field.max)&&field.max-field.min<=10000)return `<span class="setting-slider"><input type="range" name="${name}" min="${field.min}" max="${field.max}" step="${field.step??1}" value="${esc(value)}" aria-label="${esc(field.label[locale])}"><input type="number" data-slider-number="${name}" min="${field.min}" max="${field.max}" step="${field.step??1}" value="${esc(value)}" aria-label="${esc(field.label[locale])}"></span>`;
  return `<input name="${name}" type="${field.type==='number'?'number':'text'}" value="${esc(value)}" ${field.type==='number'?`min="${field.min??''}" max="${field.max??''}" step="${field.step??1}"`:''} ${field.readOnly?'readonly':''} autocomplete="off">`;
 };
 content.insertAdjacentHTML('beforeend',`${scoped?`<section class="profile-selector"><span>${labels.profile}</span><select id="settings-profile"><option value="">${labels.global}</option>${data.profiles.map(p=>`<option value="${p.id}" ${p.id===profile?'selected':''}>${esc(p.name)}</option>`).join('')}</select></section>`:''}<form id="advanced-settings-form"><h2 class="settings-section-title">${esc(group.label[locale])}</h2>${pages.length>1?`<div class="settings-page-tabs" role="tablist">${pages.map(page=>`<button type="button" role="tab" aria-selected="${page.id===activePage}" aria-controls="settings-page-${page.id}" data-page="${page.id}">${esc(page.label[locale])}</button>`).join('')}</div>`:''}${pages.map(page=>`<section class="panel settings-page" id="settings-page-${page.id}" data-page-panel="${page.id}" ${page.id!==activePage?'hidden':''}>${page.fields.map(field=>`<label class="settings-row"><span class="setting-description"><span class="settings-label">${esc(pageLabel(field.label[locale],page.label?.[locale]))}</span>${fieldHelp(field.scope||section,field.key,locale)?`<small class="settings-help">${esc(fieldHelp(field.scope||section,field.key,locale))}</small>`:''}</span>${input(field)}</label>`).join('')}</section>`).join('')}</form>${section==='translation'?`<section class="panel key-panel"><h2 class="panel-title">${labels.apiKey}</h2><p class="settings-help">${labels.keyHint}</p><div class="input-group"><input id="translation-key" type="password" autocomplete="new-password" placeholder="${data.hasSavedKeys?'••••••••':''}" aria-label="${labels.apiKey}"><button class="secondary" id="save-translation-key">${labels.saveKey}</button></div></section>`:''}`);
 const form=content.querySelector('#advanced-settings-form');mountSettingsPreview({content,section,values,locale});
 mountPathPickers({form,fields,invoke,locale,toast});
 const showPage=()=>{form.querySelectorAll('[data-page-panel]').forEach(panel=>panel.hidden=panel.dataset.pagePanel!==activePage);form.querySelectorAll('[data-page]').forEach(button=>button.setAttribute('aria-selected',
  String(button.dataset.page===activePage)));};
 form.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>{activePage=button.dataset.page;selectedPages.set(section,activePage);search.value='';search.dispatchEvent(new Event('input'));
  form.querySelectorAll('.settings-row').forEach(row=>row.hidden=false);showPage();});
 if(section==='background')form.addEventListener('input',()=>{const update={};for(const field of fields){const element=form.elements.namedItem(field.key);update[field.key]=field.type==='boolean'?element.checked:field.type==='number'?Number(element.value):element.value;
  }dispatchEvent(new CustomEvent('tome-background-preview',{detail:update}));});
 /* v1.1.6 (user): the slider stays stepless; its number shows a whole value, or one or two decimals on small ranges */
 const shown=range=>{const v=Number(range.value),span=Number(range.max)-Number(range.min);const d=span>=20?0:span>=2?1:2;return String(Number(v.toFixed(d)));};
 form.querySelectorAll('[data-slider-number]').forEach(number=>{const range=form.elements.namedItem(number.dataset.sliderNumber);range.addEventListener('input',
  ()=>{if(range.step==='any')range.value=String(Number(Number(range.value).toFixed(3)));number.value=shown(range);});number.value=shown(range);number.addEventListener('change',
  ()=>{if(number.value!==''&&Number.isFinite(Number(number.value))){range.value=number.value;number.value=range.value;range.dispatchEvent(new Event('input',{bubbles:true}));
  }});});
 if(section==='background'){
  const controls=document.createElement('section');controls.className='panel background-tools';controls.innerHTML=`<div class="settings-row background-image-row"><span class="settings-label">${{zh:'背景图片',en:'Background image',ja:'背景画像'}[locale]}</span><div class="review-controls"><button type="button" class="secondary" data-choose>${{zh:'选择图片',en:'Choose image',ja:'画像を選択'}[locale]}</button><button type="button" class="secondary" data-crop>${{zh:'调整显示区域',en:'Adjust visible area',ja:'表示範囲を調整'}[locale]}</button><button type="button" class="secondary" data-default-bg>${{zh:'恢复默认背景',en:'Use default background',ja:'既定の背景に戻す'}[locale]}</button></div></div>`;
   form.before(controls);
  const enabled=document.createElement('label');enabled.className='settings-row';enabled.innerHTML=`<span class="settings-label">${text.useBackground}</span><input class="switch" type="checkbox">`;
   controls.prepend(enabled);
  const toggle=enabled.querySelector('input');toggle.disabled=true;
  /* v1.1.5: forget the chosen picture and go back to the bundled light/dark background */
  controls.querySelector('[data-default-bg]').onclick=async event=>{const b=event.currentTarget;b.disabled=true;try{await api('asset_clear',{slot:'home'});await api('save_preferences',
   {values:{homeBackground:true}});toggle.checked=true;await onSaved({scope:'background-toggle'});toast({zh:'已恢复默认背景',en:'Default background restored',ja:'既定の背景に戻しました'}[locale]);
   }catch{toast(text.serviceFailed);}finally{b.disabled=false;}};
  api('preferences').then(preferences=>{if(enabled.isConnected){toggle.checked=!!preferences.homeBackground;toggle.disabled=false;}}).catch(()=>toast(text.serviceFailed));
  toggle.onchange=async()=>{toggle.disabled=true;try{await api('save_preferences',{values:{homeBackground:toggle.checked}});await onSaved({scope:'background-toggle'});
   }catch{toggle.checked=!toggle.checked;toast(text.serviceFailed);}finally{toggle.disabled=false;}};
  controls.querySelector('[data-crop]').onclick=()=>dispatchEvent(new Event('tome-open-home-crop'));controls.querySelector('[data-choose]').onclick=()=>dispatchEvent(new Event('tome-pick-home-picture'));
 }
 if(section==='library'){
  mountHiddenGames({content,api,locale,esc,toast,onSaved,text});
  const tools=document.createElement('div');tools.className='review-controls';const words={zh:['自动查找 Steam','扫描游戏目录','已更新游戏库'],en:['Find Steam','Scan game folders',
   'Library updated'],ja:['Steam を探す','ゲームフォルダをスキャン','ライブラリを更新しました']}[locale];tools.innerHTML=`<button type="button" class="secondary" data-steam>${words[0]}</button><button type="button" class="secondary" data-scan>${words[1]}</button>`;
   content.append(tools);
  tools.querySelector('[data-steam]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{const value=await api('library_find_steam');
   form.elements.namedItem('steamPath').value=value.path||'';form.elements.namedItem('steamPath').dispatchEvent(new Event('change',{bubbles:true}));}catch{toast(text.serviceFailed);
   }finally{button.disabled=false;}};
  tools.querySelector('[data-scan]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await flushSettings();const scanned=await api('library_scan');
   await onSaved();const missed=scanned?.unconfirmed||[];if(missed.length){const names=missed.slice(0,3).map(m=>m.title).join(locale==='en'?', ':'、');toast(({zh:`已更新游戏库；有 ${missed.length} 个文件夹没认出是 galgame（${names}${missed.length>3?' 等':''}），可在游戏库点「${text.addGame}」手动加入`,
   en:`Library updated; ${missed.length} folder(s) were not recognised as visual novels (${names}${missed.length>3?'…':''}). Use ${text.addGame} in the library to add them`,
   ja:`ライブラリを更新しました。${missed.length} 個のフォルダーをノベルゲームと判定できませんでした（${names}${missed.length>3?' など':''}）。ライブラリの「${text.addGame}」で追加できます`})[locale]||words[2]);}else toast(words[2]);
   }catch{toast(text.serviceFailed);}finally{button.disabled=false;}};
 }
 if(section==='anki'){
  const button=document.createElement('button');button.className='secondary';button.textContent={zh:'检查 Anki 连接',en:'Check Anki connection',ja:'Anki との接続を確認'}[locale];
   button.onclick=async()=>{button.disabled=true;try{const status=await api('anki_status');toast(status.connected?text.ankiConnected:text.ankiOffline);}catch{toast(text.serviceFailed);
   }finally{button.disabled=false;}};content.append(button);
 }
 if(section==='translation')stopTranslation=configureTranslation({content,form,data,locale,api,esc,toast});
 if(section==='dictionary')configureDictionary({content,form,locale});
 if(section==='speech')stopTranslation=configureSpeech({content,form,api,locale,esc,toast});
 stopPacks();stopPacks=['speech','dictionary'].includes(section)?mountRuntimePacks({content,api,locale,esc,toast}):()=>{};
 /* E383 built-in tutorial card at the top of the page; its buttons run the step for the reader */
 {const started={zh:'已开始下载，进度见本页下方「运行组件」',en:'Download started; progress is under Runtime components below',ja:'ダウンロードを開始しました。進行状況は下の「実行コンポーネント」に表示されます'}[locale]||'',
   ready={zh:'已经安装好了，不用再下载',en:'Already installed; nothing to download',ja:'インストール済みです。ダウンロードは不要です'}[locale]||'';
  /* 2026-11-13 the guide's download buttons read the real pack state: an installed pack shows ✓ 已就绪 and a click never re-downloads */
  const installed={};if(['speech','dictionary'].includes(section)){try{for(const p of (await api('pack_status')).packs||[])installed[p.id]=!!p.installed;}catch{}}
  const pack=id=>async()=>{try{const now=(await api('pack_status')).packs?.find(p=>p.id===id);if(now?.installed){toast(ready);return;}await api('pack_download',{ids:[id]});toast(started);content.querySelector('.runtime-packs,[data-runtime-packs]')?.scrollIntoView({
  behavior:'smooth',block:'center'});}catch{toast(text.serviceFailed);}};
  mountGuide({content,section,locale,esc,api,toast,installed,actions:{voice:pack('voice'),reading:pack('reading'),ankiCheck:async()=>{try{const status=await api('anki_status');
   toast(status.connected?text.ankiConnected:text.ankiOffline);}catch{toast(text.serviceFailed);}}}});}
 enhanceSelects(content);
 form.querySelectorAll('input[type=color]').forEach(element=>element.oninput=()=>element.dataset.empty='false');
 content.querySelector('#settings-profile')?.addEventListener('change',event=>{const nextProfile=event.target.value;setProfile(nextProfile);renderSettings({main,
  api,invoke,text,locale,esc,toast,heading,basicSettings,isCurrent,onSaved,section,setSection,profile:nextProfile,setProfile}).catch(()=>toast(text.serviceFailed));
  });
 mountSettingsAutosave({form,locale,status:saveStatus,save:async update=>{const result=await api('settings_save',{scope:section,values:update,profile});if(['background',
  'panels'].includes(section)){const ui=await api('ui_state');for(const[key,value]of Object.entries(ui))localStorage.setItem(key,value);}delete main.__settingsData;
  await onSaved({...result,scope:section});}});
 content.querySelector('#save-translation-key')?.addEventListener('click',async event=>{
  const element=content.querySelector('#translation-key');if(!element.value)return toast(labels.keyRequired);event.currentTarget.disabled=true;
  try{await api('save_key',{provider:form.elements.namedItem('provider').value,baseUrl:form.elements.namedItem('baseUrl').value,apiKey:element.value});element.value='';
   element.placeholder='••••••••';toast(labels.keySaved);}catch(error){toast(text.serviceFailed);}finally{event.currentTarget.disabled=false;}
 });
}

function mountHiddenGames({content,api,locale,esc,toast,onSaved,text}){
 const [title,empty,show,close]=({zh:['已隐藏游戏','没有隐藏的游戏','取消隐藏','关闭'],en:['Hidden games','No hidden games','Unhide','Close'],ja:['非表示のゲーム','非表示のゲームはありません','再表示',
  '閉じる']})[locale];
 const button=document.createElement('button');button.className='secondary';button.textContent=title;content.append(button);
 button.onclick=async()=>{
  try{
   const games=await api('hidden_games');if(!button.isConnected)return;
   const dialog=document.createElement('dialog');
   dialog.innerHTML=`<h2>${title}</h2><div data-hidden-list>${games.length?games.map((game,index)=>`<div class="settings-row"><span>${esc(game.title)}</span><button class="secondary" data-unhide="${index}">${show}</button></div>`).join(''):`<p>${empty}</p>`}</div><div class="dialog-actions"><button class="secondary" data-close>${close}</button></div>`;
   document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();dialog.querySelector('[data-close]').onclick=()=>dialog.close();
   for(const control of dialog.querySelectorAll('[data-unhide]'))control.onclick=async()=>{
    control.disabled=true;
    try{await api('set_game_hidden',{id:games[Number(control.dataset.unhide)].id,hidden:false});control.parentElement.remove();if(!dialog.querySelector('[data-unhide]'))dialog.querySelector('[data-hidden-list]').textContent=empty;
     await onSaved();}
    catch{control.disabled=false;toast(text.serviceFailed);}
   };
  }catch{toast(text.serviceFailed);}
 };
}

// E261: frosted-glass options live in General → Appearance; they are still stored in the background scope
function mountGlassSettings({body,data,locale,esc,api,toast,text,main,onSaved}){
 const panel=body.querySelectorAll('.panel')[1];if(!panel)return;const values={...data.values.background};
 const fields=data.fields.filter(f=>f.scope==='background'&&f.key.startsWith('glass'));
 for(const field of fields){const value=values[field.key];const row=document.createElement('label');row.className='settings-row';
  const control=field.type==='boolean'?`<input class="switch" type="checkbox" form="megulit-glass-detached" name="bg-${field.key}" ${value?'checked':''}>`:`<span class="setting-slider"><input type="range" form="megulit-glass-detached" name="bg-${field.key}" min="${field.min}" max="${field.max}" step="1" value="${esc(value)}" aria-label="${esc(field.label[locale])}"><input type="number" data-glass-number form="megulit-glass-detached" min="${field.min}" max="${field.max}" step="1" value="${esc(value)}" aria-label="${esc(field.label[locale])}"></span>`;
  row.innerHTML=`<span class="settings-label">${esc(field.label[locale])}</span>${control}`;panel.append(row);
  const input=row.querySelector(`[form="megulit-glass-detached" name="bg-${field.key}"]`),number=row.querySelector('[data-glass-number]');let timer;
  const read=()=>field.type==='boolean'?input.checked:Number(input.value);
  const save=()=>{clearTimeout(timer);timer=setTimeout(async()=>{try{await api('settings_save',{scope:'background',values:{[field.key]:read()}});const ui=await api('ui_state');
   for(const[k,v]of Object.entries(ui))localStorage.setItem(k,v);delete main.__settingsData;await onSaved({scope:'background'});}catch{toast(text.serviceFailed);
   }},field.type==='boolean'?0:350);};
  // keep these events away from the General form, whose autosave and re-render would undo the switch
  for(const type of ['input','change'])row.addEventListener(type,event=>event.stopPropagation());
  input.addEventListener(field.type==='boolean'?'change':'input',()=>{if(number)number.value=input.value;values[field.key]=read();dispatchEvent(new CustomEvent('tome-background-preview',
   {detail:{[field.key]:read()}}));save();});
  number?.addEventListener('change',()=>{if(Number.isFinite(Number(number.value))){input.value=number.value;number.value=input.value;input.dispatchEvent(new Event('input'));
   }});}
}
