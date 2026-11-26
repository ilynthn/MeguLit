# Artemis

> 这页回答：Artemis 游戏怎么认、读原文和双语内嵌怎么做、观察器的坑

## 识别

`.pfs(.N)`（`services/original-engines/registry.cjs`）；魔数 `pf8`、`pf6`、`pf2`（`services/engine-fingerprint.cjs`）

## 读原文

- 离线：PFS pf6 明文、pf8 用 SHA-1 XOR，以及 .ast（`services/original-engines/scenes.cjs`）
- 运行时：LunaHook Artemis 字符串流 + 内嵌（`docs/engine-draw-matrix.md`）
- 候选 Lua 观察器：`core/artemis-observer.cjs` / `artemis-session.cjs` 包装 message.lua、ui.lua、select.lua，事件类型 `artemis-input-v1`，PF8 影子 loader 只读（`docs/artemis-lua-input.md`）。传输与安装约定核实前不注册
- 日文恢复：在最后一个 `.pfs.NNN` 里覆盖 Lua

## 内嵌双语

在 boot.lua 后追加 `core/artemis-draw.lua`，开游戏自带的 `game_sublangview`，让游戏自己画中文副语言（`docs/engine-draw-native.md`）

## 藏原文

`native/fontdot` 在源头把字形换成点（FreeType 类引擎）。THE SHELL 64 位 D3D11 在本机一直黑屏，文字无法核对（`docs/hide-layers.md`）

## 已知坑（`side-session-notes/ENGINE-ADAPTATION-NOTES-artemis.md`、`Artemis-result.md`）

- UTF-8 分类前缀不是画字签名（8 处命中）
- 正式版只有 exe：代码匹配不等于数据匹配
- `getTextBlockFloat` 只取当前语言那一行
- `select_message` 的普通层和隐藏悬停层是同一个选项，不能算两个
- 父偏移和字体尺寸不是字形矩形
- 资源用硬链接会改 ctime，导致指纹失效

## 代表游戏

`The Seed/artemis/`：amakano-3、the-shell-part-i / ii / iii（都是 skeleton）

## 相关代码 / 相关文档

- 代码：`core/artemis-observer.cjs`、`core/artemis-session.cjs`、`core/artemis-draw.lua`、`core/artemis-language.cjs`、`core/artemis-prepare.cjs`、`native/fontdot/`
- 文档：`docs/artemis-lua-input.md`、`side-session-notes/Artemis-result.md`、`side-session-notes/Artemis-owner-integration.md`、`side-session-notes/ENGINE-ADAPTATION-NOTES-artemis.md`
