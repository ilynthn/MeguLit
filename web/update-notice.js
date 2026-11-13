// SPDX-License-Identifier: GPL-3.0-or-later
/* Update notice (v1.1.0). On start MeguLit asks GitHub for the latest release; a newer one is downloaded right away
   with a real progress bar, and the card shows the version, what changed and how the package size moves. Restart now
   or later: a verified package waits in cache/update and is reused at the next start. */
const M={
 zh:{title:v=>`MeguLit v${v} 来了`,current:v=>`当前 v${v}`,size:mb=>`安装包 ${mb}`,bigger:'比当前版本大',smaller:'比当前版本小',same:'和当前版本差不多大',notes:'更新内容',downloading:'正在下载',verifying:'正在校验…',ready:'下载完成，已校验',restart:'重启并更新',later:'稍后',retry:'重试',failed:'下载失败',keep:'只替换程序文件，游戏库、学习记录和设置都会保留',closing:'MeguLit 即将关闭，更新完会自动重新打开',latest:'已经是最新版',checking:'正在检查…',page:'在 GitHub 查看',hotSize:mb=>`更新包 ${mb}，只含改动的文件`,hotGo:'立即更新',hotKeep:'不用重启：替换改动的文件，界面会刷新一下',hotApplying:'正在更新…',hotReader:'游戏正在运行，先退出游戏再更新',hotLater:'文件已更新，下次打开 MeguLit 时生效'},
 ja:{title:v=>`MeguLit v${v} が出ました`,current:v=>`現在 v${v}`,size:mb=>`パッケージ ${mb}`,bigger:'今より大きい',smaller:'今より小さい',same:'今とほぼ同じサイズ',notes:'更新内容',downloading:'ダウンロード中',verifying:'検証中…',ready:'ダウンロード完了・検証済み',restart:'再起動して更新',later:'あとで',retry:'再試行',failed:'ダウンロードに失敗しました',keep:'プログラムだけを置き換えます。ライブラリ・学習記録・設定はそのままです',closing:'MeguLit を閉じて更新し、自動で開き直します',latest:'最新版です',checking:'確認中…',page:'GitHub で見る',hotSize:mb=>`更新パッケージ ${mb}（変更分のみ）`,hotGo:'今すぐ更新',hotKeep:'再起動は不要です。変更されたファイルだけを置き換え、画面が一度読み込み直されます',hotApplying:'更新中…',hotReader:'ゲームの実行中です。ゲームを終了してから更新してください',hotLater:'ファイルは更新済みです。次回の起動から反映されます'},
 en:{title:v=>`MeguLit v${v} is here`,current:v=>`Current v${v}`,size:mb=>`Package ${mb}`,bigger:'Larger than now',smaller:'Smaller than now',same:'About the same size as now',notes:'What’s new',downloading:'Downloading',verifying:'Verifying…',ready:'Downloaded and verified',restart:'Restart and update',later:'Later',retry:'Retry',failed:'Download failed',keep:'Only program files are replaced. Your library, study records and settings stay',closing:'MeguLit will close, update and reopen',latest:'You are up to date',checking:'Checking…',page:'View on GitHub',hotSize:mb=>`Update ${mb}, changed files only`,hotGo:'Update now',hotKeep:'No restart: only the changed files are replaced and the window reloads once',hotApplying:'Updating…',hotReader:'A game is running. Close it first, then update',hotLater:'Files updated. The new version starts next time you open MeguLit'}};
const mb=n=>(n/1048576).toFixed(n>=10485760?1:2)+' MB';
/* Signed size change in MB, precise enough that a few KB does not read as 0.00 */
const deltaMb=n=>{const v=n/1048576,a=Math.abs(v);return (v>=0?'+':'−')+(a<0.01?a.toFixed(3):a.toFixed(2))+' MB';};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

/* Release notes are written zh first, then '---' and English. Keep the reader's half and drop markdown noise. */
/* E297: notes from 1.2.4 on wrap each language in <details><summary>中文|English</summary> and every hotfix in a collapsed
   block of its own. The card keeps the reader's language of every block; a hotfix title stays as a heading. */
