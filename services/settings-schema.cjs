// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fields=[];
const field=(scope,key,zh,en,ja,type='text',extra={})=>fields.push({scope,key,label:{zh,en,ja},type,...extra});
const bool=(scope,key,zh,en,ja)=>field(scope,key,zh,en,ja,'boolean');
const num=(scope,key,zh,en,ja,min,max,step=1)=>field(scope,key,zh,en,ja,'number',{min,max,step});
const choice=(scope,key,zh,en,ja,options)=>field(scope,key,zh,en,ja,'select',{options});
const option=(value,zh,en=zh,ja=zh)=>({value,label:{zh,en,ja}});

choice('translation','provider','翻译引擎','Translation engine','翻訳エンジン',[
 option('google','Google 免费翻译','Google free','Google 無料翻訳'),option('microsoft','Microsoft Edge 免费翻译','Microsoft Edge free','Microsoft Edge 無料翻訳'),option('gpt','GPT / OpenAI 兼容接口（自定义地址）',
  'GPT / OpenAI-compatible API','GPT / OpenAI 互換 API'),option('deepseek','DeepSeek（深度求索）','DeepSeek','DeepSeek'),option('gemini','Gemini（谷歌）','Google Gemini','Google Gemini'),
  option('deepl','DeepL（德国机器翻译 API）','DeepL API','DeepL API'),option('bing','Azure Translator（微软翻译 API）','Azure Translator','Azure Translator'),option('sakura',
  'Sakura（本地翻译模型）','Sakura local','Sakura ローカル'),{...option('llamacpp','llama.cpp 本地模型','llama.cpp local','llama.cpp ローカル'),hidden:true},
 // Display names only; the stored value stays the engine id so existing configs keep working. "Name（note）" shows the note as a quiet suffix in the list.
 option('claude','Claude（Anthropic 官方接口）','Anthropic Claude','Anthropic Claude'),option('qwen','通义千问（阿里云百炼）','Qwen (Alibaba Cloud Model Studio)','Qwen（Alibaba Cloud）'),
  option('kimi','Kimi（月之暗面）','Kimi (Moonshot AI)','Kimi（Moonshot AI）'),option('glm','智谱 GLM（智谱开放平台）','Zhipu GLM','Zhipu GLM'),option('siliconflow','硅基流动 SiliconFlow（模型聚合平台）',
  'SiliconFlow','SiliconFlow'),option('doubao','豆包（火山方舟）','Doubao (Volcengine Ark)','Doubao（Volcengine Ark）'),option('grok','Grok（xAI 官方接口）','xAI Grok','xAI Grok'),
  option('mistral','Mistral（法国 Mistral AI）','Mistral AI','Mistral AI'),option('openrouter','OpenRouter（多模型聚合平台）','OpenRouter','OpenRouter'),
 option('baiduapi','百度翻译（百度翻译开放平台 API）','Baidu Translate API','百度翻訳 API'),option('youdaoapi','有道翻译（有道智云 API）','Youdao Translate API','Youdao 翻訳 API'),option('tencentapi',
  '腾讯翻译君（腾讯云机器翻译 API）','Tencent Machine Translation API','Tencent 機械翻訳 API'),option('aliyunapi','阿里翻译（阿里云机器翻译 API）','Alibaba Cloud Machine Translation API','Alibaba Cloud 機械翻訳 API'),
  option('caiyunapi','彩云小译（彩云开放平台 API）','Caiyun Xiaoyi (LingoCloud) API','彩雲小訳 API'),option('xiaoniu','小牛翻译（小牛开放平台 API）','NiuTrans API','NiuTrans 翻訳 API'),option('googleapi',
  'Google 翻译（谷歌云 Cloud Translation API）','Google Cloud Translation API','Google Cloud 翻訳 API'),option('yandexapi','Yandex 翻译（Yandex 云 API）','Yandex Translate API',
  'Yandex 翻訳 API')]);
field('translation','baseUrl','API 地址','API base URL','API アドレス');field('translation','model','模型名称','Model','モデル名');field('translation','region','Azure 区域','Azure region',
 'Azure リージョン');
