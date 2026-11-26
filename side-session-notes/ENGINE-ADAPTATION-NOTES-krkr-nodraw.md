# KiriKiri 无 KAG「源头不画」，2026-11-26（分支 krkr-native-nodraw）

本条供总控整合进根目录 ENGINE-ADAPTATION-NOTES.md

- 只读流游戏藏原文：LunaHook 用户码不能带写回标记（E 前缀报「特殊码无效」），要写回就得在 MeguLitHook32.dll 的引擎文件里注册
- 通用做法：引擎钩子在 MeguLitDrawSkip.h 注册「怎么找画字对象、怎么把文本换成空」，texthook.cc 对不可写回、被宿主打开（check_embed_able）的流调用它；没注册的钩子零开销直接返回
- オルフレール 的 `tTVPNativeBaseBitmap::DrawText` 其实是图层级 DrawText（反汇编 orfre.exe 0x538F14：eax=layer，[ebx+0xc4] 主图，[ebx+0x13d] face），Borland 寄存器调用 eax/edx/ecx = this/x/y，栈上 text 在 stack[9]，长度 0 直接返回。换成空 ttstr（Ptr=nullptr）就是 TJS 空串，最干净
- 线程拆分值 ecx 是 y：一页正文是 0:2 / 0:68 / 0:90 三条线程，人名 0:3 / 0:3c，选项 0:13。锁正文要锁一组线程，不能只锁一条
- 读正文的 KiriKiri2（GetTextExtentPoint32W，量宽）在 DrawText 被跳过后照样出字，阅读不断；KiriKiri1/DrawText 线程也照样出文本（钩子在函数入口、先出文本再换空）
- eax 图层：一层主消息层反复出现，另有大量一次性的逐字图层，所以图层锁只是补充，主力是桥按「DrawText 片段属于所选正文」锁的线程
- 桥侧全部在 no-KAG 闸门后（KrkrNoKag）：KAG 游戏永远不会打开这些线程；第一次 `MeguLit_DRAWSKIP hit` 把所选流标 hide-only（和 GDI 隐藏命中同一条路），计数挂在 hookThreads 所选流的 drawSkipped 上，冷测试写进 run.json，adapt-auto 写进 result.hide.skipped
- 实机：Cardinal 实屏「原文可见」从 7 张里 3 张降到 10 张里 2 张，剩下 2 张是选项画面，选项本来就要保留原样画（OCR 把选项字配到了附近台词上）；第二局 7 张全隐藏、leak 1。两局跳过约 5.36 万字。row 0.511/0.4 比之前几局（0.54–0.73）低，原因没查清
- 构建：仓库 preserved/source/lunahoook-adapted 是 ToMe 专用裁剪版（engine32 只编 Yuris.cpp、32 位不编 python），拿来编 MeguLitHook32 要在私有树里改成 aux_source_directory("engine32") 并把 python 加回 32 位；ATL 头文件在 get-atl-x64.py 的 Headers 包里，x86 脚本只下库

## 阅读层跟进（分支 reader-nodraw，2026-11-26）

- 源头不画后 row 掉到 0.4–0.5 的原因：字形层 hideSeen 一直是 false（游戏根本没画，自然没有"隐藏的字形"回报），overlay-placement 就判「游戏自己画」，发 visible，阅读层加 megulit-place-game-drawn 只画中文。修法：HookNative.drawSkipping()（所选流 drawSkipped>0 且在隐藏模式）经 gal-native 传给 placement，字形行在这种情况下走 fallback，阅读层自己画日文。注意 Ctrl 快进后流会换成 DrawText 自身的流（538f14:0:90，只读、hideOnly=false、hideTrying），只看 hideOnly 会漏，所以条件用 drawSkipped
- 阅读层卡死的原因：Ctrl 快进时钩子一次吐 3996 字，页面上 8000 个 char-token。interaction.js 的命中区 report 每次 DOM 变化都在微任务里跑一遍，每次读每个 token 的样式和盒子（约 110 ms），打字机每帧变一次 → 页面被 report 占满，Cardinal 取样 15 s 超时。CPU Profiler 在这种状态下 Profiler.stop 也拿不回来；能用的办法是 Debugger.enable + 定时 Debugger.pause 取调用栈（paused 事件里的 callFrames），采到的几乎全是 report/textBoxes
- 修法：report 花了 >12 ms，下一次推迟它耗时的 3 倍（report 最多占约 1/4 时间），正常页面（<12 ms）照旧立即报。只推迟不丢：最后一次变化一定会报
- 回放验证：r2 磁带 total 6 → 9.33、row 6 → 9.33、不再 unresponsive；game-drawn 样本 317 → 22（剩下的都在第一句 drawSkipped 还没上报之前的预热段）；r1 磁带 row 5.11 → 9.47

## 自动适配跟进（分支 feat/auto-adapt，2026-11-27）

- 「源头不画有时不生效」（hide.skipped 0、阅读层停在读模式）：查了 11 局 result，skipped=0 的每一局诊断里都没有 `MeguLit_DRAWSKIP ready`。DrawSkip 的 MeguLitHook32.dll 只在 krkr-native 工作区本地构建（不进 git），别的工作区跑 adapt-auto 时 useCheckoutHook 找不到就静默用安装版 DLL。现在 adapt-auto 依次找 MEGULIT_HOOK_DIR、本仓库、本仓库其它 worktree，带 DrawSkip 的优先，用的哪份写进 result.hook；KiriKiri 没用上 DrawSkip 时 reasons 直接写明
- 合并后 row 0.63 → 0.89：之前那局是在 reader-nodraw 之前的代码上跑的（阅读层把 DrawSkip 的行当成游戏自己画，只画中文）；同一磁带用合并后代码回放 row 0.886
- 引号内句号：「…ってね……。 / この村は大丈夫かねえ。 / 不安だよ……」 三段 0.4–0.6 s 先后到，太短读不到。无 KAG 接句器现在只在 「『（ 都闭合时才按句尾结束一行（静默 1.2 s 和 400 字上限照旧兜底）
- 选项送达晚：内核 1.2 s 内问了两次（第二次多一个「らね」），冷测试为第一次拍的图被丢掉，答复晚 8.6 s，Cardinal 判「没送到阅读层」。同一选项屏的追问（和上一问有相同选项）沿用已拍的图
- 结果：r3–r7 连续五局 pass（row 0.955 / 0.912 / 0.951 / 0.95 / 0.966，r7 是最终代码 435 s，leak 1，choice 1，每局 skipped 约 5.35 万字）；r3/r4 约 6.2 分钟，r5/r6 约 9.2 分钟（那两局冷测试也按字数等待，已改回只对 YU-RIS；Cardinal 回放整盘磁带，约 250 s）
- 注意：DrawSkip DLL 仍只在 krkr-native 工作区有本地构建，换机器或清掉那个目录就退回「源头不画没装上」（reasons 会写明），要长期用得把 native/megulithook 的构建产物放到固定位置（MEGULIT_HOOK_DIR）
