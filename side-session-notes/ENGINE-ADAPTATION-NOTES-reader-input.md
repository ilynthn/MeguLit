# 阅读层输入（点读窗 / 滚轮 / log 快捷键）经验

- 2026-11-26 点读窗开着时点窗外（#1120）：以前点击照常落到游戏，只是事后让页面关卡片（TraceGameClick 的 dismissLookup），所以游戏会推进。现在 ReaderPointerGate 在卡片开着（LookupOpen 且有 lookup 区域）、点在游戏窗口上、游戏在前台时，整次按下到松开都吞掉，只发 dismissLookup 关卡片。只认卡片（lookup 区域），不认悬停小提示，免得把正常推进点击吃掉。判定放在 DismissOutside，桥自检覆盖
