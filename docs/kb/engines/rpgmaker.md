# RPG Maker（MV / MZ 和 XP / VX / VX Ace）

> 这页回答：RPG Maker 两大分支怎么认、怎么读、隐藏能做到哪

## MV / MZ（NW.js）

- **识别**：`js\rpg_core.js` 或 `rmmz_core.js`、`www\js` + package.json、`data\MapInfos.json` + System.json + game/nw.exe；`hook:null`（`services/original-engines/registry.cjs`）
- **离线**：`rpgmaker.cjs` 读 JSON 事件命令 101 / 401 / 102 / 105 / 405；Visual Novel Maker 数据即 MZ
- **运行时（CDP）**：`core/text-paths-launch.cjs` 加 loopback CDP 端口，注入 `core/text-paths-rpgm.cjs`，包 `Window_Message` 内容 Bitmap、`Window_NameBox`、`Window_ChoiceList`（`side-session-notes/RPGMaker-cdp-result-ff1063a0.md`）
- **隐藏**：扣下 `Window_Message.contents` 的 fillText / strokeText，关闭时在原 contents 上重放；只有真扣下了字形才报 hidden（`docs/rpgm-hide-proof.md`）
- **坑**：Pixi 2 的 `renderable=false` 压不住子节点，曾导致误清页；坐标是字体格子，不是墨迹
- **单 exe（EVB 封装）**：Creatures 实机走通 12 页正文（`docs/rpgmv-container-private-chain-20261122.md`、`docs/rpgmv-creatures-singleexe.md`）
- 引擎差分 `core/profiles/engines/rpgmaker.cjs` 显式 `draw:{roles:false,embed:false}`：必须在 seed 里显式打开

## XP / VX / VX Ace（RGSS1–3）

- **识别**：`.rgssad`、`.rgss2a`、`.rgss3a`，或 `Data\*.r[xv]data2?` + Game.exe；魔数 `RGSSAD\0`
- **离线**：`rgss.cjs` 解 RGSSAD v1/v3 和 Ruby Marshal，转成 MV 的数据形状后交给 `rpgmaker.cjs`
- **运行时**：不注入 DLL；在副本 `Scripts.rvdata` 的 Main 段前加 Ruby 观察脚本，看 `Bitmap.draw_text`，通过 TCP 上报（`docs/engine-rgss.md`）
- **范围**：默认只开《魔女の家》VX 1.09a；XP 和 Ace 需要 opaque grant 私测
- **隐藏**：没有，所有记录 hidden=0
- **坑**：VX 的选项类叫 `Window_Choice`；回放用 Ruby 4 不是原版 1.8 / 1.9；动态 loader 的作品被拒；XP 隐藏启动曾被音频 Guard 拦下

## 代表游戏

The Seed 里暂无 rpgmaker / rgss 目录

## 相关代码 / 相关文档

- 代码：`core/text-paths-rpgm.cjs`、`core/text-paths-rgss.cjs`、`core/text-paths-launch.cjs`、`core/rgss-*.cjs`、`core/rpgm-container.cjs`、`core/rpgm-source.cjs`、`services/original-engines/{rpgmaker,rgss,evb}.cjs`、`core/profiles/engines/{rpgmaker,rgss}.cjs`
- 文档：`docs/rpgm-hide-proof.md`、`docs/engine-rgss.md`、`docs/rpgmv-creatures-singleexe.md`、`docs/rpgmv-container-private-chain-20261122.md`、`docs/third-party-rpgmv-container-20261122.md`、`side-session-notes/RGSS-*-result.md`、`side-session-notes/RPGMaker-cdp-result-ff1063a0.md`
