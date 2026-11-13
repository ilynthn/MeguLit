# MeguLit 引擎覆盖普查（2026-11-13）

MeguLit 对一款游戏的支持分三层：

- **检测**：`core/library.cjs` 从游戏目录认出引擎（决定库里显示的引擎名和 hook 选择）。认不出就是「未知引擎」
- **读取**：`services/original-engines/*`（经 `scenes.cjs`）或 `services/original-text.cjs` 的旧适配层读出剧本，用于零延迟双语配对
- **Hook**：LunaHook 与 `native/` 下的专用桥在游戏运行时取文本

## 数据来源

- 发行数：VNDB 引擎表（https://vndb.org/r/engines）与 kana API 计数。「日文 Win」= 含日语、Windows 平台的发行；「公司」= 其中制作/发行方是公司（VNDB producer type=co，商业作品的近似）；「公司 2016+」= 2016 年起的公司发行。同一作品的多个版本各算一次，所以是相对规模，不是作品数
- 格式：GARbro `docs/supported.html`（235 个品牌/引擎条目）、各引擎的开源工具源码（见各读取器文件头和 THIRD-PARTY.md）
- Hook 列：✅ = library 里 `hook:true`（LunaHook 有该引擎的专用 hook）；◎ = MeguLit 自己的内嵌桥；⚪ = 走通用 hook，首次游玩时确认（`hook:null`）。本轮没有实机启动游戏，hook 列不是本轮实测结果

## 图例

- 检测：✅ 原有　🆕 本轮新增或修正　❌ 认不出（显示未知引擎）
- 读取：✅ 自有读取器（零延迟配对）　🆕 本轮新增　🟡 只有 GARbro 兜底（按需下载 GARbro 解包，再做通用假名扫描：行是近似的，不保证和汉化一一配对）　❌ 读不了

## 覆盖表

