# 阅读层输入（点读窗 / 滚轮 / log 快捷键）经验

- 2026-11-26 点读窗开着时点窗外（#1120）：以前点击照常落到游戏，只是事后让页面关卡片（TraceGameClick 的 dismissLookup），所以游戏会推进。现在 ReaderPointerGate 在卡片开着（LookupOpen 且有 lookup 区域）、点在游戏窗口上、游戏在前台时，整次按下到松开都吞掉，只发 dismissLookup 关卡片。只认卡片（lookup 区域），不认悬停小提示，免得把正常推进点击吃掉。判定放在 DismissOutside，桥自检覆盖
- 2026-11-26 滚轮（#1130）：翻译模式下真实滚轮先被桥扣住，再问页面（__megulitResolveWheel）归谁。点读小提示（.lookup-tooltip）不在 MENUS 里，滚轮被当成游戏的发回去推进了；台词上的滚轮也一律发给游戏，backlog.js 的「台词上滚轮向上打开 log」永远收不到。现在点读卡和小提示按实时外框拿滚轮；台词上由 backlog 决定：log 开着全归 log，没开且设置打开时只把「向上」交给页面（panelUp，桥按真实 delta 判），向下仍推进游戏。不改 Rust 转发
- 2026-11-26 LOG 快捷键（#1130）：单按 L 原来只是网页 keydown，游戏在前台时 L 进的是游戏（很多游戏的 L 本身就是快捷键），只有 Alt+T 打开、阅读层有焦点时才开外置 log。现在 log 有自己的全局组合键（默认 Alt+L，可选 Ctrl+Alt+L / Alt+Shift+L / Alt+B / 不用），在 Alt+T→记录页里改；桥只在翻译模式、已绑定游戏且游戏或阅读层在前台时注册（RegisterHotKey 0x544），别的程序在前台时不占这个键。单按 L 保留为「Alt+T 菜单（或 log）开着时按 L」。新 WM_HOTKEY id 必须写在通用 Alt+T 分支前面，否则会被当成 Alt+T
- 2026-11-26 拖选短句翻译（#1139）：拖选/长按选出的词段原来只做本地逐词查询，没有翻译。现在卡片里多一块「选区翻译」，走和台词一样的翻译链（用户的引擎→兜底），reader.cjs lookupTranslate。用 quiet/detached：不进台词缓存、不晚到回填、不进 LLM 上下文历史（只读最近几句当上下文），否则下一句的上下文会混进这个词段
