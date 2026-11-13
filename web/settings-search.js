// SPDX-License-Identifier: GPL-3.0-or-later
// Offline pinyin index for the Chinese UI vocabulary; no search terms leave this app.
const syllables={bie:'别',a:'阿',an:'按暗安',ba:'把',bao:'保包',bei:'背备被',ben:'本',bian:'边变编',biao:'标表',bing:'并',bo:'播',bu:'不部补步',cai:'彩',can:'参',cao:'操',ce:'测侧',cha:'查插',
 chang:'长常场',chao:'超',cheng:'程成称',chi:'持迟',chu:'出初除储',chuan:'传串',ci:'词辞次',cong:'从',cun:'存',cu:'粗',da:'大打',dai:'待代带',dan:'单弹',dao:'导到',de:'的得',deng:'等登',di:'地低底第',
 dian:'点典电',diao:'调掉',ding:'定顶',dong:'动',du:'读度独',duan:'段断端短',dui:'对',duo:'多',e:'额',er:'二',fa:'法发',fan:'翻返反',fei:'非费',fen:'分份',fu:'服复浮附',gai:'盖改',gan:'感',gao:'高',
 ge:'个隔格',gen:'跟',geng:'更',gong:'共供公',gou:'构够',guan:'关惯',guang:'光',gui:'规归',guo:'过果',hai:'还',hang:'行',han:'汉',hao:'号好',he:'和合',hei:'黑',heng:'横',hong:'红',hou:'后候',
 hua:'话化画划',huan:'换环',hui:'回灰会恢',hu:'护',huo:'或获',ji:'机记级及即基',jia:'假加夹价',jian:'间键件简检减荐',jiang:'将',jie:'解接结界',jin:'进仅近',jing:'境景精镜',ju:'句距局剧',kai:'开',kan:'看',ka:'卡',
 ke:'可刻',kong:'空控',kou:'口',ku:'库',kuai:'快',kuan:'宽',lang:'朗',la:'拉',lan:'栏',lei:'类',li:'历理离例',gu:'骨',lian:'连链',liang:'亮量两',lie:'列',lin:'临',ling:'零龄',liu:'流留览',long:'龙',
 lu:'录路露',lun:'轮',lv:'率滤',ma:'码',mai:'买',man:'慢',mei:'每没',men:'门',ming:'名明',mo:'模默',mou:'某',mu:'目',na:'拿',nan:'男',nei:'内',nian:'年',niu:'钮',nv:'女',pai:'排',pan:'盘判',
 pei:'配',pi:'批',pian:'片',piao:'漂',pin:'拼',ping:'屏平评',pu:'普',qi:'启起器期齐其',qian:'前浅签',qiang:'强',qie:'切且',qing:'清情请',qu:'区取去',quan:'全权',que:'确',ran:'染然',rang:'让',re:'热',
 ren:'认人任',ri:'日',rong:'容',ru:'入如',ruo:'若',se:'色',sao:'扫',shai:'筛',shang:'上商',she:'设射社',shen:'深',sheng:'声生剩',shi:'时式示史试使实始释识',shou:'收首手',shu:'数输书属鼠',shua:'刷',shuang:'双',
 shui:'水',shun:'顺',si:'四',song:'送',sou:'搜',su:'速素',sui:'随',suo:'缩索锁所',ta:'他它',zhun:'准',mi:'密',tai:'态台',tan:'探',te:'特',ti:'体提题',tian:'天添',tiao:'条跳',ting:'停',tong:'同通统',
 tou:'透头',tu:'图',tui:'推退',tuo:'托拖',wai:'外',wan:'玩完弯',wei:'位为未围',wen:'文问',wo:'我',wu:'无五务',xi:'习细系',xia:'下',xian:'显线限现',xiang:'向项像相',xiao:'小效消',xie:'写斜',xin:'新信',
 xing:'型性形',xiu:'修',xu:'续需序',xuan:'选悬',xue:'学',ya:'压',yan:'颜验延',yang:'样',yao:'要',ye:'页',yi:'译一已移引义依',yin:'音阴隐',ying:'应影英',yong:'用永',you:'游有优右由',yu:'语与域余预于',yuan:'原源圆元',
 yue:'阅月乐',yun:'运云',zai:'载再在',zan:'暂',ze:'则',zeng:'增',zhan:'展占',zhang:'账掌',zhao:'照找',zhe:'这折者',zhen:'帧真',zheng:'整正',zhi:'置值制知至支直指止质',zhong:'中重种',zhou:'周',zhu:'注主逐助',
 zhuan:'转专',zhuang:'状装',zi:'字自子',zong:'纵总',zu:'组',zuo:'左作最',bi:'闭',cang:'藏',chuang:'窗'};
