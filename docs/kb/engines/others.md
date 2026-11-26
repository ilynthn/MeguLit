# 其他引擎

> 这页回答：没有单独成页的引擎各自怎么认、怎么读、画字点在哪、踩过什么坑。每节格式：识别 / 读法 / 钩子 / 隐藏 / 坑 / Seed

识别规则都在 `services/original-engines/registry.cjs`（目录指纹）和 `services/engine-fingerprint.cjs`（魔数）；画字签名在 `native/megulithook/` 和 `tools/engine-sigs/`；按版本钉死的输入诊断（`draw.<eng>Input`）默认关

## Majiro

- 识别：`scenario.arc` + `.arc`，或任何名字的 MajiroArcV 封包；魔数 `MajiroArcV`
- 读法：`majiro.cjs` 读 V1–V3 和 `.mjo` 字节码；`majiro-records.cjs` 是 opt-in，未注册
- 钩子：`MajiroDraw.h` / `MajiroDrawSig.h` 观察完整字符串画字函数（cdecl 五参数），位置在字形缓存之前；只在一个本机样本上唯一命中，22 个其他引擎程序都不命中
- 隐藏：只诊断，不隐藏
- 坑：只有一个版本；DRAWRUN 最多 240 字节，换行被压平，不是无损文本
- Seed：majiro/orange-memories、primary-step
- 文档：`side-session-notes/re-majiro.md`、`side-session-notes/re-majiro-20261122.md`、`side-session-notes/third-party-majiro-20261122.md`

## Circus（adv32 / DC4UP）

