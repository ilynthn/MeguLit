# MeguLit 知识库

> 这页回答：新会话（人或 agent）开工前该先知道什么、要查的东西在哪一页

## 30 秒速读

- **MeguLit 是什么**：Windows 上的 galgame 日语阅读器。钩子直接从游戏里读原文（不 OCR），把原文、注音、译文画进游戏或浮在上面；点词查词、朗读、做 Anki 卡
- **技术栈**：Tauri 2 + WebView2 桌面壳（`desktop/`，不是 Electron）→ Node 服务进程（`services/` + `core/`）→ 原生钩子（`native/`，LunaHook 改版 MeguLitHook + C# HookBridge）→ Cloudflare relay（`relay/`）。前端纯 JS/CSS 无框架
- **核心规矩**：修一个游戏只改它在 `The Seed/` 里的差分；差分表达不了才补引擎层；绝不为单部游戏改内核（[layers.md](layers.md)）
- **读模式**只由用户手动开关，任何自动判断都只给提示
- **协作**：开工先读仓库根 `HANDOFF.md` 并登记；代码走分支 → PR → CI → squash 合并；HANDOFF.md 可以直推 main；撞车 RRFZ 优先；不准 `git stash`；提交不加 co-author；JS 不写 `//` 单行注释（[workflow.md](workflow.md)）
- **测试**：只跑相关的 `.\Build.ps1 -TestsChanged` 或 `node --test validation/<x>.test.cjs`；不随便开游戏 / 主程序（[build-test-ci.md](build-test-ci.md)）
- **不确定的写「待核实」或「猜测」**，有日志就按原理修

## 目录

| 页 | 回答什么 |
|---|---|
| [architecture.md](architecture.md) | 由哪几块组成、目录对应、一句台词从游戏到阅读层的路径 |
| [layers.md](layers.md) | 四层适配规矩、差分层叠顺序、The Seed 格式和 status、读模式规矩、签名下发 |
| [engines/README.md](engines/README.md) | 引擎图鉴总表：识别、读法、画字钩子、隐藏、经验笔记索引 |
| ├ [kirikiri.md](engines/kirikiri.md) · [siglus.md](engines/siglus.md) · [bgi.md](engines/bgi.md) · [yuris.md](engines/yuris.md) · [artemis.md](engines/artemis.md) · [renpy.md](engines/renpy.md) | 各引擎一页 |
| ├ [rpgmaker.md](engines/rpgmaker.md) · [mages.md](engines/mages.md) · [catsystem2.md](engines/catsystem2.md) · [unity.md](engines/unity.md) · [tyrano.md](engines/tyrano.md) · [nitroplus.md](engines/nitroplus.md) | |
| └ [others.md](engines/others.md) | Majiro、Circus、Softpal、AdvHD、CMVS、FVP、Musica、minori、Leaf、ダンガンロンパ、IGA、NScripter、QLIE、RealLive、System4、rUGP、LiveMaker、ExHIBIT 和小引擎 |
| [tools.md](tools.md) | adapt-auto、冷测试 / ColdDesk、Cardinal、diff-maker / seed-all、sign-profile、探针、其他工具 |
| [build-test-ci.md](build-test-ci.md) | Build.ps1、测试、Release.ps1、CI job、已知偶发失败 |
| [relay.md](relay.md) | Cloudflare Worker：绑定、文件职责、部署 |
| [reading.md](reading.md) | 读音 / 注音：优先级、分词流水线、三处统一 |
| [translation.md](translation.md) | 翻译链：来源优先级、备选顺序、上下文 API、一句一份 |
| [lookup.md](lookup.md) | 查词：本地 JMdict、MOJi、Jisho、短语、同音词 |
| [lookup-popup.md](lookup-popup.md) | 点读卡交互：点击 / 滚轮 / 快捷键不推进游戏 |
| [reader-layout.md](reader-layout.md) | 阅读层排版：摆位、已读未读、换行、热键、源头不画 |
| [workflow.md](workflow.md) | 协作流程：HANDOFF、PR、Yui审查、经验记录 |
| [issues.md](issues.md) | issue 体系：四个汇总 issue、QQ 精华汇总、回复规矩 |
| [glossary.md](glossary.md) | 术语表 |

## 维护这套知识库

- 每页开头一句「这页回答什么」，结尾「相关代码 / 相关文档」；只写核对过代码或文件的事实
- 原始笔记（`docs/*.md`、`side-session-notes/*.md`）保留不动，这里只写结论和链接
- 修完一个问题：经验写进 `side-session-notes/ENGINE-ADAPTATION-NOTES-<主题>.md`，结论补进这里对应的页
- 写「未合入 main」的内容在合并后要回来改掉这个标注
- 不写 QQ 号、群号、token、密钥、本机私有路径、用户个人信息；本机环境（目录布局、自动化、测试台）在维护者的私有知识库里

## 相关代码 / 相关文档

- 仓库根：`AGENTS.md`、`HANDOFF.md`、`README.md`、`PRODUCT.md`、`The Seed/README.md`
- 原始文档：`docs/`、`side-session-notes/`
