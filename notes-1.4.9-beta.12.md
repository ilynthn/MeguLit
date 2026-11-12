本 beta 合入 KiriKiri / Siglus 内嵌修复，并修复实机测试中发现的问题：

- 修复：9-nine 等多语言版游戏的第一句，中文轨开头混进日文，阅读器里译文显示两遍
- 修复：STEINS;GATE（命运石之门）等游戏画面里的招牌艺术字，被画成白色描边字压在画面上（应为隐形可选文字）
- 修复：Summer Pockets 的剧本场景名（如「10_プロローグ0725___…」）被当成台词读取并画在游戏上
- 内嵌：Summer Pockets、CLANNAD、ATRI -My Dear Moments-、9-nine、Maitetsu:Pure Station（爱上火车 Pure Station）、千恋＊万花、サノバウィッチ（魔女的夜宴）的内嵌显示修复

仅在开发者本地测试过，可能还有没发现的问题，会持续跟进修复
---
This beta brings the KiriKiri / Siglus embed fixes and fixes problems found in live tests:

- Fix: in multilingual games such as 9-nine, the start of the Chinese track leaked into the first Japanese line, so the reader showed the translation twice
- Fix: sign art text in games such as STEINS;GATE was drawn as white outlined text over the picture (it should be an invisible selectable copy)
- Fix: Summer Pockets script scene names (such as "10_プロローグ0725___...") were read and drawn over the game as story lines
- Embed: embed fixes for Summer Pockets, CLANNAD, ATRI -My Dear Moments-, 9-nine, Maitetsu:Pure Station, Senren*Banka and Sabbat of the Witch

Only tested locally by the developer; there may be problems not found yet, and fixes will keep coming