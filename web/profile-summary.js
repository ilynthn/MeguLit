// SPDX-License-Identifier: GPL-3.0-or-later
const layerNames = {
 'seed-skeleton':'内置 Seed 基础适配',
 'seed-game':'内置 Seed 游戏适配',
 seed:'内置 Seed 版本适配',
 'official-game':'官方游戏适配',
 official:'官方版本适配',
};

const settingNames = {
 'source.artemisQuoteSpans':'Artemis 跨片段引号台词合并',
 'source.siglusDbsNameColumn':'Siglus DBS 人名列编号',
 'placement.firstLineAnchor':'首行定位基准',
 'placement.dialogueArea':'游戏对话区参考位置',
 'placement.lineOffsetY':'原文行垂直偏移（像素）',
 'placement.drawWhileBlanking':'隐藏过程中由阅读器绘制原文',
 'placement.translationGrowsDown':'译文只向下展开',
 'placement.orphanDraw':'重绘未配对的隐藏行',
 'page.effectFrames':'将重复绘制识别为文字特效帧',
 'page.presentation':'正文排版',
 'page.flowPage':'流式页面排版',
 'page.holdMs':'台词等待页面定位时限（毫秒）',
 'page.pairByDrawn':'按画面文字配对台词',
 'page.reportClear':'接收引擎清页通知',
 'page.engineRows':'按引擎行坐标逐行排版',
 'page.keepHeld':'保留超时未配对的台词',
 'choice.contentInterleave':'仅按正文字符识别交错特效帧',
 'choice.dropEffectFrames':'从选项候选中排除特效帧和残句',
 'choice.filters':'选项过滤规则',
 'choice.pageFrames':'选项页面边框图匹配规则',
 'hide.textEffectsRead':'文字特效默认使用阅读模式',
 'hide.preflight':'隐藏前先显示并检查原文',
 'hide.drawsHidden':'游戏自行隐藏当前行',
 'hide.engineTrial.enabled':'试用引擎原文隐藏',
 'hide.engineTrial.unconfirmedLines':'结束隐藏试验的连续未确认行数',
 'hide.engineTrial.clickMs':'同一次点击的文本时间窗（毫秒）',
 'hide.engineTrial.skipAside':'隐藏试验跳过场景标签和姓名牌',
 'selfCheck.window':'自检取样行数',
 'selfCheck.minLines':'自检最少行数',
 'selfCheck.hideVisible':'自检原文漏出比例阈值',
 'selfCheck.dropRate':'自检漏行比例阈值',
 'selfCheck.repeatRate':'自检重复行比例阈值',
 'selfCheck.choiceMismatch':'自检选项不匹配次数阈值',
 'selfCheck.positionPx':'自检位置偏差阈值（像素）',
 'selfCheck.pairRate':'自检配对比例阈值',
 'calibrate.positionSource':'校准定位来源',
 'calibrate.textBox':'校准文本框（像素）',
 'calibrate.hideMethod':'校准隐藏方式',
 'draw.roles':'上报引擎绘制文字的角色',
 'draw.advhdInput':'采集 AdvHD 原始文字',
 'draw.cmvsInput':'采集 CMVS 原始文字',
 'draw.fvpInput':'采集 FVP 原始文字',
 'draw.minoriInput':'采集 minori 原始文字',
 'draw.spikechunsoftInput':'采集 Spike Chunsoft 原始文字',
 'draw.kemcoSprites':'采集 KEMCO 文字精灵',
 'draw.embed':'游戏内嵌原文与注音',
 'draw.embedTranslation':'游戏内嵌译文',
 'draw.engineTable':'引擎绘制参数',
 'draw.viaRoles':'按调用链识别文字角色',
 lang:'原文语言设置',
 'library.partLabels':'游戏分部名称',
 'safeMode.redrawRate':'特效期间每秒重绘次数',
 'safeMode.effectJudge':'启用安全模式的文字特效判定',
 'cardinal.rev':'Cardinal 评分规则版本',
 'cardinal.lines':'Cardinal 回放行数',
 'cardinal.maxGapMs':'Cardinal 最大回放间隔（毫秒）',
 'cardinal.sampleMs':'Cardinal 采样间隔（毫秒）',
 'cardinal.minIntervalMin':'Cardinal 最短运行间隔（分钟）',
 'cardinal.maxLagMs':'Cardinal 最大采样延迟（毫秒）',
 'cardinal.weights.row':'Cardinal 显示权重',
 'cardinal.weights.stable':'Cardinal 位置稳定权重',
 'cardinal.weights.clean':'Cardinal 文字整洁权重',
 'cardinal.weights.clear':'Cardinal 清页权重',
 'cardinal.weights.choice':'Cardinal 选项权重',
 'cardinal.weights.pair':'Cardinal 配对权重',
 'cardinal.weights.leak':'Cardinal 原文漏出权重',
 'cardinal.thresholds.settleMs':'Cardinal 行稳定等待（毫秒）',
 'cardinal.thresholds.shownRate':'Cardinal 行显示比例阈值',
 'cardinal.thresholds.stablePx':'Cardinal 原文行位移容许值（像素）',
 'cardinal.thresholds.cnOverlapPx':'Cardinal 译文与原文重叠容许值（像素）',
 'cardinal.thresholds.lineMs':'Cardinal 行最短显示时间（毫秒）',
 'cardinal.thresholds.burstMs':'Cardinal 连续跳行判定间隔（毫秒）',
 'cardinal.thresholds.calibGapMs':'Cardinal 校准时原文最长消失时间（毫秒）',
 'cardinal.thresholds.calibWatchMs':'Cardinal 校准观察时长（毫秒）',
 'cardinal.thresholds.choiceMs':'Cardinal 选项显示时限（毫秒）',
 'cardinal.thresholds.staleChars':'Cardinal 残留原文最少字数',
 'cardinal.thresholds.preflightMs':'Cardinal 隐藏前检查容许时长（毫秒）',
};

