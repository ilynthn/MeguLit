import {launchReason} from './launch-feedback.js';
const labels={
 zh:['日文原版与恢复','自动查找原版 EXE','手动选择原版 EXE','关闭','当前日文启动程序','已保存启动程序','正在查找原版程序…','从日文目录配对剧本','只读取你已有的日文版目录，与当前汉化版配对，不替换游戏文件','已配对日文剧本','未找到可用的配对，翻译将继续使用现有备用方式'],
 en:['Japanese original & restore','Find original EXE','Choose original EXE','Close','Current Japanese executable','Executable saved','Looking for the original executable…','Pair scripts from Japanese folder','Read an installed Japanese release and pair it with this translated copy. Game files stay in place.','Japanese script paired','No usable pairs were found. The existing translation fallback is still available.'],
 ja:['日本語版と復元','日本語版 EXE を探す','日本語版 EXE を選ぶ','閉じる','現在の日本語版実行ファイル','実行ファイルを保存しました','日本語版の実行ファイルを探しています…','日本語版フォルダから照合','手元の日本語版フォルダを読み、現在の翻訳版と照合します。ゲームファイルは書き換えません','日本語版のシナリオを照合しました','利用できる対訳が見つかりませんでした。既存の翻訳方法で補います']
};
const localeWords={zh:['日文环境启动','游戏标题、菜单或对白乱码，或点读层收到的日文全是乱码时，开启后重新启动本作。文字正常时可保持关闭','保存失败，已恢复原设置'],en:['Japanese locale','If the title, menus, dialogue, or all Japanese text in the reader looks garbled, turn this on and restart this game. Leave it off if text displays normally.','Could not save. The previous setting was restored.'],ja:['日本語環境で起動','タイトル・メニュー・台詞が文字化けする場合や、読み取り結果がすべて文字化けする場合は、オンにしてゲームを再起動してください。正常に表示される場合はオフのままで構いません。','設定を保存できなかったため元に戻しました']};
const localeCaptions={
 zh:'日文显示乱码时，开启后重启游戏',
 en:'Garbled text? Turn on and restart.',
 ja:'文字化けしたらオンにしてゲームを再起動'
};
export const originalLabel=locale=>(labels[locale]||labels.en)[0];
export function localeToggleHTML(locale,mode){
 const [label,hint]=localeWords[locale]||localeWords.en;
 return `<label class="locale-toggle detail-locale" title="${hint}"><strong>${label}</strong><input type="checkbox" role="switch" data-locale aria-describedby="detail-locale-help" ${mode==='japanese'?'checked':''}><span class="review-switch" aria-hidden="true"></span></label><small id="detail-locale-help" class="detail-locale-help">${localeCaptions[locale]||localeCaptions.en}</small>`;
}
export function bindLocaleToggle(host,{id,api,locale}){
 const box=host.querySelector('[data-locale]'),status=host.querySelector('.detail-locale-error');
 let saved=box.checked;
 box.onchange=async()=>{
  box.disabled=true;status.textContent='';
  try{saved=(await api('game_locale_mode',{id,japanese:box.checked})).japanese===true;}
  catch{status.textContent=(localeWords[locale]||localeWords.en)[2];}
  finally{box.checked=saved;box.disabled=false;}
 };
}
const openFailed={zh:'无法读取日文原版程序设置',en:'Could not load the Japanese executable setting',ja:'日本語版の実行ファイル設定を読み込めませんでした'};
export function originalExecutableError(error,locale){const text=String(error?.message||error||''),code=(text.match(/[A-Z][A-Z0-9_]{4,}/)||[])[0]||'';return launchReason(code,locale)||(openFailed[locale]||openFailed.en)+(code?' · '+code:'');}

