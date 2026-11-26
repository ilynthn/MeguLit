# KiriKiri 无 KAG「源头不画」，2026-11-26（分支 krkr-native-nodraw）

本条供总控整合进根目录 ENGINE-ADAPTATION-NOTES.md

- 只读流游戏藏原文：LunaHook 用户码不能带写回标记（E 前缀报「特殊码无效」），要写回就得在 MeguLitHook32.dll 的引擎文件里注册
- 通用做法：引擎钩子在 MeguLitDrawSkip.h 注册「怎么找画字对象、怎么把文本换成空」，texthook.cc 对不可写回、被宿主打开（check_embed_able）的流调用它；没注册的钩子零开销直接返回
- オルフレール 的 `tTVPNativeBaseBitmap::DrawText` 其实是图层级 DrawText（反汇编 orfre.exe 0x538F14：eax=layer，[ebx+0xc4] 主图，[ebx+0x13d] face），Borland 寄存器调用 eax/edx/ecx = this/x/y，栈上 text 在 stack[9]，长度 0 直接返回。换成空 ttstr（Ptr=nullptr）就是 TJS 空串，最干净
- 线程拆分值 ecx 是 y：一页正文是 0:2 / 0:68 / 0:90 三条线程，人名 0:3 / 0:3c，选项 0:13。锁正文要锁一组线程，不能只锁一条
- 读正文的 KiriKiri2（GetTextExtentPoint32W，量宽）在 DrawText 被跳过后照样出字，阅读不断；KiriKiri1/DrawText 线程也照样出文本（钩子在函数入口、先出文本再换空）
- eax 图层：一层主消息层反复出现，另有大量一次性的逐字图层，所以图层锁只是补充，主力是桥按「DrawText 片段属于所选正文」锁的线程
- 桥侧全部在 no-KAG 闸门后（KrkrNoKag）：KAG 游戏永远不会打开这些线程；第一次 `MeguLit_DRAWSKIP hit` 把所选流标 hide-only（和 GDI 隐藏命中同一条路），计数挂在 hookThreads 所选流的 drawSkipped 上，冷测试写进 run.json，adapt-auto 写进 result.hide.skipped
- 实机：Cardinal 实屏「原文可见」从 7 张里 3 张降到 10 张里 2 张，剩下 2 张是选项画面，选项本来就要保留原样画（OCR 把选项字配到了附近台词上）
- 构建：仓库 preserved/source/lunahoook-adapted 是 ToMe 专用裁剪版（engine32 只编 Yuris.cpp、32 位不编 python），拿来编 MeguLitHook32 要在私有树里改成 aux_source_directory("engine32") 并把 python 加回 32 位；ATL 头文件在 get-atl-x64.py 的 Headers 包里，x86 脚本只下库
