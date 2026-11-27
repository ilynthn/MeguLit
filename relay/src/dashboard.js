// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-16 beta live-usage dashboard served by the relay (GET /dashboard). Polls /api/probe/stats on both relay nodes
   (CORS open) every 15 s, shows the first answer and each node's latency. Phone: https://cn-api.megulit.com/dashboard.
   2026-11-27 redesign (readability first): headline numbers -> main charts -> detail cards and tables, every card has a
   title, a one-sentence description, units / time range and its data source. Megumin palette, zh / en switch (all text
   lives in dashboard-i18n.js). Data, endpoints and auth are unchanged. */
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;500;600&display=swap">

<style>
/* Type scale (4 steps): 32 headline numbers / 16-18 titles / 14 body / 12 notes. Text >= 4.5:1 (body ~12:1, notes ~6:1).
   Chart colours validated with the dataviz script on the card surface (dark mode, categorical): L 0.48-0.67, CVD dE >= 9. */
:root{--bg:#1a0e12;--bg2:#1f1217;--panel:#241318;--panel2:#2b181e;--field:#1e1116;--btn:#2d1a21;--btn-h:#38212a;
  --line:rgba(232,220,210,.09);--line2:rgba(232,220,210,.17);--fg:#e8dcd2;--hi:#f4eae1;--dim:#ad9aa0;
  --red:#c8323c;--red-t:#ee8089;--deep:#7e1426;--gold:#e2b25c;--gold-line:rgba(226,178,92,.38);--ok:#86bda3;
  --c1:#d9505a;--c2:#2fa89b;--c3:#bd8628;--c4:#7479e8;--c5:#b9609c;--track:rgba(232,220,210,.09);
  --sans:Inter,"Noto Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei UI",system-ui,-apple-system,"Segoe UI",sans-serif;
  --mono:"JetBrains Mono","Cascadia Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--r:16px;color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0}
html{scrollbar-color:rgba(232,220,210,.22) transparent;scrollbar-width:thin;scroll-behavior:smooth}
::-webkit-scrollbar{width:8px;height:8px;background:transparent}
::-webkit-scrollbar-thumb{background:rgba(232,220,210,.16);border-radius:8px}
body{background:var(--bg);background-image:radial-gradient(900px 420px at 10% -8%,rgba(200,50,60,.12),transparent 62%),radial-gradient(700px 360px at 96% 0,rgba(226,178,92,.05),transparent 60%);background-repeat:no-repeat;
  color:var(--fg);font-family:var(--sans);font-size:14px;line-height:1.6;letter-spacing:0;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
  padding:0 clamp(16px,2.4vw,40px) 40px;overflow-x:hidden}
a{color:inherit}
h2,h3{text-wrap:balance}p{text-wrap:pretty}
code,.mono{font-family:var(--mono);font-size:12px}
.num,td.n,.kv .v,.m .v,.m .pc,td.z,td.v{font-variant-numeric:tabular-nums}
.r{color:var(--red-t)}.d{color:var(--dim)}.h{color:var(--hi)}.g{color:var(--ok)}
.wrap{max-width:2200px;margin:0 auto}
:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:6px}

/* top bar */
.top{position:sticky;top:0;z-index:6;margin:0 calc(-1 * clamp(16px,2.4vw,40px)) 24px;padding:12px clamp(16px,2.4vw,40px);background:rgba(26,14,18,.88);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.top-in{max-width:2200px;margin:0 auto;display:flex;align-items:center;gap:20px}
.brand{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:600;color:var(--hi);white-space:nowrap}
.brand i{width:12px;height:12px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ee6f78,#c8323c 55%,#7e1426);box-shadow:0 0 14px rgba(200,50,60,.5)}
.brand small{color:var(--dim);font-weight:400;font-size:12px}
.nav{display:flex;gap:4px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}
.nav::-webkit-scrollbar{display:none}
.nav a{text-decoration:none;color:var(--dim);padding:0 14px;min-height:36px;display:inline-flex;align-items:center;border-radius:999px;font-size:14px;white-space:nowrap;transition:background-color .15s,color .15s}
.nav a:hover{background:rgba(232,220,210,.07);color:var(--hi)}
.nav a.on{background:rgba(200,50,60,.2);color:var(--hi)}
.nav a.gold{color:var(--gold)}
.top-r{display:flex;align-items:center;gap:14px;color:var(--dim);font-size:12px;white-space:nowrap}
.top-r .clk{color:var(--fg);font-size:14px;font-variant-numeric:tabular-nums}
.lang{display:inline-flex;padding:3px;border:1px solid var(--line2);border-radius:999px;background:var(--field)}
.lang button{font:inherit;font-size:13px;font-weight:500;color:var(--dim);background:transparent;border:0;border-radius:999px;min-width:44px;min-height:32px;padding:0 12px;cursor:pointer;transition:background-color .15s,color .15s,transform .15s}
.lang button:hover{color:var(--hi)}
.lang button:active{transform:scale(.96)}
.lang button[aria-pressed="true"]{background:var(--red);color:#fff6f0}

/* sections */
.sec{margin:0 0 40px;scroll-margin-top:84px}
.sec>header{margin-bottom:16px}
.sec h2{margin:0;font-size:18px;font-weight:600;color:var(--hi);line-height:1.4}
.sec>header p{margin:2px 0 0;font-size:14px;color:var(--dim)}
.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px;align-items:start}
#overview .grid{align-items:stretch}
.stack{display:flex;flex-direction:column;gap:16px}
.grid>*{grid-column:span 12;min-width:0}
@media(min-width:760px){.grid>.s6,.grid>.s4,.grid>.s3{grid-column:span 6}.grid>.stack{grid-column:span 12;display:grid;grid-template-columns:1fr 1fr;align-items:start}.grid>.s8,.grid>.s12{grid-column:span 12}}
@media(min-width:1280px){.grid>.stack{grid-column:span 4;display:flex;align-items:stretch}.grid>.s3{grid-column:span 3}.grid>.s4{grid-column:span 4}.grid>.s6{grid-column:span 6}.grid>.s8{grid-column:span 8}}
@media(min-width:1280px) and (max-width:1599px){.grid>.s3{grid-column:span 6}}

/* cards: 16px radius, 20px padding; nested tiles use 16 - 6 = 10px */
.pane{display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:20px 22px 16px;box-shadow:0 14px 34px -24px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.025)}
.ch{margin-bottom:14px}
.ct{margin:0;font-size:16px;font-weight:600;color:var(--hi);line-height:1.4}
.cd{margin:2px 0 0;font-size:12px;color:var(--dim);line-height:1.55}
.cb{flex:1;min-width:0}
.cs{margin-top:14px;padding-top:10px;border-top:1px solid var(--line);font-size:12px;color:var(--dim);display:flex;gap:8px;flex-wrap:wrap;align-items:baseline}
.cs code{color:var(--fg);opacity:.85;word-break:break-all}
.pane.gold{border-color:var(--gold-line);background:linear-gradient(180deg,rgba(226,178,92,.05),transparent 130px),var(--panel)}
.pane.gold .ct{color:var(--gold)}

/* headline numbers (proportional figures, same sans) */
.kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:16px}
@media(min-width:900px){.kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(min-width:1380px){.kpis{grid-template-columns:repeat(5,minmax(0,1fr))}}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:18px 20px 14px;display:flex;flex-direction:column;min-width:0;box-shadow:0 14px 34px -24px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.025)}
.kpi.gold{border-color:var(--gold-line)}
.kl{font-size:14px;color:var(--fg);font-weight:500}
.kn{font-size:34px;line-height:1.15;font-weight:600;color:var(--hi);margin:6px 0 2px;letter-spacing:-.01em}
.kpi.gold .kn{color:var(--gold)}
.kn small{font-size:14px;font-weight:400;color:var(--dim);margin-left:8px;letter-spacing:0}
.ks{font-size:12px;color:var(--dim);line-height:1.5;min-height:3em}
.kspark{height:36px;margin:6px 0 4px}.kspark svg{display:block;width:100%;height:100%}
.kpi .cs{margin-top:auto}.kpi .trk{align-self:stretch}
.kseg{display:flex;gap:2px;height:8px;margin:14px 0 8px;border-radius:99px;overflow:hidden;background:var(--track)}.kseg i{display:block}

