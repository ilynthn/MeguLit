// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E570 kept as a name: the code page choice now lives in kit.cjs (E573), shared by every reader. */
const {codepage,decoder}=require('./kit.cjs');
module.exports={codepage,decoder};
