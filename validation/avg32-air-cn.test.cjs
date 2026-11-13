'use strict';
/* E564: AIR 中文版 (air_cn.exe + air_cn.ini, DAT\SEEN.TXT in GBK) is found through the ini, read as Chinese and marked
   chinese-only (pairing needs the Japanese AVG32 original). Skips when the game folder is not on this PC. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir='E:\GAL\Air\Air',have=fs.existsSync(path.join(dir,'air_cn.exe'));
test('AIR Chinese build: AVG32 via air_cn.ini, GBK, chinese-only',{skip:!have},()=>{
 const a=require('../services/original-engines/avg32.cjs');
 assert.match(a.sources(dir)[0],/DAT[\/]SEEN\.TXT$/i);
 const o=require('../services/original-text.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'avg32-'));
 const s=o.scanRunning(root,'air',path.join(dir,'air_cn.exe'));
 assert.equal(s.engine,'avg32');assert.equal(s.status,'chinese-only');assert.ok(s.runtime.lines>40000);
});
