// SPDX-License-Identifier: GPL-3.0-or-later
const hints={
 word_review_count:['「学习 → 复习」里一轮最多出多少张单词卡；到期的卡会优先，做完这一轮再开下一轮','How many word cards one review round in Learning → Review holds; due cards come first','「学習 → 復習」で 1 回に出す単語カードの上限。期限の来たカードが先に出ます'],
 sentence_review_count:['一轮最多复习多少条收藏的句子（句子页里的台词）','How many saved lines (from Sentences) one review round holds','1 回に復習する保存済みの文（セリフ）の上限'],
 word_sentence_count:['单词卡和单词页里，每个词最多附带几条你在游戏里读到的例句','How many lines from your games are shown with each word on cards and in Words','カードや単語ページで、1 語につき表示するゲーム中の例文の数'],
 safe_examples:['打开后，语法课、句子地图等地方的例句不会出现露骨的成人台词，适合录屏或给别人看；关闭后任何台词都可以作为例句','Grammar lessons and other examples never use explicit adult lines; off, any line can be an example',
  'オンにすると、文法レッスンなどの例文に露骨な成人向けセリフを使いません。オフならどのセリフも例文になります'],
 safe_cg:['打开后，详情页卡背只显示本机模型判定为安全的 CG（R18 和擦边图都不显示），适合录屏或给别人看。首次打开会下载约 170 MB 的识别模型，图片在后台逐张判定，判定完之前不显示；图片不会上传','The card back on the detail page shows only CGs a local model rates as safe (no R18 or borderline pictures). The first time, about 170 MB of model files are downloaded; pictures are rated in the background and stay hidden until rated. Nothing is uploaded',
  'オンにすると、詳細ページのカード裏にはローカルのモデルが安全と判定した CG だけを表示します（R18・きわどい画像は表示しません）。初回は約 170 MB のモデルをダウンロードし、画像はバックグラウンドで順に判定され、判定までは表示しません。画像はアップロードされません'],
 only_review_translated:['打开后，只复习带有译文的句子，看不懂的生句不会出现','Only review saved lines that have a translation','訳のある文だけを復習します'],
 default_dictionary_sort:['单词页的默认排列方式','Default order of the Words page','単語ページの既定の並び順'],
 leaderboardEnabled:['只上传阅读字数、时长、收录单词数、复习次数、假名练习题数和连续天数的汇总；参加要先用邮箱登录 MeguLit 账号，邮箱不会出现在榜上；关闭后会删除服务器上的记录','Uploads only totals (characters, time, words saved, reviews, kana practice, streak). Joining needs a MeguLit account signed in with your email, which never shows on the board. Turning it off deletes your entry on the server',
  '読んだ文字数・時間・登録単語数・復習回数・かな練習の問題数・連続日数の合計だけを送ります。参加にはメールアドレスで MeguLit アカウントにログインする必要があり、アドレスはランキングに表示されません。オフにするとサーバーの記録を削除します'],
 leaderboardName:['排行榜上显示的名字，2–16 个字，不能含网址或不雅词','Name shown on the leaderboard, 2–16 characters, no links or offensive words','ランキングに表示される名前。2〜16 文字、URL や不適切な語は使えません'],
 leaderboardShareGames:['打开后会公开你读过的游戏名称和各自字数，用于“按游戏”排行','Shares the titles you read and their character counts for the per-game boards','読んだゲーム名と文字数を公開し、ゲーム別ランキングに参加します'],
 relayUrl:['MeguLit 的所有在线功能——排行榜、交流区、一键上传问题反馈、共享的游戏适配数据——都连到这台服务器。留空就是官方服务器，绝大多数人不用改；只有自己架服务器时才填','Every online feature of MeguLit — the leaderboard, Community, one-click problem reports and shared game adaptation data — talks to this server. Leave it empty for the official server; only fill it in if you run your own',
  'ランキング・交流・ワンクリック不具合報告・共有ゲーム設定など、MeguLit のオンライン機能はすべてこのサーバーにつながります。空欄なら公式サーバーです。自分でサーバーを立てる場合だけ入力してください'],
 history_font_family:['填写电脑上已安装的字体名称，仅影响历史中的对话正文；推荐 Yu Gothic 或 Noto Sans JP','Enter an installed font name for dialogue history, such as Yu Gothic or Noto Sans JP',
  '会話履歴の本文に使うインストール済みフォント名を指定します'],
 history_font_size:['调整对话记录的正文大小，单位为像素','Dialogue history text size in pixels','会話履歴の本文サイズ（px）'],
 history_line_height:['每行文字的高度倍数，数值越大越疏朗','Line height multiplier for dialogue history','会話履歴の行の高さの倍率'],
 readingEngine:['把日文拆成可点击的词，并提供基础读音；安装后离线运行，不按次收费','Splits Japanese into clickable words and supplies readings. Runs offline after installation','日本語をクリック可能な語に分け、読み方を付けます。導入後はオフラインで動作します'],
 lookupProvider:['选择点词后如何解释词义、用法和语法；整句翻译仍由“翻译”页的引擎负责','Chooses word meanings, usage and grammar explanations. Sentence translation uses the Translation settings',
  '単語の意味・用法・文法の説明元です。文全体の翻訳は「翻訳」で設定します'],
 model:['服务商提供的模型名，决定用哪个 AI','Enter the model name provided by the service; this selects which AI handles the request','サービスで提供されるモデル名です。使用する AI を指定します'],
 track_unknown_words:['把查过、尚未掌握的词整理到学习页的“待巩固单词”；关闭后不再为这份列表记录新查询','Collect looked-up words you have not mastered in the Study page’s Words to revisit list','調べた未習得語を学習ページの「復習候補」にまとめます。オフ以降の検索は追加しません'],
 treat_new_as_unknown:['把未收录或刚收录的词也放进待巩固列表；关闭后只看已有学习进度的词','Include uncollected and newly collected words; otherwise only words already being studied are listed',
  '未登録・新規登録の語も復習候補に含めます。オフでは学習中の語だけ表示します'],
 unknown_words_count:['待巩固列表一次最多显示多少个词，不限制查词次数','Maximum words shown in the revisit list; this does not limit lookups','復習候補に表示する最大語数です。検索回数の制限ではありません'],
 unknown_words_min_lookups:['同一个词累计查到几次才进入待巩固列表，例如设为 3，只查过一两次的词暂时不显示','Lookups needed before a word appears; 3 excludes words looked up only once or twice','復習候補に入れるまでの検索回数です。3 なら1～2回だけ調べた語は表示しません'],
 show_related_entries:['查词卡片同时展示同形词、不同读音等候选，方便比较语境','Show alternative entries and readings in the lookup card','辞書カードに別の語義や読み方も表示し、文脈に合うものを比べます']
};
/* v1.1.5 (user: many settings need a short explanation): help for the less obvious fields, keyed by scope|key */
const scoped={"translation|baseUrl": ["接口网址。官方服务保持默认；中转站或自建服务填它给的地址（通常以 /v1 结尾）", "The translation API address. Keep the default for the official service; for a relay or self-hosted server, enter the address it gives you (usually ending in /v1)",
 "翻訳 API のアドレスです。公式サービスなら既定のまま、中継や自前のサーバーならその案内どおりに（多くは /v1 で終わります）"], "translation|region": ["Azure 翻译资源所在的区域，例如 eastasia。在 Azure 门户的「密钥和终结点」页面能看到", "The Azure region of your Translator resource, such as eastasia. Shown on the Keys and Endpoint page in the Azure portal",
 "Azure Translator リソースのリージョン（例：eastasia）。Azure ポータルの「キーとエンドポイント」に表示されます"], "translation|deeplTier": ["免费账户用 api-free.deepl.com，付费 Pro 账户用 api.deepl.com；选错会提示密钥无效",
 "Free accounts use api-free.deepl.com, Pro accounts api.deepl.com; the wrong one reports an invalid key", "無料アカウントは api-free.deepl.com、Pro は api.deepl.com。違うとキーが無効と表示されます"],
 "embedding|hookProfile": ["怎么拿到游戏台词：「只读」最稳，只读取不改游戏；「内嵌」会把原文换成 MeguLit 的文字，效果最好，但部分引擎可能出错，出问题就切回只读", "How dialogue is captured. Read-only is the safest and never changes the game; Embedded replaces the game text with MeguLit’s for the best look, but some engines may misbehave, so switch back if anything breaks",
 "台詞の取得方法。「読み取りのみ」が最も安全でゲームを変更しません。「埋め込み」は原文を MeguLit の文字に置き換えて見た目が最良ですが、一部のエンジンで不具合が出ることがあります"], "embedding|hookAutoStart": ["把阅读层绑定到游戏窗口后，自动开始抓取台词，不用每次手动点「启动 Hook」",
 "Start capturing dialogue as soon as the reader is bound to the game window", "ゲームウィンドウに紐付けたら自動で台詞の取得を始めます"], "embedding|hookHide": ["把游戏自己显示的日文藏起来，只看 MeguLit 的文字，避免两份字叠在一起。需要引擎支持",
 "Hide the game’s own Japanese so only MeguLit’s text shows, avoiding double text. Needs engine support", "ゲーム側の日本語を隠し、MeguLit の文字だけを表示します（エンジンの対応が必要）"], "embedding|hookFast": ["优先用记住的文本流，启动更快。抓到的不是台词时关掉它，重新扫描",
 "Reuse the remembered text stream for a faster start. Turn it off and rescan if the captured text is not the dialogue", "記憶したテキストストリームを使って素早く開始します。台詞以外を拾う場合はオフにして再スキャン"],
 "embedding|autoGameStyle": ["自动读取游戏的字体、字号和颜色，让 MeguLit 的文字看起来像游戏原本的", "Read the game’s font, size and colors so MeguLit’s text looks native", "ゲームのフォント・サイズ・色を読み取り、MeguLit の文字をゲームに馴染ませます"],
 "embedding|hideWaitMarker": ["隐藏游戏的「点击继续」小图标（▼、齿轮之类），避免它压在文字上", "Hide the game’s click-to-continue icon (▼, a cog…) so it does not cover the text", "ゲームのクリック待ちアイコン（▼や歯車など）を隠します"],
 "embedding|relocateWaitMarker": ["把「点击继续」图标挪到 MeguLit 文字的末尾，像游戏原本那样", "Move the click-to-continue icon to the end of MeguLit’s text, like the game does", "クリック待ちアイコンを MeguLit の文末に移します"],
 "immersion|immersion": ["游戏菜单、存档界面等没有对话框时，自动隐藏阅读层，回到台词时再出现", "Hide the reader when the game shows menus or no dialogue box, and bring it back with the next line",
 "メニューなど会話枠がない画面では字幕を隠し、台詞に戻ると再表示します"], "immersion|dialogDetection": ["怎么判断游戏当前有没有对话框：「自动」适合大多数游戏；误判时换成别的方式试试", "How MeguLit tells whether a dialogue box is on screen. Auto suits most games; try another method if it misjudges",
 "会話枠があるかの判定方法。多くは「自動」で十分です。誤判定するときは別の方法を"], "position|x": ["文字框距离游戏窗口左边的位置，百分比", "Distance of the reader from the left of the game window, in percent", "字幕の左からの位置（%）"],
 "position|y": ["文字框距离游戏窗口顶部的位置，百分比", "Distance of the reader from the top of the game window, in percent", "字幕の上からの位置（%）"], "position|scanX": ["只有用 OCR（截图识字）时才用到：识别区域的左边位置",
 "Only used for OCR (reading text from screenshots): left edge of the scanned area", "OCR（画面から文字を読む）を使う場合のみ：読み取り領域の左端"], "position|scanY": ["只有用 OCR 时才用到：识别区域的上边位置",
 "Only used for OCR: top edge of the scanned area", "OCR を使う場合のみ：読み取り領域の上端"], "position|scanWidth": ["只有用 OCR 时才用到：识别区域的宽度", "Only used for OCR: width of the scanned area",
 "OCR を使う場合のみ：読み取り領域の幅"], "position|scanHeight": ["只有用 OCR 时才用到：识别区域的高度", "Only used for OCR: height of the scanned area", "OCR を使う場合のみ：読み取り領域の高さ"], "speech|aivisUrl": ["朗读用的 AivisSpeech 语音引擎在本机的地址。MeguLit 自带的引擎就用默认的 http://127.0.0.1:10101；只有你自己另外开了引擎才需要改",
 "Where the AivisSpeech voice engine listens on this PC. The bundled engine uses the default http://127.0.0.1:10101; change it only if you run your own engine",
 "読み上げに使う AivisSpeech エンジンのアドレス。同梱エンジンは既定の http://127.0.0.1:10101 のままで、独自に起動した場合だけ変更します"], "speech|aivisSpeaker": ["朗读用的声音编号。一般不用手填：在上面选好角色和情感，这里会自动对应", "The number of the voice used for reading aloud. Pick a voice and style above and this follows automatically",
 "読み上げに使う声の番号。上で話者とスタイルを選ぶと自動で入ります"], "speech|aivisSpeed": ["朗读快慢，1 是正常语速，小于 1 更慢，大于 1 更快", "How fast lines are read: 1 is normal, lower is slower, higher is faster",
 "読み上げの速さ。1 が標準、小さいほど遅く、大きいほど速くなります"], "speech|aivisVolume": ["朗读音量，0 到 1；只影响 MeguLit 的朗读，不影响游戏声音", "Reading volume from 0 to 1; only affects MeguLit’s voice, not the game",
 "読み上げの音量（0〜1）。ゲームの音には影響しません"], "speech|aivisGpu": ["用显卡合成语音，更快。显卡驱动有问题或者朗读出错时关掉，改用 CPU", "Synthesize speech on the GPU for speed. Turn off to use the CPU if your graphics driver causes errors",
 "GPU で音声を合成して高速化します。ドライバの問題でエラーになる場合はオフ（CPU）に"], "anki|ankiUrl": ["AnkiConnect 插件监听的地址，默认 http://127.0.0.1:8765。没改过 AnkiConnect 设置就别动", "Where the AnkiConnect add-on listens, by default http://127.0.0.1:8765. Leave it unless you changed AnkiConnect",
 "AnkiConnect アドオンのアドレス（既定 http://127.0.0.1:8765）。変更していなければそのままで"], "anki|ankiAutoStart": ["打开 MeguLit 时顺便在后台打开 Anki，制卡和复习时不用再手动开", "Open Anki in the background when MeguLit starts, ready for mining and review",
 "MeguLit の起動時に Anki を裏で開いておきます"], "anki|ankiAutoClose": ["关掉 MeguLit 时，顺便关掉由 MeguLit 打开的 Anki；你自己打开的 Anki 不会被关", "When MeguLit exits, close the Anki it opened; an Anki you opened yourself stays",
 "MeguLit が開いた Anki だけを終了時に閉じます。自分で開いた Anki は閉じません"], "anki|ankiHidden": ["由 MeguLit 打开的 Anki 只在后台运行，不弹窗口、不占任务栏。需要时在复习页点「在 Anki 中打开」", "Anki opened by MeguLit runs in the background with no window or taskbar entry. Use “Open in Anki” on the review page when needed",
 "MeguLit が開いた Anki はウィンドウを出さず裏で動きます。必要なら復習画面の「Anki で開く」から"], "anki|ankiAudio": ["制卡时附上这句台词的语音，复习时能听", "Attach the line’s audio to new cards", "カードに台詞の音声を付けます"],
 "library|sceneShots": ["读游戏时，MeguLit 会在后台悄悄截下游戏画面里好看的场景（只截游戏窗口，不带 MeguLit 的字幕；淡入淡出、菜单、读盘画面会自动跳过，相似的只留最好看的一张），每部作品最多留 48 张，成人场景也会保留。它们只存在这台电脑上，用在作品详情页卡牌的背面。关掉就不再截",
 "While you read, MeguLit quietly keeps good-looking scenes from the game window (the game alone, without MeguLit's subtitles; fades, menus and loading screens are skipped, and of similar scenes only the best one stays), up to 48 per game, adult scenes included. They stay on this computer and appear on the back of the game's detail card. Turn this off to stop",
 "読んでいる間、ゲーム画面のきれいな場面をバックグラウンドで保存します（ゲームウィンドウのみ、MeguLit の字幕は入りません。フェード・メニュー・ロード画面は除外し、似た場面は一番きれいな一枚だけ残します）。作品ごとに最大 48 枚、成人向けの場面も含みます。このパソコンだけに保存され、作品詳細のカードの裏に表示されます。オフにすると保存しません"],
 "anki|ankiVoiceIsolate": ["游戏里录下的台词声音会混着背景音乐。开着时，MeguLit 用本地的人声分离模型（UVR MDX-Net）只留下人声，卡片先存原录音，分离好后自动替换。第一次用到时会在后台下载模型和依赖，约 170 MB；游戏包里能直接取到原声文件的句子不需要分离", "Lines recorded from the game carry its music. When on, MeguLit keeps only the voice with a local vocal separation model (UVR MDX-Net): the card is saved with the recording first and its audio is replaced once separated. The model and its packages (about 170 MB) download in the background the first time; lines whose voice file is read from the game need no separation",
 "ゲームから録音したボイスには BGM が混ざります。オンにすると、ローカルのボーカル分離モデル（UVR MDX-Net）で声だけを残します。カードはまず録音のまま保存され、分離が終わると音声が差し替わります。初回はモデルと依存パッケージ（約 170 MB）をバックグラウンドでダウンロードします。ゲームのボイスファイルを直接読めるセリフは分離不要です"],
 "anki|ankiGameMedia": ["有游戏原声和截图时优先用它们；没有配音的旁白才用 MeguLit 的朗读补", "Use the game’s own voice and a screenshot when available; MeguLit’s voice only fills in unvoiced narration",
 "ゲームのボイスとスクリーンショットを優先し、ボイスのない地の文だけ読み上げで補います"], "background|blur": ["主页背景图的模糊程度，0 是清晰", "Blur of the home background picture; 0 is sharp", "ホーム背景画像のぼかし（0 でくっきり）"],
 "background|dim": ["主页背景图压暗多少，越高文字越清楚", "How much the home background is darkened; higher makes text easier to read", "ホーム背景をどれだけ暗くするか。高いほど文字が読みやすくなります"], "background|glass": ["让主页、设置、学习等面板变成半透明毛玻璃，能透出背景图；关掉就是实心底色",
 "Make home, settings and study panels frosted glass that shows the background; off gives solid panels", "ホーム・設定・学習のパネルをすりガラス風にして背景を透かします。オフで不透明に"], "background|glassBlur": ["毛玻璃后面背景的模糊程度",
 "How strongly the background behind frosted panels is blurred", "すりガラスの背後のぼかし具合"], "background|glassAlpha": ["毛玻璃面板有多不透明，越高越接近实心", "How opaque frosted panels are; higher is closer to solid",
 "すりガラスの不透明度。高いほど不透明に近くなります"], "panels|surfaces.menu": ["游戏里按 Alt+T 打开的菜单用什么背景：图片、毛玻璃或纯色", "Background of the in-game Alt+T menu: picture, glass or solid", "ゲーム内 Alt+T メニューの背景（画像・すりガラス・単色）"],
 "panels|surfaces.log": ["游戏里对话记录面板用什么背景", "Background of the in-game dialogue log", "ゲーム内の会話ログの背景"], "panels|surfaces.card": ["游戏里点一个词弹出的查词窗口用什么背景", "Background of the lookup card that opens when you click a word in game",
 "ゲーム内で単語をクリックしたときの辞書カードの背景"], "library|steamPath": ["Steam 的安装文件夹，用来找 Steam 游戏。一般会自动找到，找不到时手动填", "Steam’s install folder, used to find Steam games. Usually found automatically",
 "Steam のインストール先。Steam のゲームを探すのに使います（通常は自動検出）"], "library|folders": ["除了 Steam 以外放游戏的文件夹，一行一个，MeguLit 会扫描里面的游戏", "Other folders with games, one per line; MeguLit scans them",
 "Steam 以外のゲームフォルダ。1 行に 1 つ"], "library|autoSeries": ["把同一系列的作品自动归到一起显示，例如 NEKOPARA Vol.1–4", "Group works of the same series together, such as NEKOPARA Vol.1–4",
 "同じシリーズの作品をまとめて表示します"], "lookup|lookup_mode": ["在游戏里怎么打开查词：单击、悬停或按住键再点", "How to open a lookup in game: click, hover or hold a key and click", "ゲーム内で辞書を開く操作（クリック・ホバー・キー＋クリック）"],
 "lookup|word_highlight_enabled": ["按熟悉程度给台词里的单词上色，一眼看出哪些是生词", "Color words in the dialogue by how well you know them", "台詞の単語を習熟度で色分けします"], "lookup|underline_mined_words": ["给已经收进单词本的词加下划线",
 "Underline words already in your word list", "単語帳に登録済みの単語に下線を付けます"], "lookup|underline_names": ["给人名、地名等专有名词加下划线，方便和普通单词区分", "Underline names of people and places to tell them apart from ordinary words",
 "人名・地名などの固有名詞に下線を付けます"], "study|only_review_translated": ["复习句子时只出有译文的，避免遇到看不懂又没翻译的句子", "Only review sentences that have a translation", "翻訳がある例文だけを復習に出します"], "reader|history_enabled": ["把读过的每一句原文和译文存进「历史」，可以回看和统计",
 "Save every line you read, with its translation, to History for review and statistics", "読んだ台詞と翻訳を「履歴」に保存し、見返しや統計に使います"], "reader|history_span": ["历史记录保留多少天，超过的自动删掉",
 "How many days reading history is kept before it is removed", "読書履歴を残す日数"], "reader|sentence_window_inverted": ["把译文放到原文上面显示", "Show the translation above the original",
 "翻訳を原文の上に表示します"], "text|autoScale": ["游戏窗口变大变小时，文字跟着一起缩放", "Scale the text when the game window is resized", "ゲームウィンドウの大きさに合わせて文字を拡縮します"], "text|translationWidth": ["译文每行最多多宽，0 表示和日文一样宽",
 "Maximum line width of the translation; 0 matches the Japanese", "翻訳の 1 行の最大幅。0 で日本語に合わせます"], "text|display": ["阅读层显示什么：原文、译文，或者两个都显示", "What the reader shows: original, translation, or both",
 "字幕に表示する内容（原文・翻訳・両方）"], "text|textGradient": ["还没读到的文字用渐变色显示，配合逐字显示更像游戏原本的效果", "Show unread text with a gradient, which pairs well with the typewriter effect",
 "未読の文字をグラデーションで表示します"], "text|englishEnabled": ["给台词里的英文单独设置字体、字号和描边", "Give English text in the dialogue its own font, size and outline", "台詞中の英語に別のフォント・サイズ・縁取りを使います"]};
