/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Views inside one page in the title bar's ‹ › history (2026-11-14, user: 「点开地图体系之后 回到课程列表又要从头开始」).
   A page (语法: list, lesson, map) calls push(state) when the reader moves to another of its own views; app.js records
   it as a history entry of the current route. Stepping back or forward to such an entry hands the state to the page
   that is showing (listen), or keeps it for the page that is about to mount (take). A null state is the page's
   starting view. */
let listener=null,pending;
export const pageNav={
 /* set by app.js: (state, replace) records state as a new entry of the current route, or as the current entry's view */
 record:null,
 push(state){this.record?.(state??null,false);},
 /* the page says which view it opened in, without adding a history step */
 replace(state){this.record?.(state??null,true);},
 listen(fn){listener=fn;return ()=>{if(listener===fn)listener=null;};},
 /* app.js, on ‹ › within the same page: true when the page on screen took it; otherwise it waits for the next mount */
 apply(state){if(listener&&listener(state??null)!==false)return true;pending={state:state??null};return false;},
 /* app.js, on ‹ › to another page: the view that page should open in */
 expect(state){pending={state:state??null};},
 take(){const p=pending;pending=undefined;return p;},
 reset(){pending=undefined;}
};
