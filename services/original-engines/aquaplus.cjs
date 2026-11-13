// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* E330 AQUAPLUS / Leaf KCAP archives (WHITE ALBUM2). script.pak holds one <scene>.txt string table per scene next to its
   compiled .bnr: the strings in order, separated by commas, as Shift-JIS. Strings with any non-ASCII character are text
   (dialogue, narration, names); the ASCII ones are anchors (mv01, sepia.AMP, B123.tga). In the text, <R漢字|よみ> is
   the game's ruby (漢字 is drawn), "\n" a line break, <W> <F> <S> ... display tags.
   E344 The Chinese patch (ck-gal.pak + fon.pak, WA2_chs.exe) keeps the Shift-JIS bytes and redraws the font atlases in
   fon.pak: a code picks a 40 px cell by its position in the ranges below (the table in WA2.exe, same in WA2_chs.exe:
   0x20-0x7D, ｱ-ﾝ, then JIS rows with the 0x7F gap kept for kanji), and cells 748-4349 (亜 onwards) hold the patch's own
   characters. GLYPHS is what those cells show, matched against 方正准圆 GBK (the font they were drawn with); other cells
   are the game's own and read as Shift-JIS. Only used when fon.pak is that exact build (its atlas entry sizes). */
const fs=require('node:fs'),path=require('node:path');
const {stat}=require('./file-key.cjs');
const listMemo=new Map();
// Index: "KCAP", 2 words, count, then 44-byte entries (compressed flag, 24-byte name, crc, unpacked size, offset, size).
/* E577 the KCAP index is a kit table: 44-byte entries {u32 compressed (1), name[24], 4, u32 size, u32 offset, u32 packed} */
const KCAP_TABLE={magic:'KCAP',count:{at:12,type:'u32le'},entries:16,encoding:'latin1',
 fields:[{name:'flags',type:'u32le'},{name:'name',type:'cstr',size:24},{type:'skip',size:4},{name:'unpacked',type:'u32le'},{name:'offset',type:'u32le'},{name:'size',type:'u32le'}]};
function kcapList(file){const key=file+'|'+stat(file);if(listMemo.has(key))return listMemo.get(key);let out=null;
 try{const l=kit.table(file,KCAP_TABLE);if(l&&l.length)out=l.map(e=>({compressed:e.flags===1,name:e.name,size:e.unpacked,offset:e.offset,packed:e.size}));}catch{out=null;}
 listMemo.set(key,out);if(listMemo.size>32)listMemo.delete(listMemo.keys().next().value);return out;}
// Leaf LZSS: 4 KiB window from 0xFEE, flag bits LSB first (1 = literal), references 12-bit offset + 4-bit length + 3.
/* E577 the common LZSS variant (kit.lzss defaults) */
const lzss=(src,start,outLen)=>kit.lzss(src.subarray(start),outLen);
function kcapRead(file,e){const b=kit.readAt(file,e.offset,e.packed);
 if(!e.compressed)return b;const len=b.length>=8?b.readUInt32LE(4):0;return lzss(b,8,len>0&&len<64<<20?len:e.size);}
const TXT=n=>/^\d[\w]*\.txt$/i.test(n);
const sjis=kit.SJIS;
const RUBY=/<R([^|>]*)\|([^>]*)>/g;
// E461 <F16…> and <W10…> wrap text (font size, wait): the tag and its closing > are dropped, the text kept
function clean(t){return t.replace(RUBY,'$1').replace(/<[A-Za-z]+\d*>?/g,'').replace(/>/g,'').replace(/\\n/g,'\n');}
function parse(buf,decode=b=>sjis.decode(b)){const lines=[],anchors=[],ruby=[];
 for(const tok of decode(buf).split(',')){if(!tok)continue;if(/^[\x20-\x7e]*$/.test(tok)){anchors.push(tok);continue;}
  const pairs=[];for(const m of tok.matchAll(RUBY))if(m[1]&&m[2])pairs.push([m[1],m[2]]);
  lines.push(clean(tok));ruby.push(pairs.length?pairs:null);}
 return {lines,anchors,ruby};}
