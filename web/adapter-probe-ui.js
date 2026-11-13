// SPDX-License-Identifier: GPL-3.0-or-later
/* E563 hook for the probe → desensitized upload → adapter pack pipeline (services/adapter-actions.cjs).
   Other UI owns the look of the 适配总览 dialog; this module only offers:
     adapterProbe(api)                    thin calls: start / status / cancel / prepare / manifest / upload / packs / sync / rollback
     openProbeUpload({api,locale,esc,toast,ids,reason})
                                          the dialog that runs the local check; 2026-11-14 (owner: 默认打开…冷上传) the
                                          problem games then go to the quiet automatic upload (services/probe-auto.cjs,
                                          one probe per game on the relay) and the dialog shows what was sent, item by
                                          item, as a record. With Settings library.probeUpload off it is the old flow:
                                          exactly what would be uploaded, sent only after the user confirms
     mountProbeHook(dialog,{api,locale,esc,toast})
                                          one button for the 适配总览 dialog (it finds .adapt-tools, else the header)
     stepLabel(step,locale)               the words for a probe step, for any row that shows one
   Uses the diagnostics dialog styles (web/diagnostics.css), plus a few rules of its own injected once. */
const T={
 zh:{button:'本地检查',kicker:'适配检查',title:'检查游戏库的适配情况',hint:'在本机逐个读取每个游戏的封包和剧本，只统计能否读出、读出多少行、配对率。游戏文本不会离开这台电脑',scanning:'正在检查',of:'/',stop:'先停下（下次接着检查）',close:'关闭',
  done:'检查完成',allGood:'所有游戏都能正常读取，没有需要上传的内容',found:n=>`有 ${n} 个游戏没能完美读取。下面是要上传的全部内容：只有结构和统计，所有日文、中文等文字都已在本机换成占位符并逐字校验过`,
  autoSending:'正在后台自动上传脱敏结构…',autoNote:'读不出的游戏会在后台自动上传脱敏结构（不含文本）；服务器已有的游戏不再上传。可在 设置 → 游戏库 关闭',sentRecord:'已上传的内容（记录）',
  outcome:{sent:'已上传',duplicate:'服务器已有，未重复上传',known:'服务器已有，未重复上传',nothing:'没有可上传的内容',failed:'上传失败，稍后自动重试',offline:'连不上服务器，稍后自动重试',skipped:'已上传过',busy:'后台正在上传，稍后再看',off:'自动上传已关闭'},
  preparing:'正在本机生成脱敏结构…',upload:'确认上传',uploading:'上传中…',uploaded:'已上传，感谢！适配好后会自动推送给你，不用更新软件',failed:'上传失败，可以稍后再试',manual:'上传通道暂时不可用，可以稍后再试',
  followUp:'以后作者需要时，自动补传这些游戏的脱敏结构（只含结构与统计，可随时在设置里关掉）',openIssue:'查看反馈',sentTotal:'实际发送',limit:l=>`上限 ${l}`,raw:'原始',parts:c=>`分 ${c} 段上传`,rawHint:'脱敏后再压缩：发送的是压缩后的大小，原始大小只作参考',limits:'每个游戏最多 8 个样本，每个压缩后不超过 2 MB；剧本整份（16 MB 内），封包整份或头尾各 8 MB；本机每个游戏最多读 64 MB、80 秒',dropped:'未通过校验，不上传',keys:n=>`${n} 组解密参数候选`,result:'读取统计',sample:'脱敏结构样本',cancelled:'已停下，下次打开会接着检查',
  steps:{ok:'正常','unknown-pack':'未知封包格式','decrypt-failed':'解密失败','parse-failed':'剧本解析失败','low-pairing':'配对率低','not-japanese':'不是日文剧本','no-script':'没找到剧本',timeout:'读取超时',cancelled:'已停下'},error:'检查没能开始'},
 ja:{button:'ローカル検査',kicker:'対応チェック',title:'ライブラリの対応状況を検査',hint:'このPCで各ゲームのアーカイブとスクリプトを読み、読めるか・行数・対応率だけを数えます。ゲームの文章はこのPCから出ません',scanning:'検査中',of:'/',stop:'いったん止める（次回続きから）',close:'閉じる',
  done:'検査完了',allGood:'すべてのゲームを正常に読めました。アップロードするものはありません',found:n=>`${n} 本のゲームを完全には読めませんでした。アップロードされるのは以下がすべてです：構造と統計のみ。日本語・中国語などの文字はこのPCでプレースホルダーに置き換え、一文字ずつ確認済みです`,
  autoSending:'匿名化した構造をバックグラウンドで送信中…',autoNote:'読めないゲームの匿名化した構造（文章なし）はバックグラウンドで自動送信します。サーバーにあるゲームは送りません。設定 → ライブラリでオフにできます',sentRecord:'送信した内容（記録）',
  outcome:{sent:'送信しました',duplicate:'サーバーにあるため送信しません',known:'サーバーにあるため送信しません',nothing:'送るものはありません',failed:'送信失敗。後で自動的に再試行します',offline:'サーバーに接続できません。後で自動的に再試行します',skipped:'送信済み',busy:'バックグラウンドで送信中です',off:'自動送信はオフです'},
  preparing:'このPCで匿名化した構造を作成中…',upload:'確認してアップロード',uploading:'アップロード中…',uploaded:'アップロードしました。対応できたら自動で届きます（アプリの更新は不要）',failed:'アップロードに失敗しました。後でもう一度お試しください',manual:'アップロード先に接続できません。後でもう一度お試しください',
  followUp:'作者が必要とした時、これらのゲームの匿名化した構造を自動で追加送信する（構造と統計のみ。設定でいつでもオフにできます）',openIssue:'報告を見る',sentTotal:'実際の送信量',limit:l=>`上限 ${l}`,raw:'元のサイズ',parts:c=>`${c} 回に分けて送信`,rawHint:'匿名化してから圧縮します。送信されるのは圧縮後のサイズで、元のサイズは参考です',limits:'1 ゲームにつきサンプル最大 8 個、各圧縮後 2 MB まで。スクリプトは丸ごと（16 MB まで）、アーカイブは丸ごとか先頭と末尾 8 MB ずつ。このPCでは 1 ゲームにつき最大 64 MB・80 秒だけ読みます',dropped:'確認に通らなかったため送信しません',keys:n=>`復号パラメータ候補 ${n} 件`,result:'読み取り統計',sample:'匿名化した構造サンプル',cancelled:'止めました。次回開くと続きから検査します',
  steps:{ok:'正常','unknown-pack':'未知のアーカイブ形式','decrypt-failed':'復号失敗','parse-failed':'スクリプト解析失敗','low-pairing':'対応率が低い','not-japanese':'日本語スクリプトではない','no-script':'スクリプトなし',timeout:'タイムアウト',cancelled:'停止'},error:'検査を開始できませんでした'},
 en:{button:'Local check',kicker:'Adaptation check',title:'Check how well each game reads',hint:'Reads every game\'s archives and scripts on this PC and only counts whether they read, how many lines and how well they pair. No game text leaves this PC',scanning:'Checking',of:'/',stop:'Stop for now (resume next time)',close:'Close',
  done:'Check finished',allGood:'Every game reads fine; there is nothing to upload',found:n=>`${n} game(s) did not read perfectly. This is everything that would be uploaded: structure and counts only. Every Japanese, Chinese or other character was replaced on this PC and checked one by one`,
  autoSending:'Uploading the desensitized structure in the background…',autoNote:'Games that do not read are uploaded in the background as desensitized structure (no text); games the server already has are not sent again. Turn it off in Settings → Library',sentRecord:'What was sent (record)',
  outcome:{sent:'Uploaded',duplicate:'The server has it already; not sent again',known:'The server has it already; not sent again',nothing:'Nothing to upload',failed:'Upload failed; retried later automatically',offline:'Server not reachable; retried later automatically',skipped:'Uploaded before',busy:'Uploading in the background',off:'Automatic upload is off'},
  preparing:'Building the desensitized structure on this PC…',upload:'Upload',uploading:'Uploading…',uploaded:'Uploaded, thank you! The fix will reach you automatically, no app update needed',failed:'Upload failed; try again later',manual:'The upload server cannot be reached; try again later',
  followUp:'When the author needs more, send these games\' desensitized structure again automatically (structure and counts only; can be turned off any time)',openIssue:'View report',sentTotal:'Actually sent',limit:l=>`limit ${l}`,raw:'raw',parts:c=>`sent in ${c} part(s)`,rawHint:'Desensitized, then compressed: what is sent is the compressed size; the raw size is for reference',limits:'Up to 8 samples per game, each at most 2 MB compressed; whole scripts (up to 16 MB), whole archives or their first and last 8 MB; this PC reads at most 64 MB / 80 s per game',dropped:'did not pass the check; not uploaded',keys:n=>`${n} decrypt parameter candidate(s)`,result:'Read statistics',sample:'Desensitized structure sample',cancelled:'Stopped; it resumes the next time',
  steps:{ok:'OK','unknown-pack':'Unknown archive format','decrypt-failed':'Decryption failed','parse-failed':'Script parsing failed','low-pairing':'Low pairing rate','not-japanese':'Not a Japanese script','no-script':'No script found',timeout:'Timed out',cancelled:'Stopped'},error:'The check could not start'}};
