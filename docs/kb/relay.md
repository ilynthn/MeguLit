# relay（Cloudflare Worker）

> 这页回答：服务端在哪、绑定了什么、每个源文件管什么、怎么部署

## 概况

- Worker 名 `megulit-relay`，入口 `relay/src/worker.js`，自定义域 api.megulit.com，不开 workers_dev（`relay/wrangler.toml`）
- 绑定：D1 `DB`（库 `megulit-relay`）、R2 `BUCKET`（`megulit-diagnostics`）、Workers AI、一组 ratelimit、Durable Object `SeedNotifications`
- cron：`0 16 * * SUN`、`*/30 * * * *`、`20 21 * * *`
- `[vars]` 只放公钥和阈值（例 `CARDINAL_VERIFY_VOTERS=3`、`CARDINAL_VERIFY_MEAN=0.9`、`CARDINAL_VERIFY_FLOOR=0.6`）；secret 只走 `wrangler secret put`，名字见 `relay/README.md`（值永远不进仓库）
- 迁移：`relay/migrations/` 0001–0041（0017、0018、0030、0031 各有两个同号文件）
- 另一个 Worker：`relay/scan-service/gateway/`（`megulit-ordinary-scan`）；`relay/scan-service/` 下是 Windows 扫描服务
- `relay/README.md` 开头写「Nothing is deployed yet」已过时：relay 已部署在用

## 命令（`relay/package.json`）

- `npm run dev`（wrangler dev）、`npm run deploy`、`npm run migrate`（`wrangler d1 migrations apply megulit-relay --remote`）
- 部署前确认是从最新 main 部署，曾有人从带旧代码的 main 部署把新版看板覆盖掉

## src 文件

| 文件 | 管什么 |
|---|---|
| `worker.js` | 路由总入口 |
| `auto-profile.js` | 游戏差分两层下发（`GET /api/game-profile`）、上报、签名文档发布 |
| `cardinal.js` | `POST /api/cardinal/score`，按票数升 verified / 进修复队列 |
| `probe-full.js` | 完整探针存 R2（分片上传） |
| `probe-issues.js`、`probe-seed.js` | 探针转 issue / 转种子草稿 |
| `probe-stats.js` | 公开只读统计 `GET /api/probe/stats`（在线人数等），配 `dashboard.js` 的看板页 |
| `adapters.js`、`contrib.js` | 适配包、贡献包 |
| `issue-trackers.js` | 探针 / 想玩 / 诊断 / Yui 汇总 issue，见 [issues.md](issues.md) |
| `yui.js` | Yui 启动故障汇总 |
| `game-requests.js` | 想玩请求 |
| `feedback.js` | 网站反馈转 issue |
| `accounts.js` | 邮箱验证码登录、云同步 |
| `social.js`、`forum.js`、`community.js` | 社交、论坛、头像与热词 |
| `daily.js` | 每日新闻和热词（日报） |
| `torch-release.js`、`torch-credit.js`、`torch-roster.js` | 传火发布、收据、名册 |
| `seed-*.js`、`enhanced-seed.js`、`ordinary-seed.js` | 种子管理、生命周期、恶意检查、通知、统计 |
| `update-policy.js` | 强制更新策略（目前休眠） |
| `validate.js` | 纯函数请求校验 |

## 相关代码 / 相关文档

- 代码：`relay/src/`、`relay/migrations/`、`relay/wrangler.toml`、`services/relay-*.cjs`、`services/auto-profile-feed.cjs`
- 文档：`relay/README.md`、`docs/diff-layers.md`、`docs/cardinal.md`、`docs/seed-admin-api.md`、`docs/seed-admin-dashboard.md`、`docs/seed-usage.md`
