import {launchReason} from './launch-feedback.js';
const labels={
 zh:['日文原版与语言环境','自动查找原版 EXE','手动选择路径','关闭','请先准备日文原版。MeguLit 需要能正常运行的日文原版来读取游戏原文','已保存启动程序','查找中…'],
 en:['Japanese version & locale','Find original EXE','Choose path','Close','Prepare an installed Japanese original. MeguLit uses it to read Japanese game text.','Executable saved','Searching…'],
 ja:['日本語版と言語環境','日本語版 EXE を探す','パスを選択','閉じる','日本語の原文を読み込むため、日本語版のゲームを用意してください','実行ファイルを保存しました','検索中…']
};
const localeWords={zh:['以日文系统环境启动','游戏弹窗或菜单出现乱码时打开。只对这部作品生效，不改电脑设置'],en:['Start in a Japanese system environment','Turn on if the game shows garbled dialogs or menus. Applies to this game only; your PC settings are unchanged'],ja:['日本語環境で起動','ゲームのダイアログやメニューが文字化けする場合にオン。この作品だけに適用し、PC の設定は変えません']};
export const gameLanguageLabel=locale=>(labels[locale]||labels.en)[0];
const openFailed={zh:'无法读取日文原版程序设置',en:'Could not load the Japanese executable setting',ja:'日本語版の実行ファイル設定を読み込めませんでした'};
export function originalExecutableError(error,locale){const text=String(error?.message||error||''),code=(text.match(/[A-Z][A-Z0-9_]{4,}/)||[])[0]||'';return launchReason(code,locale)||(openFailed[locale]||openFailed.en)+(code?' · '+code:'');}