choice('translation','deeplTier','DeepL 账户','DeepL account','DeepL アカウント',[option('free','Free'),option('pro','Pro')]);
choice('translation','reviewEngine','社区评价翻译','Community review translation','コミュニティレビューの翻訳',[option('machine','免费机翻（Google，支持多种语言）','Free machine translation (Google, many languages)',
 '無料機械翻訳（Google・多言語）'),option('follow','跟随翻译引擎（API / 云端大模型）','Follow translation engine (API / cloud model)','翻訳エンジンに合わせる（API・クラウドモデル）'),option('local','本地大模型',
 'Local model','ローカルモデル')]);
choice('translation','learnerLanguage','学习者语言','Learner language','学習者の言語',[option('zh','中文','Chinese','中国語'),option('en','英语','English','英語')]);
bool('translation','contextEnabled','上下文翻译','Context translation','文脈を使って翻訳');bool('translation','scriptColdRun','后台准备加密剧本','Prepare encrypted scripts in the background',
 '暗号化シナリオをバックグラウンドで準備');bool('translation','scriptTranslation','零延迟翻译（汉化脚本）','Zero-latency translation (translation script)','ゼロ遅延翻訳（翻訳スクリプト）');num('translation',
 'contextLines','上下文句数','Context lines','文脈の文数',1,8);bool('translation','enabled','显示译文','Show translation','翻訳を表示');
choice('dictionary','readingEngine','分词与读音引擎','Tokenizer and readings','分かち書き・読み方',[option('sudachi','SudachiDict Full'),option('unidic','UniDic')]);
choice('dictionary','contextProvider','上下文解释来源（需自备 AI 的 API Key，推荐 DeepSeek）','Context explanations (your own AI API key; DeepSeek recommended)','文脈解説の取得先（AI の API キーが必要・DeepSeek 推奨）',
 [option('deepseek','DeepSeek（推荐，性价比高）','DeepSeek (recommended, great value)','DeepSeek（推奨・高コスパ）'),option('follow','跟随翻译引擎','Follow translation engine','翻訳エンジンに合わせる'),
 option('gpt','OpenAI / 自定义','OpenAI / custom','OpenAI / カスタム'),option('gemini','Gemini'),...['qwen','kimi','glm'].map(name=>option(name,require('../core/lookup-models.cjs').titles[name]))]);
choice('dictionary','lookupProvider','点读解释来源','Lookup explanations','辞書解説の取得先',[option('local','本地辞书','Local dictionary','ローカル辞書'),option('moji','MOJi 辞書（联网，可登录账号）',
 'MOJi dictionary (online, sign-in supported)','MOJi 辞書（オンライン・ログイン可）'),option('follow','跟随翻译引擎','Follow translation engine','翻訳エンジンに合わせる'),option('gpt','OpenAI / 自定义',
 'OpenAI / custom','OpenAI / カスタム'),option('deepseek','DeepSeek'),option('gemini','Gemini'),...['qwen','kimi','glm'].map(name=>option(name,require('../core/lookup-models.cjs').titles[name]))]);
for(const name of Object.keys(require('../core/lookup-models.cjs').presets)){field('dictionary',`lookupProfiles.${name}.baseUrl`,`${name} · AI 释义服务地址`,`${name} · AI explanation URL`,
 `${name} · AI 解説 API`);field('dictionary',`lookupProfiles.${name}.model`,`${name} · AI 释义模型`,`${name} · AI explanation model`,`${name} · AI 解説モデル`);}

for(const[key,zh,en,ja]of [
 ['typewriter','逐字显示','Typewriter','文字送り'],['furigana','假名注音','Furigana','ふりがな'],['japaneseBold','日文粗体','Bold Japanese','日本語を太字'],['chineseBold','译文粗体','Bold translation',
  '翻訳を太字'],['japaneseOutline','日文描边','Japanese outline','日本語の縁取り'],['chineseOutline','译文描边','Translation outline','翻訳の縁取り'],['rubyOutline','注音描边','Furigana outline',
  'ふりがなの縁取り'],['autoScale','随游戏窗口缩放','Scale with game window','ゲーム画面に合わせて拡縮'],['textGradient','未读文字渐变','Unread text gradient','未読文字のグラデーション'],['readTextGradient',
  '已读文字渐变','Read text gradient','既読文字のグラデーション']])bool('text',key,zh,en,ja);
