# HANDOFF：谁在做什么

多人（RRFZ、魚魚棟的 Claude 会话、其他 agent）同时在修 MeguLit，为了不撞车、不重复修，所有人共用这一份登记表。

## 规矩
1. **开工前先看这里**：要做的问题在下表里已经有人认领、状态不是「完成」，就别做，换一条
2. **开工就登记**：在「进行中」表里加一行，写清谁、做什么、对应 issue、分支，再开始写代码
3. **做完就挪走**：合并（或放弃）的当天，把这一行从「进行中」删掉，在 `HANDOFF-done.md` 最上面加一行：`- 日期 · 谁 · 做什么 · issue · PR`（放弃写「放弃」和原因）。HANDOFF 只留正在做的
4. agent 也照做：每个任务开始前读这份文件，开工时自己往里写一行，结束时更新
5. 一条只认领一次；认领超过 3 天没动静的，可以在群里问一声再接手
6. **代码不要直接 push 进 main**（包括 RRFZ、魚魚棟的 Claude 会话、其他 agent）：推自己的分支 → 开 PR → CI 通过、确认没问题 → **squash 合并**
7. **HANDOFF.md 例外，可以直接 push 进 main**：认领、改状态、写「修了啥」都直接改直接推，第一时间让大家看到，不用等 PR。只改这一个文件，别夹带代码
8. **撞车时 RRFZ 优先**：RRFZ 已经在做的，或者他想接手的，直接在那一行把「谁」改成他、状态写一句，Claude 会话看到就停手，不争、不覆盖他的改动
9. **适配好一部游戏就登记**（所有人，包括 RRFZ、魚魚棟的 Claude 会话、其他 agent）：某部游戏的某个发行版本适配好了（验收过，seed 已合并或 PR 已开），马上在下面「已适配的游戏」表里加一行。**用 VNDB 作品号（v 开头）认游戏，用发行版本认版本**（平台 / 版本名，例如 Steam 版、DL 版、DVD 版、HD リマスター、汉化硬盘版；查得到就附 VNDB 发行号 r 开头），不用 exe 哈希去重（打补丁、免 DVD、汉化都会改 exe）。**开始适配前先查这张表**：同作品同发行版已在表里的不要再做；同作品不同发行版也别从零做，先拿已有的 seed 跑，游戏层一般能直接用，只补版本层
10. **所有游戏适配都走 MeguLit-Adapter**（`node tools/megulit-adapter.cjs <游戏目录>`）：不再写一次性的适配脚本。每适配一部学到的东西（新的引擎特征、隐藏方式、版本指纹、踩的坑）都写回适配器的引擎层或规则表（`tools/megulit-adapter/engines.cjs`、`plan.cjs`、`checkpoints.cjs`，剧本格式写回 `services/original-engines/`），这部游戏自己的设置只进 The Seed
11. **状态栏只写一句话**：在做 / 等 CI / 等合并 / 暂停：原因。过程、根因、实测细节写进 PR 正文（AGENTS.md 本来就要求「问题 / 改动 / 验证」），不写在这里
12. **开工前查重**：先在 `HANDOFF-done.md` 和已合并的 PR（`gh pr list --state merged --search <关键词>`）里搜要做的问题或游戏；issue 已关并写了修复 PR 的，不再重做

## 已适配的游戏

按「VNDB 作品号 + 发行版」去重，不按 exe 哈希。状态：verified = 官方验收过；owner-ok = 店主确认能用；read = 能用但只能读模式、待修；进行中 = PR 已开未合并

| 游戏 | VNDB | 发行版 | 引擎 | 状态 | 谁 | PR / seed |
|---|---|---|---|---|---|
| 魚魚棟 · Claude | 适配贡献默认开启：不提示，所有版本默认开，每次更新对所有人重新开启；设置 → 游戏库可关到下次更新 | — | fix/contrib-default-on | 11-28 | 完成（PR #1356） |
| 千恋＊万花 | v19073 | 待补 | KiriKiri | verified | 魚魚棟 | kirikiri/senren-banka |
| ファタモルガーナの館 | v12402 | 待补 | KiriKiri | owner-ok | 魚魚棟 | kirikiri/fata-morgana |
| 死に逝く君、館に芽吹く憎悪 | v19233 | 汉化硬盘版 | KiriKiri | read | 魚魚棟 | kirikiri/shiniyuku-kimi |
| CHAOS;CHILD | v14018 | 待补 | MAGES | verified | 魚魚棟 | mages/chaos-child |
| STEINS;GATE | v2002 | 待补 | MAGES | read | 魚魚棟 | mages/steins-gate |
| 素晴らしき日々～不連続存在～ | v3144 | 待补 | BGI | verified | 魚魚棟 | bgi/subahibi |
| 沙耶の唄 | v97 | Steam 版（待核实） | Nitroplus | verified | 魚魚棟 | nitroplus/saya-no-uta |
| 女装山脈 | v6589 | 待补 | YU-RIS | owner-ok | 魚魚棟 | yuris/josou-sanmyaku |
| オルフレール | v15563 | 待补 | KiriKiri | 进行中（冷测试连续 5 局通过） | 魚魚棟 · Claude | PR #1291 |
| Monochrome Empire | v26413 | 待补 | YU-RIS2 | 进行中（选项被隐藏，卡在原生 hook） | 魚魚棟 · Claude | PR #1291 |
| ハミダシクリエイティブ | v27449 | パッケージ版 | Artemis | 进行中 | 魚魚棟 · Claude | artemis/hamidashi-creative（MeguLit-Adapter） PR #1303 |
| アイキス3 sexy | v32132 | 豪華版 DVD（r84077）+ Ver.1.03 | NeXAS | 进行中（skeleton，待测试员实测：选项修了未见中文选项上屏） | 魚魚棟 · Claude | nexas/ai-kiss-3-sexy（MeguLit-Adapter） PR #1304 |
| OZMAFIA!! | v7833 | OZMAFIA!!（r15697） + 汉化外挂整包 | YU-RIS | 进行中 | 魚魚棟 · Claude | yuris/ozmafia（MeguLit-Adapter） PR #1312 |