/* A Chinese patch for the Japanese game, or a Japanese script paired with the installed Chinese release. */
const sourceWords={
 zh:{coldPreparing:'正在准备剧本：MeguLit 在后台把游戏最小化、静音启动一次，让它读出剧本后自动关闭…',coldSteam:'这部 Steam 版要经 Steam 启动，没法在后台准备；第一次正常游玩时会自动读取剧本',title:'汉化脚本 · 零延迟双语',checking:'正在检查游戏脚本…',search:'重新查找',pick:'手动选择',original:'导入日文原版',clear:'移除',importing:'正在读取并对齐脚本…',searching:'正在本机查找这部作品的汉化包…',declined:'已移除自动找到的汉化包，不会再自动用回；点「重新查找」可以恢复',
  garbroDownload:n=>'这部作品的剧本封包需要通用解包组件（GARbro，约 10 MB），正在下载 '+n+'%，完成后自动解包',
  unpacking:n=>'首次使用需要先解包这部作品的剧本，大约 30～90 秒，完成后自动生效'+(n?'（已用 '+n+' 秒）':''),capture:'这部作品的剧本加密较强，需要边玩边读取：开始游戏、进入剧情后会自动生效，读过的部分之后直接可用',
  unsupported:'这部作品的引擎暂时读不了脚本（目前支持 System4、BGI / Ethornell、Steam 版 Siglus、KiriKiri（含 Steam 版加密封包）、Artemis、Ren\'Py）',chineseOnly:'这个版本只有中文剧本，没找到日文原文。零延迟翻译需要日文原版：点「导入日文原版」，手动添加日文原版的游戏目录',patched:'当前是汉化版：导入日文原版后，显示日文，译文直接用汉化组的翻译',
  notFound:h=>'本机没找到汉化包。手动选择时，打开汉化版（或汉化补丁）的游戏根目录，选中 '+h+'；汉化补丁是单个启动程序的，直接选那个 exe',
  pickTitle:h=>'打开汉化版的游戏根目录，选中 '+h+'（或汉化启动程序 exe）',
  launcher:(f,h)=>'已记下汉化启动程序 '+f+'。它把译文加密打包在程序里面，MeguLit 读不出来，所以零延迟双语暂时用提前机翻。如果另有解压出来的汉化文件（'+h+'），选那里的文件即可；只有这个启动程序的话，不用再选',
  patchReady:n=>'已配对汉化包（'+n+' 行）',autoReady:n=>'已自动找到本机的汉化包（'+n+' 行）',originalReady:'已导入日文原版，已配对译文',unreliable:'找到的脚本和当前游戏版本对不上，没有启用；请换成同一版本的汉化包或原版',pairing:(p,R)=>' · 译文 '+p.total+' 句，已配对 '+p.paired+'，未配对 '+p.unpaired+(p.added?.count?'，译方新增 '+p.added.count+'（拟声词 '+(p.added.sound|0)+'）':'')+(p.unpaired?'（'+Object.entries(p.reasons||{}).map(([k,n])=>(R[k]||k)+' '+n).join('、')+'）':'')+(p.sample?.sampled?'；抽查 '+p.sample.sampled+' 句'+(p.ok?'，对上 '+p.sample.matched+' 句':'未通过：'+(R[p.reason]||p.reason)):'')+(p.realigned?.accepted?'；已自动重新对齐 '+p.realigned.scenes+' 段':''),
  pairReasons:{'no-japanese-line':'原文缺这句','offset-drift':'译文和原文整体错位','unrelated-text':'内容对不上，不是同一作品或版本','pairs-mismatch':'多句译文和原文对不上','different-version':'自动重新对齐后仍对不上，应是不同版本'},
  errors:{PATCH_SCRIPT_NOT_FOUND:'这里没找到对应的脚本，请按提示选中文件',PATCH_NOT_TRANSLATED:'这里的脚本还是日文，不像汉化包',PATCH_SAME_AS_RUNNING:'选的是游戏自己的文件，请选汉化版里的文件',PATCH_IS_RUNNING_COPY:'游戏文件夹里只有游戏自己的日文脚本，没找到汉化脚本。汉化在别的文件夹里的话，请选那里',PATCH_PACKED_LAUNCHER:'这个汉化启动程序把译文加密打包在程序里，MeguLit 读不出来；已记下它，零延迟双语暂时用提前机翻',ORIGINAL_SCRIPT_NOT_FOUND:'这个文件夹里没找到对应的脚本文件',ORIGINAL_NOT_JAPANESE:'这个文件夹里的脚本不是日文',ORIGINAL_SAME_AS_RUNNING:'选的是游戏自己的文件，请选日文原版所在的文件夹',ORIGINAL_IS_RUNNING_COPY:'选的是游戏自己的文件夹，请选日文原版所在的文件夹'},failed:'导入失败'},
 en:{coldPreparing:'Preparing the script: MeguLit starts the game once in the background, minimised and muted, lets it read its script and closes it…',coldSteam:'This Steam build has to start through Steam, so it cannot be prepared in the background; the script is read the first time you play',title:'Translation script · zero-latency bilingual',checking:'Checking the game script…',search:'Search again',pick:'Choose manually',original:'Import Japanese original',clear:'Remove',importing:'Reading and lining up the script…',searching:'Looking for a Chinese patch on this computer…',declined:'The patch found automatically was removed and will not come back by itself; Search again restores it',
  garbroDownload:n=>'This game\'s script archive needs the archive component (GARbro, about 10 MB): downloading '+n+'%, it unpacks by itself afterwards',
  unpacking:n=>'First use: unpacking this game\'s script, about 30-90 seconds; it turns on by itself when done'+(n?' ('+n+' s so far)':''),capture:'This game\'s script is strongly encrypted and is read while you play: start the game and it turns on once the story begins; what has been read stays available',
  unsupported:'This engine\'s script cannot be read yet (System4, BGI / Ethornell, Steam Siglus, KiriKiri (including encrypted Steam archives), Artemis and Ren\'Py for now)',chineseOnly:'This edition has only a Chinese script; no Japanese text was found. Zero-latency translation needs the Japanese original: choose Import Japanese original and add its game folder',patched:'Patched edition: import the Japanese original to read Japanese with the group\'s translation',
  notFound:h=>'No Chinese patch found on this computer. To choose one, open the patched game\'s folder and select '+h+', or the patch\'s own launcher exe',
  pickTitle:h=>'Open the patched game folder and select '+h+' (or the patch launcher exe)',
  launcher:(f,h)=>'Chinese launcher noted: '+f+'. It keeps its translation encrypted inside the program, which MeguLit cannot read, so zero-latency bilingual uses machine translation ahead for now. If you also have the unpacked patch files ('+h+'), select one of those; with only this launcher there is nothing else to pick',
  patchReady:n=>'Chinese patch paired ('+n+' lines)',autoReady:n=>'Found a Chinese patch on this computer ('+n+' lines)',originalReady:'Japanese original imported and paired',unreliable:'The script found does not match this game version, so it is not used',pairing:(p,R)=>' · '+p.total+' translated lines, '+p.paired+' paired, '+p.unpaired+' unpaired'+(p.added?.count?', '+p.added.count+' added by the translation ('+(p.added.sound|0)+' sound effects)':'')+(p.unpaired?' ('+Object.entries(p.reasons||{}).map(([k,n])=>(R[k]||k)+' '+n).join(', ')+')':'')+(p.sample?.sampled?'; '+p.sample.sampled+' sampled, '+(p.ok?p.sample.matched+' match':'failed: '+(R[p.reason]||p.reason)):'')+(p.realigned?.accepted?'; realigned '+p.realigned.scenes+' sections automatically':''),
  pairReasons:{'no-japanese-line':'no original line','offset-drift':'lines shifted against the original','unrelated-text':'text does not match: another game or version','pairs-mismatch':'many lines do not match the original','different-version':'still off after realigning: another version'},
  errors:{PATCH_SCRIPT_NOT_FOUND:'No matching script here; select the file named above',PATCH_NOT_TRANSLATED:'This script is still Japanese',PATCH_SAME_AS_RUNNING:'These are the game\'s own files',PATCH_IS_RUNNING_COPY:'Only the game\'s own Japanese scripts are in this folder; select the folder with the translation',PATCH_PACKED_LAUNCHER:'This launcher keeps its translation encrypted inside the program, which MeguLit cannot read; it is noted and machine translation ahead is used for now',ORIGINAL_SCRIPT_NOT_FOUND:'No matching script in this folder',ORIGINAL_NOT_JAPANESE:'This folder\'s script is not Japanese',ORIGINAL_SAME_AS_RUNNING:'These are the game\'s own files',ORIGINAL_IS_RUNNING_COPY:'This is the game\'s own folder'},failed:'Import failed'},
 ja:{coldPreparing:'シナリオを準備しています：MeguLit がゲームを最小化・ミュートでバックグラウンド起動し、シナリオを読ませてから閉じます…',coldSteam:'この Steam 版は Steam 経由でしか起動できないため、バックグラウンドで準備できません。最初のプレイ時に読み取ります',title:'翻訳スクリプト・遅延なしの対訳',checking:'ゲームのスクリプトを確認しています…',search:'再検索',pick:'手動で選択',original:'日本語版を読み込む',clear:'解除',importing:'スクリプトを読み込んで照合しています…',searching:'この PC で中国語パッチを探しています…',declined:'自動で見つけたパッチを解除しました。再検索で元に戻せます',
  garbroDownload:n=>'このゲームのスクリプトには汎用アーカイブ展開コンポーネント（GARbro、約 10 MB）が必要です。ダウンロード中 '+n+'%、終わると自動で展開します',
  unpacking:n=>'初回はスクリプトの展開に 30～90 秒ほどかかります。終わると自動で有効になります'+(n?'（'+n+' 秒経過）':''),capture:'このゲームのスクリプトは強く暗号化されているため、プレイ中に読み込みます。本編が始まると自動で有効になり、読んだ部分は次回からすぐ使えます',
  unsupported:'このエンジンのスクリプトはまだ読み込めません（現在は System4、BGI / Ethornell、Steam 版 Siglus、KiriKiri（Steam 版の暗号化アーカイブを含む）、Artemis、Ren\'Py）',chineseOnly:'この版には中国語のスクリプトしかなく、日本語の原文が見つかりません。遅延なしの対訳には日本語版が必要です。「日本語版を読み込む」から日本語版のゲームフォルダを追加してください',patched:'翻訳版です。日本語版を読み込むと日本語で表示し、訳にパッチの翻訳を使います',
  notFound:h=>'この PC に中国語パッチは見つかりませんでした。手動の場合は翻訳版のゲームフォルダを開いて '+h+' を選択してください',
  pickTitle:h=>'翻訳版のゲームフォルダを開いて '+h+' を選択（または翻訳パッチの起動 exe）',
  launcher:(f,h)=>'中国語版の起動プログラム '+f+' を記録しました。訳文がプログラム内に暗号化されて格納されているため MeguLit では読み取れず、遅延なしの対訳は当面先読み機械翻訳を使います。展開済みのパッチファイル（'+h+'）があれば、そちらを選択してください。この起動プログラムしかない場合は、これ以上選ぶ必要はありません',
  patchReady:n=>'中国語パッチを照合済み（'+n+' 行）',autoReady:n=>'この PC の中国語パッチを自動で見つけました（'+n+' 行）',originalReady:'日本語版を読み込みました',unreliable:'見つかったスクリプトがこのバージョンと一致しないため使っていません',pairing:(p,R)=>' · 訳文 '+p.total+' 行、対応 '+p.paired+'、未対応 '+p.unpaired+(p.added?.count?'、翻訳で追加 '+p.added.count+'（効果音 '+(p.added.sound|0)+'）':'')+(p.unpaired?'（'+Object.entries(p.reasons||{}).map(([k,n])=>(R[k]||k)+' '+n).join('、')+'）':'')+(p.sample?.sampled?'／抜き取り '+p.sample.sampled+' 行'+(p.ok?'、一致 '+p.sample.matched+' 行':'：'+(R[p.reason]||p.reason)):'')+(p.realigned?.accepted?'／'+p.realigned.scenes+' 区間を自動で揃え直しました':''),
  pairReasons:{'no-japanese-line':'原文なし','offset-drift':'原文と行がずれています','unrelated-text':'内容が一致しません（別作品か別バージョン）','pairs-mismatch':'多くの行が原文と一致しません','different-version':'揃え直しても一致しないため別バージョンです'},
  errors:{PATCH_SCRIPT_NOT_FOUND:'対応するスクリプトが見つかりません。上の説明のファイルを選択してください',PATCH_NOT_TRANSLATED:'このスクリプトはまだ日本語です',PATCH_SAME_AS_RUNNING:'ゲーム自身のファイルです。翻訳版のファイルを選択してください',PATCH_IS_RUNNING_COPY:'このフォルダにはゲーム自身の日本語スクリプトしかありません。翻訳のあるフォルダを選択してください',PATCH_PACKED_LAUNCHER:'この起動プログラムは訳文を内部に暗号化しているため読み取れません。記録したうえで、当面は先読み機械翻訳を使います',ORIGINAL_SCRIPT_NOT_FOUND:'このフォルダに対応するスクリプトがありません',ORIGINAL_NOT_JAPANESE:'このフォルダのスクリプトは日本語ではありません',ORIGINAL_SAME_AS_RUNNING:'ゲーム自身のファイルです。日本語版のフォルダを選択してください',ORIGINAL_IS_RUNNING_COPY:'ゲーム自身のフォルダです。日本語版のフォルダを選択してください'},failed:'読み込めませんでした'}};
