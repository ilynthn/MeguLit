'use strict';
/* JMdict words split by SudachiDict (core/learning-native.cjs dictionaryWords, user 2026-11-27: 何時の間にか was annotated
   なんじのあいだにか, 「你把这种用法一次性全部做好不行吗」). The worker is stubbed with SudachiDict Full 20261015 output for each line,
   the dictionary with the JMdict 2026-10 entries these lines reach (real data, trimmed to the fields the path reads).

   Whole-corpus check (E:\MeguLit\data\original-text, 54 games, 7,495,761 lines; 1,949,797 distinct lines with kanji, of which
   1,162,894 hold kana; lines with no kana at all are the Chinese patches and name labels, no furigana is drawn on them): the
   tokens of every line before (#1266) and after this change, compared by reading.
   Final run: 26,262 distinct lines change (59,815 occurrences in the games; 61,512 token occurrences, 1,079 kinds):
     846 kinds of JMdict word joins (19,919): いつも通り いつもどおり, 踵を返し きびすを, 一日中 じゅう, 一昨日 おととい, お腹が空い すい…
     何 なん→なに before を / が / より / やら / かしら (20,845), 言う ゆう→いう (7,754),
     231 kinds (12,994) a join of the old path is left as SudachiDict read it: 様に ように→さまに 2,808 (聖女様に), 後に のちに→あと
     2,449 / ご 557, 誰が たが→だれが 2,228, 正面に まともに→しょうめんに 433, 時の / 時に とき→じ (外出時の), 側から そば→がわ.
   The 200 most frequent changes (58,251 occurrences, every one read with its lines): 181 right, 19 wrong or doubtful, 527
   occurrences (0.9%): 素で すで→もとで 69, お汁 おしる→おつゆ 51, ん家 んち→んいえ 47, 女性物の もの→ぶつ 47, 傍に置い そば→わき
   57, 以前叢雨丸 むらさめ→そうう 26, 恐れ多くも 25, 挿送 21, か細い 20, 尻の穴 けつのあな 20, 小さ 20, 二文字 にもじ 19, 彼の方
   あのかた 19, 中出し ちゅう 19, その外 そのほか 19, 予備学科 がくか 18, 〜家を継ぐ / 〜家を出 か 30 (いえ before was wrong too).
   Tightened on the way, each from wrong changes in an earlier run (8 runs): one word with particles only for a common entry (今日は
   きょうは, 正面に, 後に, 誰が, 様に were joined into rare JMdict words); not from a suffix after a noun (聖女様に, 発見時の, 病院側
   から); rK / iK spellings not across a particle (外に ほかに 3,249, 彼の あの 2,504, 何の どの 3,774, 私か ひそか); an
   interjection only as the whole line (今日は……いいや); no っ from a verb's 促音便 (は行っ はぎょうっ, 前言っ); no archaic
   entry (出ず いず, 一文字 ひともじ); an inflected verb not taken for a noun / adverb / conjunction (説明し, 降って くだって 491,
   極まって); いい adjectives (格好良かっ かっこいかっ); the kana of the spelling kept (目をつむる めをつぶる, ちょっかい出し
   ちょっかいをだし); 言う / 何 phonology instead of joining って言う, 何を. */
const test=require('node:test'),assert=require('node:assert/strict'),os=require('node:os'),path=require('node:path');
const {LocalLearning}=require('../core/learning-native.cjs');
const {createReadingResolver}=require('../core/reading.cjs');
const {annotations}=require('../core/furigana.js');

