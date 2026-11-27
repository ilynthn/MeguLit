# megulit-engine：直接读引擎剧本

状态：设计 + KiriKiri 原型（`engine/`）。原型离线运行，尚未接入应用。

## 为什么做

现在每部游戏都要单独适配：先用钩子抓文本，再跑 MeguLit-Adapter 生成 seed。慢，也容易漏（选项、说话人、注音、颜色经常要按作品补）。同一引擎的游戏其实共用同一套档案格式和剧本格式，差别多半只在密钥。

megulit-engine 是一个 Rust 库，每个 galgame 引擎一个后端：直接解包、解密、解析游戏自己的剧本，拿到每一句台词、说话人、选项、注音、颜色、语音和发行版自带的译文。运行时只需要一个很轻的钩子，告诉我们「现在是第几句」。这样同一引擎下的游戏基本不用适配。

边界：

- 只替代「读文本」这一层，不重写游戏运行时，不渲染游戏画面。
- 只读不写：不改、不解包到游戏目录，用户的游戏文件保持原样（AGENTS.md「不修改游戏数据」）。
- 输出不含本机路径和用户名，只有档案文件名和脚本名。
- 新的注入方式、新的网络服务都不在本设计范围内；需要时先由维护者决定（见「当前行同步」第 2 级）。

## crate 结构

```
engine/                       独立 crate，自己的 Cargo.lock，CI 跑 cargo test
  src/lib.rs                  核心 trait、Backend 注册、extract(dir)
  src/model.rs                统一行模型（输出 JSON 的结构）
  src/text.rs                 编码识别：BOM、UTF-8、Shift-JIS、KiriKiri 自带的加扰文本
  src/sync.rs                 LineSync trait 与文本匹配兜底 TextMatchSync
  src/kirikiri/               KiriKiri / KiriKiri Z 后端
    mod.rs                    探测、档案顺序（data < patch < patch2）、scn / ks 两条路
    xp3.rs                    XP3 档案：索引（可 zlib）、分段、Yuzusoft 哈希文件名表、Hxv4 块
    cx.rs                     cx 过滤器、Nana / Riddle 变种、HxCrypt、KiriKiri 2 无钥匙过滤器，自动选方案
    psb.rs                    PSB（E-mote / M2 二进制 JSON），含 mdf 包装
    scn.rs                    KiriKiri Z 场景文件 .scn：台词、说话人、语音、多语言槽、选项、注音
    ks.rs                     KAG 剧本 .ks：宏、说话人、颜色、注音、选项、按标签配对译文
  src/bin/megulit-engine.rs   命令行：megulit-engine dump <游戏目录> [--out f.json] [--stats] [--only a.xp3]
```

四个核心 trait（`src/lib.rs`）：

| trait | 职责 | KiriKiri 实现 |
|---|---|---|
| `Archive` | 列出条目、读出解包后（可能仍加密）的字节 | `Xp3` |
| `Decrypt` | 按条目和偏移解密，按偏移可分段调用 | `CxFilter`、`HxFilter`、`Keyless`（hash^k、rot31） |
| `ScriptParser` | 一个剧本文件 → `Script`（行 + 选项）；不是剧情脚本返回 `None` | `ScnParser`、`KsParser` |
| `LineSync` | 给出当前显示的是哪一行 | `TextMatchSync`（兜底）；指针同步见下 |

`Backend` 把这四件组合起来：`detect(dir)` 给出把握（No / Maybe / Yes），`extract(dir)` 产出 `Extraction`。新增一个引擎就是新增一个模块并在 `backends()` 里登记。

### 输出格式

```jsonc
{
  "schema": 1, "engine": "kirikiri", "format": "scn",
  "scripts": [{
    "name": "001・アーサー王ver1.07.ks", "archive": "scn.xp3", "active": true,
    "lines": [{
      "id": "001・アーサー王ver1.07.ks#4", "index": 4,
      "speaker": "運転手", "text": "「お客さんってば」", "voice": "uts001_001",
      "ruby": [["火事", "かじ"]], "color": "#9d9d9d", "page": true,
      "langs": {"en": "Excuse me, Sir.", "zh-Hans": "「先生您醒醒」", "zh-Hant": "「先生您醒醒」"}
    }],
    "choices": [{"id": "…@0", "after": 106, "options": [{"text": "正直に言う", "langs": {"zh-Hans": "说实话"}, "target": "s001*com_part_1_sel:1"}]}]
  }],
  "stats": {"archives": [{"name": "scn.xp3", "cipher": "cx:Senren＊Banka", "scripts": 86, "lines": 45188}], "lines": 54584, "ms": 3149},
  "problems": []
}
```