for(const[key,zh,en,ja,min,max,step]of [
 ['typewriterSpeed','逐字显示速度','Typewriter speed','文字送り速度',5,120,1],['japaneseSize','日文字号','Japanese size','日本語のサイズ',14,60,1],['translationSize','译文字号','Translation size',
  '翻訳のサイズ',12,60,1],['rubyScale','注音大小','Furigana size','ふりがなのサイズ',.2,.85,.01],['rubyOffsetX','注音横向偏移','Furigana horizontal offset','ふりがなの左右位置',-40,40,1],['rubyOffsetY',
  '注音纵向偏移','Furigana vertical offset','ふりがなの上下位置',-100,100,1],['lineHeight','日文行距调整','Japanese line spacing','日本語の行間',-1.9,4,.05],['japaneseSpacingPx','日文字距','Japanese letter spacing',
  '日本語の字間',-15,25,.5],['chineseSpacingPx','译文字距','Translation letter spacing','翻訳の字間',-15,25,.5],['translationLineHeight','译文行距','Translation line spacing','訳文の行間',
  -.8,3,.05],['gap','原文与译文间距','Gap between original and translation','原文と訳文の間隔',-28,40,1],['translationWidth','译文换行宽度（0 跟随日文）','Translation wrap width (0 follows Japanese)',
  '翻訳の折返し幅（0 は日本語に合わせる）',0,100,1],['paddingX','文字左右边距','Horizontal text padding','文字の左右余白',-200,200,1],['paddingY','文字上下边距','Vertical text padding','文字の上下余白',-40,
  60,1],['japaneseOutlineWidth','日文描边宽度','Japanese outline width','日本語の縁取り幅',0,4,.1],['chineseOutlineWidth','译文描边宽度','Translation outline width','翻訳の縁取り幅',0,4,.1],
  ['rubyOutlineWidth','注音描边宽度','Furigana outline width','ふりがなの縁取り幅',0,2,.05],['textGradientStart','未读渐变起点','Unread gradient start','未読グラデーションの開始',0,95,1],['readTextGradientStart',
  '已读渐变起点','Read gradient start','既読グラデーションの開始',0,95,1]])num('text',key,zh,en,ja,min,max,step);
for(const[key,zh,en,ja]of [['textColor','未读文字颜色','Unread text color','未読文字の色'],['readTextColor','已读文字颜色','Read text color','既読文字の色'],['textGradientTop','未读渐变上色',
 'Unread gradient top','未読グラデーション上色'],['textGradientBottom','未读渐变下色','Unread gradient bottom','未読グラデーション下色'],['readTextGradientTop','已读渐变上色','Read gradient top',
 '既読グラデーション上色'],['readTextGradientBottom','已读渐变下色','Read gradient bottom','既読グラデーション下色'],['japaneseOutlineColor','日文描边颜色','Japanese outline color','日本語の縁取り色'],['chineseOutlineColor',
 '译文描边颜色','Translation outline color','翻訳の縁取り色'],['rubyOutlineColor','注音描边颜色','Furigana outline color','ふりがなの縁取り色']])field('text',key,zh,en,ja,'color');
choice('text','display','显示内容','Displayed text','表示内容',[option('bilingual','日文与译文','Japanese and translation','日本語と翻訳'),option('japanese','仅日文','Japanese only',
 '日本語のみ'),option('chinese','仅译文','Translation only','翻訳のみ')]);
choice('text','japaneseFont','日文字体','Japanese font','日本語フォント',['originalGothic','originalMincho','yuMincho','yuGothic','meiryo'].map(v=>option(v,...({originalGothic:['游戏原字体（黑体）',
 'Original game sans','ゲームのゴシック体'],originalMincho:['游戏原字体（明朝）','Original game serif','ゲームの明朝体'],yuMincho:['游明朝','Yu Mincho','游明朝'],yuGothic:['游ゴシック','Yu Gothic',
 '游ゴシック'],meiryo:['メイリオ','Meiryo','メイリオ']}[v]))));
choice('text','chineseFont','译文字体','Translation font','翻訳フォント',['patch','simhei','yahei','simsun','kaiti'].map(v=>option(v,...({patch:['游戏译文字体','Game translation font',
 'ゲームの翻訳フォント'],simhei:['黑体','SimHei','SimHei'],yahei:['微软雅黑','Microsoft YaHei','Microsoft YaHei'],simsun:['宋体','SimSun','SimSun'],kaiti:['楷体','KaiTi','KaiTi']}[v]))));