const SUDACHI={
 "何時の間にか眠っていた":[["何時","イツ","代名詞,*,*,*,*,*"],["の","ノ","助詞,格助詞,*,*,*,*"],["間","アイダ","名詞,普通名詞,副詞可能,*,*,*"],["に","ニ","助詞,格助詞,*,*,*,*"],["か","カ","助詞,副助詞,*,*,*,*"],["眠っ","ネムッ","動詞,一般,*,*,五段-ラ行,連用形-促音便","眠る"],["て","テ","助詞,接続助詞,*,*,*,*"],["い","イ","動詞,非自立可能,*,*,上一段-ア行,連用形-一般","いる"],["た","タ","助動詞,*,*,*,助動詞-タ,終止形-一般"]],
 "いつの間にか寝ていた":[["いつ","イツ","代名詞,*,*,*,*,*"],["の","ノ","助詞,格助詞,*,*,*,*"],["間","アイダ","名詞,普通名詞,副詞可能,*,*,*"],["に","ニ","助詞,格助詞,*,*,*,*"],["か","カ","助詞,副助詞,*,*,*,*"],["寝","ネ","動詞,一般,*,*,下一段-ナ行,連用形-一般","寝る"],["て","テ","助詞,接続助詞,*,*,*,*"],["い","イ","動詞,非自立可能,*,*,上一段-ア行,連用形-一般","いる"],["た","タ","助動詞,*,*,*,助動詞-タ,終止形-一般"]],
 "いつの間にっ！":[["いつ","イツ","代名詞,*,*,*,*,*"],["の","ノ","助詞,格助詞,*,*,*,*"],["間","アイダ","名詞,普通名詞,副詞可能,*,*,*"],["にっ","ニッ","副詞,*,*,*,*,*"],["！","!","補助記号,句点,*,*,*,*","!"]],
 "何時の間に来たの":[["何時","イツ","代名詞,*,*,*,*,*"],["の","ノ","助詞,格助詞,*,*,*,*"],["間","アイダ","名詞,普通名詞,副詞可能,*,*,*"],["に","ニ","助詞,格助詞,*,*,*,*"],["来","キ","動詞,非自立可能,*,*,カ行変格,連用形-一般","来る"],["た","タ","助動詞,*,*,*,助動詞-タ,連体形-一般"],["の","ノ","助詞,終助詞,*,*,*,*"]],
 "何時も一緒だ":[["何時も","イツモ","名詞,普通名詞,一般,*,*,*"],["一緒","イッショ","名詞,普通名詞,サ変可能,*,*,*"],["だ","ダ","助動詞,*,*,*,助動詞-ダ,終止形-一般"]],
 "一寸のことで怒るな":[["一","イチ","名詞,数詞,*,*,*,*"],["寸","スン","名詞,普通名詞,助数詞可能,*,*,*"],["の","ノ","助詞,格助詞,*,*,*,*"],["こと","コト","名詞,普通名詞,一般,*,*,*"],["で","デ","助詞,格助詞,*,*,*,*"],["怒る","オコル","動詞,一般,*,*,五段-ラ行,終止形-一般"],["な","ナ","助詞,終助詞,*,*,*,*"]],
 "一寸たりとも動くな":[["一寸","チョット","副詞,*,*,*,*,*"],["たり","タリ","助詞,副助詞,*,*,*,*"],["と","ト","助詞,格助詞,*,*,*,*"],["も","モ","助詞,係助詞,*,*,*,*"],["動く","ウゴク","動詞,一般,*,*,五段-カ行,終止形-一般"],["な","ナ","助詞,終助詞,*,*,*,*"]],
 "一寸の虫にも五分の魂":[["一","イチ","名詞,数詞,*,*,*,*"],["寸","スン","名詞,普通名詞,助数詞可能,*,*,*"],["の","ノ","助詞,格助詞,*,*,*,*"],["虫","ムシ","名詞,普通名詞,一般,*,*,*"],["に","ニ","助詞,格助詞,*,*,*,*"],["も","モ","助詞,係助詞,*,*,*,*"],["五","ゴ","名詞,数詞,*,*,*,*"],["分","ブン","接尾辞,名詞的,サ変可能,*,*,*"],["の","ノ","助詞,格助詞,*,*,*,*"],["魂","タマシイ","名詞,普通名詞,一般,*,*,*"]],
 "後一歩だった":[["後一","ゴイチ","名詞,固有名詞,人名,姓,*,*"],["歩","アユミ","名詞,固有名詞,人名,名,*,*"],["だっ","ダッ","助動詞,*,*,*,助動詞-ダ,連用形-促音便","だ"],["た","タ","助動詞,*,*,*,助動詞-タ,終止形-一般"]],
 "踵を返して店を出る":[["踵","カカト","名詞,普通名詞,一般,*,*,*"],["を","ヲ","助詞,格助詞,*,*,*,*"],["返し","カエシ","動詞,一般,*,*,五段-サ行,連用形-一般","返す"],["て","テ","助詞,接続助詞,*,*,*,*"],["店","ミセ","名詞,普通名詞,一般,*,*,*"],["を","ヲ","助詞,格助詞,*,*,*,*"],["出る","デル","動詞,一般,*,*,下一段-ダ行,終止形-一般"]],
 "いつも通りだ":[["いつも","イツモ","名詞,普通名詞,副詞可能,*,*,*"],["通り","トオリ","名詞,普通名詞,助数詞可能,*,*,*"],["だ","ダ","助動詞,*,*,*,助動詞-ダ,終止形-一般"]],
 "体中が火照り":[["体","タイ","名詞,普通名詞,助数詞可能,*,*,*"],["中","チュウ","接尾辞,名詞的,副詞可能,*,*,*"],["が","ガ","助詞,格助詞,*,*,*,*"],["火照り","ホテリ","動詞,一般,*,*,五段-ラ行,連用形-一般","火照る"]],
 "一日中歩き回った":[["一","イチ","名詞,数詞,*,*,*,*"],["日","ニチ","名詞,普通名詞,助数詞可能,*,*,*"],["中","チュウ","接尾辞,名詞的,副詞可能,*,*,*"],["歩き回っ","アルキマワッ","動詞,一般,*,*,五段-ラ行,連用形-促音便","歩き回る"],["た","タ","助動詞,*,*,*,助動詞-タ,終止形-一般"]],
 "帰った方がいい":[["帰っ","カエッ","動詞,一般,*,*,五段-ラ行,連用形-促音便","帰る"],["た","タ","助動詞,*,*,*,助動詞-タ,連体形-一般"],["方","ホウ","名詞,普通名詞,一般,*,*,*"],["が","ガ","助詞,格助詞,*,*,*,*"],["いい","イイ","形容詞,非自立可能,*,*,形容詞,終止形-一般"]],
 "お腹が空いていた":[["お腹","オナカ","名詞,普通名詞,一般,*,*,*"],["が","ガ","助詞,格助詞,*,*,*,*"],["空い","アイ","動詞,一般,*,*,五段-カ行,連用形-イ音便","空く"],["て","テ","助詞,接続助詞,*,*,*,*"],["い","イ","動詞,非自立可能,*,*,上一段-ア行,連用形-一般","いる"],["た","タ","助動詞,*,*,*,助動詞-タ,終止形-一般"]],
 "一昨日の昼か":[["一昨","イッサク","名詞,普通名詞,一般,*,*,*"],["日","ヒ","名詞,普通名詞,副詞可能,*,*,*"],["の","ノ","助詞,格助詞,*,*,*,*"],["昼","ヒル","名詞,普通名詞,副詞可能,*,*,*"],["か","カ","助詞,終助詞,*,*,*,*"]],
 "今日は晴れ":[["今日","キョウ","名詞,普通名詞,副詞可能,*,*,*"],["は","ハ","助詞,係助詞,*,*,*,*"],["晴れ","ハレ","名詞,普通名詞,一般,*,*,*"]],
 "今日は。":[["今日","キョウ","名詞,普通名詞,副詞可能,*,*,*"],["は","ハ","助詞,係助詞,*,*,*,*"],["。","。","補助記号,句点,*,*,*,*"]],
 "聖女様に誓おう":[["聖女","セイジョ","名詞,普通名詞,一般,*,*,*"],["様","サマ","接尾辞,名詞的,一般,*,*,*"],["に","ニ","助詞,格助詞,*,*,*,*"],["誓おう","チカオウ","動詞,一般,*,*,五段-ワア行,意志推量形","誓う"]],
 "説明してくれた":[["説明","セツメイ","名詞,普通名詞,サ変可能,*,*,*"],["し","シ","動詞,非自立可能,*,*,サ行変格,連用形-一般","する"],["て","テ","助詞,接続助詞,*,*,*,*"],["くれ","クレ","動詞,非自立可能,*,*,下一段-ラ行,連用形-一般","くれる"],["た","タ","助動詞,*,*,*,助動詞-タ,終止形-一般"]],
 "機密が外に漏れない":[["機密","キミツ","名詞,普通名詞,一般,*,*,*"],["が","ガ","助詞,格助詞,*,*,*,*"],["外","ソト","名詞,普通名詞,一般,*,*,*"],["に","ニ","助詞,格助詞,*,*,*,*"],["漏れ","モレ","動詞,一般,*,*,下一段-ラ行,未然形-一般","漏れる"],["ない","ナイ","助動詞,*,*,*,助動詞-ナイ,終止形-一般"]],
 "何の役にも立たない":[["何","ナン","代名詞,*,*,*,*,*"],["の","ノ","助詞,格助詞,*,*,*,*"],["役","ヤク","名詞,普通名詞,一般,*,*,*"],["に","ニ","助詞,格助詞,*,*,*,*"],["も","モ","助詞,係助詞,*,*,*,*"],["立た","タタ","動詞,一般,*,*,五段-タ行,未然形-一般","立つ"],["ない","ナイ","助動詞,*,*,*,助動詞-ナイ,終止形-一般"]],
 "格好良かった":[["格好","カッコウ","名詞,普通名詞,一般,*,*,*"],["良かっ","ヨカッ","形容詞,非自立可能,*,*,形容詞,連用形-促音便","良い"],["た","タ","助動詞,*,*,*,助動詞-タ,終止形-一般"]],
 "これが私か":[["これ","コレ","代名詞,*,*,*,*,*"],["が","ガ","助詞,格助詞,*,*,*,*"],["私","ワタクシ","代名詞,*,*,*,*,*"],["か","カ","助詞,副助詞,*,*,*,*"]],
 "何を言うの":[["何","ナン","代名詞,*,*,*,*,*"],["を","ヲ","助詞,格助詞,*,*,*,*"],["言う","イウ","動詞,一般,*,*,五段-ワア行,連体形-一般"],["の","ノ","助詞,準体助詞,*,*,*,*"]],
 "何だよ":[["何","ナン","代名詞,*,*,*,*,*"],["だ","ダ","助動詞,*,*,*,助動詞-ダ,終止形-一般"],["よ","ヨ","助詞,終助詞,*,*,*,*"]],
 "何かしらの悪意":[["何","ナン","代名詞,*,*,*,*,*"],["かしら","カシラ","助詞,副助詞,*,*,*,*"],["の","ノ","助詞,格助詞,*,*,*,*"],["悪意","アクイ","名詞,普通名詞,一般,*,*,*"]],
 "大切って言うじゃないか":[["大切","タイセツ","形状詞,一般,*,*,*,*"],["って","ッテ","助詞,副助詞,*,*,*,*"],["言う","ユウ","動詞,一般,*,*,五段-ワア行,終止形-一般"],["じゃ","ジャ","助動詞,*,*,*,助動詞-ダ,連用形-融合","だ"],["ない","ナイ","形容詞,非自立可能,*,*,形容詞,終止形-一般"],["か","カ","助詞,終助詞,*,*,*,*"]],
 "役立たずなんだから":[["役立た","ヤクダタ","動詞,一般,*,*,五段-タ行,未然形-一般","役立つ"],["ず","ズ","助動詞,*,*,*,助動詞-ヌ,連用形-一般"],["なん","ナン","代名詞,*,*,*,*,*"],["だ","ダ","助動詞,*,*,*,助動詞-ダ,終止形-一般"],["から","カラ","助詞,接続助詞,*,*,*,*"]],
 "何気なく見た":[["何","ナン","代名詞,*,*,*,*,*"],["気","ゲ","接尾辞,形状詞的,*,*,*,*"],["なく","ナク","形容詞,非自立可能,*,*,形容詞,連用形-一般","ない"],["見","ミ","動詞,非自立可能,*,*,上一段-マ行,連用形-一般","見る"],["た","タ","助動詞,*,*,*,助動詞-タ,終止形-一般"]],

};
const ENTRIES=[
 {"id":1163930,"spellings":["一寸"],"readings":["いっすん"],"pos":["adverb (fukushi)","noun (common) (futsuumeishi)"],"priority":["news2","nf29"]},
 {"id":1163940,"spellings":["一寸","鳥渡"],"readings":["ちょっと","ちょと","チョット","ちょいと","チョッと"],"pos":["adverb (fukushi)","expressions (phrases, clauses, etc.)","interjection (kandoushi)","suffix"],"priority":["ichi1"],"ke_inf":[["rK"],["ateji","rK"]],"re_nokanji":[false,false,true,true,true],"misc":["col","uk"]},
 {"id":1165500,"spellings":["一日中","１日中","一日じゅう","１日じゅう","一日ぢゅう"],"readings":["いちにちじゅう","いちにちぢゅう"],"pos":["adverb (fukushi)","noun (common) (futsuumeishi)"],"priority":["ichi1"],"ke_inf":[[],[],["sK"],["sK"],["sK"]],"re_inf":[[],["sk"]]},
 {"id":1188680,"spellings":["何気なく","何げなく","何気無く"],"readings":["なにげなく"],"pos":["adverb (fukushi)","expressions (phrases, clauses, etc.)"],"priority":["ichi1","spec1"]},
 {"id":1188850,"spellings":["いつの間にか","何時の間にか"],"readings":["いつのまにか"],"pos":["adverb (fukushi)"],"priority":["ichi1","spec1"]},
 {"id":1203280,"spellings":["他に","外に"],"readings":["ほかに"],"pos":["adverb (fukushi)","expressions (phrases, clauses, etc.)"],"priority":["ichi1"],"ke_inf":[[],["rK"]]},
 {"id":1289400,"spellings":["今日は","今日わ"],"readings":["こんにちは","こんにちわ","こにちわ","こにちは"],"pos":["interjection (kandoushi)"],"priority":["ichi1"],"ke_inf":[[],["sK"]],"re_inf":[[],["ik"],["sk"],["sk"]],"misc":["uk"]},
 {"id":1409600,"spellings":["体中","体じゅう"],"readings":["からだじゅう"],"pos":["noun (common) (futsuumeishi)","nouns which may take the genitive case particle 'no'"]},
 {"id":1576050,"spellings":["一昨日"],"readings":["おととい","おとつい","いっさくじつ"],"pos":["adverb (fukushi)","noun (common) (futsuumeishi)"],"priority":["ichi1","news2","nf40"],"re_inf":[["gikun"],["gikun"],[]]},
 {"id":1577490,"spellings":["格好いい","格好良い","カッコ良い","かっこ良い","格好よい"],"readings":["かっこいい","かっこよい","かっこういい","カッコイイ","カッコいい","かっこええ","カッコよい"],"pos":["adjective (keiyoushi) - yoi/ii class"],"priority":["spec1"],"ke_inf":[[],[],["sK"],["sK"],["sK"]],"re_inf":[[],[],[],[],[],["sk"],["sk"]],"re_restr":[[],["格好良い"],[],[],[],[],[]],"re_nokanji":[false,false,false,true,true,false,false],"misc":["uk"]},
 {"id":1612520,"spellings":["密か","秘か","窃か","私か","竊か","潜か","陰か"],"readings":["ひそか"],"pos":["adjectival nouns or quasi-adjectives (keiyodoshi)"],"priority":["ichi1"],"ke_inf":[[],[],["rK"],["rK"],["sK"],["sK"],["sK"]]},
 {"id":1847410,"spellings":["役立たず"],"readings":["やくたたず"],"pos":["nouns which may take the genitive case particle 'no'"],"priority":["news2","nf41"]},
 {"id":1920240,"spellings":["何の"],"readings":["どの"],"pos":["pre-noun adjectival (rentaishi)"],"priority":["news1","nf05"],"ke_inf":[["rK"]],"misc":["uk"]},
 {"id":1920245,"spellings":["何の"],"readings":["なんの"],"pos":["interjection (kandoushi)","pre-noun adjectival (rentaishi)"],"misc":["uk"]},
 {"id":2006110,"spellings":["何かしら","何か知ら"],"readings":["なにかしら"],"pos":["adverb (fukushi)"]},
 {"id":2021520,"spellings":["お腹が空く","お腹がすく","お腹すく","お腹空く","おなかが空く","おなか空く"],"readings":["おなかがすく","おなかすく"],"pos":["Godan verb with 'ku' ending","expressions (phrases, clauses, etc.)"],"ke_inf":[[],[],["sK"],["sK"],["sK"],["sK"]],"re_inf":[[],["sk"]]},
 {"id":2069030,"spellings":["いつも通り","何時も通り"],"readings":["いつもどおり","いつもとおり","いつもどうり"],"pos":["adverb (fukushi)","nouns which may take the genitive case particle 'no'"],"priority":["spec1"],"ke_inf":[[],["sK"]],"re_inf":[[],["sk"],["sk"]]},
 {"id":2069680,"spellings":["あと一歩","後一歩"],"readings":["あといっぽ"],"pos":["adverb (fukushi)","expressions (phrases, clauses, etc.)"]},
 {"id":2103110,"spellings":["踵を返す","きびすを返す","くびすを返す"],"readings":["きびすをかえす","くびすをかえす"],"pos":["Godan verb with 'su' ending","expressions (phrases, clauses, etc.)"],"re_restr":[["踵を返す","きびすを返す"],["踵を返す","くびすを返す"]]},
 {"id":2119750,"spellings":["何だ"],"readings":["なんだ","なーんだ","なあんだ"],"pos":["interjection (kandoushi)"],"re_nokanji":[false,true,true],"misc":["uk"]},
 {"id":2160680,"spellings":["方がいい","方が良い","ほうが良い","方がよい"],"readings":["ほうがいい","ほうがよい"],"pos":["adjective (keiyoushi) - yoi/ii class","expressions (phrases, clauses, etc.)"],"priority":["spec1"],"re_restr":[["方がいい","方が良い","ほうが良い"],["方が良い","ほうが良い","方がよい"]]},
 {"id":2274760,"spellings":["何の役にも立たない","なんの役にも立たない"],"readings":["なんのやくにもたたない"],"pos":["adjective (keiyoushi)","expressions (phrases, clauses, etc.)"]},
 {"id":2416670,"spellings":["一寸の虫にも五分の魂"],"readings":["いっすんのむしにもごぶのたましい"],"pos":["expressions (phrases, clauses, etc.)"],"misc":["proverb"]},
 {"id":2629650,"spellings":["説き明かし","説明し"],"readings":["ときあかし"],"pos":["noun (common) (futsuumeishi)","noun or participle which takes the aux. verb suru"]},
 {"id":2757880,"spellings":["って言う"],"readings":["っていう"],"pos":["conjunction"],"misc":["col","uk"]},
 {"id":2815060,"spellings":["役にも立たない","役にもたたない"],"readings":["やくにもたたない"],"pos":["adjective (keiyoushi)","expressions (phrases, clauses, etc.)"]},
 {"id":2842833,"spellings":["いつの間に","何時の間に"],"readings":["いつのまに"],"pos":["adverb (fukushi)","expressions (phrases, clauses, etc.)"]},
 {"id":2851233,"spellings":["何を"],"readings":["なにを"],"pos":["adverb (fukushi)","interjection (kandoushi)"]},
 {"id":2871870,"spellings":["来た"],"readings":["きた","キター"],"pos":["interjection (kandoushi)"],"re_inf":[[],["sk"]],"misc":["col"]},
];
function tokens(text){let at=0;return (SUDACHI[text]||[]).map(([surface,reading,pos,base=surface])=>{const grammar=pos.split(','),t={surface,reading,grammar,pos:grammar[0],base_form:base,normalized:base,start:at,end:at+[...surface].length,pitch:[1]};at=t.end;return t;});}
function stubbed(furigana=null){
 const L=new LocalLearning(path.join(os.tmpdir(),'megulit-dictionary-phrases'));L.ready=async()=>{};L.raw=async text=>tokens(text);
 L.readings=createReadingResolver(path.join(os.tmpdir(),'megulit-no-jmdict.json'));L.furigana=furigana?new Map(Object.entries(furigana)):null;
 L.load=function(){if(this.index)return;this.index=new Map();this.byId=new Map();this.english=new Map();for(const e of ENTRIES){const full={kana_only:false,ke_inf:e.spellings.map(()=>[]),re_inf:e.readings.map(()=>[]),re_restr:e.readings.map(()=>[]),re_nokanji:e.readings.map(()=>false),priority:[],...e};this.byId.set(e.id,full);for(const k of [...e.spellings,...e.readings]){const ids=this.index.get(k)||[];ids.push(e.id);this.index.set(k,ids);}}};
 return L;
}
const kana=s=>[...String(s||'')].map(c=>{const n=c.codePointAt(0);return n>=0x30a1&&n<=0x30f6?String.fromCodePoint(n-0x60):c;}).join('');
const read=async(L,text)=>(await L.tokenize(text)).map(t=>t.surface+':'+kana(t.reading)).join(' ');
const ruby=async(L,text)=>annotations(text,await L.tokenize(text)).map(a=>[...text].slice(a.start,a.end).join('')+'='+a.reading).join(' ');
const FURIGANA={'後一歩|あといっぽ':'0:あと;1:いっ;2:ぽ','何時の間にか|いつのまにか':'0-1:いつ;3:ま','一日中|いちにちじゅう':'0:いち;1:にち;2:じゅう'};

