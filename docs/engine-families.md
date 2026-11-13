# 引擎家族：哪些引擎能一起解决（2026-11-14）

查重的结论：引擎之间差别比想象的小。拆开看，一个读取器只有四块：**容器**（归档索引）、**变换**（解密 / 解压）、**文本模型**（剧本里台词怎么存）、**编码**（SJIS / GBK）。这四块现在都在共享工具包 `services/original-engines/kit.cjs` 里（E573），所以剩下的引擎按「文本模型」分家族做，一个家族一套代码，每个引擎只是一份参数表。

## 查重结果（50 个现有读取器）

| 重复的东西 | 份数 | 现在 |
|---|---:|---|
| SJIS / GBK 判定 | 12 | `kit.codepage` / `kit.decoder` |
| 假名判断正则 | 24 | `kit.KANA` / `kit.hasKana` |
| 按偏移读文件 | 25 | `kit.readAt` / `head` / `tail` |
| LZSS 解压 | 3（适配包、AST、AQUAPLUS） | `kit.lzss`，窗口 / 起点 / 填充 / 标志位顺序 / 长度位都是参数 |
| 字节 / dword 异或循环 | 18 | `kit.xor` / `kit.xorDword` / `kit.rol` |
| 归档索引解析 | 每个引擎一份 | `kit.table(file, spec)`，声明式：魔数、数量、定长 / 长度前缀 / C 串名、名字加密、偏移基准、大小取下一项 |
| scenes / archives / sources 样板 | 每个引擎一份 | `kit.engine({...})` |
| 通用假名扫描 | 2（GARbro 兜底、AST） | `kit.decodeRuns` |

已改用 kit：Majiro、Softpal、System-NNN、Liar、AST、GARbro 兜底、适配包运行时。老读取器（BGI、YU-RIS、CatSystem2 等）行为已被实机验证过，暂不动，以后改到哪个顺手迁哪个。

## 家族

### A. 字符串表 / 指针表型（`kit.stringTable` / `kit.pointerTable`）
台词集中存在一张表里，脚本按序号引用。按表顺序或按引用顺序出行即可，**不需要每个作品的完整指令表**，最稳。
- 已有：Liar（codeX RScript）、System-NNN、Softpal、AliceSoft System4（AIN MSG）、HuneX（ctd）、AQUAPLUS（KCAP）
- 待做：Yuka（.yks 数据段）、CMVS（.ps3 字符串段）、LC-ScriptEngine（.snx 字符串表，待确认）

### B. 操作码流 + 内联字符串型（`kit.opcodeWalk`）
文字直接跟在操作码后面。只要一张「操作码 → 操作数宽度」表，遍历器共用；同一家族的不同版本只是换表。
- 已有：Majiro、BGI、FVP、AdvHD、AVG32、RealLive
- 待做 **Silky 家族**：Silky's（.mes）、AI5WIN、AI6WIN —— 同一作者的工具共用一个 silky_mes 基类，操作码 1 字节，0x0A（压缩假名串）/ 0x0B / 0x33 带字符串，AI6WIN 只是另一张表 → 一个读取器 + 三张表
- 待做（调研中）：Ikura GDL（ISF）、Lucifen、KaGuYa、NEKOPACK、Tmr-Hiro、Escude（ACPX，同作者有工具）

### C. 解包后是明文脚本（`kit.lineGrammar`）
归档一解开就是带标签的文本，差别只在注释符、命令前缀、名字写法、ruby 写法 —— 都是 lineGrammar 的参数。
- 已有：KiriKiri、TyranoScript、NScripter、Artemis、Ren'Py（.rpy）
- 待做：QLIE（.s，组 3）、EAGLS（解密后明文）、Interheart（待确认）
- 这一类大多能直接做成**适配包**（容器 + 变换 + 行语法），不用发版