choice('text','rubyFont','注音字体','Furigana font','ふりがなフォント',['round','gothic','mincho','inherit'].map(v=>option(v,...({round:['圆体','Rounded','丸ゴシック'],gothic:['黑体',
 'Sans','ゴシック'],mincho:['明朝','Serif','明朝'],inherit:['跟随日文','Follow Japanese','日本語に合わせる']}[v]))));
choice('text','shadow','文字阴影','Text shadow','文字の影',['outline','soft','none'].map(v=>option(v,...({outline:['描边','Outline','縁取り'],soft:['柔和阴影','Soft shadow','柔らかい影'],
 none:['关闭','Off','なし']}[v]))));

choice('embedding','hookProfile','Hook 模式','Hook mode','Hook モード',[option('read','读取原文','Read source','原文を取得'),option('embed','内嵌','Embedding','埋め込み'),option('euphoria474',
 'euphoria 0.474'),option('off','关闭','Off','オフ')]);
for(const[key,zh,en,ja]of [['hookAutoStart','绑定后自动启动 Hook','Start Hook after binding','紐付け後に Hook を開始'],['hookHide','隐藏游戏原文','Hide game source','ゲームの原文を隠す'],['hookFast',
 '快速 Hook','Fast Hook','高速 Hook'],['autoGameStyle','自动同步游戏样式','Match game style automatically','ゲームの文字設定を自動取得'],['hideWaitMarker','隐藏点击等待图标','Hide wait marker',
 'クリック待ちアイコンを隠す'],['relocateWaitMarker','重定位点击等待图标','Reposition wait marker','クリック待ちアイコンを移動']])bool('embedding',key,zh,en,ja);
bool('immersion','immersion','沉浸模式','Immersion mode','没入モード');choice('immersion','dialogDetection','对话框检测','Dialogue detection','会話枠の検出',[option('marker','点击等待图标',
 'Wait marker','クリック待ちアイコン'),option('hook','Hook 信号','Hook signals','Hook 信号'),option('visual','画面检测','Visual detection','画面検出')]);
for(const[key,zh,en,ja,min,max]of [['x','文字框横向位置','Reader horizontal position','字幕の横位置',0,95],['y','文字框纵向位置','Reader vertical position','字幕の縦位置',0,95],['width',
 '文字框宽度','Reader width','字幕の幅',20,100],['height','文字框高度','Reader height','字幕の高さ',10,90],['scanX','OCR 区域横向位置','OCR horizontal position','OCR 領域の横位置',0,95],['scanY',
 'OCR 区域纵向位置','OCR vertical position','OCR 領域の縦位置',0,95],['scanWidth','OCR 区域宽度','OCR width','OCR 領域の幅',5,100],['scanHeight','OCR 区域高度','OCR height','OCR 領域の高さ',
 5,100]])num('position',key,zh,en,ja,min,max);

field('speech','aivisUrl','语音服务地址','Speech service URL','音声サービスのアドレス');num('speech','aivisSpeaker','话者样式 ID','Speaker style ID','話者スタイル ID',0,2147483647);num('speech',
 'aivisSpeed','语速','Speech speed','話速',.5,2,.05);num('speech','aivisVolume','音量','Volume','音量',0,1,.05);bool('speech','aivisGpu','显卡加速','GPU acceleration','GPU アクセラレーション');
 bool('speech','aivisAutoSpeak','点读或选中后自动朗读','Read aloud after a lookup or selection','クリック・選択後に自動で読み上げ');