const words=locale=>T[locale]||T.en;
export const probeLabel=locale=>words(locale).button;
export const stepLabel=(step,locale)=>words(locale).steps[step]||step||'';
const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
/* E599 samples go up desensitized and gzip-compressed. Each item: what it adds to the upload (bytes in the bundle) first,
   the raw desensitized size after it as context. Total: the bundle size against the relay cap (prep.limit, 8 MB), then
   the raw size the bundle stands for. */
const BUNDLE_LIMIT=8<<20;
const rawOf=i=>Number(i.raw)>0?Number(i.raw):Number(i.bytes)||0;
function sizes(i,t){const sent=Number(i.bytes)||0,raw=Number(i.raw)||0;
 return `<em class="probe-size" title="${t.rawHint}"><b>${size(sent)}</b>${raw>sent?`<small>${t.raw} ${size(raw)}</small>`:''}</em>`;}
export function bundleSizes(prep){const items=(prep?.manifest||[]).flatMap(g=>g.items||[]),sent=Number(prep?.bytes)||0;
 const raw=Math.max(sent,sent+items.reduce((n,i)=>n+(Number(i.raw)>0?rawOf(i)-(Number(i.bytes)||0):0),0));
 return {sent,raw,limit:Number(prep?.limit)>0?Number(prep.limit):BUNDLE_LIMIT,chunks:Number(prep?.chunks)||0};}
