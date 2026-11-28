# 文库网文：relay 只读抓取代理（方案，未部署）

状态：**等店主决定**。客户端已经留好这条线路（`services/novel/webnovel/fetch.cjs` 的 `RELAY`，`enabled: false`），在店主同意并部署之前不会发出任何请求。AGENTS.md 把「新的网络服务」列为须先取得维护者决定的事项，所以这里只写方案，不写 Worker 代码。

## 要解决的问题

成为小说家吧（syosetu.com）在国内连不上。不会配代理的用户点开文库的网文对照会直接失败。客户端现在按这个顺序试：用户填的 HTTP 代理 → 直连 → MeguLit relay → 第三方反代。只要后两条都没开，三条全不通时界面会列出每条线路的结果，并提示去填代理。

## 接口

```
GET https://api.megulit.com/novel/fetch?url=<encodeURIComponent(目标地址)>
```

- 只放行这些地址（白名单，用正则整串匹配）：
  - `https://ncode.syosetu.com/n\d{4}[a-z]{1,3}/(?:\d{1,6}/)?(?:\?p=\d{1,3})?`：目录和正文
  - `https://api.syosetu.com/novelapi/api/?...`：只允许 `out=json`，`of`、`word`、`ncode`、`lim≤20`、`order` 这几个参数
- 其他地址一律 403。不转发客户端的 Cookie 和请求头。Worker 自己发请求，带固定 UA `MeguLit relay (+https://megulit.com)`，以及 `Cookie: over18=yes`
- 只转 200 的 `text/html` 和 `application/json`，单个响应不超过 2 MB；其余状态码原样返回，正文清空
- 不转 linovelib：国内本来就能直连，没必要绕一圈

## 限速与缓存

- 对客户端：沿用 `RL_IP` 这类 ratelimit binding，新增 `RL_NOVEL`，每 IP 每 60 秒 30 次。超出返回 429，客户端遇到 429 会停下并提示「请求太频繁」，不会换线路硬闯
- 对 syosetu：全局限速。用 Durable Object 或 KV 的令牌桶，全站不超过每秒 1 次；排不上的直接 503，不排队
- 缓存：Cache API（`caches.default`），以规范化后的目标 URL 作键
  - 正文页：7 天
  - 目录页：1 小时
  - 搜索 API：10 分钟
- 客户端本地另有 30 天的正文缓存，同一话只会请求 relay 一次

## 风险与待确认

- **Workers 出口 IP 不在日本**。syosetu 有没有地区限制，这次没能实测（调研用的机器出口在大阪）。部署前要先从 Workers 拉一页确认能通
- **合规**：syosetu 的利用規約不允许以营利目的转载作品。relay 只做按需转发和短期缓存，不存档、不公开列表，只供 MeguLit 客户端用于阅读。请店主确认是否接受这一用法。必要时先向 syosetu 询问
- **成本**：按每位活跃读者每天 100 话估算，加上缓存命中，落在 Workers 免费额度（每天 10 万次请求）内。超出时 `RL_NOVEL` 会先挡住
- **滥用**：白名单只认 syosetu 的作品页，这个接口没法当通用代理用

## 第三方反代（Novelia）为什么没接

- Novelia（n.novelia.cc，原 books.fishhawk.top，开源项目 auto-novel/auto-novel，GPL-3.0）提供的不是 syosetu 反代。它有自己的服务端，抓取后存库，前端调用的是内部接口 `/api/novel/{provider}/{id}/chapter/{cid}`，返回它库里的原文和它自己的机翻
- 这个接口无需登录也能读，但有以下问题：
  - `robots.txt` 禁止首页以外的所有路径
  - 没有服务条款，也没有第三方使用说明
  - README 写明「不保证所有功能可用和前向兼容」
  - 域名已经换过两次
- 结论：技术上能用，但这算借用别人的内部接口，不是公开服务，也不稳定。没有对方书面同意，不接入。要接入的话，先在 auto-novel 仓库开 issue 征得同意，再把地址登记进 `fetch.cjs` 的 `MIRRORS`