function blockText(body,locale){
 /* (user 2026-11-12: the card showed a cut "<su") hotfix sections come first, newest first, so a same-version update
    says what changed now; any stray tag line is dropped */
 const want=locale==='zh'?'zh':'en',groups=[[]];let mode='both';
 for(const raw of String(body||'').split(/\r?\n/)){const line=raw.trim();
  const sum=/<summary>(.*?)<\/summary>/i.exec(line);
  if(sum){const label=sum[1].replace(/<[^>]+>/g,'').trim();if(/^中文/.test(label))mode='zh';else if(/^English/i.test(label))mode='en';else{mode='both';groups.push(['### '+label.replace(/[（(].*$/,'').trim()]);}continue;}
  if(/^<\/details>$/i.test(line)){mode='both';continue;}
  if(/^</.test(line)||/^-{3,}$/.test(line))continue;
  if(mode==='both'||mode===want)groups[groups.length-1].push(raw);}
 return [...groups.slice(1).reverse(),groups[0]].flat().join('\n');
}

function notesFor(body,locale){
 const halves=String(body||'').split(/\r?\n-{3,}\r?\n/),text=/<summary>/i.test(String(body||''))?blockText(body,locale):locale==='zh'||halves.length<2?halves[0]:halves[1];
 return text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&!/^\[.*\]\(.*\)$|^>|^!\[/.test(l)&&!/MeguLit-v[\d.]+-win-x64\.zip/.test(l))
  .map(l=>({head:/^#{1,6}\s/.test(l),text:l.replace(/^#{1,6}\s*|^[-*]\s+/g,'').replace(/\*\*(.*?)\*\*/g,'$1').replace(/`([^`]*)`/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')})).slice(0,80);
}

let card=null,poll=0;
export function updateLocale(){const l=document.documentElement.lang||'';return l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh';}

function render(info,{api,invoke,locale}){
 const t=M[locale]||M.zh;card?.remove();clearInterval(poll);
 card=document.createElement('aside');card.className='upd-card';card.setAttribute('role','dialog');card.setAttribute('aria-label',t.title(info.latest));
 const delta=info.delta==null?'':(Math.abs(info.delta)<51200?t.same:info.delta>0?t.bigger:t.smaller)+(locale==='en'?' (':'（')+deltaMb(info.delta)+(locale==='en'?')':'）');
 const notes=notesFor(info.notes,locale);
 const same=info.hotfix?({zh:'（热修复）',ja:'（修正版）',en:' (hotfix)'})[locale]||'':'';
 card.innerHTML=`<button type="button" class="upd-x" data-upd-close aria-label="${esc(t.later)}">×</button>
  <div class="upd-eyebrow">${esc(t.current(info.current))} → v${esc(info.latest)}</div>
  <h3>${esc(t.title(info.latest))}${esc(same)}</h3>
  <p class="upd-size">${info.hot?esc(t.hotSize(mb(info.hotSize||0))):`${esc(t.size(mb(info.size||0)))}${delta?` · <b class="${info.delta>0?'up':'down'}">${esc(delta)}</b>`:''}`}</p>
  ${notes.length?`<div class="upd-notes" tabindex="0"><span>${esc(t.notes)}</span>${notes.map(n=>n.head?`<h4>${esc(n.text)}</h4>`:`<p>${esc(n.text)}</p>`).join('')}</div>`:''}
  <div class="upd-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
  <div class="upd-state" data-upd-state>${esc(t.downloading)}</div>
  <p class="upd-keep" data-upd-keep>${esc(info.hot?t.hotKeep:t.keep)}</p>
  <div class="upd-acts"><button type="button" class="upd-go" data-upd-go disabled>${esc(info.hot?t.hotGo:t.restart)}</button><button type="button" class="upd-later" data-upd-close>${esc(t.later)}</button></div>`;
 document.body.append(card);requestAnimationFrame(()=>card?.classList.add('in'));
 const bar=card.querySelector('.upd-bar'),fill=bar.querySelector('i'),state=card.querySelector('[data-upd-state]'),go=card.querySelector('[data-upd-go]');
 const close=()=>{clearInterval(poll);const c=card;card=null;c?.classList.remove('in');setTimeout(()=>c?.remove(),260);};
 card.querySelectorAll('[data-upd-close]').forEach(b=>b.addEventListener('click',close));
 const show=s=>{
  const total=s.total||(info.hot?info.hotSize:info.size)||0,got=Math.min(s.received||0,total||Infinity),pct=total?Math.floor(got/total*100):0;
  fill.style.width=pct+'%';bar.setAttribute('aria-valuenow',String(pct));
  if(s.phase==='downloading'){state.textContent=total&&got>=total?t.verifying:`${t.downloading} ${mb(got)} / ${mb(total)} · ${pct}%`;}
  else if(s.phase==='ready'){clearInterval(poll);fill.style.width='100%';bar.classList.add('done');state.textContent=t.ready;go.disabled=false;go.textContent=s.hot?t.hotGo:t.restart;go.dataset.mode=s.hot?'hot':'install';}
  else if(s.phase==='error'){if(info.hot&&!s.hot){/* the hot package failed: the retry fetches the full one */info.hot=false;const keep=card?.querySelector('[data-upd-keep]');if(keep)keep.textContent=t.keep;}clearInterval(poll);bar.classList.add('fail');state.textContent=t.failed+(s.error?' · '+s.error:'');go.disabled=false;go.textContent=t.retry;go.dataset.mode='retry';}
 };
 const begin=async()=>{bar.classList.remove('fail','done');go.disabled=true;try{show(await api('update_start',{current:info.current}));}catch(e){show({phase:'error',error:String(e?.message||e)});return;}
  clearInterval(poll);let inflight=false;poll=setInterval(async()=>{if(!card){clearInterval(poll);return;}if(inflight)return;inflight=true;try{show(await api('update_status'));}catch{}finally{inflight=false;}},250);};
 go.addEventListener('click',async()=>{
  if(go.dataset.mode==='retry'){begin();return;}
  if(go.dataset.mode==='hot'){
   /* no restart (services/hot-update.cjs): files first, then the service restarts and the pages reload */
   go.disabled=true;state.textContent=t.hotApplying;
   try{await invoke('hot_reload',{dryRun:true});}catch(e){state.textContent=String(e?.message||e)==='READER_OPEN'?t.hotReader:t.failed+' · '+String(e?.message||e);go.disabled=false;return;}
   try{await api('update_install');}catch(e){show({phase:'error',error:String(e?.message||e)});return;}
   invoke('hot_reload',{dryRun:false}).catch(()=>{state.textContent=t.hotLater;});return;
  }
  go.disabled=true;state.textContent=t.closing;
  try{await api('update_install');setTimeout(()=>invoke('app_exit_for_update').catch(()=>{}),1200);}catch(e){state.textContent=t.failed+' · '+String(e?.message||e);go.disabled=false;}
 });
 begin();
}

/* Called once at start (silent unless there is something new) and by About → Check for updates (reports either way). */
export async function checkForUpdates({api,invoke,version,toast,manual=false}){
 const locale=updateLocale(),t=M[locale]||M.zh;
 try{const info=await api('update_check',{current:version});
  if(!info.newer){if(manual)toast?.(t.latest);return info;}
  render(info,{api,invoke,locale});return info;
 }catch(error){if(manual)toast?.(t.failed+' · '+String(error?.message||error));return null;}
}
export {notesFor};
