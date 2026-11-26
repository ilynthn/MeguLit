# 构建、测试、发版、CI

> 这页回答：怎么构建、怎么只跑相关测试、发版脚本做什么、CI 有哪些 job、哪些测试会偶发失败

## Build.ps1

`param([switch]$Check,[switch]$TestsOnly,[switch]$TestsChanged)`

| 用法 | 做什么 |
|---|---|
| `.\Build.ps1` | 构建：托盘图标、prepare-reader、reader bridge、HookBridge、`native/native-builds.json` 里各项及自测、native-stale、C# 小工具（含 ColdDesk）、`node --check`、cargo release、`MeguLit.exe` 和 `build-manifest.json` |
| `.\Build.ps1 -Check` | 构建后跑测试（经 `tools/test-resume.cjs`：只重跑失败、新增、改过的；代码指纹变了就全量） |
| `.\Build.ps1 -TestsOnly` | 只跑 test-resume 选出的测试 |
| `.\Build.ps1 -TestsChanged` | **平时用这个**：`tools/changed-tests.cjs` 只选「提到了自 merge-base 以来改过的文件」的测试；基准是与 origin/main 的 merge-base，可用 `MEGULIT_TEST_BASE` 换 |

- 并发：`MEGULIT_TEST_CONCURRENCY`（1–32，默认 2）
- 测试经 `tools/run-isolated.cjs` 放到私有桌面跑；结果写 `validation/automated-results.{txt,json}`
- 退出码 3 = 构建成功、只有测试失败
- 工具链（Rust、MSVC）由 `tools/build-env.ps1` 定位，可用 `MEGULIT_BUILD_TOOLS` 指定；找不到工具链不是放弃的理由，先查这个变量
- 桌面端是 Tauri：exe 编译时把 `web/` 嵌进去，改 web 文件要重编 exe 才生效（热更新包另说）

## 测试

- 全部在 `validation/` 顶层：约 890 个 `*.test.cjs`；`helpers/`、`fixtures/`（`games/` 回放夹具、`cardinal/`、`engine-draw/`）、`native/`
- 单个：`node --test validation/x.test.cjs`
- 按游戏回放：`MEGULIT_GAMES=<slug,…> node --test validation/games-regression.test.cjs`
- 浏览器测试（`startEdge(`、`cardinal/cdp`、`--headless=new`）没装 Edge 且非 CI 时 skip；`MEGULIT_EDGE`、`MEGULIT_PLAYWRIGHT`
- 会开真窗口 / 安装器的测试（如 `validation/setup-flow.test.cjs`、用到 `MEGULIT_HIDDESK` 的）不要混进批量相关测试
- `.gitignore` 默认挡住 `validation/fixtures/*`，只放行 `games/`、`engine-sigs/`、`livemaker/`：其他夹具（例如 `cardinal/`）要 `git add -f`，否则别的分支 / CI 拿不到
- 原生自检：各 DLL 的 selftest 由 Build.ps1 跑；HookBridge `--self-test`
- 仓库根没有 `package.json`（只有 `relay/package.json`），不用 npm 跑测试

## Release.ps1

参数：`-Version`（必填）、`-Notes`、`-DryRun`、`-Prepare`、`-SkipBuild`、`-Hotfix`、`-IncludeWorkingChanges`、`-Restart`、`-Beta`

- 阶段：sync → bump → build → commit → push → release → upload → verify；进度存 `%TEMP%\megulit-release-state-<tag>.json`，失败后原命令重跑会续跑
- 常用：`-Prepare`（bump + build + 全量测试，记住这棵树）→ 通过后 `-SkipBuild` 发布
- 产物：`MeguLit-vX.Y.Z-win-x64.zip`（所有条目在 `MeguLit/` 下，自动更新依赖这个名字和结构）；热更新包 `MeguLit-v<label>-hot-from-v<prev>-<digest12>.zip`（只动 web/core/services 时）
- `-Beta`：提交到 beta 分支并发 GitHub prerelease，不上网站
- 版本号文件：`web/about.js`、`desktop/Cargo.toml`、`desktop/tauri.conf.json`、`desktop/Cargo.lock`
- 发布说明中英双语，`---` 分隔，Release.ps1 折叠成两个 `<details>`
- 自动更新：客户端查 GitHub latest release，镜像优先（`services/update.cjs`、`web/update-notice.js`）

