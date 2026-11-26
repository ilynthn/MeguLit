# issue 体系

> 这页回答：GitHub issue 怎么分类、四个汇总 issue 和 QQ 精华汇总各管什么、处理完怎么勾、怎么回复

## 汇总 issue（逐条勾选）

| issue | 标签 | 收什么 | 一行是什么 |
|---|---|---|---|
| #1199 `[适配探针] 汇总` | `adapter-probe` | 用户一键上传的适配探针 | 一部游戏一行；同一部的新探针并进它原来那行；按原因分节 |
| #1200 `[想玩] 汇总` | `game-request` | 「想玩」请求 | 一部游戏一行，括号里是人数和原请求；适配好一部勾一部 |
| #1203 `[诊断] 汇总` | `diagnostics` | 诊断包 | 一个包一行（下载链接 30 天有效） |
| #1204 `[Yui] 汇总` | `yui-report`、`diagnostics` | Yui 启动故障（`docs/yui.md`） | 一种故障一行，次数和最近阶段在原 issue 里持续更新 |
| #1248 `[QQ精华] 待处理汇总` | `qq-精华` | QQ 反馈群精华里还没处理的 | 一条精华一行，按功能请求 / 想玩 / 待确认 / 只有图片分节 |

前四个由 relay 自动维护（`relay/src/issue-trackers.js`）：每条仍先开一个详情 issue（key、下载链接、SHA-256 都留在那里），然后 relay 把它写成汇总里的一行勾选框，在详情 issue 评论「已登记到汇总 #N」并以 not planned 关闭。汇总正文里有标记 `<!-- tracker:<kind> -->`；写入有 D1 租约排队、写后回读校验，30 分钟 cron 重试失败项。**处理完一条就在汇总里勾一条**，不用去开关一堆 issue

## QQ 精华和 `qq-精华` 标签

- 维护者本机的同步脚本每小时跑一次：QQ 群精华消息 → GitHub issue（标签 `qq-精华`，截图传到仓库的 `qq-essence-assets` 分支嵌进 issue，不带昵称）
- 原 issue 关闭时：**只有关闭原因是「已完成」（completed）才取消群精华**；以 not planned 关闭（例如并进 #1248）的保留精华，等修好再说
- 所以 #1248 里某行修好后：勾掉那行，并把对应的原 issue 改成以 completed 关闭（重开再以「已完成」关），下一次同步就会取消群里的精华

## 回复和关闭

- 每条回复以 `【Bot回复】` 开头，惠惠口吻，温柔礼貌带颜文字
- 只关有证据（回放通过或实机确认）**且修复已在发布版里**的 issue；缺数据的请对方重发完整探针
- RRFZ 在修或修过的，直接回复指向他的 PR 并关闭
- 探针 step 为 `chinese-build`（检测到的是中文版）：不做适配，回一条说明（想要日文原版请重新探针）然后关闭
- 不外传用户邮箱、本机路径等隐私
- 游戏适配请求：先查引擎，能做的先做，实在需要文件才找用户要

## 相关代码 / 相关文档

- 代码：`relay/src/issue-trackers.js`、`relay/src/probe-issues.js`、`relay/src/game-requests.js`、`relay/src/yui.js`、`relay/src/feedback.js`、迁移 `relay/migrations/0041_*.sql`
- 文档：`docs/yui.md`、[relay.md](relay.md)、[workflow.md](workflow.md)