const enums = {
 'placement.firstLineAnchor':{glyph:'字形位置',box:'文本框',page:'页面'},
 'page.presentation':{adv:'对话框式（ADV）',nvl:'整页式（NVL）',mixed:'混合排版'},
 'calibrate.positionSource':{engine:'引擎坐标',glyph:'字形位置',ocr:'屏幕文字识别（OCR）'},
 'calibrate.hideMethod':{hide:'隐藏原文并重绘',engine:'引擎隐藏',glyph:'字形隐藏',gpu:'GPU 隐藏',read:'保留原文的阅读模式'},
 annotation:{ruby:'假名注音',ipa:'国际音标',pinyin:'拼音',none:'无注音'},
 pairing:{script:'原始脚本配对',patch:'补丁文本配对',machine:'机器翻译',none:'无配对'},
};
const languageFields = {annotation:'注音方式',pairing:'译文配对方式',dictionary:'词典',fontFallback:'备用字体'};
const languageNames = new Intl.DisplayNames(['zh-Hans'], {type:'language'});
const textBoxFields = {
 x:'校准文本框横坐标（像素）',y:'校准文本框纵坐标（像素）',
 w:'校准文本框宽度（像素）',h:'校准文本框高度（像素）',
 client:'游戏窗口客户区尺寸（像素）',
};

function chineseLanguageName(tag) {
 try { return languageNames.of(tag); }
 catch { return tag; }
}

export function chineseProfileSetting(key, value) {
 const lang = /^lang\.([a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3})\.(annotation|pairing|dictionary|fontFallback)$/.exec(key);
 let name = Object.hasOwn(settingNames, key) ? settingNames[key] : key;
 if (lang) name = chineseLanguageName(lang[1]) + languageFields[lang[2]];
 else if (key.startsWith('calibrate.textBox.')) {
  const field = key.slice('calibrate.textBox.'.length);
  if (Object.hasOwn(textBoxFields, field)) name = textBoxFields[field];
 } else if (key.startsWith('library.partLabels.')) {
  const folder = key.slice('library.partLabels.'.length);
  name = folder === '.' ? '游戏根目录分部名称' : '游戏分部名称（'+folder+'）';
 } else if (key.startsWith('draw.engineTable.')) {
  const field = key.slice('draw.engineTable.'.length);
  name = field === 'engine' ? '绘制参数所属引擎' : '引擎绘制参数（'+field+'）';
 }

 if (value === undefined) return name;
 if (value === null) return name+'：默认';
 if (typeof value === 'boolean') return name+'：'+(value?'开启':'关闭');
 if (key === 'calibrate.textBox.client' && Array.isArray(value)) return name+'：'+value.join(' × ');
 if (Array.isArray(value)) {
  const items = value.map(item=>'「'+item+'」').join('、');
  return name+'：'+value.length+' 项'+(items?'（'+items+'）':'');
 }
 const enumKey = lang ? lang[2] : key;
 const choices = Object.hasOwn(enums, enumKey) ? enums[enumKey] : null;
 return name+'：'+(choices && Object.hasOwn(choices, value) ? choices[value] : value);
}

export function chineseProfileLayer(layer, revision) {
 const name = Object.hasOwn(layerNames, layer) ? layerNames[layer] : layer;
 return name+' · 修订版 '+String(revision ?? '？');
}