/* charts: 24px-capped bars with 4px rounded data end, 2px line, hairline solid grid */
.chart{position:relative;width:100%;height:240px}
.chart svg{display:block;width:100%;height:100%;overflow:visible}
.chart .gl{stroke:rgba(232,220,210,.1);stroke-width:1}
.chart text{fill:var(--dim);font-size:12px;font-family:var(--sans);font-variant-numeric:tabular-nums}
.chart .bar{fill:var(--c1);transition:fill .12s}
.chart .bar.now{fill:var(--gold)}
.chart .bar.z{fill:rgba(232,220,210,.14)}
.chart .bar.hov{fill:#ec7078}
.chart .bar.now.hov{fill:#f0c97a}
.chart .area{fill:rgba(217,80,90,.1)}.chart .ln{fill:none;stroke:var(--c1);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.chart .dot{fill:var(--c1);stroke:var(--panel);stroke-width:2}
.chart .cross{stroke:rgba(232,220,210,.35);stroke-width:1}
.tip{position:fixed;z-index:20;pointer-events:none;background:#34202a;border:1px solid var(--line2);border-radius:10px;padding:8px 12px;font-size:12px;color:var(--dim);box-shadow:0 12px 30px -10px rgba(0,0,0,.7);opacity:0;transition:opacity .1s;max-width:240px}
.tip.on{opacity:1}.tip b{display:block;font-size:16px;color:var(--hi);font-weight:600;font-variant-numeric:tabular-nums}
.sumrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:14px 0 0;padding-top:14px;border-top:1px solid var(--line)}
.sumrow div{min-width:0}.sumrow dt{font-size:12px;color:var(--dim);margin:0}.sumrow dd{margin:0;font-size:16px;color:var(--hi);font-weight:500;font-variant-numeric:tabular-nums}.sumrow dd small{font-size:12px;color:var(--dim);font-weight:400}
details.tv{margin-top:12px;font-size:12px;color:var(--dim)}
details.tv summary{cursor:pointer;min-height:32px;display:flex;align-items:center}
details.tv summary:hover{color:var(--fg)}
details.tv table{margin-top:6px}

/* meters + rows */
.trk{display:block;height:8px;border-radius:99px;background:var(--track);overflow:hidden;align-self:center}
.trk i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#a8283a,var(--c1));transition:width .5s ease}
.gold .trk i{background:linear-gradient(90deg,#a97b2e,var(--gold))}
.m.hot .trk i{background:linear-gradient(90deg,#c8323c,#f08088)}
.m{display:grid;grid-template-columns:minmax(7em,10em) minmax(0,1fr) auto;gap:14px;align-items:center;min-height:36px}
.m .k{color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.m .bar{min-width:0}
.m .v{color:var(--hi);min-width:3.6ch;text-align:right;font-weight:500}
.m.m4{grid-template-columns:minmax(7em,10em) minmax(0,1fr) auto 4ch}
.m .pc{color:var(--dim);text-align:right;font-size:12px}
.m.m5{grid-template-columns:minmax(8em,11em) minmax(0,1fr) 4.4ch auto;gap:12px}
.m.m5 .pc{white-space:nowrap;min-width:9.5ch}
.m.hot .v,.m.hot .k{color:var(--red-t)}
.sep{border-top:1px solid var(--line);margin:12px 0}
.sub{color:var(--dim);font-size:12px;margin:0 0 4px}
.kv{display:grid;grid-template-columns:minmax(7.5em,auto) 1fr;gap:0}
.kv .v{padding-left:16px}
.kv>*{min-height:36px;display:flex;align-items:center}
.kv .k{color:var(--fg)}.kv .v{justify-content:flex-end;text-align:right;color:var(--hi);font-weight:500;flex-wrap:wrap;gap:0 6px}
.kv .v .d{font-weight:400;font-size:12px}
.kv>*:nth-child(n+3){border-top:1px solid var(--line)}
.cnt{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.cnt>div{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px 14px}
.cnt .v{font-size:28px;line-height:1.2;color:var(--hi);font-weight:600}.cnt .v.r{color:var(--red-t)}
.cnt .k{color:var(--dim);font-size:12px}
.bigrow{display:flex;align-items:baseline;gap:12px;margin-bottom:12px}
.bigrow .n{font-size:32px;line-height:1.1;font-weight:600;color:var(--gold)}
.bigrow .u{font-size:14px;color:var(--fg)}.bigrow .u small{display:block;font-size:12px;color:var(--dim)}
.segbar{display:flex;gap:2px;height:28px;margin:6px 0 10px}
.segbar i{display:flex;align-items:center;padding:0 10px;border-radius:4px;font-style:normal;font-size:12px;font-weight:600;color:#1a0e12;white-space:nowrap}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:var(--dim);margin-bottom:6px}
.legend span{display:inline-flex;align-items:center;gap:6px}.legend i{width:10px;height:10px;border-radius:3px;display:inline-block}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.chips span{border:1px solid var(--line2);color:var(--dim);font-size:12px;padding:3px 12px;border-radius:999px}
.chips b{color:var(--hi);font-weight:600}
.chips.gold span{border-color:var(--gold-line)}.chips.gold b{color:var(--gold)}

/* tables: 44px rows, zebra, right-aligned numbers */
.tw{overflow-x:auto;margin:0 -6px;padding:0 6px}
table{width:100%;border-collapse:collapse;font-size:14px}
th{font-size:12px;color:var(--dim);font-weight:500;text-align:left;padding:8px 12px;border-bottom:1px solid var(--line2);white-space:nowrap}
th.rt,td.rt{text-align:right}
td{padding:0 12px;height:44px;vertical-align:middle;border-bottom:1px solid var(--line)}
tbody tr:nth-child(even) td{background:rgba(232,220,210,.03)}
tbody tr:hover td{background:rgba(232,220,210,.06)}
tbody tr:last-child td{border-bottom:0}
td.n{color:var(--dim);width:3ch}td.v{color:var(--hi);white-space:nowrap;font-weight:500}
td.t{color:var(--hi);word-break:break-word;min-width:12em}
td.s{color:var(--dim);white-space:nowrap}
td.z{color:var(--fg);white-space:nowrap}
.tag{color:#2a1410;background:var(--gold);font-size:12px;font-weight:600;padding:0 8px;margin-left:8px;border-radius:999px}
.st{display:inline-block;font-size:12px;padding:1px 10px;border:1px solid var(--line2);color:var(--dim);border-radius:999px}
.st.ready{border-color:rgba(238,128,137,.5);color:var(--red-t)}.st.uploading{border-color:var(--gold-line);color:var(--gold)}.st.done{border-color:rgba(134,189,163,.55);color:var(--ok)}
.empty{color:var(--dim);font-size:14px;padding:8px 0}
@media(max-width:560px){.hide-s{display:none}}

/* log */
.log{font-family:var(--mono);font-size:12px;max-height:20em;overflow:hidden;color:var(--fg);margin-top:8px}
.log div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:4px 0;border-bottom:1px solid var(--line)}
.lv{display:inline-block;width:3.6ch;font-weight:500}.lv.i{color:var(--ok)}.lv.e{color:var(--red-t)}
.ms{color:var(--dim)}
.latc{height:70px}.latc svg{display:block;width:100%;height:100%}.latc .sa{fill:rgba(217,80,90,.12)}.latc .sl{fill:none;stroke:var(--c1);stroke-width:2;stroke-linejoin:round}

/* status strip */
.vim{display:flex;align-items:center;gap:16px;margin-top:8px;padding:10px 16px;border:1px solid var(--line);border-radius:12px;background:var(--bg2);font-size:12px;color:var(--dim);white-space:nowrap;overflow:hidden}
.vim .md{display:inline-flex;align-items:center;gap:8px;color:var(--ok);font-weight:600}
.vim .md::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor}
.vim .md.err{color:var(--red-t)}
.vim .sp{flex:1}.vim #ep{font-family:var(--mono);overflow:hidden;text-overflow:ellipsis}

@media(max-width:760px){.top-r .clk,.brand small,.top-r #host{display:none}.top-in{flex-wrap:wrap;gap:8px 12px}.nav{order:3;flex-basis:100%}.top-r{margin-left:auto}.kn{font-size:30px}}
@media(max-width:560px){.kpis{grid-template-columns:1fr}.vim #ep{display:none}.pane{padding:16px 16px 14px}.m,.m.m4{grid-template-columns:minmax(6em,8em) minmax(0,1fr) auto}.m.m4 .pc{display:none}
  .m.m5{grid-template-columns:minmax(6em,8em) minmax(0,1fr) 4.4ch}.m.m5 .pc{grid-column:1/-1;text-align:left;margin-top:-6px;padding-bottom:4px}.chart{height:210px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}html{scroll-behavior:auto}}
.ops-admin{margin:0 0 16px}#seed-admin{scroll-margin-top:84px}
.pane.c12{grid-column:span 12}
.chint{font-size:12px;color:var(--dim)}
#seed-admin>.ch{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
</style>
</head>
<body>

<header class="top"><div class="top-in">
  <div class="brand"><i></i><span>MeguLit</span><small data-i18n="title">MeguLit 运行看板</small></div>
  <nav class="nav"><a class="on" href="#overview" data-i18n="nav.overview">概览</a><a href="#calib" data-i18n="nav.calib">校准与适配</a><a href="#comm" data-i18n="nav.comm">社区</a><a href="#works" data-i18n="nav.works">作品与存储</a><a class="gold" href="#seed-admin" data-i18n="nav.seed">Seed 管理</a></nav>
  <div class="top-r"><span id="host">relay</span><span class="clk" id="clock">--:--:--</span>
    <div class="lang" role="group" aria-label="切换语言" data-i18n-aria="lang.aria"><button type="button" data-lang="zh" aria-pressed="true">中</button><button type="button" data-lang="en" aria-pressed="false">EN</button></div></div>
</div></header>

<div class="wrap">
<section class="sec" id="overview"><header><h2 data-i18n="h.overview">概览</h2><p data-i18n="hd.overview">此刻有多少人在用，以及最近一天的变化</p></header>
  <div class="kpis">
    <div class="kpi"><div class="kl" data-i18n="k.online">当前在线</div><div class="kn"><span id="kOnline">--</span><small id="kOnlineDelta"></small></div><div class="ks" id="kOnlineS"></div><div class="kspark" id="kOnlineSp"></div><div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · online</code></div></div>
    <div class="kpi"><div class="kl" data-i18n="k.a24">24 小时活跃</div><div class="kn"><span id="kA24">--</span></div><div class="ks" data-i18n="k.a24.d">过去 24 小时出现过的玩家，单位：人</div><div class="kspark" id="kA24Sp"></div><div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · active24h</code></div></div>
    <div class="kpi"><div class="kl" data-i18n="k.today">今日活跃</div><div class="kn"><span id="kToday">--</span></div><div class="ks" id="kTodayS"></div><div class="trk" id="kTodayBar" style="margin:14px 0 8px"></div><div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · today · active1h</code></div></div>
    <div class="kpi gold"><div class="kl" data-i18n="k.seed">已收录作品</div><div class="kn"><span id="kSeed">--</span></div><div class="ks" id="kSeedS"></div><div class="kseg" id="kSeedBar"></div><div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · seed</code></div></div>
    <div class="kpi"><div class="kl" data-i18n="k.probed">已探测作品</div><div class="kn"><span id="kProbed">--</span></div><div class="ks" id="kProbedS"></div><div class="trk" id="kProbedBar" style="margin:14px 0 8px"></div><div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · probedGames · reporters</code></div></div>
  </div>
  <div class="grid">
    <section class="pane s8"><header class="ch"><h3 class="ct" data-i18n="c.hour">每小时在线人数</h3><p class="cd" data-i18n="c.hour.d">过去 24 小时，每小时的在线人数，单位：人。悬停柱子查看具体数值。</p></header>
      <div class="cb"><div class="chart" id="chHour" role="img"></div>
      <dl class="sumrow"><div><dt data-i18n="h.peakHour">峰值小时</dt><dd id="hPeak">--</dd></div><div><dt data-i18n="h.avgHour">小时均值</dt><dd id="hAvg">--</dd></div><div><dt data-i18n="h.quiet">空闲小时</dt><dd id="hZero">--</dd></div><div><dt data-i18n="h.thisHour">本小时</dt><dd id="hNow">--</dd></div><div><dt data-i18n="h.busy3">最忙 3 小时</dt><dd id="h3">--</dd></div></dl>
      <details class="tv"><summary data-i18n="c.table">表格视图</summary><div id="tvHour"></div></details></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · ext.hourly</code></div></section>
    <section class="pane s4"><header class="ch"><h3 class="ct" data-i18n="c.six">近 6 小时走势</h3><p class="cd" data-i18n="c.six.d">每 10 分钟一个点的在线人数，单位：人。</p></header>
      <div class="cb"><div class="chart" id="chSix" role="img"></div>
      <dl class="sumrow"><div><dt data-i18n="k.now1h">当前 / 近 1 小时</dt><dd id="oNow">--</dd></div><div><dt data-i18n="k.avg6h">6 小时均值</dt><dd id="o6">--</dd></div></dl>
      <details class="tv"><summary data-i18n="c.table">表格视图</summary><div id="tvSix"></div></details></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · series</code></div></section>
    <section class="pane s4"><header class="ch"><h3 class="ct" data-i18n="p.act">玩家活跃</h3><p class="cd" data-i18n="p.act.d">活跃玩家数与会话时长，单位：人 / 分钟。</p></header>
      <div class="cb">
      <div class="m"><span class="k" data-i18n="s.active1h">1 小时活跃</span><span class="bar" id="b1"></span><span class="v" id="v1">--</span></div>
      <div class="m"><span class="k" data-i18n="s.activeToday">今日活跃</span><span class="bar" id="b2"></span><span class="v" id="v2">--</span></div>
      <div class="m"><span class="k" data-i18n="s.active24h">24 小时活跃</span><span class="bar" id="bA24"></span><span class="v" id="vA24">--</span></div>
      <div class="sep"></div>
      <div class="kv"><span class="k" data-i18n="s.peak10">10 分钟峰值</span><span class="v" id="vP10">--</span><span class="k" data-i18n="s.avgOnline">平均在线</span><span class="v" id="vAvg">--</span><span class="k" data-i18n="s.long">超 1 小时会话</span><span class="v" id="vLong">--</span><span class="k" data-i18n="s.reporters">上报者</span><span class="v" id="v4">--</span><span class="k" data-i18n="s.perGame">每作品上报</span><span class="v" id="v5">--</span></div></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats</code></div></section>
    <section class="pane s4"><header class="ch"><h3 class="ct" data-i18n="p.quota2">免费额度用量</h3><p class="cd" data-i18n="p.quota2.d">各项服务已用额度占上限的比例，超过 80% 标红。</p></header>
      <div class="cb" id="quota"><div class="empty" data-i18n="loading">加载中…</div></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · quota</code></div></section>
    <section class="pane s4 gold"><header class="ch"><h3 class="ct" data-i18n="p.seed2">The Seed 适配库</h3><p class="cd" data-i18n="p.seed2.d">已收录的作品与 exe 版本，按是否已被确认分类。</p></header>
      <div class="cb" id="seed"><div class="empty" data-i18n="loading">加载中…</div></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · seed</code></div></section>
  </div>
</section>

<section class="sec" id="calib"><header><h2 data-i18n="h.calib">校准与适配</h2><p data-i18n="hd.calib">适配库的进度、探针的状态，以及玩家回传的数据</p></header><div class="grid">
    <section class="pane s4"><header class="ch"><h3 class="ct" data-i18n="p.why2">探针停在哪一步</h3><p class="cd" data-i18n="p.why2.d">玩家上报的探针按步骤分布，以及探针质量，单位：份。</p></header>
      <div class="cb" id="steps"><div class="empty" data-i18n="nodata">暂无数据</div></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · steps · probeStates</code></div></section>
    <section class="pane s4"><header class="ch"><h3 class="ct" data-i18n="p.adapters2">适配包与上传</h3><p class="cd" data-i18n="p.adapters2.d">适配包数量、举报，以及玩家贡献和诊断上传。</p></header>
      <div class="cb" id="adp"><div class="empty" data-i18n="loading">加载中…</div></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · ext.adapters</code></div></section>
    <div class="s4 stack">
    <section class="pane gold"><header class="ch"><h3 class="ct" data-i18n="p.cardinal2">Cardinal 回放评分</h3><p class="cd" data-i18n="p.cardinal2.d">玩家回放后回传的评分：今日数量、升级为已验证、进入修复队列。</p></header>
      <div class="cb" id="cardinal"><div class="empty" data-i18n="loading">加载中…</div></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · cardinal</code></div></section>
    <section class="pane"><header class="ch"><h3 class="ct" data-i18n="p.full2">完整转储</h3><p class="cd" data-i18n="p.full2.d">玩家上传的完整探针包：就绪、上传中、已完成，以及 R2 占用。</p></header>
      <div class="cb"><div class="cnt">
        <div><div class="v r" id="fReady">--</div><div class="k" data-i18n="f.ready">就绪</div></div>
        <div><div class="v" id="fUp">--</div><div class="k" data-i18n="f.uploading">上传中</div></div>
        <div><div class="v" id="fDone">--</div><div class="k" data-i18n="f.done">已完成</div></div></div>
      <div class="m"><span class="k">R2</span><span class="bar" id="bR2"></span><span class="v" id="vR2">--</span></div>
      <div class="kv" style="margin-top:8px"><span class="k" data-i18n="f.stored">已存储</span><span class="v" id="fMB">--</span><span class="k" data-i18n="f.avg">平均每份</span><span class="v" id="fAvg">--</span><span class="k" data-i18n="f.last">最近上传</span><span class="v" id="fLast">--</span></div></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · full</code></div></section>
    </div>
</div></section>

<section class="sec" id="comm"><header><h2 data-i18n="h.comm">用户与社区</h2><p data-i18n="hd.comm">账号、同步、榜单与论坛的使用量</p></header><div class="grid">
    <section class="pane s4"><header class="ch"><h3 class="ct" data-i18n="p.accounts2">账号与同步</h3><p class="cd" data-i18n="p.accounts2.d">注册账号、近 7 日登录，以及云同步的记录数。</p></header>
      <div class="cb" id="acc"><div class="empty" data-i18n="loading">加载中…</div></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · ext.accounts · ext.sync</code></div></section>
    <section class="pane s4"><header class="ch"><h3 class="ct" data-i18n="p.community2">榜单、论坛与社交</h3><p class="cd" data-i18n="p.community2.d">阅读榜、论坛帖子、个人主页和查词的使用量。</p></header>
      <div class="cb" id="com"><div class="empty" data-i18n="loading">加载中…</div></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · ext.leaderboard · forum · social · lookups</code></div></section>
    <section class="pane s4"><header class="ch"><h3 class="ct" data-i18n="p.playing2">正在玩的作品</h3><p class="cd" data-i18n="p.playing2.d">近 7 天榜单上有人阅读的作品，按最近阅读时间排序。</p></header>
      <div class="cb" id="playing"><div class="empty" data-i18n="loading">加载中…</div></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · playing</code></div></section>
    <section class="pane s12"><header class="ch"><h3 class="ct" data-i18n="p.most2">阅读最多的作品</h3><p class="cd" data-i18n="p.most2.d">按累计阅读字数排名，单位：字。</p></header>
      <div class="cb" id="most"><div class="empty" data-i18n="loading">加载中…</div></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · ext.mostRead</code></div></section>
</div></section>

<section class="sec" id="works"><header><h2 data-i18n="h.works">作品、存储与运行记录</h2><p data-i18n="hd.works">哪些作品被探测、存储用了多少、请求是否正常</p></header><div class="grid">
    <section class="pane s8"><header class="ch"><h3 class="ct" data-i18n="p.targets2">探针作品</h3><p class="cd" data-i18n="p.targets2.d">按上报人数排序，附适配进度、完整转储大小和状态。</p></header>
      <div class="cb" id="top"><div class="empty" data-i18n="norows">暂无数据</div></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · top</code></div></section>
    <section class="pane s4"><header class="ch"><h3 class="ct" data-i18n="p.stor2">存储占用</h3><p class="cd" data-i18n="p.stor2.d">R2 免费 10 GB 额度的构成，以及正在上传的任务。</p></header>
      <div class="cb" id="stor"><div class="empty" data-i18n="loading">加载中…</div></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>/api/probe/stats · full · ext</code></div></section>
    <section class="pane s12"><header class="ch"><h3 class="ct" data-i18n="p.log2">请求日志</h3><p class="cd" data-i18n="p.log2.d">本页每 15 秒向两个节点拉取一次数据，记录状态与延迟，单位：毫秒。</p></header>
      <div class="cb"><div class="latc" id="lat"></div><div class="log" id="log"></div></div>
      <div class="cs"><span data-i18n="src">数据来源</span><code>cn-api / api · GET /api/probe/stats</code><span id="latT" class="d"></span></div></section>
</div></section>
<div class="grid ops-admin">
    ${SEED_ADMIN_HTML}
</div>
  <div class="vim"><span class="md" id="mode">LIVE</span><span id="ep">GET /api/probe/stats</span><span id="code">--</span><span class="sp"></span><span id="extAt">ext --</span><span id="node">--</span><span id="pollT">poll 15s</span></div>
</div>
<div class="tip" id="tip" role="status"></div>

<script>
"use strict";
var D=${json(DASH_DICT)};
var ADMIN_EN=${json(ADMIN_EN)};
var NODES=[["cn-api","https://cn-api.megulit.com/api/probe/stats"],["api","https://api.megulit.com/api/probe/stats"]];
var PERIOD=15,HIST=60;
var $=function(id){return document.getElementById(id);};

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
 applyStatic();chrome();drawLog();
 if(last){try{render(last);}catch(e){}nodesLine();}
 if(typeof window.__adminRedraw==="function")window.__adminRedraw();}

function fmt(n){return (n==null||isNaN(n))?"--":String(n);}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function dur(s){if(s<60)return t("u.s",s);if(s<3600)return t("u.m",Math.floor(s/60));if(s<86400)return t("u.h",Math.floor(s/3600),Math.floor(s%3600/60));return t("u.d",Math.floor(s/86400));}
function ago(sec,bare){if(!sec)return "--";var d=dur(Math.max(0,Math.floor(Date.now()/1000-sec)));return bare?d:d+t("ago.suf");}
function mb(v){return v==null?"--":(v>=1024?(v/1024).toFixed(2)+" GB":v.toFixed(1)+" MB");}
function pad2(n){return String(n).padStart(2,"0");}
function K(n){n=Number(n)||0;return n>=1e9?(n/1e9).toFixed(2)+"B":n>=1e6?(n/1e6).toFixed(2)+"M":n>=1e4?(n/1e3).toFixed(1)+"k":String(n);}
function H(sec){var h=(Number(sec)||0)/3600;return h>=100?Math.round(h)+"h":h.toFixed(1)+"h";}

/* bar meter: a rounded track with a gradient fill; the value is clamped to 0..100% */
function meter(el,v,max){if(!el)return;var p=max>0?Math.min(100,Math.max(0,(Number(v)||0)/max*100)):0;
 if(!/\btrk\b/.test(el.className))el.className=(el.className+" trk").trim();el.innerHTML='<i style="width:'+p.toFixed(1)+'%"></i>';}

/* ---- charts: hand-drawn SVG, thin marks, hairline solid grid, hover tooltip + a table twin ---- */
var tip=$("tip");
function showTip(ev,val,lab){tip.innerHTML='<b>'+esc(val)+'</b>'+esc(lab);var w=tip.offsetWidth,x=Math.min(innerWidth-w-8,Math.max(8,ev.clientX+14)),y=Math.max(8,ev.clientY-tip.offsetHeight-12);tip.style.left=x+"px";tip.style.top=y+"px";tip.classList.add("on");}
function hideTip(){tip.classList.remove("on");}
function niceMax(m){if(m<=4)return 4;var p=Math.pow(10,Math.floor(Math.log(m)/Math.LN10)),n=m/p;return (n<=1?1:n<=2?2:n<=4?4:n<=5?5:10)*p;}
function yAxis(L,W,T,ih,mx){var s="";[0,.5,1].forEach(function(f){var y=T+ih-f*ih;s+='<line class="gl" x1="'+L+'" x2="'+W+'" y1="'+y+'" y2="'+y+'"/><text x="'+(L-8)+'" y="'+(y+4)+'" text-anchor="end">'+K(Math.round(mx*f))+'</text>';});return s;}
function barChart(el,items,unitKey){if(!el)return;var W=el.clientWidth||640,H=el.clientHeight||240,L=40,B=26,T=10,R=4,iw=W-L-R,ih=H-T-B,n=items.length;
 if(!n){el.innerHTML="";return;}
 var mx=niceMax(Math.max.apply(null,items.map(function(i){return i.v;}).concat([1]))),slot=iw/n,bw=Math.min(24,slot*.62),s='<svg viewBox="0 0 '+W+' '+H+'" aria-hidden="true">'+yAxis(L,W-R,T,ih,mx);
 var every=Math.max(1,Math.ceil(n/(W<420?4:8)));
 items.forEach(function(it,i){var h=it.v?Math.max(3,it.v/mx*ih):2,x=L+i*slot+(slot-bw)/2,y=T+ih-h,r=Math.min(4,bw/2,h);
  s+='<path class="bar'+(it.now?" now":"")+(it.v?"":" z")+'" id="bb'+i+'" d="M'+x.toFixed(1)+','+(T+ih)+'V'+(y+r).toFixed(1)+'a'+r+','+r+' 0 0 1 '+r+',-'+r+'h'+(bw-2*r).toFixed(1)+'a'+r+','+r+' 0 0 1 '+r+','+r+'V'+(T+ih)+'z"/>';
  if(i%every===0||i===n-1)s+='<text x="'+(x+bw/2).toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle">'+esc(it.x)+'</text>';});
 el.innerHTML=s+'</svg>';
 el.setAttribute("aria-label",el.getAttribute("data-label")||"");
 var cur=-1;function off(){if(cur>=0){var b=$("bb"+cur);if(b)b.classList.remove("hov");}cur=-1;hideTip();}
 el.onpointermove=function(ev){var r=el.getBoundingClientRect(),i=Math.floor((ev.clientX-r.left-L)/slot);if(i<0||i>=n){off();return;}
  if(i!==cur){if(cur>=0){var o=$("bb"+cur);if(o)o.classList.remove("hov");}cur=i;var b=$("bb"+i);if(b)b.classList.add("hov");}
  showTip(ev,t(unitKey,items[i].v),items[i].x);};
 el.onpointerleave=off;}
function lineChart(el,items,unitKey){if(!el)return;var W=el.clientWidth||400,H=el.clientHeight||240,L=40,B=26,T=10,R=10,iw=W-L-R,ih=H-T-B,n=items.length;
 if(n<2){el.innerHTML="";return;}
 var mx=niceMax(Math.max.apply(null,items.map(function(i){return i.v;}).concat([1]))),px=function(i){return L+i/(n-1)*iw;},py=function(v){return T+ih-v/mx*ih;};
 var pts=items.map(function(it,i){return px(i).toFixed(1)+","+py(it.v).toFixed(1);}).join(" ");
 var s='<svg viewBox="0 0 '+W+' '+H+'" aria-hidden="true">'+yAxis(L,W-R,T,ih,mx)+'<polygon class="area" points="'+L+','+(T+ih)+' '+pts+' '+px(n-1).toFixed(1)+','+(T+ih)+'"/><polyline class="ln" points="'+pts+'"/>';
 [0,Math.floor((n-1)/2),n-1].forEach(function(i,k){s+='<text x="'+px(i).toFixed(1)+'" y="'+(H-6)+'" text-anchor="'+(k===0?"start":k===2?"end":"middle")+'">'+esc(items[i].x)+'</text>';});
 s+='<line class="cross" id="lcx" y1="'+T+'" y2="'+(T+ih)+'" x1="0" x2="0" style="display:none"/><circle class="dot" id="lcd" r="5" style="display:none"/><circle class="dot" cx="'+px(n-1).toFixed(1)+'" cy="'+py(items[n-1].v).toFixed(1)+'" r="5"/></svg>';
 el.innerHTML=s;
 el.setAttribute("aria-label",el.getAttribute("data-label")||"");
 el.onpointermove=function(ev){var r=el.getBoundingClientRect(),i=Math.round((ev.clientX-r.left-L)/iw*(n-1));if(i<0||i>=n)return;
  var cx=$("lcx"),cd=$("lcd");cx.style.display=cd.style.display="";cx.setAttribute("x1",px(i));cx.setAttribute("x2",px(i));cd.setAttribute("cx",px(i));cd.setAttribute("cy",py(items[i].v));showTip(ev,t(unitKey,items[i].v),items[i].x);};
 el.onpointerleave=function(){var cx=$("lcx"),cd=$("lcd");if(cx){cx.style.display=cd.style.display="none";}hideTip();};}
function tableView(el,rows,c1,c2){if(!el)return;el.innerHTML='<div class="tw"><table><thead><tr><th>'+esc(c1)+'</th><th class="rt">'+esc(c2)+'</th></tr></thead><tbody>'+rows.map(function(r){return '<tr><td class="s">'+esc(r[0])+'</td><td class="z rt">'+esc(r[1])+'</td></tr>';}).join("")+'</tbody></table></div>';}
function sparkSvg(vals){var n=vals.length;if(n<4)return "";
 var mx=Math.max(1,Math.max.apply(null,vals)),pts=vals.map(function(v,i){return (i/(n-1)*100).toFixed(2)+","+(32-Math.max(0,v)/mx*28).toFixed(2);}).join(" ");
 return '<svg viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true"><polygon fill="rgba(217,80,90,.12)" points="0,36 '+pts+' 100,36"/><polyline fill="none" stroke="#d9505a" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" points="'+pts+'"/></svg>';}
function lineSvg(vals){var n=vals.length,mx=Math.max(1,Math.max.apply(null,vals)),pts=vals.map(function(v,i){return (i/(n-1)*100).toFixed(2)+","+(64-v/mx*58).toFixed(2);}).join(" ");
 return '<svg viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true"><polygon class="sa" points="0,70 '+pts+' 100,70"/><polyline class="sl" vector-effect="non-scaling-stroke" points="'+pts+'"/></svg>';}

/* sparklines from this viewer's own samples */
function load(k){try{return JSON.parse(localStorage.getItem(k)||"[]").filter(function(p){return Date.now()-p[0]<HIST*PERIOD*1000;});}catch(e){return [];}}
function keep(k,a){try{localStorage.setItem(k,JSON.stringify(a));}catch(e){}}
var hist=load("ml-online-hist"),lath=load("ml-lat-hist");

function kvs(rows){return '<div class="kv">'+rows.map(function(r){return '<span class="k">'+r[0]+'</span><span class="v">'+r[1]+'</span>';}).join("")+'</div>';}
function hv(v){return '<span class="h">'+v+'</span>';}
function p7(n){return n?' <span class="r">+'+K(n)+'</span><span class="d">'+t("d7")+'</span>':' <span class="d">+0'+t("d7")+'</span>';}
var barQ=[];
function bars(list,lab,id){if(!list||!list.length)return "";var tot=list.reduce(function(a,s){return a+(s.n|0);},0),mx=Math.max.apply(null,list.map(function(s){return s.n|0;}));
 return list.map(function(s,i){barQ.push([id+i,s.n|0,mx]);return '<div class="m m4"><span class="k" title="'+esc(s[lab])+'">'+esc(s[lab])+'</span><span class="bar" id="'+id+i+'"></span><span class="v">'+K(s.n)+'</span><span class="pc">'+Math.round((s.n|0)/Math.max(1,tot)*100)+'%</span></div>';}).join("");}
function flushBars(){barQ.forEach(function(q){var el=$(q[0]);if(el)meter(el,q[1],q[2]);});barQ=[];}
function sub(x){return '<div class="sep"></div><div class="sub">'+x+'</div>';}

function renderKpi(j){var f=j.full||{},s=j.seed||{},today=Math.max(j.today|0,1);
 $("kOnline").textContent=fmt(j.online);
 $("kOnlineDelta").innerHTML=deltaTxt?'<span class="'+(deltaTxt>0?"g":"r")+'">'+t("vs.poll",(deltaTxt>0?"+":"")+deltaTxt)+'</span>':"";
 $("kOnlineS").textContent=t("k.online.d",peak);
 $("kOnlineSp").innerHTML=sparkSvg(hist.map(function(p){return p[1];}));
 $("kA24").textContent=fmt(j.active24h);
 $("kA24Sp").innerHTML=sparkSvg(((j.ext||{}).hourly||[]).map(function(h){return h.n;}));
 $("kToday").textContent=fmt(j.today);$("kTodayS").textContent=t("k.today.d",fmt(j.active1h));meter($("kTodayBar"),j.active1h,today);
 var ok=s.confirmed|0,tot=Math.max(1,s.games|0);
 $("kSeed").textContent=s.games!=null?String(s.games|0):"--";
 $("kSeedS").textContent=t("k.seed.d",s.games!=null?Math.round(ok/tot*100):"--");
 $("kSeedBar").innerHTML=s.games?'<i style="width:'+(ok/tot*100).toFixed(1)+'%;background:#e2b25c"></i><i style="width:'+((s.waiting|0)/tot*100).toFixed(1)+'%;background:rgba(232,220,210,.24)"></i>':"";
 $("kProbed").textContent=fmt(j.probedGames);$("kProbedS").textContent=t("k.probed.d",fmt(j.reporters));
 meter($("kProbedBar"),f.games|0,Math.max(j.probedGames|0,1));}
function renderSteps(list,j){var w=$("steps");j=j||{};var html="",mx=0;
 if(list&&list.length){mx=Math.max.apply(null,list.map(function(s){return s.n;}));var tot=list.reduce(function(a,s){return a+s.n;},0);
  html+=list.map(function(s,i){return '<div class="m m4"><span class="k" title="'+esc(s.step)+'">'+esc(s.step)+'</span><span class="bar" id="sb'+i+'"></span><span class="v">'+s.n+'</span><span class="pc">'+Math.round(s.n/tot*100)+'%</span></div>';}).join("");}
 else html+='<div class="empty">'+t("nodata")+'</div>';
 var ps=j.probeStates||[],pt=ps.reduce(function(a,s){return a+s.n;},0);
 if(ps.length){html+='<div class="sep"></div><div class="sub">'+t("why.quality")+t("why.desens",pt)+'</div>'+
  ps.map(function(s,i){return '<div class="m m4"><span class="k">'+esc(s.state)+'</span><span class="bar" id="qb'+i+'"></span><span class="v">'+s.n+'</span><span class="pc">'+Math.round(s.n/Math.max(1,pt)*100)+'%</span></div>';}).join("");}
 var f=j.full||{},fg=f.games|0;
 html+='<div class="sep"></div>'+kvs([[t("why.vndb"),hv(fmt(j.vndbMatched))+'<span class="d"> / '+fmt(j.probedGames)+'</span>'],[t("why.issues"),hv(fmt(j.issues))],[t("why.adapted"),hv(f.done|0)+'<span class="d">'+t("why.dumps",fg,fg?Math.round((f.done|0)/fg*100):0)+'</span>']]);
 w.innerHTML=html;
 (list||[]).forEach(function(s,i){meter($("sb"+i),s.n,mx);});
 ps.forEach(function(s,i){meter($("qb"+i),s.n,Math.max.apply(null,ps.map(function(x){return x.n;})));});}
function renderExt(x){if(!x)return;barQ=[];
 var hs=x.hourly||[],pk=null,sum=0,zero=0;
 var items=hs.map(function(h,i){sum+=h.n;if(!h.n)zero++;if(!pk||h.n>pk.n)pk=h;var d=new Date(h.at*1000);return {x:pad2(d.getHours())+":00",v:h.n,now:i===hs.length-1};});
 var cv=$("chHour");cv.setAttribute("data-label",t("c.hour"));barChart(cv,items,"c.unit");
 tableView($("tvHour"),items.map(function(i){return [i.x,i.v];}),t("c.hourcol"),t("c.valcol"));
 $("hPeak").innerHTML=pk&&pk.n?pk.n+' <small>'+t("h.at",pad2(new Date(pk.at*1000).getHours())+':00')+'</small>':"--";
 $("hAvg").textContent=hs.length?(sum/hs.length).toFixed(1):"--";$("hZero").innerHTML=zero+'<small> / 24</small>';
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
/* storage parts use the validated categorical order: crimson, teal, gold, violet */
var SEGC=["#d9505a","#2fa89b","#bd8628","#7479e8"];
function renderStorage(j){var f=j.full||{},x=j.ext||{},el=$("stor");if(!el)return;barQ=[];var html="";
 var bdm=(x.bundles||{}).mb||0,dgm=(x.diagnostics||{}).mb||0,cum=(x.contrib||[]).reduce(function(a,c){return a+(c.mb||0);},0),tot=(f.storedMB||0)+bdm+dgm+cum;
 var parts=[[t("in.k.dumps"),f.storedMB||0],[t("in.k.contrib"),cum],[t("in.k.bundles"),bdm],[t("in.k.diag"),dgm]],lim=10240;
 var seg=parts.map(function(p,i){var w=Math.max(0,p[1]/lim*100);return w>0?'<i style="width:'+w.toFixed(2)+'%;background:'+SEGC[i]+';padding:0;border-radius:0" title="'+esc(p[0]+" "+mb(p[1]))+'"></i>':"";}).join("");
 html+='<div class="bigrow"><span class="n" style="color:var(--hi)">'+(tot/lim*100).toFixed(1)+'%</span><span class="u">'+t("st.r2used")+'<small>'+mb(tot)+t("st.free")+'</small></span></div>'+
  '<div class="segbar" style="height:10px;background:var(--track);border-radius:99px;overflow:hidden">'+seg+'</div>'+
  '<div class="legend">'+parts.map(function(p,i){return '<span><i style="background:'+SEGC[i]+'"></i>'+p[0]+' <b class="h num">'+mb(p[1])+'</b></span>';}).join("")+'</div>';
 var fl=f.inflight||[];html+=sub(t("st.inflight"));
 if(fl.length)fl.forEach(function(u,i){barQ.push(["fi"+i,u.pct,100]);
  html+='<div class="m m4"><span class="k" title="'+esc(u.title)+'">'+esc(u.title)+'</span><span class="bar" id="fi'+i+'"></span><span class="v">'+u.pct+'%</span><span class="pc">'+u.got+'/'+u.parts+'</span></div>'+
   '<div class="sub" style="margin:-4px 0 6px">'+mb(u.mb)+t("st.lastpart",ago(u.at))+'</div>';});
 else html+='<div class="empty">'+t("pf.idle")+'</div>';
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
   '<span class="v">'+(has?(pct<10?pct.toFixed(1):Math.round(pct))+'%':'--')+'</span><span class="pc">'+(has?r[4](r[2])+' / '+r[4](r[3]):'')+'</span></div>';}).join("");
 var now=new Date(),utc0=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)),left=Math.max(0,Math.round((utc0-now)/60000));
 html+='<div class="sub" style="margin-top:10px">'+t("q.reset",Math.floor(left/60),pad2(left%60))+'</div>';
 if(!q.token)html+='<div class="sub"><span class="r">'+t("q.offline")+'</span>'+t("q.needs")+'</div>';
 var errs=Object.keys(q.errors||{});if(errs.length)html+='<div class="sub">'+errs.map(function(k){return '<span class="r">'+esc(k)+'</span> '+esc(q.errors[k]);}).join(" · ")+'</div>';
 el.innerHTML=html;flushBars();}
function renderRow1(j){
 var se=j.series||[],sum=0;
 var items=se.map(function(p){sum+=p.n;var d=new Date(p.at*1000);return {x:pad2(d.getHours())+":"+pad2(d.getMinutes()),v:p.n};});
 var cv=$("chSix");cv.setAttribute("data-label",t("c.six"));lineChart(cv,items,"c.unit");
 tableView($("tvSix"),items.slice().reverse().map(function(i){return [i.x,i.v];}),t("c.hourcol"),t("c.valcol"));
 $("oNow").innerHTML=fmt(j.online)+'<small> / '+fmt(j.active1h)+'</small>';$("o6").innerHTML=(se.length?(sum/se.length).toFixed(1):"--")+'<small>'+t("u.per10")+'</small>';
 meter($("bA24"),j.active24h,Math.max(j.active24h|0,j.today|0,1));$("vA24").textContent=fmt(j.active24h);
 $("vP10").textContent=fmt(j.peak10);$("vAvg").textContent=j.avgMinToday!=null?(j.avgMinToday>=60?Math.floor(j.avgMinToday/60)+"h"+pad2(j.avgMinToday%60):j.avgMinToday+"m"):"--";$("vLong").textContent=fmt(j.longToday);
 var hs=(j.ext||{}).hourly||[];if(hs.length){var last2=hs[hs.length-1].n,avg=hs.reduce(function(a,h){return a+h.n;},0)/hs.length,best=0,bi=0;
  for(var i=0;i+3<=hs.length;i++){var w=hs[i].n+hs[i+1].n+hs[i+2].n;if(w>best){best=w;bi=i;}}
  $("hNow").innerHTML=last2+' <small class="'+(last2>=avg?"r":"")+'">'+(last2>=avg?"▲":"▼")+' '+t("h.vsAvg",avg.toFixed(1))+'</small>';
  $("h3").innerHTML=best?best+' <small>'+pad2(new Date(hs[bi].at*1000).getHours())+':00–'+pad2((new Date(hs[bi].at*1000).getHours()+3)%24)+':00</small>':"--";}}
function stateTag(s){return '<span class="st '+esc(s)+'">'+esc(s||"-")+'</span>';}
function renderTop(list){var w=$("top");
 if(!list||!list.length){w.innerHTML='<div class="empty">'+t("norows")+'</div>';return;}
 w.innerHTML='<div class="tw"><table><thead><tr><th>#</th><th>'+t("t.title")+'</th><th class="hide-s">'+t("t.why")+'</th><th class="rt hide-s">'+t("t.size")+'</th><th>'+t("t.state")+'</th><th class="rt">'+t("t.ppl")+'</th></tr></thead><tbody>'+list.map(function(g,i){
  return '<tr><td class="n">'+(i+1)+'</td><td class="t">'+esc(g.title)+(g.full?'<span class="tag">'+t("t.full")+'</span>':'')+'</td><td class="s hide-s">'+esc(g.step||"-")+'</td><td class="z rt hide-s">'+(g.mb!=null?mb(g.mb):"-")+'</td><td>'+stateTag(g.state)+'</td><td class="v rt">'+fmt(g.reporters)+'</td></tr>';}).join("")+'</tbody></table></div>';}
function renderStats(j){
 meter($("b1"),j.active1h,Math.max(j.today|0,1));$("v1").textContent=fmt(j.active1h);
 meter($("b2"),j.today,Math.max(j.active24h|0,j.today|0,1));$("v2").textContent=fmt(j.today);
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
 var html='<div class="bigrow"><span class="n">'+(s.games|0)+'</span><span class="u">'+t("seed.games")+'<small>'+(s.versions|0)+' '+t("seed.versions")+'</small></span></div>'+
  '<div class="segbar"><i style="width:'+(ok/tot*100).toFixed(1)+'%;background:#e2b25c">'+(ok/tot>.14?Math.round(ok/tot*100)+'%':'')+'</i><i style="width:'+(wait/tot*100).toFixed(1)+'%;background:rgba(232,220,210,.2);color:#e8dcd2">'+(wait/tot>.14?Math.round(wait/tot*100)+'%':'')+'</i></div>'+
  '<div class="legend"><span><i style="background:#e2b25c"></i>'+t("lg.confirmed")+' <b class="h num">'+ok+'</b></span><span><i style="background:rgba(232,220,210,.3)"></i>'+t("lg.waiting")+' <b class="h num">'+wait+'</b></span></div>'+
  '<div class="chips gold">'+[["seed.verified",st.verified],["seed.ownerok",st["owner-ok"]],["seed.read",st.read],["seed.skeleton",st.skeleton]].map(function(c){return '<span>'+t(c[0])+' <b>'+(c[1]|0)+'</b></span>';}).join("")+
  (s.other?'<span>'+t("seed.other")+' <b>'+s.other+'</b></span>':'')+'</div>'+
  '<div class="sub" style="margin-top:10px">'+s.sources.map(function(x){return esc(x.source)+' '+x.games;}).join(" · ")+t("seed.updated",ago(s.at))+'</div>'+errH;
 el.innerHTML=html;}
/* CARDINAL: the replay scores players send up: today's score count, auto diffs upgraded to verified, diffs sent to the repair queue */
function renderCardinal(c){var el=$("cardinal");
 if(!c||!c.today){el.innerHTML='<div class="empty">'+t("card.none")+'</div>';return;}
 var td=c.today,a=c.total||{};
 el.innerHTML='<div class="bigrow"><span class="n">'+(td.scores|0)+'</span><span class="u">'+t("card.scores")+'<small>'+t("card.total",a.scores|0)+'</small></span></div>'+
  '<div class="chips gold"><span>'+t("card.upgraded","<b>"+(td.upgraded|0)+"</b>")+'</span><span>'+t("card.repair","<b>"+(td.repair|0)+"</b>")+'</span></div>'+
  '<div class="sub" style="margin-top:10px">'+t("card.note","<b>"+(a.verified|0)+"</b>","<b>"+(a.repair|0)+"</b>")+'</div>';}
function latChart(){$("lat").innerHTML=lath.length>1?lineSvg(lath.map(function(p){return p[1];})):"";}

/* log lines keep their message as a function when it is translated, so switching language re-renders them */
var logs=[];
function drawLog(){$("log").innerHTML=logs.map(function(e){return '<div><span class="d">'+e[0]+'</span> <span class="lv '+(e[1]==="ERR"?"e":"i")+'">'+e[1]+'</span> '+(typeof e[2]==="function"?e[2]():e[2])+'</div>';}).join("");}
function log(level,msg){logs.unshift([new Date().toTimeString().slice(0,8),level,msg]);logs=logs.slice(0,14);drawLog();}

/* both relay nodes are hit every poll; the first good answer is shown, each node's latency is kept */
var lat={};
function poll(){var t0=performance.now();
 var reqs=NODES.map(function(n){var ac=window.AbortController?new AbortController():null;if(ac)setTimeout(function(){ac.abort();},12000);return fetch(n[1],{cache:"no-store",signal:ac?ac.signal:undefined}).then(function(r){var ms=Math.round(performance.now()-t0);lat[n[0]]=r.ok?ms:-1;if(!r.ok)throw 0;
  return r.json().then(function(j){j.__node=n[0];j.__ms=ms;j.__code=r.status;return j;});},function(e){lat[n[0]]=-1;throw e;});});
 return {first:Promise.any(reqs),all:Promise.allSettled(reqs)};}
var prev=null,peak=0,last=null,deltaTxt=0;
function apply(j){
 var on=j.online|0;hist.push([Date.now(),on]);hist=hist.slice(-HIST);keep("ml-online-hist",hist);
 lath.push([Date.now(),j.__ms]);lath=lath.slice(-HIST);keep("ml-lat-hist",lath);
 peak=Math.max(peak,Math.max.apply(null,hist.map(function(p){return p[1];})));
 deltaTxt=prev!=null?on-prev:0;prev=on;last=j;render(j);
 $("host").textContent="relay · "+j.__node;$("code").textContent=j.__code+" · "+j.__ms+"ms";modeDown=false;$("mode").className="md";chrome();
 log("INF",'GET /api/probe/stats <span class="h">'+j.__code+'</span> <span class="ms">'+j.__ms+'ms '+j.__node+'</span> online=<span class="r">'+on+'</span> 1h='+j.active1h+' ready='+((j.full||{}).ready|0));}
/* 2026-11-21 one panel throwing (e.g. a negative size) used to abort render() and was reported as "failed on every
   node"; now each panel draws on its own and a broken one logs "ERR render <panel>" while the others keep updating */
var badPanels={};
function safe(name,fn){try{fn();if(badPanels[name]){delete badPanels[name];log("INF",function(){return t("log.renderOk",esc(name));});}}catch(e){if(!badPanels[name]){var em=esc(String(e&&e.message||e).slice(0,80));log("ERR",function(){return t("log.render",esc(name),em);});}badPanels[name]=1;}}
function render(j){safe("kpi",function(){renderKpi(j);});safe("latency",latChart);safe("stats",function(){renderStats(j);});safe("seed",function(){renderSeed(j.seed);});safe("cardinal",function(){renderCardinal(j.cardinal);});safe("probe packs",function(){renderPacks(j);});
 safe("why",function(){renderSteps(j.steps,j);});safe("targets",function(){renderTop(j.top);});safe("now playing",function(){renderPlaying(j.playing);});
 safe("ext",function(){renderExt(j.ext);});safe("storage",function(){renderStorage(j);});safe("quota",function(){renderQuota(j);});safe("online",function(){renderRow1(j);});
 var er=j.errors||{};Object.keys(er).forEach(function(k){var v=esc(er[k]);log("ERR",function(){return t("log.server",esc(k),v);});});
 if(!j.ext)["acc","com","most","adp"].forEach(function(id){$(id).innerHTML='<div class="empty"><span class="r">'+t("log.agg",PERIOD)+'</span></div>';});}
function nodesLine(){$("node").innerHTML=NODES.map(function(n){var v=lat[n[0]];return n[0]+" "+(v==null?"--":v<0?'<span class="r">down</span>':v+"ms");}).join(" · ");
 var ok=NODES.filter(function(n){return lat[n[0]]>0;}).map(function(n){return lat[n[0]];});$("latT").textContent=ok.length?t("log.lat",Math.min.apply(null,ok)):"";}
function tick(){var p=poll();p.first.then(function(j){try{apply(j);}catch(e){log("ERR","render: "+esc(String(e&&e.message||e).slice(0,80)));}},function(){modeDown=true;$("mode").className="md err";$("code").textContent=t("st.timeout");chrome();log("ERR",function(){return "GET /api/probe/stats "+t("log.failed",PERIOD);});});p.all.then(nodesLine);}
var rz=0;addEventListener("resize",function(){clearTimeout(rz);rz=setTimeout(function(){if(last)try{render(last);}catch(e){}},120);});

function start(){var left=PERIOD;
 setInterval(function(){$("clock").textContent=new Date().toTimeString().slice(0,8);
  if(last)$("fLast").textContent=ago((last.full||{}).lastAt);
  if(--left<=0){left=PERIOD;tick();}},1000);
 log("INF",function(){return t("log.attached");});tick();}
Array.prototype.forEach.call(document.querySelectorAll(".lang button"),function(b){b.addEventListener("click",function(){setLang(b.getAttribute("data-lang"),true);});});
/* highlight the nav entry whose section is on screen */
(function(){var links=Array.prototype.slice.call(document.querySelectorAll(".nav a"));if(!window.IntersectionObserver)return;
 var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){links.forEach(function(a){a.classList.toggle("on",a.getAttribute("href")==="#"+e.target.id);});}});},{rootMargin:"-30% 0px -60% 0px"});
 ["overview","calib","comm","works","seed-admin"].forEach(function(id){var s=$(id);if(s)io.observe(s);});})();
setLang(pickLang(),false);
start();
</script>

<script>${SEED_ADMIN_SCRIPT}</script>
</body>
</html>`;