export function fieldHelp(scope,key,locale){
 const anki={ankiDeck:['新制卡片保存到 Anki 中的哪个牌组；不是复习页面当前选中的牌组','The Anki deck that receives newly mined cards; separate from the deck selected for review','新しく登録したカードの保存先デッキです。復習画面の選択とは別です'],
  ankiModel:['决定卡片字段与正反面排版。MeguLit/旧 ToMe 类型由程序维护，包含释义、例句、音频和游戏截图','Defines note fields and front/back layout. MeguLit and legacy ToMe types are maintained by the app, including definitions, context, audio and game screenshots',
  'フィールドと表裏の配置を決めます。MeguLit・旧ToMeタイプは語義・例文・音声・ゲーム画像に対応します'],ankiPath:['可浏览选择 anki.exe；仅用于需要打开 Anki 时定位程序','Browse to anki.exe; used when Anki needs to be opened',
  'anki.exe を参照してください。Anki の起動に使います']};
 const translation={"scriptColdRun":["部分 KiriKiri 游戏（如 サノバウィッチ）的剧本用 Hxv4 强加密，只有游戏自己能解开。开启后，游戏库发现这类游戏时，MeguLit 会在后台把游戏最小化、静音启动一次，让它自己读出剧本后立刻关闭，每部作品只做一次，零延迟翻译之后就能离线使用。不会改动游戏文件。Steam 版若要求经 Steam 启动会跳过，第一次正常游玩时再读取。推荐：开启",
  "Some KiriKiri games (such as Sabbat of the Witch) encrypt their scripts with Hxv4, which only the game itself can open. When the library finds such a game, MeguLit starts it once in the background, minimised and muted, lets it read its scripts, and closes it at once; once per game, after which zero-latency translation works offline. Game files are never changed. Steam builds that insist on starting through Steam are skipped and read the first time you play. Recommended: on",
  "一部の KiriKiri 作品（サノバウィッチなど）はシナリオを Hxv4 で強く暗号化しており、ゲーム自身しか開けません。オンにすると、ライブラリがそのような作品を見つけたとき、MeguLit がゲームを最小化・ミュートでバックグラウンド起動してシナリオを読ませ、すぐに閉じます。作品ごとに一度だけで、以後ゼロ遅延翻訳がオフラインで使えます。ゲームのファイルは変更しません。Steam 経由の起動が必要な Steam 版はスキップし、最初のプレイ時に読み取ります。おすすめ：オン"],
  "provider":["整句翻译用哪种服务。免费机翻免配置、偶尔限流；API 用自己的密钥，译文更自然；本地模型离线运行，需 8GB 显存","Which service translates game dialogue. Free online: no setup and fast, average quality, may be rate limited. API: your own account and key, stable and better, billed by use. Local model: runs a model such as Sakura on this PC, offline and private, needs 8 GB+ VRAM. Start with free online; switch to an API model for more natural translations",
  "ゲームの会話文を翻訳するサービス。無料オンライン：設定不要で速いが品質は普通、制限されることがあります。API：自分のアカウントとキーを使い、安定して高品質、従量課金。ローカルモデル：Sakura などを PC で動かし、オフラインでプライバシーも安心、VRAM 8GB 以上が必要。まず無料オンライン、より自然な訳が欲しければ API の大規模モデルへ"],
  "reviewEngine":["作品页“社区评价”的翻译方式，和游戏内翻译分开。免费机翻：最快，可译成中日英韩等多种语言，频繁使用会被暂时限流；跟随翻译引擎：用上面选的 API 或大模型，译文更自然但会消耗额度，只能译成中文或英文；本地大模型：离线但较慢。推荐：免费机翻，被限流时改为跟随翻译引擎","How community reviews on game pages are translated, separate from in-game translation. Free machine translation: fastest, many target languages, may be rate limited with heavy use. Follow translation engine: the API or model chosen above, more natural but uses your quota, Chinese or English only. Local model: offline but slower. Recommended: free machine translation; switch to the translation engine when rate limited",
  "作品ページのコミュニティレビューの翻訳方法（ゲーム内翻訳とは別）。無料機械翻訳：最速で多言語に対応、多用すると一時的に制限されます。翻訳エンジンに合わせる：上で選んだ API やモデルを使い自然な訳になりますが利用枠を消費、中国語か英語のみ。ローカルモデル：オフラインですが遅め。推奨：無料機械翻訳、制限されたら翻訳エンジンに切り替え"],
  "learnerLanguage":["译文和词义解释用哪种语言输出","The language used for translations and word explanations","翻訳と語義説明を出力する言語"],"contextEnabled":["翻译当前句时一并参考前面几句，代词、语气和人名会更准确。主要对大模型有效，会多用一点额度。推荐：开启",
  "Includes the previous lines when translating, so pronouns, tone and names come out right. Mainly helps AI models and uses a little more quota. Recommended: on",
  "現在の文を訳すとき直前の数文も参照し、代名詞・口調・人名が正確になります。主に大規模モデルに効果があり、利用枠を少し多く使います。推奨：オン"],"contextLines":["翻译时参考的前文句数。越多越连贯，但更慢、更费额度。推荐 3–4 句","How many previous lines are sent as context. More is smoother but slower and costs more. Recommended: 3–4",
  "文脈として送る直前の文の数。多いほど自然ですが遅く費用も増えます。推奨：3〜4"],"enabled":["在游戏日文下方显示整句译文。想专心读日语时可以关掉，需要时再用点读查看。推荐：初学开启，熟练后关闭","Shows the full translation under the Japanese line in game. Turn it off to focus on Japanese and use lookup when needed. Recommended: on while learning, off once comfortable",
  "ゲーム内の日本語の下に訳文を表示します。日本語に集中したいときはオフにし、必要なら辞書で確認できます。推奨：初心者はオン、慣れたらオフ"]};
 const name=key.endsWith('.model')?'model':key;const own=scoped[scope+'|'+key];if(own)return own[{zh:0,en:1,ja:2}[locale]]||own[0];return (scope==='anki'?anki[key]:scope==='translation'?translation[key]:null)?.[{
  zh:0,en:1,ja:2}[locale]]||hints[name]?.[{zh:0,en:1,ja:2}[locale]]||'';
}
/* 2026-11-13 redesign (option D): the 「怎么选分词引擎？」 callout became two engine rows that split one game-like line,
   so the difference is seen rather than read. The rows are the switch; the select stays in the form (hidden) and saves as before. */
