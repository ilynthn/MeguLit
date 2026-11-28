/* SPDX-License-Identifier: GPL-3.0-or-later
   MeguLit kana module · view: gojuon (ported from the approved prototype) */
export function view(el,ctx){
const go=ctx.go,params=ctx.params;
el.className='v-gojuon';
el.innerHTML=`<div class="wrap">
  <a class="back" href="index.html">← 学习</a>
  <div class="head">
    <h1>五十音图<small id="subtitle"></small></h1>
    <div class="head-right"><div class="progress" id="progress"></div>${ctx.volumeHTML()}</div>
  </div>

  <div class="controls">
    <div class="seg" id="script" role="group" aria-label="文字">
      <button data-v="h" aria-pressed="true">平假名</button><button data-v="k" aria-pressed="false">片假名</button>
    </div>
    <div class="seg" id="cat" role="group" aria-label="分类">
      <button data-v="seion" aria-pressed="true">清音</button><button data-v="daku" aria-pressed="false">浊音 · 半浊音</button><button data-v="yoon" aria-pressed="false">拗音</button><button data-v="special" aria-pressed="false">特殊音</button>
    </div>
    <label class="switch"><input type="checkbox" id="romaji" checked>罗马音</label>
    <span class="spacer"></span>
    <span class="kbd-hint"><kbd>←↑↓→</kbd> 移动 · <kbd>空格</kbd> 发音 · <kbd>1-4</kbd> 熟悉度 · <kbd>Tab</kbd> 平/片</span>
  </div>

  <div class="body">
    <div>
      <div class="table" id="table"></div>
      <div class="table-note" id="tnote"></div>
    </div>
    <aside class="detail" id="detail" aria-live="polite"></aside>
  </div>
  <p class="note">笔顺数据：KanjiVG（© Ulrich Apel，CC BY-SA 3.0）</p>
</div>`;
 /* voice choice under the gojuon chart (user, 2026-11-09) */el.querySelector('#table')?.after(ctx.voicePicker());

/* ======== 数据 ======== */
const COLS=["a","i","u","e","o"],COLH="あいうえお",COLK="アイウエオ";
/* 清音：null 表示该位置没有现代假名 */
const SEION=[
 ["あ","a",["あ","い","う","え","お"],["a","i","u","e","o"]],
 ["か","k",["か","き","く","け","こ"],["ka","ki","ku","ke","ko"]],
 ["さ","s",["さ","し","す","せ","そ"],["sa","shi","su","se","so"]],
 ["た","t",["た","ち","つ","て","と"],["ta","chi","tsu","te","to"]],
 ["な","n",["な","に","ぬ","ね","の"],["na","ni","nu","ne","no"]],
 ["は","h",["は","ひ","ふ","へ","ほ"],["ha","hi","fu","he","ho"]],
 ["ま","m",["ま","み","む","め","も"],["ma","mi","mu","me","mo"]],
 ["や","y",["や",null,"ゆ",null,"よ"],["ya",null,"yu",null,"yo"]],
 ["ら","r",["ら","り","る","れ","ろ"],["ra","ri","ru","re","ro"]],
 ["わ","w",["わ",null,null,null,"を"],["wa",null,null,null,"o"]],
 ["ん","n",["ん",null,null,null,null],["n",null,null,null,null]]
];
const DAKU=[
 ["が","g",["が","ぎ","ぐ","げ","ご"],["ga","gi","gu","ge","go"]],
 ["ざ","z",["ざ","じ","ず","ぜ","ぞ"],["za","ji","zu","ze","zo"]],
 ["だ","d",["だ","ぢ","づ","で","ど"],["da","ji","zu","de","do"]],
 ["ば","b",["ば","び","ぶ","べ","ぼ"],["ba","bi","bu","be","bo"]],
 ["ぱ","p",["ぱ","ぴ","ぷ","ぺ","ぽ"],["pa","pi","pu","pe","po"]]
];
const YOON_BASE=[["き","k"],["し","sh"],["ち","ch"],["に","ny"],["ひ","hy"],["み","my"],["り","ry"],["ぎ","gy"],["じ","j"],["び","by"],["ぴ","py"]];
/* 2026-11-28 特殊音: 促音・长音, then the katakana-only loanword sounds (kept here in hiragana form; the table shows them in katakana) */
const SPECIAL=[
 ["促音 · 长音","",["っ","ー",null,null,null],["(促音)","(长音)",null,null,null]],
 ["ファ 组","",["ふぁ","ふぃ","ふぇ","ふぉ","ふゅ"],["fa","fi","fe","fo","fyu"]],
 ["ティ 组","",["てぃ","でぃ","とぅ","どぅ","でゅ"],["ti","di","tu","du","dyu"]],
 ["ウィ 组","",["うぃ","うぇ","うぉ","いぇ",null],["wi","we","wo","ye",null]],
 ["ヴ 组","",["ゔぁ","ゔぃ","ゔ","ゔぇ","ゔぉ"],["va","vi","vu","ve","vo"]],
 ["シェ 组","",["しぇ","ちぇ","じぇ",null,null],["she","che","je",null,null]],
 ["ツァ 组","",["つぁ","つぃ","つぇ","つぉ",null],["tsa","tsi","tse","tso",null]]
];
const YOON=YOON_BASE.map(([b,c])=>{const ys=["ゃ","ゅ","ょ"],vs=["a","u","o"];const r=c==="sh"||c==="ch"||c==="j"?vs.map(v=>c+v):vs.map(v=>c+(c.endsWith("y")?"":"y")+v);return [b,c,ys.map(y=>b+y),r]});

const ORIGIN_H={あ:"安",い:"以",う:"宇",え:"衣",お:"於",か:"加",き:"幾",く:"久",け:"計",こ:"己",さ:"左",し:"之",す:"寸",せ:"世",そ:"曽",た:"太",ち:"知",つ:"川",て:"天",と:"止",な:"奈",に:"仁",ぬ:"奴",ね:"祢",の:"乃",は:"波",ひ:"比",ふ:"不",へ:"部",ほ:"保",ま:"末",み:"美",む:"武",め:"女",も:"毛",や:"也",ゆ:"由",よ:"与",ら:"良",り:"利",る:"留",れ:"礼",ろ:"呂",わ:"和",を:"遠",ん:"无"};
const ORIGIN_K={ア:"阿",イ:"伊",ウ:"宇",エ:"江",オ:"於",カ:"加",キ:"幾",ク:"久",ケ:"介",コ:"己",サ:"散",シ:"之",ス:"須",セ:"世",ソ:"曽",タ:"多",チ:"千",ツ:"川",テ:"天",ト:"止",ナ:"奈",ニ:"仁",ヌ:"奴",ネ:"祢",ノ:"乃",ハ:"八",ヒ:"比",フ:"不",ヘ:"部",ホ:"保",マ:"末",ミ:"三",ム:"牟",メ:"女",モ:"毛",ヤ:"也",ユ:"由",ヨ:"与",ラ:"良",リ:"利",ル:"流",レ:"礼",ロ:"呂",ワ:"和",ヲ:"乎",ン:"尓"};
const WORD_H={あ:["あめ","雨"],い:["いぬ","狗"],う:["うみ","海"],え:["えき","车站"],お:["おと","声音"],か:["かさ","伞"],き:["きた","北"],く:["くも","云"],け:["けさ","今天早上"],こ:["こえ","嗓音"],さ:["さくら","樱花"],し:["しろ","白色"],す:["すし","寿司"],せ:["せかい","世界"],そ:["そら","天空"],た:["たまご","蛋"],ち:["ちず","地图"],つ:["つき","月亮"],て:["て","手"],と:["とり","鸟"],な:["なつ","夏天"],に:["にく","肉"],ぬ:["ぬの","布"],ね:["ねこ","猫"],の:["のど","喉咙"],は:["はな","花"],ひ:["ひと","人"],ふ:["ふね","船"],へ:["へや","房间"],ほ:["ほし","星星"],ま:["まど","窗户"],み:["みみ","耳朵"],む:["むし","虫子"],め:["め","眼睛"],も:["もり","森林"],や:["やま","山"],ゆ:["ゆき","雪"],よ:["よる","夜晚"],ら:["らいねん","明年"],り:["りんご","苹果"],る:["るす","不在家"],れ:["れきし","历史"],ろ:["ろうか","走廊"],わ:["わたし","我"],を:["ほんをよむ","读书（助词）"],ん:["ほん","书"],
 が:["がっこう","学校"],ぎ:["ぎん","银"],ぐ:["ぐあい","状况"],げ:["げんき","精神"],ご:["ごはん","饭"],ざ:["ざっし","杂志"],じ:["じかん","时间"],ず:["ずっと","一直"],ぜ:["ぜんぶ","全部"],ぞ:["ぞう","大象"],だ:["だいじょうぶ","没关系"],ぢ:["はなぢ","鼻血"],づ:["つづく","继续"],で:["でんわ","电话"],ど:["どこ","哪里"],ば:["ばしょ","地方"],び:["びょういん","医院"],ぶ:["ぶんか","文化"],べ:["べんとう","便当"],ぼ:["ぼく","我（男性）"],ぱ:["かんぱい","干杯"],ぴ:["ぴかぴか","闪闪发亮"],ぷ:["てんぷら","天妇罗"],ぺ:["ぺらぺら","流利"],ぽ:["さんぽ","散步"],
 きゃ:["きゃく","客人"],きゅ:["きゅう","九"],きょ:["きょう","今天"],しゃ:["しゃしん","照片"],しゅ:["しゅくだい","作业"],しょ:["しょくじ","用餐"],ちゃ:["おちゃ","茶"],ちゅ:["ちゅうい","注意"],ちょ:["ちょっと","稍微"],にゃ:["にゃあ","喵"],にゅ:["にゅうがく","入学"],にょ:["にょうぼう","妻子（旧）"],ひゃ:["ひゃく","一百"],ひゅ:["ひゅう","呼（风声）"],ひょ:["ひょう","表"],みゃ:["みゃく","脉搏"],みゅ:["みゅうじかる","音乐剧"],みょ:["みょうじ","姓氏"],りゃ:["りゃく","省略"],りゅ:["りゅう","龙"],りょ:["りょこう","旅行"],ぎゃ:["ぎゃく","相反"],ぎゅ:["ぎゅうにゅう","牛奶"],ぎょ:["きんぎょ","金鱼"],じゃ:["じゃあね","回头见"],じゅ:["じゅぎょう","上课"],じょ:["じょうず","擅长"],びゃ:["さんびゃく","三百"],びゅ:["びゅうびゅう","呼呼（风）"],びょ:["びょうき","生病"],ぴゃ:["はっぴゃく","八百"],ぴゅ:["ぴゅう","嗖"],ぴょ:["ぴょんぴょん","蹦蹦跳跳"]};
const WORD_K={ア:["アイス","冰淇淋"],イ:["インク","墨水"],ウ:["ウイルス","病毒"],エ:["エアコン","空调"],オ:["オレンジ","橙子"],カ:["カメラ","相机"],キ:["キス","亲吻"],ク:["クラス","班级"],ケ:["ケーキ","蛋糕"],コ:["コーヒー","咖啡"],サ:["サラダ","沙拉"],シ:["シャツ","衬衫"],ス:["スープ","汤"],セ:["セーター","毛衣"],ソ:["ソファ","沙发"],タ:["タクシー","出租车"],チ:["チーズ","奶酪"],ツ:["ツアー","旅行团"],テ:["テレビ","电视"],ト:["トマト","番茄"],ナ:["ナイフ","刀"],ニ:["ニュース","新闻"],ヌ:["ヌードル","面条"],ネ:["ネクタイ","领带"],ノ:["ノート","笔记本"],ハ:["ハンバーガー","汉堡"],ヒ:["ヒーロー","英雄"],フ:["フォーク","叉子"],ヘ:["ヘリコプター","直升机"],ホ:["ホテル","酒店"],マ:["マスク","口罩"],ミ:["ミルク","牛奶"],ム:["ムード","气氛"],メ:["メール","邮件"],モ:["モデル","模特"],ヤ:["ヤード","码"],ユ:["ユニフォーム","制服"],ヨ:["ヨーグルト","酸奶"],ラ:["ラジオ","收音机"],リ:["リボン","丝带"],ル:["ルール","规则"],レ:["レモン","柠檬"],ロ:["ロボット","机器人"],ワ:["ワイン","葡萄酒"],ヲ:["—","现代几乎只出现在助词「を」的片假名写法里"],ン:["パン","面包"],
 ガ:["ガラス","玻璃"],ギ:["ギター","吉他"],グ:["グラス","玻璃杯"],ゲ:["ゲーム","游戏"],ゴ:["ゴール","终点"],ザ:["ピザ","披萨"],ジ:["ジュース","果汁"],ズ:["チーズ","奶酪"],ゼ:["ゼロ","零"],ゾ:["ゾーン","区域"],ダ:["ダンス","舞蹈"],ヂ:["—","几乎不用"],ヅ:["—","几乎不用"],デ:["デート","约会"],ド:["ドア","门"],バ:["バス","公交车"],ビ:["ビル","大楼"],ブ:["ブログ","博客"],ベ:["ベッド","床"],ボ:["ボール","球"],パ:["パン","面包"],ピ:["ピアノ","钢琴"],プ:["プール","泳池"],ペ:["ペン","笔"],ポ:["ポスト","邮筒"],
 キャ:["キャンプ","露营"],キュ:["キュート","可爱"],キョ:["キョロキョロ","东张西望"],シャ:["シャツ","衬衫"],シュ:["シュート","射门"],ショ:["ショップ","商店"],チャ:["チャンス","机会"],チュ:["チューリップ","郁金香"],チョ:["チョコ","巧克力"],ニャ:["ニャー","喵"],ニュ:["ニュース","新闻"],ニョ:["—","较少见"],ヒャ:["—","较少见"],ヒュ:["ヒューズ","保险丝"],ヒョ:["ヒョウ","豹"],ミャ:["ミャンマー","缅甸"],ミュ:["ミュージック","音乐"],ミョ:["—","较少见"],リャ:["—","较少见"],リュ:["リュック","背包"],リョ:["—","较少见"],ギャ:["ギャグ","搞笑段子"],ギュ:["—","较少见"],ギョ:["ギョーザ","饺子"],ジャ:["ジャム","果酱"],ジュ:["ジュース","果汁"],ジョ:["ジョギング","慢跑"],ビャ:["—","较少见"],ビュ:["ビュー","景观"],ビョ:["—","较少见"],ピャ:["—","较少见"],ピュ:["ピューレ","果泥"],ピョ:["—","较少见"]};
/* 易混组：双向 */
const CONF_GROUPS=[["あ","お","め"],["い","り"],["う","ら","つ"],["さ","き","ち"],["ぬ","め"],["ね","れ","わ"],["る","ろ"],["は","ほ","ま"],["こ","に"],["し","つ"],["そ","ろ"],["シ","ツ"],["ソ","ン"],["ク","ケ","タ"],["ウ","ワ","フ"],["ア","マ"],["ヌ","ス"],["ユ","コ"],["チ","テ"],["ナ","メ"],["ノ","ソ"],["ロ","コ"],["エ","工"].slice(0,0)];
const CONF_TIP={"シ-ツ":"シ 的两点竖向排列、末笔从左下往右上挑；ツ 的三笔都向下，末笔从右上往左下撇","ソ-ン":"ソ 两笔都从上往下；ン 第二笔从左下往右上挑","ク-ケ-タ":"ク 只有两笔；タ 在 ク 里多一点；ケ 第三笔是长竖","ね-れ-わ":"三者左边都是「ノ+竖」，右边分别收成小圈、向上挑、圆弧","ぬ-め":"ぬ 末尾有小圈，め 没有","る-ろ":"る 末尾有小圈，ろ 没有","あ-お-め":"お 右上有一点，没有封闭的竖笔交叉；め 没有横线","さ-き-ち":"さ、き 都有横，き 多一横；ち 是 さ 的左右镜像","は-ほ-ま":"ほ 顶部封口；ま 没有左边的竖","い-り":"り 右笔更长；い 左笔更长","ウ-ワ-フ":"ウ 顶部有点；ワ 有左竖；フ 只有一笔","ア-マ":"ア 第二笔向下撇；マ 第二笔是短点","ヌ-ス":"ヌ 比 ス 多一个点","ユ-コ":"ユ 底横向右伸出；コ 是封闭的直角","チ-テ":"チ 顶部是撇；テ 顶部是短横","ナ-メ":"ナ 横＋撇；メ 两笔交叉成 X","こ-に":"に 左边多一竖","し-つ":"し 竖向弯；つ 横向弯","そ-ろ":"そ 顶部有折返","う-ら-つ":"う 顶部是点；ら 顶部是点且左侧有竖；つ 只有一笔","ノ-ソ":"ソ 比 ノ 多左上一点","ロ-コ":"ロ 四边封闭；コ 左边开口"};
const SOUND_NOTE={し:"读 shi，不是 si",ち:"读 chi，不是 ti",つ:"读 tsu，不是 tu",ふ:"读 fu，介于 f 和 h 之间，双唇轻吹",ら:"ら行 的辅音介于 l 和 r 之间，舌尖轻弹一下",を:"读 o，与 お 同音；现代只作助词",ん:"唯一一个单独的鼻音，不能放在词首",じ:"与 ぢ 同音（ji）",ず:"与 づ 同音（zu）",ぢ:"与 じ 同音，只在少数词里出现",づ:"与 ず 同音，只在少数词里出现",は:"作助词时读 wa",へ:"作助词时读 e"};

/* ======== 工具 ======== */
const toKata=s=>s.replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60));
const toHira=s=>s.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
const $=s=>el.querySelector(s);
const speaker='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
function say(t){ctx.speech.say(t)}
let mastery=ctx.store.get(ctx.store.KEY.m,{});
const saveM=()=>ctx.store.put(ctx.store.KEY.m,mastery);
const LV=["未学","见过","熟悉","掌握"];

