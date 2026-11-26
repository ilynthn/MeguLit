# 阅读层排版

> 这页回答：阅读层的日文 / 注音 / 译文怎么摆、已读未读颜色、换行规则、Alt+T / Alt+H、源头不画时谁画日文

## 验收标准（产品要求）

- 一句只画一次，不复读
- 已读 / 未读样式和游戏自己一样
- 中文字号和位置稳定：只有放不下的那一句才缩小；显示器上还有地方就不挤压译文
- 双语：日文在上、中文在下，译文背后不加暗底，不做位图描边
- 每部作品单独记字体、颜色、位置；**用户自定义不回写 seed**

## 关键模块

| 文件 | 职责 |
|---|---|
| `web/reader/index.html` + `bootstrap.js` | 阅读层入口，经 `__TAURI_INTERNALS__.invoke('service', …)` 和服务端通信；模块清单 `modules.json` / `module-list.js` |
| `web/reader/modules/text-place.js` | overlay placement 前端：按引擎报的字框摆日文、注音、译文；`cnSplit` 译文按日文行数断行并防孤字（#1191）；`rowBreaks`（「日文只占一行」）；`pin()` 锚定；`userRowLayout` 用户换行宽度 / 行距（#1137）；`gameDrawn` 判断这句是不是游戏自己画；破折号颜色 `applyDashColor`（#1190） |
| `web/reader/modules/gal.js` | gal 模式主体；已读 / 未读颜色 CSS（`body.tome-line-read` 用 `--tomoyo-gal-read-color`）；ruby 注音和摆位 |
| `web/reader/modules/hook-reader.js`、`text-position.js` | 已读状态（`hookSourceRead`、`lineReadDrawn` / `applyRead`）和逐句生长 |
| `core/overlay-placement.cjs` | 把 `hookCharRects` 和 `hookGlyphDots` 合成每句一条 `textPlace`；`gal-preferences.json textRenderer === 'compositor'` 时走这条（默认） |
| `core/compositor-host.cjs` | 捕获合成器（架构②），默认关，`MEGULIT_CAPTURE_COMPOSITOR=1` 打开 |
| `web/reader/modules/menu-layout.js`、`altt-compact.js` | Alt+T 菜单布局 |
| `web/reader/modules/capsule.js` | Alt+T 常驻胶囊：三种风格，默认顶部灵动岛（#1138，PR #1263） |

注意：`core/layout.cjs` 不是文字排版，是安装目录布局（root、config、logs、runtime 等路径）

## 热键（`native/GalWindowBridge.cs`）

Alt+T 菜单；Alt+H 遮盖层显示 / 隐藏（`ToggleCover`）；Alt+M 绑定游戏窗口；Alt+L 外置 LOG。Alt+T 或点读卡打开时释放游戏的 ClipCursor（#1144，隐藏鼠标的游戏里也能改设置）

## 源头不画时谁画日文

引擎在源头不画原文时，字形层收不到「被隐藏的字形」，placement 会误判「游戏自己画」只画中文。分支 `reader-nodraw`（未合入 main）：`HookNative.drawSkipping()` 经 gal-native 告诉 placement 这一行由阅读层画（`validation/source-skip-reader-draws.test.cjs`）。见 [engines/kirikiri.md](engines/kirikiri.md)

## 配置键（text 组）

`japaneseOneLine`、`translationWidth`（0 = 跟随日文）、`translationLineHeight`、`lineHeight`、`gap`、`japaneseSize`、`translationSize`、`textColor` / `readTextColor`、`textGradient*` / `readTextGradient*`、`display`（bilingual / japanese / chinese）、`translationInline`、`chineseFont`、`japaneseFont`

新键要在两份 game-style / game-profile 都加；译文宽度和行高只在不等于默认值时生效，且不写进 seed；锚定 pin 模式也遵守换行宽度（`side-session-notes/ENGINE-ADAPTATION-NOTES-e-settings.md`）

## 最近修过的坑

- #1177 555a876f：日文只占一行 #1145、锁定行也能调换行宽度和行距 #1137、释放 ClipCursor #1144
- #1198 b698bf52：旁路流的同一句误判成选项 #1118、KiriKiri 文字窗让位后重新隐藏 #1124 #1125（#1122、#1119 的改动撤回，以 RRFZ #1191 #1190 为准）
- #1191 19f24983 译文孤字；#1190 6f09e240 破折号颜色跟随已读 / 未读；#1226 引号对话单字应答换行；#1215 `dialogConfig` 同步
- 未合入（`fix/display-leftovers`）：Alt+H 再开覆盖时当前句立即重画 #1132；中文紧随日文时日文保留自己的换行 #1104

## 相关代码 / 相关文档

- 代码：见上表
- 测试：`validation/{text-place-dom,text-place-user-row-layout,japanese-one-line,menu-cursor-release,translation-anchor,dash-stroke,krkr-double-draw,overlay-placement,read-style-replay,compositor-ruby,capsule}.test.cjs`
- 文档：`docs/text-architecture.md`（验收清单 a–h）、`docs/text-architecture-compositor.md`、`docs/text-architecture-marks.md`、`docs/engine-draw-protocol.md`（`emb=2` = 游戏自己画了 ruby 和中文）、`side-session-notes/ENGINE-ADAPTATION-NOTES-e-settings.md`