const sourceUI={
 zh:{label:'零延迟翻译',close:'关闭',preference:'使用本地配对译文（全局）',guide:'手动选择汉化补丁中含中文译文的剧本或资源包，也可选已安装汉化版的 EXE、游戏目录或已挂载的光盘目录',example:h=>'这部作品可先找 '+h,disc:'镜像可选 ISO 9660 格式的 .iso、.img 或数据轨 .bin（也可选配套 .cue）。如果盘里只有安装程序，请选择已安装的汉化版目录',file:'选剧本、程序或镜像',folder:'选汉化版或光盘目录',original:'打开日文原版与恢复',embedded:'正在使用恢复日文时创建的本地对照表，可从「日文原版与恢复」撤销',ready:'已开启，使用本地配对译文',off:'已关闭',noPairs:'未启用，当前作品暂无可用配对',english:'未启用，当前翻译目标为英语',checking:'正在检查可用译文',failed:'无法读取零延迟翻译状态',saveFailed:'开关保存失败，已读取当前设置',clearFailed:'移除失败，请重试',
 errors:{INVALID_PATCH_DIRECTORY:'找不到所选文件或目录，请重新选择',PATCH_SOURCE_TYPE:'这不是当前作品支持的剧本、启动程序或光盘镜像',PATCH_DISC_DATA_MISSING:'找不到 CUE 对应的 BIN 数据文件，请将它们放在同一目录',PATCH_DISC_UNREADABLE:'无法读取光盘镜像，需要包含 ISO 9660 数据轨的镜像',PATCH_DISC_NO_SCRIPT:'能读到镜像，但盘内没有适用于当前作品的汉化剧本，请选择已安装的汉化版目录',NO_SUPPORTED_SCRIPT:'目前无法从当前作品的安装目录读取剧本'}},
 en:{label:'Zero-latency translation',close:'Close',preference:'Use locally paired translations (global)',guide:'Choose a script or resource archive containing the Chinese translation. You can also choose the installed Chinese game’s EXE, game folder, or mounted disc folder.',example:h=>'For this game, look for '+h,disc:'ISO 9660 images can be .iso, .img or a data-track .bin (or its .cue). For an installer-only disc, choose the installed Chinese game folder.',file:'Choose script, EXE or image',folder:'Choose game or disc folder',original:'Open Japanese original & restore',embedded:'A local translation table was created when Japanese was restored. You can undo that in Japanese original & restore.',ready:'On, using locally paired translations',off:'Off',noPairs:'Inactive, no usable pairs for this game',english:'Inactive, the translation target is English',checking:'Checking available translations',failed:'Could not check zero-latency translation',saveFailed:'Could not save the switch. The current setting was reloaded.',clearFailed:'Could not remove the source. Try again.',
 errors:{INVALID_PATCH_DIRECTORY:'The selected file or folder could not be found',PATCH_SOURCE_TYPE:'This is not a supported script, executable or disc image for this game',PATCH_DISC_DATA_MISSING:'The CUE’s BIN data file is missing. Put them in the same folder.',PATCH_DISC_UNREADABLE:'Could not read this image. It needs an ISO 9660 data track.',PATCH_DISC_NO_SCRIPT:'The image has no supported Chinese script for this game. Choose the installed Chinese game folder.',NO_SUPPORTED_SCRIPT:'The installed game script could not be read'}},
 ja:{label:'ゼロ遅延翻訳',close:'閉じる',preference:'ローカルの対訳を使用（全作品共通）',guide:'中国語訳が入ったシナリオやアーカイブを選びます。インストール済み中国語版の EXE・フォルダ、マウント済みディスクのフォルダも選べます',example:h=>'この作品では '+h+' を探してください',disc:'ISO 9660 の .iso、.img、データトラックの .bin（または対応する .cue）を読み取れます。インストーラーだけの場合は、インストール済み中国語版のフォルダを選んでください',file:'シナリオ・EXE・イメージを選ぶ',folder:'ゲーム・ディスクのフォルダを選ぶ',original:'日本語版と復元を開く',embedded:'日本語の復元時に作成した対訳を使用できます。「日本語版と復元」から元に戻せます',ready:'オン、ローカルの対訳を使用',off:'オフ',noPairs:'利用できる対訳がありません',english:'翻訳先が英語のため無効',checking:'対訳を確認中',failed:'ゼロ遅延翻訳の状態を確認できませんでした',saveFailed:'保存に失敗したため、現在の設定を読み込み直しました',clearFailed:'解除できませんでした。もう一度お試しください',
 errors:{INVALID_PATCH_DIRECTORY:'選んだファイルまたはフォルダが見つかりません',PATCH_SOURCE_TYPE:'この作品に対応したシナリオ・実行ファイル・イメージを選んでください',PATCH_DISC_DATA_MISSING:'CUE に対応する BIN が見つかりません。同じフォルダに置いてください',PATCH_DISC_UNREADABLE:'イメージを読めません。ISO 9660 のデータトラックが必要です',PATCH_DISC_NO_SCRIPT:'イメージに対応する中国語シナリオがありません。インストール済み中国語版のフォルダを選んでください',NO_SUPPORTED_SCRIPT:'インストール済みゲームのシナリオを読み取れません'}}
};
export const zeroLatencyLabel=locale=>(sourceUI[locale]||sourceUI.en).label;
export function zeroActivityLabel(locale,activity){
 const w=sourceUI[locale]||sourceUI.en;
 if(activity===undefined)return w.checking;
 if(!activity)return w.failed;
 if(activity.active)return w.ready;
 if(!activity.enabled)return w.off;
 return activity.english?w.english:w.noPairs;
}
const patchReportWords={
 zh:{ready:'已配对本地正文译文',interfaceOnly:'仅找到界面译文，未启用正文零延迟翻译',original:n=>'原文 '+n+' 个条目',
  script:'正文',interface:'界面',counts:(translated,paired,total)=>translated+' 条译文、已配对 '+paired+' / '+total+' 个原文条目',source:name=>'来源 '+name},
 en:{ready:'Local script translations paired',interfaceOnly:'Only interface translations found. Zero-latency script translation is inactive',original:n=>n+' original entries',
  script:'Script',interface:'Interface',counts:(translated,paired,total)=>translated+' translations, '+paired+' of '+total+' original entries paired',source:name=>'Source '+name},
 ja:{ready:'ローカルのシナリオ訳を照合済み',interfaceOnly:'画面表示の訳のみが見つかりました。シナリオのゼロ遅延翻訳は無効です',original:n=>'原文 '+n+' 件',
  script:'本文',interface:'画面表示',counts:(translated,paired,total)=>'訳文 '+translated+' 件、対応 '+paired+' / '+total+' 件',source:name=>'出典 '+name},
};
export function zeroPatchReport(locale,state){
 const patch=state?.patch,c=patch?.coverage;
 if(!c)return null;
 const w=patchReportWords[locale]||patchReportWords.en,n=value=>value.toLocaleString(locale);
 const sections=[w.original(n(c.originalEntries))];
 for(const scope of ['script','interface']){
  const report=c[scope];
  if(scope==='script'&&c.translationQuality){
   const labels=locale==='zh'?['正文','选项','本地配对 / 已提取','全作总数未知']:locale==='ja'?['本文','選択肢','ローカル訳 / 抽出件数','作品全体の件数は不明']:['Dialogue','Choices','local pairs / extracted','whole-game totals unknown'];
   for(const [i,role] of ['body','choice'].entries()){
    const count=c.translationQuality[role];
    sections.push(labels[i]+' '+(count.localPaired==null?'?':n(count.localPaired))+' / '+n(count.extracted)+' ('+labels[2]+')');
   }
   sections.push(labels[3]);continue;
  }
  if(report?.originalEntries)sections.push(w[scope]+' '+w.counts(n(report.translations),n(report.paired),n(report.originalEntries)));
 }
 const paths=patch.sources?.length?patch.sources:[patch.source||patch.file].filter(Boolean);
 if(!c.translationQuality)sections.push(locale==='zh'?'选项未单独统计，全作总数未知':locale==='ja'?'選択肢の個別集計なし、作品全体の件数は不明':'Choices not counted separately, whole-game totals unknown');
 if(paths.length===1)sections.push(w.source(paths[0].split(/[/\\]/).pop()));
 const lead=state.patchStatus==='interface-only'?w.interfaceOnly:state.patchStatus==='ready'?w.ready:(sourceWords[locale]||sourceWords.en).unreliable;
 return {text:[lead,...sections].join(' · '),title:paths.join('\n')};
}
function errorCode(error){return String(error?.message||error).match(/[A-Z][A-Z0-9_]{4,}/)?.[0]||'';}

