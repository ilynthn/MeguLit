// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-16 beta live-usage dashboard served by the relay (GET /dashboard). Polls /api/probe/stats on both relay nodes
   (CORS open) every 15 s, shows the first answer and each node's latency. Phone: https://cn-api.megulit.com/dashboard.
   2026-11-27 visual pass: the Megumin palette (wine-black, soft crimson, warm gold), rounded cards, smooth bar meters,
   zh / en switch (all text lives in dashboard-i18n.js). Data and endpoints are unchanged. */
import {SEED_ADMIN_HTML,SEED_ADMIN_SCRIPT} from './dashboard-seed-admin.js';
import {DASH_DICT,ADMIN_EN} from './dashboard-i18n.js';
const json=v=>JSON.stringify(v).replace(/</g,'\\u003c');
export const DASHBOARD_HTML=String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#1a0e12">
<title>MeguLit Live Ops</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;600&display=swap">

<style>
/* Palette: wine-black base, soft crimson primary, deep red accents, warm gold highlight, warm-white text.
   Body text >= 6:1 on the panels (WCAG AA); the coloured text tints (--red-t, --gold) are lightened so they stay readable. */
:root{--bg:#1a0e12;--bg2:#1f1217;--panel:#241318;--panel2:#2a171d;--field:#1e1116;--btn:#2d1a21;--btn-h:#38212a;
  --line:rgba(232,220,210,.09);--line2:rgba(232,220,210,.17);--fg:#e8dcd2;--hi:#f4eae1;--dim:#a8949a;--faint:#6d5961;
  --red:#c8323c;--red-t:#e8767f;--deep:#7e1426;--gold:#e2b25c;--gold-line:rgba(226,178,92,.38);--ok:#86bda3;--lav:#a99fd3;--sky:#82aac9;
  --sans:Inter,"Noto Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei UI",system-ui,-apple-system,"Segoe UI",sans-serif;
  --mono:"JetBrains Mono","Cascadia Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--r:14px;color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0}
html{scrollbar-color:rgba(232,220,210,.22) transparent;scrollbar-width:thin}
::-webkit-scrollbar{width:8px;height:8px;background:transparent}
::-webkit-scrollbar-thumb{background:rgba(232,220,210,.16);border-radius:8px}
::-webkit-scrollbar-thumb:hover{background:rgba(232,220,210,.28)}
body{background:var(--bg);background-image:radial-gradient(900px 420px at 12% -8%,rgba(200,50,60,.13),transparent 62%),radial-gradient(700px 360px at 95% 0,rgba(226,178,92,.06),transparent 60%);background-repeat:no-repeat;
  color:var(--fg);font-family:var(--sans);font-size:14px;line-height:1.6;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;
  padding:0 max(16px,env(safe-area-inset-right,0px)) 36px max(16px,env(safe-area-inset-left,0px));overflow-x:hidden}
a{color:inherit}
.r{color:var(--red-t)}.d{color:var(--dim)}.h{color:var(--hi)}.dd{color:var(--faint)}.g{color:var(--ok)}
.wrap{max-width:1680px;margin:0 auto}
:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:6px}