field('anki','ankiUrl','AnkiConnect 地址','AnkiConnect URL','AnkiConnect アドレス');field('anki','ankiDeck','制卡牌组','Mining deck','単語登録先デッキ');field('anki','ankiModel',
 '制卡笔记类型','Mining note type','単語登録のノートタイプ');field('anki','ankiPath','Anki 程序路径','Anki executable','Anki 実行ファイル');bool('anki','ankiAutoStart','随 MeguLit 启动 Anki',
 'Start Anki with MeguLit','MeguLit と一緒に Anki を起動');bool('anki','ankiAutoClose','退出 MeguLit 时关闭由它启动的 Anki','Close Anki on exit if MeguLit started it','MeguLit が起動した Anki を終了時に閉じる');
 bool('anki','ankiHidden','隐藏 Anki 窗口（不占任务栏）','Hide the Anki window (no taskbar entry)','Anki のウィンドウを隠す（タスクバーに出さない）');bool('anki','ankiAudio','卡片附带语音','Attach audio',
 'カードに音声を付ける');bool('anki','ankiGameMedia','优先游戏原声与截图','Prefer game audio and screenshot','ゲーム音声と画像を優先');bool('anki','ankiVoiceIsolate','游戏录音去掉背景音乐','Remove the music from recorded game voices',
 '録音したボイスから BGM を除く');
for(const[key,zh,en,ja,type,min,max]of [['blur','背景模糊','Background blur','背景のぼかし','number',0,40],['dim','背景变暗','Darken background','背景を暗く','number',0,100],['saturate',
 '背景饱和度','Background saturation','背景の彩度','number',0,200],['glass','毛玻璃面板','Frosted panels','すりガラスのパネル','boolean'],['glassBlur','主页毛玻璃模糊','Home glass blur','ホームのすりガラスのぼかし',
 'number',0,40],['glassAlpha','主页毛玻璃不透明度','Home glass opacity','ホームのすりガラスの不透明度','number',0,100]])field('background',key,zh,en,ja,type,{min,max});
const panelNames={menu:['Alt+T 菜单','Alt+T menu','Alt+T メニュー'],log:['对话记录','Dialogue log','会話ログ'],card:['点读窗口','Lookup card','辞書カード']};
num('background','crop.x','图片横向位置','Image horizontal position','画像の横位置',0,100);num('background','crop.y','图片纵向位置','Image vertical position','画像の縦位置',0,100);num('background',
 'crop.zoom','图片缩放','Image zoom','画像の拡大率',1,5,.05);
for(const[panel,names]of Object.entries(panelNames)){
 choice('panels',`surfaces.${panel}`,`${names[0]}背景`,`${names[1]} background`,`${names[2]}の背景`,[option('image','背景图','Picture','背景画像'),option('glass','毛玻璃','Frosted glass',
  'すりガラス'),option('both','背景图 + 毛玻璃','Picture + glass','画像＋すりガラス'),option('plain','纯色','Plain','単色')]);
 for(const[key,zh,en,ja,min,max]of [['blur','背景模糊','Picture blur','画像のぼかし',0,40],['dim','背景变暗','Picture dimming','画像の暗さ',0,100],['saturate','背景饱和度','Picture saturation',
  '画像の彩度',0,200],['alpha','面板不透明度','Panel opacity','パネルの不透明度',0,100],['radius','圆角','Corner radius','角の丸み',0,40],['border','边框亮度','Border brightness','枠の明るさ',0,
  100],['glassBlur','毛玻璃模糊','Glass blur','すりガラスのぼかし',0,40],['glassDim','毛玻璃变暗','Glass dimming','すりガラスの暗さ',0,100],['glassSaturate','毛玻璃饱和度','Glass saturation','すりガラスの彩度',
  0,200]])num('panels',`panels.${panel}.${key}`,`${names[0]} · ${zh}`,`${names[1]} · ${en}`,`${names[2]} · ${ja}`,min,max);
}
field('library','steamPath','Steam 安装目录','Steam folder','Steam フォルダ');field('library','folders','其他游戏目录（一行一个）','Other game folders (one per line)','ほかのゲームフォルダ（1行に1つ）',
 'multiline');
bool('library','autoSeries','自动识别游戏系列','Automatically recognize game series','ゲームシリーズを自動認識');
/* E370: anonymous adaptation records (hook stream, embed result, calibration) shared between users; off stops both directions */
/* 2026-11-12 the game's good-looking scenes, captured quietly for the detail card's back (scene-shots.cjs) */
bool('library','sceneShots','后台截下好看的场景','Keep good-looking scenes in the background','きれいな場面をバックグラウンドで保存');
bool('library','sharedAdaptation','共享适配数据（匿名）','Share adaptation data (anonymous)','適応データの共有（匿名）');
/* E596 runtime harvest: read a running game's memory (read-only) for keys / index / script structure
   (services/runtime-harvest.cjs explain()). 2026-11-14 (owner: 默认打开就行了): on unless the user turned it off. */
