# 架构总览

> 这页回答：MeguLit 由哪几块组成、各在哪个目录、一句台词从游戏到阅读层经过哪些模块

## 一张图

```
游戏进程
  └─ 注入的钩子 DLL（MeguLitHook32/64 = LunaHook + MeguLit 改动；或引擎专用 DLL：krkrtext / renpytext / unitytext 插件）
        │ 文本流、ToMe_CHARS 画字记录
        ▼
native/HookBridge.exe（C#，走 LunaHook 的 C ABI；stdin/stdout 一行一个 JSON）
        │
        ▼
services/ 的 Node 进程（runtime/node.exe services/server.cjs）
  ├─ core/hook-native.cjs   起 HookBridge、选正文线程、去重接句、读 profile
  ├─ core/gal-native.cjs    gal 模式主控：配对译文、ruby、选项、阅读层事件
  ├─ core/overlay-placement.cjs  把字框 / 字点合成每句一条 textPlace
  └─ services/reader.cjs    阅读层服务端：翻译、查词、读音、词卡
        │ {event,data} 推送
        ▼
desktop/（Tauri 2 + WebView2，MeguLit.exe）
  ├─ main 窗口 → web/index.html（游戏库、学习、设置）
  └─ reader 窗口 → web/reader/index.html（阅读层：原文、注音、译文、点读卡、Alt+T 菜单）

native/GalWindowBridge.exe   贴游戏窗口、全局热键 Alt+T/H/M、遮盖层、截图
native/ReaderPointerGate.cs  吃掉落在阅读层上的点击 / 滚轮，不让它们推进游戏
relay/（Cloudflare Worker + D1 + R2）  The Seed 下发、探针、Cardinal 分数、issue 汇总、论坛等
The Seed/   每部游戏一份纯数据差分，随安装包和热更新发
```

## 各块是什么

| 目录 | 是什么 | 入口 |
|---|---|---|
| `desktop/` | Tauri 2（Rust）桌面壳，Windows 上用 WebView2。**不是 Electron** | `desktop/src/main.rs`；`desktop/src/broker.rs` 拉起 `runtime/node.exe services/server.cjs`，按行收发 `{id,request}` → `{id,ok,data}`，也转发 `{event,data}`，单请求超时 240 秒 |
| `services/` | Node 服务进程：业务逻辑全在这里（阅读、翻译、词典、学习、Anki、探针、冷测试、Cardinal、库、设置、更新） | `services/server.cjs` → `services/bridge.cjs dispatch`；设置键定义在 `services/settings-schema.cjs` |
| `core/` | 被 services 引用的内核模块：钩子接入、gal 模式、profile 层、读音、翻译服务、指纹、冷测试 / Cardinal 的纯逻辑 | `core/hook-native.cjs`、`core/gal-native.cjs`、`core/profiles/` |
| `web/` | 主界面（Tauri main 窗口），纯 JS/CSS 无框架 | `web/index.html` + `web/app.js` |
| `web/reader/` | 阅读层窗口（label `reader`） | `web/reader/index.html` + `bootstrap.js`，模块清单 `modules.json` / `module-list.js`，模块在 `web/reader/modules/` |
| `native/` | C# / C++ 原生件：钩子宿主、窗口桥、各引擎注入 DLL、隐藏层 | 构建清单 `native/native-builds.json`，HookBridge 用 `native/Build-HookBridge.ps1` |
| `relay/` | Cloudflare Worker `megulit-relay`（D1 `megulit-relay`、R2 `megulit-diagnostics`） | `relay/src/worker.js`，见 [relay.md](relay.md) |
| `The Seed/` | 内置游戏差分（纯数据），见 [layers.md](layers.md) | `The Seed/README.md` |
| `tools/` | 维护者工具（diff-maker、Cardinal、签名、探针工作台、测试选测） | 见 [tools.md](tools.md) |
| `validation/` | 全部自动测试（`*.test.cjs`，`node --test`）和回放夹具 | 见 [build-test-ci.md](build-test-ci.md) |
| `services/original-engines/` | 各引擎离线剧本读取器（不开游戏读原文，给汉化配对、预翻译、探针用） | `registry.cjs`（引擎识别和 reader 对应）、`kit.cjs`（共用解包工具） |

## native/ 子项目