### D. 事件命令型（RPG Maker 家族）
台词是事件命令 401（显示文字）、102（选项）。MV/MZ 存 JSON，XP / VX / VX Ace 存 Ruby Marshal 进 rgssad 归档，**命令语义完全相同** → 共用一个事件遍历器，只加 RGSSAD 解包和 Marshal 解码。
- 已有：MV / MZ（rpgmaker.cjs）
- 待做：XP（.rgssad / .rxdata）、VX（.rgss2a / .rvdata）、VX Ace（.rgss3a / .rvdata2）

### E. 按作品密钥的归档（复用 GARbro 的方案库）
剧本格式不难，难在每部作品一个密钥。GARbro 的 `Formats.dat` 已经收了这些密钥；MeguLit 已经这样做过 KiriKiri cx（cx-schemes.json）和 Musica PAZ（paz-schemes.json）。同一做法：把对应引擎的方案导出成 JSON，读取器按目录匹配，新作品的密钥用适配包 `params` 下发。
- 适用：ShiinaRio（组 2）、Malie（组 2）、CMVS（cpz 归档）、ExHIBIT（.rld 密钥）、EAGLS（若有按作品密钥）

### F. 框架型（不是 VN 引擎）
Unity、Godot、Unreal、DxLib、Adobe AIR：剧本格式由各作品自己定，按框架内的 VN 插件做（Unity 已按 Naninovel / Utage / 各厂分开），不按引擎做。

### G. 没有公开资料，需要实物
AST 剧本、SaiSys、SystemC、Diesel、PIX STUDIO、SakanaGL、rUGP（âge 自研，体量大）、Rejet、DDSystem、Otomate / Aksys 移植。先只做检测。

## 定稿：每个引擎落到哪一族（依据 engine-readers-d / -e 的调研笔记）

| 引擎 | 归档 | 文本模型 → 家族 | 能否纯按规格完成 |
|---|---|---|---|
| CMVS | CPZ5/6/7（索引多层加密）+ PS2A（字节旋转 + 2KB LZSS） | 代码里 push 文本段偏移 → **A 字符串池** | CPZ5/6 能；CPZ7 要实物（密钥藏在 start.ps3、MD5 变体） |
| Lucifen | LPK1（两套已知方案，trie 索引，LZSS） | 重定位子表 → 资源区字符串 → **A** | 能（剧本归档不需要文件密钥） |
| KaGuYa | WFL1 / LINK3–6 | message.dat 独立字符串表 → **A** | 能 |
| LC-ScriptEngine | .lst 索引 + 无扩展名包，单字节 XOR | .snx 指令 + 长度前缀串表 → **A** | 能 |
| Yuka | .ykc | .yks 数据段串表 → **A** | 待查 |
| Ikura GDL | SM2MPX10 / DRS | [op][len] 自描述指令流，0xFF 后跟文本 → **B 记录流** | 无 SECRETFILTER 的作品能 |
| ExHIBIT | 散 rld\*.rld | 自描述 word（int/串数量在指令字里）→ **B** | 明文或已知种子能，其它要实物 |
| Tmr-Hiro ADV | .pac（无魔数） | u16 长度 + u32 操作码记录流 → **B** | 能 |
| NekoSDK | NEKOPACK4 .pak / 0xCACACA 的 .dat | ADVSCRIPT2 长度前缀命令 + 串 → **B** | 对白能，选项无资料 |
| Silky's / AI5WIN / AI6WIN | Silky arc / AI5WIN arc / AI6WIN arc | 1 字节操作码 + 内联串 → **B** | Silky、AI6WIN 能；AI5WIN 操作数有嵌套表达式，工作量大 |
| EAGLS | SCPACK.pak + .idx（MSVC rand 异或，密钥可自动求解） | 解密后明文：引号字面量 + #说话人 → **C 明文** | 能 |
| Seraph | ScnPac.dat 偏移表 + 自有 LZ | 无公开资料 → **G** | 只到归档层 + 通用扫描 |
| Interheart FPK | 三种索引 + ZLC2 | 无公开资料 → **G** | 只到归档层 + 通用扫描 |
| NekoPack 1–3 | 流加密、名字只存哈希 | 无资料 → 留给 GARbro 兜底 | — |