- `id` 在同一发行版内稳定（脚本名 + 序号），行同步和缓存都用它。
- `active`：同名脚本有多份时（patch.xp3 覆盖 scn.xp3），引擎实际载入的那份为 true。
- `problems` 非空且没有行：调用方回退旧流程。命令行退出码：0 有行；2 不认识这个目录；3 认识但没读出行（回退）；1 用法或 I/O 错误。

## 与现有代码怎么对接

### 调用方式

第一步不改 Tauri 宿主：把 `megulit-engine.exe` 当作与 HookBridge 同级的辅助程序，由 Node 服务在识别出游戏后调用一次，输出缓存到 `cache/megulit-engine/<档案大小+修改时间的哈希>.json`。之后可以把 crate 作为 `desktop/` 的 path 依赖直接链接，省掉进程和 JSON。

`services/original-text.cjs` 现在按引擎挑 JS 剧本读取器（`services/original-engines/*`）。接入方式是新增一个排在最前的提供方 `engine`：

1. 目录被某个后端认出（`detect` ≥ Maybe）→ 调用 `dump`。
2. 有行 → 转成现有提供方的结构（`lines`、`zh`、`ruby`、`voices`；`speaker`、`color` 作为新增的可选字段），阅读层接口不变。
3. 退出码 2 / 3 或 `problems` 指向的档案没读出来 → 照旧走 JS 读取器，诊断里记一条 `engine-fallback`。

### 被取代的与保留下来兜底的

| 现有部分 | 接入后 | 说明 |
|---|---|---|
| `services/original-engines/xp3.cjs`、`cx-filter.cjs`、`cx-worker.cjs`、`psb.cjs`、`yuz-names.cjs` | 并行一段时间后由 engine 取代 | 原型逐字节对齐这些读取器（cx / HxCrypt 有固定向量测试）。cx-worker 的后台 worker 和缓存版本号逻辑不再需要 |
| `scenes.cjs` 里 kirikiri / kirikiri-cx 两个提供方、`krkr-lang.cjs` | 由 engine 的 `kirikiri` 后端取代 | engine 多给出说话人、颜色、选项、英文槽 |
| `psb.cjs` 的无钥匙 PSB 恢复（`openCx`） | 保留兜底 | 表里没有密钥时它仍能从 PSB 结构猜出大部分字节；engine 报 `unknown` 时走它 |
| `kirikiri-dump`（`native/scncapture`，游戏运行时存下解密后的 .scn） | 保留兜底 | 密钥不在表里（例如サノバウィッチ的 adult.xp3 / allage.xp3）时唯一的办法 |
| 其他引擎的 JS 读取器 | 保留，按优先级逐个移植 | 每移植一个引擎，就在对比测试稳定后删掉对应 JS（AGENTS.md「被取代的旧实现须删除」） |
| LunaHook 文本钩子（`native/`、HookBridge） | 保留 | 一是文本匹配同步的输入，二是 engine 不认识的游戏照旧用它 |
| MeguLit-Adapter（`tools/megulit-adapter*`） | 范围缩小 | 对 engine 已支持的引擎，适配只剩覆盖层位置、隐藏方式等显示设置；不再需要抓台词、补选项 |
| The Seed | 保留，职责更窄 | seed 仍是每部游戏、每个版本的**显示与行为**设置（定位、隐藏、读模式等）。台词内容来自 engine，不进 seed。可选扩展 `ext.engine = {backend, cipher}` 记录已验证的后端和密钥方案，用来固定方案和统计覆盖 |
| `services/seed-catalog-engine-map.cjs` | 保留 | 引擎 → 作品数的统计来源，用于排优先级 |

单一归属：cx / HxCrypt 的参数表只有一份，即 `services/original-engines/cx-schemes.json` 和 `cx-hx-schemes.json`，engine 在编译时用 `include_str!` 读进来，不另存副本。适配包追加的方案（`adapter-packs` 的 `cx-scheme`）后续由 Node 侧作为参数传给 `dump`。