bool('library','runtimeHarvest','运行时读取游戏结构（只读）','Runtime structure harvest (read-only)','実行時の構造収集（読み取りのみ）');
/* 2026-11-14 desensitized probe of games that do not read well, uploaded in the background (services/probe-auto.cjs);
   one probe per game on the server (dedupe). On unless the user turned it off. */
bool('library','probeUpload','自动上传读不出的游戏的脱敏结构（不含文本，可关）','Upload desensitized structure of games that do not read (no text)','読めないゲームの匿名化した構造を自動送信（文章なし）');
for(const engine of ['ollama','lmstudio'])fields.find(f=>f.scope==='translation'&&f.key==='provider').options.push(engine==='ollama'?option(engine,'Ollama（本地模型）',
 'Ollama','Ollama'):option(engine,'LM Studio（本地模型）','LM Studio','LM Studio'));
choice('lookup','lookup_mode','查词触发方式','Lookup gesture','辞書を開く操作',[option('click','单击','Click','クリック'),option('hover','悬停','Hover','ホバー')]);
for(const[key,zh,en,ja]of [['word_highlight_enabled','词汇高亮','Word highlighting','単語を色分け'],['show_related_entries','显示相关词条','Show related entries','関連項目を表示'],['underline_mined_words',
 '标记已收录单词','Underline mined words','登録済みの単語に下線'],['track_unknown_words','记录未掌握单词','Track unknown words','未習得の単語を記録'],['treat_new_as_unknown','新单词视为未掌握','Treat new words as unknown',
 '新出単語を未習得と扱う'],['underline_names','标记专有名词','Underline names','固有名詞に下線']])bool('lookup',key,zh,en,ja);
num('lookup','unknown_words_count','未掌握单词显示数','Unknown words shown','未習得単語の表示数',1,100);num('lookup','unknown_words_min_lookups','未掌握单词最少查询次数','Minimum lookups for unknown words',
 '未習得とする最低検索回数',1,100);num('lookup','status_underline_width','标记下划线宽度','Underline width','下線の太さ',0,5,.1);
for(let i=0;i<5;i++)field('lookup',`word_level_colors.${i}`,`${['新收录','学习中','熟悉','掌握','精通'][i]} · 标记颜色`,`${['New','Learning','Familiar','Known','Mastered'][i]} · highlight color`,
 `${['新規','学習中','見覚えがある','習得済み','熟知'][i]}・色`,'color');
num('study','word_review_count','每轮单词复习数','Words per review','1回の単語復習数',1,500);num('study','sentence_review_count','每轮句子复习数','Sentences per review','1回の例文復習数',1,
 500);num('study','word_sentence_count','每个词条显示例句数','Examples per word','単語ごとの例文表示数',1,100);bool('study','only_review_translated','仅复习有译文的句子','Review translated sentences only',
 '翻訳のある例文だけ復習');bool('study','safe_examples','全年龄例句（不出现露骨台词）','All-ages examples (no explicit lines)','全年齢の例文（露骨なセリフを出さない）');
bool('study','safe_cg','卡背过滤 R18 图片','Keep R18 pictures off the card back','カード裏の R18 画像を除外');
choice('study','default_dictionary_sort','词汇排序','Vocabulary order','単語の並び順',[option('date','收录时间','Date added','登録日'),option('spelling','词形','Spelling','表記'),option('status',
 '掌握程度','Mastery','習得度')]);
bool('reader','history_enabled','保存阅读历史','Save reading history','読書履歴を保存');num('reader','history_span','阅读历史保留天数','Reading history days','読書履歴の保存日数',1,36500);bool('reader',
 'sentence_window_inverted','翻转原文与译文位置','Reverse source and translation order','原文と翻訳の順序を反転');