// Cell ranges, low/high code pairs; the n-th code across them is atlas cell n.
const RANGES=[0x20,0x7d,0xb1,0xdd,0x8140,0x81ac,0x81b8,0x81bf,0x81c8,0x81ce,0x81da,0x81fc,0x824f,0x8258,0x8260,0x8279,0x8281,0x829a,0x829f,0x82f1,0x8340,0x8396,
 0x839f,0x83b6,0x83bf,0x83d6,0x8440,0x8460,0x8470,0x8491,0x849f,0x84be,0x8740,0x875d,0x875f,0x8775,0x877e,0x878f,0x889f,0x88fc,0x8940,0x89fc,0x8a40,0x8afc,0x8b40,
 0x8bfc,0x8c40,0x8cfc,0x8d40,0x8dfc,0x8e40,0x8efc,0x8f40,0x8ffc,0x9040,0x90fc,0x9140,0x91fc,0x9240,0x92fc,0x9340,0x93fc,0x9440,0x94fc,0x9540,0x95fc,0x9640,0x96fc,
 0x9740,0x97fc,0x9840,0x9872,0x989f,0x98fc,0x9940,0x99fc,0x9a40,0x9afc,0x9b40,0x9bfc,0x9c40,0x9cfc,0x9d40,0x9dfc,0x9e40,0x9efc,0x9f40,0x9ffc,0xe040,0xe0fc,0xe140,
 0xe1fc,0xe240,0xe2fc,0xe340,0xe3fc,0xe440,0xe4fc,0xe540,0xe5fc,0xe640,0xe6fc,0xe740,0xe7fc,0xe840,0xe8fc,0xe940,0xe9fc,0xea40,0xeaa4,0xf040,0xf0c0,0xfa40,0xfafc,
 0xfb40,0xfbfc,0xfc40,0xfc4b];