function totals(prep,t,esc){const z=bundleSizes(prep),pct=Math.min(100,Math.round(z.sent/z.limit*100));
 return `<div class="probe-total"><p><span>${esc(t.sentTotal)}</span><b>${size(z.sent)}</b><small>${esc(t.limit(size(z.limit)))}</small></p><div class="probe-cap" aria-hidden="true"><i style="width:${pct}%"></i></div><p class="probe-total-sub">${esc(t.raw)} ${size(z.raw)} · ${esc(t.parts(z.chunks))}</p><p class="probe-total-sub">${esc(t.limits)}</p></div>`;}
const STYLE='dialog.probe-dialog .probe-bar{height:6px;border-radius:3px;background:rgba(255,236,214,.08);overflow:hidden;margin:10px 0 6px}dialog.probe-dialog .probe-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#c8303c,#e9b97a);transition:width .3s ease}dialog.probe-dialog .probe-now{font-size:12px;color:#bfae9f;min-height:1.4em}dialog.probe-dialog .probe-game{margin:10px 0 0;font-size:13px}dialog.probe-dialog .probe-game b{font-weight:600}dialog.probe-dialog .probe-game span{margin-left:8px;color:#e9d3a6;font-size:12px}dialog.probe-dialog .diag-entries{max-height:42vh;overflow:auto}dialog.probe-dialog .probe-record{margin:6px 0 0;font-size:12px}dialog.probe-dialog .probe-record summary{cursor:pointer;color:#bfae9f}dialog.probe-dialog .probe-game span+span{color:#bfae9f}dialog.probe-dialog .probe-follow{display:flex;gap:8px;align-items:flex-start;margin:12px 0 0;font-size:12px;color:#bfae9f;line-height:1.5}dialog.probe-dialog .diag-entries em.probe-size{text-align:right;line-height:1.3}dialog.probe-dialog .diag-entries em.probe-size b{font-weight:600;color:#f1e4d8}dialog.probe-dialog .diag-entries em.probe-size small{display:block;font-size:11px;color:#8f7f73}dialog.probe-dialog .probe-total{margin:12px 0 0;padding:10px 14px;border-radius:12px;border:1px solid rgba(255,236,214,.08);background:rgba(0,0,0,.2)}dialog.probe-dialog .probe-total p{margin:0;display:flex;align-items:baseline;gap:10px;font-variant-numeric:tabular-nums}dialog.probe-dialog .probe-total p span{font-size:12px;color:#bfae9f}dialog.probe-dialog .probe-total p b{font-size:20px;font-weight:600;color:#f1e4d8}dialog.probe-dialog .probe-total p small{font-size:12px;color:#a8978a}dialog.probe-dialog .probe-cap{height:4px;border-radius:2px;background:rgba(255,236,214,.08);overflow:hidden;margin:8px 0 6px}dialog.probe-dialog .probe-cap i{display:block;height:100%;background:linear-gradient(90deg,#c8303c,#e9b97a)}dialog.probe-dialog .probe-total .probe-total-sub{display:block;font-size:11.5px;color:#a8978a;line-height:1.5}:root[data-theme=light] dialog.probe-dialog .probe-total{background:rgba(255,255,255,.6);border-color:rgba(120,60,50,.15)}:root[data-theme=light] dialog.probe-dialog :is(.probe-total p b,.diag-entries em.probe-size b){color:#2a1e1a}:root[data-theme=light] dialog.probe-dialog :is(.probe-total p span,.probe-total p small,.probe-total .probe-total-sub,.diag-entries em.probe-size small){color:#6e4f47}@media (prefers-reduced-motion:reduce){dialog.probe-dialog .probe-bar i{transition:none}}';
function style(){if(document.getElementById('adapter-probe-style'))return;const s=document.createElement('style');s.id='adapter-probe-style';s.textContent=STYLE;document.head.append(s);}

