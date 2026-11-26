# TyranoScript

> 这页回答：Tyrano 游戏怎么认、DOM 里怎么取字、隐藏和已知缺口

## 识别

`data\scenario` + tyrano 或 index.html；`app.asar`；`package.nw`（没有 www）；exe 尾部附 zip（`services/original-engines/registry.cjs`）

## 读原文

- 离线：`services/original-engines/tyrano.cjs` 读散文件、asar、package.nw、exe 尾部 zip
- 运行时（CDP / DOM）：`core/text-paths-web.cjs` 的 PAGE_SCRIPT 只取 `getMessageInnerLayer()` 当前层，排除 `.stroke` / `.dummy` 描边副本；`.chara_name_area` 是名字，`.glink_button` 是选项

## 藏原文

CSS 透明；内嵌时不加隐藏规则。曾有缺陷：历史菜单可见时原文仍被隐藏，已修（`docs/engine-tyrano/sweetdolls-hidden-20261122.md`）

## 已知缺口

- 图片按钮不做
- 原生 ruby 还没传给阅读层
- 引擎许可是自定义条款，不是 MIT（`docs/engine-tyrano/result.md`）

## 代表游戏

`The Seed/tyrano/`：irohanihoheto（skeleton）

## 相关代码 / 相关文档

- 代码：`core/text-paths-web.cjs`、`core/text-paths-launch.cjs`、`core/nw-runtime.cjs`、`services/original-engines/tyrano.cjs`、`services/original-engines/webbundle.cjs`
- 文档：`docs/engine-tyrano/`、`docs/engine-draw-protocol.md`