const GLYPH_FIRST=748,GLYPHS='一丁七万丈三上下不与丑专且世丘业丛东丝丢两严丧个丫中丰串临丸为主丽举乃久么义之乌乍乎乏乐乒乓乔乖乘乙九乞也习乡书买乱乳了予争事二于亏云互五井亘亚些亜亡亢交亦产享京亭亮亲亵人亿什仁仅仆仇今介仍从仓仔仕他仗付仙代令以仪们仰仲件价任份仿企伊伍伏伐休众优伙会伞伟传伤伦伪伫伯估伴伶伸伺似但位低住佐佑体何余佛作你佣佩佯佳佻佼使侃侈例侍供依侣侥侧侮侯侵煙便係促俄俊俏俐俑俗俘保信俩俭修俯俱俺倍倒倔倘候倚借倦倪值倾偃假偎偏做停健偶偷偿傅傍備储催傲傻像僚僧僵僻儿兀允元充兆先光克免兑兔党兜兢入全八公六兮兰共关兴兵其具典养兼兽冀内円冈册再冒冕冗写军农冠冢冤冥冬冰冲决冴况冶冷冻冽净凄准凇凉凋凌减凑凛凝几凡凤凭凯凳凶凸凹出击函凿刀刁刃分切刊刑划列刘则刚创初删判別刨利别刮到制刷券刹刺刻剂剃削前剐剑剔剜剥剧剩剪副割剽劇劈力劝办功加务劣动助努励劲劳効劾势勃勇勉勋勒務勤勺勾匀包匆化北匙匠匪匮匹区医匿十千升午半华协卑卓单卖南博卜卟占卡卢卦卧卫卯印危即却卷卸卿厂厄厅历厉压厌厕厘厚原厢厥厦厨厮去县参又叉及友双反发叔取受变叙叛叠口古句另叨叩只叫召叮可台叱史右叵叶号司叹叻叽吁吃各合吉吊同名后吐向吓吕吗君吝吞吟否吧吩含听吭吮启吱吵吸吹吻吼吾呀呂呃呆呈告呐呓呕呗员呛呜呢呣呦周味呵呻呼命呿咀咂咄咆咋和咎咏咐咒咔咕咖咙咚咛咝咤咦咧咨咪咫咬咯咱咲咳咸咻咽咿哀品哄哆哇哈哉响哎哑哒哔哗哝哟員哥哦哧哨哩哪哭哮哲哼哽唆唇唉唏唐唔唠唤唧唬售唯唰唱唷唾啃啄商啊啕啜啡啤啥啦啧啪啬啮啰啵啸啼啾喀喂喃善喉喊喋喏喔喘喜喝喧喱喳喵喷喻喽嗄嗅嗒嗓嗔嗜嗟嗤嗦嗫嗬嗯嗽嘀嘈嘉嘎嘘嘚嘛嘞嘟嘭嘱嘲嘴嘶嘻嘿噌噎噗噙噜噢器噩噪噫噬噱噶嚎嚏嚓嚣嚯嚷嚼囊囔囚四回因团団囤囧园困围固国图圆圈園土圣圧在圭地场圾址坂均坎坏坐坑块坚坛坝坞坟坠坡坦坪垂垃型垒垢垣垫垮埃埋城域培基堀堂堆堕堡堤堪堵塌塑塔塚塞填塾境墅墓増墙增墟墨壁壑壤士壮声壳壶处备复夏夕外夙多夜够大天太夫夭央失头夷夸夹夺奄奇奈奉奋奎奏契奔奖套奚奠奢奥女奴奶奸她好如妄妆妇妈妊妒妖妙妥妨妩妹妻姆始姐姑姓委姗姜姨姬姻姿威娃娇娑娘娠娱娴娶婆婉婊婚婪婴婶媒媚媲媾嫁嫉嫌嫡嫩嬉子孑孔孕字存孙孜孝孟季孤学孩孱孽宁它宅宇守安完宏宕宗官宙定宛宜宝实宠审客宣室宪宫宮宰害宴宵家容宽宾宿寂寄密富寐寒寓寝寞察寡寥寨寸对寺寻导対寿封射将尊小少尔尖尘尚尝尤尬就尴尸尹尺尻尼尽尾尿局屁层居屈屉届屋屏屑展属履屯山岁岂岌岔岗岛岡岩岭岳岸峙峭峰峻崇崎崖崛崩崭嵌巅川州巡巢工左巧巨巩差己已巴巷巾币市布帅帆师希帐帕帖帘帝带席帮帷常帽幄幅幌幕幡幢干平年并幸幻幼幽广庁庄庆庇床序庐库应底店庞废度座庭庶康庸廉廊廓延建开异弃弄弊式弓引弗弛弟张弥弦弭弯弱弹强弾归当录彗形彦彩彰影彷役彻彼往征径待很徊律徐徒従得徘御徨循微德徽心必忆忌忍忏忒志忘忙忠忡忧忪快念忸忽怀态怂怃怄怎怒怕怖怜思怠怡急性怨怩怪怯总恋恍恐恒恕恙恢恤恨恩恬恭息恰恳恶恸恼恿悄悉悍悔悖悚悟悠患悦您悩悬悯悲悴悸情惊惋惑惕惘惚惜惟惠惦惧惨惩惫惬惭惮惯惰想惴惶惹惺愁愈愉意愕愚感愣愤愧愿慈慌慎慕慢慧慨慰慵慷憋憎憔憧憩憬憾懂懈懊懑懒懦懵戏成我戒或战戚戛截戮戳戴户戾房所扁扇扉手才扎扑扒打扔托扛扣执扩扫扬扭扮扯扰扳扶批扼找承技抄抉把抑抒抓投抖抗折抚抛抜抠抡抢护报抨披抬抱抵抹抻押抽拂拄担拆拇拈拉拌拍拎拐拒拓拔拖拗拘拙招拜拟拢拣拥拦拧拨择括拭拯拳拷拼拽拾拿持挂指按挎挑挖挚挛挞挟挠挡挣挤挥挨挪挫振挲挺挽捂捅捆捉捎捏捐捕捞损捡换捣捧据捱捶捷捺捻掀掂授掉掌掏掐排掖掘掠探接控推掩措掰掳掺揄揉揍描提插握揣揪揭援揶揽搀搁搂搅搏搐搓搔搜搞搪搬搭携摁摄摆摇摊摒摔摘摧摩摸撂撅撇撑撒撕撞撤撩撬播撰撵撷撼擅操擎擦攀攒攥支收攸改攻放政故效敌敏救教敛敝敞敢散敦敬数敲整敷文斑斓斗料斜斟斤斥斩断斯新方施旁旅旋族旗无既日旦旧旨早旬旱时旷旺昂昌明昏易昔星映春昧昨昭是昵昼显時晃晋晌晒晓晕晚晦晨晩普景晰晴晶智晾暂暄暇暑暖暗暧暮暴曜曝曰曲曳更書曹曼曽曾替最月有朋服朔朗望朝期朦木未末本札术朱朴朵机朽杀杂权杆杉李材村杖杜杞束条来杯杰東杵松板极构枉析枕枚果枝枢枪枯架枷柄柏某柑染柔柜柠查柱柳柴标栋栏树栓栖栗校株样核根格栽桃框案桌桑桓档桥桶梁梅梆梓梗梦梨梭梯械梱梳检棉棍棒棘棚森棱棵棺椅植椒楚楞業楼楽概榄榆榛榜榨榻槛槟槭槽模横樱橄橇橘橙橡橱檬欠次欢欣欧欲欸欺款歇歉歌止正此步武歧歪歹死殃殆殊残殖殡殴段殷殿毁毅毋母毎每毒比毕毗毙毛毡毫毯氏民气氛氧水永汁求汇汉汗江池污汤汪汰汲汹汽沁沉沐沓沙沛沟没沢沥沦沧沫沮河沸油治沼沾沿泄泉泌法泛泞泡波泣泥注泪泫泰泳泻泼泽洁洋洒洗洛洞津洪洲活洽派流浃浅浆浇浊测济浏浑浓浜浦浩浪浮浴海浸涂消涉涌涕涛涡涤润涨涩涮涯液涵涸淀淆淇淋淌淘淡淤淫深混淹添清渊渍渐渗渚渝渠渡渣温港渴游渺湃湎湖湛湮湾湿溃溅源溜溢溪溯溶溺滂滋滑滓滔滚滞满滤滥滨滩滴漂漆漉漏漓演漠漩漫漱潇潘潜潦潮潸潺澄澈澎澜澡激濑濡瀑瀬灌火灭灯灰灵灶灼灾灿炉炊炎炒炖炙炫炭炮炸点炼炽烁烂烈烊烘烙烛烟烤烦烧烩烫烬热烹焉焕焚焦焰然煌煎煞煤照煮煲煽熄熊熏熔熟熠熬熱燃燎燥爆爪爬爱爵父爷爸爹爽片版牌牒牙牛牟牢物牲牵湯特牺犀犊犒犟犬犯状犹狂狈狗狙狞狠狡狩独狭狰狱狼猎猛猜猥猪猫献猴猾獠玄率玉王玛玩玫环现玲玷玻珍珑珠班現球理琐琢琦琴瑕瑟瑰璃璞璧瓜瓣瓦瓶瓷甄甘甚甜生用甩田由甲申电男甸町画畅界畏畑畔留畜略番畴畷疏疑疗疙疚疡疤疫疮疯疲疵疼疾痂病症痉痊痒痕痛痴痹瘁瘙瘟瘤瘦瘩瘪瘫瘾癌癖癫登白百皂的皆皇皎皑皙皮皱盂盆盈益盎盏盐监盒盖盗盘盛盟盥目盯盲直相盹盼盾省眈眉看真眠眨眩眯眶眷眸眺眼着睁睐睑睛睡督睦睫睬睹睽睾瞄瞅瞌瞎瞒瞟瞥瞧瞩瞪瞬瞰瞳矗矛矜矢知矩矫短矮石矶矿码砂砍研砣砧砰破砸础硕硬确碌碍碎碗碜碟碰碱碳碴確碾磁磕磨礁示礼社祈祖祝神祥票祭祷祸禁禅福禧离禽秀私秃秉秋种科秒秘租秤秩积称移秽稀程稍稚稠稳稻稽稿穂穆穗穴究穷空穿突窃窄窍窒窗窘窜窝窥窪立竖站竞竟章童竭端竹竿笃笋笑笔笛符笨第笹笺笼等筋筐筑筒答策筛筝筷筹签简箍算管箭箱節篇篓篮篷簇簌簿籍米类粉粒粗粘粥粪粮粱粲粹粼精糊糕糖糗糙糟系紊純素索紧紫累組結絮絶緒編縄縛繁纂纠红纤约级纪纯纱纲纳纵纷纸纹纺纽线练组绅细织终绊绌绍绎经绑绒结绕绘给绚络绝绞统绣继绩绪续绮绯绰绳维绵绷绸绺综绽绿缀缄缅缎缓缔缕编缘缚缜缝缠缤缩缪缭缴缸缺罄罐网罔罕罗罚罢罩罪置署罹羁羊美羚羞羡群義羹羽翁翅翌翔翘翩翰翱翻翼耀老考者而耍耐耕耗耙耳耶耸耻耽耿聆聊聋职联聘聚聩聪肃肆肉肋肌肖肘肚肝肠股肢肤肥肩肪肮肯育肴肺肿胀胁胃胆背胎胖胛胜胞胡胧胫胳胶胸能脂脆脇脈脉脊脏脐脑脓脖脚脯脱脸脾腆腋腐腑腔腕腫腮腰腹腺腻腼腾腿膀膈膊膏膛膜膝膨膺臀臂臃臆臊臣自臭至致臼舆舌舍舐舒舔舞舟航般舰舱舵船艮良艰色艳艺艾节芋芒芝芥芦芬芭花芳芽苍苏苗苛苟若苦英苹茁茂范茄茅茎茧茫茬茵茶茼荆草荐荒荚荞荡荣药荷荻莅莉莓莞莫莱莲获莽菇菊菌菜菠菩華菱菲萃萄萌萍萎萝营萦萨落著葛葡董葩葫葬葱葵蒂蒙蒜蒸蒿蓄蓝蓦蓬蔑蔓蔚蔬蔷蔼蔽蕉蕴蕾薄薇薪薯藉藏藐藕藤藻蘑蘸虎虏虐虑虔虚虫虹虽蚀蚁蚂蚊蚬蛇蛊蛋蛎蛛蛤蛮蜂蜃蜊蜚蜜蜡蜷蝇蝈蝴蝶螃融螺蟀蟋蟹蠕蠢血衅行衍衔街衡衣补表衫衬衰衷袋袒袖袜被袭袱裁裂装裕裙裤裱裸裹褒褥褪褶襟西要覆親见观规觅视览觉觑角解觥触言記診話誉誓警譬计订认讥讧讨让讪训议讯记讲讳讴讶许讹论讽设访诀证评诅识诈诉诊词译试诗诙诚话诞诟诠诡询该详诨诫语误诱诲说诵诶请诸诹诺读诽课谁调谄谅谈谊谋谎谐谑谓谙谜谢谣谤谦谧谨谩谬谭谱谴谷豁豆象豪豫貌贝负贡财责贤败账货质贩贪贫贬购贯贱贲贴贵贷贸费贺贼资赅赋赌赎赏赐赔赖赚赛赞赠赢赤赦赫走赴赶起趁超越趋趟趣足趴趾跃跄跌跑跚距跟跤跨跪路跳践踉踌踏踝踟踢踩踪踮踱踵踹蹂蹄蹈蹋蹑蹒蹙蹦蹩蹬蹭蹰蹲蹶躁躇躏躙身躬躯躲躺車輩车轨转轮软轰轴轶轻载较辄辅辆辈辉辍辐辑输辕辗辙辛辜辞辟辣辨辩辫辰辱边辻达迁迂迄迅过迈迎运近返还这进远违连迟迥迪迫迭述迷迸迹追退送适逃逅逆选逊透逐递途逗通逛逝逞速造逡逢逮逸逻逼逾遂遇遍遏道遗遢遣遥遭遮遵避邀邂邃邋那邦邪邮邸邻郁郊郎郑部都鄂鄙酊酌配酒酝酥酩酪酬酱酷酸酿醇醉醋醍醐醒醺采释里重野量金釜鈴鉴鏖针钉钓钝钞钟钢钥钦钧钩钮钱钳钵钻钿铁铃铅铐铜铠铩铭铲银铺链销锁锅锈锋锏锐错锢锤锥锦键锲锻镁镇镌镖镜镣镯镳镶長长間门闪闭问闯闲间闷闸闹闺闻阀阁阂阅阔阖队阪阱防阳阴阵阶阻阿附际陆陈陋陌降限陡院除险陪陶陷隆随隐隔隘隙障隧隶难雀雄雅集雇雌雏雕雨雪雳零雷雾需霄霆震霉霎霜霞霭露霸霹霾青靓静非靠靡面革靴靶鞋鞠鞭韧韭音韵顎页顶项顺须顽顾顿颁颂预领颇颈颊频颓颔颖颗题颚颜额颠颤颦颧風风飒飘飙飞食飯餐餮饕饥饪饭饮饯饰饱饲饵饶饼饿馅馆馈首香馨馬马驭驯驰驱驳驴驶驹驻驾骂骄骇骋验骑骗骚骤骨骰骸骼髓高鬓鬼魁魂魄魅魔鰤鱈鱼鱿鲁鲑鲜鲭鳕鳞鸟鸡鸣鸦鸭鸽鸿鹅鹏鹤鹫鹰麦麻麾黄黎黏黑黔默黯鼎鼓鼠鼻鼾齐齿龄龈龙龟一匣椎瞭忱鞥瞠狐庚杠怅嘁鹊伎泊鳌屌屡煨恣泯涟糅婀桔発赁卒瞑狸孰颐偕赘林馁缥盔恻殉漪娜捋忤茨缈酵鲠舷砺罅';
// fon.pak of the WA2 Chinese patch v2.00: packed sizes of its four atlases (14pt明朝, 14pt丸ゴ, 明朝80, 丸ゴ80 order as stored).
const FON_SIZES='833652,724679,3302082,1918771';
let cellOf=null;
function cell(code){if(!cellOf){cellOf=new Map();let n=0;for(let k=0;k<RANGES.length;k+=2)for(let c=RANGES[k];c<=RANGES[k+1];c++)cellOf.set(c,n++);}return cellOf.get(code);
 }
