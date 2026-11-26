# MAGES.（科学 ADV 系列）

> 这页回答：MAGES 游戏怎么认、页数组画字钩子和版本层地址表、隐藏现状

## 识别

`.mpk` 或 `languagebarrier\`（`services/original-engines/registry.cjs`）；魔数 `MPK\0`。注意 Stuff Script（Propeller）也是 `.mpk` 内含 `.msc`，判定排在 MAGES 之前

## 读原文

- 离线：`script.mpk` 里的 SC3，按 exe 选 charset（`services/original-engines/mages-charset-*.txt`、`mages.cjs`）
- 运行时：`native/megulithook/MagesEngine.cpp`（SC3 串钩子）；STEINS;GATE 有按 PE 时间戳精确匹配的 `MeguLitSg.cpp`

## 画字钩子

`MagesDraw.h` / `MagesDrawSig.h` 钩 drawDialogue、drawGlyph、commit、clear；页数组里 Sel 是第 7 页、SysSel 是第 5+w 页。**地址表放在版本层 `draw.engineTable`**，内核由 `core/mages-draw.cjs`（MagesLive）接收；HookBridge 报 `hookEngineDraw engine=mages`（`core/hook-native.cjs`）。The Seed 里 mages 的 5 个版本层文件都带 engineTable

## 藏原文

GPU 层（第 4 层）在 STEINS;GATE 0 和 CHAOS;CHILD 上实测可用（`docs/hide-layers.md`）

## 已知坑

- Steam 版 exe 带 SteamStub 3.1：静态分析用 `tools/engine-sigs/steamstub.cjs` 在内存里解开
- MAGES64 没有样本
- 私有副本直接启动报 Steam 错误
- CHAOS;CHILD 一句被拆成两句：推断是串钩子在等待处分段送出（`docs/re-mages-verification.md`）

## 代表游戏

`The Seed/mages/`：chaos-child（verified）、steins-gate（read）、steins-gate-0、linear-bounded-phenogram、my-darlings-embrace

## 相关代码 / 相关文档

- 代码：`native/megulithook/MagesEngine.cpp`、`MeguLitSg.cpp`、`MagesDraw.h`、`MagesDrawSig.h`、`core/mages-draw.cjs`、`core/mages-font.cjs`、`native/mages/`、`tools/engine-sigs/{mages-draw,mages-sample,verify-mages-samples,steamstub}.cjs`
- 文档：`docs/re-mages-verification.md`、`docs/third-party-mages-verification.md`、`docs/engine-draw-native.md`