test('何時の間にか, いつの間にか, いつの間にっ are the JMdict word いつのまにか, the ruby on each kanji',async()=>{
 const L=stubbed();
 assert.equal(await read(L,'何時の間にか眠っていた'),'何時の間にか:いつのまにか 眠っ:ねむっ て:て い:い た:た');
 assert.equal(await ruby(L,'何時の間にか眠っていた'),'何時=いつ 間=ま 眠=ねむ');
 assert.equal(await read(L,'いつの間にか寝ていた'),'いつの間にか:いつのまにか 寝:ね て:て い:い た:た','kana + kanji, the longest word (not いつの間に + か)');
 assert.equal(await ruby(L,'いつの間にか寝ていた'),'間=ま 寝=ね');
 assert.equal(await read(L,'いつの間にっ！'),'いつの間にっ:いつのまにっ ！:!','an emphatic っ stays after the word');
 assert.equal(await read(L,'何時の間に来たの'),'何時の間に:いつのまに 来:き た:た の:の');
 const [word]=await L.tokenize('何時の間にか眠っていた');
 assert.deepEqual([word.readingSource,word.pitch,word.subtokens.length],['dictionary',[],5],'settled; the UniDic accent of the pieces does not fit');
});

test('一寸: ちょっと as a word, いっすん as a length (#1266 kept)',async()=>{
 const L=stubbed();
 assert.equal((await read(L,'一寸のことで怒るな')).split(' ')[0],'一寸:ちょっと','SudachiDict: 一 イチ + 寸 スン; JMdict: the common entry is ちょっと');
 assert.equal((await read(L,'一寸たりとも動くな')).split(' ')[0],'一寸:いっすん');
 assert.equal(await read(L,'一寸の虫にも五分の魂'),'一寸の虫にも五分の魂:いっすんのむしにもごぶのたましい','a whole proverb, 9 tokens');
 assert.equal(await read(L,'何時も一緒だ'),'何時も:いつも 一緒:いっしょ だ:だ','SudachiDict reads 何時も itself');
});

