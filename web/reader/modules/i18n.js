// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLit.V3 interface language (中文 / English / 日本語). Translates UI text in place by exact match only,
// so game lines, sentences and dictionary entries are never touched. Original text is kept for switching back.
(function installI18n(){
 'use strict';
 if(window.__tomeI18n)return;
 if(!document.documentElement||!document.body){document.addEventListener('DOMContentLoaded',installI18n,{once:true});return;}
 // English (Tomoyo) source -> [中文, 日本語]
 const EN={
  'Learning':['学习中','学習中'],
  'Settings':['设置','設定'],'General':['常规','一般'],'Lookup':['查词','辞書引き'],'Sentence window':['句子窗口','文ウィンドウ'],'Dictionary':['词典','辞書'],'Review':['复习','復習'],'Mini mode':['迷你模式',
   'ミニモード'],
  'Theme':['主题','テーマ'],'Word level colours':['词汇等级颜色','単語レベルの色'],'Username':['用户名','ユーザー名'],'Profile picture':['头像','プロフィール画像'],'Input source':['输入来源','入力ソース'],
   'Discord Rich Presence':['Discord 状态显示','Discord ステータス表示'],'Default VNDB title':['VNDB 默认标题','VNDB のデフォルトタイトル'],'Data':['数据','データ'],'Export':['导出','エクスポート'],
   'Import':['导入','インポート'],
  'Clipboard':['剪贴板','クリップボード'],'Websocket':['WebSocket','WebSocket'],'Websocket address':['WebSocket 地址','WebSocket アドレス'],'Japanese':['日文','日本語'],'Romaji':['罗马字',
   'ローマ字'],
  'All':['全部','すべて'],'VN':['视觉小说','ノベル'],'Game':['游戏','ゲーム'],'LN':['轻小说','ラノベ'],'Book':['书籍','書籍'],'Other':['其他','その他'],'Visual Novel':['视觉小说','ビジュアルノベル'],'Light Novel':['轻小说',
   'ライトノベル'],'Video':['视频','動画'],'Audio':['音频','音声'],'Document':['文档','文書'],
  'Active':['进行中','進行中'],'Completed':['已完成','完了'],'Paused':['已暂停','一時停止'],'Dropped':['已弃坑','中断'],'Planned':['计划中','予定'],'All statuses':['全部状态','すべての状態'],'All media':['全部作品',
   'すべての作品'],
  'Add':['添加','追加'],'Add cover':['添加封面','カバーを追加'],'Change cover':['更换封面','カバーを変更'],'Add with status':['添加并设置状态','状態を指定して追加'],'Add a translation...':['添加翻译…','翻訳を追加…'],
  'Back':['返回','戻る'],'Cancel':['取消','キャンセル'],'Close':['关闭','閉じる'],'Save':['保存','保存'],'Delete':['删除','削除'],'Remove':['移除','削除'],'Edit':['编辑','編集'],'Done':['完成','完了'],
   'Next':['下一个','次へ'],'Start':['开始','開始'],'End':['结束','終了'],'Download':['下载','ダウンロード'],'Never':['从不','なし'],'None':['无','なし'],'New':['新','新規'],'Current':['当前','現在'],
   'Status':['状态','状態'],'Title':['标题','タイトル'],'Name':['名称','名前'],'Names':['人名','人名'],'Tag':['标签','タグ'],'Version':['版本','バージョン'],'Font':['字体','フォント'],'Font family':['字体',
   'フォント'],'Font size':['字号','文字サイズ'],'Length':['长度','長さ'],'Difficulty':['难度','難易度'],'Progress':['进度','進捗'],'Media':['作品','作品'],'Media type':['作品类型','作品の種類'],'Media categories':['作品分类',
   '作品カテゴリ'],'Synopsis':['简介','あらすじ'],'Image':['图片','画像'],'Picture':['图片','画像'],'+ Picture':['+ 图片','+ 画像'],'Created':['创建时间','作成日'],'Home':['主页','ホーム'],'Reader':['阅读器',
   'リーダー'],'Stats':['统计','統計'],'Hotkey':['快捷键','ショートカット'],'Manual':['手动','手動'],'Hover':['悬停','ホバー'],'Click':['点击','クリック'],'Desktop':['桌面','デスクトップ'],'Interactive':['交互',
   'インタラクティブ'],'Plain text':['纯文本','プレーンテキスト'],'Template':['模板','テンプレート'],'Public':['公开','公開'],
  'Delete media':['删除作品','作品を削除'],'Delete name':['删除人名','人名を削除'],'Delete sentence':['删除句子','文を削除'],'Delete word':['删除单词','単語を削除'],'Save name':['保存人名','人名を保存'],'Saved names':['已保存的人名',
   '保存した人名'],'Mine word':['收录单词','単語を登録'],'Open on VNDB':['在 VNDB 打开','VNDB で開く'],'Open on jiten.moe':['在 jiten.moe 打开','jiten.moe で開く'],'Go to settings':['前往设置',
   '設定へ'],'Import a title first':['请先导入一部作品','先に作品を追加してください'],'Enter a title':['输入标题','タイトルを入力'],'Paste from clipboard':['从剪贴板粘贴','クリップボードから貼り付け'],'Choose a profile picture':['选择头像',
   'プロフィール画像を選択'],'Choose file…':['选择文件…','ファイルを選択…'],'Show details':['显示详情','詳細を表示'],'View all':['查看全部','すべて表示'],'Card view':['卡片视图','カード表示'],'Grid view':['网格视图',
   'グリッド表示'],'List view':['列表视图','リスト表示'],'First page':['第一页','最初のページ'],'Last page':['最后一页','最後のページ'],'Next page':['下一页','次のページ'],'Previous page':['上一页','前のページ'],
  'Export database':['导出数据库','データベースをエクスポート'],'Import database':['导入数据库','データベースをインポート'],'Import words':['导入单词','単語をインポート'],'Import failed':['导入失败','インポートに失敗しました'],
   'Clear dictionary':['清空词典','辞書を消去'],'Clear statistics':['清空统计','統計を消去'],'Clear stats':['清空统计','統計を消去'],'SQLite database':['SQLite 数据库','SQLite データベース'],
  'Enable history':['启用历史记录','履歴を有効化'],'Enable mini mode':['启用迷你模式','ミニモードを有効化'],'Enter threshold (height)':['进入阈值（高度）','切替の閾値（高さ）'],'Exit threshold (height)':['退出阈值（高度）',
   '解除の閾値（高さ）'],'Transparency':['透明度','透明度'],'History span':['历史范围','履歴の範囲'],
  'Highlight words on hover':['悬停时高亮单词','ホバーで単語を強調'],'Hold to look up':['按住查词','長押しで辞書引き'],'Look up selected':['查询选中内容','選択範囲を辞書引き'],'Lookup trigger':['查词触发方式',
   '辞書引きの操作'],'Cycle key':['切换键','切替キー'],'Limit lookups per hour':['限制每小时查词次数','1時間あたりの辞書引きを制限'],'Max lookups / hour':['每小时最多查词','1時間の最大辞書引き'],'Show related entries in tooltip':['在浮窗显示相关词条',
   'ツールチップに関連項目を表示'],'Underline mined words in tooltip':['在浮窗为已收录单词加下划线','ツールチップで登録済み単語に下線'],'Show Jiten difficulty stats':['显示 Jiten 难度统计','Jiten 難易度統計を表示'],'Exclude from Jiten':['从 Jiten 排除',
   'Jiten から除外'],'Estimate media vocabulary coverage':['估算作品词汇覆盖率','作品の語彙カバー率を推定'],
  'Invert sentence window colours':['反转句子窗口配色','文ウィンドウの色を反転'],'Window colour':['窗口颜色','ウィンドウの色'],'Text colour':['文字颜色','文字の色'],'Toggle translation':['切换翻译','翻訳を切り替え'],
   'Underline words':['单词下划线','単語に下線'],'Underline custom names':['自定义人名下划线','カスタム人名に下線'],'Word status underline width':['单词状态下划线粗细','単語状態の下線の太さ'],'Hide mined words':['隐藏已收录单词',
   '登録済み単語を隠す'],'Show mined words':['显示已收录单词','登録済み単語を表示'],'Waiting for a sentence…':['等待台词…','文を待っています…'],
  'Default sorting in dictionary':['词典默认排序','辞書のデフォルト並び順'],'Number of sentences to display under a word':['单词下显示的例句数','単語の下に表示する例文数'],'Track commonly looked-up words not in dictionary':['记录常查但未收录的单词',
   '辞書にない頻出の辞書引きを記録'],'Minimum lookups to appear':['至少查询几次才显示','表示に必要な最小回数'],'Frequently looked up':['常查单词','よく調べる単語'],'Word image options':['单词图片选项','単語画像の設定'],
   'Only words with an image':['仅含图片的单词','画像のある単語のみ'],'Show in Sentences tab':['在句子页显示','文タブに表示'],'Search words, definitions, or sentences':['搜索单词、释义或句子','単語・意味・文を検索'],
   'Date mined':['收录日期','登録日'],'Times looked up':['查询次数','辞書引き回数'],
  'Default number of sentences to review':['默认复习句数','復習する文のデフォルト数'],'Default number of words to review':['默认复习单词数','復習する単語のデフォルト数'],'Default word review mode':['默认单词复习方式',
   '単語復習のデフォルト方式'],'Only review sentences with translations':['只复习有翻译的句子','翻訳のある文だけ復習'],'Only translated sentences':['仅已翻译的句子','翻訳済みの文のみ'],'Override default review settings':['覆盖默认复习设置',
   'デフォルトの復習設定を上書き'],'Review full sentences':['复习完整句子','文全体を復習'],'Review words in dictionary':['复习词典中的单词','辞書の単語を復習'],'Word levels to include in reviews':['复习包含的单词等级',
   '復習に含める単語レベル'],'Treat "New" words as unknown':['把「新」单词视为未知','「新規」単語を未知として扱う'],'Type of sentence review text':['句子复习文本类型','文復習のテキスト形式'],'Flashcard':['闪卡','フラッシュカード'],
   'Start Review':['开始复习','復習を開始'],'Custom Review':['自定义复习','カスタム復習'],'Review complete':['复习完成','復習完了'],'Back to Reviews':['返回复习','復習に戻る'],'Sentence Review':['句子复习',
   '文の復習'],'Word Review':['单词复习','単語の復習'],'Reviewing sentences':['正在复习句子','文を復習中'],'Reviewing words':['正在复习单词','単語を復習中'],'Reviews':['复习','復習'],'Number of words to show':['显示单词数',
   '表示する単語数'],
  'Known':['已掌握','既知'],'Learned':['已学会','習得済み'],'Familiar':['熟悉','なじみ'],'Recognized':['认识','認識'],'Unknown':['未知','未知'],'Known words':['已掌握单词','既知語'],'Unknown words':['未知单词',
   '未知語'],'All but known':['除已掌握外','既知以外すべて'],'Common':['常用','頻出'],'Uncommon':['少见','まれ'],'Rare':['罕见','希少'],'Easy':['简单','やさしい'],'Medium':['中等','ふつう'],'Hard':['困难',
   '難しい'],'Expert':['专家','上級'],'Insane':['地狱','激ムズ'],'Beginner':['入门','入門'],'Normal':['普通','普通'],'Short':['短','短い'],'Long':['长','長い'],'Very short':['很短','とても短い'],
   'Very long':['很长','とても長い'],
  'Your Stats':['我的统计','あなたの統計'],'Your name':['你的名字','あなたの名前'],'Your profile':['你的资料','プロフィール'],'Activity':['活动','アクティビティ'],'Reading pace':['阅读节奏','読書ペース'],'Reading speed':['阅读速度',
   '読書速度'],'Review Activity':['复习活动','復習アクティビティ'],'Review Breakdown':['复习明细','復習の内訳'],'Review stats for all media':['全部作品的复习统计','全作品の復習統計'],'Sentences Reviewed':['已复习句子',
   '復習した文'],'Words Reviewed':['已复习单词','復習した単語'],'Time on Sentences':['句子用时','文にかけた時間'],'Time on Words':['单词用时','単語にかけた時間'],'Total words':['总字数','総単語数'],'Unique words':['不同单词数',
   '異なり語数'],'Words mined':['已收录单词','登録した単語'],'Mined this session':['本次收录','今回登録'],'Vocab coverage':['词汇覆盖率','語彙カバー率'],'Vocabulary growth':['词汇增长','語彙の伸び'],'Current Streak':['当前连续天数',
   '現在の連続日数'],'Longest Streak':['最长连续天数','最長連続日数'],'Monthly totals':['月度合计','月ごとの合計'],'Average':['平均','平均'],'Avg length':['平均长度','平均の長さ'],'Avg sentence length':['平均句长',
   '平均文長'],'Minutes':['分钟','分'],'Today':['今天','今日'],'This Year':['今年','今年'],'All Time':['全部时间','全期間'],'All time':['全部时间','全期間'],'Last 7 Days':['最近 7 天','過去7日'],
   'Last 30 Days':['最近 30 天','過去30日'],'Last 30 days':['最近 30 天','過去30日'],'Last Reviewed':['上次复习','最終復習'],'No data in this period':['此期间没有数据','この期間のデータはありません'],'By media':['按作品',
   '作品別'],'Bar chart':['柱状图','棒グラフ'],'Dictionary status':['词典状态','辞書の状態'],'Dictionary status split':['词典状态分布','辞書の状態の内訳'],'Words':['单词','単語'],'Sentences':['句子',
   '文'],
  'No media':['没有作品','作品なし'],'No media added yet.':['还没有添加作品。','まだ作品がありません。'],'No results match your search.':['没有符合搜索的结果。','検索に一致する結果はありません。'],'No sentences found.':['没有找到句子。',
   '文が見つかりません。'],'No words found.':['没有找到单词。','単語が見つかりません。'],'No names found.':['没有找到人名。','人名が見つかりません。'],'No reading sessions yet.':['还没有阅读记录。','まだ読書記録がありません。'],
   'No dictionary entry found.':['没有找到词典条目。','辞書項目が見つかりません。'],'No words available to review.':['没有可复习的单词。','復習できる単語はありません。'],'No sentences available to review.':['没有可复习的句子。',
   '復習できる文はありません。'],'No words available to review right now.':['现在没有可复习的单词。','今は復習できる単語がありません。'],'No sentences available to review right now.':['现在没有可复习的句子。','今は復習できる文がありません。'],
   'No synopsis yet - click to write one':['还没有简介，点击填写','あらすじはまだありません（クリックで入力）'],'There are no media entries that match this query.':['没有符合条件的作品。','条件に合う作品はありません。'],
   'No words mined in this session yet.':['本次还没有收录单词。','今回はまだ単語を登録していません。'],'Loading settings…':['正在加载设置…','設定を読み込み中…'],'Loading…':['加载中…','読み込み中…'],'Loading sentences...':['正在加载句子…',
   '文を読み込み中…'],'Loading sessions...':['正在加载记录…','記録を読み込み中…'],'Reading...':['读取中…','読み込み中…'],
  'Title and cover are fetched from VNDB automatically.':['标题和封面会自动从 VNDB 获取。','タイトルとカバーは VNDB から自動取得されます。'],'VNDB ID or title':['VNDB ID 或标题','VNDB ID またはタイトル'],
   'VNDB rating':['VNDB 评分','VNDB 評価'],'Default Title':['默认标题','デフォルトタイトル'],'Tag / card color':['标签 / 卡片颜色','タグ / カードの色'],'Executable':['可执行文件','実行ファイル'],'Made by':['作者',
   '作者'],'tomoyo on GitHub':['GitHub 上的 tomoyo','GitHub の tomoyo'],'On the home page':['在主页','ホーム画面で'],'How is it read?':['怎么读？','どう読む？'],'Usually written using kana alone':['通常只用假名书写',
   '通常かなのみで表記'],'Rare or unlisted in visual novels':['在视觉小说中罕见或未收录','ノベルでは珍しい・未収録'],'Browsing the dictionary':['浏览词典','辞書を閲覧中'],'Viewing media page':['查看作品页','作品ページを閲覧中'],
   'Viewing statistics':['查看统计','統計を閲覧中'],'Editing Settings':['编辑设置','設定を編集中'],
  'active':['进行中','進行中'],'completed':['已完成','完了'],'paused':['已暂停','一時停止'],'dropped':['已弃坑','中断'],'planned':['计划中','予定'],
  'read':['已读','既読'],'sessions':['次阅读','回'],'difficulty':['难度','難易度'],'rating':['评分','評価'],'words':['词','語'],'sentences':['句','文'],'Gathering…':['统计中…','集計中…'],
  'last reading session':['最近一次阅读','前回の読書'],'Log':['阅读记录','読書記録'],'文字 read':['字','文字'],
  'unique words':['不同单词','異なり語'],'words mined':['已收录单词','登録単語'],'total length':['总长度','総文字数'],'avg length':['平均长度','平均の長さ'],'avg vocab coverage':['平均词汇覆盖率','平均語彙カバー率'],
   'last session':['上次阅读','前回'],'on record':['有记录','記録あり']
 };
 // MeguLit Chinese source -> [English, 日本語]
 const ZH={
  '校准':['Calibration','調整'],'字体、字号与显示':['Fonts, size and display','フォント・サイズ・表示'],
  '文字颜色与已读未读':['Text colours, read and unread','文字色・既読と未読'],'行距、间距与留白':['Line spacing, gaps and insets','行間・字間・余白'],
  '文本位置与实时跟随':['Text position and live tracking','文字位置とリアルタイム追従'],'先开游戏后开 MeguLit，或 MeguLit 重开后，用这里或 Alt+M 重新连接':['Opened the game before MeguLit, or restarted MeguLit: reconnect here or with Alt+M','ゲームを先に起動したときや MeguLit を開き直したときは、ここか Alt+M で接続し直します'],'绑定游戏窗口':['Bind game window','ゲームウィンドウを割り当て'],'窗口绑定（高级）':['Window binding (advanced)','ウィンドウ連携（詳細）'],
  '未读渐变':['Unread gradient','未読グラデーション'],'已读渐变':['Read gradient','既読グラデーション'],
  '未读渐变上色':['Unread gradient top','未読・上の色'],'未读渐变下色':['Unread gradient bottom','未読・下の色'],
  '已读渐变上色':['Read gradient top','既読・上の色'],'已读渐变下色':['Read gradient bottom','既読・下の色'],
  '日文行距调整':['Japanese line spacing adjustment','日本語の行間調整'],
  'Hook 引擎与原文替换内嵌（优先）':['Hook engine and embedded replacement (preferred)','Hook エンジンと原文埋め込み置換（優先）'],
  'OCR 覆盖原文（最后兜底）':['OCR cover (last resort)','OCR カバー（最終手段）'],
  '样式校准等待已结束，继续引擎隐藏；未确认的样式保留原设置':['Style calibration wait ended; engine hiding continues with unconfirmed style unchanged','スタイル調整の待機を終了し、未確認の設定を保持してエンジン非表示を続行'],
  '优先查找可内嵌的引擎文本流，暂不启用 OCR':['Searching for embeddable engine streams before using OCR','埋め込み可能なエンジンストリームを優先検索中、OCR は待機'],
  '当前已发现的文本流未提供内嵌，暂用「Hook 读取 + OCR 遮盖原文」':['The currently discovered streams do not expose embedding; temporarily using Hook capture and OCR cover','検出済みのストリームに埋め込み機能がないため、Hook 読み取りと OCR カバーを暫定使用中'],
  '自动：只读取台词 + OCR 遮盖原文（当前已发现的文本流没有提供内嵌）':['Auto: Hook capture + OCR cover (currently discovered streams do not expose embedding)','自動：Hook 読み取り + OCR カバー（検出済みストリームに埋め込み機能なし）'],
  '此功能由':['This feature was created by','この機能の作者：'],'创作':['',''],'bilibili：':['bilibili:','bilibili：'],
  '翻译':['Translate','翻訳'],'语音角色':['Voice character','音声キャラクター'],'同步位置':['Sync position','位置を同期'],'实时同步原文坐标':['Follow original text coordinates live','原文の座標にリアルタイム追従'],
   '优先使用游戏原声，并在答案附游戏截图':['Prefer the game’s own voice and add a game screenshot to the answer','ゲーム本来の音声を優先し、答えにゲーム画面を添付'],'下载推荐声音（男 4 女 4）':['Download recommended voices (4 male, 4 female)',
   'おすすめ音声をダウンロード（男性 4・女性 4）'],'情感／风格':['Emotion / style','感情・スタイル'],'朗读声音':['Reading voice','読み上げ音声'],'文字':['Text','文字'],
  '文字逐字显示':['Typewriter text','文字を一文字ずつ表示'],
  '速度（字/秒）':['Speed (chars/sec)','速度（文字/秒）'],'显示速度（字/秒）':['Reveal speed (characters/sec)','表示速度（文字/秒）'],
  '点击游戏或按空格可补全当前文字；按住 Ctrl 快速显示，不拦截游戏操作':['Click the game or press Space to reveal the current text; hold Ctrl for instant text. Game input is passed through','ゲームをクリックするかスペースで全文表示、Ctrl長押しで即時表示。ゲームの操作は妨げません'],'点游戏或按空格补全当前句；按住 Ctrl 快速显示':['Click or press Space to finish the line; hold Ctrl for instant text','クリックかスペースで文を最後まで表示、Ctrl 長押しで即時表示'],
   '位置':['Layout','位置'],'内嵌':['Embedding','埋め込み'],'学习':['Study','学習'],'外观':['Appearance','外観'],'关于':['About','情報'],
  '切换界面':['Switch view','表示切替'],'开关菜单':['Toggle menu','メニュー開閉'],'绑定窗口':['Bind window','ウィンドウ割り当て'],'Alt+M 绑定窗口 · Alt+T 开关菜单 · 拖动即时预览':['Alt+M bind window · Alt+T toggle menu · drag to preview','Alt+M ウィンドウ割り当て · Alt+T メニュー開閉 · ドラッグでプレビュー'],'Alt+M 绑定当前游戏窗口，Alt+T 开关菜单':['Alt+M binds the game window in front, Alt+T toggles the menu','Alt+M 前面のゲームウィンドウを割り当て、Alt+T メニュー開閉'],'在台词上拖选文字：查词、加 Anki 或收藏句子':['Drag across a line: look up, add to Anki or save the sentence','台詞をドラッグで選択：辞書・Anki 追加・文を保存'],
   '开关内嵌 / 覆盖':['Toggle inline / overlay','埋め込み・オーバーレイ切替'],'随时一键关闭 / 恢复内嵌（连同全部 MeguLit 覆盖），用来对比游戏原文':['turns inline text (and every MeguLit overlay) off or back on at any time, to compare with the original game text',
   'でいつでも埋め込み（と MeguLit の全オーバーレイ）をオン・オフし、ゲーム本来の文と比べられます'],'随时一键关闭 / 恢复内嵌（连同全部 MeguLit 覆盖），用来对比游戏原文；开着「译文由游戏自己显示」时，游戏里的译文不受 Alt+H 影响，只由这个开关控制':['turns inline text (and every MeguLit overlay) off or back on at any time, to compare with the original game text; while the game draws the translation itself, Alt+H leaves it alone and only this switch turns it off',
   'でいつでも埋め込み（と MeguLit の全オーバーレイ）をオン・オフし、ゲーム本来の文と比べられます。ゲーム側で訳を表示中は Alt+H の影響を受けず、このスイッチだけで切り替えます'],'隐藏覆盖':['Hide overlay','オーバーレイ非表示'],'拖动滑块即时预览':['Drag sliders to preview',
   'スライダーで即時プレビュー'],'取消':['Cancel','キャンセル'],'保存并应用':['Save & apply','保存して適用'],'阅读设置':['Reading settings','読書設定'],
  '启用中文翻译':['Enable translation','翻訳を有効化'],'背景全透明（绑定游戏后固定开启）':['Fully transparent background (always on when bound to a game)','背景を完全透過（ゲーム連携中は常にオン）'],'翻译引擎':['Translation engine',
   '翻訳エンジン'],'API 地址':['API URL','API アドレス'],'模型名':['Model','モデル名'],'Azure 区域':['Azure region','Azure リージョン'],'DeepL 接口':['DeepL plan','DeepL プラン'],'结合前文翻译':['Use previous lines as context',
   '前の文を文脈として使う'],'参考前几句':['Context lines','参照する前文の数'],'免费':['Free','無料'],'翻译 API':['Translation APIs','翻訳 API'],'大模型':['LLMs','大規模言語モデル'],'本地 / 离线':['Local / offline',
   'ローカル / オフライン'],'Google 免费':['Google (free)','Google（無料）'],'GPT / OpenAI 兼容接口（自定义地址）':['GPT / OpenAI-compatible (custom URL)','GPT / OpenAI 互換（任意のURL）'],'ID:密钥':['ID:Secret',
   'ID:シークレット'],
  '普通窗口译文外观（高级）':['Normal-window translation style (advanced)','通常ウィンドウの訳文スタイル（詳細）'],'自定义译文字体与颜色':['Custom translation font & color','訳文のフォントと色'],'颜色跟随 MeguLit 主题':['Follow MeguLit theme color',
   'MeguLit テーマの色に合わせる'],'加粗中文':['Bold Chinese','中国語を太字'],'字体':['Font','フォント'],'字号（px）':['Size (px)','文字サイズ（px）'],'文字颜色':['Text color','文字色'],'日文设置':['Japanese text',
   '日本語の設定'],'游戏字体':['Game fonts','ゲームフォント'],'中文设置':['Translation text','中国語の設定'],'注音设置':['Furigana','ふりがなの設定'],'颜色设置':['Colours','色の設定'],'行距与间距':['Line and gap spacing',
   '行間と間隔'],'未读渐变起点（%）':['Unread gradient start (%)','未読グラデーション開始（%）'],'已读渐变起点（%）':['Read gradient start (%)','既読グラデーション開始（%）'],'已读文字颜色':['Read text color','既読テキストの色'],
   '屏幕上未能识别原文，已按可内嵌文本流开启隐藏':['The original text was not recognised on screen; hiding through the embeddable text stream instead','画面上で原文を認識できなかったため、埋め込み可能なテキストストリームで非表示にしました'],
   '将原等待符移到 MeguLit 句末':['Move the original wait marker to the MeguLit text end','元の待機マークを MeguLit の文末に移動'],'这两个开关一般不用开。只有像《素晴らしき日々》那样替换原文后，等待提示符一直在替换过的文字背景下面闪烁、影响阅读时，才推荐打开':['You normally do not need these two switches. Turn them on only when, as in Subahibi, the wait marker keeps blinking under the background of the replaced text after the original is replaced and gets in the way of reading',
   'この 2 つのスイッチは通常オンにする必要はありません。『素晴らしき日々』のように原文を置き換えたあと、待機マークが置き換えた文字の背景の下でずっと点滅して読みにくいときだけオンにしてください'],'隐藏点击等待图标':['Hide the click-wait icon','クリック待ちアイコンを隠す'],'离线模型下载':['Offline model downloads',
   'オフラインモデルのダウンロード'],'HuggingFace（海外）':['HuggingFace (global)','HuggingFace（海外）'],'hf-mirror（国内镜像）':['hf-mirror (China mirror)','hf-mirror（中国ミラー）'],'下载':['Download',
   'ダウンロード'],'删除':['Delete','削除'],'取消':['Cancel','キャンセル'],'GalTransl v4 4B（Galgame 专用，推荐）':['GalTransl v4 4B (for galgames, recommended)','GalTransl v4 4B（ギャルゲー向け・おすすめ）'],
   'Sakura 7B v1.0（轻小说风格）':['Sakura 7B v1.0 (light-novel style)','Sakura 7B v1.0（ラノベ調）'],'Sakura-GalTransl 14B v3.8（质量更高）':['Sakura-GalTransl 14B v3.8 (higher quality)',
   'Sakura-GalTransl 14B v3.8（高品質）'],'Sakura 14B v1.0（质量更高）':['Sakura 14B v1.0 (higher quality)','Sakura 14B v1.0（高品質）'],'Qwen3 8B（通用模型）':['Qwen3 8B (general model)',
   'Qwen3 8B（汎用モデル）'],'AI 大模型接口（填入 API Key 即可）':['AI model APIs (just enter your API key)','AI モデル API（API キーを入力するだけ）'],'本地大模型（离线运行）':['Local models (offline)',
   'ローカルモデル（オフライン）'],'传统机器翻译':['Classic machine translation','従来の機械翻訳'],'豆包（火山方舟）':['Doubao (Volcengine Ark)','Doubao（Volcengine Ark）'],'llama.cpp 本地服务（通用模型）':['llama.cpp local server (general model)',
   'llama.cpp ローカルサーバー（汎用モデル）'],'重新启动 Hook':['Restart hook','フックを再起動'],'使用这条文本流':['Use this text stream','このテキストストリームを使う'],'OCR 遮盖原文':['OCR covers the original text',
   'OCR で原文を覆う'],'自动：YU-RIS 0.474 绘制隐藏原文':['Auto: YU-RIS 0.474 draw-hide of the original text','自動：YU-RIS 0.474 描画で原文を隠す'],'自动：LunaHook 内嵌，在引擎内隐藏原文':['Auto: LunaHook embed, original text hidden inside the engine',
   '自動：LunaHook 埋め込み、エンジン内で原文を隠す'],'自动：只读取台词 + OCR 遮盖原文（此游戏没有可内嵌的文本流）':['Auto: read lines + OCR cover (no embeddable stream in this game)','自動：台詞読み取り＋OCR で原文を覆う（埋め込み可能なストリームなし）'],
   '自动：只读取台词，等待可内嵌的文本流':['Auto: reading lines, waiting for an embeddable stream','自動：台詞を読み取り中、埋め込み可能なストリーム待ち'],'自动：只读取台词（未开启隐藏原文）':['Auto: reading lines only (hiding is off)',
   '自動：台詞の読み取りのみ（原文非表示はオフ）'],'此游戏的文本流不支持内嵌，已自动改用「只读取 + OCR 遮盖原文」':["This game's streams can't be embedded; switched to read + OCR cover",'このゲームのストリームは埋め込み不可のため「読み取り＋OCR で覆う」に切り替えました'],
   '原位置遮盖方式':['Cover for the original spot','元の位置の覆い方'],'游戏真实画面（等待符闪灭时截取）':["Game's real picture (taken while the marker blinks off)",'ゲームの実画面（マークが消えた瞬間を取得）'],'周围色推算融合':['Estimated from surrounding colours',
   '周囲の色から推定してなじませる'],'迁移时自动隐藏原位置；提取不可靠时保留原等待符（单独隐藏仍按下方开关）':['Moving hides the original position; uncertain extraction keeps it there (separate hiding follows the switch below)',
   '移動中は元の位置を隠します。抽出できない場合は元の位置に残します（個別の非表示は下の設定に従います）'],'恢复上一个颜色':['Restore previous color','前の文字色に戻す'],
  '假名大小':['Furigana size','ふりがなの大きさ'],'假名水平偏移':['Furigana X offset','ふりがな横オフセット'],'假名垂直偏移':['Furigana Y offset','ふりがな縦オフセット'],'单行微调':['Per-row tweak','行ごと調整'],'垂直':['Vertical','縦'],'水平':['Horizontal','横'],'假名注音':['Furigana','ふりがな'],'汉字上方自动注音（本地）':['Auto furigana above kanji (local)','漢字の上に自動ふりがな（ローカル）'],'假名大小（相对正文）':['Furigana size (relative)','ふりがなの大きさ（本文比）'],
   '假名水平位置 X（右＋，px）':['Furigana X offset (px)','ふりがな横位置 X（px）'],'假名垂直位置 Y（下＋，px）':['Furigana Y offset (px)','ふりがな縦位置 Y（px）'],'假名描边':['Furigana outline','ふりがなの縁取り'],
   '假名描边颜色':['Furigana outline color','ふりがなの縁取り色'],'假名描边粗细':['Furigana outline width','ふりがなの縁取りの太さ'],
  '日文字体与描边':['Japanese font & outline','日本語フォントと縁取り'],'中文字体与描边':['Chinese font & outline','中国語フォントと縁取り'],'日文字体':['Japanese font','日本語フォント'],'中文字体':['Chinese font',
   '中国語フォント'],'注音字体':['Furigana font','ふりがなフォント'],'开启日文描边':['Japanese outline','日本語の縁取り'],'开启中文描边':['Chinese outline','中国語の縁取り'],'日文描边颜色':['Japanese outline color',
   '日本語の縁取り色'],'日文描边粗细':['Japanese outline width','日本語の縁取りの太さ'],'中文描边颜色':['Chinese outline color','中国語の縁取り色'],'中文描边粗细':['Chinese outline width','中国語の縁取りの太さ'],'中文字距（px）':['Chinese letter spacing (px)',
   '中国語の字間（px）'],'日文字距（px）':['Japanese letter spacing (px)','日本語の字間（px）'],'日文行距':['Japanese line height','日本語の行間'],'日文字号':['Japanese size','日本語の文字サイズ'],'中文字号':['Chinese size',
   '中国語の文字サイズ'],'日文加粗':['Bold Japanese','日本語を太字'],'中文加粗':['Bold Chinese','中国語を太字'],
  '中文紧随日文':['Continue Chinese after Japanese','中国語訳を日本語の後に続ける'],
  '显示内容':['Show','表示内容'],'日文＋假名／中文':['Japanese + furigana / Chinese','日本語＋ふりがな／中国語'],'仅日文＋假名':['Japanese + furigana only','日本語＋ふりがなのみ'],'仅中文 · 接近汉化版':['Chinese only · like a translation patch',
   '中国語のみ・翻訳パッチ風'],'文字阴影':['Text shadow','文字の影'],'细描边 · 适合复杂背景':['Thin outline · busy backgrounds','細い縁取り・複雑な背景向け'],'柔和阴影':['Soft shadow','柔らかい影'],'无阴影':['No shadow',
   '影なし'],'字号跟随游戏窗口缩放':['Scale text with the game window','ゲームウィンドウに合わせて拡大縮小'],'行距与留白':['Spacing & padding','行間と余白'],'译文行距':['Translation line spacing','訳文の行間'],
   '原文与译文间距':['Gap between original and translation','原文と訳文の間隔'],'译文间距':['Translation gap','訳文との間隔'],'译文换行宽度（0 = 跟随日文）':['Translation wrap width (0 = follow the Japanese)',
   '訳文の折り返し幅（0 = 日本語に合わせる）'],'左右留白':['Horizontal padding','左右の余白'],'上下留白':['Vertical padding','上下の余白'],'系统黑体':['SimHei (system)','SimHei（システム）'],'微软雅黑':['Microsoft YaHei',
   'Microsoft YaHei'],'宋体':['SimSun','SimSun'],'楷体':['KaiTi','KaiTi'],'游明朝':['Yu Mincho','游明朝'],'游黑体':['Yu Gothic','游ゴシック'],'跟随日文字体':['Same as Japanese font','日本語フォントと同じ'],
   'Meiryo（圆滑清晰假名）':['Meiryo (smooth, clear kana)','メイリオ（なめらかなかな）'],
  '使用游戏字体':['Use game fonts','ゲームのフォントを使う'],'重新查找游戏字体':['Search game fonts again','ゲームのフォントを再検索'],'还没检测游戏字体':['Game fonts not checked yet','ゲームのフォントは未検出'],'绑定游戏窗口后会自动到游戏目录里查找原版字体和汉化字体':['After binding a game window, MeguLit looks for the original and patch fonts in the game folder',
   'ゲームウィンドウを連携すると、ゲームフォルダの元フォントと翻訳パッチのフォントを自動で探します'],'正在游戏目录里查找字体…':['Searching the game folder for fonts…','ゲームフォルダでフォントを検索中…'],'游戏字体查找失败':['Could not search game fonts',
   'ゲームフォントの検索に失敗'],
  '游戏窗口与对话框位置':['Game window & dialog position','ゲームウィンドウと会話欄の位置'],'版式预设':['Layout preset','レイアウトのプリセット'],'自定义位置':['Custom position','カスタム位置'],'底部对话框（ADV）':['Bottom dialog (ADV)',
   '下部の会話欄（ADV）'],'全屏文本（NVL）':['Full-screen text (NVL)','全画面テキスト（NVL）'],'画面上方字幕':['Subtitles at top','画面上部の字幕'],'文本框左边距':['Box left','テキスト枠 左'],'文本框上边距':['Box top',
   'テキスト枠 上'],'文字换行宽度':['Text wrapping width','文字の折り返し幅'],'按原文位置排布，文字可自然延伸到游戏窗口外':['ISLAND places each Japanese/Chinese pair at its original position and makes room on dense pages; no box size is needed',
   'ISLAND は各原文の位置に日中の組を配置し、密なページでは訳文の空間を確保します。枠の幅・高さの設定は不要です'],'显示区域随实际文字增长，高度自动调整':['The visible area follows rendered text; height adjusts automatically','表示領域は描画された文字に追従し、高さは自動調整されます'],
   '文本框宽度':['Box width','テキスト枠 幅'],'文本框高度':['Box height','テキスト枠 高さ'],'选择正在运行的游戏窗口':['Pick the running game window','起動中のゲームウィンドウを選択'],'刷新窗口':['Refresh windows',
   'ウィンドウを更新'],'绑定此窗口':['Bind this window','このウィンドウと連携'],'解除绑定':['Unbind','連携を解除'],'游戏窗口':['Game window','ゲームウィンドウ'],
  '局部模糊与原文字扫描范围':['Blur & original-text scan area','ぼかしと原文スキャン範囲'],'扫描左边距':['Scan left','スキャン 左'],'扫描上边距':['Scan top','スキャン 上'],'扫描宽度':['Scan width','スキャン 幅'],'扫描高度':['Scan height',
   'スキャン 高さ'],'模糊强度':['Blur strength','ぼかしの強さ'],'遮字扩边 px':['Cover padding px','覆いの余白 px'],'遮字外观':['Cover style','覆いの見た目'],
  '隐藏游戏原文':['Hide the game\'s original text','ゲームの原文を隠す'],'全自动：打开游戏后自动读取，找到文本流就自动隐藏':['Fully automatic: read when the game opens, hide once a text stream is found',
   '全自動：ゲーム起動で読み取り、テキストストリームが見つかれば自動で隠す'],'开或关之后约 3 秒，从下一句开始生效；当前已显示的那句不会立刻变':['Takes effect from the next line, about 3 s after switching; the current line stays as is',
   '切り替えから約3秒後、次の文から反映されます（表示中の文はそのまま）'],'高级：Hook 引擎与文本流':['Advanced: hook engines & text streams','詳細：フックエンジンとテキストストリーム'],'快速切换（跳过「先显示一句确认原文位置」，少等一句）':['Fast switching (skip the one-line position check)',
   '高速切替（原文位置の確認を省略）'],'通用 LunaHook · 只读取':['LunaHook · read only','LunaHook・読み取りのみ'],'自动识别引擎，只抓台词，不隐藏':['Detects the engine, captures lines, does not hide','エンジンを自動判別し文を取得（隠さない）'],
   'YU-RIS 0.474 · 隐藏原文':['YU-RIS 0.474 · hide text','YU-RIS 0.474・原文を隠す'],'官方内嵌 Hook · 隐藏原文':['Embedded hook · hide text','埋め込みフック・原文を隠す'],'需要当前游戏提供可内嵌文本流':['Needs an embeddable text stream',
   '埋め込み可能なテキストストリームが必要'],'重新检查游戏画面':['Re-check the game screen','ゲーム画面を再チェック'],'停止 Hook':['Stop hook','フックを停止'],'跳过基线并启动（效果未确认）':['Start without baseline (unverified)',
   '基準なしで開始（未確認）'],'已发现的文本流':['Text streams found','見つかったテキストストリーム'],'还没有发现文本流，在游戏里推进一句':['No text stream yet — advance one line in the game','テキストストリームはまだありません。ゲームで1文進めてください'],
   '启动读取':['Start reading','読み取り開始'],'启动隐藏并检查':['Hide & check','隠して確認'],'Hook 诊断':['Hook diagnostics','フック診断'],'重新枚举／恢复文本':['Re-scan / restore text','再列挙／テキスト復元'],
   '我已确认游戏原文隐藏':['I confirmed the text is hidden','原文が隠れたことを確認しました'],
  '游戏已连接':['Game connected','ゲーム接続済み'],'等待游戏':['Waiting for game','ゲーム待ち'],'等待游戏连接':['Waiting for game','ゲーム接続待ち'],'Hook 已停止':['Hook stopped','フック停止中'],'原文已隐藏':['Original text hidden',
   '原文を非表示中'],'隐藏已开启':['Hiding on','非表示オン'],'隐藏切换中':['Switching…','切替中…'],'原文仍可见':['Original still visible','原文がまだ見えます'],'原文显示中（只读取）':['Original shown (read only)',
   '原文表示中（読み取りのみ）'],'等待可隐藏的文本流':['Waiting for a hideable stream','隠せるストリームを待機中'],'等待新台词':['Waiting for a new line','新しい文を待機中'],'仅读取':['Read only','読み取りのみ'],'隐藏检查通过':['Hide check passed',
   '非表示チェック合格'],'画面待确认':['Screen not confirmed','画面未確認'],
  '译文模糊（悬停显示）':['Blur translation (hover to show)','訳文をぼかす（ホバーで表示）'],'译文默认模糊，鼠标移上去才显示':['Translation stays blurred until the pointer is over it','マウスを乗せるまで訳文をぼかします'],
   '沉浸模式':['Immersion mode','没入モード'],'无对话时自动隐藏，下一句出现时再显示':['Auto-hide when no dialog, show again on the next line','会話がないときは自動で隠し、次の文で再表示'],'沉浸模式判断方式':['Dialog detection',
   '会話の判定方法'],'游戏等待标记 ▼（推荐，无需校准）':['Game wait marker ▼ (recommended)','ゲームの待機マーク ▼（推奨）'],'Hook 明确空文本信号':['Hook empty-text signal','フックの空テキスト信号'],'画面对话框边缘检测（需校准）':['Dialog edge detection (needs calibration)',
   '会話欄の縁検出（要調整）'],'边缘左侧':['Edge left','縁 左'],'边缘顶部':['Edge top','縁 上'],'边缘宽度':['Edge width','縁 幅'],'边缘高度':['Edge height','縁 高さ'],'记住当前对话框边缘':['Remember current dialog edge',
   '現在の会話欄の縁を記憶'],'保存沉浸模式设置':['Save immersion settings','没入モード設定を保存'],
  '语音与 Anki':['Voice & Anki','音声と Anki'],'▶ 试听':['▶ Preview','▶ 試聴'],'合成中…':['Synthesizing…','合成中…'],'播放中…':['Playing…','再生中…'],'朗读声音（话者 · 风格）':['Voice (speaker · style)',
   '読み上げ音声（話者・スタイル）'],'AivisSpeech 里每个「话者」是一种声音，每个声音有几种说话风格（普通、温柔、开心等），每种风格对应一个 ID；在这里直接选声音和风格即可。':['In AivisSpeech each speaker is a voice, and each voice has a few speaking styles (normal, gentle, happy…), each with its own ID. Just pick the voice and style here.',
   'AivisSpeech では「話者」が声、各声に複数の話し方スタイル（ノーマル・あまあま等）があり、スタイルごとに ID があります。ここで声とスタイルを選ぶだけで OK です。'],'AivisSpeech 地址':['AivisSpeech URL','AivisSpeech アドレス'],'话者样式 ID':['Speaker style ID',
   '話者スタイル ID'],'朗读音量':['Volume','読み上げ音量'],'语速':['Speed','話速'],'使用显卡加速朗读（更快；重启软件后生效）':['GPU-accelerated speech (faster; applies after restart)','GPU で読み上げを高速化（再起動後に反映）'],
   'AnkiConnect 地址':['AnkiConnect URL','AnkiConnect アドレス'],'Anki 牌组':['Anki deck','Anki デッキ'],'Anki 笔记类型':['Anki note type','Anki ノートタイプ'],'Anki 程序路径（anki.exe，留空则自动查找）':['Anki path (anki.exe, blank = auto)',
   'Anki のパス（anki.exe、空欄で自動検索）'],'制卡包含语音':['Include audio in cards','カードに音声を含める'],'保存学习服务':['Save study services','学習サービスを保存'],'刷新声音列表':['Refresh voice list','声の一覧を更新'],
   '读取话者':['Load speakers','話者を読み込む'],'检查 Anki':['Check Anki','Anki を確認'],'启动 Anki':['Launch Anki','Anki を起動'],'自动查找 anki.exe':['Find anki.exe','anki.exe を自動検索'],
   '朗读当前词':['Read word aloud','単語を読み上げ'],'选择音调':['Choose pitch','アクセントを選択'],
  '上下文解释':['Explain in context','文脈で解説'],'归纳义项':['Summarize senses','語義をまとめる'],'AI 归纳义项':['AI sense summary','AI 語義まとめ'],'本句':['This line','この文'],
  '原版与来源':['Original & credits','オリジナルとクレジット'],'快捷键':['Shortcuts','ショートカット'],'原文隐藏（内嵌页）怎么用':['How original-text hiding works (Embedding tab)','原文非表示の使い方（埋め込みタブ）'],
   '本版本由':['This build was modified by','このビルドの改変者：'],'复制':['Copy','コピー'],'已复制':['Copied','コピーしました'],'B站：':['Bilibili:','Bilibili：'],'文字页说明':['Text tab notes','文字タブの説明'],
   '位置页说明':['Layout tab notes','位置タブの説明'],'内嵌页说明':['Embedding tab notes','埋め込みタブの説明'],
  '已保存，重启仍保留':['Saved (kept after restart)','保存しました（再起動後も保持）'],'正在应用…':['Applying…','適用中…'],'请填写有效的模型名':['Please enter a valid model name','有効なモデル名を入力してください'],'保存响应超时，输入已保留，请重试':['Save response timed out; your input is kept. Please retry',
   '保存の応答がタイムアウトしました。入力は保持されています。再試行してください'],'已应用并保存，重启后无需重新设置':['Applied and saved','適用して保存しました']
 };

 Object.assign(EN,{"Statistics": ["统计", "統計"], "History": ["历史记录", "履歴"], "Start reading": ["启动", "起動"], "Pause reading": ["暂停阅读", "読書を一時停止"], "Resume reading": ["继续阅读",
  "読書を再開"], "Stop reading": ["停止阅读", "読書を終了"], "Launch": ["启动", "起動"], "Translation": ["翻译", "翻訳"], "Translations": ["翻译", "翻訳"], "Search": ["搜索", "検索"], "Search...": ["搜索…",
  "検索…"], "Search media": ["搜索作品", "作品を検索"], "Search dictionary": ["搜索词典", "辞書を検索"], "Sort by": ["排序方式", "並び順"], "Sort": ["排序", "並び替え"], "Ascending": ["升序", "昇順"],
  "Descending": ["降序", "降順"], "Date added": ["添加日期", "追加日"], "Last read": ["上次阅读", "最終読書日"], "Recently read": ["最近阅读", "最近読んだ作品"], "Reading time": ["阅读时间", "読書時間"],
  "Total reading time": ["总阅读时间", "総読書時間"], "Characters": ["字数", "文字数"], "Characters read": ["已读字数", "読了文字数"], "Characters per hour": ["每小时字数", "1時間の文字数"], "Average reading speed": ["平均阅读速度",
  "平均読書速度"], "Reading sessions": ["阅读记录", "読書セッション"], "Session history": ["阅读历史", "読書履歴"], "No sessions yet": ["暂无阅读记录", "読書履歴はありません"], "No results": ["没有结果", "結果なし"],
  "Loading...": ["加载中…", "読み込み中…"], "Loading…": ["加载中…", "読み込み中…"], "Please wait...": ["请稍候…", "お待ちください…"], "Waiting for a sentence...": ["等待台词…", "文を待っています…"],
  "Select all": ["全选", "すべて選択"], "Deselect all": ["取消全选", "選択を解除"], "Reset": ["重置", "リセット"], "Reset to default": ["恢复默认", "初期設定に戻す"], "Apply": ["应用", "適用"], "Enabled": ["已启用",
  "有効"], "Disabled": ["已停用", "無効"], "Enable": ["启用", "有効化"], "Disable": ["停用", "無効化"], "Connection": ["连接", "接続"], "Connected": ["已连接", "接続済み"], "Disconnected": ["未连接",
  "未接続"], "Reconnect": ["重新连接", "再接続"], "Browse": ["浏览", "参照"], "Select file": ["选择文件", "ファイルを選択"], "Open folder": ["打开文件夹", "フォルダーを開く"], "Remove image": ["移除图片",
  "画像を削除"], "Edit media": ["编辑作品", "作品を編集"], "Add media": ["添加作品", "作品を追加"], "Add new media": ["添加新作品", "新しい作品を追加"], "Reading": ["阅读", "読書"], "Finished": ["已读完",
  "読了"], "Hours": ["小时", "時間"], "Days": ["天", "日"], "Date": ["日期", "日付"], "Duration": ["时长", "所要時間"], "Time spent": ["用时", "所要時間"], "Total": ["合计", "合計"], "Today's activity": ["今日活动",
  "今日のアクティビティ"], "No activity": ["暂无活动", "アクティビティなし"], "Show more": ["显示更多", "もっと見る"], "Show less": ["收起", "折りたたむ"], "Confirm": ["确认", "確認"], "Are you sure?": ["确定吗？",
  "よろしいですか？"], "Copy": ["复制", "コピー"], "Copied": ["已复制", "コピーしました"], "Advanced": ["高级", "詳細"], "Appearance": ["外观", "外観"], "Language": ["界面语言", "表示言語"], "Light": ["浅色",
  "ライト"], "Dark": ["深色", "ダーク"], "System": ["跟随系统", "システム"], "Show translation": ["显示翻译", "翻訳を表示"], "Hide translation": ["隐藏翻译", "翻訳を隠す"], "No translation": ["暂无翻译",
  "翻訳なし"], "Notes": ["备注", "メモ"], "Description": ["说明", "説明"], "Search by title": ["按标题搜索", "タイトルで検索"], "Optional": ["可选", "任意"], "Required": ["必填", "必須"], "Edit title": ["编辑标题",
  "タイトルを編集"], "Reading progress": ["阅读进度", "読書の進捗"], "Current session": ["当前阅读", "現在のセッション"], "Last session": ["上次阅读", "前回のセッション"]});
 Object.assign(ZH,{"日文＋假名／英文":["Japanese + kana / English","日本語＋ふりがな／英語"],"仅英文":["English only","英語のみ"],"不显示（只看游戏文本框）":["Nothing (read the game's own text box)",
  "表示しない（ゲームのテキスト枠だけ）"],"开启后游戏文本框直接显示译文，位置和字体都由游戏自己处理；Alt+H 只开关 MeguLit 自己的显示，不影响游戏写回的译文":["The game's text box shows the translation itself, with its own position and font; Alt+H only toggles MeguLit's own layers, not the translation written into the game",
  "ゲームのテキスト枠に訳を直接表示します。Alt+H は MeguLit 自身の表示だけを切り替え、ゲームに書き込んだ訳には影響しません"]});
Object.assign(ZH,{"文本不对？重新选取文本流":["Wrong text? Re-pick the text stream","テキストが違う？テキストストリームを選び直す"],"扫描范围自动跟随文字框（推荐；随窗口移动、缩放和全屏自动调整，整页游戏自动扫整个画面）":["Scan area follows the text box (recommended; adjusts with window moves, resizing and full screen; full-page games scan the whole screen)",
 "スキャン範囲をテキスト枠に追従（推奨。ウィンドウ移動・サイズ変更・全画面に自動対応、全画面テキストのゲームは画面全体）"],"零延迟翻译（汉化脚本）":["Zero-latency translation (translation script)","ゼロ遅延翻訳（翻訳スクリプト）"],"当前作品已用汉化脚本：能对上的句子直接用汉化组译文（零延迟），翻译引擎只翻对不上的句子":["This game uses an imported translation script: matched lines take the group's translation at once; the engine only translates the rest",
 "翻訳スクリプトを使用中：一致した文はパッチの訳をそのまま使い、翻訳エンジンは残りだけを訳します"]});
Object.assign(ZH,{"隐藏点击等待图标（绘制 Hook，仅支持已适配的游戏）": ["Hide click-wait icon (render hook; supported games only)", "クリック待ちアイコンを非表示（描画フック・対応ゲームのみ）"], "不再使用补色遮挡或记忆遮挡位置；当前绘制 Hook 尚未安全启用，游戏原等待图标会保留": ["Pixel covers and saved mask positions have been removed. The render hook is not enabled safely yet; the original wait icon remains.",
 "塗りつぶしと位置の記憶は廃止しました。描画フックはまだ安全に有効化できないため、元の待機アイコンは表示されます。"], "正在保存…": ["Saving…", "保存中…"], "保存成功": ["Saved", "保存しました"], "刷新": ["Refresh", "更新"], "检查连接": ["Test connection",
 "接続テスト"], "自动检测": ["Auto detect", "自動検出"], "连接失败": ["Connection failed", "接続失敗"], "未连接": ["Disconnected", "未接続"], "未绑定": ["Not bound", "未連携"], "已绑定": ["Bound",
 "連携済み"], "尚未配置": ["Not configured", "未設定"], "请选择": ["Please select", "選択してください"], "点击刷新选择窗口": ["Refresh to select a window", "更新してウィンドウを選択"], "先绑定游戏并推进一句": ["Bind a game and advance one line",
 "ゲームを連携して1文進めてください"], "选择对话文本流": ["Select a dialogue stream", "会話ストリームを選択"], "使用这条对话流": ["Use this dialogue stream", "このストリームを使用"], "Hook 已停止": ["Hook stopped",
 "フック停止中"], "局部遮字已关闭": ["Local text masking is off", "局所テキストマスクはオフ"], "还没有绑定游戏窗口，先打开游戏再按 Alt+T 绑定": ["No game is bound. Open the game and use Alt+T to bind it.",
 "ゲームが未連携です。ゲームを開き Alt+T で連携してください。"], "已保存": ["Saved", "保存しました"], "检测中…": ["Detecting…", "検出中…"], "未检测到游戏字体": ["No game fonts detected", "ゲームのフォントが見つかりません"], "默认": ["Default",
 "デフォルト"], "恢复默认": ["Reset to default", "初期設定に戻す"], "保存设置": ["Save settings", "設定を保存"]});
 Object.assign(ZH,{"注音字体与描边": ["Furigana font & outline", "ふりがなフォントと縁取り"], "隐藏点击等待图标（取周围色自然融合）": ["Hide wait icon (blend with surrounding colours)", "待機アイコンを隠す（周囲の色になじませる）"],
  "只覆盖当前确认的一个等待符，取邻近像素融合；不会累积历史遮挡位置": ["Covers one confirmed current wait icon using nearby pixels; no saved or accumulated mask positions.", "確認済みの待機アイコン1個のみ、周囲の色で補完します。過去の位置は保存しません。"]});
 // Sentences built from numbers + English words (e.g. "494 sentences read"): [regex, 中文, 日本語] with $1… placeholders.
 Object.assign(ZH,{'语音':['Voice','音声'],'记录':['Log','ログ'],'朗读语音':['Speech voice','読み上げ音声'],'Anki 制卡':['Anki cards','Anki カード作成'],'保存语音设置':['Save voice settings',
  '音声設定を保存'],'■ 停止':['■ Stop','■ 停止'],'绑定游戏后检测版本':['Detected after binding a game','ゲームをバインドすると判定'],'在游戏里点一下推进一句，MeguLit 就会开始读':['Choose a hook mode below, then advance one line in the game',
  '下のフック方式を選び、ゲームで1行進めてください'],'只检查游戏自己的画面，MeguLit 的译文不算在内':['Checks the game\'s own picture; the overlay is not counted','ゲーム自体の画面を確認します（オーバーレイは対象外）'],'检查范围沿用下方「原文字扫描范围」；画面检查只在本机处理':['The check uses the scan range below; screenshots never leave this PC',
  '確認範囲は下の「原文スキャン範囲」。画面確認はこの PC 内だけで行います'],'对话文本流':['Dialogue text stream','セリフのテキストストリーム'],'原文隐藏':['Hide original text','原文の非表示'],'点击等待图标':['Click-wait icon','クリック待ちアイコン'],
  '状态与诊断':['Status & diagnostics','状態と診断']});
 Object.assign(ZH,{'画面边缘检测区域（按游戏窗口百分比，窗口缩放后自动适配）':['Edge detection area (percent of the game window; follows window resizing)','画面端検出の範囲（ゲームウィンドウに対する％。サイズ変更に自動で追従）'],
  '左边距 %':['Left %','左 %'],'上边距 %':['Top %','上 %'],'宽度 %':['Width %','幅 %'],'高度 %':['Height %','高さ %'],'跟随游戏自己的「点击继续」标记判断有没有对话，不用设置，窗口大小变化也会自动适配':['Uses the game’s own "click to continue" marker to tell when dialogue is on screen. Nothing to set up, and it adapts to window size changes',
  'ゲーム自身の「クリック待ち」マークで会話の有無を判断します。設定は不要で、ウィンドウサイズが変わっても自動で合わせます'],'游戏发出空文本时隐藏，适合文字钩子稳定的游戏':['Hides when the game sends empty text; best for games with a stable text hook',
  'ゲームが空のテキストを送ったときに隠します。テキストフックが安定したゲーム向け'],'检测对话框边缘是否还在。先进入有对话框的画面，再点「记住当前对话框边缘」':['Checks whether the dialogue box edge is still on screen. Open a scene with the dialogue box, then click "Remember current dialogue box edge"',
  '会話ボックスの端が画面にあるかを調べます。会話ボックスが出ている場面で「現在の会話ボックスの端を記憶」を押してください']});
 Object.assign(ZH,{"学习与辞书": ["Learning & dictionaries", "学習と辞書"], "学习者与本地辞书 / Learner & dictionaries": ["Learning & local dictionaries", "学習とローカル辞書"], "学习者语言 / Learner language": ["Definition language",
  "辞書の説明言語"], "中文学习者：中文释义、词性和动词类别": ["Chinese definitions, parts of speech and verb types", "中国語の語義・品詞・動詞分類"], "本地分词 · 注音 · 点读": ["Local tokenization, readings & lookup",
  "ローカルの形態素解析・読み・単語検索"], "SudachiDict Full ＋ JMdict（全流程）": ["SudachiDict Full + JMdict (complete local pipeline)", "SudachiDict Full ＋ JMdict（ローカル処理）"], "UniDic（MeguLit 内置分词）＋ JMdict 读音校正": ["UniDic (built-in) + JMdict reading corrections",
  "UniDic（内蔵解析）＋ JMdict の読み補正"], "Sudachi 模式下分词、书写读音、词形还原和点读均经同一条本地流程；首次安装需要下载词典，日常使用不调用注音或查词 API": ["Sudachi handles tokenization, readings, lemmatization and lookup locally. Dictionaries download once; everyday use needs no reading or lookup API.",
  "Sudachi は形態素解析・読み・原形復元・単語検索をローカルで処理します。初回のみ辞書をダウンロードし、通常は API を使用しません。"], "选择 Full 后不会静默切回旧分词器；缺少组件时会显示安装状态": ["Full mode keeps the selected tokenizer. Missing components appear in the installation status.",
  "Full モードでは選択した解析器を維持します。不足するコンポーネントはインストール状態に表示されます。"], "全自动：读取台词、同步原文样式并内嵌": ["Automatic: capture dialogue, sync original style and embed", "自動：台詞取得・原文スタイル同期・埋め込み"]});
 Object.assign(ZH,{"选区解释与义项归纳（可选大模型）": ["Selection explanation & sense summaries (optional AI)", "選択範囲の解説・語義の要約（任意の AI）"], "使用方式": ["Mode", "使用方法"], "只用本地词典（不需要 Key）": ["Local dictionaries only (no key required)",
  "ローカル辞書のみ（キー不要）"], "跟随台词翻译引擎": ["Use the dialogue translation engine", "台詞翻訳のエンジンに合わせる"], "OpenAI／兼容接口": ["OpenAI / compatible API", "OpenAI／互換 API"], "模型名（按服务商提供的名称填写）": ["Model name provided by your service",
  "サービスが指定するモデル名"], "API Key，由 Windows 加密保存": ["API key, encrypted by Windows", "API キー（Windows で暗号化して保存）"], "接口地址": ["API endpoint", "API エンドポイント"], "保存学习模型": ["Save learning models",
  "学習用モデルを保存"], "本地查词、读音和变形分析始终可离线使用；API 只在主动点击时调用，结果单独标记，不替换辞书原文。": ["Local lookup, readings and inflection analysis work offline. AI runs only when requested and is shown separately from dictionary entries.",
  "単語検索・読み・活用解析はオフラインで利用できます。AI は手動で実行した場合のみ使用し、辞書の原文とは分けて表示します。"], "制卡要先让本机的 Anki 软件开着，并装好 AnkiConnect 插件（工具 → 插件 → 获取插件，代码 2055492159，装完重启 Anki）。也可以在下面填好 anki.exe 的路径并保存，之后点「启动 Anki」就行；默认安装位置一般是 C:\\Users\\你的用户名\\AppData\\Local\\Programs\\Anki\\anki.exe。": ["Open Anki with AnkiConnect installed (Tools → Add-ons → Get Add-ons, code 2055492159), then restart Anki. You can also save the anki.exe path below and launch Anki here.",
  "AnkiConnect をインストールした Anki を起動してください（ツール → アドオン → アドオンを取得、コード 2055492159。追加後に Anki を再起動）。下で anki.exe のパスを保存すると、ここから起動できます。"]});
 const PATTERNS=[
  [/^([\d,]+) characters read$/,'已读 $1 字','$1 文字を読了'],[/^([\d,.]+) chars?\/h$/,'$1 字/小时','$1 文字/時'],[/^([\d,]+) characters?$/,'$1 字','$1 文字'],[/^([\d,]+) sessions?$/,
   '$1 次阅读','$1 セッション'],

  [/^([\d,.]+) sentences read$/,'已读 $1 句','$1 文を読了'],[/^across ([\d,]+) sessions?$/,'共 $1 次阅读','$1 回の読書'],
  [/^([\d,]+)日 streak$/,'连续 $1 天','$1 日連続'],[/^best ([\d,]+)日$/,'最长 $1 天','最長 $1 日'],[/^(.+)'s stats$/,'$1 的统计','$1 の統計'],
  [/^([\d,]+) reviews?$/,'$1 次复习','$1 回復習'],[/^([\d,]+) words?$/,'$1 个单词','$1 語'],[/^([\d,]+) sentences?$/,'$1 句','$1 文'],[/^([\d,]+) names?$/,'$1 个人名','$1 件の人名'],
  [/^Words mined \((.+)\)$/,'已收录单词（$1）','登録した単語（$1）'],[/^Time Spent \((.+)\)$/,'用时（$1）','所要時間（$1）'],[/^Total Reviews \((.+)\)$/,'复习总数（$1）','復習回数（$1）'],
  [/^Review stats for (.+)$/,'$1 的复习统计','$1 の復習統計'],[/^Page ([\d,]+) of ([\d,]+) · ([\d,]+) (names|sentences|words)$/,'第 $1 / $2 页 · 共 $3 条','$1 / $2 ページ · 全 $3 件'],
  [/^([\d,]+)d ago$/,'$1 天前','$1 日前'],[/^([\d,]+)h ago$/,'$1 小时前','$1 時間前'],[/^([\d,]+)m ago$/,'$1 分钟前','$1 分前'],
  [/^Level ([\d]+)$/,'等级 $1','レベル $1'],[/^Mined (.+)$/,'收录于 $1','$1 に登録'],[/^Added ([\d,]+) words?, skipped ([\d,]+)\.$/,'已添加 $1 个单词，跳过 $2 个。','$1 語を追加、$2 語をスキップしました。'],
  [/^Sentences \(([\d.]+)%\)$/,'句子（$1%）','文（$1%）'],[/^Words \(([\d.]+)%\)$/,'单词（$1%）','単語（$1%）'],[/^([\d,]+)\/([\d,]+) reviewed$/,'已复习 $1/$2','$1/$2 復習済み'],
  [/^([\d.]+)\/5 on jiten\.moe$/,'jiten.moe 评分 $1/5','jiten.moe で $1/5'],[/^Skipped words \(([\d,]+)\)$/,'跳过的单词（$1）','スキップした単語（$1）'],[/^Media #([\d]+)$/,'作品 #$1',
   '作品 #$1'],
  [/^([\d,]+) sentences? reviewed in (.+)$/,'$2 内复习了 $1 句','$2 で $1 文を復習'],[/^([\d,]+) words? reviewed in (.+)$/,'$2 内复习了 $1 个单词','$2 で $1 語を復習'],[/^\(([\d.]+)s per (sentence|word)\)$/,
   '（每个$2 $1 秒）','（$2あたり $1 秒）'],
  [/^Select (.+) theme$/,'选择 $1 主题','$1 テーマを選択'],[/^Imported from (.+)$/,'导入自 $1','$1 からインポート'],[/^Export failed: (.+)$/,'导出失败：$1','エクスポート失敗：$1'],[/^Import failed: (.+)$/,
   '导入失败：$1','インポート失敗：$1']
 ];
 function pattern(s){if(lang==='en')return null;for(const [re,zh,ja] of PATTERNS){const m=re.exec(s);if(m)return (lang==='zh'?zh:ja).replace(/\$(\d)/g,(_,i)=>{const v=m[Number(i)]??'';
  return Object.hasOwn(EN,v)?EN[v][lang==='zh'?0:1]:v;});}return null;}
 const LANGS=[['zh','中文'],['en','English'],['ja','日本語']];
 const KEY='tomoyo-ui-language';let lang='zh';try{const v=localStorage.getItem(KEY);if(LANGS.some(([k])=>k===v))lang=v;}catch{}
 const SKIP='.sentence-text,.tomoyo-cn-output,.tomoyo-selection-body,.tomoyo-ai-result,.tomoyo-local-entry,.lookup-tooltip,textarea,[contenteditable],script,style,code,[data-no-i18n]';
 const source=new WeakMap(),shown=new WeakMap();
 const normalized=s=>s.replace(/\s+/g,' ').replace(/\.\.\./g,'…').trim().toLowerCase();
 const canonical=new Map([...Object.keys(EN),...Object.keys(ZH)].map(k=>[normalized(k),k]));
 function lookup(src){const trimmed=src.trim();if(!trimmed)return null;const speaker=/^ID (\d+)（当前保存的值）$/.exec(trimmed);if(speaker)return src.replace(trimmed,({
  zh:"ID "+speaker[1]+"（当前保存的值）",en:"ID "+speaker[1]+" (saved voice)",ja:"ID "+speaker[1]+"（保存済みの音声）"})[lang]);
  if(/^(active|learning|进行中|進行中|学习中|学習中)$/i.test(trimmed))return src.replace(trimmed,({zh:'学习中',en:'Learning',ja:'学習中'})[lang]);
  const match=canonical.get(normalized(trimmed));let key=match,suffix='';
  if(!key&&/[:：]$/.test(trimmed)){key=canonical.get(normalized(trimmed.slice(0,-1)));suffix=lang==='en'?':':'：';}
  let out=null;
  if(key&&Object.hasOwn(EN,key))out=(lang==='en'?key:EN[key][lang==='zh'?0:1])+suffix;
  else if(key&&Object.hasOwn(ZH,key))out=(lang==='zh'?key:ZH[key][lang==='en'?0:1])+suffix;
  else out=pattern(trimmed);
  return out===null?null:src.replace(trimmed,out);
 }

 function textNode(n){
  const p=n.parentElement;if(!p||p.closest(SKIP))return;
  const cur=n.nodeValue;let src=source.get(n);
  if(src===undefined||cur!==shown.get(n)){src=cur;source.set(n,src);}  // app changed the text: new source
  const out=lookup(src);const next=out===null?src:out;if(next!==cur)n.nodeValue=next;shown.set(n,next);
 }
 const ATTRS=['placeholder','title','aria-label','label','data-placeholder'];
 // Editable boxes keep their content untouched, but their empty-state hint (data-placeholder) is still UI text.
 function attrs(el){const skipped=!!el.closest(SKIP);for(const a of ATTRS){if(skipped&&a!=='data-placeholder'&&!(el.matches('input,textarea')&&a==='placeholder'))continue;
  if(!el.hasAttribute(a))continue;const k='data-i18n-'+a,cur=el.getAttribute(a);let src=el.getAttribute(k);if(src===null||cur!==el.__i18nShown?.[a]){src=cur;el.setAttribute(k,
  src);}const out=lookup(src);const next=out===null?src:out;if(next!==cur)el.setAttribute(a,next);(el.__i18nShown||(el.__i18nShown={}))[a]=next;}}
 function walk(root){if(!root)return;if(root.nodeType===3){textNode(root);return;}if(root.nodeType!==1)return;if(root.matches?.(SKIP)){if(root.hasAttribute?.('data-placeholder'))attrs(root);
  return;}attrs(root);for(const e of root.querySelectorAll?.('[data-placeholder]')||[])attrs(e);const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,
  {acceptNode:n=>n.nodeType===1&&n.matches(SKIP)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});let n;while((n=w.nextNode()))n.nodeType===3?textNode(n):attrs(n);
  }
 let busy=false;const observer=new MutationObserver(list=>{if(busy)return;busy=true;try{for(const m of list){if(m.type==='characterData')textNode(m.target);else if(m.type==='attributes')attrs(m.target);
  else for(const n of m.addedNodes)walk(n);}placePicker();}finally{busy=false;}});
 function start(){walk(document.body);observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});document.documentElement.lang=lang==='zh'?'zh-CN':lang;
  placePicker();}
 function setLang(v){if(!LANGS.some(([k])=>k===v))return;lang=v;try{localStorage.setItem(KEY,v);}catch{}document.documentElement.lang=v==='zh'?'zh-CN':v;busy=true;
  try{walk(document.body);}finally{busy=false;}for(const b of document.querySelectorAll('.tome-pick'))syncPick(b);for(const l of document.querySelectorAll('[data-tome-lang-label]'))l.textContent=LABEL[v];
  dispatchEvent(new Event('tome-language-change'));}
 const LABEL={zh:'界面语言',en:'Language',ja:'表示言語'};
 // Custom dropdown that matches Tomoyo's own select (the native one renders a grey system list).
 function picker(){
  const box=document.createElement('div');box.className='tome-pick';box.dataset.tomeLang='1';box.dataset.noI18n='';
  const btn=document.createElement('button');btn.type='button';btn.className='tome-pick-btn';btn.setAttribute('aria-haspopup','listbox');btn.setAttribute('aria-expanded',
   'false');
  const cur=document.createElement('span');const chev=document.createElementNS('http://www.w3.org/2000/svg','svg');chev.setAttribute('viewBox','0 0 24 24');chev.innerHTML='<path d="m6 9 6 6 6-6"/>';
   btn.append(cur,chev);
  const list=document.createElement('ul');list.className='tome-pick-list';list.setAttribute('role','listbox');list.hidden=true;
  for(const [k,t] of LANGS){const li=document.createElement('li');li.setAttribute('role','option');li.dataset.value=k;li.tabIndex=-1;li.innerHTML='<span></span><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>';
   li.firstChild.textContent=t;li.onclick=()=>{close();setLang(k);btn.focus();};li.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();li.click();
   }else if(e.key==='ArrowDown'){e.preventDefault();(li.nextElementSibling||list.firstElementChild).focus();}else if(e.key==='ArrowUp'){e.preventDefault();(li.previousElementSibling||list.lastElementChild).focus();
   }else if(e.key==='Escape'){close();btn.focus();}};list.append(li);}
  const outside=e=>{if(!box.contains(e.target))close();};
  function open(){list.hidden=false;btn.setAttribute('aria-expanded','true');box.classList.add('open');document.addEventListener('pointerdown',outside,true);(list.querySelector('[aria-selected=true]')||list.firstElementChild).focus();
   }
  function close(){list.hidden=true;btn.setAttribute('aria-expanded','false');box.classList.remove('open');document.removeEventListener('pointerdown',outside,true);
   }
  btn.onclick=()=>list.hidden?open():close();btn.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();open();}};
  box.append(btn,list);syncPick(box);return box;
 }
 function syncPick(box){const t=(LANGS.find(([k])=>k===lang)||LANGS[0])[1];box.querySelector('.tome-pick-btn span').textContent=t;for(const li of box.querySelectorAll('li'))li.setAttribute('aria-selected',
  String(li.dataset.value===lang));}
 // Tomoyo Settings > General: add a row above "Theme"; MeguLit menu > 外观: add a row at the top.
 function findText(src){const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode()))if((source.get(n)??n.nodeValue).trim()===src)return n;
  return null;}
 function placePicker(){
  if(!document.querySelector('.tome-lang-row')){const theme=findText('Theme'),user=findText('Username');
   if(theme&&user){let a=theme.parentElement;while(a&&!a.contains(user))a=a.parentElement;if(a){let row=theme.parentElement;while(row.parentElement!==a)row=row.parentElement;
    const mine=document.createElement(row.tagName);mine.className=row.className+' tome-lang-row';mine.dataset.noI18n='';const label=document.createElement('span');
     label.dataset.tomeLangLabel='';label.textContent=LABEL[lang];const first=row.firstElementChild;if(first)label.className=first.className;mine.append(label,picker());
     a.insertBefore(mine,row);}}}
  // Alt+T: the language picker lives on the About page (user, 2026-11-02), not among the appearance settings.
  const misc=document.querySelector('.tomoyo-cn-dialog [data-menu-category=about]')||document.querySelector('.tomoyo-cn-dialog [data-menu-category=misc]');
  for(const old of document.querySelectorAll('.tomoyo-cn-dialog .tome-lang-misc'))if(misc&&!misc.contains(old))old.remove();
  if(misc&&!misc.querySelector('.tome-lang-misc')){const box=document.createElement('label');box.className='tome-lang-misc';box.dataset.noI18n='';const t=document.createElement('span');
   t.dataset.tomeLangLabel='';t.textContent=LABEL[lang];box.append(t,picker());misc.prepend(box);}
 }
 const style=document.createElement('style');style.textContent=`
 .logo:has(> img[src="/tomoyo_full.png"]){display:none!important}
 /* No spin arrows on number fields anywhere; just type the number. */
 input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none!important;margin:0}
 input[type=number]{-moz-appearance:textfield;appearance:textfield}
 .tome-speaker-pick{display:flex;gap:8px;align-items:center;margin-top:8px}
 .tome-speaker-select{flex:1;min-width:0;margin:0!important}
 .tome-speaker-pick:has(.tome-speaker-select[hidden]){margin-top:0}
 .tome-speaker-try{flex:none;margin:0!important;padding:8px 14px!important;border-radius:8px!important;white-space:nowrap;font-weight:600}
 .tome-speaker-hint{display:block;margin:-6px 0 10px;font-size:12px;line-height:1.6;color:var(--theme-textSecondary,#999)}
 /* Statistics page: let numbers and labels adapt to the window instead of being cut with "…". */
 .stat-grid.svelte-d07ngg{grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))!important}
 .stat-value.svelte-d07ngg{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere;font-size:clamp(1.05rem,1.7vw,1.5rem)!important}
 .stat-label.svelte-d07ngg,.profile-stat.svelte-d07ngg .meta-label,.profile-stat.svelte-d07ngg .meta-value{white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
 .center-value.svelte-1w3qdrw{overflow:visible!important;text-overflow:clip!important;font-size:clamp(1rem,1.6vw,1.45rem)!important}
 .cover-title.svelte-d07ngg,.mb-title.svelte-d07ngg{white-space:normal!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
 .tome-lang-row{display:flex;align-items:center;justify-content:space-between}
 .tome-pick{position:relative;min-width:160px}
 .tome-pick-btn{all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:9px 12px 9px 14px;border-radius:10px;border:1px solid var(--theme-border,#3a3a40);background:var(--theme-surface,#16161a);color:var(--theme-text,#eee);font-size:14px;font-weight:600;cursor:pointer;transition:border-color .15s}
 .tome-pick-btn:hover,.tome-pick.open .tome-pick-btn{border-color:color-mix(in srgb,var(--theme-text,#eee) 30%,transparent)}
 .tome-pick-btn:focus-visible{outline:2px solid var(--theme-primary,#e0495a);outline-offset:2px}
 .tome-pick-btn svg{width:14px;height:14px;fill:none;stroke:var(--theme-textSecondary,#aaa);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;transition:transform .15s}
 .tome-pick.open .tome-pick-btn svg{transform:rotate(180deg)}
 .tome-pick-list{position:absolute;top:calc(100% + 6px);right:0;left:0;z-index:2000;margin:0;padding:5px;list-style:none;border-radius:12px;border:1px solid var(--theme-border,#3a3a40);background:var(--theme-surface,#16161a);box-shadow:0 14px 34px rgba(0,0,0,.45)}
 .tome-pick-list li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:8px;font-size:14px;color:var(--theme-text,#eee);cursor:pointer;outline:none;white-space:nowrap}
 .tome-pick-list li:hover,.tome-pick-list li:focus{background:color-mix(in srgb,var(--theme-text,#eee) 8%,transparent)}
 .tome-pick-list li[aria-selected=true]{background:color-mix(in srgb,var(--theme-primary,#e0495a) 16%,transparent);color:var(--theme-primary,#e0495a);font-weight:700}
 .tome-pick-list li svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;visibility:hidden}
 .tome-pick-list li[aria-selected=true] svg{visibility:visible}
 .tome-lang-misc{display:flex!important;align-items:center;justify-content:space-between;gap:12px;margin:4px 0 14px!important}`;
 (document.head||document.documentElement).appendChild(style);
 // Original (untranslated) text of an element, so other scripts can find UI by its source wording.
 const srcText=el=>{let t='';const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode()))t+=source.get(n)??n.nodeValue;return t.trim();
  };
 window.__tomeI18n={set:setLang,get:()=>lang,src:srcText,EN,ZH};
 if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
})();