| 子目录 / 文件 | 是什么 |
|---|---|
| `megulithook/` | MeguLitHook32/64：LunaHook 树 + MeguLit 改动；各引擎画字签名头 `*Draw.h` / `*DrawSig.h`、DrawSites、源头不画 `MeguLitDrawSkip.h` |
| `HookBridge.cs` | 钩子宿主（LunaHost64.dll / LunaHook32/64.dll 的适配器），把文本流和画字记录变成 JSON 行 |
| `GalWindowBridge.cs` | 贴窗、热键（Alt+T 菜单、Alt+H 遮盖开关、Alt+M 绑定窗口、Alt+L 外置 LOG）、ClipCursor 释放、客户区截图 |
| `ReaderPointerGate.cs` | 低级鼠标钩子：点读卡外的点击只关卡、卡上滚轮不进游戏 |
| `EmbedTextPolicy.cs` | 写回游戏内存前的守卫（不往游戏写垃圾） |
| `GpuHideLayer.cs` / `gpuhide/` | 隐藏第 4 层「假 GPU」：不发字形四边形的 draw call |
| `fontprobe/` | MeguLitFont：挂 GDI/GDI+/DWrite，找字形点、GDI 隐藏 |
| `fontdot/` | 把 FreeType 类引擎读到的字体字形换成点 |
| `krkrtext/` | KiriKiri TJS 注入（`script.inc`，KAG / TextRender 路线） |
| `renpytext/` | Ren'Py Python 注入（`native/MeguLitRenpy.py`） |
| `unitytext/` | BepInEx Mono / IL2CPP 插件、KEMCO 观察 |
| `scncapture/` | KiriKiri Z `.scn` 抓取（Hxv4 加密作品冷启动时用） |
| `runtimedump/` | 与引擎无关的解密后数据捕获 |
| `compositor/` | WGC 截图 + D2D 重画（「捕获合成器」，默认关） |
| `borderless/` | 独占全屏改窗口化 |
| `dpdecline/` | 冒名 DirectPlay DLL，拒绝加载，防旧游戏弹安装框 |
| `mages/` | STEINS;GATE SC3 串钩子 |
| `siglus/` | 旧的独立构建，已不再用 |
| `ColdDesk.cs` | 冷测试助手：隐藏桌面跑游戏、静音、Job 对象，见 [tools.md](tools.md) |
| `StartupIsland.cs` | 启动画面 |

## 一句台词的路径（隐藏模式）

1. 游戏画字 → 钩子 DLL 拿到文本流（LunaHook 引擎钩子）和 / 或画字记录 `ToMe_CHARS`（引擎画字钩子，带 `role`、`box`），协议见 `docs/engine-draw-protocol.md`
2. HookBridge 把它们转成 JSON 行；隐藏原文的确认（hide hit）也从这里报上来（`docs/hide-layers.md`）
3. `core/hook-native.cjs` 选正文线程、去重、接句；按 profile 决定隐藏方式（profile 层见 [layers.md](layers.md)）
4. `core/gal-native.cjs`：配对汉化译文（`hook-native.cjs scriptTranslation`）、记 ruby（`core/game-ruby.cjs`）、判选项（`core/choice-capture.cjs`），发事件给阅读层
5. `core/overlay-placement.cjs` 按字框把日文、注音、译文的位置合成 `textPlace`
6. 阅读层 `web/reader/modules/text-place.js` / `gal.js` 画出来；分词和读音经 `services/reader.cjs` → `core/learning-native.cjs`（见 [reading.md](reading.md)），译文经翻译链（见 [translation.md](translation.md)）
7. 用户点词 → `web/reader/modules/selection.js` 开点读卡（见 [lookup-popup.md](lookup-popup.md)）

两种显示方式（README「阅读层」节）：**内嵌**（原文、注音、译文画进游戏自己的文本框位置）和**阅读层**（浮在游戏上面）。隐藏原文与否只由用户的「隐藏游戏原文」开关决定，任何自动路径都不会切到读模式（`docs/diff-layers.md`「读模式」）

## 设计约束（PRODUCT.md）

- 游戏优先：叠加层不挡、不抢焦点、不闪
- 修复只改差分，不为单部游戏改内核（见 [layers.md](layers.md)）
- 保护存档和 Anki 进度
- 无前端框架，纯 JS/CSS；CSS 类名、存储键、原生 ABI 保持兼容
- 界面三语：简中、English、日本語

## 相关代码 / 相关文档

- 代码：`desktop/src/main.rs`、`desktop/src/broker.rs`、`services/server.cjs`、`services/bridge.cjs`、`core/hook-native.cjs`、`core/gal-native.cjs`、`core/overlay-placement.cjs`、`native/HookBridge.cs`、`native/GalWindowBridge.cs`、`native/native-builds.json`
- 文档：`PRODUCT.md`、`docs/text-architecture.md`、`docs/engine-draw-protocol.md`、`docs/hide-layers.md`、`docs/diff-layers.md`、[engines/](engines/README.md)