## CI（`.github/workflows/`）

**`ci.yml`**：push main、`v*` tag、pull_request、手动（可选 full_build）；同一 PR 新推送取消旧检查

| job | 跑在 | 做什么 |
|---|---|---|
| `syntax` | ubuntu | 对 web / services / core / tools / validation 所有脚本 `node --check`，判断要不要 cargo |
| `native` | windows | 编 csc 小工具、`native-builds.json` 里标了 ci 的 DLL 及自测、`native-stale --ci`、HookBridge；按源码哈希缓存（MeguLitHook 本身 `ci:false`） |
| `cargo` | windows | `cargo check`，只在 desktop / web / ci.yml 有改动时跑 |
| `tests` | windows | 3 个分片（`tools/test-shards.cjs` 按耗时分），依赖 syntax 和 native；replay 道、browser 道并发 1，standard 道并发 2；超时 30 分钟 |
| `full-build` | windows | 手动开启时跑 `Build.ps1 -Check` |

**`sign.yml`**：手动或 `v*` tag；build（`Build.ps1 -Check`）→ sign（SignPath，人工批准；未配置时跳过；配置名 `SIGNPATH_API_TOKEN`、`SIGNPATH_ORGANIZATION_ID`、`SIGNPATH_PROJECT_SLUG`、`SIGNPATH_SIGNING_POLICY_SLUG`）

**Yui审查**：PR 打开后会自动出现行内代码审查评论（带 P1 / P2 标记）。处理方法见 [workflow.md](workflow.md)

## 已知偶发失败（flaky）

| 测试 | 修复 | 现状 |
|---|---|---|
| `kana-speech-warmup.test.cjs`（五十音语音预热超时） | #1218 c346a21c：等 harness 页面加载完，按住 warmup 计时器直到 unmount 检查 | 已修，是否复发待核实 |
| `kana-stop-on-leave.test.cjs` | #1240 13f15969：等 harness 就绪 | 已修，待核实 |
| `dict-saved-homophone-match.test.cjs`（词典 saved-word） | #1233 612333b2：修启动竞争，加 waitFor，超时 60 → 120 秒 | 已修，待核实 |
| `moji-audio-playback.test.cjs` | #1258 99e6daf6 | 已修，待核实 |
| ファタ验收检查 7（`validation/fixtures/games/fata-morgana/acceptance.case.cjs`，经 `games-regression.test.cjs`） | #1011 5ffffba2：CI 忙时中文晚于 400 ms，改成 1 秒后开始判 | 已修 |
| `altt-drag-glass`、`story-analysis`、`cold-launch-audio` | #912、#916 | 已修 |
| renpy、unity、altt 计时类 | #1044；浏览器测试按分片隔离 #1236 | 已修 |

HANDOFF.md 里 RRFZ 登记了「CI 偶发失败的测试找根因修稳」（界面对比度、校准链、阅读层启动提示、测速超时、五十音预热、浏览器分片均衡、词典同音词、离开五十音页停播、我的主页卡片、子进程退出顺序），状态进行中：遇到这些先看 HANDOFF 和最近的 PR，不要重复修

偶发失败的处理：先单独重跑那一个文件；`-Prepare` 时偶发失败可降并发重跑，不从头来

## 相关代码 / 相关文档

- 代码：`Build.ps1`、`Release.ps1`、`.github/workflows/ci.yml`、`.github/workflows/sign.yml`、`tools/changed-tests.cjs`、`tools/test-resume.cjs`、`tools/test-shards.cjs`、`tools/run-isolated.cjs`、`tools/native-stale.cjs`、`tools/build-env.ps1`、`native/native-builds.json`
- 文档：`docs/CODE-SIGNING.md`、`docs/force-update-1.4.23.md`、`docs/installer-runtime-finalize.md`