// Script sources for zero-latency bilingual (user, 2026-11-09): a Chinese patch for the Japanese game, or the Japanese
// original for a patched game. Shown inside the executable dialog; the reader uses an import on the next line.
const sourceWords={
 zh:{coldPreparing:'正在准备剧本：MeguLit 在后台把游戏最小化、静音启动一次，让它读出剧本后自动关闭…',coldSteam:'这部 Steam 版要经 Steam 启动，没法在后台准备；第一次正常游玩时会自动读取剧本',title:'汉化脚本 · 零延迟双语',checking:'正在检查游戏脚本…',search:'重新查找',pick:'手动选择',original:'导入日文原版',clear:'移除',importing:'正在读取并对齐脚本…',searching:'正在本机查找这部作品的汉化包…',declined:'已移除自动找到的汉化包，不会再自动用回；点「重新查找」可以恢复',
  garbroDownload:n=>'这部作品的剧本封包需要通用解包组件（GARbro，约 10 MB），正在下载 '+n+'%，完成后自动解包',
  unpacking:n=>'首次使用需要先解包这部作品的剧本，大约 30～90 秒，完成后自动生效'+(n?'（已用 '+n+' 秒）':''),capture:'这部作品的剧本加密较强，需要边玩边读取：开始游戏、进入剧情后会自动生效，读过的部分之后直接可用',
  unsupported:'这部作品的引擎暂时读不了脚本（目前支持 System4、BGI / Ethornell、Steam 版 Siglus、KiriKiri（含 Steam 版加密封包）、Artemis、Ren\'Py）',chineseOnly:'这个版本只有中文剧本，没找到日文原文。零延迟翻译需要日文原版：点「导入日文原版」，手动添加日文原版的游戏目录',patched:'当前是汉化版：导入日文原版后，显示日文，译文直接用汉化组的翻译',
  notFound:h=>'本机没找到汉化包。手动选择时，打开汉化版（或汉化补丁）的游戏根目录，选中 '+h+'；汉化补丁是单个启动程序的，直接选那个 exe',
  pickTitle:h=>'打开汉化版的游戏根目录，选中 '+h+'（或汉化启动程序 exe）',
  patchReady:n=>'已用汉化包（'+n+' 行）：译文直接用汉化组的翻译',autoReady:n=>'已自动找到本机的汉化包（'+n+' 行）：译文直接用汉化组的翻译',originalReady:'已导入日文原版：显示日文，译文使用汉化组翻译',unreliable:'找到的脚本和当前游戏版本对不上，没有启用；请换成同一版本的汉化包或原版',pairing:(p,R)=>' · 译文 '+p.total+' 句，已配对 '+p.paired+'，未配对 '+p.unpaired+(p.unpaired?'（'+Object.entries(p.reasons||{}).map(([k,n])=>(R[k]||k)+' '+n).join('、')+'）':'')+(p.sample?.sampled?'；抽查 '+p.sample.sampled+' 句'+(p.ok?'，对上 '+p.sample.matched+' 句':'未通过：'+(R[p.reason]||p.reason)):'')+(p.realigned?.accepted?'；已自动重新对齐 '+p.realigned.scenes+' 段':''),
  pairReasons:{'no-japanese-line':'原文缺这句','offset-drift':'译文和原文整体错位','unrelated-text':'内容对不上，不是同一作品或版本','pairs-mismatch':'多句译文和原文对不上','different-version':'自动重新对齐后仍对不上，应是不同版本'},
  errors:{PATCH_SCRIPT_NOT_FOUND:'这里没找到对应的脚本，请按提示选中文件',PATCH_NOT_TRANSLATED:'这里的脚本还是日文，不像汉化包',PATCH_SAME_AS_RUNNING:'选的是游戏自己的文件，请选汉化版里的文件',PATCH_IS_RUNNING_COPY:'选的是游戏自己的文件夹，请选汉化版所在的文件夹',ORIGINAL_SCRIPT_NOT_FOUND:'这个文件夹里没找到对应的脚本文件',ORIGINAL_NOT_JAPANESE:'这个文件夹里的脚本不是日文',ORIGINAL_SAME_AS_RUNNING:'选的是游戏自己的文件，请选日文原版所在的文件夹',ORIGINAL_IS_RUNNING_COPY:'选的是游戏自己的文件夹，请选日文原版所在的文件夹'},failed:'导入失败'},
 en:{coldPreparing:'Preparing the script: MeguLit starts the game once in the background, minimised and muted, lets it read its script and closes it…',coldSteam:'This Steam build has to start through Steam, so it cannot be prepared in the background; the script is read the first time you play',title:'Translation script · zero-latency bilingual',checking:'Checking the game script…',search:'Search again',pick:'Choose manually',original:'Import Japanese original',clear:'Remove',importing:'Reading and lining up the script…',searching:'Looking for a Chinese patch on this computer…',declined:'The patch found automatically was removed and will not come back by itself; Search again restores it',
  garbroDownload:n=>'This game\'s script archive needs the archive component (GARbro, about 10 MB): downloading '+n+'%, it unpacks by itself afterwards',
  unpacking:n=>'First use: unpacking this game\'s script, about 30-90 seconds; it turns on by itself when done'+(n?' ('+n+' s so far)':''),capture:'This game\'s script is strongly encrypted and is read while you play: start the game and it turns on once the story begins; what has been read stays available',
  unsupported:'This engine\'s script cannot be read yet (System4, BGI / Ethornell, Steam Siglus, KiriKiri (including encrypted Steam archives), Artemis and Ren\'Py for now)',chineseOnly:'This edition has only a Chinese script; no Japanese text was found. Zero-latency translation needs the Japanese original: choose Import Japanese original and add its game folder',patched:'Patched edition: import the Japanese original to read Japanese with the group\'s translation',
  notFound:h=>'No Chinese patch found on this computer. To choose one, open the patched game\'s folder and select '+h+', or the patch\'s own launcher exe',
  pickTitle:h=>'Open the patched game folder and select '+h+' (or the patch launcher exe)',
  patchReady:n=>'Chinese patch in use ('+n+' lines): translations come from the group',autoReady:n=>'Found a Chinese patch on this computer ('+n+' lines): translations come from the group',originalReady:'Japanese original imported: Japanese text, group translations',unreliable:'The script found does not match this game version, so it is not used',pairing:(p,R)=>' · '+p.total+' translated lines, '+p.paired+' paired, '+p.unpaired+' unpaired'+(p.unpaired?' ('+Object.entries(p.reasons||{}).map(([k,n])=>(R[k]||k)+' '+n).join(', ')+')':'')+(p.sample?.sampled?'; '+p.sample.sampled+' sampled, '+(p.ok?p.sample.matched+' match':'failed: '+(R[p.reason]||p.reason)):'')+(p.realigned?.accepted?'; realigned '+p.realigned.scenes+' sections automatically':''),
  pairReasons:{'no-japanese-line':'no original line','offset-drift':'lines shifted against the original','unrelated-text':'text does not match: another game or version','pairs-mismatch':'many lines do not match the original','different-version':'still off after realigning: another version'},
  errors:{PATCH_SCRIPT_NOT_FOUND:'No matching script here; select the file named above',PATCH_NOT_TRANSLATED:'This script is still Japanese',PATCH_SAME_AS_RUNNING:'These are the game\'s own files',PATCH_IS_RUNNING_COPY:'This is the game\'s own folder',ORIGINAL_SCRIPT_NOT_FOUND:'No matching script in this folder',ORIGINAL_NOT_JAPANESE:'This folder\'s script is not Japanese',ORIGINAL_SAME_AS_RUNNING:'These are the game\'s own files',ORIGINAL_IS_RUNNING_COPY:'This is the game\'s own folder'},failed:'Import failed'},
 ja:{coldPreparing:'シナリオを準備しています：MeguLit がゲームを最小化・ミュートでバックグラウンド起動し、シナリオを読ませてから閉じます…',coldSteam:'この Steam 版は Steam 経由でしか起動できないため、バックグラウンドで準備できません。最初のプレイ時に読み取ります',title:'翻訳スクリプト・遅延なしの対訳',checking:'ゲームのスクリプトを確認しています…',search:'再検索',pick:'手動で選択',original:'日本語版を読み込む',clear:'解除',importing:'スクリプトを読み込んで照合しています…',searching:'この PC で中国語パッチを探しています…',declined:'自動で見つけたパッチを解除しました。再検索で元に戻せます',
  garbroDownload:n=>'このゲームのスクリプトには汎用アーカイブ展開コンポーネント（GARbro、約 10 MB）が必要です。ダウンロード中 '+n+'%、終わると自動で展開します',
  unpacking:n=>'初回はスクリプトの展開に 30～90 秒ほどかかります。終わると自動で有効になります'+(n?'（'+n+' 秒経過）':''),capture:'このゲームのスクリプトは強く暗号化されているため、プレイ中に読み込みます。本編が始まると自動で有効になり、読んだ部分は次回からすぐ使えます',
  unsupported:'このエンジンのスクリプトはまだ読み込めません（現在は System4、BGI / Ethornell、Steam 版 Siglus、KiriKiri（Steam 版の暗号化アーカイブを含む）、Artemis、Ren\'Py）',chineseOnly:'この版には中国語のスクリプトしかなく、日本語の原文が見つかりません。遅延なしの対訳には日本語版が必要です。「日本語版を読み込む」から日本語版のゲームフォルダを追加してください',patched:'翻訳版です。日本語版を読み込むと日本語で表示し、訳にパッチの翻訳を使います',
  notFound:h=>'この PC に中国語パッチは見つかりませんでした。手動の場合は翻訳版のゲームフォルダを開いて '+h+' を選択してください',
  pickTitle:h=>'翻訳版のゲームフォルダを開いて '+h+' を選択',
  patchReady:n=>'中国語パッチを使用中（'+n+' 行）',autoReady:n=>'この PC の中国語パッチを自動で見つけました（'+n+' 行）',originalReady:'日本語版を読み込みました',unreliable:'見つかったスクリプトがこのバージョンと一致しないため使っていません',pairing:(p,R)=>' · 訳文 '+p.total+' 行、対応 '+p.paired+'、未対応 '+p.unpaired+(p.unpaired?'（'+Object.entries(p.reasons||{}).map(([k,n])=>(R[k]||k)+' '+n).join('、')+'）':'')+(p.sample?.sampled?'／抜き取り '+p.sample.sampled+' 行'+(p.ok?'、一致 '+p.sample.matched+' 行':'：'+(R[p.reason]||p.reason)):'')+(p.realigned?.accepted?'／'+p.realigned.scenes+' 区間を自動で揃え直しました':''),
  pairReasons:{'no-japanese-line':'原文なし','offset-drift':'原文と行がずれています','unrelated-text':'内容が一致しません（別作品か別バージョン）','pairs-mismatch':'多くの行が原文と一致しません','different-version':'揃え直しても一致しないため別バージョンです'},
  errors:{},failed:'読み込めませんでした'}};
