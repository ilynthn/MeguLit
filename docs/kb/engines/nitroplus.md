# Nitroplus（NPA / PAK / NPK）

> 这页回答：Nitroplus 各代封包怎么认怎么读、画字点、隐藏现状

## 识别

`nss|system|cg|sound.npa`，或两个以上 .npa；`script|system.npk`（`services/original-engines/registry.cjs`）；魔数 `NPA\x01`、`NPK2`、`NPK3`

## 读原文

- 离线：`nitro-npa.cjs`（N2System）、`nitro-pak.cjs`（2003 PAK）、`nitroplus-n4.cjs`（Steam 沙耶 NPK2）
- 日文原版恢复：NPA 导入只支持单个未加密归档（`docs/japanese-npa-import.md`、`core/japanese-import-npa.cjs`）

## 画字钩子

DrawSites：`nitroplus`（Saya_Steam.exe，SLOT 形式）、`nitropak`（2003 版 system.dll）（`docs/engine-draw-native.md`）

## 藏原文

GPU 层在沙耶の唄 Steam 和みにくいモジカの子（都是 D3D11）上可用（`docs/hide-layers.md`）；2003 版的 DirectPlay 安装弹窗由 `native/dpdecline` 拒绝

## 已知坑

- モジカ 有 Enigma Protector 壳，静态做不出签名
- Steam 版直接启动报 SteamAPI 初始化失败

## 代表游戏

`The Seed/nitroplus/`：saya-no-uta（verified）、minikui-mojika-no-ko；`The Seed/nitropak/`：saya-no-uta-jp

## 相关代码 / 相关文档

- 代码：`services/original-engines/{nitro-npa,nitro-pak,nitroplus-n4,npk}.cjs`、`core/nitroplus-npa.cjs`、`core/nitroplus-npk.cjs`、`core/saya-page-ocr.cjs`、`core/saya-script-port.cjs`、`native/dpdecline/`
- 文档：`docs/japanese-npa-import.md`、`docs/hide-layers.md`、`docs/engine-draw-native.md`