const groups=[['translation','翻译','Translation','翻訳'],['dictionary','辞典与解释','Dictionaries and explanations','辞書・解説'],['lookup','查词与高亮','Lookup and highlighting',
 '単語検索・色分け'],['study','学习与复习','Study and review','学習・復習'],['reader','阅读记录','Reading records','読書記録'],['text','文字与注音','Text and furigana','文字・ふりがな'],['embedding',
 '内嵌与 Hook','Embedding and Hook','埋め込み・Hook'],['immersion','沉浸模式','Immersion','没入モード'],['position','位置与 OCR','Position and OCR','位置・OCR'],['panels','游戏内面板','In-game panels',
 'ゲーム内パネル'],['speech','语音','Speech','音声'],['anki','Anki','Anki','Anki'],['library','游戏库','Library','ライブラリ'],['background','主页背景','Home background','ホーム背景'],['online',
 '联网服务','Online services','オンラインサービス']].map(([id,zh,en,ja])=>({id,label:{zh,en,ja}}));
for(const field of fields)if(field.scope==='dictionary'&&/^lookupProfiles\.(deepseek|gemini)\.baseUrl$/.test(field.key))field.readOnly=true;
field('reader','history_font_family','对话记录字体','Dialogue history font','会話履歴のフォント');
num('reader','history_font_size','对话记录字号','Dialogue history font size','会話履歴の文字サイズ',12,32,1);
num('reader','history_line_height','对话记录行高','Dialogue history line spacing','会話履歴の行間',1.3,2.6,.05);
// Home text settings use the same font catalogues as Alt+T (16 / 17 / 18 / 24 built-in options) and also cover English (E215).
{const {fontOptions}=require('../core/game-style.js'),named={originalGothic:['游戏原字体（黑体）','Original game sans','ゲームのゴシック体'],originalMincho:['游戏原字体（明朝）','Original game serif',
 'ゲームの明朝体'],patch:['游戏译文字体 font.ttf','Game translation font','ゲームの翻訳フォント'],round:['圆体','Rounded','丸ゴシック'],gothic:['黑体','Sans','ゴシック'],mincho:['明朝','Serif','明朝'],
 inherit:['跟随正文','Follow main text','本文に合わせる']};
 const options=key=>fontOptions[key].map(([id,family])=>named[id]?option(id,...named[id]):option(id,family));
 for(const key of ['japaneseFont','chineseFont','rubyFont'])fields.find(f=>f.scope==='text'&&f.key===key).options=options(key);
 choice('text','englishFont','英文字体','English font','英語フォント',options('englishFont'));
 for(const[key,zh,en,ja]of [['englishEnabled','英文单独样式','Separate English style','英語を個別に設定'],['englishBold','英文粗体','Bold English','英語を太字'],['englishOutline','英文描边',
  'English outline','英語の縁取り']])bool('text',key,zh,en,ja);
 for(const[key,zh,en,ja,min,max,step]of [['englishSize','英文字号','English size','英語のサイズ',12,60,1],['englishSpacingPx','英文字距','English letter spacing','英語の字間',-15,
  25,.5],['englishOutlineWidth','英文描边粗细','English outline width','英語の縁取りの太さ',0,4,.05]])num('text',key,zh,en,ja,min,max,step);
 field('text','englishOutlineColor','英文描边颜色','English outline color','英語の縁取り色','color');}
// New-game tip (E215): shown at each of a work's first five launches unless turned off here.
bool('reader','new_game_tip','新游戏推进提示','New-game tip','ニューゲームの案内');
// E377 online services: the leaderboard opt-in and the shared relay address (services/relay-config.cjs).
bool('online','leaderboardEnabled','参加排行榜','Join the leaderboard','ランキングに参加');
field('online','leaderboardName','排行榜昵称','Leaderboard nickname','ランキングのニックネーム');
bool('online','leaderboardShareGames','在排行榜公开我读过的游戏','Show the games I read on the leaderboard','読んだゲームをランキングで公開');
field('online','relayUrl','联网服务地址（留空使用默认）','Online service URL (empty uses the default)','オンラインサービスのアドレス（空欄で既定）');
// Continuous visual/audio parameters; counts and identifiers retain integer steps.
for(const item of fields)if(item.type==='number'&&(
 ['text','position','background','panels'].includes(item.scope)||
 item.scope==='speech'&&['aivisSpeed','aivisVolume'].includes(item.key)||
 item.scope==='lookup'&&item.key==='status_underline_width'||
 item.scope==='reader'&&['history_font_size','history_line_height'].includes(item.key)
))item.step='any';
module.exports={fields,groups};

