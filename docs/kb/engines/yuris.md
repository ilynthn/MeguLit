# YU-RIS

> 这页回答：YU-RIS 游戏怎么认、画字钩子样板、重复字和隐藏的坑

## 识别

`.ypf`、`pac\*.ypf`、`yscfg.dat`（`services/original-engines/registry.cjs`）；魔数 `YPF\0`（`services/engine-fingerprint.cjs`）

## 读原文

- 离线：`services/original-engines/yuris.cjs`（YPF + YSTB）；源表记录有 16 和 20 字节两种尾部布局（`docs/story-yuris-source-layouts.md`）
- 运行时：`native/megulithook/Yuris.cpp`（LunaHook 内嵌 + 选项）

## 画字钩子

`YurisDraw.h` / `YurisDrawSig.h` 是原生引擎「6 件套」的样板：钩字形 blitter 的 call，结构匹配 4 部游戏（`docs/engine-draw-native.md`「样板：YU-RIS」）。euphoria HD 0.474 另有按整文件精确匹配的 `EuphoriaHD474Draw.h`，在源头压掉台词栅格

## 藏原文

- 写回；GDI 隐藏（TextOutA 处不画 = 源头不画，不用改原生）
- GPU 层隐藏不了：女装山脈整帧在 CPU 合成后画成一个全屏四边形（`docs/hide-layers.md`）

## 重复字（分支 `engine-yuris`，未合入 main）

Monochrome Empire：正文 8 倍逐字 = 游戏每字用 TextOutA 画 8 次（描边）。HookBridge 对 YU-RIS 流自动识别倍数折叠、按句接合，抢选顺序 YU-RIS2 > YU-RIS > yuris7（不抢可写回流）；人名重复串送 hookName。实机一局确认了 `gdi hide confirmed for YU-RIS2`

## 已知坑

- サイコロジック 的封包里没有字体数据，源头打点无从下手（`docs/hide-layers.md`）
- 有的作品标题菜单点不动（直接点、悬停后点都没反应），猜测要 InputShim / DirectInput 注入（未验证）

## 代表游戏

`The Seed/yuris/`：josou-sanmyaku（owner-ok）、euphoria、erewhon、psychologic-love-comedy

## 相关代码 / 相关文档

- 代码：`native/megulithook/Yuris.cpp`、`YurisDraw.h`、`YurisDrawSig.h`、`EuphoriaHD474Draw.h`、`services/original-engines/yuris.cjs`、`tools/engine-sigs/yuris-draw.cjs`
- 文档：`docs/engine-draw-native.md`、`docs/story-yuris-source-layouts.md`、`docs/hide-layers.md`
