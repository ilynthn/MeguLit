# 工具手册

> 这页回答：适配和验收用的维护者工具各是什么、怎么调用、产出什么、依赖什么。构建 / 测试 / CI 见 [build-test-ci.md](build-test-ci.md)

## 适配流水线一览

```
游戏目录 → 探针（probe-full）→ 冷测试（ColdDesk 隐藏桌面跑游戏录样本）→ diff-maker（出差分草稿）→ Cardinal（回放打分）→ 签名 / 进 The Seed
```

`tools/adapt-auto.cjs` 把这条链串成一条命令；单独的步骤也都能手动跑

## adapt-auto（自动适配命令行）

**截至 2026-11-27 只在分支 `feat/auto-adapt`、`krkr-drawtext`、`claude/adapt-auto-1de1b1` 上，未合入 main**

- 目标：一部游戏 5–10 分钟，超预算判 inconclusive 并写明卡在哪一步；只串现有模块，不重写逻辑
- 用法：`node tools/adapt-auto.cjs <游戏目录> [--exe 相对路径] [--out 目录] [--budget-min N] [--app MeguLit安装目录] [--foreground] [--seed-out 目录] [--skip|--no-skip]`
  - `--budget-min`：整部预算，1–60，默认 10
  - 默认阅读速度推进：前 60 句慢读，再按 Ctrl 快进到第一个选项；`--skip` 全程快进（快进会把逐字流切碎，row 明显变差）
  - `--foreground`：游戏放可见桌面（仍静音），定时整屏截图到 `<out>/screen/`；只在用户不在电脑前时用
  - `--seed-out`：只在 pass 时写 `<dir>/<engine>/<slug>/{game.json, versions/<sha>.json, lines.json}`
- 退出码：0 pass / 1 fail / 2 inconclusive（参数错、另一部在跑、Switch 游戏、光盘镜像也是 2）
- 步骤：triage → locate（`core/library.cjs findGame` 往下找 4 层）→ engineHook（KiriKiri 走 krkr DLL；cs2 / advhd / bgi / cmvs / fvp / mages / majiro / siglus / yuris 用 `tools/engine-sigs/<id>-draw.cjs` 扫 exe）→ probe（`services/probe-full.cjs`）→ prepareApp → cold（`services/cold-test.cjs testOne`，输入兜底 PostMessage → InputShim → SendInput）→ diff（只用阅读速度段）→ cardinal（`tools/cardinal.cjs --tape … --run run.json --shots …`）
- 判定门槛：leak ≥ 0.98、row ≥ 0.9、pair ≥ 0.9、choice = 1；任何一项没量到就 inconclusive，不猜成 pass。原文隐藏只认 Cardinal 的 `leakObservation.observed`
- 输出：`<out>/result.json`（`verdict, engine, gameKey, reasons, checks, stuck, budgetMs, totalMs, steps, layers, artifacts, cold, diff, cardinal, hide, …`）+ `probe/`、`run/`、`diff/`、`cardinal.json`、`yui-run.log`
- 依赖：一个 MeguLit 安装目录（要有 `native/ColdDesk.exe`）；会重编 ColdDesk 和 HookBridge（源码没变就复用）；DrawSkip 版 MeguLitHook32.dll 按 `MEGULIT_HOOK_DIR` 找。环境变量：`MEGULIT_ADAPT_RUNS`、`MEGULIT_APP`、`MEGULIT_HOOK_DIR`、`MEGULIT_BUILD_TOOLS`、`MEGULIT_ROOT`
- 坑：一次只能跑一部（runs 根目录 `adapt-auto.lock`）；`--out` 不能放在游戏目录里；从不写游戏目录；Windows 上 Node < 24 会改用安装目录的 `runtime/node.exe` 重跑（Node 22 `fs.cpSync` 遇非 ASCII 路径段错误）；只开钩子不开 MeguLit.exe，所以截图里没有译文，「原文被盖住 / 选项有翻译」最终仍要实机确认
- 测试：`validation/adapt-auto.test.cjs`（分支上）

## 冷测试 / ColdDesk

