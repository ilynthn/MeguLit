# 经验：阅读层遗留三条（fix/reader-leftovers）

## 外置 log 说话人全是「旁白」（死に逝く君、館に芽吹く憎悪，KiriKiri）
- 名字只在旁路流里：KiriKiri1 / DrawText 画名牌「血塗れの男血塗れの男」，KiriKiri2 发配音名「男男」；主流只送台词本身
- 旧的裸名学习（#141）只看主流，名字从来进不了 knownSpeakers，hookSpeaker 一直是空，log 只能猜成旁白
- 旁路名字和台词的先后不固定：那次实机 297 句带名字的台词里 191 句名字先到、106 句晚 15 ms 到
- 做法（core/hook-native.cjs，所有引擎）：旁路里短的、像名字的文字（假名/汉字，叠写读一次）记成候选；带引号的台词到达时取 2 s 内出现最多的那个；第二次出现才学会，菜单词不会变成说话人
- 名字晚到：台词后 400 ms 内的旁路名字归这一句，发 `hookSpeakerLate`，阅读层把名字补到 log 最新一行；同时不再让晚到的名字串到下一句旁白
- 回放：validation/aux-speaker-replay.test.cjs 用那次的 hook-events 原文