- 识别：`advdata\` 里的 mes / pck / dat / crx，或 `.mes` 并通过 `circus.cjs` probe；真实识别靠 Advdata / GRP / NAMES.DAT，旧 Circus2 模式 0 命中
- 读法：`circus.cjs` 有 MES 31 个版本的操作码表
- 钩子：stock LunaHook c3，Circus2_1 在 RVA 0x42890，USING_STRING；不要在同一字符串路径上再加钩
- 坑：名字和正文是同一个 setter → 同名流，要用模块相对上下文区分；钩子目标是 DC4UP.exe 不是 `_dstart` 启动器；NewHook 记录器不能证明实机可用
- Seed：无
- 文档：`docs/re-circus-stock-runtime.md`、`docs/third-party-circus-stock-runtime.md`、`side-session-notes/ENGINE-ADAPTATION-NOTES-CIRCUS-RUNTIME.md`

## Softpal（PAL）

- 识别：`pal.dll`（也可能在 `dll\`）、`data.pac` 魔数 `PAC `，或 data.pac + script.src
- 读法：`softpal.cjs` 读 data.pac、SCRIPT.SRC、TEXT.DAT
- 钩子：`Pal.cpp`（内嵌、ruby、pal_sprite_v1 坐标）；`PalTextBounds.h` 有界写回；DrawSites `softpal` / `softpal-2`
- 坑：1.4.10「只剩译文」：GPU 层报 unarmed，阅读层误判成游戏在画原文；修法是 unarmed + 别的路径在隐藏时走 `{elsewhere:true}`（`docs/hide-layers.md`）。译文比原文长时不写回
- Seed：softpal/tokei-jikake-no-leyline-1（レイライン 3 其实是 KiriKiri）
- 文档：`docs/re-softpal-host-input.md`、`docs/third-party-softpal.md`

## AdvHD / WillPlus

- 识别：`rio.arc`、`advhd.exe`、`rio*.arc`
- 读法：`advhd.cjs` 读 Rio .wsc；运行时 LunaHook WillPlus
- 钩子：DrawSites `advhd`；`AdvhdDraw.h` 做输入诊断，开关 `draw.advhdInput`
- 隐藏：只读流，没有隐藏能力
- 坑：字形缓存命中会绕过旧 GGO 点；23 个调用者都没分出角色
- Seed：advhd/discord-under-the-moon
- 文档：`docs/re-advhd-input.md`

## CMVS（Purple Software）

- 识别：`.cpz` 魔数 `CPZ`、`cmvs32/64.exe`、cmvs.cfg
- 读法：`cmvs.cjs` 支持 CPZ5/6；CPZ7 只检测（密钥藏在 start.ps3）
- 钩子：DrawSites `cmvs`；`CmvsDraw.h` 诊断两个全文入口，开关 `draw.cmvsInput`
- 隐藏：GPU 层在青い鳥（D3D11）上可用；最初把 9-slice 文本框边框也学进去了，修正后要求「≥60% 对齐字形」
- 坑：字形、度量、节点三层缓存都会绕过旧点
- Seed：cmvs 下 17 个（aoi-tori、hapymaher、amatsutsumi 等，都是 skeleton）
- 文档：`docs/re-cmvs-input.md`

## FVP（FAVORITE）

- 识别：`.hcb`、`fvpkernel.dll`
- 读法：`fvp.cjs` 读 `<名>.hcb`
- 钩子：DrawSites `fvp` / `fvp-bitmap`；`FvpDraw.h` 原始字节追加诊断，开关 `draw.fvpInput`
- 隐藏：GPU 层做不到（整行先在 CPU 画成图，再切 256×256 tile）
- 坑：relayout 不会再调输入入口；32 个槽分不出角色
- Seed：irotoridori-no-hikari-chs、irotoridori-no-hikari-hd、irotoridori-no-sekai
- 文档：`docs/re-fvp-input.md`

## Musica（ぱれっと，PAZ）

- 识别：`.paz`（排除 scr/sys.paz），或 scr.dat + sys.dat + st/bg.dat
- 读法：`paz.cjs`，密钥 `paz-schemes.json`
- 钩子：DrawSites `musica`；`MusicaBasic.h` 用 stock NewHook（`.message` execute），私测要设环境变量
- 坑：安装的 exe 可能打过中文补丁；不报说话人和选项
- Seed：musica/mashiroiro-symphony
- 文档：`docs/re-musica-basic.md`

## minori

- 识别：`scr.paz` / `sys.paz`
- 钩子：DrawSites `minori`；`MinoriInput.h` 诊断，栈参数是 MSVC 字符串对象不是裸 `char*`
- 隐藏：eden 正文画在 256 像素层 tile 里，GPU 层隐藏不了
- 坑：只有英文版样本
- Seed：minori/eden
- 文档：`docs/re-minori-input.md`

## Leaf / AQUAPLUS

- 识别：grp.pak、char.pak、voice/bgm/se.pak 同时存在；PC 版 WHITE ALBUM 用 `Data/Game/Script.sdat` 的 Filename 头；`wames.pak`；魔数 `Filename`、`KCAP`、`LAC\0`
- 读法：`aquaplus.cjs`（KCAP script.pak）、`aquaplus-pck.cjs`、`leaf-pak.cjs`；运行时 LunaHook Leaf
- 钩子：WA2 没有任何 GDI 文字 API（字是预渲染图集），静态做不出
- 隐藏：GPU 层不行（每行 128×40 预渲染 tile）；兜底 `native/GameTextMask.cs`
- 坑：经游戏自带 d3d9.dll 代理建临时设备会崩，只用系统 d3d9.dll；整串清空会崩（串里有控制码）
- Seed：leaf/white-album-2

## Spike Chunsoft（ダンガンロンパ）

- 识别：`dangan3win.exe`（V3）、`.wad` 魔数 `AGAR`
- 读法：`spike-wad.cjs` 读 DR1/2 的 `.lin`；`drv3.cjs` 读 CPK、SPC、STX
- 钩子：`DanganronpaPc.h` / `DanganronpaPcSig.h` 只认精确 SHA 的 DR1_us.exe，钩 LIN 0x02 handler 的 UTF-16 流，开关 `draw.spikechunsoftInput`
- 隐藏：DR1 每字一个 4 顶点 DrawIndexedPrimitive（D3D9Ex），GPU 层修正后能解码，未实机
- 坑：DR1/2 静态链接 FreeType + SDL2 + OpenGL，没有 GDI 点；V3 是 x64 且 `.text` 熵 8.0，排除；撤权后要重启游戏才能再授权
- Seed：spikechunsoft 下 DR1、DR2、V3
- 文档：`docs/engine-danganronpa-runtime.md`、`side-session-notes/re-dangan-runtime.md`

## Innocent Grey（IGA）

- 识别：`.iga` 魔数 `IGA0`
- 读法：`iga.cjs`
- 钩子：`IgaText.h` / `IgaTextPin.h` / `IgaTextSig.h`，在 plugin/Script.dll 上 NewHook，需要环境变量
- 坑：旧的 mfc-* 三点其实是补丁安装器界面不是正文；隐藏启动三次都崩
- Seed：innocentgrey/utsuro-no-shoujo
- 文档：`side-session-notes/re-iga-runtime.md`

## NScripter / ONScripter

- 识别：`arc.nsa`、`nscript.dat`、`00.txt`、`0.txt`；魔数 `ONS2`
- 读法：`nscripter.cjs` 读 0.txt… / nscript.dat（XOR 0x84），按标签分块，SJIS / GBK 按文件自动选
- 钩子：DrawSites `nscripter`，只覆盖 mode 1 的字形小图
- 坑：样本 charset 有中文编码迹象，CP932 解码未验证；页面坐标和角色未知
- Seed：kanade、tsukihime-v1-4、tsukihime-v1-6

## QLIE

- 识别：`GameData\*.pack`；魔数 `PACK`、`FilePackVer`
- 读法：`qlie.cjs` 支持 pack 1.0–3.1；3.0+ 密钥先从 exe 的 TFORM1 取，取不到用适配包
- 钩子：只有 LunaHook（「外」）；画字在 Delphi 的 TQLIE 文本对象里，要按版本找
- Seed：signal-heart-plus、tenshi-no-tamago

## RealLive / AVG32

- 识别：`seen.txt`、`reallive*.exe`
- 读法：`reallive.cjs`（依据 rlvm 规格）、`avg32.cjs`
- 钩子：DrawSites `avg32`，AVG3216D.EXE 的 TextOutA 每字一次带笔位
- 坑：UPX 压缩的中文版 exe 要运行时按值找 IAT 槽
- Seed：reallive/namida-ryuusei-no-zadoru

## AliceSoft System4 / System 3.x

- 识别：`.ain`、`.ald`、`.afa` 魔数 `AFAH`；3.x 是 system39.ain 或 `s?.ald`
- 读法：`alicesoft.cjs`（AIN MSG 字符串表）
- 钩子：`native/gpuhide/Sact2Dialogue.h` / `Sact2Draw.h` 描述的消息精灵是否属于 System4 待核实；本机没有 System40.exe 样本
- Seed：system4/rance-vi-zeth-houkai

## rUGP（âge）

- 识别：`rugp*.exe`、`ages3rest.dll`、`.rio` + `.rio.ici/ini`
- 读法：`rugp.cjs` 依据 GARbro ArcRIO；CRsa / CVmMsg3 自行逆向（`docs/engine-coverage.md` 写的「读取 ❌」早于这个文件，以代码为准，待核实）
- Seed：muv-luv、muv-luv-alternative

## LiveMaker

- 识别：`.lsb`、`live.dll`、`.dat/.ext` 魔数 `vff\0`
- 读法：`livemaker.cjs` 支持 VF100–102、LSB117、TpWord105，移植自 pylivemaker，**未注册**
- 坑：`scenes.detect` 读到一段就选它，加上 read 吞错误，直接接入会静默缺剧本；没有 Pro 加密支持
- Seed：无（乙女游戏最大缺口之一，`docs/engine-coverage.md`）
- 文档：`docs/re-livemaker-reader.md`

## ExHIBIT

- 识别：`.rld`（含 dat/rld 子目录）
- 读法：`exhibit.cjs` 读 rld 指令（明文或已知种子，`rld-seeds.json`）；RLD v3 打不开
- 钩子：stock Retouch，resident.dll 的 `RetouchPrintManager::printSub`
- 坑：可能选中历史流；HIJACK 不轮询晚加载的 resident.dll
- 文档：`docs/re-exhibit-stockhook.md`、`docs/third-party/`

## 小引擎速查

| 引擎 | 识别 | 读法 | 要点 | Seed |
|---|---|---|---|---|
| BRUNS | `scene\*.bso`、belisama.cfg | `bruns.cjs`（EENC/EENZ） | DrawSites 签在 libscr.dll（可能是中文补丁带的）；整帧 CPU 合成，GPU 层不行；FontDots 会触发字体初始化错误 | dustmania-grotesque |
| NeXAS | thumbnail/update.pac，或 script.pac 魔数不是 `PAC ` | `nexas.cjs` | BALDR FORCE EXE 强制全屏，停在启动前（`docs/nexas-normal-runtime.md`） | 无 |
| Silky's / AI5WIN / AI6WIN | `.ifl` 魔数 `IFLS`、`ai[56]win.exe` | `silky.cjs` | 无专门资料、无本机样本 | silkys/boku-no-kanojo-wa-gatenkei |
| Stuff Script（Propeller） | `.mpk` 内含 .msc，排在 MAGES 之前 | `stuff.cjs` | 无专门资料 | stuffscript/tenshi-no-hane-o-fumanaide |
| SIA-Soft | `1055.exe` + `sia.cjs` probe | `sia.cjs`（密钥在 exe .data 段） | 无专门资料 | siasoft/tenshi-tachi-no-gogo-season-2001 |
| Will ARCG | `arcg.cjs` matches | `arcg.cjs` | `native/gpuhide/LittlecheeseGdi.h` 是 littlecheese v1.00 零售版专用，与该 seed 是否同一部待核实 | willarcg/kuro-to-kin-no-akanai-kagi |
| GARbro 兜底 | 其他认不出的封包 | `garbro.cjs` + 通用假名扫描 | 只有归档层 | garbro 下 4 个 |
| Adobe AIR / Flash | — | — | 没有引擎钩子，适配不了（自动适配判 inconclusive） | 无 |

## 相关代码 / 相关文档

- 代码：`services/original-engines/`、`native/megulithook/`、`native/gpuhide/`、`tools/engine-sigs/`
- 文档：`docs/engine-draw-native.md`、`docs/engine-draw-matrix.md`、`docs/hide-layers.md`、`docs/engine-coverage.md`、`docs/engine-families.md`、`docs/re-*.md`
