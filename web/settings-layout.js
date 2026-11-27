// SPDX-License-Identifier: GPL-3.0-or-later
const words=(zh,en,ja)=>({zh,en,ja});
export const navigation=[
 {label:words('外观与主页','Appearance and home','外観・ホーム'),ids:['general','background']},
 {label:words('翻译与查词','Translation and lookup','翻訳・辞書'),ids:['translation','dictionary','lookup','speech']},
 {label:words('游戏中','In game','ゲーム中'),ids:['text','embedding','immersion','position','panels','hotkeys']},
 {label:words('学习与数据','Study and data','学習・データ'),ids:['study','reader','anki','library','novel-sources','data','online','personal']}
];
// Crop values stay in storage and are edited by the visual crop dialog only.
export function visibleFields(scope,fields){return fields.filter(field=>field.scope===scope&&!(scope==='background'&&(field.key.startsWith('crop.')||field.key.startsWith('glass')))&&!(scope==='online'&&PROFILE_KEYS.includes(field.key)));}
/* E394 these live on the 个人主页 page (web/profile-settings.js), not in the 联网服务 form */
export const PROFILE_KEYS=['leaderboardEnabled','leaderboardName','leaderboardShareGames'];
// Each schema field belongs to exactly one page; all controls remain in the form.
export function fieldPages(scope,fields){
 let pages;
 if(scope==='text')pages=[
  ['display',words('显示与排版','Display and layout','表示・レイアウト'),f=>!(/ruby|Outline|Gradient|^typewriter|^textColor$|^readTextColor$|^shadow$/.test(f.key)||f.key==='furigana'||['lineHeight','translationLineHeight','japaneseSpacingPx','chineseSpacingPx','gap','translationWidth','paddingX','paddingY'].includes(f.key))],
  ['spacing',words('间距与换行','Spacing and wrapping','間隔・折返し'),f=>['lineHeight','translationLineHeight','japaneseSpacingPx','chineseSpacingPx','gap','translationWidth','paddingX','paddingY'].includes(f.key)],
  ['ruby',words('假名注音','Furigana','ふりがな'),f=>f.key==='furigana'||/^ruby/.test(f.key)],
  ['typewriter',words('逐字动画','Typewriter','文字送り'),f=>/^typewriter/.test(f.key)],
  ['effects',words('颜色与描边','Colors and outlines','色・縁取り'),f=>!f.key.includes('Gradient')],
  ['gradient',words('文字渐变','Text gradients','文字のグラデーション'),()=>true]
 ];
 else if(scope==='panels')pages=['menu','log','card'].map((name,i)=>[name,[words('Alt+T 菜单','Alt+T menu','Alt+T メニュー'),words('对话记录','Dialogue log','会話ログ'),words('点读窗口','Lookup card','辞書カード')][i],f=>f.key===`surfaces.${name}`||f.key.startsWith(`panels.${name}.`)]);
 else if(scope==='background')pages=[['image',words('图片效果','Image effects','画像効果'),f=>['blur','dim','saturate'].includes(f.key)],['glass',words('毛玻璃','Frosted glass','すりガラス'),f=>f.key.startsWith('glass')],['crop',words('位置与缩放','Position and zoom','位置・拡大率'),()=>true]];
 else if(scope==='position')pages=[['reader',words('文字框','Text area','字幕領域'),f=>!f.key.startsWith('scan')],['ocr',words('OCR 区域','OCR area','OCR 領域'),()=>true]];
 else if(scope==='lookup')pages=[['gesture',words('查词操作','Lookup controls','辞書の操作'),f=>/^lookup_|^show_related/.test(f.key)],['highlight',words('高亮与标记','Highlighting','色分け・下線'),f=>!/unknown|treat_new/.test(f.key)],['unknown',words('未掌握单词','Unknown words','未習得の単語'),()=>true]];
 else return [{id:'all',label:null,fields}];
 const remaining=new Set(fields);
 const result=pages.map(([id,label,matches])=>{const selected=fields.filter(f=>remaining.has(f)&&matches(f));selected.forEach(f=>remaining.delete(f));return{id,label,fields:selected};}).filter(page=>page.fields.length);
 if(remaining.size)result.push({id:'other',label:words('其他选项','Other options','その他'),fields:[...remaining]});
 return result;
}
/* E378 Settings → 账号 (web/account-ui.js), last in 学习与数据 */
navigation.find(category=>category.ids.includes('data'))?.ids.push('account');