test('typical idioms and 熟字訓 from the corpus',async()=>{
 const L=stubbed();
 const first=async text=>(await read(L,text)).split(' ')[0];
 assert.equal(await first('後一歩だった'),'後一歩:あといっぽ');
 assert.equal(await first('踵を返して店を出る'),'踵を返し:きびすをかえし');
 assert.equal(await first('いつも通りだ'),'いつも通り:いつもどおり');
 assert.equal(await first('体中が火照り'),'体中:からだじゅう','中 is a suffix after 体, not at the start');
 assert.equal(await first('一日中歩き回った'),'一日中:いちにちじゅう');
 assert.equal(await first('お腹が空いていた'),'お腹が空い:おなかがすい','an idiom in its dictionary form, the ending kept');
 assert.equal(await first('一昨日の昼か'),'一昨日:おととい');
 assert.equal(await first('役立たずなんだから'),'役立たず:やくたたず','a noun made from a verb');
 assert.equal(await first('何気なく見た'),'何気なく:なにげなく');
 assert.equal(await read(L,'今日は。'),'今日は:こんにちは 。:。','an interjection on its own');
});

test('words with particles stay as SudachiDict read them unless JMdict is sure',async()=>{
 const L=stubbed();
 assert.equal(await read(L,'今日は晴れ'),'今日:きょう は:は 晴れ:はれ','今日は inside a sentence is not こんにちは');
 assert.equal(await read(L,'聖女様に誓おう'),'聖女:せいじょ 様:さま に:に 誓おう:ちかおう','様に (ように) does not start inside 聖女様');
 assert.equal(await read(L,'説明してくれた'),'説明:せつめい し:し て:て くれ:くれ た:た','説明し is the verb, not the noun 説き明かし');
 assert.equal(await read(L,'機密が外に漏れない'),'機密:きみつ が:が 外:そと に:に 漏れ:もれ ない:ない','外に ほかに is a rare spelling (rK)');
 assert.equal(await read(L,'これが私か'),'これ:これ が:が 私:わたし か:か','私か ひそか: rK');
 assert.equal(await read(L,'何の役にも立たない'),'何:なん の:の 役:やく に:に も:も 立た:たた ない:ない','何の どの: rK');
 assert.equal(await read(L,'格好良かった'),'格好:かっこう 良かっ:よかっ た:た','格好良い かっこいい inflects from よい');
});