const pinyinMap=new Map(Object.entries(syllables).flatMap(([syllable,characters])=>[...characters].map(character=>[character,syllable])));
for(const [syllable,characters]of Object.entries({qing:'擎',zhi:'址',hu:'户糊',yan:'言',lai:'来来',wu:'务',miao:'描',xi:'戏悉',chuang:'窗',fang:'放方',jian:'渐',pian:'偏',bang:'绑',
 cang:'藏',ji:'击',chen:'沉',jin:'浸',kuang:'框',pai:'牌',bi:'笔',jing:'径',xian:'先',jie:'截',bao:'饱',mao:'毛',bo:'玻',li:'璃',mian:'面',ban:'板',cai:'菜',jiao:'角脚',chu:'触',hui:'汇',
 wo:'握',shi:'视',shao:'少',xun:'询',shu:'熟',qian:'嵌'}))for(const character of characters)pinyinMap.set(character,syllable);
const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f\s_-]/g,'').toLowerCase();
pinyinMap.set('引','yin');
/* E377 联网服务 / 排行榜昵称 */
pinyinMap.set('只','zhi');pinyinMap.set('脱','tuo');pinyinMap.set('敏','min');pinyinMap.set('含','han');pinyinMap.set('榜','bang');pinyinMap.set('昵','ni');pinyinMap.set('联','lian');pinyinMap.set('网','wang');
/* E394 个人主页 头像 账号 邮箱 登录 退出 */
/* E397 公开 签名 最喜欢 关注 同好 */
for(const [c,p] of Object.entries({公:'gong',开:'kai',签:'qian',名:'ming',最:'zui',喜:'xi',欢:'huan',关:'guan',注:'zhu',同:'tong',好:'hao'}))if(!pinyinMap.has(c))pinyinMap.set(c,
 p);
for(const [c,p] of Object.entries({个:'ge',人:'ren',主:'zhu',页:'ye',头:'tou',像:'xiang',账:'zhang',号:'hao',邮:'you',箱:'xiang',登:'deng',录:'lu',退:'tui',称:'cheng'}))if(!pinyinMap.has(c))pinyinMap.set(c,
 p);
pinyinMap.set('惠','hui');pinyinMap.set('咏','yong');pinyinMap.set('唱','chang');pinyinMap.set('布','bu');pinyinMap.set('署','shu');/* E370 共享适配数据（匿名） */pinyinMap.set('享',
 'xiang');pinyinMap.set('适','shi');pinyinMap.set('据','ju');pinyinMap.set('匿','ni');
export function searchTerms(label){const tokens=[];for(let i=0;i<label.length;i++){const special=Object.entries({'角色':['jue','se'],'重定位':['chong','ding','wei'],
 '重新':['chong','xin']}).find(([word])=>label.startsWith(word,i));if(special){tokens.push(...special[1]);i+=special[0].length-1;}else tokens.push(pinyinMap.get(label[i])||label[i].toLowerCase());
 }return[normalize(label),normalize(tokens.join('')),normalize(tokens.map(token=>token[0]).join(''))];}
