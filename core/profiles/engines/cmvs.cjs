// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

module.exports={
 engine:'cmvs',
 // Dialogue can move between boxes that draw small spacers and frame tiles alongside the text.
 // アオイトリ: one context of the dialogue hook sends only newly drawn glyphs; its sibling sends the whole line.
 settings:{hide:{gpuBodyRecheck:true},source:{firstGlyphSiblings:true}},
};
