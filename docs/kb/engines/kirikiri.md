# KiriKiri（KAG3 / KiriKiri Z / TextRender / 非 KAG）

> 这页回答：KiriKiri 游戏怎么认、怎么读、怎么藏原文；KAG 和非 KAG 有什么区别；踩过哪些坑

## 识别

- 目录：`.xp3`（`services/original-engines/registry.cjs`）；魔数 `XP3\r\n`、`TJS2`（`services/engine-fingerprint.cjs`）
- VNDB 里日文发行最多的引擎（7285，`docs/engine-coverage.md`）

## 读原文

- **运行时（内）**：`native/krkrtext`（MeguLitKrkr32/64.dll）在游戏线程里用 `Scripts.eval` 跑 `script.inc`
  - KAG 路线：包 `processCh` / `clear` / `showLineBreak` / `showPageBreak`
  - TextRender 路线：包 `trDone` / `nameScan` / `trLinkScan`
  - 通过管道上报 `ToMe_CHARS`（`docs/engine-draw-matrix.md`、`native/krkrtext/KrkrText.cpp`）
- **离线**：reader `kirikiri`（明文 xp3、散 .ks）、`kirikiri-lang`（多语言 data_jp/zh.xp3）、`kirikiri-cx`（加密 .scn）、`kirikiri-dump`、`kirikiri-ks`（`services/original-engines/scenes.cjs`）
- **cx 加密**：`cx-filter.cjs` 移植 GARbro KiriKiriCx，参数在 `cx-schemes.json` / `cx-hx-schemes.json`；魔法使いの夜这类单字节 XOR 用 `ks-cx.cjs` 从文本反推密钥
- **Hxv4（cxdec v2，サノバウィッチ）**：只能冷启动游戏，ColdCapture 加载 MeguLitScn.dll 钩 `TVPCreateIStream` 抓 `.scn`（`services/kirikiri-cold.cjs`、`native/scncapture/`）

## 角色判定

高度不到屏幕 20% 的层算名字；`inLink` 算选项；`ButtonLayer.caption` 算按钮；有显式 link 归属时优先于 20% 启发式（`docs/engine-draw-protocol.md`、`side-session-notes/KAG-ruby-result-7ff69e9a.md`）

## 藏原文 / 内嵌

- KAG：krkr 层用 opacity 0 画；内嵌在点击等待时由 MessageLayer 自己的 drawText 画注音和中文
- TextRender 遇到 `backlay` + `trans`（背面层复制到正面）：把记录挪到正面孪生层并把该层 textLayer 置透明（#1124 #1125，`side-session-notes/ENGINE-ADAPTATION-NOTES-c-draw.md`）
- ruby 超过 28000 单元只丢 ruby（`docs/kag-renpy-ruby-integration.md`）

## 非 KAG KiriKiri（no-KAG）

有些 KiriKiri 游戏不用 KAG3，而是自家消息系统逐字调 `Layer.drawText`，没有 `global.kag`，KAG DLL 会一直停在 `krkr wait kag`。代表：オルフレール（orfre.exe）。以下结论来自分支 `krkr-drawtext` / `krkr-native-nodraw` / `reader-nodraw`，**截至 2026-11-27 未合入 main**

- **闸门**：只有 KAG DLL 报 `wait kag` 满 20 秒且没报过别的状态才走 no-KAG 路线（`KrkrNoKag`），KAG 游戏不受影响
- **正文来源**：DrawText 流（`tTVPNativeBaseBitmap::DrawText`）字符双发（「私私もも」），要逐字双发去重；抢选优先级 KiriKiri2 > KiriKiri1 > DrawText；改名框线程 3 句后被换掉
- **接句**：LunaHook 逐字片段按句接合（到 。！？」』 或 1.2 秒无新片段）；新行开头（「『（、全角空格）或超过 400 字先结束上一句（否则快进下拼成 4000 字长行）
- **选项**：两个选项可能拼成一条，按 ……/「/（ 等开头标记拆开
- **源头不画**：LunaHook 用户码不能带写回标记（`EHQXN0@…` 报「特殊码无效」），所以要在 MeguLitHook32 里注册：`MeguLitDrawSkip.h` 登记「怎么找画字对象、怎么把文本换成空」，`texthook.cc` 对不可写回、被宿主打开的流调用它；没注册的钩子零开销返回
  - オルフレール 的 DrawText 是图层级（Borland 寄存器调用 eax/edx/ecx = this/x/y，text 在 stack[9]），换成空 ttstr 最干净
  - 线程拆分值是 y：一页正文分三条线程，锁正文要锁一组线程
  - 第一次 `MeguLit_DRAWSKIP hit` 把所选流标 hide-only，计数记在 `drawSkipped`
  - 实机：Cardinal 实屏「原文可见」从 7 张里 3 张降到 10 张里 2 张（剩下是选项画面，选项本来要保留原样）
- **阅读层跟进**：源头不画后字形层 `hideSeen` 永远 false，placement 误判「游戏自己画」只画中文 → `HookNative.drawSkipping()` 经 gal-native 告诉 placement 这行由阅读层画（`validation/source-skip-reader-draws.test.cjs`，分支 `reader-nodraw`）
- **GDI 隐藏确认不稳**：KiriKiri 用 GetGlyphOutline 逐字画，按行匹配的 GPU / glyph 隐藏常对不上，三局里只有一局确认过

## 已知坑

- 千恋＊万花和ファタモルガーナの館的修复曾放在共享代码里互相打坏 → 单作修复只进游戏差分（`core/profiles/engines/kirikiri.cjs` 注释）
- 猜出来的 `trPark` / `trResume` 曾让游戏进 OP 卡死，已撤销；教训是先用 debug DLL 确认再修（`ENGINE-ADAPTATION-NOTES-c-draw.md`）
- #1118：去标点比较后，原生行和名字牌不再被当成选项
- ファタ验收检查 7 曾在 CI 偶发失败：本地中文约 290 ms 到，CI 忙时晚于 400 ms，改成 1 秒后开始判（#1011）

## 代表游戏（The Seed/kirikiri，20 个）

senren-banka（verified）、fata-morgana（owner-ok，版本层开了 `roles:true`）、shiniyuku-kimi（read）、sanoba-witch、cafe-stella 等

## 相关代码 / 相关文档

- 代码：`native/krkrtext/`、`native/scncapture/`、`services/original-engines/{xp3,cx-filter,ks-cx,krkr-lang,scenes}.cjs`、`services/kirikiri-cold.cjs`、`core/profiles/engines/kirikiri.cjs`、`tools/reader-replay/krkr-model.cjs`
- 测试：`validation/krkr-ruby-wire.test.cjs`、`validation/krkr-double-draw.test.cjs`、`validation/fata-native-ruby.test.cjs`、`validation/fata-seed-keeps-hide.test.cjs`、`validation/fixtures/games/fata-morgana/`
- 文档：`docs/engine-draw-matrix.md`、`docs/kag-renpy-ruby-integration.md`、`side-session-notes/ENGINE-ADAPTATION-NOTES-c-draw.md`、`side-session-notes/KAG-ruby-result-7ff69e9a.md`、`side-session-notes/TextRender-roles-result-ec6a304b.md`