| 引擎 | 日文 Win | 公司 | 公司 2016+ | 检测 | 读取 | Hook | 备注 |
|---|---:|---:|---:|---|---|---|---|
| KiriKiri / KAG | 7285 | 3158 | 1606 | ✅ | ✅ xp3（明文 / 按作品 cx 过滤 / 运行中读出）、散 .ks、多语言 xp3 | ◎ MeguLitKrkr 桥 + ✅ | Yuzusoft 等强加密 xp3 走运行中读出 |
| Unity（Utage / Naninovel / 各厂自研） | 1412 | 810 | 785 | ✅ | ✅ naninovel / unity-text / higurashi / capcom-msg / vgprompter（按框架） | ⚪ Mono/IL2CPP | 通用 Unity 剧本无统一格式，按框架逐个做 |
| YU-RIS | 852 | 480 | 318 | ✅ | ✅ ypf / YSTB | ✅ |  |
| System-NNN | 390 | 371 | 111 | 🆕（spt\ + nya\/init\） | 🆕 systemnnn.cjs：spt dword 异或、PRINT/SELECT 按命令顺序（引擎源码公开） | ⚪ | 乙女社 Mio 用 |
| Artemis | 495 | 347 | 330 | ✅ | ✅ pfs pf6/pf8、.ast、多语言 | ✅ |  |
| BGI / Ethornell | 337 | 329 | 195 | ✅ | ✅（旧适配层 bgi.cjs） | ✅ |  |
| ShiinaRio | 333 | 301 | 42 | ✅（WARC 魔数） | ✅ shiinario.cjs：WARC 1.1 原生，1.2–1.7 原生解密（shiinario-crypt.cjs，GARbro 127 作密钥，对拍逐字节一致，E602），TXT 逐行；打不开的仍经 GARbro | ✅ | 新作密钥走适配包 params:warc-scheme |
| CatSystem2 | 264 | 236 | 108 | ✅ | ✅ scene.int（含 cnscene.int） | ✅ |  |
| SiglusEngine | 223 | 222 | 154 | ✅ | ✅ Steam .dbs 多语言表、Scene.pck 内附源码 | ✅ |  |
| codeX RScript（Liar-soft） | 211 | 211 | 91 | 🆕（"LB" .xfl 归档） | 🆕 liar.cjs：scr.xfl（可嵌套）+ .gsc 字符串表 | ⚪ | 就是 Liar-soft 引擎（Liar、raiL、Studio Ubai、SUKARADOG） |
| RealLive | 220 | 207 | 21 | ✅ | ✅ Seen.txt | ✅ |  |
| Majiro | 265 | 205 | 21 | ✅ 扩展（任何名字的 MajiroArc） | 🆕 majiro.cjs：MajiroArcV1–V3 + .mjo 字节码精确遍历 | ✅ |  |
| Malie | 205 | 204 | 82 | ✅（已知密钥能开 data*.dat） | ✅ malie.cjs：LIB/LIBU/LIBP 原生，43 个作品密钥（Camellia/CFI）+ 适配包 malie-scheme，EXEC 消息表逐行 | ✅ | Karin（乙女）用（E578） |
| NeXAS (Giga) | 199 | 197 | 147 | ✅ 扩展（script.pac 且非 Softpal） | ✅ nexas.cjs：PAC（Huffman 索引、LZSS/Huffman/zlib/zstd）+ .bin 串表逐行 | ✅ | 未经实物（E577） |
| QLIE | 203 | 180 | 57 | ✅ | 🆕 qlie.cjs：pack 1.0–3.1 全部密码 + 1PC 解压 + .s 语法（E581） | ✅ | 3.0+key.fkey 的游戏密钥先取 exe 的 TFORM1，取不到用适配包 qlie-key |
| NScripter / ONScripter | 2079 | 142 | 19 | ✅ | ✅ 0.txt / nscript.dat | ✅ |  |
| AST | 155 | 141 | 0 | 🆕（无扩展名 ARC1/ARC2） | 🟡 ast.cjs：归档按规格做实（名字异或、LZSS+异或），剧本无公开资料 → 通用文本扫描 | ⚪ | 老作品（2016 后 0）；剧本语法需实物 |
| Entis GLS | 139 | 133 | 30 | 🆕 | 🆕 entis.cjs：NOA + ERISA-N + BSHF（口令取 exe 的 IDR_COTOMI）+ csx Talk/Mess/AddSelect（E582） | ✅ | csx 语法未经实物验证 |
| AliceSoft System4 / System 3.x | 143 | 127 | 27 | 🆕 | ✅ .ain（旧适配层）；🆕 alicesoft.cjs：System 3.5–3.9 的 SA.ALD + SCO 精确遍历、System39.ain；.afa 只列表（E583） | ✅ / ⚪ 3.x | System4 的 .afa/.ald 不再交给 GARbro |
| KaGuYa | 124 | 124 | 54 | 🆕 扩展（message.dat / params.dat 头、WFL1 / LINK 归档） | 🆕 kaguya.cjs：message.dat ver4（分组表）+ 早期分块格式；WFL1 / LINK3–6 里的 message.dat 也能找到 | ⚪ |  |
| Marble | 140 | 124 | 0 | 🆕 | 🆕 marble.cjs：mbl 两种索引 + 口令自动推断 + NUL 串语法（E584） | ⚪ |  |
| Ikura GDL | 124 | 123 | 2 | 🆕 | 🆕 ikura.cjs：无扩展名 SM2MPX10 / DRS 归档 + ISF 指令流（PM 0xFF 文本，按版本变换）；带 SECRETFILTER 的作品报告“需要密钥” | ⚪ | 公开资料；SECRETFILTER 作品要每作品密钥 |
| AdvHD / WillPlus | 124 | 123 | 103 | ✅ | ✅ Rio.arc .wsc | ✅ |  |
| Ren'Py | 945 | 120 | 108 | ✅ | ✅ .rpy；🆕 无源码时读 .rpyc / .rpa，编译版 tl 按 translate id 配对 | ◎ MeguLitRenpy 桥 + ✅ | 商业/Steam 版多只带 rpyc+rpa，原来读不到 |
| Softpal ADV | 119 | 119 | 82 | 🆕 修正（PAL.dll 在 dll\ 下原来认不出） | 🆕 softpal.cjs：data.pac + SCRIPT.SRC/TEXT.DAT（实机文件验证 33102 行） | ✅ |  |
| AVG32 | 111 | 110 | 0 | ✅（归为 RealLive） | ✅ TXT/SEEN.TXT | ✅ |  |
| ExHIBIT | 104 | 98 | 56 | 🆕（.rld，含 rld\ 子目录） | 🆕 exhibit.cjs：rld 自描述指令（0x1C 台词 / 0x15 选项），明文或已知种子（rld-seeds.json） | ⚪ | 2016 后仍有 56 个公司发行；未知种子报告“需要种子” |
| Bruns | 165 | 88 | 6 | 🆕 | ✅ scene/*.bso | ⚪ | 原来有读取器但库里是未知引擎 |
| SaiSys | 80 | 80 | 0 | ❌ | ❌ 需实物（E666） | ⚪ |  |
| TyranoScript | 4052 | 75 | 74 | 🆕 扩展（app.asar 读索引、package.nw） | 🆕 tyrano.cjs：散文件 / app.asar / package.nw / exe 尾部 zip | ✅（V8：nwjs/electron） | 原来被 kirikiri 读取器当 KAG 读，#名字 当正文 |
| Yuka | 66 | 66 | 2 | 🆕 | 🆕 yuka.cjs：.ykc + .yks 元素表遍历（StrOut / NameOut 的字符串常量）；选项无公开资料 | ⚪ |  |
| MAGES. | 60 | 60 | 51 | ✅ | ✅ script.mpk SC3（日版） | ◎ MAGES 内嵌 + ✅ |  |
| DxLib | 62 | 58 | 21 | ✅ | 🆕 dxlib（archive-scan.cjs）：未加密 .dxa + 通用扫描（E651）；剧本各作品自写 | ✅ |  |
| Silky's | 57 | 55 | 52 | 🆕 | 🆕 silky.cjs：Silky .arc / IFL + .mes 操作码遍历（E576） | ⚪ |  |
| EAGLS | 53 | 53 | 16 | 🆕（含 Script\SCPACK） | 🆕 eagls.cjs：SCPACK.pak+.idx（默认密钥或由全 0 尾部自动求解）、.dat 隔字节 EAGLS_SYSTEM 流异或、#说话人 + 引号字面量 | ✅ | AdvSys 变体（136000 起 "ADVSYS"）未做 |
| Musica (PAZ) | 54 | 53 | 25 | 🆕 | ✅ scr.dat / *.paz（paz.cjs） | ✅ | 原来有读取器但库里是未知引擎 |
| Seraph | 63 | 53 | 0 | 🆕（ArchPac.dat） | 🟡 seraph.cjs：ScnPac.dat 偏移表 + 自有 LZ / zlib 按规格做实，剧本语法无公开资料 → 通用文本扫描（行近似，按位置配对） | ⚪ | 需实物确认剧本语法 |
| SystemC | 53 | 52 | 33 | ❌ | ❌ 需实物（E666） | ⚪ | 2016 后 33；无公开格式 |
| RPG Maker | 752 | 46 | 44 | ✅ | ✅ MV/MZ JSON；🆕 XP/VX/VX Ace：RGSSAD + Ruby Marshal，与 MV 共用消息遍历（E574） | ⚪ MV/MZ；✅ VX/XP |  |
| CMVS (Purple) | 44 | 44 | 26 | 🆕 | 🆕 cmvs.cjs：CPZ5 / CPZ6 索引四层解密（7 种 MD5 变体自动试，cmvs-schemes.json）+ PS2A 字节旋转 / 2KB LZSS + push 字符串；CPZ7 只检测并提示需实物 | ✅ |  |
| Lucifen | 48 | 44 | 4 | 🆕 | 🆕 lucifen.cjs：SCRIPT.LPK（两套已知方案，lucifen-schemes.json；trie 索引、LZSS、条目加密）+ SOB0 / SOB2 重定位表取台词与选项 | ⚪ |  |
| Tmr-Hiro ADV | 40 | 39 | 29 | 🆕（.pac 索引自洽即认） | 🆕 tmrhiro.cjs：.pac（v1/v2）+ srp 指令流（半字节互换、“姓名,正文”、选项） | ⚪ | .pac 无魔数；TextScript（无扩展名）无可靠识别特征未做 |
| FVP (FAVORITE) | 36 | 36 | 22 | 🆕 | ✅ <名>.hcb | ✅ | 原来有读取器但库里是未知引擎 |
| Godot | 61 | 35 | 35 | 🆕 | ❌ | ⚪（LunaHook64 有 Godot2_x64） |  |
| rUGP (âge) | 34 | 33 | 7 | 🆕 | ❌ | ⚪ |  |
| Interheart FPK | 33 | 33 | 0 | 🆕（.fpk 索引自洽即认） | 🟡 interheart.cjs：.fpk 三种索引 + FPK 2.00 + ZLC2 按规格做实，剧本语法无公开资料 → 通用文本扫描 | ⚪ | 需实物确认剧本语法 |
| SakanaGL | 32 | 32 | 32 | 🆕（sakanagl.dll） | ❌ | ✅（LunaHook 有 sakanagl hook） | 2016 后 32 |
| Diesel Engine | 31 | 31 | 27 | ❌（Nitro+ NPK 条目可能已认出） | ❌ 需实物（E666） | ⚪ |  |
| AI5WIN / AI6WIN (elf/Silky) | 31 | 31 | 11 | 🆕（AI5WIN/AI6WIN.exe） | 🆕 silky.cjs：AI6WIN 完整；AI5WIN v0/v1/v2 完整语法 + .dat 包（E644） | ⚪ |  |
| LC-ScriptEngine | 41 | 30 | 0 | ✅ 扩展（lcsebody*.lst） | 🆕 lcse.cjs：.lst 索引 + 数据包（单字节密钥按长度反推）+ SNX 指令流 / 长度前缀串表 | ✅ |  |
| NEKOPACK / NekoSDK | 30 | 30 | 10 | 🆕（NekoSDK 单列） | 🆕 nekosdk.cjs：NEKOPACK4 .pak、0xCACACA .dat + ADVSCRIPT2 对白（选项无资料）；NekoPack 1–3 仍走 GARbro | ⚪ | NekoPack 1–3（名字只存哈希、流加密）是另一套引擎 |
| PIX STUDIO | 28 | 28 | 27 | ❌ | ❌ 需实物（E666） | ⚪ |  |
| GLib2 | 27 | 27 | 0 | 🆕 | 🆕 glib2：.g2/.stx 解密 + 通用扫描（E646），语法需实物 | ⚪ |  |
| ISM | 37 | 21 | 5 | 🆕 | 🆕 ism：.isa + 通用扫描（E645），语法需实物 | ⚪ |  |
| Cyberworks (C,system) | 39 | 19 | 10 | ✅ | 🆕 cyberworks：Arc0N.dat + 索引 + 通用扫描（E647），语法需实物 | ⚪ |  |
| AGES Mk2 | 20 | 19 | 19 | ❌ | ❌ 需实物（E666） | ✅（LunaHook64 Ages7） |  |
| Luca System（Prototype 新移植） | 16 | 14 | 14 | 🆕 | 🆕 luca.cjs：SCRIPT.PAK + 指令遍历（操作码无关，E642） | ⚪ | Kanon/AIR/Summer Pockets RB Steam |
| Pajamas / PJADV | 16 | 14 | 6 | ✅ 扩展（任何名字的 GAMEDAT 包） | 🆕 pjadv.cjs：GAMEDAT 包 + scenario/textdata 配对（E641） | ⚪ |  |
| LiveMaker | 1747 | 12 | 3 | 🆕 扩展（vff 归档魔数） | 🟡 GARbro（vff） | ✅ | 乙女同人第二大引擎（532 款），LSB 二进制未做 |
| Nitroplus（NPA/NPK/PAK/N4） | 12 | 12 | 0 | ✅ | ✅ npk / pak / N4；NPA 只检测 | ✅ |  |
| CatSystem3 | 12 | 12 | 12 | ❌ | ❌ 需实物（E666） | ⚪ | 2016 后 12；不是 CatSystem2 格式 |
| Unreal Engine 4/5 | 13 | 10 | 10 | 🆕 | ❌ | ⚪（LunaHook64 有 UE4/5） |  |
| Light.vn | 161 | 9 | 9 | ✅ | ❌（.vndat 带密码 zip） | ✅ |  |
| Innocent Grey (IGA) | 8 | 7 | 1 | 🆕 | ✅ script.iga | ✅ | 原来有读取器但库里是未知引擎 |
| Rejet Engine | 7 | 7 | 0 | ❌ | ❌ | ⚪ | 乙女 |
| Valkyria | 6 | 6 | 2 | ✅ | ❌ | ✅ |  |
| Wolf RPG | 208 | 5 | 5 | ✅ | ✅ Data/*.mps、CommonEvent.dat、明文 .wolf | ✅ |  |
| Leaf / AQUAPLUS | 5 | 5 | 5 | ✅ | ✅ KCAP script.pak | ✅ |  |
| HuneX | 1 | 1 | 1 | 🆕 | ✅ .hfa 多语言 ctd 表 | ⚪ | 原来有读取器但库里是未知引擎；乙女移植常见 |
| Adobe AIR / Flash | — | — | — | 🆕 | ❌ | ⚪ | 老乙女同人常见（43 款） |
| Kaleido ADV Workshop | — | — | — | ✅ | ❌ | ⚪ | MAGES/Spike 新移植 |
| DDSystem | — | — | — | 🆕 .dat DDP2/DDP3 | 🟡 ddsystem.cjs：DDP2/DDP3 + SHS + HXB 解密，剧本通用扫描（E661） | ⚪ | Daisy2 / PIL（乙女）；HXB 字节码需实物 |
| Circus (adv32) | 43 | 43 | — | 🆕 AdvData + MES/PCK 实开 | 🆕 circus.cjs：MES 31 个版本操作码表 + PCK/DAT（E660） | ⚪ | D.C. 系列；msg-tool 规格 |
| Whale | 38 | 38 | — | 🆕 .dat 哈希索引 | 🆕 whale.cjs：索引 + 剧本 zlib/异或（K 由 zlib 头反推）+ 【名】「台词」语法（E664） | ⚪ | HARUKAZE / みなとそふと |
| SystemAoi | 22 | 22 | — | 🆕 .box AOIB/AOIMY | 🟡 aoi.cjs：BOX 解包 + 通用扫描（E662） | ⚪ | SofthouseChara |
| KID Engine | 6 | 6 | — | 🆕 .dat LNK | 🟡 kid.cjs：LNK + lnd + 通用扫描（E663） | ⚪ | Ever17 / Remember11 |
| AZ System / A98SYS / Eushully / Frontwing / F&C 系 / GSD / BlueGale / CRIware | — | — | — | 🆕 GARbro 签名（E665） | 🟡 GARbro 兜底 | ⚪ | 只检测 |
| Dorian Engine / shin | 234 / 64 | 0 | 0 | — | — | — | 无 Windows 发行，不在范围 |
| Escude | — | — | — | ✅ | 🆕 escude.cjs：ESC-ARC + acp LZW + ESCR1_00 / ESCR_NEW（E640） | ✅ |  |
| minori (PAZ) | — | — | — | ✅ | ✅ scr.paz | ✅ |  |
| Spike Chunsoft WAD | — | — | — | ✅ | ✅ .lin | ⚪ |  |

排序：按「公司」列从高到低（商业作品的近似规模）。同人为主的引擎（Tyrano、LiveMaker、NScripter、Ren'Py）看「日文 Win」列

## 原来认不出、库里会显示「未知引擎」的

本轮之前 `engineOf()` 返回空的，按影响排序：

1. **MeguLit 能读却认不出**（最冤）：FVP（FAVORITE）、Innocent Grey IGA、Musica PAZ（ぱれっと）、Bruns、HuneX、Softpal（PAL.dll 在 `dll\` 下时）。本机 `E:\GAL` 的 いろとりどりのヒカリHD、虚ノ少女、ましろ色シンフォニー、ダストマニア、時計仕掛けのレイライン 实测都是这种情况，本轮已补
2. **本轮补上检测**（仍走通用 hook 或 GARbro）：System-NNN、CMVS、EAGLS、Ikura GDL、Silky's / AI5WIN / AI6WIN、KaGuYa、Lucifen、Yuka、Luca System、NEKOPACK、Marble、rUGP、Seraph、ISM、GLib2、ExHIBIT、SakanaGL、Godot、Unreal、Adobe AIR / Flash；PJADV / Pajamas 扩到任何文件名的 GAMEDAT 包，LiveMaker 加 vff 归档魔数
3. **仍然认不出**（没有公开格式资料或没有可靠特征文件）：SaiSys、SystemC、Tmr-Hiro ADV、Diesel、PIX STUDIO、AGES Mk2、CatSystem3、Kaleido ADV Workshop、Rejet Engine、DDSystem、Otomate / Idea Factory 的 PC 移植、honeybee、Interheart FPK

## 乙女（otome）专节

数据：VNDB 标签 Otome Game（g542，7112 部作品）下含日语的 Windows 发行共 3900 个。按引擎：

| 引擎 | 乙女发行 | MeguLit |
|---|---:|---|
| 未标注 | 1397 | 多为商业乙女，见下 |
| KiriKiri | 577 | ✅ |
| LiveMaker | 532 | 🟡 只有 GARbro 兜底（LSB 剧本未做） |
| TyranoScript | 478 | 🆕 本轮补上 |
| NScripter | 258 | ✅ |
| YU-RIS | 67 | ✅ |
| Ren'Py | 63 | ✅（本轮补上无源码版） |
| RPG Maker | 62 | ✅ MV/MZ |
| Unity | 60 | 按框架 |
| Comic Maker 1/2/3 | 114 | ❌ 老同人工具（F2 查不到格式，需实物） |
| Adobe AIR / Flash | 47 | 🆕 只检测 |
| System-NNN | 24 | 🆕 读取（E570） |
| BGI | 11 | ✅ |
| Malie | 6 | ✅ |
| Artemis | 5 | ✅ |

按厂商（含 Switch / Vita / PSP 移植到 PC 的版本）：

| 厂商 | PC 版引擎 | MeguLit |
|---|---|---|
| Otomate / Idea Factory（ジャコウノリラ、片恋いコントラスト 的 PC 版） | VNDB 未标注，自研引擎，无公开格式 | ❌ 需要实物（至少目录文件清单） |
| Idea Factory International（Steam：Amnesia: Memories） | Artemis | ✅ |
| Aksys / IFI 的 Steam 移植（Collar×Malice、Café Enchanté、Olympia Soirée、Piofiore、Cupid Parasite） | VNDB 未标注 | ❌ 未知，需目录清单判断；若是 Unity 则走 Unity 通用层 |
| Rejet（ALICE=ALICE、BAD MEDICINE、剣が君） | Rejet Engine（自研） | ❌ |
| HuneX / dramatic create（Steam Prison、Arcana Famiglia Rinato、明治東亰恋伽 新版） | HuneX 引擎（.hfa）或 Unity | ✅ HFA 已有读取器（本轮补检测）；Unity 版按框架 |
| honeybee / honeybee black（あやかしごはん、DYNAMIC CHORD、Blackish House） | 未标注 | ❌ 需要实物 |
| QuinRose（アリス シリーズ） | KiriKiri（部分）+ 自研 QuinRose Engine | KiriKiri 版 ✅，自研 ❌ |
| Operetta Due（越えざるは紅い花、幸ノ天秤） | YU-RIS、KiriKiri | ✅ |
| Daisy2（絶対階級学園、三国恋戦記） | DDSystem | ❌ |
| Karin Entertainment（絶対迷宮グリム、断罪のマリア） | Malie | ✅ malie.cjs（EXEC 在 exe 资源里也读） |
| Vitamin（イジって★プリンセス 等） | 未标注 | ❌ 需要实物 |
| Takuyo（怪盗アプリコット 等，2000 年代） | GSS / 未标注 | ❌ |
| Tiaramode（Butlers、Brothers、Royals） | BGI | ✅ |
| SPRAY（鬼畜眼鏡、学園ヘヴン BL） | RealLive / Siglus / AVG32 | ✅ |
| Mio（浅き夢見し） | System-NNN | 🆕 检测 + 读取（E570，未经实物验证） |
| Kirue | YU-RIS / LiveMaker | ✅ / 🟡 |
| Primula（大正×対称アリス） | 未标注 | ❌ 需要实物 |
| 道玄坂ラボ（手机移植） | 未标注，部分 Kaleido / KiriKiri | ❌ 大多未知 |
| ROSEVERTE | Unity（重制版）/ Adobe AIR（旧版） | Unity 按框架；AIR ❌ |
| Princess Crown、Imaginary Garden、Mr.Escapism 等同人乙女 | KiriKiri / LiveMaker / Tyrano / NScripter | KiriKiri、Tyrano、NScripter ✅；LiveMaker 🟡 |

**结论**：同人乙女的主力引擎里 KiriKiri、TyranoScript、NScripter 已能读，LiveMaker 是最大的缺口（532 个发行）。商业乙女反而是最大的盲区：Otomate PC 版、Aksys/IFI 的 Steam 移植、honeybee、Vitamin、Primula、Rejet、Daisy2 在 VNDB 上都没有引擎标注，也没有公开格式资料，只能从实物判断

## 缺口排名（剩余）

打分：价值 = 2016 年后公司发行 ×2 + 公司发行总数 + 乙女/同人加权；难度 = 归档是否按作品加密、剧本是否有公开资料、有没有可对照的实物

| 排名 | 引擎 | 价值依据 | 难度 | 下一步 |
|---|---|---|---|---|
| 1 | NeXAS | 197 公司 / 147 近年（最多的未读引擎） | 中：GARbro 已能解 .pac，剧本 .bin 是 SJIS 串表 | 写 .bin 解析，接在 GARbro 解包之后；需一个实物确认 .bin 布局 |
| 2 | ~~System-NNN~~ | 371 公司 / 111 近年，乙女 Mio | 已做（E570）：引擎源码公开 | 有实物可验证 |
| 3 | QLIE | 180 / 57 | 低：GARbro 解 pack 后 .s 是明文脚本 | 给 GARbro 兜底加 QLIE .s 语法（不需实物也能做，配对质量提升明显） |
| 4 | Malie | 204 / 82，乙女 Karin | 高：lib 按作品 Camellia 密钥（GARbro 有），exec.dat 字符串表 | GARbro 解包 + exec.dat 串表解析；需实物 |
| 5 | ~~codeX RScript~~ | 211 / 91 | 已做（E571）：就是 Liar-soft，.xfl + .gsc 有公开工具 | 有实物可验证 |
| 6 | LiveMaker | 1747 发行、乙女 532（公司只有 12） | 高：vff 归档 + LSB 二进制（pylivemaker 有完整规格，GPL-3.0） | 按 pylivemaker 移植 LSB 文本提取；同人免费作品多，验证容易 |
| 7 | ExHIBIT | 98 / 56 | 中：.rld 脚本 XOR | 需实物 |
| 8 | ShiinaRio | 301 / 42 | 高：WARC 按作品加密 | E602 已原生解密（127 作），GARbro 兜底保留 |
| 9 | Silky's / KaGuYa / Entis / CMVS / SakanaGL / Diesel / PIX / Tmr-Hiro | 各 30–130 | 中到高 | 逐个需实物 |
| 10 | 商业乙女自研引擎（Otomate PC、Aksys/IFI 移植、Rejet、DDSystem、honeybee） | 用户点名的乙女 | 未知 | 需要实物；先给目录文件清单即可判断引擎 |

## 本轮实现

- 🆕 **Majiro** 读取器（`majiro.cjs`）：MajiroArcV1–V3、加密/明文 .mjo、按操作数表精确遍历字节码；GBK 汉化补丁按场景配对
- 🆕 **Ren'Py 无源码版**（`renpy-rpyc.cjs` + `scenes.cjs`）：.rpyc / .rpa（RPA-2.0/3.x），自写 pickle 解码（不执行代码）；编译版 tl 按 translate id 配对，字符串表按原文配对
- 🆕 **TyranoScript** 读取器（`tyrano.cjs`）：散文件、Electron app.asar、NW.js package.nw、exe 尾部 zip；名字行、ruby、代码块、块注释；不再被 KiriKiri 读取器误读
- 🆕 **Softpal ADV** 读取器（`softpal.cjs`）：data.pac + SCRIPT.SRC / TEXT.DAT 解密；本机 時計仕掛けのレイライン 只读实测 33102 行
- 🆕 **检测表**：补齐 6 个「能读却认不出」的引擎，新认 25 个引擎
- 🆕 **GARbro 兜底白名单**：QLIE、ShiinaRio、Entis、AliceSoft、Marble、rUGP 的归档原来连兜底都进不去
- 测试：`validation/e565-engine-readers.test.cjs`，合成夹具 `validation/helpers/engine-fixtures.cjs`（按规格写的编码器：MajiroArc/mjo、zip、asar、pickle、rpyc、rpa、Softpal PAC + TEXT.DAT 加密）

为什么没走适配包：适配包（`services/adapter-packs.cjs`）是按游戏匹配的声明式数据（容器 + 变换 + 正则/串表语法），适合「已有引擎读取器、某款游戏换了密钥或布局」。新引擎需要字节码遍历（Majiro）、pickle 解码（Ren'Py）、成对文件解密（Softpal）、zip/asar 容器（Tyrano），超出包格式能力（例如 Majiro 的 1024 字节 XOR 密钥超过包的 512 位十六进制上限），所以做成内置模块。以后这些引擎里个别作品的变体可以用适配包补

## 需要实物才能完成的

- **必须有实物**：AST（剧本语法）、Malie、ExHIBIT、Rejet Engine、DDSystem、Otomate / Idea Factory PC 版、Aksys/IFI Steam 移植、honeybee、Vitamin、Primula、Kaleido ADV Workshop、SakanaGL、Luca System。其中商业乙女几项**只要目录文件清单**（`dir /s /b` 的输出，不用游戏本体）就能先判断引擎
- **有实物更稳**：NeXAS（确认 .bin 布局）、CMVS（新版 cpz7）、LiveMaker（验证 LSB 提取）
- **按规格实现、还没碰过真游戏**：Majiro、TyranoScript（asar / NW.js 版）、Ren'Py 编译版、System-NNN、codeX RScript（Liar-soft）。任何一款都可以；Tyrano 和 Ren'Py 有大量免费作品

## 第二轮 F1 打包资源（E610，webbundle.cjs）

一个模块、每个引擎一份参数；容器：散文件 / resources\app.asar / package.nw / .love / 附在 exe 后的 zip；按内容类型取文本（JS 字符串、JSON、Lua、plist、HTML、各引擎专用文法）。合成夹具 + 日文原版 / 中文补丁 1:1 配对测试：`validation/e610-bundled-assets.test.cjs`。均未碰过真游戏。

| 引擎 | 状态 | 说明 |
|---|---|---|
| Twine / SugarCube | 完整（按规格） | `<tw-passagedata>` 段落，去宏 / 链接取标签 |
| WebGAL | 完整（按规格） | scene\*.txt，说话人、intro、choose；语音参数未接 |
| Monogatari | 半成品 | js\script.js 字符串，首个 ASCII 词当说话人 |
| RenJS | 半成品 | story\*.yaml 宽松取值 |
| Narrat | 半成品 | .narrat 行内第一个引号串 |
| ink | 完整（按规格） | 编译 JSON（`^` 文本 + `\n`）和 .ink 源码 |
| Bitsy | 完整（按规格） | `DLG` 块 |
| GB Studio | 半成品 | 只读 project.gbsproj；网页导出只有 ROM：需实物 |
| GDevelop | 半成品 | data.js 的 JSON 串 + code*.js 字符串 |
| Construct | 半成品 | data.js / data.json 的 JSON 串 |
| Decker | 半成品 | .deck 字符串扫描（格式未核对） |
| Cocos2d | 半成品 | res / src 内 json / lua / plist / js；加密 .jsc / .luac 不读 |
| LÖVE | 完整（按规格） | .love（含附在 exe 后）内 lua / json / txt |
| Corona / Solar2D | 半成品 | 散 lua；resource.car：需实物 |
| Defold | 需实物 | 只做检测 + game.arcd 里未压缩的 UTF-8 串扫描（条目是 LZ4 压缩） |
| Visual Novel Maker | 半成品 | NW.js 内 MZ 格式 data → rpgmaker.cjs；VNM 自有场景格式未核对，其余 data\*.json 走 JSON 串扫描 |
| HTML5 / Electron / NW.js、O2 / Novelsphere、HTMLVN、Phaser / PixiJS、NVLMaker、CloudNovel | 半成品（通用扫描） | 脚本格式未知，只做检测 + js / json / html 通用串扫描（跳过 jquery / pixi 等库） |

## 第二轮 F2 纯文本脚本（E620，plaintext.cjs）

一个读取器 + 每个引擎一份语法配置（`services/original-engines/plaintext-profiles.json`，纯数据：注释 / 标签 / 命令前缀、带文本的命令、说话人、选项、行内标记与注音、代码块、容器、编码、检测指纹）。注册表条目由配置生成；只含一条文本规则的简单配置可用 `packGrammar()` 转成适配包 `grammar:lines` 下发。合成夹具 + 日文原版 / 中文补丁 1:1 配对测试：`validation/e620-plaintext.test.cjs`。均未碰过真游戏。

| 引擎 | 状态 | 说明 |
|---|---|---|
| Suika 2（含 OpenNovel / Polaris Engine） | 完整（按源码） | txt\*.txt 散文件或 data01.arc；2.x 起的混淆用默认密钥解开；改了密钥的作品只检测 |
| NVList | 完整（按规格） | res\*.lvn（或 res.zip）；`@` / `@@` Lua、`#` / `##` 注释、`[ ]` 行内代码、`@choice` 选项 |
| VNDS | 完整（按规格） | script\*.scr 或 script.zip；`text`、`choice a\|b` |
| PyMO | 完整（按源码） | script\*.txt；`#say`、`#text`、`#title`、`#sel` 后续行、`#select_text` |
| PyWright | 半成品 | games\…\*.txt 引号行、`nt` 名牌、`li` 选项；宏和交叉询问未细分 |
| INSTEAD | 半成品 | main3.lua / main.lua（或 zip）里含非 ASCII 的字符串字面量；跨行 `[[ ]]` 与 .idf 不读 |
| AIRNovel | 半成品 | config.anprj + mat\*.an，KAG 类标签；说话人 / 选项 / 注音标签无资料；打进 package.nw 的版本先被 TyranoScript 指纹拿走 |
| Kaleido ADV Workshop | 需实物 | 只检测（`*_info.psb.m` + `*_body.bin`，M2 PSB 加密，密钥在 exe） |
| Yuuki! Novel、Comic Maker 1/2/3、Scenario-kun、novelty、Kamishibai、Super Videotome / Videotome / Videotome:ADV、DNML、Adventure Creator (Tlaero)、Nejii、Famous Writer、恋愛シミュレーションツクール 1/2、Love Simulation Maker、NekoNovel、iFVN、Ark Script、ransel、LemoNovel | 需实物 | 查不到剧本格式也查不到可靠指纹：不检测，走 GARbro + 通用扫描；给一份目录清单（`dir /s /b`）即可先做检测 |
| Kocho、Tadasu Novel Maker、Sandbox Adventure Engine | 不在范围 | 只有手机版 / 浏览器版，没有 Windows 版 |

## 第二轮 F3 制作工具二进制（E630–E639，makers.cjs）

一个模块、每个制作工具一个读取器，全建在 kit 上；新加的 kit 共用件：`peOverlay`（exe 尾部数据）、`scan`（大文件分块找签名）、`poolLines`（字符串池取显示文本）、`textRuns`（UTF-16 / UTF-8 数据的通用扫描）。exe 尾部挂数据的引擎（HSP / Clickteam / AGS / Director 放映机）由 `makers.probes.overlayKind` 看一次 exe 尾部 1 MB 判定并缓存

| 引擎 | 状态 | 说明 |
|---|---|---|
| GameMaker | 完整（按规格） | data.win / game.unx 的 STRG 表（UTF-8），加上同目录的 json / csv / txt 等附带文件 |
| Adventure Game Studio | 完整（3.x） | exe 尾部 CLIB、ac2game.dat / game28.dta、房间 .crm 里每个编译脚本 SCOM 的字符串段；中文 .tra 补丁按原文配对（patchLines）。2.x 老游戏加密的对话选项不读 |
| Java / libGDX | 完整 | jar 里 .class 常量池的字符串字面量、.properties（\u 转义）、json / csv / xml / txt；gdx / lwjgl 等库跳过 |
| RPG Paper Maker | 完整 | Content\Datas 下所有 json 的字符串值 |
| Macromedia Director | 半成品 | .dxr/.dir/.cxt（RIFX/XFIR）与 Afterburner .dcr/.cct 的 STXT 文本演员，放映机 exe 里的影片也读；Lingo 脚本里的字符串字面量不读 |
| Hot Soup Processor | 半成品 | exe 尾部 DPMX / data.dpm 里的 start.ax：代码段按顺序取字符串操作数，包里的 txt 也读；带密钥（加密）的条目和 HSP 3.6+ DPM2 索引需实物 |
| Clickteam Fusion | 半成品 | exe 尾部 PAME / PAMU 区块（zlib、嵌套的场景区块）通用扫描；新版构建加密的区块跳过，需实物 |
| SRPG Studio | 半成品 | data.dts 工程数据：默认密钥（keyset / _dynamic）RC4 解开，UTF-16 字符串池按顺序取；自定义密钥的作品需实物 |
| MonoGame / XNA / FNA | 半成品 | Content\*.xnb（不压缩 / LZ4）的字符串、游戏程序集 #US 字面量；XNA 的 LZX 压缩不解 |
| OHRRPGCE | 半成品 | .rpg 的 .say 文本框（400 字节记录、8 行 × 38 字节，按公开格式文档）；新版记录长度未验证 |
| Unity Game Creator | 检测 | 认作 Unity (Game Creator)，走现有 unity-text |
| RPG Developer Bakin、Visionaire Studio、Smile Game Builder | 需实物 | 只检测（Bakin data.rbpack 自有加密，Visionaire .vis，SGB 以 SharpKmy*.dll 认） |
| iFAction、GameCreator（非 Unity 的同名工具） | 需实物 | 查不到文件特征，未加检测 |

### 第二轮 F4a（E640–E655，2026-11-14）

| 引擎 | 检测 | 剧本读取 | 状态 |
|---|---|---|---|
| Escude ACPX | ✅ | escude.cjs | 完整 |
| PJADV / Pajamas | ✅ | pjadv.cjs | 完整 |
| Luca System | ✅ | luca.cjs | 完整（实物待验固定参数） |
| Stuff Script（Propeller .msc） | 🆕 .mpk / msc\ | stuff.cjs | 完整 |
| AI5WIN | ✅ | silky.cjs | 完整 |
| STCM2L | 🆕 STCM2 开头的文件 | stcm2.cjs | 完整（PC 版打包方式待验） |
| Willadv | 🆕 含 WSC 的 Will ARC | advhd.cjs | 完整 |
| SLG System | 🆕 .szs / .spd+.spl | archive-scan.cjs slg：解包 + 已知 key 解密 + 通用扫描 | 半成品 |
| ISM / GLib2 / Cyberworks / Tanuki / Yaneurao / Rits / BlueGale / DxLib | ✅ / 🆕 | archive-scan.cjs：解包 + 通用扫描 | 半成品（语法需实物） |
| QuinRose 自研、Yeti/Regista、BladeEngine、BKEngine、OROCHI、MAPL、AGSI、FlixEngine、Interchannel/Prototype 旧引擎（GSD、BlueGale 的 GARbro 签名见 E665） | ❌ | ❌ | 需实物（E655） |

## 第二轮汇总（2026-11-14）

五个家族各自在合成夹具上测过，还没有拿真游戏验证

| 家族 | 完整 | 半成品（解包 / 通用扫描） | 只检测 / 需实物 | 不在范围 |
|---|---|---|---|---|
| F1 打包资源 | 5 | 11 + 一组通用 HTML5 / Electron / NW.js | 1 | — |
| F2 纯文本脚本 | 4 | 3 | 1 + 19 | 3（只有手机 / 网页版） |
| F3 制作工具二进制 | 4 | 6 | 1 + 5 | — |
| F4a 有工具的私有引擎 | 7 | 9 | 8 | — |
| F4b 无资料的私有引擎 | 2 | 3 | 8 + 9 | — |

二轮后查重（E605）：41 个读取器各自 `new TextDecoder('shift_jis')`，档案索引名「截到 NUL 再解码」也各写一遍。现在统一走 `kit.SJIS` 和 `kit.cname(b, start, end)`，archive-scan 的 rotr / rotl 改用 kit.ror / rol。各家族新加的 kit 共用件有 peOverlay、scan、poolLines、textRuns（F3），归 kit 后其余读取器都可以用