const ENGINES=[
 {id:'sudachi',name:'SudachiDict Full',recommended:true,diff:[1],split:[['東京','とうきょう'],['スカイツリー'],['に'],['行','い','き'],['たかっ'],['た']],
  fit:{zh:'日常玩 GAL',en:'Everyday VN reading',ja:'普段のノベルゲームに'},lex:{zh:'完整词库，人名地名等专有名词更全',en:'Full lexicon with more names and proper nouns',ja:'固有名詞が多い完全な辞書'}},
 {id:'unidic',name:'UniDic',diff:[1,2],split:[['東京','とうきょう'],['スカイ'],['ツリー'],['に'],['行','い','き'],['たかっ'],['た']],
  fit:{zh:'细看语法结构',en:'Studying grammar closely',ja:'文法を細かく見るときに'},lex:{zh:'统一短单位，词形和活用拆得更细',en:'Consistent short units; forms and inflections split finer',ja:'統一された短単位で語形・活用を細かく分割'}}];
const ENGINE_WORDS={zh:{rec:'推荐',current:'正在使用',use:'改用',legend:'灰底 = 两种引擎切法不同',note:'两种都在本地运行；游戏原文自带注音时，仍以原文读音为准'},
 en:{rec:'Recommended',current:'In use',use:'Use',legend:'Grey = the two engines split differently',note:'Both run locally. Readings supplied by the game keep priority'},
 ja:{rec:'おすすめ',current:'使用中',use:'切り替え',legend:'灰色 = 2 つのエンジンで分割が異なる箇所',note:'どちらもローカルで動作します。ゲーム原文のルビが引き続き優先されます'}};
