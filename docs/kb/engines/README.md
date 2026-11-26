# 引擎图鉴

> 这页回答：MeguLit 怎么认引擎、怎么读原文、怎么拿画字位置、怎么藏原文；每个引擎去哪一页看

## 四件事，每个引擎都要回答

| 事 | 通用做法 | 代码 |
|---|---|---|
| **识别** | 三处：库扫描按 `ENGINES` 顺序匹配目录指纹（第一个命中算数；`hook:true` 表示 LunaHook 有专用钩子，`hook:null` 走通用钩子）；适配探针按封包魔数投票（资源包半票）；钩子 DLL 内先匹配 MeguLit 精确适配器再匹配上游 LunaHook 引擎 | `services/original-engines/registry.cjs`、`services/engine-fingerprint.cjs`、`native/megulithook/enginecontrol.cpp`、`enginecollection32.cpp` |
| **读原文** | 运行时：LunaHook 文本流 / 引擎专用注入（KiriKiri TJS、Ren'Py Python、Unity BepInEx、RPG Maker / Tyrano 走 CDP、RGSS 走 Ruby 观察脚本、Artemis 走 Lua）。离线：`services/original-engines/*.cjs` 读剧本（汉化配对、预翻译、探针） | `core/hook-native.cjs`、`services/original-engines/` |
| **画字钩子** | 统一上报 `ToMe_CHARS`（`role=line|name|choice|button|menu|system`、`id`、`box`、`sel`、`emb`）。原生引擎每个都要反汇编到画字函数：交付「6 件套」= JS 签名 + 原生签名头 + 夹具 + 静态测试 + 原生自检 + 运行时钩子；样板是 YU-RIS。GDI 类引擎统一用 DrawSites，每个引擎只加一行签名 | `docs/engine-draw-protocol.md`、`docs/engine-draw-native.md`、`native/megulithook/*Draw*.h`、`tools/engine-sigs/` |
| **藏原文** | 4 层：①LunaHook 写回内嵌 ②引擎专用 DLL（krkr、renpy）③GDI / 字形层（MeguLitGdiHide、fontprobe）④假 GPU（不发字形四边形的 draw call，gpuhide）。任何一层都要等游戏侧确认命中（hit）才切 hide-only；另有「源头不画」（画字函数入口把文本换成空，`MeguLitDrawSkip.h`，未合入 main） | `docs/hide-layers.md` |

### 硬规矩

- 只有 `role=line` 可以隐藏或替换；选项、按钮、菜单永远不替换、不隐藏，只在旁边补注音和译文，点击区域不动（`docs/engine-draw-protocol.md`）
- 不往游戏里写垃圾：码页往返失败或超长的写回被拒（`native/EmbedTextPolicy.cs` GuardWrite）；没人能读的行不隐藏
- 原生画字钩子默认不挂：控制文件 `%TEMP%\MeguLit\draw\<pid>.txt` 首行必须是完整 `#cfg` 且只含精确的 `roles=1`；watcher 每 2 秒复查；撤权后跳板保留、原调用透传（`validation/engine-draw-opt-in.test.cjs`）。所有 `draw.<eng>Input` 键默认 false
- 签名要在本机样本上正好命中预期次数，在其他引擎文件里一次都不命中；`validation/engine-draw-sig-*.test.cjs` 要求 JS 和 C++ 找到同一位置
- 某一层报 unarmed 只代表这一层不隐藏，要结合其他隐藏路径再决定谁画日文（Softpal「只剩译文」事故）
- 静态完成 ≠ 能开：验收两级，一级静态 + 回放，二级实机（`docs/engine-draw-matrix.md`）

### 「内」「外」「无」三种读法（`docs/engine-draw-matrix.md`）

KiriKiri、Ren'Py、RPG Maker、Tyrano、Unity 能做到「内」（引擎脚本层里拿文字和位置）；其余原生引擎多数还是「外」（LunaHook 流 + 字形点 / GPU）

### 隐藏第 4 层（GPU）实测

可用：STEINS;GATE 0、CHAOS;CHILD、青い鳥、沙耶の唄 Steam、みにくいモジカの子。不可用（整行 tile、预渲染、CPU 合成）：FVP、WHITE ALBUM 2、eden、BRUNS、女装山脈（`docs/hide-layers.md`）

## 总表

