# docs 总目录

会话接活的读法：先读本页，按任务所在区域挑 1 到 2 篇，其余不要读。硬规矩在 [../AGENTS.md](../AGENTS.md)，认领登记在 [../HANDOFF.md](../HANDOFF.md)。

标记：**[权威]** 当前有效的设计或接口；**[候选]** 2026-11-22 前后的候选交付说明，记录当时的证据和边界，改对应代码前读；**[旧]** 可能过时或已被取代，见文末清单。

## 通用开发规则（改 AGENTS.md 时拆出的细则）

- [dev-rules.md](dev-rules.md) **[权威]** 构建、测试、CI、第三方代码、不得提交的文件。写测试、开 PR 前读。
- [architecture.md](architecture.md) **[权威]** 项目组成、目录职责、归属方、修复放哪一层。不知道代码该放哪时读。

## 阅读层与隐藏层

- [text-architecture.md](text-architecture.md) **[权威]** MeguLit 自己画游戏全部文字的总设计。改阅读层排版、隐藏原文前先读。
- [text-architecture-compositor.md](text-architecture-compositor.md) 捕获合成器（②）。改叠层合成时读。
- [text-architecture-marks.md](text-architecture-marks.md) 游戏自己画「・」时的标记处理。遇到圆点、标记问题时读。
- [hide-layers.md](hide-layers.md) **[权威]** 隐藏原文的各层方案与取舍。原文没藏住或藏过头时读。
- [self-check-observation-gate.md](self-check-observation-gate.md) 隐藏校准必须有观察数据。改自检或校准时读。
- [rpgm-hide-proof.md](rpgm-hide-proof.md) RPG Maker 隐藏与还原的实测证据。
- [cursor-affordance.md](cursor-affordance.md) 页面光标样式。改光标时读。
- [cold-audio-state.md](cold-audio-state.md) 冷启动时音频状态恢复。游戏音量被改动时读。
- [perf-cpu-plan.md](perf-cpu-plan.md) CPU 发热原因与降耗方案。调性能时读。

## hook 与引擎

- [engine-families.md](engine-families.md) **[权威]** 哪些引擎可以合并解决。新引擎先看它归哪个家族。
- [engine-coverage.md](engine-coverage.md) 引擎覆盖普查（11-13，部分过时）。查某引擎当前支持到哪层。
- [engine-draw-protocol.md](engine-draw-protocol.md) **[权威]** 画字上报协议。写或改任何引擎绘制钩子前必读。
- [engine-draw-matrix.md](engine-draw-matrix.md) 各引擎画字函数盘点矩阵。找某引擎该 hook 哪个函数。
- [engine-draw-native.md](engine-draw-native.md) 原生引擎画字缺口与方案（92KB，查具体引擎段落即可）。
- [megulit-engine.md](megulit-engine.md) 直接读引擎剧本的设计与 KiriKiri 原型。
- [megulit-adapter-craft.md](megulit-adapter-craft.md) 适配器 craft 静态分析阶段。
- [kag-renpy-ruby-integration.md](kag-renpy-ruby-integration.md) KAG、RenPy 原生注音接入。
- [japanese-folder-scan.md](japanese-folder-scan.md)、[original-scan-ui.md](original-scan-ui.md) 日文原版目录扫描与界面。
- [japanese-npa-import.md](japanese-npa-import.md) 导入单个 Nitroplus 档案。
- [probe-structure-guard.md](probe-structure-guard.md) 探针样本结构守卫。
- 引擎专项（每篇只对应一个引擎，改该引擎时读）：
  - Siglus：[engine-siglus-verification.md](engine-siglus-verification.md)（来源见 [third-party-siglus-verification.md](third-party-siglus-verification.md)）
  - BGI：[re-bgi-validation-20261122.md](re-bgi-validation-20261122.md)（[来源](third-party-bgi-validation-20261122.md)）
  - Ren'Py：[re-renpy-live.md](re-renpy-live.md)、[re-renpy-bounded-pickle.md](re-renpy-bounded-pickle.md)、[re-renpy-compiled-groups.md](re-renpy-compiled-groups.md)、[re-renpy-compiled-root.md](re-renpy-compiled-root.md)、[re-renpy-explicit-track.md](re-renpy-explicit-track.md)、[re-renpy-node-state.md](re-renpy-node-state.md)、[re-renpy-rpc2.md](re-renpy-rpc2.md)
  - RPG Maker：[engine-rgss.md](engine-rgss.md)、[rpgmv-container-private-chain-20261122.md](rpgmv-container-private-chain-20261122.md)、[rpgmv-creatures-singleexe.md](rpgmv-creatures-singleexe.md)（[来源](third-party-rpgmv-container-20261122.md)）
  - Tyrano：[engine-tyrano/result.md](engine-tyrano/result.md)、[engine-tyrano/sweetdolls-hidden-20261122.md](engine-tyrano/sweetdolls-hidden-20261122.md)
  - Unity：[engine-unity-il2cpp-play.md](engine-unity-il2cpp-play.md)、[re-unity-kemco.md](re-unity-kemco.md)
  - Artemis：[artemis-lua-input.md](artemis-lua-input.md)
  - MAGES：[re-mages-verification.md](re-mages-verification.md)（[来源](third-party-mages-verification.md)）
  - Softpal：[re-softpal-host-input.md](re-softpal-host-input.md)（[来源](third-party-softpal.md)）
  - Circus：[re-circus-stock-runtime.md](re-circus-stock-runtime.md)（[来源](third-party-circus-stock-runtime.md)）
  - ExHIBIT：[re-exhibit-stockhook.md](re-exhibit-stockhook.md)（[来源](third-party/exhibit-stockhook.md)）
  - AdvHD [re-advhd-input.md](re-advhd-input.md) · CMVS [re-cmvs-input.md](re-cmvs-input.md) · FVP [re-fvp-input.md](re-fvp-input.md) · minori [re-minori-input.md](re-minori-input.md) · Musica [re-musica-basic.md](re-musica-basic.md) · LiveMaker [re-livemaker-reader.md](re-livemaker-reader.md) · NeXAS [nexas-normal-runtime.md](nexas-normal-runtime.md) · 弹丸论破 [engine-danganronpa-runtime.md](engine-danganronpa-runtime.md) · YU-RIS [story-yuris-source-layouts.md](story-yuris-source-layouts.md)