// Decodes ck-gal.pak text: the patch's cells give their character, the rest is plain Shift-JIS.
const chars=new Array(65536);
function charOf(code){let c=chars[code];if(c===undefined){const n=code>0xff?cell(code):undefined;
  c=chars[code]=n!==undefined&&n>=GLYPH_FIRST&&n<GLYPH_FIRST+GLYPHS.length?GLYPHS[n-GLYPH_FIRST]:code<0x80?String.fromCharCode(code):sjis.decode(code>0xff?Buffer.from([code>>8,
   code&255]):Buffer.from([code]));}
 return c;}
function patchDecode(buf){const out=[];
 for(let i=0;i<buf.length;i++){const b=buf[i];
  if((b>=0x81&&b<=0x9f||b>=0xe0&&b<=0xfc)&&i+1<buf.length){out.push(charOf(b<<8|buf[i+1]));i++;}else out.push(charOf(b));}
 return out.join('');}
const fonMatches=file=>{const l=kcapList(file);return !!l&&l.filter(e=>/\.tga$/i.test(e.name)).map(e=>e.packed).join(',')===FON_SIZES;};
const scriptPak=dir=>{const f=path.join(dir,'script.pak');return fs.existsSync(f)&&kcapList(f)?f:null;};
const aquaplus={
 id:'aquaplus',hint:'script.pak',
 scenes(dir){const f=scriptPak(dir);if(!f)return [];
  return kcapList(f).filter(e=>TXT(e.name)).map(e=>({name:e.name,read:()=>kcapRead(f,e)})).sort((a,b)=>a.name.localeCompare(b.name));},
 archives:()=>[],
 sources:dir=>{const f=scriptPak(dir);return f?[f]:[];},
 parse,test:()=>false,
 // The Chinese patch: ck-gal.pak next to its fon.pak (game folder or a backup of it), scene by scene with the same
 // number of lines and the same anchors; any other fon.pak means an unknown glyph table, so no pairing.
 patchLines(base,found){
  const pick=name=>{const f=found.files.get(name);if(f?.path)return f.path;for(const d of found.dirs){const p=path.join(d,name);if(fs.existsSync(p))return p;}return null;
   };
  const ck=pick('ck-gal.pak');if(!ck||!kcapList(ck))return null;
  const fon=[path.join(path.dirname(ck),'fon.pak'),pick('fon.pak')].find(f=>f&&fs.existsSync(f));if(!fon||!fonMatches(fon))return null;
  const byName=new Map(kcapList(ck).filter(e=>TXT(e.name)).map(e=>[e.name.toLowerCase(),e]));let any=false;
  const list=base.map(scene=>{const e=byName.get(scene.name.toLowerCase());if(!e)return scene;let w;try{w=parse(kcapRead(ck,e),patchDecode);}catch{return scene;
   }
   if(w.lines.length!==scene.lines.length)return {...scene,skipped:'count'};
   const n=scene.anchors.length;let same=0;for(let k=0;k<Math.min(n,w.anchors.length);k++)if(w.anchors[k]===scene.anchors[k])same++;
   if(n>=5&&(w.anchors.length!==n||same<n*.9))return {...scene,skipped:'anchors'};
   any=true;return {...scene,patched:true,lines:w.lines};});
  return any?list:null;},
 _internal:{kcapList,kcapRead,lzss,clean,cell,patchDecode,fonMatches},
};
/* E450 voices (WHITE ALBUM2). A scene's compiled script (<n>.bnr, u32 words) pushes ints as 5 3 <v> and calls
   engine functions as 4 <id>. The message call takes the message number first (0, 1, 2 … in order); the voice call
   takes (character, 256, 0, 0, voice number) and comes before its message. Message k is the k-th text of <n>.txt
   that is not a speaker name; the clip is <n>_<number:4>_<character:2>.OGG in VOICE.PAK. Function ids are found by
   these argument shapes, not fixed. */
