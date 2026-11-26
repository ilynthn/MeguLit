# E 设置/排版 经验 (2026-11-26, fix/e-settings)

- 日文只占一行 (#1145): 新文本键 japaneseOneLine (默认 false, 按作品保存)。reader 给 body 加 megulit-jp-one-line，日文 white-space:nowrap，放不下时整行用 --megulit-jp-one-line-scale 缩小。core 和 web/reader/modules 各有一份 game-style.js / game-profile.js，新键两份都要加。
- 隐藏鼠标的游戏 (#1144): GalWindowBridge 在 Alt+T 面板或点读卡打开时 ClipCursor(NULL) 并显示光标，关闭时还原。猜测: 每帧 SetCursorPos 回中心的游戏仍需 hook 层处理，未在真机验证。
- 锁死的换行宽度/行距 (#1137): 字形定位路径 (text-place.js) 的译文行宽取日文跨度、行高固定 1.25，设置无效。现在 translationWidth 偏离 75、translationLineHeight 偏离 0 时才生效 (userRowLayout)，默认值保持原行为，不写入 seed。日文行距在该路径仍由游戏字形决定。
- Alt+H 再按显示日文但没文本 (#1132): 未修，见汇报。
- 锁定宽度在锚定模式下也要放开 (#1137, 集成实机 死に逝く君): 4d2c0942 只改了字形逐框摆放 (placed rows) 那条路径；KiriKiri 这类走锚定 pin() 的游戏译文宽度仍等于日文跨度，改「译文换行宽度」没反应。pin() 里换行宽度偏离 75 时按游戏客户区百分比取宽 (不超出行右侧空间、不小于 80px)，75 保持跟日文同宽。行距在锚定模式本来就走 CSS calc(1.65+offset)，实测生效