/* top bar */
.top{position:sticky;top:0;z-index:5;margin:0 -16px 20px;padding:12px 16px;background:rgba(26,14,18,.84);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.top-in{max-width:1680px;margin:0 auto;display:flex;align-items:center;gap:18px}
.brand{display:flex;align-items:center;gap:10px;font-weight:600;letter-spacing:.01em;color:var(--hi);white-space:nowrap}
.brand i{width:11px;height:11px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ee6f78,#c8323c 55%,#7e1426);box-shadow:0 0 14px rgba(200,50,60,.55)}
.brand small{color:var(--dim);font-weight:400;font-size:12px}
.nav{display:flex;gap:4px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}
.nav::-webkit-scrollbar{display:none}
.nav a{text-decoration:none;color:var(--dim);padding:5px 12px;border-radius:999px;font-size:13px;white-space:nowrap;transition:background .15s,color .15s}
.nav a:hover{background:rgba(232,220,210,.07);color:var(--hi)}
.nav a.on{background:rgba(200,50,60,.18);color:var(--hi)}
.nav a.gold{color:var(--gold)}
.top-r{display:flex;align-items:center;gap:12px;color:var(--dim);font-size:12px;white-space:nowrap}
.top-r .clk{font-family:var(--mono);color:var(--fg)}
.lang{display:inline-flex;padding:2px;border:1px solid var(--line2);border-radius:999px;background:var(--field)}
.lang button{font:inherit;font-size:12px;font-weight:500;color:var(--dim);background:transparent;border:0;border-radius:999px;padding:3px 12px;cursor:pointer;transition:background .15s,color .15s}
.lang button:hover{color:var(--hi)}
.lang button[aria-pressed="true"]{background:var(--red);color:#fff6f0}

/* sections + cards */
.ops-group{margin:0 0 30px;scroll-margin-top:76px}
.ops-group>h2{margin:0 0 14px;font-size:15px;font-weight:600;color:var(--hi);letter-spacing:.02em;display:flex;align-items:center;gap:10px}
.ops-group>h2::before{content:"";width:3px;height:14px;border-radius:2px;background:linear-gradient(180deg,var(--red),var(--deep))}
.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px}
.grid>.pane{grid-column:span 12;min-width:0}
@media(min-width:900px){.grid>.c3,.grid>.c4,.grid>.c6{grid-column:span 6}.grid>.c8,.grid>.c12{grid-column:span 12}}
@media(min-width:1400px){.grid>.c3{grid-column:span 3}.grid>.c4{grid-column:span 4}.grid>.c6{grid-column:span 6}.grid>.c8{grid-column:span 8}}
.pane{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px 16px;box-shadow:0 14px 34px -24px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.025)}
.ch{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--line)}
.ct{font-size:14px;font-weight:600;color:var(--hi);letter-spacing:.01em}
.chint{font-size:12px;color:var(--dim);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.pane.gold{border-color:var(--gold-line);background:linear-gradient(180deg,rgba(226,178,92,.05),transparent 120px),var(--panel);align-self:start}
.pane.gold .ct{color:var(--gold)}

/* numbers */
.v,.pc,.h,td.z,td.v,td.n,td.s,.seed-n,.cnt .v,.bignum,.chips b,.seed-u b{font-family:var(--mono);font-variant-numeric:tabular-nums}
.bignum{font-size:58px;line-height:1;font-weight:600;color:var(--hi);letter-spacing:-.02em;text-shadow:0 0 30px rgba(200,50,60,.4);min-width:2ch}
.bignum.hit{animation:hit .5s ease-out}
@keyframes hit{0%{color:var(--red-t);transform:translateY(-2px)}100%{color:var(--hi);transform:none}}
.on-row{display:flex;align-items:flex-end;gap:22px;flex-wrap:wrap;margin-bottom:4px}
.side{display:grid;grid-template-columns:auto auto;gap:2px 14px;font-size:12px;align-content:end}
.side .k,.kv .k,.m .k{color:var(--dim)}

/* charts */
.hist{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:3px;align-items:end;height:104px;border-bottom:1px solid var(--line);padding-top:4px}
.hist.h6{grid-template-columns:repeat(36,minmax(0,1fr));gap:2px;height:68px;margin-top:12px}
.hist i{display:block;min-height:2px;border-radius:3px 3px 1px 1px;background:linear-gradient(180deg,#d9444e,#7e1426);transition:filter .15s}
.hist i.z{background:rgba(232,220,210,.11)}
.hist i.now{background:linear-gradient(180deg,#f0c97a,#b98a3c)}
.hist i:hover{filter:brightness(1.25)}
.axis{display:flex;justify-content:space-between;color:var(--dim);font-size:11px;margin-top:4px}
.lat{height:34px;margin-bottom:8px}
.lat svg{display:block;width:100%;height:100%}
.lat .sa{fill:rgba(200,50,60,.16)}.lat .sl{fill:none;stroke:#d9444e;stroke-width:1.6;stroke-linejoin:round}
.trk{display:block;height:8px;border-radius:99px;background:rgba(232,220,210,.08);overflow:hidden;align-self:center}
.trk i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#9c2230,#c8323c 62%,#e0646c);transition:width .5s ease}
.gold .trk i{background:linear-gradient(90deg,#a97b2e,#e2b25c)}
.m.hot .trk i{background:linear-gradient(90deg,#c8323c,#f08088)}
.cap{color:var(--dim);font-size:12px;margin-top:8px}

/* rows */
.m{display:grid;grid-template-columns:8.8em minmax(0,1fr) auto;gap:12px;align-items:center;padding:4px 0}
.m .k{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m .bar{min-width:0;overflow:hidden;color:var(--dim);font-size:12px;white-space:nowrap;text-overflow:ellipsis}
.m .v{color:var(--hi);min-width:4ch;text-align:right}
.m.m4{grid-template-columns:8.8em minmax(0,1fr) auto 3.6ch}
.m .pc{color:var(--dim);text-align:right;font-size:11px}
.m.m5{grid-template-columns:9.6em minmax(0,1fr) 4.6ch 12ch;gap:8px}.m.m5 .pc{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m.hot .v{color:var(--red-t)}.m.hot .k{color:var(--hi)}
.sep{border-top:1px solid var(--line);margin:10px 0}
.sub{color:var(--dim);font-size:12px;margin-bottom:4px}
.kv{display:grid;grid-template-columns:minmax(7.5em,auto) 1fr;gap:3px 14px;font-size:13px}
.kv>span:nth-child(2n){text-align:right}
.cnt{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.cnt>div{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.cnt .v{font-size:24px;line-height:1.15;color:var(--hi);font-weight:500}.cnt .v.r{color:var(--red-t)}
.cnt .k{color:var(--dim);font-size:12px}
.seed-top{display:flex;align-items:flex-end;gap:14px;margin-bottom:12px}
.seed-n{font-size:42px;line-height:1;color:var(--gold);font-weight:600}
.seed-u{color:var(--dim);font-size:12px;line-height:1.45}.seed-u b{color:var(--hi);font-weight:500}
.m.seed-ok .v{color:var(--gold)}.m.seed-ok .k{color:var(--hi)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.chips span{border:1px solid var(--line2);color:var(--dim);font-size:12px;padding:1px 10px;border-radius:999px}
.chips b{color:var(--hi);font-weight:500;font-family:var(--mono)}
.chips.gold span{border-color:var(--gold-line)}.chips.gold b{color:var(--gold)}

/* tables */
.tw{overflow-x:auto;margin:0 -4px;padding:0 4px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{font-size:11px;letter-spacing:.04em;color:var(--dim);font-weight:500;text-align:left;padding:2px 8px 8px;border-bottom:1px solid var(--line2);white-space:nowrap}
th.rt,td.rt{text-align:right}
td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
tbody tr:last-child td{border-bottom:0}
td.n{color:var(--dim);width:3ch}td.v{color:var(--red-t);white-space:nowrap}
td.t{color:var(--hi);word-break:break-word}
td.s{color:var(--dim);white-space:nowrap;font-size:12px}
td.z{color:var(--fg);white-space:nowrap}
tbody tr:hover td{background:rgba(232,220,210,.035)}
.tag{color:#2a1410;background:var(--gold);font-size:10px;font-weight:600;padding:0 7px;margin-left:8px;border-radius:999px;vertical-align:1px}
.st{display:inline-block;font-size:11px;padding:0 9px;border:1px solid var(--line2);color:var(--dim);border-radius:999px}
.st.ready{border-color:rgba(232,118,127,.5);color:var(--red-t)}.st.uploading{border-color:var(--gold-line);color:var(--gold)}.st.done{border-color:rgba(134,189,163,.5);color:var(--ok)}
.empty{color:var(--dim);font-size:13px;padding:6px 0}
@media(max-width:520px){.hide-s{display:none}}

/* log */
.log{font-family:var(--mono);font-size:12px;max-height:22em;overflow:hidden;color:var(--fg)}
.log div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:1px 0}
.lv{display:inline-block;width:3.4ch;font-weight:500}.lv.i{color:var(--ok)}.lv.e{color:var(--red-t)}
.ms{color:var(--dim)}

/* status strip */
.vim{display:flex;align-items:center;gap:16px;margin-top:20px;padding:8px 14px;border:1px solid var(--line);border-radius:12px;background:var(--bg2);font-size:12px;color:var(--dim);white-space:nowrap;overflow:hidden}
.vim .md{display:inline-flex;align-items:center;gap:8px;color:var(--ok);font-weight:600;letter-spacing:.05em}
.vim .md::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor}
.vim .md.err{color:var(--red-t)}
.vim .sp{flex:1}
.vim #ep{font-family:var(--mono);overflow:hidden;text-overflow:ellipsis}
.vim #count{font-family:var(--mono);color:var(--fg)}

@media(max-width:760px){.top-r .clk,.brand small{display:none}.top-in{flex-wrap:wrap;gap:8px 12px}.nav{order:3;flex-basis:100%}.top-r{margin-left:auto}.bignum{font-size:48px}}
@media(max-width:520px){.vim #ep{display:none}.m,.m.m4{grid-template-columns:7em minmax(0,1fr) auto}.m.m4 .pc{display:none}
  .m.m5{grid-template-columns:7em minmax(0,1fr) 4.4ch}.m.m5 .pc{grid-column:1/-1;text-align:left;margin-top:-2px}.pane{padding:14px 14px}.ch{margin-bottom:10px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.admin-link{color:var(--gold)}.ops-admin{margin:24px 0 16px}#seed-admin{scroll-margin-top:76px}
</style>
</head>
<body>

<header class="top"><div class="top-in">
  <div class="brand"><i></i><span>MeguLit</span><small data-i18n="title">MeguLit 运行看板</small></div>
  <nav class="nav"><a class="on" href="#live" data-i18n="nav.live">服务概况</a><a href="#sharing" data-i18n="nav.sharing">校准与社区</a><a href="#operations" data-i18n="nav.ops">作品与运行记录</a><a class="gold" href="#seed-admin" data-i18n="nav.seed">Seed 管理</a></nav>
  <div class="top-r"><span id="host">relay</span><span class="clk" id="clock">--:--:--</span>
    <div class="lang" role="group" aria-label="切换语言" data-i18n-aria="lang.aria"><button type="button" data-lang="zh" aria-pressed="true">中</button><button type="button" data-lang="en" aria-pressed="false">EN</button></div></div>
</div></header>

<div class="wrap">
<section class="ops-group" id="live"><h2 data-i18n="h.live">服务概况</h2><div class="grid">
    <section class="pane c3">
      <header class="ch"><span class="ct" data-i18n="p.online">在线</span><span class="chint" data-i18n="p.online.h">近 10 分钟</span></header>
      <div class="on-row">
        <div class="bignum" id="big" role="img" aria-label="online">--</div>
        <div class="side">
          <span class="k" data-i18n="k.peak">峰值</span><span class="h" id="peak">--</span>
          <span class="k" data-i18n="k.delta">较上次</span><span id="delta">--</span>
          <span class="k" data-i18n="k.since">距上次变化</span><span class="d" id="since">--</span>
        </div>
      </div>
      <div class="hist h6" id="h6"></div>
      <div class="axis"><span>-6h</span><span>-3h</span><span data-i18n="now">现在</span></div>
      <div class="kv" style="margin-top:10px"><span class="k" data-i18n="k.now1h">当前 / 近 1 小时</span><span id="oNow">--</span><span class="k" data-i18n="k.avg6h">6 小时均值</span><span id="o6">--</span></div>
      <div id="spark" hidden></div><span id="ax0" hidden></span>
    </section>
    <section class="pane c3">
      <header class="ch"><span class="ct" data-i18n="p.stats">统计</span><span class="chint">/api/probe/stats</span></header>
      <div class="m"><span class="k" data-i18n="s.active1h">1 小时活跃</span><span class="bar" id="b1"></span><span class="v" id="v1">--</span></div>
      <div class="m"><span class="k" data-i18n="s.activeToday">今日活跃</span><span class="bar" id="b2"></span><span class="v" id="v2">--</span></div>
      <div class="m"><span class="k" data-i18n="s.active24h">24 小时活跃</span><span class="bar" id="bA24"></span><span class="v" id="vA24">--</span></div>
      <div class="m"><span class="k" data-i18n="s.peak10">10 分钟峰值</span><span class="bar"></span><span class="v" id="vP10">--</span></div>
      <div class="m"><span class="k" data-i18n="s.avgOnline">平均在线</span><span class="bar"><span class="d" data-i18n="s.perPlayer">每位玩家 · 今日</span></span><span class="v" id="vAvg">--</span></div>
      <div class="m"><span class="k" data-i18n="s.long">超 1 小时会话</span><span class="bar"><span class="d" data-i18n="s.today">今日</span></span><span class="v" id="vLong">--</span></div>
      <div class="sep"></div>
      <div class="m"><span class="k" data-i18n="s.probed">已探测作品</span><span class="bar" id="b3"></span><span class="v" id="v3">--</span></div>
      <div class="m"><span class="k" data-i18n="s.reporters">上报者</span><span class="bar"></span><span class="v" id="v4">--</span></div>
      <div class="m"><span class="k" data-i18n="s.perGame">每作品上报</span><span class="bar"></span><span class="v" id="v5">--</span></div>
    </section>
    <section class="pane c3">
      <header class="ch"><span class="ct" data-i18n="p.activity">活跃度</span><span class="chint" data-i18n="p.activity.h">每小时在线 · 24 小时</span></header>
      <div class="hist" id="hist"></div>
      <div class="axis"><span>-24h</span><span>-12h</span><span data-i18n="now">现在</span></div>
      <div class="kv" style="margin-top:12px"><span class="k" data-i18n="h.peakHour">峰值小时</span><span id="hPeak">--</span><span class="k" data-i18n="h.avgHour">小时均值</span><span id="hAvg">--</span><span class="k" data-i18n="h.quiet">空闲小时</span><span id="hZero">--</span><span class="k" data-i18n="h.thisHour">本小时</span><span id="hNow">--</span><span class="k" data-i18n="h.busy3">最忙 3 小时</span><span id="h3">--</span></div>
    </section>
    <section class="pane c3">
      <header class="ch"><span class="ct" data-i18n="p.quota">配额</span><span class="chint" data-i18n="p.quota.h">用量 / 上限</span></header>
      <div id="quota"><div class="empty" data-i18n="loading">加载中…</div></div>
    </section>
</div></section>
<section class="ops-group" id="sharing"><h2 data-i18n="h.sharing">校准与社区</h2><div class="grid">
    <section class="pane c3 gold">
      <header class="ch"><span class="ct" data-i18n="p.seed">The Seed</span><span class="chint" data-i18n="p.seed.h">适配差分库 · 作品差分</span></header>
      <div id="seed"><div class="empty" data-i18n="loading">加载中…</div></div>
    </section>
    <section class="pane c3 gold">
      <header class="ch"><span class="ct" data-i18n="p.cardinal">Cardinal</span><span class="chint" data-i18n="p.cardinal.h">回放评分 · 今日</span></header>
      <div id="cardinal"><div class="empty" data-i18n="loading">加载中…</div></div>
    </section>
    <section class="pane c3">
      <header class="ch"><span class="ct" data-i18n="p.why">原因</span><span class="chint" data-i18n="p.why.h">按步骤</span></header>
      <div id="steps"><div class="empty" data-i18n="nodata">暂无数据</div></div>
    </section>
    <section class="pane c3">
      <header class="ch"><span class="ct" data-i18n="p.adapters">适配</span><span class="chint" data-i18n="p.adapters.h">适配包 · 报告 · 上传</span></header>
      <div id="adp"><div class="empty" data-i18n="loading">加载中…</div></div>
    </section>
    <section class="pane c3">
      <header class="ch"><span class="ct" data-i18n="p.accounts">账号</span><span class="chint" data-i18n="p.accounts.h">登录 · 同步</span></header>
      <div id="acc"><div class="empty" data-i18n="loading">加载中…</div></div>
    </section>
    <section class="pane c3">
      <header class="ch"><span class="ct" data-i18n="p.community">社区</span><span class="chint" data-i18n="p.community.h">榜单 · 论坛 · 社交</span></header>
      <div id="com"><div class="empty" data-i18n="loading">加载中…</div></div>
    </section>
    <section class="pane c3">
      <header class="ch"><span class="ct" data-i18n="p.playing">正在玩</span><span class="chint" data-i18n="p.playing.h">榜单 · 近 7 日</span></header>
      <div id="playing"><div class="empty" data-i18n="loading">加载中…</div></div>
    </section>
    <section class="pane c3">
      <header class="ch"><span class="ct" data-i18n="p.stor">存储</span><span class="chint" data-i18n="p.stor.h">R2 · 进行中的上传</span></header>
      <div id="stor"><div class="empty" data-i18n="loading">加载中…</div></div>
    </section>
</div></section>
<section class="ops-group" id="operations"><h2 data-i18n="h.ops">作品与运行记录</h2><div class="grid">
    <section class="pane c8">
      <header class="ch"><span class="ct" data-i18n="p.targets">作品</span><span class="chint" data-i18n="p.targets.h">按上报者</span></header>
      <div id="top"><div class="empty" data-i18n="norows">暂无数据</div></div>
    </section>
    <section class="pane c4">
      <header class="ch"><span class="ct" data-i18n="p.most">最多阅读</span><span class="chint" data-i18n="p.most.h">按字数</span></header>
      <div id="most"><div class="empty" data-i18n="loading">加载中…</div></div>
    </section>
    <section class="pane c6">
      <header class="ch"><span class="ct" data-i18n="p.full">完整转储</span><span class="chint" data-i18n="p.full.h">r2://probe-full</span></header>
      <div class="cnt">
        <div><div class="v r" id="fReady">--</div><div class="k" data-i18n="f.ready">就绪</div></div>
        <div><div class="v" id="fUp">--</div><div class="k" data-i18n="f.uploading">上传中</div></div>
        <div><div class="v" id="fDone">--</div><div class="k" data-i18n="f.done">已完成</div></div>
      </div>
      <div class="m"><span class="k">R2</span><span class="bar" id="bR2"></span><span class="v" id="vR2">--</span></div>
      <div class="kv" style="margin-top:8px">
        <span class="k" data-i18n="f.stored">已存储</span><span id="fMB">--</span>
        <span class="k" data-i18n="f.avg">平均每份</span><span id="fAvg">--</span>
        <span class="k" data-i18n="f.last">最近上传</span><span id="fLast">--</span>
      </div>
    </section>
    <section class="pane c6">
      <header class="ch"><span class="ct" data-i18n="p.log">请求日志</span><span class="chint" id="latT" data-i18n="p.log.h">延迟</span></header>
      <div class="lat" id="lat"></div>
      <div class="log" id="log"></div>
    </section>
</div></section>
<div class="grid ops-admin">
    ${SEED_ADMIN_HTML}
</div>
  <div class="vim"><span class="md" id="mode">LIVE</span><span id="ep">GET /api/probe/stats</span><span id="code">--</span><span class="sp"></span><span id="extAt">ext --</span><span id="node">--</span><span id="pollT">poll 15s</span></div>
</div>

<script>
"use strict";
var D=${json(DASH_DICT)};
var ADMIN_EN=${json(ADMIN_EN)};
var NODES=[["cn-api","https://cn-api.megulit.com/api/probe/stats"],["api","https://api.megulit.com/api/probe/stats"]];
var PERIOD=15,HIST=60;
var $=function(id){return document.getElementById(id);};
var reduce=matchMedia("(prefers-reduced-motion:reduce)").matches;

/* ---- language: first visit follows the browser, then the saved choice wins ---- */
var LSK="ml-dash-lang",lang="zh";
function pickLang(){var s=null;try{s=localStorage.getItem(LSK);}catch(e){}
 if(s==="zh"||s==="en")return s;var n=(navigator.languages&&navigator.languages[0])||navigator.language||"en";return /^zh/i.test(n)?"zh":"en";}
function t(k,a,b){var e=D[k];if(!e)return k;return e[lang==="en"?1:0].replace("{0}",function(){return a;}).replace("{1}",function(){return b;});}
var AK=Object.keys(ADMIN_EN).sort(function(a,b){return b.length-a.length;});
/* the Seed admin client builds its text from Chinese fragments: exact match first, then longest-fragment substitution */
window.__t=function(s){if(lang!=="en"||typeof s!=="string")return s;if(Object.prototype.hasOwnProperty.call(ADMIN_EN,s))return ADMIN_EN[s];
 var o=s;for(var i=0;i<AK.length;i++){var k=AK[i];if(o.indexOf(k)>=0)o=o.split(k).join(ADMIN_EN[k]);}return o.replace(/ {2,}/g," ");};
function applyStatic(){
 Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"),function(e){e.textContent=t(e.getAttribute("data-i18n"));});
 Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-ph]"),function(e){e.setAttribute("placeholder",t(e.getAttribute("data-i18n-ph")));});
 Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-aria]"),function(e){e.setAttribute("aria-label",t(e.getAttribute("data-i18n-aria")));});
 var nt=document.querySelector('#seed-admin [data-admin="notice"]');
 if(nt&&(nt.textContent===D["a.notice0"][0]||nt.textContent===D["a.notice0"][1]))nt.textContent=t("a.notice0");
 document.title=t("title");}
function chrome(){$("mode").textContent=t(modeDown?"st.down":"st.link");$("pollT").textContent=t("foot.poll",PERIOD);
 $("extAt").textContent=lastExtAt?t("foot.ext",ago(lastExtAt)):t("foot.ext","--");}
var modeDown=false,lastExtAt=0;
function setLang(l,save){lang=l==="en"?"en":"zh";if(save){try{localStorage.setItem(LSK,lang);}catch(e){}}
 document.documentElement.lang=lang==="en"?"en":"zh-CN";
 Array.prototype.forEach.call(document.querySelectorAll(".lang button"),function(b){b.setAttribute("aria-pressed",String(b.getAttribute("data-lang")===lang));});
 applyStatic();chrome();
 if(last){try{render(last);}catch(e){}nodesLine();}
 if(typeof window.__adminRedraw==="function")window.__adminRedraw();}

function fmt(n){return (n==null||isNaN(n))?"--":String(n);}
function esc(s){return String(s).replace(/[&<>]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c];});}
function dur(s){if(s<60)return t("u.s",s);if(s<3600)return t("u.m",Math.floor(s/60));if(s<86400)return t("u.h",Math.floor(s/3600),Math.floor(s%3600/60));return t("u.d",Math.floor(s/86400));}
function ago(sec,bare){if(!sec)return "--";var d=dur(Math.max(0,Math.floor(Date.now()/1000-sec)));return bare?d:d+t("ago.suf");}
function mb(v){return v==null?"--":(v>=1024?(v/1024).toFixed(2)+" GB":v.toFixed(1)+" MB");}
function pad2(n){return String(n).padStart(2,"0");}

/* the big online number */
var shown="";
function setBig(v){var s=fmt(v),el=$("big");el.setAttribute("aria-label",s+" "+t("p.online"));if(s===shown){return;}shown=s;el.textContent=s;
 if(!reduce){el.classList.remove("hit");void el.offsetWidth;el.classList.add("hit");}}

/* bar meter: a rounded track with a gradient fill */
function meter(el,v,max){if(!el)return;var p=max>0?Math.min(100,Math.max(0,(Number(v)||0)/max*100)):0;
 el.className="bar trk";el.innerHTML='<i style="width:'+p.toFixed(1)+'%"></i>';}

/* sparklines from this viewer's own samples */
function load(k){try{return JSON.parse(localStorage.getItem(k)||"[]").filter(function(p){return Date.now()-p[0]<HIST*PERIOD*1000;});}catch(e){return [];}}
function keep(k,a){try{localStorage.setItem(k,JSON.stringify(a));}catch(e){}}
var hist=load("ml-online-hist"),lath=load("ml-lat-hist");
function sparkSvg(vals){var n=vals.length;if(n<2)return '<svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"></svg>';
 var mx=Math.max(1,Math.max.apply(null,vals)),pts=vals.map(function(v,i){return (i/(n-1)*100).toFixed(2)+","+(22-Math.max(0,v)/mx*19).toFixed(2);}).join(" ");
 return '<svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><polygon class="sa" points="0,24 '+pts+' 100,24"/><polyline class="sl" vector-effect="non-scaling-stroke" points="'+pts+'"/></svg>';}
function spark(){$("lat").innerHTML=sparkSvg(lath.map(function(p){return p[1];}));}

function renderSteps(list,j){var w=$("steps");j=j||{};var html="",mx=0;
 if(list&&list.length){mx=Math.max.apply(null,list.map(function(s){return s.n;}));var tot=list.reduce(function(a,s){return a+s.n;},0);
  html+=list.map(function(s,i){return '<div class="m m4"><span class="k" title="'+esc(s.step)+'">'+esc(s.step)+'</span><span class="bar" id="sb'+i+'"></span><span class="v">'+s.n+'</span><span class="pc">'+Math.round(s.n/tot*100)+'%</span></div>';}).join("");}
 else html+='<div class="empty">'+t("nodata")+'</div>';
 var ps=j.probeStates||[],pt=ps.reduce(function(a,s){return a+s.n;},0);
 if(ps.length){html+='<div class="sep"></div><div class="sub">'+t("why.quality")+' <span class="dd">'+t("why.desens",pt)+'</span></div>'+
  ps.map(function(s,i){return '<div class="m m4"><span class="k">'+esc(s.state)+'</span><span class="bar" id="qb'+i+'"></span><span class="v">'+s.n+'</span><span class="pc">'+Math.round(s.n/Math.max(1,pt)*100)+'%</span></div>';}).join("");}
 var f=j.full||{},fg=f.games|0;
 html+='<div class="sep"></div><div class="kv">'+
  '<span class="k">'+t("why.vndb")+'</span><span><span class="h">'+fmt(j.vndbMatched)+'</span><span class="d"> / '+fmt(j.probedGames)+'</span></span>'+
  '<span class="k">'+t("why.issues")+'</span><span class="h">'+fmt(j.issues)+'</span>'+
  '<span class="k">'+t("why.adapted")+'</span><span><span class="h">'+(f.done|0)+'</span><span class="d">'+t("why.dumps",fg,fg?Math.round((f.done|0)/fg*100):0)+'</span></span></div>';
 w.innerHTML=html;
 (list||[]).forEach(function(s,i){meter($("sb"+i),s.n,mx);});
 ps.forEach(function(s,i){meter($("qb"+i),s.n,Math.max.apply(null,ps.map(function(x){return x.n;})));});}
/* ---- wide aggregates (relay ext, refreshed every 5 min server side) ---- */
function K(n){n=Number(n)||0;return n>=1e9?(n/1e9).toFixed(2)+"B":n>=1e6?(n/1e6).toFixed(2)+"M":n>=1e4?(n/1e3).toFixed(1)+"k":String(n);}
function H(sec){var h=(Number(sec)||0)/3600;return h>=100?Math.round(h)+"h":h.toFixed(1)+"h";}
function kvs(rows){return '<div class="kv">'+rows.map(function(r){return '<span class="k">'+r[0]+'</span><span>'+r[1]+'</span>';}).join("")+'</div>';}
function hv(v){return '<span class="h">'+v+'</span>';}
function p7(n){return n?' <span class="r">+'+K(n)+'</span><span class="d">'+t("d7")+'</span>':' <span class="d">+0'+t("d7")+'</span>';}
var barQ=[];
function bars(list,lab,id){if(!list||!list.length)return "";var tot=list.reduce(function(a,s){return a+(s.n|0);},0),mx=Math.max.apply(null,list.map(function(s){return s.n|0;}));
 return list.map(function(s,i){barQ.push([id+i,s.n|0,mx]);return '<div class="m m4"><span class="k">'+esc(s[lab])+'</span><span class="bar" id="'+id+i+'"></span><span class="v">'+K(s.n)+'</span><span class="pc">'+Math.round((s.n|0)/Math.max(1,tot)*100)+'%</span></div>';}).join("");}
function flushBars(){barQ.forEach(function(q){var el=$(q[0]);if(el)meter(el,q[1],q[2]);});barQ=[];}
function sub(x){return '<div class="sep"></div><div class="sub">'+x+'</div>';}
function renderExt(x){if(!x)return;barQ=[];
 var hs=x.hourly||[],mx=Math.max(1,Math.max.apply(null,hs.map(function(h){return h.n;}).concat([0]))),pk=null,sum=0,zero=0;
 $("hist").innerHTML=hs.map(function(h,i){sum+=h.n;if(!h.n)zero++;if(!pk||h.n>pk.n)pk=h;var d=new Date(h.at*1000),lab=pad2(d.getHours())+":00 · "+h.n;
  return '<i class="'+(h.n?"":"z ")+(i===hs.length-1?"now":"")+'" style="height:'+(h.n?Math.max(6,Math.round(h.n/mx*100)):2)+'%" title="'+lab+'"></i>';}).join("");
 $("hPeak").innerHTML=pk&&pk.n?hv(pk.n)+' <span class="d">'+t("h.at",pad2(new Date(pk.at*1000).getHours())+':00')+'</span>':"--";
 $("hAvg").innerHTML=hs.length?hv((sum/hs.length).toFixed(1)):"--";$("hZero").innerHTML=hv(zero)+'<span class="d"> / 24</span>';
 var a=x.accounts||{},s=x.sync||{};
 $("acc").innerHTML=kvs([[t("ac.total"),hv(K(a.total))+p7(a.new7d)],[t("ac.login7"),hv(K(a.active7d))],[t("ac.sessions"),hv(K(a.sessions))],[t("ac.records"),hv(K(s.records))],[t("ac.users"),hv(K(s.accounts))]])+
  (s.kinds&&s.kinds.length?sub(t("ac.byKind"))+bars(s.kinds,"kind","sk"):"");
 var l=x.leaderboard||{},f=x.forum||{},so=x.social||{},lk=x.lookups||{};
 $("com").innerHTML=kvs([[t("c.boardUsers"),hv(K(l.users))+' <span class="d">'+t("c.share",K(l.sharing))+'</span>'],[t("c.boardActive"),hv(K(l.active7d))+'<span class="d">'+t("d7")+'</span>'],
  [t("c.chars"),hv(K(l.characters))],[t("c.time"),hv(H(l.seconds))],[t("c.games"),hv(K(l.games))]])+
  sub(t("c.forum"))+kvs([[t("c.posts"),hv(K(f.posts))+p7(f.posts7d)],[t("c.replies"),hv(K(f.replies))+p7(f.replies7d)],[t("c.authors"),hv(K(f.authors))]])+
  (f.tags&&f.tags.length?'<div class="chips">'+f.tags.map(function(g){return '<span>'+esc(g.tag)+' <b>'+g.n+'</b></span>';}).join("")+'</div>':"")+
  sub(t("c.social"))+kvs([[t("c.profiles"),hv(K(so.profiles))+' <span class="d">'+t("c.public",K(so.public))+'</span>'],[t("c.follows"),hv(K(so.follows))],
   [t("c.lookups"),hv(K(lk.count))+' <span class="d">'+t("c.lookupsv",K(lk.terms),K(lk.users))+'</span>']])+
  ((x.avatars||[]).length?'<div class="chips">'+x.avatars.map(function(v){return '<span>'+t("c.avatar",esc(v.status))+' <b>'+v.n+'</b></span>';}).join("")+'</div>':"");
 var mr=x.mostRead||[];
 $("most").innerHTML=mr.length?'<div class="tw"><table><thead><tr><th>#</th><th>'+t("t.title")+'</th><th class="rt">'+t("t.ppl")+'</th><th class="rt">'+t("t.chars")+'</th><th class="rt hide-s">'+t("t.time")+'</th></tr></thead><tbody>'+mr.map(function(g,i){
  return '<tr><td class="n">'+(i+1)+'</td><td class="t">'+esc(g.title)+'</td><td class="z rt">'+g.readers+'</td><td class="v rt">'+K(g.characters)+'</td><td class="s rt hide-s">'+H(g.seconds)+'</td></tr>';}).join("")+'</tbody></table></div>':'<div class="empty">'+t("norows")+'</div>';
 var ad=x.adapters||{},dg=x.diagnostics||{},bd=x.bundles||{};
 $("adp").innerHTML=kvs([[t("a.packs"),hv(K(ad.packs))+' <span class="d">'+t("a.packsv",K(ad.ids),K(ad.withdrawn))+'</span>'],[t("a.records"),hv(K(ad.records))+p7(ad.records7d)],
  [t("a.recReports"),hv(K(ad.recordReports))],[t("a.probeReq"),hv(K(ad.openRequests))+' <span class="d">'+t("a.probeReqv",K(ad.requests))+'</span>']])+
  ((ad.reports||[]).length?sub(t("a.packReports"))+bars(ad.reports,"state","pr"):"")+
  ((x.contrib||[]).length?sub(t("a.contrib"))+bars(x.contrib,"state","cu"):"")+
  sub(t("a.uploads"))+kvs([[t("a.diag"),hv(K(dg.total))+p7(dg.n7d)+' <span class="d">'+mb(dg.mb||0)+'</span>'],[t("a.diagIssues"),hv(K(dg.issues))],[t("a.bundles"),hv(K(bd.total))+p7(bd.n7d)+' <span class="d">'+mb(bd.mb||0)+'</span>']]);
 flushBars();
 lastExtAt=x.at;$("extAt").textContent=t("foot.ext",ago(x.at));}
function renderStorage(j){var f=j.full||{},x=j.ext||{},el=$("stor");if(!el)return;barQ=[];var html="";
 var bdm=(x.bundles||{}).mb||0,dgm=(x.diagnostics||{}).mb||0,cum=(x.contrib||[]).reduce(function(a,c){return a+(c.mb||0);},0),tot=(f.storedMB||0)+bdm+dgm+cum;
 html+='<div class="m"><span class="k">'+t("st.r2used")+'</span><span class="bar" id="fr2"></span><span class="v">'+(tot/10240*100).toFixed(1)+'%</span></div>'+
  kvs([[t("st.dumps"),hv(mb(f.storedMB||0))],[t("st.contrib"),hv(mb(cum))],[t("st.bundles"),hv(mb(bdm))],[t("st.diag"),hv(mb(dgm))],[t("st.total"),hv(mb(tot))+'<span class="d">'+t("st.free")+'</span>']]);
 barQ.push(["fr2",tot,10240]);
 var fl=f.inflight||[];html+=sub(t("st.inflight"));
 if(fl.length)fl.forEach(function(u,i){barQ.push(["fi"+i,u.pct,100]);
  html+='<div class="m m4"><span class="k" title="'+esc(u.title)+'">'+esc(u.title)+'</span><span class="bar" id="fi'+i+'"></span><span class="v">'+u.pct+'%</span><span class="pc">'+u.got+'/'+u.parts+'</span></div>'+
   '<div class="sub" style="margin:-2px 0 4px">'+mb(u.mb)+t("st.lastpart",ago(u.at))+'</div>';});
 else html+='<div class="empty">'+t("idle")+'</div>';
 if((f.apps||[]).length)html+=sub(t("st.byapp"))+bars(f.apps,"app","fa");
 el.innerHTML=html;flushBars();}
function renderPlaying(list){var w=$("playing");
 if(!list||!list.length){w.innerHTML='<div class="empty">'+t("playing.none")+'</div>';return;}
 w.innerHTML='<div class="tw"><table><thead><tr><th>'+t("t.seen")+'</th><th>'+t("t.title")+'</th><th class="rt">'+t("t.ppl")+'</th><th class="rt">'+t("t.chars")+'</th></tr></thead><tbody>'+list.map(function(g){
  return '<tr><td class="s">'+ago(g.at,true)+'</td><td class="t">'+esc(g.title)+'</td><td class="z rt">'+g.readers+'</td><td class="v rt">'+K(g.characters)+'</td></tr>';}).join("")+'</tbody></table></div>';}
/* ---- quota: usage against the free plans, with reset times ---- */
function bshort(b){b=Number(b)||0;return b>=1073741824?(b/1073741824).toFixed(b>=10737418240?0:1)+'G':b>=1048576?Math.round(b/1048576)+'M':Math.round(b/1024)+'K';}
function renderQuota(j){var el=$("quota");if(!el)return;var q=j.quota||{},it=q.items||{},L=q.limits||{},f=j.full||{},x=j.ext||{};barQ=[];
 var r2est=(((f.storedMB||0)+((x.bundles||{}).mb||0)+((x.diagnostics||{}).mb||0)+(x.contrib||[]).reduce(function(a,c){return a+(c.mb||0);},0))*1048576);
 var rows=[
  ["q.workers","day",it.workersReq,L.workersReq,K],
  ["q.d1r","day",it.d1Read,L.d1Read,K],
  ["q.d1w","day",it.d1Write,L.d1Write,K],
  ["q.d1s","",it.d1Bytes,L.d1Bytes,bshort],
  ["q.r2s",it.r2Bytes!=null?"":"est",it.r2Bytes!=null?it.r2Bytes:r2est,L.r2Bytes,bshort],
  ["q.r2a","mo",it.r2A,L.r2A,K],
  ["q.r2b","mo",it.r2B,L.r2B,K],
  ["q.ai","day",it.aiNeurons,L.aiNeurons,K],
  ["q.gh","hr",it.ghUsed,it.ghLimit||5000,K]];
 var per={day:"q.day",mo:"q.mo",hr:"q.hr","":"q.total",est:"q.est"};
 var html=rows.map(function(r,i){var has=r[2]!=null&&!isNaN(r[2]),pct=has&&r[3]?r[2]/r[3]*100:0;if(has)barQ.push(["qb"+i,r[2],r[3]]);
  return '<div class="m m5'+(pct>=80?' hot':'')+'"><span class="k" title="'+t(per[r[1]])+'">'+t(r[0])+'</span><span class="bar" id="qb'+i+'"></span>'+
   '<span class="v">'+(has?(pct<10?pct.toFixed(1):Math.round(pct))+'%':'--')+'</span><span class="pc">'+(has?r[4](r[2])+'/'+r[4](r[3]):'')+'</span></div>';}).join("");
 var now=new Date(),utc0=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)),left=Math.max(0,Math.round((utc0-now)/60000));
 html+='<div class="sub" style="margin-top:8px">'+t("q.reset",Math.floor(left/60),pad2(left%60))+'</div>';
 if(!q.token)html+='<div class="sub"><span class="r">'+t("q.offline")+'</span>'+t("q.needs")+'</div>';
 var errs=Object.keys(q.errors||{});if(errs.length)html+='<div class="sub">'+errs.map(function(k){return '<span class="r">'+esc(k)+'</span> '+esc(q.errors[k]);}).join(" · ")+'</div>';
 el.innerHTML=html;flushBars();}
function renderRow1(j){
 var se=j.series||[],mx=Math.max(1,Math.max.apply(null,se.map(function(p){return p.n;}).concat([0]))),sum=0;
 $("h6").innerHTML=se.map(function(p,i){sum+=p.n;var d=new Date(p.at*1000);return '<i class="'+(p.n?"":"z ")+(i===se.length-1?"now":"")+'" style="height:'+(p.n?Math.max(8,Math.round(p.n/mx*100)):3)+'%" title="'+pad2(d.getHours())+':'+pad2(d.getMinutes())+' · '+p.n+'"></i>';}).join("");
 $("oNow").innerHTML=hv(fmt(j.online))+'<span class="d"> / '+fmt(j.active1h)+'</span>';$("o6").innerHTML=hv(se.length?(sum/se.length).toFixed(1):"--")+'<span class="d">'+t("u.per10")+'</span>';
 meter($("bA24"),j.active24h,Math.max(j.active24h|0,j.today|0,1));$("vA24").textContent=fmt(j.active24h);
 $("vP10").textContent=fmt(j.peak10);$("vAvg").textContent=j.avgMinToday!=null?(j.avgMinToday>=60?Math.floor(j.avgMinToday/60)+"h"+pad2(j.avgMinToday%60):j.avgMinToday+"m"):"--";$("vLong").textContent=fmt(j.longToday);
 var hs=(j.ext||{}).hourly||[];if(hs.length){var last2=hs[hs.length-1].n,avg=hs.reduce(function(a,h){return a+h.n;},0)/hs.length,best=0,bi=0;
  for(var i=0;i+3<=hs.length;i++){var w=hs[i].n+hs[i+1].n+hs[i+2].n;if(w>best){best=w;bi=i;}}
  $("hNow").innerHTML=hv(last2)+' <span class="'+(last2>=avg?"r":"d")+'">'+(last2>=avg?"▲":"▼")+' '+t("h.vsAvg",avg.toFixed(1))+'</span>';
  $("h3").innerHTML=best?hv(best)+' <span class="d">'+pad2(new Date(hs[bi].at*1000).getHours())+':00–'+pad2((new Date(hs[bi].at*1000).getHours()+3)%24)+':00</span>':"--";}}
function stateTag(s){return '<span class="st '+esc(s)+'">'+esc(s||"-")+'</span>';}
function renderTop(list){var w=$("top");
 if(!list||!list.length){w.innerHTML='<div class="empty">'+t("norows")+'</div>';return;}
 w.innerHTML='<div class="tw"><table><thead><tr><th>#</th><th>'+t("t.title")+'</th><th class="hide-s">'+t("t.why")+'</th><th class="rt hide-s">'+t("t.size")+'</th><th>'+t("t.state")+'</th><th class="rt">'+t("t.ppl")+'</th></tr></thead><tbody>'+list.map(function(g,i){
  return '<tr><td class="n">'+(i+1)+'</td><td class="t">'+esc(g.title)+(g.full?'<span class="tag">'+t("t.full")+'</span>':'')+'</td><td class="s hide-s">'+esc(g.step||"-")+'</td><td class="z rt hide-s">'+(g.mb!=null?mb(g.mb):"-")+'</td><td>'+stateTag(g.state)+'</td><td class="v rt">'+fmt(g.reporters)+'</td></tr>';}).join("")+'</tbody></table></div>';}

var logs=[];
function log(level,msg){logs.unshift('<div><span class="d">'+new Date().toTimeString().slice(0,8)+'</span> <span class="lv '+(level==="ERR"?"e":"i")+'">'+level+'</span> '+msg+'</div>');logs=logs.slice(0,14);$("log").innerHTML=logs.join("");}

/* both relay nodes are hit every poll; the first good answer is shown, each node's latency is kept */
var lat={};
function poll(){var t0=performance.now();
 var reqs=NODES.map(function(n){var ac=window.AbortController?new AbortController():null;if(ac)setTimeout(function(){ac.abort();},12000);return fetch(n[1],{cache:"no-store",signal:ac?ac.signal:undefined}).then(function(r){var ms=Math.round(performance.now()-t0);lat[n[0]]=r.ok?ms:-1;if(!r.ok)throw 0;
  return r.json().then(function(j){j.__node=n[0];j.__ms=ms;j.__code=r.status;return j;});},function(e){lat[n[0]]=-1;throw e;});});
 return {first:Promise.any(reqs),all:Promise.allSettled(reqs)};}
var prev=null,peak=0,since=Date.now(),last=null;
function apply(j){
 var on=j.online|0;hist.push([Date.now(),on]);hist=hist.slice(-HIST);keep("ml-online-hist",hist);
 lath.push([Date.now(),j.__ms]);lath=lath.slice(-HIST);keep("ml-lat-hist",lath);
 peak=Math.max(peak,Math.max.apply(null,hist.map(function(p){return p[1];})));
 if(prev!=null){var d=on-prev;$("delta").innerHTML=d>0?'<span class="r">+'+d+'</span>':d<0?'<span class="r">'+d+'</span>':'<span class="d">0</span>';if(d!==0)since=Date.now();}
 else $("delta").innerHTML='<span class="d">0</span>';
 prev=on;setBig(on);$("peak").textContent=peak;last=j;render(j);
 $("host").textContent="relay · "+j.__node;$("code").textContent=j.__code+" · "+j.__ms+"ms";modeDown=false;$("mode").className="md";chrome();
 log("INF",'GET /api/probe/stats <span class="h">'+j.__code+'</span> <span class="ms">'+j.__ms+'ms '+j.__node+'</span> online=<span class="r">'+on+'</span> 1h='+j.active1h+' ready='+((j.full||{}).ready|0));}
/* 2026-11-21 one panel throwing (e.g. a negative size) used to abort render() and was reported as "failed on every
   node"; now each panel draws on its own and a broken one logs "ERR render <panel>" while the others keep updating */
var badPanels={};
function safe(name,fn){try{fn();if(badPanels[name]){delete badPanels[name];log("INF",t("log.renderOk",esc(name)));}}catch(e){if(!badPanels[name])log("ERR",t("log.render",esc(name),esc(String(e&&e.message||e).slice(0,80))));badPanels[name]=1;}}
function render(j){safe("spark",spark);safe("stats",function(){renderStats(j);});safe("seed",function(){renderSeed(j.seed);});safe("cardinal",function(){renderCardinal(j.cardinal);});safe("probe packs",function(){renderPacks(j);});
 safe("why",function(){renderSteps(j.steps,j);});safe("targets",function(){renderTop(j.top);});safe("now playing",function(){renderPlaying(j.playing);});
 safe("ext",function(){renderExt(j.ext);});safe("storage",function(){renderStorage(j);});safe("quota",function(){renderQuota(j);});safe("online",function(){renderRow1(j);});
 var er=j.errors||{};Object.keys(er).forEach(function(k){log("ERR",t("log.server",esc(k),esc(er[k])));});
 if(!j.ext)["acc","com","most","adp"].forEach(function(id){$(id).innerHTML='<div class="empty"><span class="r">'+t("log.agg",PERIOD)+'</span></div>';});}
function renderStats(j){
 var today=Math.max(j.today|0,1);
 meter($("b1"),j.active1h,today);$("v1").textContent=fmt(j.active1h);
 $("b2").className="bar";$("b2").innerHTML='<span class="d">'+t("s.ratio",j.today?Math.round((j.active1h|0)/j.today*100):0)+'</span>';$("v2").textContent=fmt(j.today);
 var f=j.full||{};
 $("b3").className="bar";$("b3").innerHTML='<span class="d">'+t("s.withDump",f.games|0)+'</span>';$("v3").textContent=fmt(j.probedGames);
 $("v4").textContent=fmt(j.reporters);$("v5").textContent=j.probedGames?(j.reporters/j.probedGames).toFixed(2):"--";}
function renderPacks(j){var f=j.full||{};
 $("fReady").textContent=fmt(f.ready);$("fUp").textContent=fmt(f.uploading);$("fDone").textContent=fmt(f.done);
 meter($("bR2"),f.storedMB||0,f.limitMB||8192);$("vR2").textContent=((f.storedMB||0)/(f.limitMB||8192)*100).toFixed(1)+"%";
 $("fMB").innerHTML=mb(f.storedMB||0)+' <span class="d">/ '+mb(f.limitMB||8192)+'</span>';
 $("fAvg").textContent=f.ready?mb((f.storedMB||0)/f.ready):"--";$("fLast").textContent=ago(f.lastAt);}
/* THE SEED: games + versions, confirmed (verified / owner-ok) vs waiting for more players (skeleton / read) */
function renderSeed(s){var el=$("seed"),se=(s&&s.errors)||{},errH=Object.keys(se).map(function(k){return '<div class="sub"><span class="r">'+esc(k)+'</span> '+esc(se[k])+'</div>';}).join("");
 if(!s||!s.sources||!s.sources.length){el.innerHTML='<div class="empty">'+t("seed.counting")+'</div>'+errH;return;}
 var st=s.status||{},tot=Math.max(1,s.games|0),ok=s.confirmed|0,wait=s.waiting|0;
 var html='<div class="seed-top"><span class="seed-n">'+(s.games|0)+'</span><span class="seed-u">'+t("seed.games")+'<br><b>'+(s.versions|0)+'</b> '+t("seed.versions")+'</span></div>'+
  '<div class="m m4 seed-ok"><span class="k">'+t("seed.confirmed")+'</span><span class="bar" id="sdOk"></span><span class="v">'+ok+'</span><span class="pc">'+Math.round(ok/tot*100)+'%</span></div>'+
  '<div class="m m4"><span class="k">'+t("seed.waiting")+'</span><span class="bar" id="sdWait"></span><span class="v">'+wait+'</span><span class="pc">'+Math.round(wait/tot*100)+'%</span></div>'+
  '<div class="chips gold">'+[["seed.verified",st.verified],["seed.ownerok",st["owner-ok"]],["seed.read",st.read],["seed.skeleton",st.skeleton]].map(function(c){return '<span>'+t(c[0])+' <b>'+(c[1]|0)+'</b></span>';}).join("")+
  (s.other?'<span>'+t("seed.other")+' <b>'+s.other+'</b></span>':'')+'</div>'+
  '<div class="sub" style="margin-top:10px">'+t("seed.note")+'</div>'+
  '<div class="sub">'+s.sources.map(function(x){return esc(x.source)+' '+x.games;}).join(" · ")+t("seed.updated",ago(s.at))+'</div>'+errH;
 el.innerHTML=html;meter($("sdOk"),ok,tot);meter($("sdWait"),wait,tot);}
/* CARDINAL: the replay scores players send up: today's score count, auto diffs upgraded to verified, diffs sent to the repair queue */
function renderCardinal(c){var el=$("cardinal");
 if(!c||!c.today){el.innerHTML='<div class="empty">'+t("card.none")+'</div>';return;}
 var td=c.today,a=c.total||{};
 el.innerHTML='<div class="seed-top"><span class="seed-n">'+(td.scores|0)+'</span><span class="seed-u">'+t("card.scores")+'<br><b>'+t("card.total",a.scores|0)+'</b></span></div>'+
  '<div class="chips gold"><span>'+t("card.upgraded","<b>"+(td.upgraded|0)+"</b>")+'</span><span>'+t("card.repair","<b>"+(td.repair|0)+"</b>")+'</span></div>'+
  '<div class="sub" style="margin-top:10px">'+t("card.note","<b>"+(a.verified|0)+"</b>","<b>"+(a.repair|0)+"</b>")+'</div>';}
function nodesLine(){$("node").innerHTML=NODES.map(function(n){var v=lat[n[0]];return n[0]+" "+(v==null?"--":v<0?'<span class="r">down</span>':v+"ms");}).join(" · ");
 var ok=NODES.filter(function(n){return lat[n[0]]>0;}).map(function(n){return lat[n[0]];});$("latT").textContent=ok.length?t("log.lat",Math.min.apply(null,ok)):t("p.log.h");}
function tick(){var p=poll();p.first.then(function(j){try{apply(j);}catch(e){log("ERR","render: "+esc(String(e&&e.message||e).slice(0,80)));}},function(){modeDown=true;$("mode").className="md err";$("code").textContent=t("st.timeout");chrome();log("ERR","GET /api/probe/stats "+t("log.failed",PERIOD));});p.all.then(nodesLine);}
addEventListener("resize",function(){if(last)try{render(last);}catch(e){}});

function start(){var left=PERIOD;
 setInterval(function(){$("clock").textContent=new Date().toTimeString().slice(0,8);$("since").textContent=Math.floor((Date.now()-since)/1000)+"s";
  if(last)$("fLast").textContent=ago((last.full||{}).lastAt);
  if(--left<=0){left=PERIOD;tick();}},1000);
 setBig("--");spark();log("INF",t("log.attached"));tick();}
Array.prototype.forEach.call(document.querySelectorAll(".lang button"),function(b){b.addEventListener("click",function(){setLang(b.getAttribute("data-lang"),true);});});
/* highlight the nav entry whose section is on screen */
(function(){var links=Array.prototype.slice.call(document.querySelectorAll(".nav a"));if(!window.IntersectionObserver)return;
 var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){links.forEach(function(a){a.classList.toggle("on",a.getAttribute("href")==="#"+e.target.id);});}});},{rootMargin:"-30% 0px -60% 0px"});
 ["live","sharing","operations","seed-admin"].forEach(function(id){var s=$(id);if(s)io.observe(s);});})();
setLang(pickLang(),false);
start();
</script>

<script>${SEED_ADMIN_SCRIPT}</script>
</body>
</html>`;