function calls(bnr){const w=[];for(let i=0;i+4<=bnr.length;i+=4)w.push(bnr.readInt32LE(i));const out=[];
 for(let i=1;i<w.length-1;i++)if(w[i]===4&&w[i+1]>0&&w[i+1]<1024){const args=[];let j=i-1;while(j>=2&&w[j-2]===5&&w[j-1]===3){args.unshift(w[j]);j-=3;}
  /* E461 a message call is preceded by 3 <n>: n is the index of the string it shows among all comma-separated strings of
     <n>.txt (names, anchors and choices included), so the message's text is read from there, not counted out */
  const str=j>=1&&j<i-1&&w[j-1]===3&&w[j]>=0?w[j]:null;out.push({id:w[i+1],args,str});}
 return out;}
function voiceFns(list){const by=new Map();for(const c of list){if(!c.args.length)continue;const a=by.get(c.id)||[];a.push(c.args);by.set(c.id,a);}
 const rising=(rows,k)=>rows.length>=2&&rows.every((r,i)=>r.length>k&&r[k]===(i===0?r[k]:rows[i-1][k]+1))&&rows[0][k]===0;
 // voice numbers mostly go up but may start anywhere and skip (a scene shares numbering with its branches)
 const upward=(rows,k)=>{let up=0;for(let i=1;i<rows.length;i++)if(rows[i][k]>=rows[i-1][k])up++;return rows.length===1||up>=(rows.length-1)*0.9;};
 let message=null,voice=null,most=0,mostM=0;for(const [id,rows] of by){if(rows.length>mostM&&rows.every(r=>r.length===2)&&rows[0][0]===0&&upward(rows,0)){message=id;
  mostM=rows.length;}if(rows.length>most&&rows.every(r=>r.length===5)&&upward(rows,4)){voice=id;most=rows.length;}}
 return {message,voice};}
