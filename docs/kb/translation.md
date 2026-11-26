# 翻译链

> 这页回答：一句译文从哪来、备选顺序和超时规则、汉化补丁怎么当译文、上下文用哪个 API、为什么一句只出一份

## 来源优先级

1. **汉化 / 官方译文**（零延迟）：`core/hook-native.cjs scriptTranslation` 先查 `trackPairs`（游戏自带多语言轨，`core/language-tracks.cjs`），再查 `originalText.resolveJapanese` / `resolveSource`（汉化剧本对照，`services/original-text.cjs`），只接受 exact / high 匹配；长句 `piecedTranslation` 拆块对照。来源标记 script / patch / official / machine / filled
2. **缓存**：`embedCached`
3. **翻译链** `services/translation-chain.cjs`：
   - `candidates()` 顺序：本地模型 → 已绑定 key 的 API → 其他有 key 的 API → 免 key 机翻 → microsoft → google
   - 零延迟（`apiFirst`）开时 API 排在本地模型前
   - 超过预算就并行起一路机翻，先给机翻，更好的晚到答案经 `onLate` 替换
   - 余额 / key 错误的引擎暂停 10 分钟
   - 失败的句子进 `Retries` 后台补译：5 秒 / 20 秒 / 1 分钟 / 之后每 2 分钟，最多 8 次

产品要求：汉化组译文必须 100% 配对（报告总数 / 已配 / 未配及原因），配不上才按 本地模型 → 绑定的 API → 机翻 兜底，全失败才提示

## 关键模块

| 文件 | 职责 |
|---|---|
| `core/providers.cjs` | `createTranslationService`；引擎 google / gpt / deepseek / bing / deepl + `core/engines.cjs`（注意：这是**翻译引擎表**，不是游戏引擎表）；最近 9 句上下文（只有 LLM 和 deepl 用，sakura 除外，`contextLines` 1–8）；乱码不送翻；`detached` 模式用上下文但不写历史 |
| `core/translate.cjs` | 免 key 机翻（google / microsoft / google-web 轮换），429 冷却、缓存、可见句优先（#1067） |
| `services/translation-chain.cjs` | 备选链、预算、晚到回填、补译 |
| `services/reader.cjs` | `translate` → `localTranslation` → `chainTranslate`；`fillTranslation` / `compositorText` / `deliverBackfill` 推给阅读层；`lookupTranslate` 选区翻译 |
| `services/script-prefetch.cjs` | 预翻译：读位置往前 6 句后台翻好（单独的翻译服务实例） |
| `services/script-prewarm.cjs` | 后台 worker 预读剧本 |
| `core/overlay-patch.cjs` | 识别叠在日文原版上的汉化补丁（只读） |
| `core/translation-settings.cjs` / `translation-format.cjs` / `translation-scope.cjs` | 保存前校验模型和 key / 统一换行 / 判断请求是否还是当前句 |

## 规则

- **一句只留一份译文**（#1128）：后到的更好译文同时替换合成器里那份（`compositorText`）；另一来源（游戏已画过译文的那句不再叠 MeguLit 译文）在分支 `fix/display-leftovers` a712bb32，未合入 main
- **上下文解析跟随用户绑定的 API**（#1117，`core/lookup-models.cjs contextOptions`）：只有 `contextProviderPicked===true` 或来源不是默认 deepseek 才算玩家明确选过；没选过就用与翻译相同的 provider / 地址 / 模型 / key；自选来源没 key 时回落到绑定的 API
- **选区翻译不污染**（#1139）：`chainTranslate(selection, …, {quiet:true})`，不写台词缓存、不回填、不进上下文
- `zeroLatencyEnabled`：学习者语言不是 en 且 `scriptTranslation !== false`
- 学习页 `pickTranslation`：有人工译文用人工，否则机翻（`services/learning-insights.cjs`）
- 密钥加密存在本地（`core/secrets.cjs`），不进日志

## 配置键

`translation` 组：`provider`、`baseUrl`、`model`、`region`、`deeplTier`、`reviewEngine`、`learnerLanguage`、`contextEnabled`、`contextLines`、`scriptTranslation`（零延迟）、`scriptColdRun`、`enabled`；`dictionary.contextProvider`；`translation-profiles.json` 存零延迟模式下各引擎配置

## 最近修过的坑

- #1176 7c1b77f0：双重译文 #1128、上下文跟随绑定 API #1117、外置 LOG 旁白补译 #1129（缺译 > 6 条分批，每批隔 4 秒）
- #1175 6369b371：选区翻译 detached
- #1193 0c5c6dfe：刷新后重新挂翻译守卫
- #1067 399e34f8：可见台词优先翻译

## 相关代码 / 相关文档

- 代码：见上表，另 `services/original-text.cjs`、`services/patch-swap.cjs`、`services/align-sample.cjs`、`services/script-translation-quality.cjs`、`core/language-tracks.cjs`
- 测试：`validation/{single-translation-sink,context-follows-bound-api,context-provider,backlog-missing-translation,translation-chain,chain-budget,late-chain-fill,translation-priority,patch-swap,overlay-patch,language-tracks,selection-translation,zero-patch-coverage}.test.cjs`
- 文档：暂无专门讲翻译链的 docs；汉化配对的工具见 `tools/patch-pair-selftest.cjs`
