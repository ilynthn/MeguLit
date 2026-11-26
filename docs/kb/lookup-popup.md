# 点读窗（点读卡）交互

> 这页回答：点读卡怎么开、怎么关；点击 / 滚轮 / 快捷键为什么不会推进游戏；这些规则在哪实现

## 交互规则和实现位置

| 规则 | issue | 实现 |
|---|---|---|
| 点读卡开着时点卡外 → 只关卡，不推进游戏 | #1120 | 原生 `native/ReaderPointerGate.cs DismissOutside`：卡开着、点在游戏窗口而不在 MeguLit 文字 / 面板上时，整次按下由指针闸门扣下，只发 `dismissLookup`；页面侧 `web/reader/lookup-dismiss.js` 用透明 shield 吞掉整次按下到松开 |
| 卡上 / 点读层上滚轮不推进游戏 | #1130 | `web/reader/modules/interaction.js __megulitResolveWheel`：点读卡和 `.lookup-tooltip` 拥有自己框内滚轮，台词上的滚轮由 backlog 决定；回 `galWheelDecision{panel,panelUp}`，桥用 `ReaderPointerGate.WheelToPanel` 决定（只有向上滚才算 panelUp）。滚轮向上翻历史、向下推进游戏 |
| L 键不和游戏快捷键冲突 | #1130 | 外置 LOG 改成全局组合键，默认 Alt+L（可选 Ctrl+Alt+L、Alt+Shift+L、Alt+B、不用）；单按 L 只在 Alt+T 菜单或 LOG 开着时生效（`web/reader/modules/backlog.js`）；原生热键注册在 `native/GalWindowBridge.cs`，只在翻译模式、已绑定游戏、游戏或阅读层在前台时注册；设 `MEGULIT_NO_HOTKEYS` 时不注册 |
| 长按拖选的短句也翻译 | #1139 | `web/reader/modules/selection.js translateSelection` 发 `lookupTranslate`；服务端 `chainTranslate(…, {quiet:true})`，不写缓存、不回填、不进上下文；关卡时 `lookupCancel` 作废排队中的请求 |
| 卡开着时整次点击不进游戏 | — | ReaderPointerGate 吞掉整次点击（`side-session-notes/ENGINE-ADAPTATION-NOTES-reader-input.md`） |

Windows 会在低级鼠标钩子回调太慢时静默摘掉钩子（LowLevelHooksTimeout）：`ReaderPointerGate.cs` 里有重挂逻辑，换新钩子前保留旧钩子

## 点读卡本体

- `web/reader/modules/selection.js`：卡 `.tomoyo-selection-card` 的建立、定位、关闭。宽 360–440 px，高度不超过游戏窗口一半，放在整句上方或下方；异表记下拉、「其他同形词条」、「同音词（只是读音相同）」分组；`close()` 发 `lookupCancel` 和 `galLookup open:false`
- `web/reader/modules/lookup-layout.js`、`reader-panels.js`、`polish.js`：排版和视觉
- `web/reader/modules/v4.js`：词卡朗读、Anki，经 `type:'v4'` 发到 `services/reader.cjs`
- 「这句有问题」反馈按钮在卡片底部（RRFZ #1154）

## 未合入 main 的跟进

- #1136 日志面板点击穿透、说话人显示成旁白：分支 `fix/reader-leftovers`
- 快进 4000 字长行让命中区上报卡死页面：分支 `reader-nodraw`（report 超过 12 ms 就推迟，只推迟不丢）

## 配置键

backlog 的 `hotkey`、`keyL`、`wheel`（`backlog.js` DEFAULTS）；`lookup.lookup_mode`；面板名 menu / log / card（`services/settings-schema.cjs`）

## 相关代码 / 相关文档

- 代码：`web/reader/modules/selection.js`、`web/reader/lookup-dismiss.js`、`web/reader/modules/interaction.js`、`web/reader/modules/backlog.js`、`native/ReaderPointerGate.cs`、`native/GalWindowBridge.cs`
- 测试：`validation/{lookup-outside-click,lookup-wheel,backlog-hotkey,selection-translation,pointer-gate-panel,test-no-hotkeys,lookup-card-size}.test.cjs`
- 文档：`side-session-notes/ENGINE-ADAPTATION-NOTES-reader-input.md`；合并 PR #1175 6369b371
