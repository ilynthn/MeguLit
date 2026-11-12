本 beta 回退 beta.15 的一项帧率改动：

- 修复：beta.15 把游戏库备用封面改成分批准备，反而让拖动和缩放时多出卡顿，已恢复为封面墙静止后一次性准备

仅在开发者本地测试过，可能还有没发现的问题，会持续跟进修复
---
This beta reverts one frame-rate change from beta.15:

- Fix: beta.15 prepared the library's spare covers in small batches, which added stutter while dragging and zooming; they are prepared in one go again, once the wall is still

Only tested locally by the developer; there may be problems not found yet, and fixes will keep coming