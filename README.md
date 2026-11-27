<div align="center">

<a href="The%20Seed"><img src="docs/assets/the-seed.jpg" width="900" alt="The Seed"></a>

</div>

> [!NOTE]
> **The Seed**
>
> 以前一直想用一套通用内核适配所有游戏，结果修好一个，另一个游戏就又出问题了，来回很多遍都搞不好，很折磨人
>
> 所以换个做法：MeguLit 的内核和各引擎的画字函数管大框架，每个游戏、每个版本单独一份差分，这就是 The Seed
>
> - 几 KB 的纯数据，没有代码，也不会带你电脑上的路径和个人信息
> - 每个游戏只动自己那份，互不打扰。做好了的就是做好了，以后更新也不会被连累
> - 认 exe、封包、剧本指纹、Steam / VNDB 编号，补丁版、汉化版、不同发行版都能找到自己那颗
> - 玩的时候一直在自检，丢句、没选项、原文没藏住就先退回读模式并上报，我们把那份差分修好，热更新送到大家手上
>
> 现在 [`The Seed/`](The%20Seed) 里先种下了 55 部游戏。读取、自动回传和热更新从 1.4.22 起已经上线，大家玩得越多，长出来的就越多
>
> <sub>名字致敬《刀剑神域》里的 The Seed；共享的思路致敬当年大家在论坛上互相贴的 Textractor 钩子码 · Named after <i>Sword Art Online</i>'s The Seed; the sharing idea is a nod to the Textractor hook codes people used to post for each other · 名前は『ソードアート・オンライン』の The Seed から。共有の発想は、かつて皆で貼り合った Textractor のフックコードへのオマージュ</sub>

<br>

<div align="center">

<img src="docs/assets/logo.png" width="480" alt="MeguLit">

<h3>Click any word in a Japanese visual novel to look it up — translation and furigana right beside the original</h3>
<h3>在 Galgame 里点哪个词查哪个词，翻译和注音就在原文旁边</h3>

<sub>Reads text straight from the game — no OCR, no second window · 直接从游戏里读出原文，不用 OCR，不开第二个窗口</sub>

<br><br>

