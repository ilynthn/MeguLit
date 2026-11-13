// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 Chinese-build guide: a big card at the top of the game page when the game is a 汉化 / 中文 build. The checks
   run in services/cn-version-guide.cjs; this shows what they found, with the one-click fixes the existing code can do. */
import {launchReason} from './launch-feedback.js';
const SET={zh:'在游戏「设置 / 选项」里找「语言」或「文本语言」，切成日语（分主要 / 次要语言时，把「主要」设成日语）',en:'In the game\'s Settings / Options, find Language or Text language and choose Japanese (when there is a main and a sub language, set the main one to Japanese)',ja:'ゲームの「設定 / オプション」で「言語」または「テキスト言語」を日本語にしてください（主 / 副の言語がある場合は「主」を日本語に）'};
const W={
 zh:{eyebrow:'汉化版向导',title:'这是汉化版：先换回日文原版，MeguLit 才能读日文',sub:'MeguLit 读的是游戏的日文原文，汉化组的译文之后会自动配上。下面是自动检查的结果，按顺序看就行',
  s1:'游戏自己能不能切成日文',s2:'本机的日文原版资源',s3:'网上的日文化补丁',s4:'去找日文原版',none1:'没发现游戏自带的语言切换',none2:'本机没找到日文原版或备份',
  recheck:'重新检查',fold:'收起',copy:'复制',copied:'已复制',open:'打开',unfold:'展开',language:'日文原版与语言环境',reveal:'显示位置',swap:'切换到日文版',restore:'恢复日文',exe:'改用日文程序启动',nearbyBtn:'改用这份日文原版',working:'处理中…',done:'已换成日文原版',failed:'没能完成，请看上面的说明',checking:'正在检查这部作品…',
  'config-key':x=>'配置文件 '+x.rel+' 里有语言设置 '+x.key+' = '+x.value+(x.japanese?'，已经是日语':'：关掉游戏后把它改成日语（常见写法 ja / jp / japanese），改之前先复制一份备份'),
  'lang-folder':x=>'游戏带日文资源文件夹 '+x.rel+(x.multi?'，还有其他语言的文件夹，是多语言版：'+SET.zh:'：先在游戏设置里找语言选项；找不到就点下面「本机的日文原版资源」里的修复'),
  'lang-archive':x=>'游戏带日文数据文件 '+x.rel+'：'+SET.zh,
  'config-tool':x=>'游戏带设置程序 '+x.rel+'：打开它看看有没有「语言 / Language」选项，选日本語',
  steam:(x,o)=>o.steamJapanese===true?'Steam 商店页写着这部作品支持日语：在 Steam 库里右键这部作品 → 属性 → 语言，选「日本語」，等 Steam 更新完再启动'+(x.current?'（现在是 '+x.current+'）':''):o.steamJapanese===false?'Steam 商店页没有列出日语，Steam 里切换不了':'这是 Steam 版：在 Steam 库里右键这部作品 → 属性 → 语言，看看有没有「日本語」',
  multi:t=>'VNDB 记录这部作品有同时带日文和中文的官方版本（'+t+'）：'+SET.zh+'；Steam 版也可以在 属性 → 语言 里换',
  swapT:x=>'游戏文件夹里留着汉化前的日文原文件'+(x.rel?'（'+x.rel+'）':'')+'。点「切换到日文版」，日文文件会换回来，汉化文件留作备份，随时能切回',
  restoreT:x=>'游戏本身还带着日文数据（'+x.files+' 个文件）。点「恢复日文」，先备份再换回日文，可以随时还原',
  'japanese-exe':x=>'找到日文原版程序 '+x.rel+'。点「改用日文程序启动」就行',
  'japanese-exe-blocked':x=>'找到日文原版程序 '+x.rel+'，但汉化补丁还装在游戏里，直接用它启动会乱码或打不开。先卸载汉化补丁'+(x.reveal?'（下面的卸载程序）':'（用汉化补丁自带的卸载 / 还原功能）')+'，再回来点「重新检查」',
  uninstaller:x=>'找到汉化补丁的卸载程序 '+x.rel+'：运行它卸载汉化补丁，游戏就变回日文原版；卸完回来点「重新检查」',
  'backup-files':x=>'找到 '+x.count+' 个汉化补丁替换前留下的原文件备份（如 '+x.sample.join('、')+'）：把它们改回原名（去掉 .bak 这类后缀）就能恢复日文，改之前先备份当前文件',
  'backup-folder':x=>'找到备份文件夹 '+x.rel+'（'+x.count+' 个程序 / 数据文件），里面可能是汉化前的日文原文件',
  package:x=>'找到可能是日文原版的压缩包 '+x.rel+'：解压后到「工具 → 日文原版恢复 → 从日文原版导入」选它，或装好后点「日文原版与语言环境」选它的程序',
  nearby:x=>'旁边的文件夹里像是这部作品的日文原版：'+x.rel+'。点「改用这份日文原版」，以后从它启动，汉化组的译文仍会自动配上',
  pending:'正在网上查这部作品的日文化补丁…',off:'联网服务已关闭，跳过网上检查',noId:'还没识别出这部作品（没有 VNDB / Steam 编号），跳过网上检查；在「编辑作品」里补上 VNDB 编号后就能查',netFail:'网上检查暂时没连上，之后会自动再试',netNone:'网上没查到日文化补丁',
  patch:p=>'网上有这部作品的日文化补丁：「'+p.title+'」'+(p.fromEnglish?'。这类补丁通常是给英文版用的：如果你的汉化版是在英文版（比如 Steam 国际版）上做的，先装回英文版、打上这个日文补丁，再到「工具 → 日文原版恢复 → 从日文原版导入」选它':''),
  sitesLead:'本机和网上都没找到能直接用的日文资源。可以到下面这些地方搜索这部作品的日文原版（生肉），装好后点「日文原版与语言环境」选它的程序：',sitesEmpty:'本机和网上都没找到能直接用的日文资源。可以到常用的游戏资源站搜索这部作品的日文原名（生肉），装好后点「日文原版与语言环境」选它的程序'},
 en:{eyebrow:'Chinese build guide',title:'This is a Chinese build: switch back to the Japanese original so MeguLit can read Japanese',sub:'MeguLit reads the game\'s Japanese text; the group\'s translation is paired in afterwards. These are the results of the automatic checks, in order',
  s1:'Can the game switch to Japanese itself',s2:'Japanese originals on this PC',s3:'Japanese patches online',s4:'Find the Japanese original',none1:'No built-in language switch found',none2:'No Japanese original or backup found on this PC',
  recheck:'Check again',fold:'Collapse',copy:'Copy',copied:'Copied',open:'Open',unfold:'Expand',language:'Japanese version & locale',reveal:'Show in folder',swap:'Switch to Japanese',restore:'Restore Japanese',exe:'Start the Japanese program',nearbyBtn:'Use this Japanese copy',working:'Working…',done:'Switched to the Japanese original',failed:'Could not finish; see the notes above',checking:'Checking this game…',
  'config-key':x=>'The config file '+x.rel+' has a language setting '+x.key+' = '+x.value+(x.japanese?', already Japanese':': with the game closed, set it to Japanese (usually ja / jp / japanese); copy the file first'),
  'lang-folder':x=>'The game has a Japanese folder '+x.rel+(x.multi?' next to other languages, so it is multilingual: '+SET.en:': look for a language option in the game settings first; if there is none, use the fix under Japanese originals on this PC'),
  'lang-archive':x=>'The game has Japanese data '+x.rel+': '+SET.en,
  'config-tool':x=>'The game has a settings program '+x.rel+': open it and look for a Language option',
  steam:(x,o)=>o.steamJapanese===true?'The Steam store lists Japanese: in your Steam library, right-click the game → Properties → Language, choose Japanese and let Steam update'+(x.current?' (now '+x.current+')':''):o.steamJapanese===false?'The Steam store does not list Japanese, so Steam cannot switch it':'Steam build: right-click the game in your Steam library → Properties → Language and look for Japanese',
  multi:t=>'VNDB lists an official release with both Japanese and Chinese ('+t+'): '+SET.en+'; on Steam, Properties → Language also works',
  swapT:x=>'The original Japanese files are kept in the game folder'+(x.rel?' ('+x.rel+')':'')+'. Switch to Japanese puts them back and keeps the patch as a backup; you can switch back any time',
  restoreT:x=>'The game still ships its Japanese data ('+x.files+' files). Restore Japanese backs up first and can be undone',
  'japanese-exe':x=>'Found the Japanese program '+x.rel+'. Choose Start the Japanese program',
  'japanese-exe-blocked':x=>'Found the Japanese program '+x.rel+', but the Chinese patch is still installed, so it would show garbled text or not start. Uninstall the patch first'+(x.reveal?' (uninstaller below)':' (with its own uninstall / restore option)')+', then choose Check again',
  uninstaller:x=>'Found the Chinese patch\'s uninstaller '+x.rel+': run it to turn the game back into the Japanese original, then choose Check again',
  'backup-files':x=>'Found '+x.count+' original files the patch backed up (such as '+x.sample.join(', ')+'): renaming them back (drop the .bak-style suffix) restores Japanese; back up the current files first',
  'backup-folder':x=>'Found a backup folder '+x.rel+' ('+x.count+' program / data files); it may hold the Japanese files from before the patch',
  package:x=>'Found an archive that may be the Japanese original: '+x.rel+'. Extract it and pick it under Tools → Restore Japanese original → Import, or install it and pick its program under Japanese version & locale',
  nearby:x=>'A nearby folder looks like the Japanese original of this game: '+x.rel+'. Use this Japanese copy starts it from there; the group\'s translation is still paired in',
  pending:'Looking online for a Japanese patch…',off:'Online services are off; the online check was skipped',noId:'This game is not identified yet (no VNDB / Steam id); add its VNDB id under Edit game to check online',netFail:'The online check could not connect; it retries later',netNone:'No Japanese patch found online',
  patch:p=>'A Japanese patch for this game circulates online: "'+p.title+'"'+(p.fromEnglish?'. Such patches are usually for the English release: if your Chinese build was made on the English (Steam) release, reinstall the English release, apply the Japanese patch, then pick it under Tools → Restore Japanese original → Import':''),
  sitesLead:'No usable Japanese resource was found on this PC or online. Search for the Japanese original of this game here, install it and pick its program under Japanese version & locale:',sitesEmpty:'No usable Japanese resource was found on this PC or online. Search the usual game sites for the Japanese title, install it and pick its program under Japanese version & locale'},
 ja:{eyebrow:'中国語版ガイド',title:'中国語版です。日本語版に戻すと MeguLit が日本語を読めます',sub:'MeguLit はゲームの日本語原文を読み、翻訳はあとから自動で組み合わせます。自動チェックの結果を順に確認してください',
  s1:'ゲーム自体で日本語に切り替えられるか',s2:'この PC にある日本語版の資源',s3:'ネット上の日本語化パッチ',s4:'日本語版を探す',none1:'ゲーム内の言語切替は見つかりませんでした',none2:'この PC に日本語版やバックアップは見つかりませんでした',
  recheck:'再確認',fold:'たたむ',copy:'コピー',copied:'コピーしました',open:'開く',unfold:'開く',language:'日本語版と言語環境',reveal:'場所を表示',swap:'日本語版に切り替え',restore:'日本語に戻す',exe:'日本語版で起動する',nearbyBtn:'この日本語版を使う',working:'処理中…',done:'日本語版に切り替えました',failed:'完了できませんでした。上の説明を確認してください',checking:'この作品を確認しています…',
  'config-key':x=>'設定ファイル '+x.rel+' に言語設定 '+x.key+' = '+x.value+' があります'+(x.japanese?'（すでに日本語）':'。ゲームを閉じて日本語（ja / jp / japanese など）に変えてください。先にコピーを取ってください'),
  'lang-folder':x=>'日本語のフォルダ '+x.rel+' があります'+(x.multi?'。他の言語もある多言語版です：'+SET.ja:'。まずゲームの設定で言語を探し、なければ 「この PC にある日本語版の資源」の修正を使ってください'),
  'lang-archive':x=>'日本語データ '+x.rel+' があります：'+SET.ja,
  'config-tool':x=>'設定プログラム '+x.rel+' があります。「言語 / Language」の項目がないか確認してください',
  steam:(x,o)=>o.steamJapanese===true?'Steam ストアに日本語対応とあります：Steam ライブラリで右クリック → プロパティ → 言語 で「日本語」を選び、更新を待ってください'+(x.current?'（現在 '+x.current+'）':''):o.steamJapanese===false?'Steam ストアに日本語の記載はなく、Steam では切り替えられません':'Steam 版です：ライブラリで右クリック → プロパティ → 言語 に「日本語」がないか確認してください',
  multi:t=>'VNDB に日本語と中国語の両方を含む公式版があります（'+t+'）：'+SET.ja+'。Steam 版はプロパティ → 言語 でも変えられます',
  swapT:x=>'ゲームフォルダにパッチ前の日本語ファイルが残っています'+(x.rel?'（'+x.rel+'）':'')+'。「日本語版に切り替え」で戻し、パッチはバックアップとして残ります',
  restoreT:x=>'ゲームに日本語データが残っています（'+x.files+' ファイル）。「日本語に戻す」はバックアップしてから戻し、元に戻せます',
  'japanese-exe':x=>'日本語版の実行ファイル '+x.rel+' が見つかりました。「日本語版で起動する」を押してください',
  'japanese-exe-blocked':x=>'日本語版の実行ファイル '+x.rel+' がありますが、中国語パッチが入ったままのため文字化けするか起動しません。先にパッチをアンインストールし'+(x.reveal?'（下のアンインストーラー）':'')+'、「再確認」を押してください',
  uninstaller:x=>'中国語パッチのアンインストーラー '+x.rel+' があります。実行すると日本語版に戻ります。終わったら「再確認」を押してください',
  'backup-files':x=>'パッチが置き換える前のファイル '+x.count+' 個が残っています（'+x.sample.join('、')+' など）。元の名前に戻すと日本語になります。先に現在のファイルをコピーしてください',
  'backup-folder':x=>'バックアップフォルダ '+x.rel+'（'+x.count+' ファイル）があります。パッチ前の日本語ファイルかもしれません',
  package:x=>'日本語版らしい圧縮ファイル '+x.rel+' があります。展開して「ツール → 日本語原版に戻す → 日本語版から取り込む」で選ぶか、インストールして「日本語版と言語環境」で実行ファイルを選んでください',
  nearby:x=>'近くのフォルダがこの作品の日本語版のようです：'+x.rel+'。「この日本語版を使う」でそこから起動し、翻訳は引き続き自動で組み合わせます',
  pending:'ネットで日本語化パッチを確認しています…',off:'オンラインサービスがオフのため、ネットの確認は省略しました',noId:'作品がまだ特定されていません（VNDB / Steam ID なし）。「作品を編集」で VNDB ID を入れると確認できます',netFail:'ネットの確認に接続できませんでした。あとで再試行します',netNone:'日本語化パッチは見つかりませんでした',
  patch:p=>'この作品の日本語化パッチが出回っています：「'+p.title+'」'+(p.fromEnglish?'。多くは英語版向けです。中国語版が英語版（Steam 版など）ベースなら、英語版に戻してこのパッチを当て、「ツール → 日本語原版に戻す → 日本語版から取り込む」で選んでください':''),
  sitesLead:'この PC にもネットにもすぐ使える日本語の資源がありません。次の場所でこの作品の日本語版を探し、インストールしたら「日本語版と言語環境」で実行ファイルを選んでください：',sitesEmpty:'この PC にもネットにもすぐ使える日本語の資源がありません。いつものゲームサイトで日本語タイトルを探し、インストールしたら「日本語版と言語環境」で実行ファイルを選んでください'}};