let openDialog=null;
export function openGameLanguage({id,title,api,invoke,locale,esc,onActivity,onOriginal}){
 if(openDialog)return;
 const w=sourceWords[locale]||sourceWords.en,u=sourceUI[locale]||sourceUI.en;
 const dialog=document.createElement('dialog');dialog.className='exe-dialog zero-source-dialog';openDialog=dialog;
 dialog.setAttribute('aria-labelledby','zero-source-title');
 dialog.innerHTML=`<h2 id="zero-source-title">${u.label}</h2><p>${esc(title)}</p>
  <label class="locale-toggle"><input type="checkbox" role="switch" data-ts-enabled disabled><span class="review-switch" aria-hidden="true"></span><strong>${u.preference}</strong></label>
  <p class="settings-help" data-ts-activity role="status">${u.checking}</p>
  <section class="exe-bilingual">
   <p class="settings-help" role="status" data-ts-status>${w.checking}</p>
   <p class="settings-help" data-ts-example hidden></p>
   <p class="settings-help">${u.guide}</p><p class="settings-help">${u.disc}</p>
   <div class="exe-bilingual-actions">
    <button type="button" class="secondary" data-ts="file">${u.file}</button>
    <button type="button" class="secondary" data-ts="folder">${u.folder}</button>
    <button type="button" class="secondary" data-ts="search" hidden>${w.search}</button>
    <button type="button" class="secondary" data-ts="original" hidden>${u.original}</button>
    <button type="button" class="text-button" data-ts-clear hidden>${w.clear}</button>
   </div>
   <p class="settings-help zero-source-error" role="status" data-ts-error></p>
  </section><div class="dialog-actions"><button type="button" class="secondary" data-close>${u.close}</button></div>`;
 const q=s=>dialog.querySelector(s),status=q('[data-ts-status]'),activityStatus=q('[data-ts-activity]'),errorStatus=q('[data-ts-error]'),example=q('[data-ts-example]');
 const enabled=q('[data-ts-enabled]'),fileBtn=q('[data-ts="file"]'),folderBtn=q('[data-ts="folder"]'),searchBtn=q('[data-ts="search"]'),originalBtn=q('[data-ts="original"]'),clearBtn=q('[data-ts-clear]');
 const buttons=[fileBtn,folderBtn,searchBtn,originalBtn,clearBtn];
 let timer=0,last=null,activity,working=false,snapshot=0,sourceRequest=0,openOriginal=false;
 document.body.append(dialog);
 dialog.addEventListener('close',()=>{
  clearTimeout(timer);dialog.remove();if(openDialog===dialog)openDialog=null;
  if(openOriginal)onOriginal?.();
 },{once:true});
 dialog.addEventListener('cancel',event=>{if(working)event.preventDefault();});
 dialog.showModal();
 q('[data-close]').onclick=()=>{if(!working)dialog.close();};

 function paintActivity(value){
  activity=value;onActivity?.(value);
  if(!dialog.open)return;
  activityStatus.textContent=zeroActivityLabel(locale,value);
  enabled.checked=value?.enabled===true;
  enabled.disabled=working||!value;
  if(last)paint(last);
 }
 async function loadActivity(){
  const current=++snapshot;
  try{
   const value=await api('text_source_activity',{id});
   if(current===snapshot&&dialog.open)paintActivity(value);
  }catch{if(current===snapshot&&dialog.open)paintActivity(null);}
 }
 const pairText=p=>typeof p?.total==='number'?w.pairing(p,w.pairReasons):'';
 function paint(s){
  if(!dialog.open)return;
  last=s;clearTimeout(timer);
  status.removeAttribute('title');
  searchBtn.hidden=originalBtn.hidden=clearBtn.hidden=true;
  example.hidden=!s?.patchHint;
  example.textContent=s?.patchHint?u.example(s.patchHint):'';
  if((activity?.embedded||activity?.perGame)&&activity.hasPairs){
   status.textContent=activity.perGame?({zh:'已为本作品启用导入时配对的原汉化译文，可从「日文原版与恢复」撤销',en:'Paired translations from the original Chinese script are enabled for this game. Undo is available in Japanese original & restore',ja:'この作品では取り込み時に照合した中国語訳が有効です。「日本語版と復元」から元に戻せます'})[locale]||u.embedded:u.embedded;
   originalBtn.hidden=false;return;
  }
  if(s?.patchStatus==='ready'||s?.patchStatus==='interface-only'||s?.patchStatus==='unreliable'&&s.patch?.coverage){
   const report=zeroPatchReport(locale,s);
   status.textContent=report?.text||((s.patch?.auto?w.autoReady:w.patchReady)(s.patch?.lines||0)+pairText(s.patchAlignment?.pairing));
   if(report?.title)status.title=report.title;
   clearBtn.hidden=false;clearBtn.dataset.kind='patch';searchBtn.hidden=s.patchStatus==='ready';return;
  }
  if(s?.mode==='original'&&s.status==='ready'){
   status.textContent=w.originalReady+pairText(s.alignment?.pairing);clearBtn.hidden=false;clearBtn.dataset.kind='original';return;
  }
  if(s?.cold?.state==='preparing'){
   status.textContent=w.coldPreparing;timer=setTimeout(load,3000);return;
  }
  if(s?.status==='preparing'&&s.preparing){
   const p=s.preparing,garbro=p.kind==='garbro';
   if(garbro||p.kind==='unpack'){
    status.textContent=garbro&&p.stage==='download'?w.garbroDownload(p.total?Math.min(99,Math.round(p.received/p.total*100)):0):w.unpacking(p.startedAt?Math.max(0,Math.round((Date.now()-p.startedAt)/1000)):0);
    timer=setTimeout(load,garbro?1500:3000);
   }else status.textContent=s.cold?.result==='steam'?w.coldSteam:w.capture;
   return;
  }
  if(!s||s.status==='failed'){status.textContent=u.failed;return;}
  if(s.status==='unsupported'){status.textContent=u.errors.NO_SUPPORTED_SCRIPT;return;}
  if(s.status==='chinese-only'){status.textContent=w.chineseOnly;originalBtn.hidden=false;return;}
  if(s.status!=='native-japanese'){
   status.textContent=s.status==='unreliable'?w.unreliable+pairText(s.alignment?.pairing):w.patched;
   originalBtn.hidden=false;return;
  }
  if(s.patchSearch?.running){status.textContent=w.searching;timer=setTimeout(load,1500);return;}
  const launcherName=s.patchLauncher?.file?String(s.patchLauncher.file).split(/[\\/]/).pop():'';
  status.textContent=s.patchStatus==='unreliable'?w.unreliable+pairText(s.patchAlignment?.pairing):launcherName?w.launcher(launcherName,s.patchHint||''):s.patchSearch?.declined?w.declined:w.notFound(s.patchHint||'');
  searchBtn.hidden=false;
  if(s.patch){clearBtn.hidden=false;clearBtn.dataset.kind='patch';}
 }
 async function load(search=false){
  const serial=++sourceRequest;
  try{const value=await api('text_source_status',{id,search,passive:true});if(serial===sourceRequest)paint(value);}
  catch{if(dialog.open&&serial===sourceRequest)status.textContent=u.failed;}
 }
 const busy=on=>{
  working=on;dialog.setAttribute('aria-busy',String(on));
  for(const b of buttons)b.disabled=on;
  q('[data-close]').disabled=on;enabled.disabled=on||!activity;
 };
 const once=fn=>async()=>{if(working)return;busy(true);++sourceRequest;clearTimeout(timer);errorStatus.textContent='';try{await fn();}finally{busy(false);}};
 async function importSource(pick){
  try{
   const source=await pick();if(!source){if(last)paint(last);else await load();return;}
   status.textContent=w.importing;
   paint(await api('text_source_import',{id,kind:'patch',dir:source}));
  }catch(error){
   const code=errorCode(error);
   await load();
   if(code!=='PATCH_PACKED_LAUNCHER')errorStatus.textContent=u.errors[code]||w.errors[code]||w.failed;
  }finally{await loadActivity();}
 }
 fileBtn.onclick=once(()=>importSource(()=>invoke('pick_patch_file',{title:u.file,directory:last?.gameDir||null})));
 folderBtn.onclick=once(()=>importSource(async()=>(await invoke('pick_directories',{multiple:false}))?.[0]));
 originalBtn.onclick=()=>{openOriginal=true;dialog.close();};
 searchBtn.onclick=once(async()=>{status.textContent=w.searching;await load(true);await loadActivity();});
 clearBtn.onclick=once(async()=>{
  try{paint(await api('text_source_clear',{id,kind:clearBtn.dataset.kind}));}
  catch{errorStatus.textContent=u.clearFailed;}
  await loadActivity();
 });
 enabled.onchange=once(async()=>{
  ++snapshot;
  try{paintActivity(await api('text_source_toggle',{id,enabled:enabled.checked}));}
  catch{await loadActivity();errorStatus.textContent=u.saveFailed;}
 });
 void load().then(loadActivity);
}

