# CatSystem2

> 这页回答：CS2 游戏怎么认、逐字合成钩子和 ISLAND 精确适配器、哪些是猜的

## 识别

`cs2conf.dll`，或 `.int` + `cs2*.exe`（`services/original-engines/registry.cjs`）；魔数 `KIF\0`、`CatScene`

## 读原文

- 离线：`services/original-engines/catsystem2.cjs` 读 `scene.int`（KIF 封包里的 .cst）
- 运行时：上游 `CatSystem.cpp`

## 画字钩子

- ISLAND 有精确适配器 `ToMeIslandDraw.h` / `ToMeIslandFlow.h`，能处理 ruby 和隐藏
- 所有 CS2 共用 `CS2Draw.h` / `CS2DrawSig.h`，钩逐字合成：origin 形钩点和 direct 形钩点两种；角色靠栈上对象的 MSVC RTTI 类名（`kcTaskStringPlane` 等）（`docs/engine-draw-native.md`）
- JS 参考实现 `tools/engine-sigs/cs2-draw.cjs`

## 藏原文

ISLAND 由精确适配器负责；GlyphTrace 追踪 GetGlyphOutline 字形进了哪个纹理（`docs/hide-layers.md`）

## 已知坑

- 只有 ISLAND 一部实物，类名到角色的映射是猜的
- 2019 年后的 UTF-8 新版 CS2 字码可能是 UTF-16（猜测）

## 代表游戏

`The Seed/catsystem2/`：island（skeleton）

## 相关代码 / 相关文档

- 代码：`native/megulithook/CS2Draw.h`、`CS2DrawSig.h`、`ToMeIslandDraw.h`、`ToMeIslandFlow.h`、`services/original-engines/catsystem2.cjs`、`core/island-page.js`、`core/island-source.js`
- 文档：`docs/engine-draw-native.md`、`docs/hide-layers.md`