const escapeText=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function engineRowsHtml(current,locale='zh'){
 const w=ENGINE_WORDS[locale]||ENGINE_WORDS.zh,pick=v=>v[locale]||v.zh;
 const token=([kanji,ruby,tail=''],i,diff)=>`<span class="tk${diff.includes(i)?' tk-diff':''}">${ruby?`<ruby>${kanji}<rt>${ruby}</rt></ruby>${tail}`:kanji}</span>`;
 return ENGINES.map(e=>{const on=current===e.id;return `<div class="rpk-eng" role="radio" tabindex="0" aria-checked="${on}" data-engine="${e.id}"><div class="rpk-eng-name"><strong>${e.name}</strong>${e.recommended?`<em>${escapeText(w.rec)}</em>`:''}<small>${escapeText(pick(e.fit))}</small></div><div class="rpk-line" lang="ja">${e.split.map((t,i)=>token(t,i,e.diff)).join('')}</div><div class="rpk-eng-lex">${escapeText(pick(e.lex))}</div><span class="rpk-eng-pick">${escapeText(on?w.current:w.use)}</span></div>`;}).join('')
  +`<p class="rpk-note"><span class="tk-key"><span class="tk-swatch" aria-hidden="true"></span>${escapeText(w.legend)}</span><span>${escapeText(w.note)}</span></p>`;
}
export function configureDictionary({content,form,locale}){
 const select=form.elements.namedItem('readingEngine'),row=select?.closest('.settings-row');
 if(select&&row){row.classList.add('rpk-engine-row');const box=document.createElement('div');box.className='rpk-engines';box.setAttribute('role','radiogroup');
  box.setAttribute('aria-label',row.querySelector('.settings-label')?.textContent||'');
  const draw=()=>{box.innerHTML=engineRowsHtml(select.value,locale);};draw();row.after(box);select.addEventListener('change',draw);
  const choose=target=>{const r=target.closest('[data-engine]');if(!r||r.getAttribute('aria-checked')==='true')return;select.value=r.dataset.engine;select.dispatchEvent(new Event('change',{bubbles:true}));draw();box.querySelector(`[data-engine="${r.dataset.engine}"]`)?.focus();};
  box.addEventListener('click',e=>choose(e.target));box.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(e.target);}});}
 const provider=form.elements.namedItem('lookupProvider'),change=()=>{for(const field of form.elements){const match=/^lookupProfiles\.([^.]+)\./.exec(field.name||'');
  if(match)field.closest('.settings-row').dataset.unavailable=String(provider.value!==match[1]);}};provider.addEventListener('change',change);change();
}
