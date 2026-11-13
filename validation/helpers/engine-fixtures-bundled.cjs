'use strict';
/* E610 synthetic game folders for the F1 bundled-asset readers (services/original-engines/webbundle.cjs): each engine as
   a Japanese original (L='ja') and a Chinese patch (L='zh') with the same number of lines; written as the engines'
   public formats describe them (Twine 2 HTML, WebGAL scene txt, Monogatari script.js, ink JSON, GB Studio project ...). */
const F=require('./engine-fixtures.cjs');
const T={ja:['朝の光が差し込む。','「おはよう、兄さん」','教室へ行く','選択肢その一'],zh:['晨光照了进来。','“早上好，哥哥”','去教室','选项其一']};
const j=JSON.stringify;
const SPEC={
 twine:{name:'Twine / SugarCube',files:L=>({'story.html':`<html><head><title>x</title></head><body><tw-storydata name="g" startnode="1" format="SugarCube"><tw-passagedata pid="1" name="Start" tags="">${T[L][0]}\n&lt;&lt;set $x to 1&gt;&gt;${T[L][1]}\n[[${T[L][2]}|Next]]</tw-passagedata><tw-passagedata pid="2" name="Next" tags="">&lt;&lt;if $x&gt;&gt;${T[L][3]}&lt;&lt;/if&gt;&gt;</tw-passagedata><tw-passagedata pid="3" name="Style" tags="stylesheet">body{content:"あ"}</tw-passagedata></tw-storydata><script>var a="x";</script></body></html>`})},
 webgal:{name:'WebGAL',files:L=>({'game/config.txt':'Game_name:x;','game/scene/start.txt':`changeBg:bg.jpg -next;\n;comment あ\n惠惠:${T[L][1]} -v1.ogg;\n:${T[L][0]};\nchoose:${T[L][3]}:a.txt|${T[L][2]}:b.txt;\nintro:${T[L][0]}|${T[L][2]};\n`,'game/scene/a.txt':`${T[L][2]};\nend;`})},
 monogatari:{name:'Monogatari',files:L=>({'js/monogatari.js':'//engine','js/options.js':'//','js/storage.js':'//','js/script.js':`monogatari.script({'Start':['show scene black','y ${T[L][1]}','centered ${T[L][0]}',{'Choice':{'Dialog':'y ${T[L][2]}','A':{'Text':'${T[L][3]}','Do':'jump x'}}},'jump End']});`})},
 renjs:{name:'RenJS',files:L=>({'js/renjs.min.js':'//','story/Setup.yaml':'a: 1','story/Story.yaml':`start:\n  - hero happy: ${T[L][1]}\n  - ${T[L][0]}\n  - choice:\n    - ${T[L][3]}\n`})},
 narrat:{name:'Narrat',files:L=>({'data/main.narrat':`main:\n  talk helper idle "${T[L][1]}"\n  "${T[L][0]}"\n  choice:\n    "${T[L][3]}":\n      jump x\n  set x 1\n`})},
 ink:{name:'ink (inkle)',files:L=>({'story.ink.json':j({inkVersion:21,root:[['^'+T[L][0],'\n','^'+T[L][1],'\n'],'done',{'#f':1}],listDefs:{}})})},
 bitsy:{name:'Bitsy',files:L=>({'game.html':`<html><script type="text/bitsyGameData" id="exportedGameData">\nTitle\n\nDLG a\n${T[L][0]}\n${T[L][1]}\n\nDLG b\n"""\n${T[L][2]}\n"""\n\nSPR A\n</script></html>`})},
 gbstudio:{name:'GB Studio',files:L=>({'project.gbsproj':j({scenes:[{name:'s',actors:[{script:[{command:'EVENT_TEXT',args:{text:T[L][0]}},{command:'EVENT_TEXT',args:{text:[T[L][1],T[L][2]]}},{command:'EVENT_WAIT',args:{time:1}}]}]}]})})},
 gdevelop:{name:'GDevelop',files:L=>({'data.js':'gdjs.projectData = '+j({layouts:[{name:'シーン',objects:[{name:'t',string:T[L][0],type:'TextObject::Text'}]}]})+';','code0.js':`gdjs.s.GDt1[0].setString("${T[L][1]}");`,'runtimegame.js':'//','index.html':'<html>'})},
 construct:{name:'Construct',files:L=>({'c2runtime.js':'//','data.js':j({project:[0,'x',[[T[L][0],T[L][1]]]]}),'index.html':'<html>'})},
 decker:{name:'Decker',files:L=>({'g.deck':`{deck}\nversion:1\n{card:home}\n{widget:t}\ntext:"${T[L][0]}\\n${T[L][1]}"\n`})},
 cocos:{name:'Cocos2d',files:L=>({'project.json':'{}','main.js':'cc.game.run();','src/app.js':`var t="${T[L][0]}";`,'res/text.json':j({a:{text:T[L][1]},id:'ID',name:'名前'}),'res/s.plist':`<plist><dict><key>k</key><string>${T[L][2]}</string></dict></plist>`,'frameworks/cocos2d-js-min.js':'//'})},
 solar2d:{name:'Corona / Solar2D',files:L=>({'main.lua':`local t = display.newText("${T[L][0]}", 0, 0)\n-- "あ"\nlocal u = [[${T[L][1]}]]\n`,'config.lua':'application = {}'})},
 html5:{name:'HTML5 / Electron / NW.js',files:L=>({'index.html':'<html><body><div id="g"></div></body></html>','package.json':'{"name":"x","main":"index.html"}','js/script.js':`const lines=["${T[L][0]}","${T[L][1]}"];`,'js/jquery.js':'var s="日本語";','data/scn.json':j({a:[T[L][2]]})})},
};
const love=(L,enc)=>({'conf.lua':'function love.conf(t) end','main.lua':'require("text")','text.lua':enc(`return { "${T[L][0]}", "${T[L][1]}", [[${T[L][2]}]] }`)});
const vnmaker=L=>({'data/System.json':'{}','data/MapInfos.json':'[null]','data/Actors.json':j([null,{name:'恵'}]),'data/Map001.json':j({events:[null,{id:1,pages:[{list:[{code:101,indent:0,parameters:['',0,0,2,'\\N[1]']},{code:401,indent:0,parameters:[T[L][0]]},{code:401,indent:0,parameters:[T[L][1]]},{code:102,indent:0,parameters:[[T[L][2],T[L][3]],0]},{code:0,indent:0,parameters:[]}]}]}]})});
module.exports={T,SPEC,love,vnmaker,zip:F.zip,asar:F.asar,gbk:F.gbk,writeTree:F.writeTree};