- 是什么：用户电脑空闲时，在隐藏桌面上静音跑用户自己的游戏，录一份运行样本，离线打分（`docs/cold-test.md`）
- 模块：`core/cold-test/`（`conditions` 能否开始、`pick` 选哪部、`saves` 存档快照 / 还原、`score` 离线打分、`drive` 状态机）；`services/cold-test.cjs`（调度）、`cold-test-run.cjs` / `cold-test-worker.cjs`（单独进程跑一次）
- 触发条件：服务启动 10 分钟后每 2 分钟查一次；无键鼠输入 10 分钟、插电、没有全屏应用、没在玩游戏、CPU ≤ 35%、磁盘 ≥ 2 GB；每部最多 6 分钟，每天最多 30 分钟 / 4 部（`library.json coldTestLimits` 可覆盖）
- `native/ColdDesk.cs`（Build.ps1 编成 x64）：
  - `ColdDesk.exe status` → 一行 JSON `{idleMs, ac, fullscreen, cpu, quns}`
  - `ColdDesk.exe run <exe> [--seconds N] [--steam-appid ID]`：游戏开在隐藏桌面 `MeguLitColdDesk`，放进 Job 对象，静音
  - stdin 命令：`key` / `keydown` / `keyup` / `click` / `activate` / `shot` / `kill`
  - 它把维护者测试工具 HidDesk（隐藏桌面 + PostMessage）和 MuteProc 合成一个随产品发的 helper
- 产物：`data/cold-test/runs/<key>-<time>/`（`hook-events.log`、`engine-draw.log`、`shot-*.jpg`、`run.json`），保留最近 6 次
- 结论：pass / edge / fail / inconclusive；黑屏或少于 8 句算 inconclusive（不能在隐藏桌面渲染的游戏不算失败）
- 坑：隐藏桌面没有真键盘，用 `GetAsyncKeyState` 读 Ctrl 的引擎没法快进；D3D 全屏会黑屏；音频状态还原曾把用户设成静音（`docs/cold-audio-state.md`，改成 endpoint + session instance id 做键并读回确认）
- 测试：`validation/cold-test.test.cjs`

## Cardinal（回放打分）

- 是什么：把一局最近 N 句台词重放进隐藏阅读层（无头 Edge + CDP），打 7 项分：row、stable、clean、clear、choice、pair、leak（内部 0–1，显示 ×10）；结果写 `data/The Seed/cardinal/<exe sha256>.json`，开了共享适配时 `POST /api/cardinal/score`（`docs/cardinal.md`）
- relay 侧：3 个以上上报者平均 ≥ 0.9 且单票不低于 0.6，自动差分升 verified；平均 < 0.6 进修复队列（`relay/wrangler.toml` 的 `CARDINAL_VERIFY_*`）
- 模块：`core/cardinal/`（`checks`、`score`、`tape`、`timeline`、`timing`、`display`、`native-hide`、`upload` …）、`services/cardinal.cjs`、`services/cardinal/{run,driver,cdp,automatic,identity}.cjs`；回放模型 `tools/reader-replay/`
- 命令行：`node tools/cardinal.cjs --tape <jsonl> | --logs <dir> --from <ISO> --to <ISO> [--game <json>] [--data <dir>] [--lines n] [--rules <json>] [--out <file>] [--keep]`（分支上另有 `--run`、`--shots`、`--screen`）
- 规则是 profile 键 `cardinal.*`，可热更新；改规则要把 `cardinal.rev` 加一
- leak 语义：手动读模式 = 泄漏；只读流游戏（hookProfile 'read'）只有在隐藏开着且磁带里选中线程 `hideOnly:true`（HookBridge 确认隐藏命中）时才不算泄漏（分支 `krkr-drawtext` 29425b18）
- 相关：`docs/cardinal-trusted-runner.md`（可信 runner，现在只报缺口）、`docs/cardinal-live-acceptance.md`、`docs/cardinal-session-identity.md`、`docs/cardinal-auto-torch.md`（传火三签名之一是 Cardinal 审核签名）
- 测试：`validation/cardinal*.test.cjs`

## diff-maker 和 seed-all

- `tools/diff-maker/index.cjs`：探针目录或 `.mlfp` → 版本层 `version-<exeSha>.json`、游戏层 `game-<gameKey>.json`、`lines-<gameKey>.json`、`replay.json`、`report.md/json`；`--write-repo` 写夹具到 `validation/fixtures/games/<key>/`；输出目录可用 `MEGULIT_DIFF_OUT`；产出的是未签名草稿（`tools/diff-maker/README.md`）
- `tools/diff-maker/seed-all.cjs`：只读本机游戏库和日志，批量生成 `The Seed/<engine>/<slug>/`；参数 `--root`（可多个）、`--out`、`--seed`、`--owner-ok`、`--only`、`--request-selector`、`--request-relay`；不开游戏、不签名、不上传
- `tools/diff-maker/owner-ok.json`：店主确认能用的 slug 名单，在名单上的即使样本离线判 read 也写成 owner-ok + hide
- 测试：`node --test validation/diff-maker.test.cjs`；`MEGULIT_GAMES=senren-banka,fata-morgana node --test validation/games-regression.test.cjs`