const isName=(t,next)=>!!next&&/^[「『（]/.test(next)&&!/^[「『（]/.test(t)&&[...t].length<=12;
function sceneVoices(stem,txt,bnr){const raw=sjis.decode(txt).split(','),toks=raw.filter(t=>t&&!/^[\x20-\x7e]*$/.test(t)),msgs=[];
 for(let i=0;i<toks.length;i++)if(!isName(toks[i],toks[i+1]))msgs.push(clean(toks[i]));
 const list=calls(bnr),{message,voice}=voiceFns(list);if(message===null||voice===null)return [];const out=[];let pending=[];
 // several voices before one message (people talking at once) all go with it
 for(const c of list){if(c.id===voice&&c.args.length===5)pending.push(stem.split('_')[0]+'_'+String(c.args[4]).padStart(4,'0')+'_'+String(c.args[0]).padStart(2,
  '0'));
  else if(c.args.length===2&&(c.id===message||(c.str!==null&&c.args[1]===1&&pending.length))){
   const t=c.str!==null&&raw[c.str]&&!/^[\x20-\x7e]*$/.test(raw[c.str])?clean(raw[c.str]):c.id===message?msgs[c.args[0]]:null;
   if(t)for(const ref of pending)out.push({text:t.replace(/\\[a-z]/gi,''),ref});pending=[];}}
 return out;}