let state={script:"h",cat:"seion",romaji:ctx.store.get(ctx.store.KEY.p,{}).romaji!==false,sel:{r:0,c:0}};
const data=()=>state.cat==="seion"?SEION:state.cat==="daku"?DAKU:state.cat==="special"?(state.script==="k"?SPECIAL:SPECIAL.slice(0,1)):YOON;
const ncols=()=>state.cat==="yoon"?3:5;
const disp=k=>k&&(state.script==="k"?toKata(k):k);
const rare=k=>["ぢ","づ"].includes(k);

/* ======== 表格 ======== */
function renderTable(){
  const rows=data(),n=ncols(),t=$("#table");
  t.className="table"+(state.cat==="yoon"?" yoon":"");
  t.style.gridTemplateColumns=`56px repeat(${n},minmax(0,1fr))`;
  const heads=state.cat==="yoon"?["ゃ","ゅ","ょ"]:state.cat==="special"?["","","","",""]:[...(state.script==="k"?COLK:COLH)].map(c=>c+"段");
  let html=`<div></div>`+heads.map(h=>`<div class="colhead">${state.cat==="yoon"&&state.script==="k"?toKata(h):h}</div>`).join("");
  rows.forEach((row,ri)=>{
    const label=state.cat==="special"?row[0]:state.cat==="yoon"?disp(row[0])+" +":row[0]==="ん"?disp("ん"):disp(row[0])+"行";
    html+=`<div class="rowhead">${label}</div>`;
    for(let ci=0;ci<n;ci++){
      const k=row[2][ci],r=row[3][ci];
      if(!k){html+=`<div class="gap" aria-hidden="true">${row[0]==="ん"?"":"—"}</div>`;continue}
      const d=disp(k),lv=mastery[d]||0,sel=state.sel.r===ri&&state.sel.c===ci;
      html+=`<button class="cell${sel?" sel":""}${rare(k)?" rare":""}" data-r="${ri}" data-c="${ci}" aria-label="${d} ${r}"><span class="dot l${lv}"></span><span class="k">${d}</span><span class="r">${r}</span></button>`;
    }
  });
  t.innerHTML=html;
  t.querySelectorAll(".cell").forEach(b=>b.onclick=()=>{state.sel={r:+b.dataset.r,c:+b.dataset.c};renderTable();renderDetail();say(cur().d)});
  el.classList.toggle("hide-romaji",!state.romaji);
  const notes={seion:["や行 只有 3 个、わ行 只有 2 个：其余位置在现代日语里没有假名","「ん」单独成行，不属于任何段","点击格子查看详情，彩色小点是你的熟悉度"],
    daku:["浊音 = 清音右上加「゛」，半浊音 = は行 加「゜」","ぢ / づ 与 じ / ず 同音，只在少数词里出现（灰色标「少用」）"],
    yoon:["拗音 = い段假名 + 小写 ゃ / ゅ / ょ，合成一个音节","小写字要写得明显更小，否则会读成两个音：きや ≠ きゃ"],
    special:["促音「っ」：停顿一拍，把下一个辅音读紧（きって kitte）；长音「ー」：把前一个元音拉长一拍（ケーキ keeki）",
     state.script==="k"?"外来音：片假名加小写 ァ ィ ゥ ェ ォ ュ，拼出日语原本没有的音，只用在外来词里":"外来音（ファ、ティ、ヴァ……）只用片假名写，切到「片假名」查看"]}[state.cat];
  $("#tnote").innerHTML=notes.map(x=>`<span>${x}</span>`).join("");
  $("#subtitle").textContent={seion:"清音 · 46",daku:"浊音 20 · 半浊音 5",yoon:"拗音 · 33",special:state.script==="k"?"促音 · 长音 · 外来音 26":"促音 · 长音"}[state.cat]+(state.script==="k"?" · 片假名":" · 平假名");
  renderProgress();
}
function renderProgress(){
  const all=SEION.flatMap(r=>r[2]).filter(Boolean).map(disp);
  const c=[0,0,0,0];all.forEach(k=>c[mastery[k]||0]++);
  $("#progress").innerHTML=`<span><b class="num">${c[2]+c[3]}</b> / ${all.length} 清音已熟悉</span>`+[1,2,3].map(l=>`<span><i style="background:var(--m${l})"></i>${LV[l]} ${c[l]}</span>`).join("");
}
function cur(){const row=data()[state.sel.r],k=row[2][state.sel.c];return {k,d:disp(k),r:row[3][state.sel.c],row,ci:state.sel.c}}