## 当前行同步

读出全部台词后，剩下的问题是「游戏现在显示的是哪一句」。分三级，从无需新注入到最精确：

**第 0 级：文本匹配（原型已实现，`sync.rs`）。** 拿现有钩子抓到的文本，在提取出的行里查找：先按规范化后的全文精确匹配；同一句出现多次（「……」「はい」）时取上一句之后最近的一处；只抓到半句时（≥4 字）做包含匹配，从上一句往后找。不需要任何新注入，现在就能用；缺点是依赖钩子文本，钩子抓不到的游戏也同步不了。

**第 1 级：读游戏自己的脚本指针（最小钩子）。** 引擎都在内存里维护「当前脚本 + 位置」：

- KiriKiri Z 场景播放器：当前 .scn 名和 `texts` 下标，正好对应 `Line.index`。
- KAG：`kag.conductor` 的 `curStorage`（当前 .ks）和 `curLine`（行号）。原型下一步会在 `Line` 里保留源文件行号，行号 → 行 id 是一次查表。

读法是在现有注入的 `megulithook` DLL 里加一个导出函数，定时（或在翻页时）读这两个值发给 HookBridge，不新增注入点，也不写游戏内存。即便如此，它仍是对游戏进程的新读取方式，按 AGENTS.md 需要先取得维护者决定，本 PR 只做设计。

**第 2 级：两者互相校验。** 有指针时以指针为准，同时拿钩子文本核对；连续若干句对不上（魔改引擎、指针含义变了）就降回第 0 级，并记诊断。没有指针也没有钩子文本的游戏，engine 至少还能提供整部作品的台词，用于查词、生词本和预读。

## 引擎优先级

作品数来自 `services/seed-catalog-engine-map.cjs`（VNDB 日文作品，2026-11-25 统计）。需求来自想玩汇总 issue #1200（99 部 / 116 条请求），按引擎归并人数；归并是按作品已知的引擎（The Seed 里已有的以 seed 为准，其余为推测）。

| 引擎 | VNDB 作品数 | #1200 需求（人次，推测归并） | 格式与加密 | 现有 JS 读取器 | 排序 |
|---|---:|---|---|---|---:|
| KiriKiri / KiriKiri Z | 4487 | 千恋＊万花 3、ファタモルガーナの館 2、9-nine- 2、サノバウィッチ 1、恋愛、借りちゃいました 1、Fate/stay night 1 等，约 10 | XP3 + .ks / .scn，cx / HxCrypt 有成表的密钥 | 有（本 PR 已移植） | 1 |
| TyranoScript | 3669 | 少 | 明文 .ks（KAG 方言）或 Electron asar | 有 | 2 |
| NScripter / ONScripter | 1445 | うみねこ 3 | 0.txt / nscript.dat，简单 XOR | 有 | 3 |
| Ren'Py | 811 | DDLC 2 | .rpy / .rpyc（pickle） | 有 | 4 |
| YU-RIS | 513 | 少（女装山脈已适配） | YPF + YSTB，每作 4 字节 XOR 键可推出 | 有 | 5 |
| Artemis | 251 | アマカノ3 2 | PFS + .ast（Lua 风格） | 有 | 6 |
| BGI / Ethornell | 117 | 素晴らしき日々 4 | ARC + 字节码 | 有 | 7 |
| SiglusEngine / RealLive | 95 / 128 | CLANNAD 2、Summer Pockets 2 | Scene.pck，每作密钥 | 有 | 8 |
| MAGES. | 39 | STEINS;GATE 4、CHAOS;CHILD 2 | MPK + SC3 | 有 | 9 |

排序原则：作品数（同引擎的覆盖面）优先，其次 #1200 的需求，再看格式是否清楚、加密是否有成表的密钥。ひぐらし（6 人次）是 Unity 移植版、沙耶の唄（2）是 Nitroplus 自家引擎，各走自己的读取器，不在本表。KiriKiri 三项都占第一，所以首个原型选它；YU-RIS 格式最简单，可作为第二个练手的后端。

## 原型：KiriKiri

### 做了什么