aquaplus.voiceLines=dir=>{const f=scriptPak(dir);if(!f)return [];const l=kcapList(f),byName=new Map(l.map(e=>[e.name.toLowerCase(),e]));const out=[];
 for(const e of l){if(!TXT(e.name))continue;const stem=e.name.replace(/\.[^.]+$/,''),b=byName.get(stem.toLowerCase()+'.bnr');if(!b)continue;try{out.push(...sceneVoices(stem,
  kcapRead(f,e),kcapRead(f,b)));}catch{}}
 return out;};
// LAC archives (VOICE.PAK): "LAC\0", count, then {name XOR 0xFF (32), size, offset} per clip.
aquaplus.audio=file=>{if(!/\.pak$/i.test(file))return null;let fd;try{fd=fs.openSync(file,'r');const h=Buffer.alloc(8);fs.readSync(fd,h,0,8,0);if(h.toString('latin1',
 0,4)!=='LAC\0')return null;const n=h.readUInt32LE(4),size=fs.fstatSync(fd).size;if(!n||n>500000||8+n*40>size)return null;
 const t=Buffer.alloc(n*40);fs.readSync(fd,t,0,t.length,8);const out=[];for(let i=0;i<n;i++){const raw=t.subarray(i*40,i*40+32),z0=raw.findIndex(c=>c===0||c===0xff),
  nb=Buffer.from(raw.subarray(0,z0<0?32:z0)).map(c=>c^0xff),z=-1;const name=nb.toString('latin1',0,z<0?32:z),s=t.readUInt32LE(i*40+32),o=t.readUInt32LE(i*40+36);
  if(o+s>size)return null;
  out.push({name,read:()=>{const d=Buffer.alloc(s),g=fs.openSync(file,'r');try{fs.readSync(g,d,0,s,o);}finally{fs.closeSync(g);}return d;}});}return out;}catch{
   return null;}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}};
aquaplus._internal.sceneVoices=sceneVoices;aquaplus._internal.calls=calls;
module.exports=aquaplus;
