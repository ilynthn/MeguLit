# MeguLit-Adapter：craft 静态分析阶段

适配器在开游戏之前，先用 [Craft Anything](https://github.com/storytold/craft-anything)（纯 Rust 的逆向分析引擎，MIT OR Apache-2.0）读一遍游戏的主程序和目录，得出引擎、画字 API 和隐藏建议。它只读文件，不启动游戏，也不往游戏目录写东西。代码在 `tools/megulit-adapter/craft.cjs`，测试在 `validation/megulit-adapter-craft.test.cjs`。

## 准备

- 从官方 Release 下载 Windows x64 便携版，核对 `SHA256SUMS.txt` 后解压到仓库外面
- 环境变量 `MEGULIT_CRAFT_CLI` 设为其中 `craft-anything-cli.exe` 的完整路径
- 没设这个变量时，适配器跳过这一步，其他步骤照常

## 用法

```bash
node tools/megulit-adapter.cjs craft "<游戏目录>" [--exe <相对路径>] [--out <目录>]   # 只跑静态分析
node tools/megulit-adapter.cjs "<游戏目录>" ...                                       # 正常适配也会先跑；--no-craft 跳过
```

输出 `<out>/craft/report.json` 和 `report.md`。结论也写进 `adapter.json` 的 `craft` 和计划备注（review.html、PR 正文都看得到）。

## 用到的四个工具

都在 Deep 模式下运行。Clean room 模式拒绝读取程序内部，会报 `feature_missing`。

| 工具 | 看什么 |
|---|---|
| `app-folder-explain` | 目录的运行时：Unity / Unreal / Godot（带版本），以及 .NET 或原生程序 |
| `core-target-triage` | 主程序的格式、位数、编译器 |
| `native-library-calls-list` | 导入表：GetGlyphOutline、TextOut / DrawText、DirectWrite、D3D9 / D3D11、OpenGL |
| `native-strings-find` | 程序里引擎自己的字样（YU-RIS Script Engine、CatScene、NeXAS、Artemis Engine 等）、打开的剧本文件名、存档路径、厂商署名、FreeType |

## 适配器怎么用这些结论

- **引擎**：引擎字样按 `craft.cjs` 的 MARKERS 对应到规则表（`engines.cjs` RULES）。registry 和 LunaHook 都认不出、而 craft 看到同一引擎的字样不少于两处时，采用它的结论。之后照常走剧本探针、计划、实机验证和人工确认。只有一处字样时不采用，只把名字写进「引擎」问题。和 registry 认的不一致时，在计划里记一条「先核对」
- **隐藏**：规则表有引擎级隐藏时用引擎级。没有时按导入表判断，优先级如下：
  1. 程序带 FreeType：通用 GDI / GPU 字形层多半抓不到，要做引擎级隐藏或改用读模式
  2. 有 GetGlyphOutline：用通用 GDI 字形层
  3. 只有 TextOut / DrawText：通用层能不能藏住存疑，要看实机截图
  4. 只有 D3D 或 DirectWrite：用 GPU 字形层
- **Unity**：区分 Mono 和 IL2CPP（决定用 Mono 文本插件还是 Il2cppDraw），并列出随游戏附带的 Utage、Naninovel、TextMeshPro
- **厂商自制引擎**：认不出引擎时列出程序里的署名（排除 zlib、libjpeg 等库的版权行），供查资料用

## 对照结果（2026-11-28，craft-anything 0.6.1）

前五部已经适配过。「盲判」是假设规则表里没有这个引擎时，craft 单独给出的结论：

| 游戏 | 规则表 | craft 认出的引擎（字样数） | 画字 API | 盲判隐藏 | 实际经验 |
|---|---|---|---|---|---|
| ISLAND | catsystem2 | catsystem2（7） | GetGlyphOutlineA、D3D9；带 FreeType | 要引擎级 | 用了精确版本的引擎级隐藏（ToMeIslandDraw） |
| OZMAFIA!! | yuris | yuris（29） | TextOutA、D3D9 | TextOut 存疑 | 通用层不够，用了 YU-RIS2 TextOutA 专用隐藏 |
| アイキス3 sexy | nexas | nexas（9） | GetGlyphOutlineA、TextOutA | GDI 字形层 | 通用字形隐藏加 nexas 引擎层的键 |
| ハミダシクリエイティブ | artemis | artemis（2） | GetGlyphOutlineA/W、D3D9；带 FreeType | 要引擎级 | 通用 GDI / GPU 层 0 命中，改了 Artemis2 钩子 |
| 制服カノジョ3 | unity | unity 6000.0.59f2 | — | — | Mono，带 Utage 和 TextMeshPro |
| たいせつなきみのために… | 认不出 | 没认出；署名「Copyright (C) 2011 Dandelion Ver1.0」 | TextOutA | TextOut 存疑 | 还没适配 |

- 五部已适配游戏的引擎全部和规则表一致，每部约 0.5 到 2.5 秒
- 前四部的盲判隐藏和当时实机排查得出的结论一致。其中 ハミダシ 当时查了几轮才发现是 FreeType，craft 在开游戏前就能提示
- 第一版的 System4 字样规则把 Dandelion 自带的 `system4.lib` 误认成 System4，已收紧，并加了回归测试

## 局限

- 只看文件和字符串：判断的是「程序里有这些东西」，不能证明游戏运行时用了它们。`app-folder-explain` 曾因 アイキス3 目录里有一个 TwitterUploader.exe 判成 .NET，所以只采用它对游戏引擎的判断
- 不读剧本、不解封包。galgame 的剧本格式、加密和配对仍由 `services/original-engines/` 的读取器负责，craft 0.6.1 的游戏工具只覆盖 Unity、Unreal 和 Godot
- 选项、存档和隐藏是否真的生效，仍要实机验证（测试员）来确认