- XP3：v1 / v2 头、zlib 索引、分段（可 zlib）、`adlr` 哈希、Yuzusoft 明文文件名表（`sen:` / `yuz:` / `cbg:`）、Hxv4 块。
- 解密：cx（GARbro KiriKiriCx，含 Nana 随机数和 Riddle 前 8 字节）、HxCrypt（ChaCha20 索引 + 每条目 64 位密钥）、KiriKiri 2 的无钥匙过滤器（hash^k、rot31）。方案表直接用 `cx-schemes.json` 和 `cx-hx-schemes.json`（129 个 cx、32 个 HxCrypt）。
- 方案选择：抽样最多 32 个加密条目的前 32 字节，选能把最多条目解成**精确魔数**（`PSB\0`、`mdf\0`、BOM、`TJS2`、PNG、Ogg…）的方案，且必须多于原样读取的命中数。和 JS 不同，「XOR 过的 PSB」这种模式不算命中：加密的场景文件本来就带这个模式，JS 因此让正确方案和「不解密」打平，千恋＊万花 的 scn.xp3 没有选中方案，退到慢速的无钥匙恢复（29 秒，还丢了 2 个场景）。
- .scn：台词、说话人（语言槽里的名字，其次显示名）、语音、注音（`[よみ]漢字`，全角空格补齐的读音合并成词）、换行、所有语言槽（按文档的 `languages` 或槽数映射成 BCP 47）、选项（`selects`，含各语言文本和跳转标签）。
- .ks：先收集全部脚本里的宏定义；宏里的 `[hisout txt="- 名前 -"]` / `[name]` 给出说话人，`[font color=…]` 给出颜色；正文里的 `【名前】` 行、`[nm]`、`[ns]…[nse]`；`[ruby text=]` 和 `[漢字'よみ]`；`[link]…[endlink]`、`[seladd]`、只靠跳转标签命名的图形按钮 `[button target=*手を伸ばした]` 作为选项；`[if]…[endif]` 行内二选一取第一支；`[iscript]` 段和宏体不算台词；`data_jp.xp3` / `data_zh.xp3` / `data_en.xp3` 这类分语言档案按 `*label|` 配对译文。
- 多核并行解密与解析；只读，不写游戏目录。

### 验证：本机 3 部游戏，离线，不启动游戏

对照对象是现有 JS 读取器在同一份文件上的输出（`cx-worker.cjs` 的 `build`、`krkr-lang.cjs`）。The Seed 里这几部的 seed 只有显示设置、不含台词，所以台词对比只能对 JS 读取器。

- 覆盖率 = JS 读出的行（去空白后）在 Rust 输出里找得到的比例。
- 准确率 = Rust 读出的行在 JS 输出里找得到的比例。
- 用时：同一台机器，热缓存，Rust 取 3 次最短；JS 为一次 `build` 的耗时。

| 游戏 | 档案 | 密码 | JS 行数 | Rust 行数 | 覆盖率 | 准确率 | JS 用时 | Rust 用时 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 千恋＊万花（千恋万花） | scn.xp3 | cx | 44659 | 45188 | 100% | 100%（共有场景）；另多读出 2 个场景 529 行，JS 没能解密 | 29.2 s | 1.15 s |
| 同上 | patch.xp3 | cx | 14227 | 14227 | 100% | 100% | 1.90 s | 0.53 s |
| 同上 | patch_extra.xp3 | cx | 17618 | 17618 | 100% | 100% | 1.99 s | 0.48 s |
| 同上 | adult.xp3 | cx | 55726 | 55726 | 100% | 100% | 6.66 s | 1.36 s |
| サノバウィッチ（魔女的夜宴） | scn.xp3 | HxCrypt | 11463 | 11463 | 100% | 100% | 0.64 s | 0.33 s |
| ファタモルガーナの館（海市蜃楼之馆） | data_jp.xp3 + data_zh.xp3 | 无（仅有加密标记） | 47983 | 48280 | 99.998%（缺的 1 行是 JS 从坏宏里读出的标签残片） | 100% | 1.05 s | 0.90 s |

整部游戏一次读完（含探测和方案选择）：千恋＊万花 4.0 s / 54584 行（生效的场景），サノバウィッチ 1.5 s / 11463 行，ファタモルガーナの館 1.6 s / 48280 行。

JS 不提供的字段（Rust 新增）：

