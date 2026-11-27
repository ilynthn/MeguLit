// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 书源契约。本地书库也算一种"源"，所以书架、详情、章节三件事走同一组方法，
   下一轮接 Wenku8 时只换实现，页面不用改。 */
class BookSource {
  constructor(id, label) {
    this.id = id;
    this.label = label;
  }
  /* 连通性自检：设置页的"测试"按钮 */
  async test() { throw Error('SOURCE_NOT_SUPPORTED'); }
  /* 发现页：分类、排行、最近更新 */
  async discover() { throw Error('SOURCE_NOT_SUPPORTED'); }
  async search() { throw Error('SOURCE_NOT_SUPPORTED'); }
  async detail() { throw Error('SOURCE_NOT_SUPPORTED'); }
  async chapters() { throw Error('SOURCE_NOT_SUPPORTED'); }
  async content() { throw Error('SOURCE_NOT_SUPPORTED'); }
}

module.exports = { BookSource };