export function adapterProbe(api){return {
 start:(o={})=>api('adapter_probe_start',o),status:()=>api('adapter_probe_status',{}),cancel:()=>api('adapter_probe_cancel',{}),results:()=>api('adapter_probe_results',{}),
 prepare:(ids)=>api('adapter_upload_prepare',ids?{ids}:{}),manifest:hash=>api('adapter_upload_manifest',{hash}),upload:(hash,followUp)=>api('adapter_upload',{hash,followUp:!!followUp}),
 autoStatus:()=>api('adapter_auto_status',{}),autoRun:ids=>api('adapter_auto_run',ids?{ids}:{}),
 packs:()=>api('adapter_packs_status',{}),sync:()=>api('adapter_packs_sync',{}),rollback:id=>api('adapter_pack_rollback',{id}),revoke:()=>api('adapter_consent_revoke',{})};}

export async function openProbeUpload({api,locale,esc,toast,ids=null,reason='manual',onDone=null}){
 const done=state=>{try{onDone?.(state);}catch{}};
 style();const t=words(locale),p=adapterProbe(api),dialog=document.createElement('dialog');dialog.className='game-dialog diag-dialog probe-dialog';
 dialog.innerHTML=`<div class="game-dialog-head"><span class="game-dialog-kicker">${esc(t.kicker)}</span><h2>${esc(t.title)}</h2><p>${esc(t.hint)}</p></div>
<div class="diag-body"><div class="probe-bar" aria-hidden="true"><i></i></div><p class="probe-now" role="status" aria-live="polite"></p><div class="probe-out"></div><p class="diag-status" role="status" aria-live="polite"></p></div>
<div class="dialog-actions"><button class="text-button" data-close>${esc(t.close)}</button><button class="secondary" data-stop>${esc(t.stop)}</button><button class="primary" data-upload hidden>${esc(t.upload)}</button></div>`;
 document.body.append(dialog);let timer=null;dialog.addEventListener('close',()=>{clearInterval(timer);dialog.remove();},{once:true});dialog.showModal();
 const bar=dialog.querySelector('.probe-bar i'),now=dialog.querySelector('.probe-now'),out=dialog.querySelector('.probe-out'),status=dialog.querySelector('.diag-status'),stop=dialog.querySelector('[data-stop]'),send=dialog.querySelector('[data-upload]');
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 stop.onclick=async()=>{clearInterval(timer);try{await p.cancel();}catch{}now.textContent=t.cancelled;stop.hidden=true;};
 try{await p.start({ids,reason,force:!!ids});}catch{now.textContent=t.error;stop.hidden=true;return;}
 const tick=async()=>{let s;try{s=await p.status();}catch{return;}if(!dialog.isConnected)return;
  const pct=s.total?Math.round(s.done/s.total*100):100;bar.style.width=pct+'%';
  if(s.state==='running'){now.textContent=`${t.scanning} ${s.done}${t.of}${s.total}${s.current?.title?' · '+s.current.title:''}`;return;}
  clearInterval(timer);stop.hidden=true;bar.style.width='100%';
  if(s.state==='cancelled'){now.textContent=t.cancelled;done({state:'cancelled'});return;}
  done({state:'checked',problems:(s.problems||[]).length});
  const problems=(s.problems||[]).filter(x=>!ids||ids.includes(x.id));
  if(!problems.length){now.textContent=t.done+' · '+t.allGood;showRecord();return;}
  let auto=null;try{auto=await p.autoStatus();}catch{}if(!dialog.isConnected)return;
  if(auto?.enabled){now.textContent=t.autoSending;let r;try{r=await p.autoRun(problems.map(x=>x.id));}catch{r={state:'failed',results:{}};}if(!dialog.isConnected)return;
   const res=r?.results||{},lines=problems.map(x=>`<p class="probe-game"><b>${esc(x.title||x.id)}</b><span>${esc(stepLabel(x.step,locale))}</span><span>${esc(t.outcome[res[x.id]||r?.state]||'')}</span></p>`).join('');
   now.textContent=t.done;out.innerHTML=lines+`<p class="probe-now">${esc(t.autoNote)}</p>`;if(Object.values(res).includes('sent'))done({state:'uploaded'});showRecord();return;}
  now.textContent=t.preparing;let prep;try{prep=await p.prepare(problems.map(x=>x.id));}catch{prep={error:'PREPARE'};}if(!dialog.isConnected)return;
  if(!prep?.hash){now.textContent=prep?.empty?t.done+' · '+t.allGood:t.failed;return;}
  now.textContent=t.found(prep.games);showManifest(prep);};
 const items=prep=>prep.manifest.map(g=>`<p class="probe-game"><b>${esc(g.title||g.key)}</b><span>${esc(stepLabel(g.step,locale))}</span></p><ul class="diag-entries">${g.items.map(i=>
   i.kind==='result'?`<li><code>${esc(t.result)}</code><span></span><em>${size(i.bytes)}</em></li>`:i.kind==='keys'?`<li><code>${esc(t.keys(i.count))}</code><span>${esc(i.algos.join(', '))}</span><em></em></li>`:
   i.kind==='dropped'?`<li><code title="${esc(i.name)}">${esc(i.name)}</code><span>${esc(t.dropped)}</span><em>0 B</em></li>`:`<li><code title="${esc(i.name)}">${esc(i.name)}</code><span>${esc(t.sample)}</span>${sizes(i,t)}</li>`).join('')}</ul>`).join('');
 /* the record: every bundle the automatic upload sent, each with its manifest (from the outbox) */
 const showRecord=async()=>{let st;try{st=await p.autoStatus();}catch{return;}const sent=(st?.log||[]).filter(e=>e.state==='sent'&&e.hash).slice(0,10);if(!sent.length||!dialog.isConnected)return;
  const parts=[];for(const e of sent){let m=null;try{m=await p.manifest(e.hash);}catch{}if(m?.manifest)parts.push(`<details class="probe-record"><summary>${esc(e.title||'')} · ${size(Number(m.bytes)||0)} · ${esc(new Date(e.at).toLocaleString())}</summary>${items(m)}</details>`);}
  if(parts.length&&dialog.isConnected)out.insertAdjacentHTML('beforeend',`<p class="probe-game"><b>${esc(t.sentRecord)}</b></p>`+parts.join(''));};
 const showManifest=prep=>{
  out.innerHTML=items(prep)+
   totals(prep,t,esc)+`<p class="probe-now">sha256 ${esc(prep.hash.slice(0,12))}</p><label class="probe-follow"><input type="checkbox" data-follow>${esc(t.followUp)}</label>`;
  out.insertAdjacentHTML('afterbegin',`<p class="probe-now">${esc(t.autoNote)}</p>`);
  send.hidden=false;send.onclick=async()=>{send.disabled=true;send.textContent=t.uploading;status.textContent='';let r;try{r=await p.upload(prep.hash,dialog.querySelector('[data-follow]')?.checked);}catch{r={state:'failed'};}
   if(!dialog.isConnected)return;send.textContent=t.upload;
   if(r.state==='uploaded'){done({state:'uploaded'});status.dataset.state='ok';status.textContent=t.uploaded;send.hidden=true;toast?.(t.uploaded);
    if(r.issueUrl){const b=document.createElement('button');b.type='button';b.className='text-button diag-link';b.textContent=t.openIssue;b.onclick=()=>api('open_source',{url:r.issueUrl}).catch(()=>{});status.append(' ',b);}return;}
   send.disabled=false;status.dataset.state=r.state==='not-configured'?'manual':'bad';status.textContent=r.state==='not-configured'?t.manual:t.failed;};};
 timer=setInterval(tick,900);tick();
 return dialog;}

