/* Pages drawn with the striped glass layer over the user's own wallpaper. Each page keeps its own glass opacity,
   stripe strength and blur, adjustable in Settings → Appearance and home. A new page in the same style only needs
   a row here and in services/store.cjs PAGE_VEILS. */
export const PAGE_VEILS=[
 {key:'home',route:'home',a:.35,s:0,b:14,label:{zh:'首页',en:'Home',ja:'ホーム'}},
 {key:'detail',route:'game',a:.25,s:0,b:8,label:{zh:'作品详情',en:'Game detail',ja:'作品詳細'}},
 {key:'leaderboard',route:'leaderboard',a:.3,s:0,b:10,label:{zh:'排行榜',en:'Leaderboard',ja:'ランキング'}},
 {key:'history',route:'history',a:.3,s:0,b:10,label:{zh:'历史',en:'History',ja:'履歴'}}
];
const PARTS=[['a',1],['s',1],['b',40]];
/* 2026-11-11 every other page (library, learning, daily, tools, settings, about) stands on the same glass at its default strength */
export const stageFor=route=>PAGE_VEILS.find(p=>p.route===route)?.key||'page';
export function veilOf(prefs,key){const d=PAGE_VEILS.find(p=>p.key===key);if(!d)return null;const v=(prefs?.pageVeils||{})[key]||{};const n=(x,f)=>Number.isFinite(Number(x))&&x!==''&&x!=null?Number(x):f;return {a:n(v.a,d.a),s:n(v.s,d.s),b:n(v.b,d.b)};}
export function applyVeil(prefs,key=document.documentElement.dataset.stage){const v=veilOf(prefs,key),r=document.documentElement.style;if(!v){for(const k of ['--glass-a','--glass-s','--glass-b'])r.removeProperty(k);return;}r.setProperty('--glass-a',v.a);r.setProperty('--glass-s',v.s);r.setProperty('--glass-b',v.b+'px');}
export function veilSettingsHTML(prefs,locale){
 const t={zh:{title:'页面玻璃条纹层',help:'压在每个页面背景上的半透明玻璃层：不透明度、扫描条纹的强度、玻璃后面的模糊',a:'玻璃层不透明度',s:'条纹强度',b:'模糊（像素）'},en:{title:'Page glass layer',help:'The translucent striped glass over each page’s background: its opacity, how strong the scan lines are, and the blur behind it',a:'Glass opacity',s:'Stripe strength',b:'Blur (px)'},ja:{title:'ページのガラス層',help:'各ページの背景に重ねる半透明のガラス層：濃さ、走査線の強さ、奥のぼかし',a:'ガラスの濃さ',s:'走査線の強さ',b:'ぼかし（px）'}}[locale]||{};
 const row=(p,part,max)=>{const v=veilOf(prefs,p.key)[part],name=`veil_${p.key}_${part}`,label=`${p.label[locale]||p.label.zh} · ${t[part]}`;return `<label class="settings-row veil-row"><div><div class="settings-label">${label}</div></div><span class="setting-slider"><input type="range" name="${name}" min="0" max="${max}" step="any" value="${v}"><input type="number" data-basic-slider="${name}" min="0" max="${max}" step="any" value="${v}" aria-label="${label}"></span></label>`;};
 return `<div class="settings-row veil-head"><div><div class="settings-label">${t.title}</div><div class="settings-help">${t.help}</div></div></div>${PAGE_VEILS.map(p=>PARTS.map(([part,max])=>row(p,part,max)).join('')).join('')}`;
}
export function veilsFromForm(form,prefs){const out={};for(const p of PAGE_VEILS){const cur=veilOf(prefs,p.key),v={};for(const [part] of PARTS){const el=form.elements[`veil_${p.key}_${part}`];v[part]=el?Number(el.value):cur[part];}out[p.key]=v;}return out;}
