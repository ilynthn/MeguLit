# SiglusEngine

> 这页回答：Siglus 游戏怎么认、怎么读原文和画字、隐藏现状和坑

## 识别

`scene.pck`、`siglusengine*.exe`，或 `scene*.pck` 且魔数不是 GDPC（`services/original-engines/registry.cjs`）；`gameexe.dat`（`services/engine-fingerprint.cjs`）

## 读原文

- 离线：`siglus`（Steam `.dbs` 多语言表）、`siglus-pck`（编译场景，以及 OS 段里的 .ss 源码）。第二层密钥 exe_el 依次从 暗号.dat、exe 解密循环、已知明文求解取（`services/original-engines/siglus-pck.cjs`、`siglus-key.cjs`、`siglus-source.cjs`）
- 运行时：`native/megulithook/Siglus.cpp`（LunaHook 内嵌）

## 画字钩子

`SiglusDraw.h` / `SiglusDrawSig.h` 钩 `std::vector<moji>::push_back` 和 `msg::clear`，可选钩 `msg::frame` 取原点；按调用点的尾部字节分出 print / ruby / name / msgsel / selbtn（`docs/engine-draw-native.md`）。JS 参考实现 `tools/engine-sigs/siglus-draw.cjs`

`GetGlyphOutline` 只是字形缓存，不是画字点

## 藏原文

现有路径是写回 role=1 的流，让游戏自己画（`docs/engine-draw-matrix.md`）。状态：静态完成、待实机，仅诊断

## 已知坑

- CLANNAD HD 写 role=3 的 VM 通用串会崩，所以只写 role 1（`native/EmbedTextPolicy.cs`）
- 选项项没有 `msg::frame` 原点
- 控制文件必须先写同级文件再原子替换，否则 error 32（`docs/engine-siglus-verification.md`）
- `native/siglus/` 是旧的独立构建，已不再用

## 代表游戏

`The Seed/siglus/`：clannad、summer-pockets（都是 skeleton）

## 相关代码 / 相关文档

- 代码：`native/megulithook/Siglus.cpp`、`SiglusDraw.h`、`SiglusDrawSig.h`、`services/original-engines/siglus-*.cjs`、`core/siglus-dbs-name-repair.cjs`、`tools/engine-sigs/siglus-{draw,live-evidence,sample-audit}.cjs`
- 文档：`docs/engine-siglus-verification.md`、`docs/third-party-siglus-verification.md`、`docs/engine-draw-native.md`
