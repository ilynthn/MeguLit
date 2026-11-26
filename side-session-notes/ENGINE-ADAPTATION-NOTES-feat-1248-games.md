# feat/1248-games 经验记录（#1248 汇总里的 4 部点名游戏）

## 白色相簿2 B 站整合版（#1142，AQUAPLUS/Leaf KCAP）

- 整合版（UP 主 混沌_隳，1.1.0，PC/NS，本体+特典合一，中文/日文双版本，汉化基于澄空学院 + CK-GAL）不是原版 WA2.exe 跑的：
  同期的 PC/NS 移植是 WA2-ns（SDL2 原生重写）和 wa2-godot（静态重编译，Windows x64 / Android 共用），都直接读 PC 版 PAK
- 这类重打包会：PAK 挪进子目录、中日两版分两个文件夹、带重打包的 fon.pak、把 ck-gal.pak 改名 script.pak
- 原来只认「游戏目录根下 script.pak + 尺寸固定的 fon.pak」，所以认不出；改成按正文判断（aquaplus.cjs scriptKind）：
  Shift-JIS 读出假名占 CJK 字符 ≥20% 为日文；按汉化字形表读出无假名且常用汉字（的了是我你…）≥8% 为 CK-GAL 中文。
  真机数据：script.pak 假名 0.655、ck-gal.pak 常用字 0.256，反过来读分别 0.003 / 0，界线很宽
- 日文 script.pak 在本目录 + 两层子目录里找（IC/script.pak 排最后，本体那份已含 IC 的 65/66 个场景）；
  中文版文件夹没有日文脚本时去同级文件夹找场景名重合 ≥80% 的日文 script.pak
- 删了 fon.pak 尺寸白名单；换了字形表的补丁读出来是乱字，仍拒绝配对
- 没做：移植版 exe 的画字钩子（重写/重编译的程序不是 WA2.exe，leaf 钩子挂不上）；特典 Special Contents 的脚本格式
  （WA2_Special_cn.exe 那份）。要等用户发整合版目录截图或诊断包再看

## OZMAFIA!!（#1107）

- YU-RIS（VNDB r15697，2013），读脚本 ✅ ypf/YSTB，钩子 ✅ LunaHook Yuris + YurisDraw.h；Seed 无条目
- 本机没有，已排 DeepSeek 下载单 `F:\Agent\deepseek\queue\ozmafia.json`

## アイキス3 sexy（#1109）

- 戯画 GIGA，NeXAS（VNDB r89240 下载版）。nexas.cjs 读 PAC + .bin 串表，但「未经实物」(E577)，正好拿它确认 .bin 布局；Seed 无条目
- 已排下载单 `F:\Agent\deepseek\queue\aikiss3-sexy.json`

## 常轨脱离 = ハミダシクリエイティブ（#1133）

- まどそふと，Artemis（VNDB r68473 / r74630）；读脚本 ✅ pfs + .ast，钩子 ✅ LunaHook Artemis；Seed 无条目。
  「常轨脱离 Creative」是 2022 官方简中版的名字，用户手里可能是中文版
- 已排下载单 `F:\Agent\deepseek\queue\hamidashi-creative.json`

## 下载到 `E:\gal\adapt\` 之后

1. 隐藏桌面跑适配（先独占 `F:\Agent\work\adapt-auto-runs\.game.lock`，跑完删）：
   `node tools/adapt-auto.cjs "E:\gal\adapt\<目录>" --budget-min 15 --seed-out <本地目录>`（工具在 feat/auto-adapt 分支）
2. result.json 判 pass 才把 `--seed-out` 产出的 game.json / versions 放进 `The Seed/<引擎>/<slug>/`；fail/inconclusive 按 reasons 修引擎层
3. アイキス3：先 `scenes.read('nexas', dir)` 核对 .bin 串表行数和台词是否对，再跑适配
4. ハミダシ：日文原版读完后，如用户有官方简中版，按 artemis 多语言/补丁配对核对 100% 配对