const FIX_LABEL={swap:'swap',restore:'restore',exe:'exe',reveal:'reveal'};
export function guideItems(g,locale){
 const w=W[locale]||W.zh,o=g.online||{},switchItems=[],restoreItems=[],onlineItems=[];
 for(const x of g.switch||[]){if(x.kind==='steam'){switchItems.push({text:w.steam(x,o),strong:o.steamJapanese===true,muted:o.steamJapanese===false});continue;}if(w[x.kind])switchItems.push({text:w[x.kind](x),strong:x.kind!=='config-tool',fix:'reveal',path:x.path});}
 for(const t of o.multi||[])switchItems.unshift({text:w.multi(t),strong:true});
 for(const x of g.restore||[]){
  if(x.kind==='swap')restoreItems.push({text:w.swapT(x),strong:true,fix:'swap'});
  else if(x.kind==='restore')restoreItems.push({text:w.restoreT(x),strong:true,fix:'restore'});
  else if(x.kind==='japanese-exe-blocked')restoreItems.push({text:w[x.kind](x),strong:true,fix:x.reveal?'reveal':'',path:x.reveal});
  else if(w[x.kind])restoreItems.push({text:w[x.kind](x),strong:x.kind==='japanese-exe'||x.kind==='nearby'||x.kind==='uninstaller',fix:x.fix,path:x.path,label:x.kind==='nearby'?w.nearbyBtn:''});}
 if(o.state==='pending')onlineItems.push({text:w.pending,muted:true,pending:true});
 else if(o.state==='off')onlineItems.push({text:w.off,muted:true});
 else if(o.state==='none')onlineItems.push({text:w.noId,muted:true});
 else{for(const p of o.jaPatches||[])onlineItems.push({text:w.patch(p),strong:true});if(!onlineItems.length)onlineItems.push({text:o.ok===false?w.netFail:w.netNone,muted:true});}
 return {switchItems,restoreItems,onlineItems,sites:g.nothing&&o.state!=='pending'?(g.sites?.lines?.length?{lead:w.sitesLead,lines:g.sites.lines}:{lead:w.sitesEmpty,lines:[]}):null};
}
export function mountCnGuide({host,id,api,locale,esc,toast,isCurrent=()=>true,onChanged,openLanguage}){
 if(!host)return;const w=W[locale]||W.zh;let tries=0,timer=0;
 const box=document.createElement('section');box.className='cn-guide';box.hidden=true;box.setAttribute('aria-live','polite');host.after(box);
 const item=(x,i)=>`<li class="cn-guide-item${x.strong?' is-strong':''}${x.muted?' is-muted':''}"><p>${esc(x.text)}</p>${x.fix?`<button type="button" class="${x.fix==='reveal'?'secondary':'primary'}" data-cn-fix="${x.fix}" data-cn-i="${i}">${esc(x.label||(x.fix==='reveal'?w.reveal:w[FIX_LABEL[x.fix]]))}</button>`:''}</li>`;
 /* 2026-11-13 user: tidy the card. A step with nothing found folds into one quiet line; sites open in the browser */
 const step=(title,items,empty,base)=>{const real=items.filter(x=>!x.muted);if(!real.length){const t=items[0]?.text||empty;return `<div class="cn-guide-step is-empty${items[0]?.pending?' is-pending':''}"><h3>${title}</h3><p>${esc(t)}</p></div>`;}return `<div class="cn-guide-step"><h3>${title}</h3><ul>${items.map((x,i)=>item(x,base+i)).join('')}</ul></div>`;};
 /* 2026-11-13 user: sites one per row with Copy (the row cannot be drag-selected) and Open; a disclaimer sentence inside a
    site's note is lifted out and shown once under the whole list, since it covers every site, not only that one. The
    data file itself is shown as written. */
 const DISCLAIM=/[；;。]?\s*([^；;。（）()]*(?:不承担|免责|責任を負|not responsible|no responsibility)[^；;。（）()]*)/i;
 const splitNote=n=>{const m=String(n||'').match(DISCLAIM);return m?{note:n.replace(m[0],'').replace(/[；;。\s]+$/,'').trim(),law:m[1].trim()}:{note:n,law:''};};
 let laws=[];
 const site=l=>{const m=String(l).match(/^\s*((?:https?:\/\/)?[\w.-]+\.[a-z]{2,}(?:\/\S*)?)\s*(.*)$/i);if(!m){const t=splitNote(l);if(t.law)laws.push(t.law);return t.note?`<li class="cn-site-row is-text"><span class="cn-site-note">${esc(t.note)}</span></li>`:'';}
  const url=/^https?:/i.test(m[1])?m[1]:'https://'+m[1],host=m[1].replace(/^https?:\/\//,''),t=splitNote(m[2].replace(/^[（(]/,'').replace(/[）)]$/,''));if(t.law)laws.push(t.law);
  return `<li class="cn-site-row"><div class="cn-site-main"><b class="cn-site-host">${esc(host)}</b>${t.note?`<span class="cn-site-note">${esc(t.note)}</span>`:''}</div><div class="cn-site-acts"><button type="button" class="cn-site-btn" data-cn-copy="${esc(host)}">${esc(w.copy)}</button><button type="button" class="cn-site-btn" data-cn-open="${esc(url)}">${esc(w.open)} ↗</button></div></li>`;};
 const siteList=lines=>{laws=[];const rows=lines.map(site).join('');const law=[...new Set(laws)];return `<ul class="cn-sites">${rows}</ul>${law.length?`<p class="cn-site-law">${esc(law.join('；'))}</p>`:''}`;};
 const foldKey='megulit.cnGuide.fold.'+id;let folded=false;try{folded=localStorage.getItem(foldKey)==='1';}catch{}
 function paint(g){
  if(!isCurrent()||!g?.chinese){box.hidden=true;return;}
  const v=guideItems(g,locale),all=[...v.switchItems,...v.restoreItems,...v.onlineItems];
  box.hidden=false;box.innerHTML=`<header class="cn-guide-head"><span class="cn-guide-eyebrow">${w.eyebrow}</span><h2>${w.title}</h2><p>${w.sub}</p><button type="button" class="cn-guide-fold" data-cn-fold aria-expanded="${!folded}">${folded?w.unfold:w.fold}</button></header><div class="cn-guide-body"><div class="cn-guide-steps">${step(w.s1,v.switchItems,w.none1,0)}${step(w.s2,v.restoreItems,w.none2,v.switchItems.length)}${step(w.s3,v.onlineItems,'',v.switchItems.length+v.restoreItems.length)}${v.sites?`<div class="cn-guide-step cn-guide-sites"><h3>${w.s4}</h3><p>${esc(v.sites.lead)}</p>${v.sites.lines.length?`${siteList(v.sites.lines)}`:''}</div>`:''}</div><footer class="cn-guide-actions"><p class="settings-help" role="status" data-cn-status></p><button type="button" class="secondary" data-cn-recheck>${w.recheck}</button><button type="button" class="secondary" data-cn-language>${w.language}</button></footer></div>`;box.classList.toggle('is-folded',folded);
  const status=box.querySelector('[data-cn-status]');
  box.querySelector('[data-cn-recheck]').onclick=()=>{tries=0;status.textContent=w.checking;load();};
  box.querySelector('[data-cn-fold]').onclick=e=>{folded=!folded;try{localStorage.setItem(foldKey,folded?'1':'0');}catch{}box.classList.toggle('is-folded',folded);e.currentTarget.textContent=folded?w.unfold:w.fold;e.currentTarget.setAttribute('aria-expanded',String(!folded));};
  box.querySelectorAll('[data-cn-copy]').forEach(b=>b.onclick=async()=>{const t=b.dataset.cnCopy;let ok=false;try{await navigator.clipboard.writeText(t);ok=true;}catch{try{const a=document.createElement('textarea');a.value=t;a.style.cssText='position:fixed;opacity:0';document.body.appendChild(a);a.select();ok=document.execCommand('copy');a.remove();}catch{}}if(ok){b.textContent=w.copied;b.classList.add('is-done');setTimeout(()=>{b.textContent=w.copy;b.classList.remove('is-done');},1400);}});
  box.querySelectorAll('[data-cn-open]').forEach(b=>b.onclick=()=>api('open_source',{url:b.dataset.cnOpen}).catch(()=>{}));
  box.querySelector('[data-cn-language]').onclick=()=>openLanguage?.();
  box.querySelectorAll('[data-cn-fix]').forEach(button=>button.onclick=async()=>{const x=all[Number(button.dataset.cnI)];if(!x)return;
   box.querySelectorAll('[data-cn-fix],[data-cn-recheck]').forEach(b=>b.disabled=true);status.textContent=w.working;
   try{
    if(x.fix==='reveal'){await api('cn_guide_fix',{id,kind:'reveal',path:x.path});status.textContent='';}
    else{if(x.fix==='swap')await api('cn_guide_fix',{id,kind:'swap'});else if(x.fix==='restore')await api('jp_restore_apply',{id});else if(x.fix==='exe')await api('game_original_executable',{id,mode:'select',executable:x.path});
     toast?.(w.done);await onChanged?.();if(isCurrent())load();return;}
   }catch(error){const code=String(error?.message||error).match(/[A-Z][A-Z0-9_]{4,}/)?.[0]||'';status.textContent=launchReason(code,locale)||w.failed;}
   finally{box.querySelectorAll('[data-cn-fix],[data-cn-recheck]').forEach(b=>b.disabled=false);}});
  /* the online check runs in the background: ask again a few times while it is pending */
  clearTimeout(timer);if(g.online?.state==='pending'&&tries++<8)timer=setTimeout(()=>{if(isCurrent()&&box.isConnected)load();},2500);
 }
 const load=()=>api('cn_version_guide',{id}).then(paint,()=>{box.hidden=true;});
 load();
}