export function matchesSetting(item,query){const words=query.trim().split(/\s+/).map(normalize).filter(Boolean),haystack=[...Object.values(item.label||{}),item.key||'',
 ...(item.aliases||[])].flatMap(searchTerms);return words.every(word=>haystack.some(term=>term.includes(word)));}
export function globalSearchEntries(data,text){return [
 ...data.fields.filter(field=>!(field.scope==='background'&&field.key.startsWith('crop.'))).map(field=>field.scope==='online'&&/^leaderboard/.test(field.key)?{...field,
  scope:'personal'}:field),
 {scope:'personal',key:'avatar',label:{zh:'个人主页 头像 换头像 排行榜头像 账号 邮箱 登录 退出登录 昵称 退出排行榜',en:'Profile picture avatar account email sign in sign out nickname leave leaderboard',
  ja:'プロフィール アイコン アカウント メール ログイン ログアウト ニックネーム ランキング 退出'}},
 {scope:'personal',key:'profilePublic',label:{zh:'公开主页 签名 最喜欢的游戏 关注 同好',en:'Public profile signature favourite games follow kindred',ja:'公開プロフィール ひとこと 好きなゲーム フォロー 同好'}},
 ...['language','username','closeToTray','accent','fontFamily','themeMode','homeFontScale'].map(key=>({scope:'general',key,label:{zh:({fontFamily:'界面字体',homeFontScale:'主页字体大小',
  themeMode:'明暗模式',avatar:'头像'})[key]||text[key]||key,en:key}})),
 {scope:'background',key:'homeBackground',label:{zh:'主页背景图片 选择图片 调整显示区域 使用已有背景图',en:'Home background image crop',ja:'ホーム背景画像'}},
 {scope:'data',key:'backup',label:{zh:'数据导入导出备份恢复',en:'Data import export backup restore',ja:'データ バックアップ 復元'}}
 ,{scope:'speech',key:'voice-preview',label:{zh:'语音角色 情感 试听 惠惠咏唱 推荐声音下载',en:'Voice character emotion preview recommended voice downloads',ja:'音声キャラクター 感情 試聴 おすすめの声'}}
 ,{scope:'translation',key:'local-models',label:{zh:'翻译方式 免费在线机翻 API 本地翻译模型 下载部署 启动服务',en:'Translation type free online API local models download deploy server',
  ja:'翻訳方式 無料オンライン API ローカルモデル ダウンロード サーバー'}}
 ];}
export function mountSettingsSearch({content,data,text,locale,esc,navigate}){
 const search=content.querySelector(':scope > .settings-search')||document.createElement('input'),results=content.querySelector(':scope > .settings-search-results')||document.createElement('section');
  search.type='search';search.className='settings-search';search.placeholder={zh:'搜索全部设置，支持拼音…',en:'Search all settings…',ja:'すべての設定を検索…'}[locale];search.setAttribute('aria-label',
  search.placeholder);results.className='settings-search-results';results.hidden=true;results.replaceChildren();search.value='';if(!search.isConnected)content.prepend(search,
  results);
 const entries=globalSearchEntries(data,text);
 search.oninput=()=>{const query=search.value.trim();results.hidden=!query;content.classList.toggle('searching',!!query);if(!query){results.replaceChildren();return;
  }const found=entries.filter(item=>matchesSetting(item,query));results.innerHTML=found.length?found.map((item,index)=>`<button type="button" data-result="${index}"><span>${esc(item.label[locale]||item.label.zh)}</span><small>${esc(data.groups.find(group=>group.id===item.scope)?.label[locale]||text.settings)} →</small></button>`).join(''):`<p class="settings-help">${{zh:'没有找到匹配的设置',en:'No matching settings',ja:'一致する設定はありません'}[locale]}</p>`;
  results.querySelectorAll('[data-result]').forEach(button=>button.onclick=()=>navigate(found[Number(button.dataset.result)]));};
 return search;
}
