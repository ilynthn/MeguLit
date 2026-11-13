// SPDX-License-Identifier: GPL-3.0-or-later
// User-facing name and explanation of a game's in-game embedding status ("Hook" is not a word most players know).
const NAMES={
 zh:{verified:'内嵌已验证',supported:'内嵌已适配',pending:'内嵌待实测',readonly:'实测只能读取',unsupported:'不支持内嵌',unknown:'引擎未识别'},
 ja:{verified:'埋め込み確認済み',supported:'埋め込み対応',pending:'埋め込み未検証',readonly:'実測：読み取りのみ',unsupported:'埋め込み非対応',unknown:'エンジン不明'},
 en:{verified:'Embedding verified',supported:'Embedding supported',pending:'Embedding untested',readonly:'Tested: reading only',unsupported:'No embedding',unknown:'Engine unknown'}};
const TEXT={
 zh:{engine:'引擎',how:'原理：MeguLit 用 LunaHook 附加到游戏进程，在引擎处理台词的函数上读取文字；内嵌时在游戏绘制前把原文换成空白，由 MeguLit 在原位置显示日文、注音、翻译和点读',check:'确认方法：启动游戏推进一句，原文被 MeguLit 取代且没有残留，就会自动标记为「内嵌已验证」',
  status:{readonly:'本机实际运行时，这个游戏的文本流只能读取、不能内嵌，游戏原文会保持可见；可以在内嵌设置里改用 OCR 遮盖，或在「关于」里反馈',verified:'已在本机实际游戏中确认替换成功',supported:'引擎在 MeguLit 的适配列表中，尚未在本机实测',pending:'通用引擎或不同作品差异较大，需要实测确认',unsupported:'该引擎没有可用的内嵌方式，只能读取文字',unknown:'没有识别出游戏引擎，仍可尝试自动读取'}},
 ja:{engine:'エンジン',how:'仕組み：MeguLit は LunaHook でゲームのプロセスに接続し、台詞を処理する関数から文字を読み取ります。埋め込み時は描画前に原文を空白に置き換え、同じ位置に日本語・ルビ・翻訳・辞書を表示します',check:'確認方法：ゲームを起動して一文進め、原文が MeguLit に置き換わり残りがなければ自動で「埋め込み確認済み」になります',
  status:{readonly:'このPCで実際に動かしたところ、テキストは読み取れますが埋め込みはできません。OCR 遮蔽に切り替えるか「について」から報告してください',verified:'このPCの実際のゲームで置き換えを確認済み',supported:'MeguLit の対応エンジンですが、このPCではまだ未確認',pending:'汎用エンジンなど作品ごとの差が大きく、確認が必要',unsupported:'このエンジンには使える埋め込み方法がなく、読み取りのみ',unknown:'エンジンを判別できません。自動読み取りは試せます'}},
 en:{engine:'Engine',how:'How it works: MeguLit attaches LunaHook to the game process and reads lines where the engine handles dialogue; when embedding, it blanks the original before the game draws it and shows Japanese, furigana, translation and lookup in its place',check:'To confirm: start the game and advance one line. When the original is replaced with nothing left behind, the game is marked "Embedding verified" automatically',
  status:{readonly:'On this PC the game\'s text streams could be read but not embedded, so the original stays visible; switch to OCR cover in the embed settings or send feedback from About',verified:'Replacement confirmed in a real session on this PC',supported:'The engine is on MeguLit’s supported list, not yet tested on this PC',pending:'Generic engine or titles differ; needs a test',unsupported:'This engine has no usable embedding; reading only',unknown:'The engine was not recognised; automatic reading can still be tried'}}};
const HOOKS={'System4 (AliceSoft)':'System43','Leaf / AQUAPLUS':'EmbedLeaf (dialogue only)','CatSystem2':'EmbedToMeCS2 / CS2','YU-RIS':'YU-RIS 0.474 DrawHide','Unity':'Mono / IL2CPP','BGI / Ethornell':'BGI','MAGES':'MAGES','RealLive':'RealLive','KiriKiri':'KiriKiri','SiglusEngine':'Siglus','Artemis':'Artemis','Malie':'Malie','AdvHD / WillPlus':'AdvHD'};
export function embedStatus(game,locale){
 const support=String(game?.hookSupport||''),kind=support==='verified'?'verified':support==='readonly'?'readonly':['supported','available'].includes(support)?'supported':['unsupported','unavailable','none'].includes(support)?'unsupported':game?.engine?'pending':'unknown';
 const names=NAMES[locale]||NAMES.en,t=TEXT[locale]||TEXT.en,engine=game?.engine||'—',hook=HOOKS[game?.engine];
 const tooltip=[`${names[kind]} — ${t.status[kind]}`,`${t.engine}：${engine}${hook?' · LunaHook '+hook:''}`,t.how,t.check].join('\n');
 const strip=s=>String(s).replace(/^[^：:]{1,8}[：:]s*/,'');
 return {kind,label:names[kind],tooltip,parts:{status:t.status[kind],engineLabel:t.engine,engine:engine+(hook?' · LunaHook '+hook:''),howLabel:t.how.split(/[：:]/)[0],how:strip(t.how),checkLabel:t.check.split(/[：:]/)[0],check:strip(t.check)}};
}
