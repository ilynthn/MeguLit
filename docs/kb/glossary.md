# 术语表

> 这页回答：MeguLit 代码、文档和群聊里那些专有叫法是什么意思、在哪能找到

| 术语 | 意思 | 在哪 |
|---|---|---|
| **The Seed** | 每部游戏一份几 KB 的纯数据差分（游戏层 + 版本层），随安装包和热更新发；用户电脑上下发缓存目录也叫 The Seed（`data/The Seed/`）。名字致敬 SAO。永远写 The Seed，不写 seeds | `The Seed/`、[layers.md](layers.md) |
| **差分**（game diff / profile） | 一份只含登记过的键的设置对象，分内核、引擎、游戏、版本若干层叠加 | `core/profiles/`、`core/game-diff.cjs` |
| **版本层 / 游戏层** | 版本层 key = exe SHA-256，放钩子地址这类跟 exe 绑定的；游戏层 key = 游戏身份，放排版、隐藏方式这类对所有版本有效的 | `core/profiles/domains.cjs` |
| **verified / owner-ok / read / skeleton** | seed 的 status：已验证 / 店主确认可用 / 可用但待修（会给读模式提示）/ 只有身份和钉住值 | `The Seed/README.md` |
| **四层** | 内核 → 引擎通用画字函数 → 游戏差分 → 上传 Seed | [layers.md](layers.md) |
| **探针**（probe） | 用户一键上传的脱敏游戏结构（剧本条目 + 瘦身 PE + 哈希，`.mlfp`），用来离线做差分 | `services/probe-full.cjs` |
| **冷测试**（cold test） | 用户电脑空闲时在隐藏桌面静音跑游戏、录样本、离线打分 | `docs/cold-test.md` |
| **ColdDesk / HidDesk** | ColdDesk 是随产品发的冷测试助手（隐藏桌面 + 静音 + Job 对象）；HidDesk 是维护者自用的隐藏桌面测试工具，ColdDesk 由它和 MuteProc 合并而来 | `native/ColdDesk.cs` |
| **Cardinal** | 把一局台词回放进隐藏阅读层打 7 项分（row、stable、clean、clear、choice、pair、leak）的裁判，名字取自 SAO | `docs/cardinal.md`、[tools.md](tools.md) |
| **磁带**（tape） | Cardinal 回放用的一局记录（jsonl） | `core/cardinal/tape.cjs` |
| **传火**（torch） | 签名差分的发布和分发；「传火碑」是展示贡献的 3D 页面 | `docs/torch-*.md`、`docs/cardinal-auto-torch.md` |
| **Yui审查** | PR 上自动出现的代码审查（P1 / P2 行内评论） | [workflow.md](workflow.md) |
| **Yui 启动诊断** | 每次启动记阶段日志，开关开着时只上报故障类型、阶段、毫秒数，relay 汇总到 #1204 | `docs/yui.md`、`desktop/src/yui.rs`、`relay/src/yui.js` |
| **阅读层**（reader） | 浮在游戏上的窗口（`web/reader/`），画原文、注音、译文、点读卡 | [reader-layout.md](reader-layout.md) |
| **内嵌**（embed） | 原文、注音、译文直接画进游戏自己的文本框位置 | `docs/engine-draw-protocol.md` |
| **读模式** | 不隐藏游戏原文，只读取；只由用户手动开关，任何自动路径都不会切过去 | `docs/diff-layers.md` |
| **点读 / 点读卡** | 点游戏里的词查读音释义的卡片 | [lookup-popup.md](lookup-popup.md) |
| **Alt+T / Alt+H / Alt+M / Alt+L** | 菜单 / 遮盖层开关 / 绑定游戏窗口 / 外置 LOG | `native/GalWindowBridge.cs` |
| **胶囊** | Alt+T 常驻入口（灵动岛 / 侧边竖条 / 角落圆点） | `web/reader/modules/capsule.js` |
| **画字记录 `ToMe_CHARS`** | 引擎画字钩子统一上报格式，带 role / id / box / sel / emb | `docs/engine-draw-protocol.md` |
| **role** | 一次画字的角色：line / name / choice / button / menu / system；只有 line 可隐藏或替换 | 同上 |
| **DrawSites** | GDI 类引擎共用的画字点框架，每个引擎只加一行签名 | `docs/engine-draw-native.md` |
| **6 件套** | 一个原生引擎画字钩子的交付物：JS 签名、原生签名头、夹具、静态测试、原生自检、运行时钩子 | 同上 |
| **hide hit / hideOnly** | 游戏侧确认隐藏命中后，这条流切成 hide-only：原文只用于读取，显示交给阅读层 | `docs/hide-layers.md` |
| **源头不画**（source no-draw / DrawSkip） | 在引擎画字函数入口把文本换成空，游戏根本不画原文；`MeguLitDrawSkip.h` 登记 | [engines/kirikiri.md](engines/kirikiri.md) |
| **no-KAG** | 不用 KAG3、自家消息系统逐字 `Layer.drawText` 的 KiriKiri 游戏 | [engines/kirikiri.md](engines/kirikiri.md) |
| **隐藏 4 层** | ①写回内嵌 ②引擎 DLL ③GDI / 字形 ④假 GPU | `docs/hide-layers.md` |
| **内 / 外 / 无** | 读法分级：引擎脚本层里拿文字和位置 / LunaHook 流 + 字形点 / 拿不到 | `docs/engine-draw-matrix.md` |
| **自检闸门**（self-check gate） | 运行时按漏句率、原文露出、复读率等打分；不过线只记诊断 + 提示 | `services/self-check-live.cjs`、`docs/self-check-observation-gate.md` |
| **本机校准 / 退档** | 这台电脑量出来的差分层 / 自检发现坏了的记录（只提示，不切读模式） | `core/auto-profile.cjs` |
| **零延迟翻译** | 用游戏自带或汉化补丁的译文，配对上就不等机翻 | [translation.md](translation.md) |
| **适配包**（adapter pack） | 签名的数据包，给离线读取器下发新密钥 / 语法参数，不用发版 | `docs/ADAPTER-PACKS.md` |
| **贡献包**（contrib） | 用户同意后上传的含真字节的样本，可做回归 | `tools/contrib-workbench.cjs` |
| **LunaHook** | 上游文本钩子框架；MeguLitHook 是它的改版 | `native/megulithook/`、`native/HookBridge.cs` |
| **GARbro** | 开源封包工具；MeguLit 复用它的方案库做按作品密钥的归档 | `services/original-engines/garbro.cjs` |
| **E 编号**（E573 等） | 维护者修复日志里的条目编号，代码注释里常见，用来追溯 | 代码注释 |
| **店主** | 项目维护者 魚魚棟（文档和注释里「店主 2026-11-21 定」= 维护者的决定） | — |
| **RRFZ** | 主要协作者，GitHub `Plastic-time`；HANDOFF 撞车时他优先 | [workflow.md](workflow.md) |
| **HANDOFF** | 仓库根的认领登记表 | `HANDOFF.md` |

## 相关代码 / 相关文档

- [README.md](README.md)、`docs/diff-layers.md`、`docs/engine-draw-protocol.md`、`docs/hide-layers.md`、`docs/cardinal.md`、`docs/cold-test.md`
