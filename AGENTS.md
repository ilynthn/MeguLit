# AGENTS.md

给所有在这个仓库干活的 agent（Claude、Codex、RRFZ 的 agent、其他 AI）和新来的人。开工前花几分钟读完这页和下面两份文件

## 开工前必读

1. `HANDOFF.md`（仓库根，以 origin/main 为准）：谁在做什么。别人认领了、状态不是「完成」的不做；开工先登记一行
2. `docs/kb/README.md`：知识库入口，30 秒速读 + 目录

## 规矩摘要

- **分层**：修一个游戏只改 `The Seed/<engine>/<slug>/` 里它自己的差分（纯数据）；差分表达不了，补引擎层或在 `core/profiles/defaults.cjs` 登记新键（默认值 = 现行为）；绝不为单部游戏改内核。见 `docs/kb/layers.md`
- **读模式**只由用户手动开关；自检、校准、seed status、冷测试结论只能记诊断和给提示
- **提交**：代码不直接 push main，走分支 → PR → CI 通过、Yui审查和人工审查处理完 → squash 合并。`HANDOFF.md` 例外，可以直推 main，但只改这一个文件
- **撞车时 RRFZ 优先**：他在做的不碰
- **不准用 `git stash`**（worktree 共用 stash 列表）；不在别人的 worktree 里 checkout / reset
- **提交和 PR 不加 Co-Authored-By 或 AI 署名**
- **JS 不写 `//` 单行注释**，用 `/* */`；提交前 `node --check` 改过的脚本
- **测试**：只跑相关的（`.\Build.ps1 -TestsChanged` 或 `node --test validation/<x>.test.cjs`）；不擅自开游戏、MeguLit 主程序或安装器
- **只写确认过的事实**：没核实的标「待核实」，推断标「猜测」；有日志就按原理修
- **经验**：每修一条在 `side-session-notes/ENGINE-ADAPTATION-NOTES-<主题>.md` 追加，再把结论补进 `docs/kb/`
- **隐私**：不往仓库写 QQ 号、群号、token、密钥、本机路径、用户个人信息；密钥只走环境变量（例 `MEGULIT_PROFILE_KEY` 是私钥文件路径）
- **issue 回复**以 `【Bot回复】` 开头；只关有证据且修复已发布的 issue。见 `docs/kb/issues.md`

## 快速定位

| 想找 | 看 |
|---|---|
| 整体架构 | `docs/kb/architecture.md` |
| 某个引擎怎么适配 | `docs/kb/engines/` |
| 工具怎么用（adapt-auto、冷测试、Cardinal、diff-maker） | `docs/kb/tools.md` |
| 构建、测试、CI、发版 | `docs/kb/build-test-ci.md` |
| 读音 / 翻译 / 查词 / 点读卡 / 排版 | `docs/kb/reading.md`、`translation.md`、`lookup.md`、`lookup-popup.md`、`reader-layout.md` |
| 术语 | `docs/kb/glossary.md` |