export function mountOriginalExecutable(host,{id,api,invoke,locale,toast,onChanged,isBusy=()=>false,onBusy=()=>{}}){
 const [,find,pick,,hint,saved,searching,textImport,textHint,textReady,textUnavailable]=labels[locale]||labels.en;
 host.innerHTML=`<p class="settings-help">${hint}</p><p class="exe-path" role="status"></p>
  <div class="jr-program-actions">
   <button type="button" class="secondary" data-find disabled>${find}</button>
   <button type="button" class="secondary" data-pick disabled>${pick}</button>
  </div>
  <details><summary>${textImport}</summary><p class="settings-help">${textHint}</p><button type="button" class="secondary" data-pair>${textImport}</button></details>`;
 const status=host.querySelector('[role=status]'),controls=[...host.querySelectorAll('button')];
 let state=null,working=false;
 const setBusy=on=>{working=on;for(const button of controls)button.disabled=on;host.setAttribute('aria-busy',String(on));onBusy(on);};
 const message=state=>state.executable||launchReason('JAPANESE_EXECUTABLE_REQUIRED',locale);
 async function load(){
  try{state=await api('game_original_executable',{id});status.textContent=message(state);}
  catch(error){status.textContent=originalExecutableError(error,locale);}
  finally{controls.forEach(button=>{button.disabled=false;});}
 }
 async function save(mode){
  if(working||isBusy())return;setBusy(true);
  try{
   const executable=mode==='select'?await invoke('pick_executable',{directory:state?.directory||null}):undefined;
   if(!host.isConnected||mode==='select'&&!executable)return;
   status.textContent=searching;
   state=await api('game_original_executable',{id,mode,executable});
   status.textContent=message(state);toast(saved);
   await onChanged?.();
  }catch(error){status.textContent=originalExecutableError(error,locale);}
  finally{setBusy(false);}
 }
 controls[0].onclick=()=>save('find');controls[1].onclick=()=>save('select');
 controls[2].onclick=async()=>{
  if(working||isBusy())return;setBusy(true);
  try{
   const dir=(await invoke('pick_directories',{multiple:false}))?.[0];
   if(!dir||!host.isConnected)return;
   const result=await api('text_source_import',{id,kind:'original',dir});
   const status=await api('text_source_activity',{id});
   toast(result.mode==='original'&&status.hasPairs?textReady:textUnavailable);
   await onChanged?.();
  }catch(error){const w=sourceWords[locale]||sourceWords.en;toast(w.errors[errorCode(error)]||w.failed);}
  finally{setBusy(false);}
 };
 void load();
}
