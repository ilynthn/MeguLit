// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 (owner: 不再自己实机测试，测试的内容交给测试员用 UU 远程来测) the tester's checklist for a published adaptation,
   written by `publish` to <MEGULIT_TEST_REQUESTS>/<PR number>-<slug>.md. Local only, never in the repository: it names this PC's
   folders (the game copy, the test build MEGULIT_ADAPTER_TEST_APP = a side-by-side MeguLit with the branch's code); only the file
   name goes into the public PR body. The tester plays the copy to the first choice and sends the pictures back.
     testRequest(state, {pr, app, workName}) -> markdown */
const path=require('node:path');

function testRequest(st,{pr='',app=process.env.MEGULIT_ADAPTER_TEST_APP||'<测试版 MeguLit 目录>',workName=s=>s.title}={}){
 const n=String(pr).replace(/.*\/pull\//,'')||'<PR号>',name=workName(st),exe=st.exe||'<游戏程序>';
 /* 2026-11-28 the speaker colour check (checkpoints.cjs speakers): what 分角色 must show for this work */
 const said=st.answers?.speakers,bySpeaker=/^(y|yes|是|对)$/i.test(String(said||'').trim());
 const speakers=said===undefined?'游戏按角色给台词上不同颜色时，列出说过话的角色，色块和游戏里的颜色一致；所有角色同一种颜色时，写「该作品不分角色字体颜色」':bySpeaker?'列出说过话的角色，色块和游戏里该角色台词的颜色一致（不是发灰的颜色）；点「改色」改一个角色，阅读层里这个角色的台词马上变色，「恢复默认」变回游戏的颜色':'写「该作品不分角色字体颜色」，不列角色';
 const release=st.answers?.release||st.identity?.release||st.identity?.releaseGuess||'发行版未知';
 return ['# '+n+' '+name+' 实测清单','',
  '- PR：'+(pr||'<PR 链接>'),
  '- 作品：'+name+'（VNDB '+(st.answers?.vndb||st.identity?.vndb||'?')+'，'+release+'），引擎 '+(st.caps?.label||st.engine||'?'),'',
  '## 游戏副本','',
  '- 程序：`'+exe+'`（测试专用副本，随便存档；别用自己装的那份）','',
  '## 启动测试版','',
  '1. 关掉正在开的正式版 MeguLit（两个同时开会抢热键）',
  '2. 双击 `'+path.join(app,'启动测试版.cmd')+'` 打开测试版（不要直接点 MeguLit.exe：那样会把正式版关掉）；它是本分支的代码和原生组件（node tools/megulit-adapter.cjs testbuild 生成）',
  '3. 游戏库里点这部游戏（没有就「添加游戏」选上面的程序），点「开始」，由 MeguLit 启动游戏',
  '4. 测完先关游戏，再关测试版','',
  '## 操作','',
  '1. 标题画面点「はじめから」（START）',
  '2. 一句一句往下点，看前 10 句',
  '3. 继续点到第一个选项画面（'+(st.firstChoice||'开头几十句内')+'），停在选项上等几秒',
  '4. 点一个中文选项，再往下点 3 句','',
  '## 通过标准','',
  '- 换句：MeguLit 阅读层的日文跟着游戏一句句换，不停在旧句、不跳句',
  '- 原文隐藏：游戏对话框里的日文正文不显示（第一句会先露一下再藏，是故意的；说话人名牌可以留着）',
  '- 选项：选项画面上出现中文选项，游戏原来的日文选项被盖住或看不到；点中文选项能选中',
  '- 分角色：Alt+T → 文字 → 颜色 → 分角色：'+speakers,
  '- 不卡、不闪，点击能推进游戏','',
  '## 回传截图（整屏）','',
  '1. 第 3 句左右的对话画面',
  '2. 第 10 句左右的对话画面',
  '3. 第一个选项画面（中文选项出来之后）',
  '4. 选完选项后的下一句',
  '5. Alt+T → 文字 → 颜色 → 分角色 那一块',
  '6. 哪里不对就多截一张，写一句哪里不对',''].join('\n');}

module.exports={testRequest};