| 游戏 | 有说话人 | 有语音 | 自带译文 | 选项 | 注音 | 颜色 |
|---|---:|---:|---|---:|---:|---:|
| 千恋＊万花 | 38203 / 54584（「」开头的行 99.9% 有说话人，旁白 99.7% 没有） | 24421 | en、zh-Hans、zh-Hant，全部行；zh-Hans 与 JS 槽位逐行一致 | 44 | 137 行 | — |
| サノバウィッチ | 8055 / 11463（「」行 99.8%，旁白 99.9%） | 5082 | zh-Hans、zh-Hant | 11 | 24 行 | — |
| ファタモルガーナの館 | 35128 / 48280 | — | zh-Hans 47868 行、en 43035 行 | 38 | — | 12745 行（旁白灰 #9d9d9d 10982 行，另有 #9cd0e3、#ff0000 等） |

已知没读到的：サノバウィッチ 的 adult.xp3、allage.xp3 是 HxCrypt，但它们的索引密钥不在表里；JS 读取器同样读不出（运行时由 kirikiri-dump 补）。engine 把它们报为 `unknown (HxCrypt)`，不影响 scn.xp3。

### 测试

`cargo test --manifest-path engine/Cargo.toml`，CI 新增「megulit-engine (cargo test)」任务（改到 `engine/` 或两张密钥表时运行）。测试不含任何游戏数据：

- 端到端：在临时目录里合成 cx 加密的 XP3（3 个场景 + 一个覆盖它的 patch.xp3）和明文 KAG 档案（含分语言档案），走完整 `extract`，断言台词、说话人、语音、译文、patch 覆盖顺序；再合成一份没有方案能解开的档案，断言报 `unknown` 并回退。
- 与 JS 逐字节一致：cx、Nana / Riddle、HxCrypt 各用一组 JS 读取器算出的固定字节；ChaCha20 用 RFC 7539 的测试向量。写这组测试时就抓到一处移植错误（Nana 随机数里的 `(x<<18)|(x>>15)` 被误写成循环移位），真实游戏里没有用到 Nana 的作品，光靠实机对比发现不了。
- 单元：PSB 读写往返（测试用的最小 PSB 写入器）、mdf、注音合并、宏 / 颜色 / 选项 / 行内分支、按标签配对译文、文本匹配同步。

## 风险与回退

| 风险 | 怎么发现 | 怎么回退 |
|---|---|---|
| 加密变种（新作换了密钥或算法） | 抽样条目解不出精确魔数 → 档案 `cipher: unknown` | 该档案跳过，`problems` 记一条；全作没有行时退出码 3，调用方走 JS（无钥匙 PSB 恢复）或运行时 kirikiri-dump |
| 选错方案 | 方案必须让多数抽样条目出精确魔数，且多于原样读取；解析后 PSB / 文本还要过结构检查（名称表、`scenes` 类型） | 解析失败的条目不出行；行数远少于同档案条目数时可报警 |
| 魔改引擎（自定义 PSB 键名、改过的 KAG 宏） | 解析得到 0 行，或运行时文本匹配命中率低 | 回退旧流程；改动多的作品在 seed 的 `ext.engine` 里关掉 engine |
| 版本差异（Steam / DL / 汉化 / 补丁） | 档案按 data < patch < patch2 叠加，`active` 标出生效的一份；缓存键含档案大小和修改时间 | 版本变了就重新提取；行 id 只在同一发行版内稳定，跨版本不复用进度 |
| 汉化补丁把中文放进日文槽 | 日文槽大多是汉字、几乎没有假名 | 当作译文层而不是原文（JS 已有同样判断，接入时沿用） |
| 同步错位 | 指针与钩子文本连续对不上 | 降回文本匹配，记诊断 |
| 许可证 | 密钥表与算法来自 GARbro（MIT）、PSB 布局参考 FreeMote 文档 | 已在 THIRD-PARTY.md 登记；不复制无许可证项目的代码 |

## 下一步

1. 接入 `original-text.cjs`（`engine` 提供方 + 回退），在维护者本机上并行比较一段时间。
2. KAG 行保留源文件行号；做第 1 级指针同步的原型（需维护者先同意读取方式）。
3. 加密的 Yuzusoft 文件名表（`yuz:` / `dls:`）、适配包追加的 cx 方案参数。
4. 第二个后端：YU-RIS 或 TyranoScript。
5. 单独修 JS 读取器选方案的打平问题（千恋＊万花 scn.xp3 慢、丢 2 个场景），在 engine 接入前先让旧流程受益。
