# 协作流程

> 这页回答：多人 / 多 agent 同时改 MeguLit 时怎么认领、怎么提交、怎么合并、有哪些硬规矩

## HANDOFF.md：谁在做什么

仓库根 `HANDOFF.md` 是所有人（RRFZ、魚魚棟的 Claude 会话、其他 agent）共用的登记表

1. **开工前先看**：要做的问题已经有人认领、状态不是「完成」，就别做，换一条
2. **开工就登记**：在「进行中」表加一行（谁、做什么、issue、分支、开始、状态），再写代码
3. **做完就更新**：状态改「完成」并写 PR / 提交号；放弃了写原因，挪到「已放弃」
4. 一条只认领一次；认领超过 3 天没动静，可以在群里问一声再接手
5. **撞车时 RRFZ 优先**：他在做或想接手的，直接把那一行的「谁」改成他，Claude 会话看到就停手，不争、不覆盖他的改动
6. 「完成」表只保留最近 30 条

RRFZ 的 GitHub 账号是 `Plastic-time`。开工前除了 HANDOFF，再查一眼他的 PR：`gh pr list -R ilynthn/MeguLit --author Plastic-time --state all`

## 提交和合并

- **代码不直接 push 进 main**（任何人都一样）：推自己的分支 → 开 PR → CI 通过、审查没问题 → **squash 合并**
- **HANDOFF.md 例外**：认领、改状态直接改直接推 main，第一时间让大家看到；只改这一个文件，不夹带代码
- 每个任务一个分支、一个 worktree；**不准用 `git stash`**（所有 worktree 共用一个 stash 列表，会 pop 到别人的改动）；不在别人的 worktree 里 checkout / reset
- 提交说明和 PR **不加 Co-Authored-By 或任何 AI 署名**
- JS **不写 `//` 单行注释**，用 `/* */`；提交前对改过的脚本跑 `node --check`
- 删旧代码时，提交说明里写清删了什么、降级了什么、为什么不能删
- 只跑相关测试：`.\Build.ps1 -TestsChanged`，或 `node --test validation/<相关>.test.cjs`（见 [build-test-ci.md](build-test-ci.md)）

## Yui审查

PR 打开后会自动出现 Yui审查：一条总评 + 若干行内评论，每条带 P1 / P2 标记、说明触发条件和后果

- 每条都要看：是真问题就在同一分支修掉再推；不适用就在那条评论下回复理由
- 有未处理的 P1 不合并
- RRFZ 也会在 PR 下做人工审查（例 #1198），他的意见同样逐条处理
- 新推送后是否会自动重审：待核实

## 适配和修复的分层

修一个游戏只改它的差分；差分表达不了就补引擎层或登记新键；绝不为单部游戏改内核。详见 [layers.md](layers.md)

## 经验记录

每修一条问题，在 `side-session-notes/ENGINE-ADAPTATION-NOTES-<主题>.md` 追加一条：证据、改了什么、有没有修好、失败的尝试也写；不确定的标「猜测」。再把结论补进 `docs/kb/` 对应页。动手前先读已有笔记，记录过不行的路不要再走

## 测试和实机

- 自动测试用 node 模块 + 回放夹具，不开 MeguLit.exe
- 会打开游戏、主程序、安装器或抢前台的测试，按维护者的规矩来（谁测、什么时候测），不要自己默认去跑
- 交付时附一份短测试清单：怎么操作、看到什么算过、不过时发哪个日志

## 发版

- 只有维护者确认后才发；版本号 = 上一版 + 0.0.1，不加字母
- 所有在做的分支合并完才发，所有二进制时间晚于最后一次合并
- 安装包名 `MeguLit-vX.Y.Z-win-x64.zip` 和 `MeguLit/` 目录结构不能变（自动更新依赖）
- 详见 [build-test-ci.md](build-test-ci.md)

## 相关代码 / 相关文档

- `HANDOFF.md`、`AGENTS.md`、`.github/workflows/ci.yml`、`Build.ps1`、`Release.ps1`
- [issues.md](issues.md)、[layers.md](layers.md)、[build-test-ci.md](build-test-ci.md)