test('何 before a particle is なに, 言う is いう',async()=>{
 const L=stubbed();
 assert.equal(await read(L,'何を言うの'),'何:なに を:を 言う:いう の:の');
 assert.equal(await read(L,'何かしらの悪意'),'何:なに かしら:かしら の:の 悪意:あくい');
 assert.equal(await read(L,'何だよ'),'何:なん だ:だ よ:よ','なん before d');
 assert.equal((await read(L,'大切って言うじゃないか')).split(' ')[2],'言う:いう','SudachiDict: ユウ');
});

/* JmdictFurigana 2.3.1+2026-11-25 on the corpus: the joined words of 11,106 lines get per-kanji ruby (26,879 tokens, 1,543 words;
   叢雨 むら さめ, もう一回 いっ かい, 文字通り も じ どお, 上目遣い うわ め づか, 火格子 ひ ごう し; the 60 most frequent read, all aligned
   right). On every compound it would have changed 754,489 lines (自分 じ ぶん), a change of look nobody asked for, so it is kept to
   the joined words, where the old ruby was one block over several kanji. */
test('JmdictFurigana puts the ruby on each kanji of a compound',async()=>{
 const L=stubbed(FURIGANA);
 assert.equal(await ruby(L,'後一歩だった'),'後=あと 一=いっ 歩=ぽ');
 assert.equal(await ruby(L,'何時の間にか眠っていた'),'何時=いつ 間=ま 眠=ねむ','熟字訓 stays together');
 assert.equal(await ruby(L,'一日中歩き回った'),'一=いち 日=にち 中=じゅう 歩=ある 回=まわ');
 assert.equal(await ruby(stubbed(),'後一歩だった'),'後一歩=あといっぽ','without the file: splitReading as before');
 const [word]=await L.tokenize('後一歩だった');
 assert.equal(annotations('後一歩',[{...word,reading:'あとひとあし'}]).length,1,'a token read otherwise later drops the alignment');
});

