# 四层适配规矩

> 这页回答：修一个游戏的问题该改哪一层；差分层怎么叠；The Seed 是什么格式

## 四层（大套中套小）

| 层 | 放在哪 | 什么时候改 |
|---|---|---|
| ① 内核 | MeguLitHook（`native/megulithook/`）+ `core/` 的共用流程，默认值登记在 `core/profiles/defaults.cjs` | 只有对所有游戏都有益时才改；改完所有已能用游戏的回放夹具必须照样通过 |
| ② 引擎通用画字函数 | 每个引擎逆向出来的画字钩子（`native/megulithook/*Draw.h` / `*DrawSig.h`、`tools/engine-sigs/*.cjs`、`native/krkrtext`、`native/renpytext` …）+ 引擎差分 `core/profiles/engines/<engine>.cjs` | 一个引擎的所有游戏都缺的能力（钩子、隐藏路线、接句规则）；新能力要加成 profile 键，默认值 = 现行为 |
| ③ 游戏差分 | `The Seed/<engine>/<slug>/game.json`（游戏层）+ `versions/<exe SHA-256>.json`（版本层），纯数据 | 单部游戏的问题**只改这里** |
| ④ 上传 Seed | 验收通过后进仓库 `The Seed/`，或由 relay 下发签名差分 | 适配做完、Cardinal / 实机验收过 |

判断顺序：差分能表达 → 改 ③；差分表达不了 → 说明引擎层缺能力或缺键，去补 ② 或在 `defaults.cjs` 登记新键（默认等于现行为），再在 seed 里打开；绝不为单部游戏改内核。起因：只做通用修复时，修好千恋＊万花就弄坏ファタモルガーナ，来回七八轮（`core/profiles/engines/kirikiri.cjs` 注释里有记录）

## 层叠顺序（后面盖前面）

内核 ← 引擎差分 ← 仓库游戏文件 / skeleton seed ← 共享自动·游戏层 ← 共享自动·版本层 ← 本机校准 ← 官方·游戏层（内置 seed 或下发，rev 高的覆盖内置）← 官方·版本层 ← 本机退档

- 数组整组替换；`null` 表示交给内核判断
- 仓库外来的每一层都过 `core/profiles/domains.cjs` 的值域：一个键或值不合法，整层不用（`profile.rejected` 记原因）
- 本机退档只记诊断 + Alt+T 提示，**不切读模式**

## 版本层 vs 游戏层

- **版本层**（`layer:'version'`，key = exe 整文件 SHA-256）：钩子地址、特征码偏移、`draw.embed`、`draw.embedTranslation`、`draw.engineTable`、`hide.engineTrial.*` 这类跟某个 exe 绑定的
- **游戏层**（`layer:'game'`，key = 游戏身份）：文本框位置、特效帧、选项过滤、隐藏方式、自检阈值、排版
- 每个键属于哪层登记在 `core/profiles/domains.cjs`（`layerOf` / `split`）

## 认游戏（`core/game-print.cjs`）

① `exe` 整文件 SHA-256 → ② `head`（首尾 64 KB + 大小）/ `pe`（文件版本 + 链接时间）→ ③ `pack` / `script` / `steam` / `vndb` / `title`（加 seed 的 `builds`、`match`）→ ④ `engine`

- 版本层只在 ①② 用；游戏层任一级都用
- ②③ 命中的下发差分只是**候选**：第一个自检窗口不过线就拒用并上报（`data/The Seed/<exe>.rejected.json`）
- trace：`profile <gameKey> match=exe|head|pe|game:<依据>|engine|none exe=<前8位> layers=… engine=…`

## The Seed 格式

```
The Seed/<engine>/<slug>/game.json                  游戏层文档（core/game-diff.cjs）
The Seed/<engine>/<slug>/versions/<exeSha256>.json  版本层文档
The Seed/<engine>/<slug>/story.json                 可选作品结构（services/story-data.cjs）
```

`game.json` 的 seed 字段：`seedFormat`（现为 1）、`status`、`slug`、`builds`、`sourceLangs`（默认 `["ja"]`）、可选 `match {exe,titles,notTitles}`、`ext`

| status | 客户端怎么用 |
|---|---|
| `verified` | 官方游戏层，直接用；隐藏 seed 不给读模式提示 |
| `owner-ok` | 同上；店主名单 `tools/diff-maker/owner-ok.json`（现在是 josou-sanmyaku、fata-morgana） |
| `read` | 照常按隐藏模式跑，只标待修、在 Alt+T 给读模式提示 |
| `skeleton` | 只给身份 + 钉住值，放在本机校准下面，自检闸门照常把关 |

- settings **钉住当前生效值**：做好了就是做好了，内核默认值以后改了也不影响它；`null`、`calibrate.*`、`selfCheck.*`、`hide.engineTrial.*` 不钉
- **用户偏好不进 seed**（例如用户自定义的译文宽度、行高只在不等于默认值时生效，且不写回 seed）
- seed 内容以 `tools/diff-maker/seed-all.cjs` 的输出为准；`validation/the-seed.test.cjs` 要求仓库里的 seed 没有报警
- 2026-11-27 统计：34 个引擎目录、105 个 slug；verified 4（kirikiri/senren-banka、mages/chaos-child、bgi/subahibi、nitroplus/saya-no-uta）、owner-ok 2、read 2（kirikiri/shiniyuku-kimi、mages/steins-gate），其余 skeleton

## 读模式规矩（2026-11-21 店主定）

读模式只由用户在设置 / Alt+T 里手动开关（「隐藏游戏原文」关 = 读模式）。自检退档、特效判据、校准的 `mode:'read'`、seed 的 `status:'read'`、冷测试结论都**只记诊断、上报、在 Alt+T 给提示和「切读模式」按钮**，不改渲染模式。实现：都走 `GalNative.textEffects(true, why)`，只设 `readHint`。回放：`validation/fata-seed-keeps-hide.test.cjs`

## 下发和签名

- relay：`GET /api/game-profile?exe=&head=&pe=&pack=&script=&steam=&vndb=&title=&engine=&have=&haveGame=` → 两层文档（`relay/src/auto-profile.js`）
- 签名：Ed25519，只在维护者本机签（`tools/sign-profile.cjs`，私钥路径走 `MEGULIT_PROFILE_KEY`），relay 不持私钥；客户端公钥 `services/profile-keys.json`
- 内置 The Seed 不签名；用户电脑上的下发缓存在 `data/The Seed/`
- 上传默认开（`autoProfileShare`、`runtimeSampleShare`，用户设 false 才关）；截图只截游戏客户区，打分都在本机，过线不传截图

## 相关代码 / 相关文档

- 代码：`core/profiles/defaults.cjs`、`core/profiles/domains.cjs`、`core/profiles/seed.cjs`、`core/profiles/engines/*.cjs`、`core/game-diff.cjs`、`core/game-print.cjs`、`core/auto-profile.cjs`、`services/auto-profile-feed.cjs`、`services/self-check-live.cjs`、`tools/diff-maker/seed-all.cjs`、`relay/src/auto-profile.js`
- 测试：`validation/the-seed.test.cjs`、`validation/profile-stack.test.cjs`、`validation/profile-layers.test.cjs`、`validation/games-regression.test.cjs`
- 文档：`docs/diff-layers.md`（权威接口）、`The Seed/README.md`、`docs/ordinary-seed.md`、`docs/enhanced-seed-queue.md`