- [re-torch-dispatch-peer.md](re-torch-dispatch-peer.md) 传火接收端接线的同行评审。
- [native-owner-integration.md](native-owner-integration.md) 私有原生源码集成记录。
- [oss-survey.md](oss-survey.md) 同类开源项目调研（11-14）。

## 主界面 UI

- [library-config-preservation.md](library-config-preservation.md) 游戏库扫描不得覆盖已有配置。改库扫描时读。
- [story-progress.md](story-progress.md) 回想、分支图、只读规则分析。改回想页读。
- [story-progress-v2.md](story-progress-v2.md)、[story-content-rating.md](story-content-rating.md) 回想后端 v2 与 CG 内容分级。
- [story-pimg.md](story-pimg.md)、[story-pimg-recipes.md](story-pimg-recipes.md) PIMG 图层渲染与存档门控配方。
- [torch-monument.md](torch-monument.md)、[torch-navigation.md](torch-navigation.md) 传火碑 3D 页面与导航。
- [seed-receipt-ui.md](seed-receipt-ui.md) 火种回执界面。
- 新手教程、设置、文库等页面暂无专门文档，直接读 `web/`。

## 服务器与官网

- [ADAPTER-PACKS.md](ADAPTER-PACKS.md) **[权威]** 探针、脱敏结构、适配包的上传规则。动任何上传或 relay 适配相关代码前读。
- [seed-admin-api.md](seed-admin-api.md)、[seed-admin-dashboard.md](seed-admin-dashboard.md) Seed 管理 API 与 relay 仪表盘。
- [enhanced-seed-queue.md](enhanced-seed-queue.md) Seed 审核队列与可信主机。
- [seed-malware-review.md](seed-malware-review.md) 新 Seed 发布的独立恶意检查。
- [seed-usage.md](seed-usage.md) 采用回执上报。
- [ordinary-seed.md](ordinary-seed.md) 校准结果自动共享。
- [novel-relay-proxy.md](novel-relay-proxy.md) 文库网文 relay 代理（方案，待决定）。
- [CODE-SIGNING.md](CODE-SIGNING.md) 代码签名策略（SignPath）。