/* the 适配总览 button: placed once per dialog, opens the check for the whole library */
export function mountProbeHook(dialog,{api,locale,esc,toast}){if(!dialog||dialog.querySelector('[data-adapter-probe]'))return null;
 const b=document.createElement('button');b.type='button';b.className='secondary adapt-probe';b.dataset.adapterProbe='';b.textContent=words(locale).button;b.title=words(locale).hint;
 b.onclick=()=>openProbeUpload({api,locale,esc,toast,reason:'overview'});
 (dialog.querySelector('.adapt-tools')||dialog.querySelector('.game-dialog-head,header')||dialog).append(b);return b;}

/* ---- per-row API for the 适配总览 dialog (that session owns the look; this module owns the words about uploads) ----
   rowStatus(row,locale) → {kind,label,tone,detail} | null   from the row fields adaptation_overview already returns:
     row.probe   {step,detail,engine,lines,japaneseLines,pairing,at} | null    (last local check)
     row.adapter {tag:'<pack id>@<version>',state:'kept'|'rolled-back'|'not-used'} | null   (adapter pack in use)
   kind: 'adapted' (a pack reads it) | 'ok' | 'problem' | 'rolled-back' | 'unchecked'; tone: ok | part | bad | wait (same scale
   as the dialog's pills).
   openProbeUpload(...,onDone)             onDone({state:'checked'|'cancelled'|'uploaded'}) — refresh the overview rows
   checkGame({api,locale,esc,toast,id})    per-row "scan this game": opens the check dialog for that game only; the upload
                                           is the automatic one (or, with it off, the confirm-first manifest)
   uploadCopy(locale)                      {short,long} what gets uploaded, for a tooltip / footnote */
