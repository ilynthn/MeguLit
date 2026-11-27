// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Engine diff: CatSystem2 (*.int / cs2). Only keys of core/profiles/defaults.cjs that every CatSystem2 game needs and no other engine
   does; one game's fix goes to its seed. */
module.exports={
 engine:'catsystem2',
 settings:{
  /* ISLAND 2026-11-27: the select command's records (「0 com01_selC_1 俺は俺だ」, one per option) come on the source stream; they are the
     choice (core/select-records.cjs), never dialogue */
  choice:{selectRecords:true},
 },
};