## 适配与 The Seed

- [diff-layers.md](diff-layers.md) **[权威]** 分层差分与「当前权威接口」。修任何游戏问题前先判断放哪层。
- [auto-profile.md](auto-profile.md) 游戏差分全自动生成的最终模型。
- [cardinal.md](cardinal.md) **[权威]** 阅读层回放打分。
- [cardinal-trusted-runner.md](cardinal-trusted-runner.md)、[cardinal-live-acceptance.md](cardinal-live-acceptance.md)、[cardinal-session-identity.md](cardinal-session-identity.md)、[cardinal-auto-torch.md](cardinal-auto-torch.md) Cardinal 的运行器、实机验收、会话归属、自动接火。
- [cold-test.md](cold-test.md) 闲时冷测试（传火）的总设计。
- [seed-key-bootstrap.md](seed-key-bootstrap.md)、[seed-release-runner.md](seed-release-runner.md)、[torch-revocation-signing.md](torch-revocation-signing.md) 签名密钥、离线发布步骤、吊销签名。
- [runtime-dump-pack.md](runtime-dump-pack.md) 运行时转储冷包约定。
- [owner-tests.md](owner-tests.md)、[owner-private-steam.md](owner-private-steam.md)、[owner-publisher-launch.md](owner-publisher-launch.md) 店主私有测试入口。
- [rpgm-hide-proof.md](rpgm-hide-proof.md) 见上。

## 构建、CI、发版

- 构建与测试命令见 [dev-rules.md](dev-rules.md)；发版只由维护者执行。
- [force-update-1.4.23.md](force-update-1.4.23.md) 1.4.23 强制更新交付记录（一次性）。

## 安装器

- [installer-owner-test.md](installer-owner-test.md) 安装器隔离验收准备。
- [installer-runtime-finalize.md](installer-runtime-finalize.md) 隔离安装器运行组件收尾。
- [disc-install.md](disc-install.md)、[runtime-disc-pack/README.md](runtime-disc-pack/README.md) 光盘镜像安装后端与可选包。
- [yui.md](yui.md) Yui 启动诊断。

## 过时或重复的文档清单（只标记，未删除）

| 文档 | 状态 | 说明 |
|---|---|---|
| [engine-coverage.md](engine-coverage.md) | 可能过时 | 11-13 的普查，后续引擎已大量增加，以 `The Seed/` 和 HANDOFF「已适配」表为准 |
| [engine-draw-native.md](engine-draw-native.md)、[engine-draw-matrix.md](engine-draw-matrix.md) | 部分重复 | 同一天（11-21）的盘点，缺口方案与矩阵内容重叠，新协议以 engine-draw-protocol 为准 |
| [oss-survey.md](oss-survey.md) | 过时 | 11-14 的一次性调研 |
| [force-update-1.4.23.md](force-update-1.4.23.md) | 过时 | 一次性交付记录 |
| `third-party-*-*.md`（5 篇）和 `third-party/exhibit-stockhook.md` | 应并入 THIRD-PARTY.md | 各会话的来源补充，原意是由总指挥并入共享清单 |
| `re-*`、`engine-*` 的 2026-11-22 候选说明 | 候选，需核对 | 很多写着「默认关闭」「未接入」，当前是否已合入主线以代码为准 |
| [megulit-engine.md](megulit-engine.md) | 待核对 | 写「尚未接入应用」，可能已变化 |
| [cardinal-live-acceptance.md](cardinal-live-acceptance.md)、[cardinal-trusted-runner.md](cardinal-trusted-runner.md)、[enhanced-seed-queue.md](enhanced-seed-queue.md) | 与 cardinal.md 部分重复 | 候选交付细节，权威设计在 cardinal.md |
| [story-progress.md](story-progress.md) 与 [story-progress-v2.md](story-progress-v2.md) | 部分被取代 | v2 取消了图片评级模型，旧文中相关段落过时 |
| [installer-owner-test.md](installer-owner-test.md)、[installer-runtime-finalize.md](installer-runtime-finalize.md) | 一次性 | 「验收待定」状态记录 |
| [rpgm-hide-proof.md](rpgm-hide-proof.md) | 与 engine-rgss、rpgmv-* 部分重复 | 同一批 11-22 证据 |
