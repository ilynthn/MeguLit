# BGI / Ethornell

> 这页回答：BGI 游戏怎么认、画字钩子在哪、隐藏现状和踩过的坑

## 识别

`BGI*.exe`、`sysgrp.arc`，或 `.arc` + `bgi.gdb`（`services/original-engines/registry.cjs`）；魔数 `BURIKO ARC20`、`PackFile`（`services/engine-fingerprint.cjs`）

## 读原文

- 离线：`services/original-engines/bgi.cjs`（ARC20 封包 + DSC FORMAT 1.00 压缩）
- 运行时：`native/megulithook/BGI.cpp`（LunaHook 内嵌写回和选项流）

## 画字钩子

`BgiDraw.h` / `BgiDrawSig.h` 钩排版的「字节点链」：挂链调用点 + 释放函数（素晴らしき日々 HD 是 0x43b350 / 0x43d590），节点 +0x10 / +0x14 是精灵画布坐标。输出 `ToMe_DRAWRUN engine=bgi`，带 `via=` 调用链；角色靠版本层 `draw.viaRoles`（`docs/engine-draw-native.md`）。JS 参考实现 `tools/engine-sigs/bgi-draw.cjs`

## 藏原文

写回（`docs/engine-draw-matrix.md`）；32 位 D3D9 等待标记适配器 `native/WaitRenderHook.cs` 最早在 BGI 上验证

## 已知坑

- 隐藏桌面上 Direct3D 初始化失败，进不了正文：那次运行不算证据（`docs/re-bgi-validation-20261122.md`）
- 穢翼のユースティア的 BGI.exe 是自写多层自解密壳，静态脱壳没做成，运行时扫内存里已解开的镜像
- 中文启动器带 `.enigma` 节，签名对上也不能说明运行的是哪个模块
- 已装 detour 和当前授权是两回事：撤权时清 pending 但保留原路径；缓存、字形链、精灵、可见性各有各的生命周期（`side-session-notes/ENGINE-ADAPTATION-NOTES-bgi.md`）
- 旧版 BGI（无版本资源的老 exe）`bgi-draw` 签名可能 0 命中；带光盘保护的老作品启动即崩，属于要人处理的情况

## 代表游戏

`The Seed/bgi/`：subahibi（verified）、aiyoku-no-eustia（skeleton）

## 相关代码 / 相关文档

- 代码：`native/megulithook/BGI.cpp`、`BgiDraw.h`、`BgiDrawSig.h`、`services/original-engines/bgi.cjs`、`tools/engine-sigs/bgi-draw.cjs`
- 文档：`docs/re-bgi-validation-20261122.md`、`docs/third-party-bgi-validation-20261122.md`、`side-session-notes/ENGINE-ADAPTATION-NOTES-bgi.md`