function mountTextSource(dialog,{id,api,invoke,locale,esc}){
 const w=sourceWords[locale]||sourceWords.zh,box=document.createElement('section');box.className='exe-bilingual';
 box.innerHTML=`<strong>${w.title}</strong><p class="settings-help" role="status" data-ts-status>${w.checking}</p><div class="exe-bilingual-actions"><button type="button" class="secondary" data-ts="search" hidden>${w.search}</button><button type="button" class="secondary" data-ts="patch" hidden>${w.pick}</button><button type="button" class="secondary" data-ts="original" hidden>${w.original}</button><button type="button" class="text-button" data-ts-clear hidden>${w.clear}</button></div>`;
 dialog.querySelector('.dialog-actions').before(box);
 const status=box.querySelector('[data-ts-status]'),searchBtn=box.querySelector('[data-ts="search"]'),patchBtn=box.querySelector('[data-ts="patch"]'),originalBtn=box.querySelector('[data-ts="original"]'),clearBtn=box.querySelector('[data-ts-clear]');
 let timer=0,last=null;
 /* E496 the sampled pairing check of an import: translated lines, paired, unpaired and why, the sample and any realignment */
 const pairText=p=>{if(!p||typeof p.total!=='number')return '';try{return (w.pairing||sourceWords.zh.pairing)(p,w.pairReasons||sourceWords.zh.pairReasons);}catch{return '';}};
 const paint=s=>{last=s;clearTimeout(timer);searchBtn.hidden=patchBtn.hidden=originalBtn.hidden=clearBtn.hidden=true;
  /* E297 Hxv4 KiriKiri: the background cold run is reading the script; check back until it is done. */
  if(s?.cold?.state==='preparing'){status.textContent=w.coldPreparing||sourceWords.zh.coldPreparing;if(dialog.open)timer=setTimeout(load,3000);return;}
  /* E294 (user: say the first use needs 30-90 s of unpacking): a script still being unpacked, or read while the game runs. */
  if(s?.status==='preparing'&&s.preparing){const p=s.preparing,garbro=p.kind==='garbro';if(garbro||p.kind==='unpack'){status.textContent=garbro&&p.stage==='download'?w.garbroDownload(p.total?Math.min(99,Math.round(p.received/p.total*100)):0):w.unpacking(p.startedAt?Math.max(0,Math.round((Date.now()-p.startedAt)/1000)):0);if(dialog.open)timer=setTimeout(load,garbro?1500:3000);}else status.textContent=s.cold?.result==='steam'?(w.coldSteam||sourceWords.zh.coldSteam):w.capture;return;}
  if(!s||s.status==='unsupported'){status.textContent=w.unsupported;return;}
  if(s.patchStatus==='ready'){status.textContent=(s.patch?.auto?w.autoReady:w.patchReady)(s.patch?.lines||0)+pairText(s.patchAlignment?.pairing);clearBtn.hidden=false;clearBtn.dataset.kind='patch';patchBtn.hidden=false;return;}
  if(s.mode==='original'&&s.status==='ready'){status.textContent=w.originalReady+pairText(s.alignment?.pairing);clearBtn.hidden=false;clearBtn.dataset.kind='original';return;}
  /* E452 a script with (almost) no kana: Chinese only, the Japanese original has to be added by hand. */
  if(s.status==='chinese-only'){status.textContent=w.chineseOnly||sourceWords.zh.chineseOnly;originalBtn.hidden=false;return;}
  if(s.status!=='native-japanese'){status.textContent=s.status==='unreliable'?w.unreliable+pairText(s.alignment?.pairing):w.patched;originalBtn.hidden=false;return;}
  // The search runs by itself; while it does, the dialog checks back.
  if(s.patchSearch?.running){status.textContent=w.searching;if(dialog.open)timer=setTimeout(load,1500);return;}
  status.textContent=s.patchStatus==='unreliable'?w.unreliable+pairText(s.patchAlignment?.pairing):s.patchSearch?.declined?w.declined:w.notFound(s.patchHint||'');searchBtn.hidden=patchBtn.hidden=false;};
 const load=(search)=>api('text_source_status',{id,search:!!search}).then(paint,()=>paint(null));
 dialog.addEventListener('close',()=>clearTimeout(timer));
 const busy=on=>{for(const b of box.querySelectorAll('button'))b.disabled=on;};
 const run=async(kind,source)=>{busy(true);status.textContent=w.importing;
  try{paint(await api('text_source_import',{id,kind,dir:source}));}catch(error){const code=String(error?.message||error).match(/[A-Z][A-Z0-9_]{4,}/)?.[0]||'';status.textContent=w.errors[code]||(locale==='ja'?sourceWords.en:sourceWords.zh).errors[code]||w.failed;}
  finally{busy(false);}};
 // Manual pick (user, 2026-11-10): the picker opens at the game and its title names the file to select.
 patchBtn.onclick=async()=>{let file;try{file=await invoke('pick_patch_file',{title:w.pickTitle(last?.patchHint||''),directory:last?.gameDir||null});}catch{return;}if(file)run('patch',file);};
 originalBtn.onclick=async()=>{let dir;try{dir=(await invoke('pick_directories',{multiple:false}))?.[0];}catch{return;}if(dir)run('original',dir);};
 searchBtn.onclick=()=>{status.textContent=w.searching;load(true);};
 clearBtn.onclick=async()=>{clearBtn.disabled=true;try{paint(await api('text_source_clear',{id,kind:clearBtn.dataset.kind}));}catch{}finally{clearBtn.disabled=false;}};
 load();
}
export async function openGameLanguage({id,api,invoke,locale,esc,toast,onChanged}){
 const [title,find,pick,close,hint,saved,searching]=labels[locale]||labels.en;
 const state=await api('game_original_executable',{id});
 const dialog=document.createElement('dialog');dialog.className='exe-dialog';
 dialog.innerHTML=`<h2>${title}</h2><p>${hint}</p><p class="exe-path" role="status" title="${esc(state.executable||'')}">${esc(state.executable||launchReason('JAPANESE_EXECUTABLE_REQUIRED',locale))}</p><label class="locale-toggle"><input type="checkbox" data-locale ${state.localeJapanese?'checked':''}><span class="review-switch" aria-hidden="true"></span><span><strong>${(localeWords[locale]||localeWords.en)[0]}</strong><small class="settings-help">${(localeWords[locale]||localeWords.en)[1]}</small></span></label><div class="dialog-actions"><button class="text-button exe-close" data-close>${close}</button><button class="secondary" data-find>${find}</button><button class="primary" data-pick>${pick}</button></div>`;
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 const controls=[dialog.querySelector('[data-find]'),dialog.querySelector('[data-pick]')];
 async function save(mode){
  for(const button of controls)button.disabled=true;
  const status=dialog.querySelector('[role=status]');
  try{
   const executable=mode==='select'?await invoke('pick_executable',{directory:state.directory}):undefined;
   if(mode==='select'&&!executable)return;
   status.textContent=searching;
   await api('game_original_executable',{id,mode,executable});
   dialog.close();toast(saved);await onChanged?.();
  }catch(error){status.textContent=launchReason((String(error?.message||error||'').match(/[A-Z][A-Z0-9_]{4,}/)||[])[0]||'',locale)||launchReason('JAPANESE_EXECUTABLE_REQUIRED',locale);}
  finally{for(const button of controls)button.disabled=false;}
 }
 dialog.querySelector('[data-locale]').onchange=async event=>{try{await api('game_locale_mode',{id,japanese:event.target.checked});}catch{event.target.checked=!event.target.checked;}};
 controls[0].onclick=()=>save('find');controls[1].onclick=()=>save('select');
 mountTextSource(dialog,{id,api,invoke,locale,esc});
}