/* ======== 详情 ======== */
const kvgCache={};let animTok=0;
/* KanjiVG via data.js (it also supplies ー and ヴ); 拗音 / 外来音 have no strokes of their own, so each character gets its own box */
async function drawStroke(word){
  const chars=[...word],tok=++animTok,all=await Promise.all(chars.map(c=>ctx.data.strokesOf(c,ctx.base)));if(tok!==animTok)return;
  const boxes=[...el.querySelectorAll(".mini")];if(!boxes.length)return;
  const ps=[],ns=[];
  boxes.forEach((box,b)=>{const ds=all[b]||[];
    box.innerHTML=ds.map(d=>`<path d="${d}" class="gh"/>`).join("")+ds.map(d=>`<path d="${d}" class="st"/>`).join("")+ds.map((d,i)=>{const m=d.match(/M\s*([\d.]+)[ ,]([\d.]+)/);return `<text x="${+m[1]-8}" y="${+m[2]-2}" class="sn" opacity="0">${i+1}</text>`}).join("");
    ps.push(...box.querySelectorAll(".st"));ns.push(...box.querySelectorAll(".sn"));});
  $("#scount").textContent=all.map(ds=>ds.length).join(" + ")+" 画";
  ps.forEach(p=>{const L=p.getTotalLength();p.style.strokeDasharray=L;p.style.strokeDashoffset=L});
  if(matchMedia("(prefers-reduced-motion:reduce)").matches){ps.forEach((p,i)=>{p.style.strokeDashoffset=0;ns[i].setAttribute("opacity",1)});return}
  let i=0;(function next(){if(tok!==animTok||i>=ps.length){ps.forEach(p=>p.classList.remove("cur"));return}
    const p=ps[i],L=p.getTotalLength(),t0=performance.now(),dur=Math.max(380,L*7);p.classList.add("cur");ns[i].setAttribute("opacity",1);
    (function f(now){if(tok!==animTok)return;const k=Math.min(1,(now-t0)/dur);p.style.strokeDashoffset=L*(1-(1-Math.pow(1-k,2)));if(k<1)requestAnimationFrame(f);else{p.classList.remove("cur");i++;setTimeout(next,170)}})(t0)})();
}
function confusables(d){
  for(const g of CONF_GROUPS){if(g.includes(d)){const key=g.join("-");return {g,tip:CONF_TIP[key]||""}}}return null;
}
function renderDetail(){
  const {k,d,r,row,ci}=cur(),isY=[...k].length>1,isS=state.cat==="special",other=state.script==="k"?k:toKata(k);
  const base=isY?d[0]:null;
  const origin=!isY&&state.cat==="seion"?(state.script==="k"?ORIGIN_K[d]:ORIGIN_H[d]):null;
  const w=(state.script==="k"?WORD_K:WORD_H)[d]||WORD_H[k]||(x=>x&&[x[1],x[2]])(ctx.data.wordOf(d));
  const lv=mastery[d]||0,conf=!isY?confusables(d):null;
  const pos=isS?(isY?`${d[0]} + 小${d.slice(1)} · 外来音`:d==="ー"?"特殊音 · 长音":d==="ヴ"?"外来音 · ウ + ゛":"特殊音 · 促音"):isY?`${disp(row[0])} + 小${disp(k.slice(1))}`:row[0]==="ん"?"特殊音节 · 拨音":`${disp(row[0])}行 · ${disp(COLH[ci])}段`;
  let stroke;
  const minis=`<div class="mini-grid${isY?" multi":""}">${[...d].map(()=>'<svg viewBox="0 0 109 109" class="mini"></svg>').join("")}</div>`;
  if(isY) stroke=`<div class="d-stroke">${minis}<div><p class="d-text">由 <b class="ja" style="font-size:18px;color:var(--paper-ink)">${base}</b> 和小写的 <b class="ja" style="font-size:18px;color:var(--paper-ink)">${d.slice(1)}</b> 组成，读成一个音节「${r}」${isS?"，只在外来词里出现":`，不是「${toRomajiTwo(k)}」两拍`}</p><button class="pill" id="replay">重播笔顺</button> <span id="scount" style="font-size:12px;color:var(--paper-3)"></span></div></div>`;
  else stroke=`<div class="d-stroke">${minis}<div>${origin?`<p><b>${origin}</b>字源 · 「${origin}」→ ${d}</p>`:state.cat==="daku"?`<p>由「${disp(baseOf(k))}」加「${"ぱぴぷぺぽ".includes(k)?"゜":"゛"}」</p>`:""}<button class="pill" id="replay">重播笔顺</button> <span id="scount" style="font-size:12px;color:var(--paper-3)"></span></div></div>`;
  const note=SOUND_NOTE[k]||(isS?ctx.data.hintOf(d):"");
  $("#detail").innerHTML=`<div class="ribbon"></div>
   <div class="d-top"><div class="d-kana${isY?" yo":""}">${d}</div>
     <div class="d-meta"><div class="rom">${r}</div><div class="pair">${state.script==="k"?"平 ":"片 "}${state.script==="k"?k:toKata(k)}</div><div class="pos">${pos}</div></div>
     <button class="sound" id="snd" aria-label="播放发音">${speaker}</button></div>
   <div class="d-sec"><div class="d-label">${isY?"组成 · 笔顺":"笔顺"}</div>${stroke}</div>
   ${note?`<div class="d-sec"><div class="d-label">发音要点</div><p class="d-text">${note}</p></div>`:""}
   <div class="d-sec"><div class="d-label">例词</div>${w&&w[0]!=="—"?`<div class="d-word"><span class="w">${hl(w[0],d)}</span><span>${w[1]}</span><button class="pill" id="wsnd">♪</button></div>`:`<p class="d-text">${w?w[1]:"—"}</p>`}</div>
   ${conf?`<div class="d-sec"><div class="d-label">容易混淆<span>点击切换</span></div><div class="confuse">${conf.g.map(x=>`<button class="${x===d?"self":""}" data-jump="${x}"><b>${x}</b><small>${romajiOf(x)}</small></button>`).join("")}</div>${conf.tip?`<p class="d-text">${conf.tip}</p>`:""}</div>`:""}
   <div class="d-sec"><div class="d-label">我的熟悉度<span>按 1–4 也可以</span></div>
     <div class="levels">${LV.map((n,i)=>`<button data-l="${i}" aria-pressed="${i===lv}"><i></i>${n}</button>`).join("")}</div>
     <p class="lv-note">练习答对会自动升级，这里可以手动修正</p></div>`;
  drawStroke(d);$("#replay").onclick=()=>drawStroke(d);
  $("#snd").onclick=()=>say(d);
  const ws=$("#wsnd");if(ws)ws.onclick=()=>say(w[0]);
  $("#detail").querySelectorAll("[data-l]").forEach(b=>b.onclick=()=>setLevel(+b.dataset.l));
  $("#detail").querySelectorAll("[data-jump]").forEach(b=>b.onclick=()=>jump(b.dataset.jump));
}
const hl=(w,d)=>w.split(d).join(`<mark>${d}</mark>`);
function baseOf(k){const m={が:"か",ぎ:"き",ぐ:"く",げ:"け",ご:"こ",ざ:"さ",じ:"し",ず:"す",ぜ:"せ",ぞ:"そ",だ:"た",ぢ:"ち",づ:"つ",で:"て",ど:"と",ば:"は",び:"ひ",ぶ:"ふ",べ:"へ",ぼ:"ほ",ぱ:"は",ぴ:"ひ",ぷ:"ふ",ぺ:"へ",ぽ:"ほ"};return m[k]||k}
function romajiOf(x){for(const set of [SEION,DAKU,SPECIAL])for(const row of set)for(let i=0;i<5;i++)if(row[2][i]&&(row[2][i]===x||toKata(row[2][i])===x))return row[3][i];return ""}
function toRomajiTwo(k){return romajiOf(k[0])+" + "+({"ゃ":"ya","ゅ":"yu","ょ":"yo"}[k[1]])}
function jump(x){
  const isK=/[゠-ヿ]/.test(x),h=isK?toHira(x):x;
  for(const [cat,set] of [["seion",SEION],["daku",DAKU],["yoon",YOON],["special",SPECIAL]])for(let r=0;r<set.length;r++){const c=set[r][2].indexOf(h);if(c>=0){state.script=isK?"k":"h";state.cat=cat;state.sel={r,c};syncSeg();renderTable();renderDetail();say(x);return true}}
  return false;
}
function setLevel(l){const {d}=cur();mastery[d]=l;saveM();renderTable();renderDetail()}

