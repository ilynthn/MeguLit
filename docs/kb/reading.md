# 读音 / 注音（furigana、ruby）

> 这页回答：一个词的读音从哪来、优先级怎么定、注音 / 小喇叭 / 点读三处怎么保证一致、最近修过哪些坑

## 优先级规则

**游戏 ruby > 游戏全文 > VNDB 人名 > 词典**；绝不用分词器裸读人名

实现在 `core/game-reading.cjs` 的 `readingsIn`：
1. `line`：本句游戏自己印的 ruby（`hooks.sourceRuby`）
2. `learned`：这部作品以前印过的 ruby（`core/game-ruby.cjs`，按 exe 哈希存 `game-ruby.json`，每部最多 3000 条）
3. `script`：整部剧本里**只有一种读法**的词（`services/original-text.cjs scriptRuby`）
- 同一来源内长词优先；只按整个 token 合并（島 的 ruby 不会套到 島民）；最多跨 8 个 token
- 命中后标 `readingSource:'game'`；VNDB 人名在 `withNames` 套用（`readingSource:'name'`）；数字量词 `readingSource:'number'`。后续所有步骤（`settle`、`resolve`、`contextReadings`、`contextual`、`dictionaryWords`）都跳过这三种
- 分词器猜的人名不给读音：`unknownNames` 标 `readingSource:'unknown-name'`，原猜测留在 `guess`

## 分词流水线（`core/learning-native.cjs tokenize()`）

SudachiPy 原始结果 → `strayAffixes` → `gameTokens`（游戏读音）→ `withNames`（VNDB）→ `unknownNames` → `numberTokens`（数字 + 量词）→ `dictionaryWords`（几个 token 拼成一个 JMdict 词）→ `contextReadings`（语境）→ `readings.settle` → `contextual`（私 默认 わたし）

- 分词器：`core/reading-worker.py`（Python 子进程，SudachiPy `dict='full'`；fugashi + unidic-lite 给音调 aType）；设置 `dictionary.readingEngine` = `sudachi` / `unidic`
- `tokenizeWhole` 先去掉游戏换行再分词，再把位置映射回原文
- 命中的游戏读音计入缓存键

## 语境消歧（`core/context-reading.cjs`）

- 生：后接 を / に / へ，或「の + 生 + が/は/も/と」读 せい（生に縋ろう）；点单「生をもう１つ」除外
- 人気：后接「の + ない / 無い / 少な / 絶え / 途絶え」读 ひとけ；人気がない 有歧义，不改
- 短语（#1266，最新）：何時の間にか → いつのまにか（SudachiDict 切成 何時 の 間 に か 并把 間 读 あいだ），今何時 → なんじ 等
- 一日 读 ついたち 只限紧跟在 X月 后面（`core/counter-reading.cjs`）

## 三处读音统一（#1131）

注音、小喇叭朗读、点读查询走同一份分词结果：
- `LocalLearning.word()` 也走 `tokenizeWhole`；选中正好是注音那个 token 时直接用它的读音
- 选中的是数字词的一部分时，`spoken` 读整个数字词
- `services/reader.cjs`：GameRuby 里有这个词就覆盖 `word.reading`；喇叭用 `word.spoken`

## 数据流

1. 钩子文本进来，`core/hook-native.cjs` 把本句 ruby 放进 `hooks.sourceRuby`（`core/source-ruby.cjs extractSourceRuby` 解析 `\x1d\x1c`、`<ruby><rt>`、`｜base《よみ》`、HuneX `<rよみ>漢字</r>` 等）
2. `core/gal-native.cjs` 调 `gameRuby.learn(...)`，结果作为 `hookRubyDict` 发给阅读层（`web/reader/modules/gal.js` 存进 `bridge.gameRuby`）
3. 绑定游戏时 `services/reader.cjs bindNames`（VNDB，`core/name-reading.cjs`）、`bindReadings`（`learning.useGameReadings`）；换游戏或退出时清空
4. 阅读层请求 `tokenize_text` / `lookup_*` → `learning.request(..., {names:true})`
5. 前端 `withGameRuby(text, annotations(...), bridge.gameRuby)` 再套一次游戏 ruby，`ruby-layout.js` 摆位：读音居中，挤了整行同比缩小，到最小字号再按 priority 丢

## 配置键（`services/settings-schema.cjs`）

`dictionary.readingEngine`；text 组 `furigana`、`rubyScale`、`rubyOffsetX`、`rubyOffsetY`、`rubyOutline`、`rubyOutlineWidth`、`rubyOutlineColor`、`rubyFont`

## 最近修过的坑

| PR / 提交 | 内容 |
|---|---|
| #1266 cd4662ab | 何時の間にか、今何時 等短语读音 |
| #1192 f4276f94 | 汇总 #1123 #1134 #1135 #1131 #1114 #1111：新增 `game-reading.cjs`、`context-reading.cjs`；三处统一；音调选定后不再发 kana 给 AivisSpeech；异表记下拉；`compositor-host.cjs` 按去空白字数对齐 ruby |
| #917 bc7b06cf | 注音和喇叭不一致；数字、人名读错 |
| #1186 / #1187 / #1244 | 日报送假名不进 ruby；例句超 120 条分批；片假名词缀不进例句 ruby |
| #1260 / #1272 / #1273 | 语法场景、蓝宝书例句保留游戏 ruby；learning insights 的 plainLine 去掉引擎 ruby 标记 |

## 相关代码 / 相关文档

- 代码：`core/learning-native.cjs`、`core/game-reading.cjs`、`core/game-ruby.cjs`、`core/source-ruby.cjs`、`core/context-reading.cjs`、`core/counter-reading.cjs`、`core/name-reading.cjs`、`core/reading.cjs`、`core/reading-worker.py`、`core/furigana.js`、`core/ruby-layout.js`、`web/reader/modules/furigana.js`、`web/reader/modules/ruby-layout.js`、`services/reader.cjs`、`services/original-text.cjs`
- 测试：`validation/{game-reading,context-reading,reading-consistency,name-reading,counter-reading,reading-settle,pitch-choice,variant-spellings,compositor-ruby,furigana-chinese-line}.test.cjs`
- 文档：`docs/kag-renpy-ruby-integration.md`、`docs/text-architecture.md`（验收项 b）