## 进行中

| 谁 | 做什么 | issue | 分支 | 开始 | 状态 |
|---|---|---|---|---|---|
| 魚魚棟 · Claude | megulit-engine：Rust 直读引擎剧本（设计文档 + KiriKiri 原型） | — | claude/megulit-engine | 11-28 | 等 CI（PR #1365） |
| 魚魚棟 · Claude | 批量骨架 seed 生成器：一批目录离线认引擎、算 key、写 skeleton seed，出可信度清单（基于 #1362） | — | claude/seed-skeleton-batch | 11-28 | 等 CI（PR #1366） |
| 魚魚棟 · Claude | 台词按说话人上色：取游戏原色不再发灰（アイキス3 sexy アヤメ），颜色页新增「分角色」按作品改色 | — | feat/speaker-colors | 11-28 | 等合并（PR #1359，CI 全绿） |
| 魚魚棟 · Claude | 注音字体默认 Noto Sans JP，随 MeguLit 自带、优先用自带文件；下拉框标「自带」；旧默认 Meiryo 的老用户迁移过去 | — | claude/bundled-noto-ruby | 11-28 | 在做 |
| 魚魚棟 · Claude | 修 main：统一提示接管 title 后 el.title 仍能读写提示（#1344 合并后校准按钮测试失败） | — | claude/fix-main-tip-title | 11-28 | 等合并（PR #1350，CI 全绿） |
| 魚魚棟 · Claude | 选项译文与选项注音可调：译文放「翻译」页，注音放「文字 → 注音设置」，按作品保存 | — | claude/altt-choice-style | 11-28 | 等合并（PR #1363，CI 全绿） |
| 魚魚棟 · Claude | 首页加 QQ 交流群入口（唤起 QQ 加群，失败复制群号），官网和 README 挂群号并同步「下个版本」更新 | — | claude/qq-group-entry | 11-28 | 等 CI（PR #1369） |
| RRFZ · Codex | CMVS/CVNS 剧本按指令分类台词，提取说话人、语音和行号 | — | rrfz/cmvs-classify | 11-27 | 在做 |
| 魚魚棟 · Claude | 点读查词支持口语缩约和方言语尾（舐めんなし、わかんねえ、ええやん）：还原后再查、最长前缀兜底、可选 AI 释义 | — | feat/colloquial-lookup | 11-28 | 等 CI（PR #1339） |
| 魚魚棟 · Claude | 官网换新图标（点读台词框）：favicon、apple-touch-icon、manifest、结构化数据 logo；启动器图标和字标不动 | — | feat/site-favicon | 11-27 | 等 CI（PR #1333） |
| 魚魚棟 · Claude | megulit.com 用户中心：网页登录看学习看板、收藏句子（点读查词）、单词本、阅读进度，PWA 离线；桌面端自动同步、「同步到网页」开关和删除云端数据 | — | feat/web-dashboard-relay · feat/web-dashboard-sync · feat/web-dashboard | 11-27 | 三个 PR 已开：服务端 #1329、桌面端 #1330（叠在 #1329 上）、网页 #1332；等 CI 和测试员，部署要等店主批准 |
| 魚魚棟 · Claude | The Seed「已种下的游戏」太乱、滚动条隐藏：游戏社默认折叠成一行（社名、部数、小封面），只展开第一个；全部展开/收起，搜索自动展开，细滚动条 | — | fix/seed-planted-collapse | 11-27 | CI 绿，待测试员实测（PR #1323） |
| 魚魚棟 · Claude | 点过按钮后按 Shift 等键冒出黄色焦点框：只在键盘导航时显示，焦点框统一重做 | — | fix/focus-ring | 11-27 | 在做 |
| 魚魚棟 · Claude | 游戏内新手引导：前 5 次进游戏分步高亮胶囊、Alt+T 菜单、个性化文本、点读、校准，可跳过；顶栏「教程」和 Alt+T 可重看，教程页配图 | — | feat/onboarding-tour | 11-27 | 等 CI，待测试员实测（PR #1324） |
| 魚魚棟 · Claude | 游戏库标题停在文件夹名（Ozmafia-ozmafia-joki）：改成显示作品名（seed/VNDB），用户改过的名字不覆盖，老数据迁移，原名留作别名 | — | fix/library-title-from-work | 11-27 | 等 CI，待测试员实测（PR #1326） |
| 魚魚棟 · Claude | 启动画面只留进度条，结尾不再变圆出小脸，改成进度条变形成半透明 MeguLit logo | — | feat/splash-logo | 11-27 | CI 全绿，待测试员实测（PR #1319） |
| 魚魚棟 · Claude | 启动画面 logo 发灰、卡顿：改实色、由暗到亮入场，绘制移到独立线程 | — | fix/splash-logo-solid | 11-28 | CI 全绿，待测试员实测（PR #1357） |
| 魚魚棟 · Claude | 首页大卡牌按住往下压时，单击/双击提示框压在卡牌上：提示框挪到卡牌下方，按住、拖动、抽卡时不出现 | — | fix/home-card-press | 11-27 | 等 CI，待测试员实测（PR #1320） |
| 魚魚棟 · Claude | 热键全部可自定义：Alt+M / Alt+T / Alt+H / Alt+L 可改组合键，也可绑鼠标侧键或中键加修饰键；冲突提示，Alt+T 菜单和设置里同一个「热键」面板，所有热键提示跟着设置变 | — | feat/custom-hotkeys | 11-27 | 在做 |
| 魚魚棟 · Claude | 关于页感谢太少：除 MeguLit 外改成片尾致谢名单，名单数据在 web/credits.json | — | feat/credits-roll | 11-27 | CI 绿，待测试员实测（PR #1321） |
| 魚魚棟 · Claude | 关于页链接行悬停时星芒比文字低、右侧值跟着右移：星芒按标签行框居中，值列不动 | — | fix/about-hover-align | 11-27 | 等合并（PR #1322，CI 绿） |
| 魚魚棟 · Claude | MeguLit-Adapter auto：新游戏下载完自动装、适配、开 PR、做测试版和卡片（不花 LLM token），计划任务 watch | — | feat/adapter-auto-pipeline | 11-27 | 等 CI（PR #1318） |
| 魚魚棟 · Claude | 传火碑门外草地重做：蓝调夜色草地和萤火，西门前扩成圆形草地，删掉水面上的椅子 | — | feat/torch-meadow-c | 11-27 | CI 全绿，待测试员实测（PR #1314） |
| 魚魚棟 · Claude | 选项实机：ファタ、千恋通过；ISLAND 选项（CatSystem2 select 记录）进不了阅读层，已修；适配器加 choice 实机步骤 | — | fix/choice-live | 11-27 | PR #1310 已开等 CI，待测试员实测（ISLAND） |
| 魚魚棟 · Claude | 适配 OZMAFIA!!（YU-RIS）、ハミダシクリエイティブ（常轨脱离Creative，Artemis）：走 MeguLit-Adapter 实机验证，每部一个 seed PR | #1107 #1133 | claude/ozmafia-joki | 11-27 | 等测试员实测：#1303（常轨脱离）和 #1312（OZMAFIA，叠在 #1303 上）CI 全绿，清单已交 |
| 魚魚棟 · Claude | 制服カノジョ3（制服女友3，Unity/TMP）：原文漏出 <space=> 等 TMP 标签且同句重复；回 log 后原文没藏干净、台词消失 | #1248 | fix/unity-tmp-space-backlog | 11-27 | 等 CI + 测试员实测（PR #1309） |
| 魚魚棟 · Claude | YU-RIS 引擎层：正文 N 倍逐字重复去重、正文线程选择 | — | engine-yuris | 11-26 | 暂停（已提交） |
| 魚魚棟 · Claude | 模拟器实验：Switch 模拟器（Eden/Ryubing）里读对话文本 + 换成等长空白隐藏原文、选项照常；样本 一部 Switch 乙游 + 海猫 Switch 版（DS 下… | — | exp/emulator-hook | 11-27 | 暂停：磁盘（E 盘剩余空间不足；adapt 下的 swit… |
| 魚魚棟 · Claude | 适配 アイキス3 sexy（NeXAS，包装版 + 1.03）：选项被字形隐藏吃掉（hide.glyphAfterLine）、钩子文本带 @ 控制码（source.stripCodes）、选项 OCR 定位（choice.ocrLoose）；写回适配器（光盘安装、GIGA 更新、testbuild、测试清单等） | #1109 | adapt/aikiss3-sexy | 11-27 | PR #1304 等 CI，待测试员实测（测试清单已交测试员） |
| 魚魚棟 · Claude | MeguLit-Adapter 加 craft 静态分析阶段（craft-anything：开游戏前核对引擎、画字 API、隐藏方式） | — | claude/amazing-aryabhata-a55dfa | 11-28 | 等 CI（PR #1362） |
| RRFZ · Codex | アオイトリ（青鸟）中央气泡原文没藏住、字幕飘到气泡外（11-25 后 main 回归，二分中） | — | rrfz/aoitori-overlay-regress | 11-27 | 二分中 |

