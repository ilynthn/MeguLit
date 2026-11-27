// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Engine diff: NeXAS (GIGA / Team BALDRHEAD; *.pac archives, services/original-engines/nexas.cjs). Only keys of
   core/profiles/defaults.cjs that every NeXAS game needs and no other engine does; one game's fix goes to its game file. */
module.exports={
 engine:'nexas',
 /* 2026-11-27 (アイキス3 sexy: 「１・ちょっと教えて欲しい」 / 「２・当然みんなの事はちゃんと知ってる」 drawn by GetGlyphOutline in the dialogue font
    right after the line that names them were blanked by the glyph hide): NeXAS draws its options after the line in the same font */
 /* the NeXAS display codes in the hook text (services/original-engines/nexas.cjs clean(): @r<base>@<ruby>@ keeps the base, @v voice,
    @h face, @t wait, @n break, @k @d @g @b) */
 /* the options are yellow with a dark outline: Windows OCR reads half their characters */
 settings:{choice:{ocrLoose:true},hide:{glyphAfterLine:true},source:{stripCodes:['@[rR]([^@]*)@[^@]*@','@・@','@[vh][\\w-]+','@t\\d+','@[nkdgb]']}},
};
