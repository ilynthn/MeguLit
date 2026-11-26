# 显示残留 经验 (2026-11-26, fix/display-leftovers)

- 中文紧随日文 (#1104): 紧随样式把日文设成 white-space:normal、藏掉日文里所有 br，台词自带的换行（"\n" 字符 token）和游戏折行全被并成一段。紧随只管译文接在最后一行后面；日文用 pre-line，已有 megulit-row-br 或日文只占一行时才折叠。实机：fata_jp.exe「目の前にある事実を\n受け入れている」开关前后对比（隔离安装，2026-11-26）
- Alt+H 再开覆盖 (#1132): 覆盖关掉时游戏重画当前句，core 先 clear 再报 visible+hiding；再开覆盖时游戏不会重画已显示的句子，收不到 hidden 报告，阅读层一直把日文留给游戏又没位置。text-place 记住关覆盖那一刻的句子和位置，同一句上再开覆盖时直接重画。推断自代码 + 回放，未在真机按 Alt+H 验证（用户回到电脑前后停止前台实机）
- 写回译文的双重译文 (#1128): 全页开关 megulit-embed-translation 会被下一句的 hide 或模式切换关掉，而屏幕上还是游戏画过译文的那句。改成按句 embedLine.drawn；core embedReply 空译文也报 drawn:false。#1128 截图那一次是否走的写回路径没有日志证实