[![Website](https://img.shields.io/badge/website-megulit.com-e0a84b?style=flat-square)](https://megulit.com)
[![Version](https://img.shields.io/github/v/release/ilynthn/MeguLit?style=flat-square&label=version&color=e0a84b)](https://github.com/ilynthn/MeguLit/releases/latest)
[![Platform](https://img.shields.io/badge/Windows%2010%20%2F%2011-x64-3b2124?style=flat-square)](#zh-install)
[![License](https://img.shields.io/badge/license-GPL--3.0--or--later-8b1e2d?style=flat-square)](LICENSE)
[![Sponsor](https://img.shields.io/badge/%E2%99%A1-Sponsor-c8323c?style=flat-square)](https://github.com/sponsors/ilynthn)
[![QQ 群](https://img.shields.io/badge/QQ%20%E7%BE%A4-1131267542-c8323c?style=flat-square)](https://qm.qq.com/q/C95LXYb5Sg)

**[下载 v1.4.25](https://github.com/ilynthn/MeguLit/releases/latest)** &nbsp;·&nbsp; **[官网 megulit.com](https://megulit.com)** &nbsp;·&nbsp; [简体中文](#zh) &nbsp;·&nbsp; [English](#en) &nbsp;·&nbsp; [日本語](#ja) &nbsp;·&nbsp; [常见问题](#faq) &nbsp;·&nbsp; [QQ 群 1131267542](#zh-qq) &nbsp;·&nbsp; [更新日志](https://github.com/ilynthn/MeguLit/releases) &nbsp;·&nbsp; [♡ 赞赏](#support)

<br>

<img src="docs/screenshots/home.jpg" width="900" alt="MeguLit 首页">

</div>

<br>

> [!WARNING]
> 还在积极开发中，功能、数据格式和界面随时可能变 &nbsp;·&nbsp; Still in active development &nbsp;·&nbsp; 開発中です

<br>

<a id="zh"></a>

# 简体中文

## 它做什么

你照常玩日文原版，MeguLit 在旁边帮你读

- **点读**：直接点游戏里的词，读音、释义马上出来；拖一段查短语。点了不会推进剧情
- **原文**：直接从游戏里读出正在显示的台词，不截图、不 OCR，字不会认错
- **翻译和注音**：写在原文旁边，不盖住游戏画面。装过汉化补丁的话，直接用汉化组的译文，一句不等
- **AI 讲解**：选中词或整句，让 AI 讲语法和语境
- **声音**：有配音的句子播游戏原声，没配音的才用本地语音
- **学习**：查过的词进生词本，一键做成带截图和原声的 Anki 卡片；零基础可以从五十音和语法课开始

界面有简体中文、English、日本語。主要面向学日语的中文 / 英文用户，反过来用日语学中文或英文也可以

<a id="zh-new"></a>

## 最近更新

### 下个版本

- **新图标**：深石榴红的魔导书；启动画面只留进度条，结束时变成 MeguLit 标志
- **胶囊外置**：阅读层的胶囊可以拖到游戏窗口外面放，位置会记住；收起时只留一条细线，原文、注音、翻译照常显示
- **新手引导**：前 5 次进游戏会一步步介绍胶囊、Alt+T 菜单和文字设置，可以跳过，「教程」里能重看
- **热键自定义**：Alt+M / T / H / L 都能改，鼠标侧键也能绑
- **口语查词**：点读认得口语缩约和方言语尾（舐めんなし 这类）；可以导入个人辞典，也接入了 Weblio
- **零延迟汉化识别**：放在游戏目录里的汉化、汉化启动程序、借码位的外挂汉化，都能直接当译文用
- **文库和电子书**：在 MeguLit 里读轻小说和电子书，也能联网找书
- **个人中心**：官网上的个人主页：收藏的句子能点读查词，单词本和阅读进度从电脑自动同步过去
- **Alt+T 外观**：按面板分组重新排版，滑杆旁边能直接输入数字

### 已发布

| | |
|---|---|
| **内嵌显示** | 原文、注音、翻译直接画进游戏里，选项按钮也能内嵌。新支持 ファタモルガーナの館（海市蜃楼之馆）、沙耶の唄（沙耶之歌）HD、魔法使いの夜（魔法使之夜）整页、euphoria、穢翼のユースティア（秽翼的尤斯蒂娅）等 |
| **游戏原声** | 有配音的句子一律播游戏自己的 CV：CLANNAD、千恋＊万花（千恋万花）、WHITE ALBUM2（白色相簿2）等；Anki 录音自动去掉背景音乐 |
| **语法课** | 从 N5 一路到 N0（含 2025–2026 流行语），例句来自你读过的台词 |
| **新首页和日报** | 首页重做，自己挑展示的作品；「日报」看 Galgame 新闻和每日热词 |
| **零延迟翻译** | 你装过的汉化补丁直接当译文，KiriKiri、BGI、Siglus、YU-RIS、Artemis、Ren'Py 等引擎都能对上；没汉化的句子提前机翻 |
| **日文原版恢复** | Steam 中文 / 英文版一键换回日文，也能用日文原版的压缩包、文件夹或光盘镜像对照替换，全部备份、一键还原 |

更早的更新见 [Releases](https://github.com/ilynthn/MeguLit/releases)

<br>

## 功能预览

### 游戏库

<div align="center">
<img src="docs/screenshots/library-search.gif" width="820" alt="游戏库搜索">
<br><sub>每打一个字母，不相关的封面就散开，剩下的排到中间</sub>
</div>

<br>

<table>
<tr>
<td width="50%"><img src="docs/screenshots/library.jpg" alt="游戏库"></td>
<td width="50%"><img src="docs/screenshots/game-detail.jpg" alt="作品详情"></td>
</tr>
<tr>
<td><sub><b>游戏库</b> · 扫描文件夹和 Steam，系列作品自动归到一起</sub></td>
<td><sub><b>作品详情</b> · 简介、各站评分、阅读记录、关联单词和收藏的句子</sub></td>
</tr>
</table>

1. 第一次打开时选好放游戏的文件夹，MeguLit 会自动找出日文原版 EXE
2. 点封面进入作品详情，点「启动游戏」。需要转区的游戏可以单独开 Locale Emulator
3. 游戏启动后阅读层自动接上，按 <kbd>Alt</kbd> + <kbd>T</kbd> 呼出菜单

### 自动更新

<img src="docs/screenshots/auto-update.jpg" width="100%" alt="自动更新">

- 每次启动都会联网检查一次新版本，有的话直接在后台下载
- 卡片上写着版本号、更新内容，以及安装包比现在大还是小多少
- 下载有真实进度条，下完先校验，再由你选「重启并更新」或「稍后」
- 也可以随时到「关于」页点「检查更新」手动检查
- 只替换程序文件，游戏库、学习记录和设置都会保留

### 阅读层

两种显示方式，都不抢焦点，点它也不会让剧情往下走

- **内嵌**：原文、注音、翻译直接画进游戏的文本框位置，选项按钮也一样
- **阅读层**：浮在游戏上面，内嵌不了的游戏用它


- **点一下**查单词，**拖一段**查短语，离线词典
- 注音优先用游戏自带的 ruby，没有再用词典和上下文
- 翻译支持 DeepL、Bing、Google、Gemini、DeepSeek、Sakura、Ollama 和 OpenAI 兼容接口，密钥加密存在本地
- 选中词或整句，让 AI 讲语法和语境
- 有配音的句子播游戏原声，没配音的才用本地 TTS
- 每部作品单独记字体、颜色和位置

### 历史

<table>
<tr>
<td width="50%"><img src="docs/screenshots/history.jpg" alt="阅读会话"></td>
<td width="50%"><img src="docs/screenshots/dialogue.jpg" alt="对话记录"></td>
</tr>
<tr>
<td><sub><b>阅读会话</b> · 每次玩了多久、读了多少字</sub></td>
<td><sub><b>对话记录</b> · 读过的每一句原文和译文</sub></td>
</tr>
</table>

### 学习

<table>
<tr>
<td width="50%"><img src="docs/screenshots/anki.jpg" alt="Anki 复习"></td>
<td width="50%"><img src="docs/screenshots/words.jpg" alt="单词本"></td>
</tr>
<tr>
<td><sub><b>Anki 复习</b> · 直接用 Anki 的卡片和调度，评分写回 Anki</sub></td>
<td><sub><b>单词本</b> · 查过的词、读音、释义和掌握程度</sub></td>
</tr>
</table>

<img src="docs/screenshots/stats.jpg" width="100%" alt="学习统计">

<img src="docs/screenshots/stats-trend.jpg" width="100%" alt="字数走势与阅读时段">

<p align="center"><sub><b>学习统计</b> · 阅读字数、时长、查词、日历、每部作品的阅读量、字数走势、阅读时段和星期分布</sub></p>

<table>
<tr>
<td width="50%"><img src="docs/screenshots/empty-state.jpg" alt="空页面"></td>
<td width="50%"><img src="docs/screenshots/tools.jpg" alt="工具"></td>
</tr>
<tr>
<td><sub><b>空页面</b> · 告诉你这里会出现什么、怎么让它出现</sub></td>
<td><sub><b>工具</b> · 日文原版恢复、修复内嵌替换</sub></td>
</tr>
</table>

- 在阅读层查词时点「制卡」，会带上游戏截图和原声；没配音的旁白用本地 TTS 补
- Anki 需要自己安装 Anki 和 AnkiConnect，MeguLit 可以一键装好 AnkiConnect

<br>

<a id="zh-kana"></a>

## 五十音

给零基础的人：先认得每一个假名，再到游戏里把它读出来

<img src="docs/screenshots/kana-home.jpg" width="100%" alt="五十音主页">

**学习 → 五十音 → 开始学习**。主页记住你学到哪一课，右边是平假名熟悉度

<table>
<tr>
<td width="50%"><img src="docs/screenshots/kana-lesson.jpg" alt="一课"></td>
<td width="50%"><img src="docs/screenshots/kana-chart.jpg" alt="五十音图"></td>
</tr>
<tr>
<td><sub><b>一课四步</b> · 认识 → 辨认 → 回忆 → 混合。笔顺、字源、例词，还有<b>你自己玩过的游戏里</b>含这个假名的台词</sub></td>
<td><sub><b>五十音图</b> · 平 / 片假名，清音、浊音、拗音；点格子看笔顺、发音要点和易混字</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/kana-games.jpg" alt="假名游戏"></td>
<td><img src="docs/screenshots/kana-play-choice.jpg" alt="行段识别"></td>
</tr>
<tr>
<td><sub><b>假名游戏</b> · 三种玩法、四档难度，规则都写在面板上</sub></td>
<td><sub><b>行段识别</b> · 先按辅音字母选行，再按元音选段</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/kana-results.jpg" alt="结算"></td>
<td><img src="docs/screenshots/kana-records.jpg" alt="学习手帐"></td>
</tr>
<tr>
<td><sub><b>结算</b> · 达成率、判定、答题轨迹和错题分析，一键错题再挑战</sub></td>
<td><sub><b>学习手帐</b> · 熟悉度、到期复习（1 → 3 → 7 → 21 天）、个人最佳</sub></td>
</tr>
</table>

<details>
<summary><b>玩法、难度和评分规则</b></summary>

<br>

| 玩法 | 怎么玩 |
|---|---|
| 行段识别 | 看到「き」，答出 か行 · い段。键盘先按 <kbd>k</kbd> 再按 <kbd>i</kbd> |
| 前后假名 | 按 あいうえお…わをん 的顺序说出前一个和后一个，空位直接跳过 |
| 平片转换 | 看平假名写片假名，反过来也一样。可以用日语输入法（<kbd>F7</kbd> / <kbd>F6</kbd>），也可以按 <kbd>K</kbd> 打开屏幕假名键盘 |

| 难度 | 规则 |
|---|---|
| 入门 | 只考学过的假名，不限时，每题可看提示 |
| 标准 | 全部清音，每题限时，整局 3 次提示 |
| 进阶 | 加入浊音、拗音和易混字，限时更短 |
| 挑战 | 总计 90 秒，错 3 次结束，没有提示 |

- 每道题是一个音符：普通假名算 TAP，最容易认错的几组（シ / ツ、ソ / ン、ぬ / め、ね / れ / わ…）算 **BREAK**，分量是 5 倍
- 答得快是 CRITICAL PERFECT，稍慢 PERFECT，再慢 GREAT；用了提示算 GOOD，答错或超时算 MISS
- 基础 100% 加 BREAK 奖励最多 1%，**满分 101.0000%**，评级从 SSS+ 到 D

快捷键：<kbd>Enter</kbd> 下一个，<kbd>Space</kbd> 发音，<kbd>←</kbd> <kbd>→</kbd> 切换假名，答题时按 <kbd>1</kbd>–<kbd>4</kbd>

</details>

<img src="docs/screenshots/kanji.jpg" width="100%" alt="汉字读音">

<sub><b>汉字读音</b> · 学完假名可以玩《漢字でGO!》。MeguLit 只是在窗口里原样打开 PLiCy 上的官方页面（作者 Micelle，含广告），<b>不是 MeguLit 的一部分</b>；不想在 MeguLit 里玩，可以点「在浏览器打开」</sub>

<br><br>

<a id="zh-install"></a>

## 安装

> [!IMPORTANT]
> **游戏剧情必须是日文原文**。MeguLit 读的是游戏正在显示的台词，剧情被汉化后读到的就不是日文。只汉化了菜单、剧情仍是日文的游戏不受影响；汉化版可以先试试「工具 → 日文原版恢复」

1. 去 [Releases](https://github.com/ilynthn/MeguLit/releases/latest) 下载 `MeguLit-v1.4.25-win-x64.zip`，完整解压后双击 `Install MeguLit.cmd`。确认安装后，安装程序会按需安装包内的微软 Visual C++ x64 运行库
2. 第一次启动会弹出安装窗口，马上开始下载运行组件（约 565 MB，含注音词典和 AivisSpeech 语音引擎，需要约 1.8 GB 空间）。下载的同时选好安装位置和快捷方式，点「安装」，下完自动装好；中途关掉，下次打开会接着下
3. 选好放游戏的文件夹，等游戏库扫描完
4. 点一部作品 →「启动游戏」，**用窗口模式玩**
5. 零基础的话，先去 学习 → 五十音

之后每次启动会自动检查更新，只换程序文件，游戏库、学习记录和设置都保留

需要 Windows 10 / 11 x64 和 Microsoft Edge WebView2 Runtime

<br>

<a id="zh-qq"></a>

## 交流群

<a href="https://qm.qq.com/q/C95LXYb5Sg"><img src="docs/assets/qq-group-qr.png" width="200" alt="MeguLit QQ 群 1131267542 二维码"></a>

QQ 群：**1131267542** &nbsp;·&nbsp; 手机 QQ 扫码，或者[点这里用网页加群](https://qm.qq.com/q/C95LXYb5Sg)

遇到问题、想适配的游戏、学日语的心得，都可以来群里说。MeguLit 首页 The Seed 旁边的「QQ 群」胶囊也有这张二维码，「用电脑 QQ 加群」能直接打开电脑 QQ 的加群窗口

<a id="faq"></a>

## 常见问题

<details open>
<summary><b>全屏玩的时候翻译显示不全，或者文字跑到了桌面上</b></summary>

<br>

请把游戏切到**窗口模式**。独占全屏下游戏会盖住其他所有窗口，阅读层没法稳定地画在游戏上面。窗口拉大一点也没关系

</details>

<details>
<summary><b>读到的是乱码，或者根本不是日文</b></summary>

<br>

剧情必须是日文原文。汉化版先试试「工具 → 日文原版恢复」；乱码的话在 <kbd>Alt</kbd> + <kbd>T</kbd> 里重选文本流

</details>

<details>
<summary><b>更新会不会弄丢我的数据</b></summary>

<br>

不会。自动更新只替换程序文件，`data`、`logs`、`cache`、`runtime`、`models` 都不碰。旧的 `MeguLit.exe` 还会留一份 `MeguLit.rollback-update.exe`

</details>

<details>
<summary><b>Anki 连不上</b></summary>

<br>

先打开 Anki，并装好 AnkiConnect（MeguLit 里可以一键安装）。端口 8765 被别的程序占用也会连不上

</details>

<details>
<summary><b>某个游戏读不到文字</b></summary>

<br>

不同引擎差别很大。请在「关于 → 一键上传问题反馈」告诉我们，或者在 [Issues](https://github.com/ilynthn/MeguLit/issues) 留下游戏名

</details>

<br>

## 支持哪些游戏

KiriKiri、YU-RIS、Artemis、BGI、Siglus、Ren'Py、Unity 等主流引擎都能读。每个引擎能做到哪一步（读原文、对汉化、内嵌），见 [引擎覆盖表](docs/engine-coverage.md)

读不到的游戏请在 [Issues](https://github.com/ilynthn/MeguLit/issues) 留下游戏名

## 现在能做什么

| 功能 | 状态 | 说明 |
|---|:---:|---|
| 抓取游戏文本 | ✅ | 基于 LunaHook 和自有读取器，自动挑文本流，不对可以手动换 |
| 内嵌显示 | ✅ | 原文、注音、翻译画进游戏；选项按钮也支持 |
| 阅读层 · 注音 · 点读 | ✅ | 游戏自带 ruby 优先；点读不推进剧情 |
| 汉化补丁对照 | ✅ | 已装的汉化当译文，零延迟 |
| 实时翻译 · AI 讲解 | ✅ | 多家翻译和大模型接口，密钥加密存在本地 |
| 游戏原声 · 本地语音 | ✅ | 有配音播原声，没配音用本地 TTS |
| 生词本 · Anki | ✅ | 单词、例句、回收站；制卡带截图和原声 |
| 游戏库 · 启动器 | ✅ | 扫文件夹和 Steam，自动认日文原版 EXE |
| 学习统计 · 等级段位 | ✅ | 年 / 月 / 周 / 日，每块单独切换 |
| 五十音 · 语法课 | ✅ | 25 课五十音、三个小游戏；语法 N5–N0 |
| 自动更新 · 备份恢复 | ✅ | 只换程序文件；备份恢复失败自动回滚 |
| 本地翻译模型 | ✅ | 需要显卡，在设置里下载 |

## 接下来

- [ ] **第四个假名小游戏：太鼓风节奏游戏**，随机用你装的 Galgame 的 BGM，检测 BPM 和鼓点，跟着节奏认假名
- [ ] 五十音学习的英文、日文界面
- [ ] 保住游戏原生 LOG 里的原文；开场、章节标题、独立字幕
- [ ] 联网排行榜：阅读量、生词数、连续打卡天数
- [ ] 更多学习语言，以及 Galgame 以外的游戏

## 从源码构建

```powershell
.\Build.ps1 -Check
```

需要 Rust（Tauri）、Node.js 和 .NET Framework 的 C# 编译器

只跑测试：`.\Build.ps1 -TestsOnly` 跑全部；`.\Build.ps1 -TestsChanged` 只跑和 origin/main 相比改动涉及的测试，改到测试运行器、CI 配置这类公共部分时自动跑全部

## 致谢

[LunaHook](https://github.com/HIllya51/LunaHook)（文本 Hook）· [JMdict / EDRDG](https://www.edrdg.org/jmdict/j_jmdict.html)（词典）· [SudachiDict](https://github.com/WorksApplications/SudachiDict)（分词）· [KanjiVG](https://kanjivg.tagaini.net/)（© Ulrich Apel，CC BY-SA 3.0，笔顺）· [AivisSpeech](https://aivis-project.com/)（语音）· [Tauri](https://tauri.app/) · [Anki](https://apps.ankiweb.net/) & AnkiConnect · [Tomoyo](https://github.com/46daishi/tomoyo)（最早的灵感）

推荐游戏：[漢字でGO!](https://plicy.net/GamePlay/155561)（Micelle · PLiCy），只是推荐，与 MeguLit 无关

GPL-3.0-or-later，见 [LICENSE](LICENSE)；第三方组件按各自许可证，见 [THIRD-PARTY.md](THIRD-PARTY.md)

<br>

---

<a id="en"></a>

# English

**You play the Japanese original. MeguLit reads along with you.**

- **Click to look up**: click any word in the game for its reading and meaning, drag for a phrase. Clicking never advances the story
- **Original text**: read straight from the game, no screenshots or OCR, so no misread characters
- **Translation and furigana**: drawn beside the original, never covering the picture. If you have a translation patch installed, its wording is used with zero delay
- **AI explanations**: select a word or line and ask about grammar and context
- **Voice**: voiced lines play the game's own voice; local speech only fills in unvoiced lines
- **Learning**: looked-up words go to a word list and become Anki cards with a screenshot and the original audio; beginners can start with kana and grammar lessons

### Recently

| | |
|---|---|
| **In-game display** | Original, furigana and translation drawn inside the game, choice buttons included. New: The House in Fata Morgana, The Song of Saya HD, Witch on the Holy Night (full page), euphoria, Eustia and more |
| **The game's own voice** | Voiced lines always play the original cast (CLANNAD, Senren＊Banka, WHITE ALBUM2…); Anki recordings drop the music |
| **Grammar lessons** | N5 to N0 (with 2025–2026 slang), examples taken from lines you have read |
| **Translation patches as translation** | A patch you already have becomes the translation, no waiting; untranslated lines are machine-translated ahead of time |
| **Restore Japanese** | Switch Steam Chinese / English releases back to Japanese, with backups and one-click undo |

Supported engines and what works for each: [engine coverage](docs/engine-coverage.md)

<table>
<tr>
<td width="50%"><img src="docs/screenshots/library-search.gif" alt="Library search"></td>
<td width="50%"><img src="docs/screenshots/stats.jpg" alt="Statistics"></td>
</tr>
<tr>
<td><img src="docs/screenshots/kana-lesson.jpg" alt="Kana lesson"></td>
<td><img src="docs/screenshots/kana-results.jpg" alt="Kana results"></td>
</tr>
</table>

### Install

1. Download `MeguLit-v1.4.25-win-x64.zip` from [Releases](https://github.com/ilynthn/MeguLit/releases/latest), extract the entire archive, and run `Install MeguLit.cmd`. After you confirm, Setup installs the bundled Microsoft Visual C++ x64 Runtime if needed
2. The setup window starts downloading the runtime components at once (about 565 MB, with the furigana dictionaries and the AivisSpeech voice engine). Pick the install folder meanwhile and press *Install*
3. Choose your game folder, pick a game and press *Launch*. Play in **windowed mode**. Press <kbd>Alt</kbd> + <kbd>T</kbd> for the menu

The game's story text must be the original Japanese. Needs Windows 10 / 11 x64 and the WebView2 Runtime. MeguLit updates itself; only program files are replaced.

### FAQ

- **Translations cut off, or text on the desktop in fullscreen?** Play in **windowed mode**. In exclusive fullscreen the overlay cannot stay on top of the game.
- **Garbled text?** The story must be in Japanese. Otherwise re-pick the text stream from <kbd>Alt</kbd> + <kbd>T</kbd>.
- **Does an update delete my data?** No. Only program files are replaced.

GPL-3.0-or-later · [LICENSE](LICENSE) · [THIRD-PARTY.md](THIRD-PARTY.md)

<br>

---

<a id="ja"></a>

# 日本語

**日本語の原版をそのまま遊び、MeguLit が横で読むのを手伝います**

- **クリックで辞書**：ゲーム内の単語をクリックすると読みと意味がすぐ出ます。ドラッグでフレーズも。クリックしてもシナリオは進みません
- **原文**：ゲームから直接テキストを取得。スクショも OCR も使わないので読み違いがありません
- **翻訳とふりがな**：原文の横に表示し、画面を隠しません。翻訳パッチがあれば、その訳を待ち時間なしで使います
- **AI 解説**：単語や一文を選んで文法やニュアンスを質問
- **音声**：ボイス付きの文はゲーム本来のボイスを再生。ボイスのない文だけローカル音声で補います
- **学習**：調べた単語は単語帳へ。スクショと原音付きの Anki カードも作れます。五十音と文法講座もあります

### 最近の更新

| | |
|---|---|
| **ゲーム内表示** | 原文・ふりがな・訳文をゲームの中に直接描画、選択肢にも対応。ファタモルガーナの館、沙耶の唄 HD、魔法使いの夜（全画面）、euphoria、穢翼のユースティアなどに新対応 |
| **ゲームのボイス** | ボイス付きの文は必ず原作のキャストで再生（CLANNAD、千恋＊万花、WHITE ALBUM2 など）。Anki の録音は BGM を除去 |
| **文法講座** | N5 から N0 まで（2025–2026 年の流行語も）。例文はあなたが読んだ台詞から |
| **翻訳パッチをそのまま訳文に** | 手元の翻訳パッチの訳を待ち時間なしで表示。訳のない文は先に機械翻訳 |
| **日本語原版に戻す** | Steam の中国語 / 英語版を日本語に戻せます。すべてバックアップし、ワンクリックで元に戻せます |

対応エンジンと機能ごとの対応状況：[エンジン対応表](docs/engine-coverage.md)

<table>
<tr>
<td width="50%"><img src="docs/screenshots/kana-home.jpg" alt="五十音"></td>
<td width="50%"><img src="docs/screenshots/kana-records.jpg" alt="学習手帳"></td>
</tr>
</table>

### インストール

1. [Releases](https://github.com/ilynthn/MeguLit/releases/latest) から `MeguLit-v1.4.25-win-x64.zip` をダウンロードしてすべて展開し、`Install MeguLit.cmd` を実行。インストールの確認後、必要に応じて同梱の Microsoft Visual C++ x64 ランタイムがインストールされます
2. 初回セットアップを開くとすぐコンポーネント（約 565 MB）のダウンロードが始まるので、その間にインストール先を選んで「インストール」を押す
3. ゲームフォルダを選び、作品を選んで「ゲーム起動」。**ウィンドウモード**で遊んでください。<kbd>Alt</kbd> + <kbd>T</kbd> でメニュー

シナリオ本文は日本語原文である必要があります。Windows 10 / 11 x64 と WebView2 Runtime が必要です。アップデートは自動で、プログラムだけを置き換えます

### よくある質問

- **フルスクリーンで翻訳が欠ける・文字がデスクトップに出る**：**ウィンドウモード**で遊んでください。排他フルスクリーンではオーバーレイを前面に保てません
- **文字化けする**：本文が日本語か確認し、<kbd>Alt</kbd> + <kbd>T</kbd> からテキストストリームを選び直してください
- **アップデートでデータは消える？**：消えません。プログラムだけを置き換えます

GPL-3.0-or-later · [LICENSE](LICENSE) · [THIRD-PARTY.md](THIRD-PARTY.md)

<br>

---

<a id="support"></a>

<div align="center">

# ♡ Support MeguLit

和 Bug 魔王军的战斗还在继续，冒险经费倒是快见底了……(›´ω`‹ )

如果 MeguLit 为你的日语学习带来了一点帮助，欢迎赞助一点厄里斯，支持项目继续开发！

**每一份支持，都能让这场冒险走得更远 ヾ(≧▽≦*)o**

<br>

<img src="docs/assets/sponsor/support-card.png" width="680" alt="支付宝 / 微信赞赏码">

<br><br>

MeguLit is free, open source, and built in my spare time.<br>
If it helped you read a few more lines in Japanese, a small sponsorship keeps the updates coming.

[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor%20on%20GitHub-c8323c?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/ilynthn)

<sub>Every Eris counts ♡</sub>

</div>

---

<div align="center">
<sub>Made by <a href="https://github.com/ilynthn">ilynthn</a> with love, caffeine, and a concerning number of bugs ✦</sub><br>
<sub>Free code signing provided by <a href="https://about.signpath.io">SignPath.io</a>, certificate by <a href="https://signpath.org">SignPath Foundation</a> · <a href="docs/CODE-SIGNING.md">Code signing policy</a></sub>
</div>