kit 已按笔记补上共用件（E575）：MSVC rand、密钥流异或、半字节互换、字节旋转、长度前缀记录流、GBK 补丁也能走通用扫描；CMVS 那种 2KB 窗口 / 0x7DF 起点 / 高 3 位偏移的 LZSS 就是 kit.lzss 的参数，不用另写。

## 分工（按家族，不按引擎）

| 家族 | 谁 | 模型 / 强度 |
|---|---|---|
| A 字符串池（CMVS、Lucifen、KaGuYa、LC-ScriptEngine、Yuka） | engine-readers-d | Opus 5.5 / high（CPZ 索引解密繁琐） |
| B 记录流（Ikura、ExHIBIT、Tmr-Hiro、NekoSDK）+ C 明文（EAGLS）+ G 归档层（Seraph、Interheart） | engine-readers-e | Sonnet 5.5 / medium（规格已写清） |
| B 里的 Silky 家族、D（RPG Maker，已完成）、kit 维护、汇总回归 | 本会话 | — |
| ShiinaRio、Malie、NeXAS | 组 2 | Opus 5.5 / high（按作品密钥，加密最重） |
| QLIE、Entis、AliceSoft、Marble | 组 3 | Opus 5.5 / medium |
| 按作品密钥（CMVS cpz 密钥、ExHIBIT 种子、ShiinaRio、Malie） | 各自做，但密钥表统一放成 `*-schemes.json`（仿 cx-schemes.json / paz-schemes.json），新作品密钥用适配包 `params` 下发 | — |

## 第二轮：剩余引擎 + 同人长尾（2026-11-14）

VNDB 引擎表共 617 个引擎、74083 个发行；已覆盖的 75 个占 90.9%。剩下 542 个按底层技术分：

| 家族 | 引擎数 | 发行 | 思路 | 代表 |
|---|---:|---:|---|---|
| F1 打包资源（网页 / NW.js / Electron / zip 资源） | 约 60 | 约 1500 | kit.asarList / zipList（E604）+ 按内容取文本：JSON、JS 字符串、HTML、lua；Visual Novel Maker 数据即 RPG Maker MZ → rpgmaker.cjs | Visual Novel Maker、Twine、HTML5、Construct、NVLMaker、WebGAL、Monogatari、ink、Cocos2d、LÖVE、Defold、GB Studio |
| F2 纯文本脚本 | 44 | 1091 | 一个按配置解析的读取器（kit.lineGrammar）+ 每家一份语法配置（可走适配包下发） | Yuuki! Novel、Comic Maker 1–3、Suika 2、Scenario-kun、novelty、Videotome、Kamishibai、PyWright、NVList |
| F3 制作工具二进制 | 约 30 | 约 1300 | 多为集中字符串表或 zip/自有包 + 表 | GameMaker（data.win STRG）、Macromedia Director、HSP、Clickteam、AGS、SRPG Studio、Java（jar）、GameCreator、RPM |
| F4a 私有引擎·有公开工具 | 约 25 | 约 1000 | 按工具规格逐个写，共用 kit | Luca System、Escude ACPX、PJADV、SLG System、Stuff Script、ISM、GLib2、Willadv、AI5WIN 完整、Cyberworks、DxLib、Tanuki、Yaneurao、Yeti/Regista、QuinRose、STCM2、BladeEngine、BKEngine、OROCHI |
| F4b 私有引擎·无资料 | 约 20 | 约 900 | 先调研；查不到就只做检测 + 通用扫描，列为需要实物 | SaiSys、SystemC、Diesel、SakanaGL、rUGP、PIX STUDIO、AGES Mk2、CatSystem3、N2System、SystemAoi、KID、shin、CRIware、DDSystem、Dorian |
| 不在范围 | — | — | PC-98 / 手机专用平台：hook 接不上 | ADV98V、AliceSoft System 1/2、A98SYS、Episode Interactive 等 |
| 343 个 <20 发行的小引擎 | 343 | 1404 | 只靠 GARbro + 通用扫描 | — |
