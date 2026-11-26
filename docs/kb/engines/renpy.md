# Ren'Py

> 这页回答：Ren'Py 游戏怎么认、注入怎么读字、ruby / 隐藏 / 内嵌怎么做、只验证到哪个版本

## 识别

`renpy` 目录，或 `game\*.rp[ay]c?`（`services/original-engines/registry.cjs`）；魔数 `RPA-3.0`、`RPA-2.0`（`services/engine-fingerprint.cjs`）

## 读原文

- 离线：`.rpy`；无源码时 `renpy-rpyc.cjs` 读 `.rpyc` / `.rpa`，用自写 pickle VM 解码，**不执行任何代码**。`renpy-rpc2`、`renpy-pickle-bounded`、`renpy-compiled-root/groups`、`renpy-node-state`、`renpy-track` 这些模块文件在，但未全部注册（`docs/re-renpy-*.md`）
- 运行时（内）：`native/renpytext`（MeguLitRenpy32/64.dll）找到游戏的 libpython，每 2 秒拿 GIL 跑 `native/MeguLitRenpy.py`，包 `display_say` / `render_screen`，从 Layout 读字形

## 原生 ruby（`side-session-notes/ENGINE-ADAPTATION-NOTES-renpy.md`）

- 按 `paragraph_glyphs` 的字形身份匹配，只支持 8.4.0.25071206
- TOP / ALT 来自 ruby 枚举，不从 ascent 猜
- 未知版本、RTL、竖排不产出 ruby
- 说话人变旁白时清名字；空标签菜单项排除
- producer 自检不能代替 consumer 的回归测试

## 隐藏 / 内嵌

隐藏：把该 Text 的 Render alpha 置 0。内嵌：`Text.set_text` 加 `{rb}{rt}` 和第二段 `{size=-N}`，内嵌时不隐藏（`docs/engine-draw-protocol.md`）

## 已知坑

- 只在自写的 8.4 样本上测过，不代表真实商业作品
- 隐藏桌面上 front=Foreign 挡住了屏上显示
- 共享 parser 要先合并（`side-session-notes/RenPy-ruby-result-9b23220c.md`）

## 代表游戏

`The Seed/renpy/`：flowers-blooming-at-the-end-of-summer（skeleton）

## 相关代码 / 相关文档

- 代码：`native/renpytext/`、`native/MeguLitRenpy.py`、`native/CardinalDialogue.rpy`、`services/original-engines/renpy-*.cjs`
- 测试：`validation/renpy-track.test.cjs`
- 文档：`docs/re-renpy-live.md`、`docs/re-renpy-rpc2.md`、`docs/re-renpy-bounded-pickle.md`、`docs/re-renpy-compiled-root.md`、`docs/re-renpy-compiled-groups.md`、`docs/re-renpy-node-state.md`、`docs/re-renpy-explicit-track.md`、`docs/kag-renpy-ruby-integration.md`
