// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 联网书源占位。上一轮已实测到的现实：
     1. www.wenku8.net 对脚本请求返回 Cloudflare 403（CF-RAY + Attention Required）；
     2. http://app.wenku8.com/android.php 已退化成 42 字节的 "Welcome" 桩；
     3. 参考项目 Wenku8_Flutter 的公开快照里，在线实现被挖空（legacy_wenku_repository 全 unavailableOnline）。
   所以这一轮只把契约钉死：test/discover/search/detail/chapters/content 六个方法，
   下一轮用 Cookie 直连或自建中继实现其中任意一个，页面与本地书库完全同构。 */
const NOT_CONFIGURED = 'SOURCE_NOT_CONFIGURED';

function pending() {
  throw Error(NOT_CONFIGURED);
}

module.exports = {
  id: 'wenku',
  label: '轻小说文库',
  test: pending,
  discover: pending,
  search: pending,
  detail: pending,
  chapters: pending,
  content: pending
};