/* ======== 控件 ======== */
function syncSeg(){
  el.querySelectorAll("#script button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===state.script));
  el.querySelectorAll("#cat button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===state.cat));
}
el.querySelectorAll("#script button").forEach(b=>b.onclick=()=>{state.script=b.dataset.v;syncSeg();renderTable();renderDetail()});
el.querySelectorAll("#cat button").forEach(b=>b.onclick=()=>{state.cat=b.dataset.v;state.sel={r:0,c:0};syncSeg();renderTable();renderDetail()});
$("#romaji").checked=state.romaji;$("#romaji").onchange=e=>{state.romaji=e.target.checked;const p=ctx.store.get(ctx.store.KEY.p,{});p.romaji=state.romaji;ctx.store.put(ctx.store.KEY.p,p);renderTable()};

function move(dr,dc){
  const rows=data(),n=ncols();let {r,c}=state.sel;
  for(let step=0;step<20;step++){
    if(dc){c+=dc;if(c<0){c=n-1;r--}if(c>=n){c=0;r++}}else r+=dr;
    if(r<0||r>=rows.length)return;
    if(dr&&!rows[r][2][c]){continue}
    if(rows[r][2][c]){state.sel={r,c};renderTable();renderDetail();return}
  }
}
ctx.onKey(e=>{
  if(e.target.closest("input,textarea"))return;
  const map={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]};
  if(map[e.key]){e.preventDefault();move(...map[e.key]);return}
  if(e.key===" "){e.preventDefault();say(cur().d)}
  if(/^[1-4]$/.test(e.key))setLevel(+e.key-1);
  if(e.key==="Tab"&&!e.shiftKey&&(e.target===document.body||e.target===document.documentElement)||e.key==="Tab"&&e.target.classList.contains("cell")){e.preventDefault();state.script=state.script==="h"?"k":"h";syncSeg();renderTable();renderDetail()}
});
if(!(params.k&&jump(params.k))){renderTable();renderDetail();}
/* 预合成当前表里的假名，点击即响 */
const _rt=renderTable;renderTable=function(){_rt();ctx.speech.prefetch([...el.querySelectorAll('#table .cell .k')].map(e=>e.textContent))};ctx.speech.prefetch([...el.querySelectorAll('#table .cell .k')].map(e=>e.textContent));

}
