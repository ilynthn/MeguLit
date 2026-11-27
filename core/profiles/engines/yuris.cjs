// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Engine diff: YU-RIS (ysbin / *.ypf). Only keys of core/profiles/defaults.cjs that every YU-RIS game needs and no other engine does;
   one game's fix goes to its seed. */
module.exports={
 engine:'yuris',
 settings:{
  /* #1143 (euphoria HD) and E334 (女装山脈): with Ctrl held the script stream hands over every skipped line as one text; an ADV box shows
     at most about 90 characters, so a merged text with no speaker change keeps its last sentences up to that */
  page:{skipMergedTail:90},
 },
};