| 引擎 | 页 | 识别要点 | 读法 | 隐藏 | The Seed |
|---|---|---|---|---|---|
| KiriKiri / KAG / 非 KAG | [kirikiri.md](kirikiri.md) | `.xp3`、`XP3\r\n` | 内（krkrtext TJS） | krkr 层 opacity 0；非 KAG 走 GDI / 源头不画 | 20 |
| SiglusEngine | [siglus.md](siglus.md) | `scene.pck`、`gameexe.dat` | 外 + 画字层 | 写回 role 1 | 2 |
| BGI / Ethornell | [bgi.md](bgi.md) | `BURIKO ARC20`、`sysgrp.arc` | 外 + 字节点链 | 写回 | 2 |
| YU-RIS | [yuris.md](yuris.md) | `.ypf`、`YPF\0` | 外 + 字形 blitter | 写回；GDI 隐藏 | 4 |
| Artemis | [artemis.md](artemis.md) | `.pfs`、`pf8` | 外（+ Lua 观察候选） | fontdot | 4 |
| Ren'Py | [renpy.md](renpy.md) | `RPA-3.0`、`.rpyc` | 内（renpytext） | Render alpha 0 | 1 |
| RPG Maker MV/MZ、XP/VX/Ace | [rpgmaker.md](rpgmaker.md) | `rpg_core.js` / `RGSSAD\0` | 内（CDP / Ruby 观察） | MV/MZ 扣字；RGSS 无 | 0 |
| MAGES. | [mages.md](mages.md) | `.mpk`、`MPK\0` | 外 + 页数组 | GPU 可用 | 5 |
| CatSystem2 | [catsystem2.md](catsystem2.md) | `cs2conf.dll`、`KIF\0` | 外 + 逐字合成 | ISLAND 精确适配 | 1 |
| Unity | [unity.md](unity.md) | `UnityPlayer.dll`、`UnityFS` | 内（BepInEx） | Mono alpha 0；IL2CPP 不隐藏 | 7 + aokana 1 |
| TyranoScript | [tyrano.md](tyrano.md) | `data\scenario`、app.asar | 内（CDP / DOM） | CSS 透明 | 1 |
| Nitroplus | [nitroplus.md](nitroplus.md) | `.npa`、`NPK2` | 外 + DrawSites | GPU 可用 | 2 + nitropak 1 |
| 其他（Majiro、Circus、Softpal、AdvHD、CMVS、FVP、Musica、minori、Leaf、ダンガンロンパ、IGA、NScripter、QLIE、RealLive、System4、rUGP、LiveMaker、ExHIBIT、BRUNS、NeXAS、Silky、Stuff、SIA、Will ARCG、GARbro 兜底） | [others.md](others.md) | — | — | — | 见该页 |

Seed 数 = `The Seed/<engine>/` 下的 slug 数（2026-11-27）

## 离线读取器家族

一个读取器 = 容器（归档索引）+ 变换（解密 / 解压）+ 文本模型 + 编码；四块共用 `services/original-engines/kit.cjs`。按文本模型分家族（`docs/engine-families.md`）：A 字符串表 / 指针表、B 操作码流 + 内联串、C 解包后明文、D 事件命令（RPG Maker）、E 按作品密钥（复用 GARbro 方案库，如 `cx-schemes.json`、`paz-schemes.json`）、F 框架型（Unity / Godot …）、G 无公开资料。新密钥用适配包 `params` 下发（`docs/ADAPTER-PACKS.md`）

## 经验笔记索引

结论已整理进各引擎页；原文保留在下列位置

| 笔记 | 主题 | 进了哪页 |
|---|---|---|
| `side-session-notes/ENGINE-ADAPTATION-NOTES-c-draw.md` | KiriKiri TextRender 画字判断 #1118 #1124 #1125 | [kirikiri.md](kirikiri.md) |
| `side-session-notes/ENGINE-ADAPTATION-NOTES-artemis.md`、`Artemis-result.md`、`Artemis-owner-integration.md` | Artemis 输入观察 | [artemis.md](artemis.md) |
| `side-session-notes/ENGINE-ADAPTATION-NOTES-bgi.md` | BGI 权限与生命周期 | [bgi.md](bgi.md) |
| `side-session-notes/ENGINE-ADAPTATION-NOTES-renpy.md`、`RenPy-ruby-result-9b23220c.md` | Ren'Py 8.4 原生 ruby | [renpy.md](renpy.md) |
| `side-session-notes/ENGINE-ADAPTATION-NOTES-CIRCUS-RUNTIME.md` | Circus DC4UP 运行时 | [others.md](others.md) |
| `side-session-notes/ENGINE-ADAPTATION-NOTES-e-settings.md` | 跨引擎设置与布局 #1137 #1144 #1145 | [../reader-layout.md](../reader-layout.md) |
| `side-session-notes/ENGINE-ADAPTATION-NOTES-reader-input.md` | 阅读层输入 #1120 #1130 #1139 | [../lookup-popup.md](../lookup-popup.md) |
| `side-session-notes/KAG-ruby-result-7ff69e9a.md`、`TextRender-roles-result-ec6a304b.md` | KAG ruby、TextRender 角色 | [kirikiri.md](kirikiri.md) |
| `side-session-notes/RGSS-*-result.md`、`RPGMaker-cdp-result-ff1063a0.md` | RGSS、RPG Maker CDP | [rpgmaker.md](rpgmaker.md) |
| `side-session-notes/re-majiro*.md`、`re-dangan-runtime.md`、`re-iga-runtime.md` | Majiro、ダンガンロンパ、IGA | [others.md](others.md) |
| `docs/re-*.md`（19 份）、`docs/third-party-*.md` | 各引擎逆向和第三方核对 | 各引擎页 |
| 分支 `reader-nodraw`：`side-session-notes/ENGINE-ADAPTATION-NOTES-krkr-nodraw.md`（未合入 main） | KiriKiri 非 KAG 源头不画 | [kirikiri.md](kirikiri.md) |

新经验写法：每修一条，在 `side-session-notes/ENGINE-ADAPTATION-NOTES-<主题>.md` 追加（证据、改了什么、有没有修好、失败的尝试也写），再把结论补进本目录对应页

## 相关代码 / 相关文档

- 代码：`services/original-engines/registry.cjs`、`services/engine-fingerprint.cjs`、`services/original-engines/kit.cjs`、`native/megulithook/`、`tools/engine-sigs/`、`core/profiles/engines/`
- 文档：`docs/engine-coverage.md`、`docs/engine-families.md`、`docs/engine-draw-protocol.md`、`docs/engine-draw-native.md`、`docs/engine-draw-matrix.md`、`docs/hide-layers.md`、`docs/ADAPTER-PACKS.md`