const ROW={zh:{adapted:'适配包已生效',ok:'本地检查正常','rolled-back':'适配包已回退',unchecked:'未检查',scan:'检查此游戏',
  copyShort:'只上传结构和统计，不上传游戏文本',copyLong:'检查在本机进行。读不出的游戏会在后台自动上传：读取统计、封包结构样本（所有文字已在本机换成占位符并逐字校验）、解密参数候选；服务器已有的游戏不再上传。游戏文本、存档、路径和用户名都不会离开这台电脑。可在 设置 → 游戏库 关闭'},
 ja:{adapted:'適応パック適用中',ok:'ローカル検査は正常','rolled-back':'適応パックを戻しました',unchecked:'未検査',scan:'このゲームを検査',
  copyShort:'送るのは構造と統計だけ。ゲームの文章は送りません',copyLong:'検査はこのPCで行います。読めないゲームはバックグラウンドで自動送信します：読み取り統計、アーカイブ構造のサンプル（文字はすべてこのPCでプレースホルダーに置き換え、一文字ずつ確認済み）、復号パラメータ候補。サーバーにあるゲームは送りません。ゲームの文章・セーブ・パス・ユーザー名はこのPCから出ません。設定 → ライブラリでオフにできます'},
 en:{adapted:'Adapter pack active',ok:'Local check OK','rolled-back':'Adapter pack rolled back',unchecked:'Not checked',scan:'Check this game',
  copyShort:'Only structure and counts are uploaded, never game text',copyLong:'The check runs on this PC. Games that do not read are uploaded in the background: read statistics, archive structure samples (every character replaced with a placeholder on this PC and checked one by one) and decrypt parameter candidates; games the server already has are not sent again. Game text, saves, paths and user names never leave this PC. Turn it off in Settings → Library'}};
const row=locale=>ROW[locale]||ROW.en;
export function rowStatus(r,locale){if(!r)return null;const w=row(locale);
 if(r.adapter?.state==='kept')return {kind:'adapted',label:w.adapted,tone:'ok',detail:r.adapter.tag};
 if(r.adapter?.state==='rolled-back')return {kind:'rolled-back',label:w['rolled-back'],tone:'part',detail:r.adapter.tag};
 if(!r.probe)return {kind:'unchecked',label:w.unchecked,tone:'wait',detail:''};
 if(r.probe.step==='ok')return {kind:'ok',label:w.ok,tone:'ok',detail:r.probe.engine||''};
 if(r.probe.step==='no-script')return {kind:'problem',label:stepLabel('no-script',locale),tone:'wait',detail:''};
 return {kind:'problem',label:stepLabel(r.probe.step,locale),tone:r.probe.step==='low-pairing'?'part':'bad',detail:r.probe.detail||''};}
export const checkGame=({api,locale,esc,toast,id})=>openProbeUpload({api,locale,esc,toast,ids:[String(id)],reason:'overview-row'});
export const scanLabel=locale=>row(locale).scan;
export const uploadCopy=locale=>({short:row(locale).copyShort,long:row(locale).copyLong});
