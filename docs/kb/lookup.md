# 查词

> 这页回答：点一个词后释义从哪来、本地 / 在线词典各在哪、短语和同音词怎么处理

## 本地查词（`core/learning-native.cjs`）

- `request()` 四个命令：`tokenize_text`、`lookup_exact`、`lookup_at_position`、`scan_sentence`
- 词典数据：JMdict（`runtime/dictionaries/jmdict.json`，英文界面用 `jmdict.english.json`，#1241）
- `entries()`（#1111）：先按写法查（含 Sudachi 规范形），只是读音相同的词条排后面并标 `match:'reading'`，同音异义词不再混成一个
- `groups()`：サ变名词合并、助动词串接、可能形识别
- 跨游戏换行的词：用词串 + 最后一个词的原形查（汗 + ばむ）；促音强调写法还原
- `core/definitions.cjs`：JMdict 每个 definitions 项算一个义项，组内去重
- `core/morphology.cjs conjugation()`：活用说明
- `core/dict-check.cjs`：按 pip RECORD 的 SHA-256 校验 SudachiDict Full 和 UniDic

## 在线 / 模型

| 来源 | 文件 | 说明 |
|---|---|---|
| MOJi | `services/moji-dictionary.cjs` | 直连官方接口，扫码登录，会话令牌 DPAPI 加密保存；`lookupMoji`、`wordDetail`、`wordAudio`、`wordComments` |
| Jisho | `services/jisho-dictionary.cjs` | 英文界面在线查词，缓存 7 天（未命中 1 天），请求间隔 1.1 秒 |
| AI 解释 | `services/reader.cjs lookupExplain` | 选词 / 整句让模型讲语法语境 |
| 相关词 | `services/dict-related.cjs` | 只用本地数据：共享汉字、同音、近义 |
| Weblio | — | 只作为 Anki 卡模板里的外链（`core/anki.cjs`），**没有 Weblio 查词实现**（QQ 精华里有人请求，见 #1110） |

`core/lookup-models.cjs`：`lookupProvider` 可选 local / follow / moji / 各模型预设（deepseek、gemini、gpt、qwen、kimi、glm）；默认 `lookupProvider` = moji、`contextProvider` = deepseek

## 短语

拖选或长按的范围交给 `lookup_exact`；没有整词条时拆开逐段分析（`selection_analysis`）；读音用 `word()` 的 phrase 分支按顺序拼；同时发 `lookupTranslate` 翻译这段（见 [translation.md](translation.md)）

## 主界面词典页

`web/dict-home.js`、`web/dictionary-format.js`；服务端 `services/bridge.cjs` 的 `case 'dictionary'`：source 可选 moji / jisho / 本地，本地表为空时回落到 `lookup_exact`

## 配置键

`dictionary` 组：`lookupProvider`、`contextProvider`、`lookupProfiles.<name>.baseUrl` / `.model`；`lookup` 组：`lookup_mode`（click / hover）、`underline_names`、`word_level_colors.*`；`speech.aivisAutoSpeak`

## 最近修过的坑

#1241 英文界面本地查词用英文 JMdict；#1217 MOJi 详情失败不缓存可重试；#1202 MOJi 音频叠播；#1201 收录词按写法匹配；#1210 纯假名词条收录回落到 readings[0]；#1233 测试启动竞态；#1192 里的 #1111 同音词不再当同一个词

## 相关代码 / 相关文档

- 代码：`core/learning-native.cjs`、`core/definitions.cjs`、`core/morphology.cjs`、`core/dict-check.cjs`、`core/lookup-models.cjs`、`services/moji-dictionary.cjs`、`services/jisho-dictionary.cjs`、`services/dict-related.cjs`、`web/reader/modules/selection.js`、`web/dict-home.js`
- 测试：`validation/{dictionary-local,dict-local-english-locale,dict-related,dict-saved-homophone-match,jisho-dictionary,moji-dict-detail,moji-detail-retry,moji-audio-playback,lookup-providers,crossline-lookup,variant-spellings}.test.cjs`
- 相关页：[lookup-popup.md](lookup-popup.md)、[reading.md](reading.md)