## sign-profile（差分签名）

`tools/sign-profile.cjs`：`keygen <仓库外目录>`、`key <exe>`、`make <key> <settings.json> [--layer version|game] [--prints] [--rev] [--mode hide|read] [--exe] [--engine]`、`observe`、`sign <diff.json>`、`picks <relay> <out> [--upload]`、`check <signed.json>`

- 环境变量：`MEGULIT_PROFILE_KEY`（私钥 PEM 的**路径**，放在仓库里会被拒）、`MEGULIT_PROFILE_KEY_ID`（默认 `p1`）、`MEGULIT_ADMIN_TOKEN`（picks 用）
- 公钥 `services/profile-keys.json`；`tools/torch-release.cjs sign-revocation` 用同一组变量

## 探针

- 客户端：`services/probe-full.cjs`（完整探针：剧本条目 + 瘦身 PE + 哈希，打包 `.mlfp`）、`probe-auto.cjs`（后台静默上传）、`probe-identity.cjs`（一部游戏一个 identity 去重）、`probe-structure.cjs`（结构保护，`docs/probe-structure-guard.md`）
- relay：`relay/src/probe-full.js`（存 R2，分片上传）、`probe-issues.js`、`probe-seed.js`、`probe-stats.js`
- 维护者：`tools/probe-workbench.cjs list | get <identity|前缀> | unpack <.mlfp> [dir] | done | delete`，环境变量 `MEGULIT_ADAPTER_ADMIN_TOKEN`、`MEGULIT_RELAY_BASE`、`MEGULIT_PROBE_WORK`
- 注意：探针包是脱敏的（样本字节清零），做不了回归；真字节在贡献包里（`tools/contrib-workbench.cjs`）

## 其他常用工具

| 工具 | 一句话 |
|---|---|
| `tools/contrib-workbench.cjs` | 贡献包：list / sync / get / pull / unpack / text / info / done / delete / clean |
| `tools/adapter-pack.cjs` | 适配包：keygen / check / sign / verify / try / publish / withdraw …（`docs/ADAPTER-PACKS.md`） |
| `tools/admin-token.cjs` | 读 relay 管理 token（`MEGULIT_ADMIN_TOKEN` → 用户级 `MEGULIT_ADAPTER_ADMIN_TOKEN` → 进程环境） |
| `tools/torch-release.cjs` | 传火发布：sign / export / compatible-target / sign-revocation |
| `tools/seed-release-runner.cjs` | 离线跑已有证据候选的发布步骤（`docs/seed-release-runner.md`） |
| `tools/seed-key-bootstrap.cjs` | DPAPI 保存的本机维护者签名密钥；默认只读 plan，显式 `init` 才生成 |
| `tools/engine-sigs/` | 画字签名 JS 参考实现和离线证据工具，见 [engines/](engines/README.md) |
| `tools/reader-replay/` | Cardinal 回放用的引擎模型（如 `krkr-model.cjs`） |
| `tools/patch-pair-selftest.cjs` | 离线核对剧本和汉化补丁的配对 |
| `tools/survey-library.cjs`、`merge-duplicate-games.cjs` | 库调查（只读）/ 合并重复游戏（默认 dry-run） |
| `tools/native-stale.cjs` | 原生二进制不能比源码旧、要带 marker；Release 时也跑 |
| `tools/run-isolated.cjs` + `RunOnTestDesktop.cs` | 把整棵测试进程树放到私有桌面跑 |
| `tools/setup-*.cjs` | 安装器、冷启动、界面截图相关测试台，部分依赖 HidDesk（`MEGULIT_HIDDESK`） |
| `tools/mirror-upload.py` | 把运行时包传到镜像（token 走环境变量） |

## 相关代码 / 相关文档

- 代码：`tools/`、`core/cold-test/`、`core/cardinal/`、`services/cold-test*.cjs`、`services/cardinal*.cjs`、`services/probe-*.cjs`、`native/ColdDesk.cs`
- 文档：`docs/cold-test.md`、`docs/cold-audio-state.md`、`docs/cardinal.md`、`docs/cardinal-*.md`、`docs/probe-structure-guard.md`、`docs/diff-layers.md`、`tools/diff-maker/README.md`、`docs/seed-release-runner.md`、`docs/seed-key-bootstrap.md`
