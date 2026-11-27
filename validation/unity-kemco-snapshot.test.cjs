'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {compileRoslyn}=require('./helpers/roslyn-compile.cjs');
const base=path.join(__dirname,'../native/unitytext'),source=fs.readFileSync(path.join(base,'MeguLitUnityText.cs'),'utf8');
function method(name){const start=source.indexOf(name);assert.ok(start>=0,name);let p=source.indexOf('{',start),n=0,end=p;for(;end<source.length;end++){if(source[end]==='{')n++;else if(source[end]==='}'&&--n===0)break;}return source.slice(start,end+1);}
test('actual bounded KEMCO helper rejects incomplete snapshots and keeps page, role and permission identities separate',()=>{
 const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'megulit-kemco-'));
 try{
  fs.writeFileSync(path.join(dir,'check.cs'),`using System;using System.Collections.Generic;using System.Reflection;
class StringMes { public string Mes(string text,bool flag){return text;} }
class VoidMes { public void Mes(string text,bool flag){} }
class StaticMes { public static string Mes(string text,bool flag){return text;} }
class WrongMes { public string Mes(string text,int flag){return text;} }
class Check {
 static int checks; static void Is(bool ok,string why){checks++;if(!ok)throw new Exception(why);}
 readonly object gate=new object();bool connected=true,kemcoAsked,kemcoRoles;string kemcoScope="";int kemcoEpoch,kemcoObservedEpoch=-1;List<string> sent=new List<string>();void Send(string s){sent.Add(s);}
 ${method('internal static bool KemcoFlag(')}
 ${method('internal static bool KemcoMethod(')}
 ${method('void KemcoControl(')}
 ${method('void KemcoSend(')}
 static KemcoSpriteSnapshot.Glyph G(int id,string s="日",bool shown=true){return new KemcoSpriteSnapshot.Glyph{id=id,text=s,shown=shown,box=new float[]{2,4,10,20}};}
 static List<IList<KemcoSpriteSnapshot.Glyph>> R(params KemcoSpriteSnapshot.Glyph[] gs){return new List<IList<KemcoSpriteSnapshot.Glyph>>{new List<KemcoSpriteSnapshot.Glyph>(gs)};}
 static KemcoSpriteSnapshot.Page Read(IList<IList<KemcoSpriteSnapshot.Glyph>> r){return KemcoSpriteSnapshot.Read(r,4096,4096);}
 void Run(){
  Is(KemcoMethod(typeof(StringMes)),"actual metadata ABI returns string");Is(!KemcoMethod(typeof(VoidMes))&&!KemcoMethod(typeof(StaticMes))&&!KemcoMethod(typeof(WrongMes))&&!KemcoMethod(null),"wrong Mes ABI rejected");
  var rows=R(G(1),G(2,"本"));rows.Add(new List<KemcoSpriteSnapshot.Glyph>{G(3,"語")});var p=Read(rows);Is(p!=null&&p.text=="日本\\n語"&&p.rects.Count==3,"ordered rows");
  Is(Read(R(G(1,"\\ud83d\\ude00"))).rects.Count==1,"one unicode scalar");
  Is(Read(R(G(1),G(2,"本",false)))?.text=="日","typewriter suffix");
  Is(Read(R(G(1,"日",false),G(2)))==null,"typewriter gap");
  Is(Read(R(G(1,"日",false)))==null,"all parked");
  Is(Read(R(G(1),G(1)))==null,"duplicate root");Is(Read(R(G(0)))==null,"zero identity");
  Is(Read(R((KemcoSpriteSnapshot.Glyph)null))==null,"null glyph");Is(Read(null)==null,"null rows");
  foreach(var s in new[]{"","日本","\\n","\\u001f","\\ud800","\\udc00"})Is(Read(R(G(1,s)))==null,"not one scalar");
  foreach(var b in new[]{new float[]{-1,0,2,2},new float[]{0,-1,2,2},new float[]{4095,0,2,2},new float[]{0,4095,2,2},new float[]{0,0,0,2},new float[]{0,0,.04f,2},new float[]{float.NaN,0,2,2},new float[]{0,0,float.PositiveInfinity,2}}){var g=G(1);g.box=b;Is(Read(R(g))==null,"invalid/clipped box");}
  var big=new List<IList<KemcoSpriteSnapshot.Glyph>>();int id=1;for(int i=0;i<8;i++){var row=new List<KemcoSpriteSnapshot.Glyph>();for(int j=0;j<256;j++)row.Add(G(id++));big.Add(row);}Is(Read(big).rects.Count==2048,"exact glyph cap");big.Add(new List<KemcoSpriteSnapshot.Glyph>{G(id++)});Is(Read(big)==null,"glyph cap plus one");
  var wide=R();for(int i=0;i<257;i++)wide[0].Add(G(i+1));Is(Read(wide)==null,"row cap");var tall=R();for(int i=0;i<32;i++)tall.Add(new List<KemcoSpriteSnapshot.Glyph>());Is(Read(tall)==null,"row count cap");
  var state=new KemcoSpriteSnapshot();var output=new List<string>();Action<string> sink=s=>output.Add(s);var body=Read(R(G(1),G(2,"本")));
  state.Publish("body",11,body,null,null,4096,4096,sink);state.Publish("body",11,body,null,null,4096,4096,sink);Is(output.Count==1,"dedup same page");
  state.Publish("body",12,body,null,null,4096,4096,sink);Is(output.Count==3&&output[1].Contains("n=0 rects= text=")&&!output[0].Split(' ')[2].Equals(output[2].Split(' ')[2]),"old clear then new page");
  state.Publish("name",20,null,"人物",new float[]{1,2,20,20},4096,4096,sink);state.Publish("choice0",30,null,"選択",new float[]{3,40,30,20},4096,4096,sink);
  state.Publish("choice0",30,null,"bad\\ntext",new float[]{3,40,30,20},4096,4096,sink);Is(output.Count==6&&output[5].Contains("role=choice")&&output[5].EndsWith("text="),"invalid role retired");
  state.Reset(4096,4096,sink);int count=output.Count;state.Reset(4096,4096,sink);Is(count==8&&output.Count==count,"reset exact published channels once");
  bool rejected=false;try{state.Publish("choice16",1,null,"x",new float[]{1,2,3,4},4096,4096,sink);}catch(ArgumentException){rejected=true;}Is(rejected,"channel count bound");
  Is(!KemcoFlag("DRAW roles=1 embed=1 zh=1"),"roles no optin");Is(KemcoFlag("DRAW roles=0 embed=0 kemcoSprites=1"),"explicit optin");Is(!KemcoFlag("DRAW roles=10 kemcoSprites=1","roles")&&!KemcoFlag("DRAW roles=1 roles=0","roles"),"separate strict roles");
  foreach(var token in new[]{"kemcoSprites=0","kemcoSprites=true","xkemcoSprites=1","kemcoSprites=1x","kemcoSprites=1 kemcoSprites=0","kemcoSprites=1 kemcoSprites=1"})Is(!KemcoFlag("DRAW "+token),"strict flag");
  KemcoControl(true);kemcoObservedEpoch=kemcoEpoch;KemcoSend("old");Is(sent.Count==1,"current permission");KemcoControl(false);KemcoSend("off");KemcoControl(true);KemcoSend("old snapshot");Is(sent.Count==1,"off-on cannot revive old capture");kemcoObservedEpoch=kemcoEpoch;KemcoSend("fresh");Is(sent.Count==2,"fresh capture allowed");connected=false;KemcoSend("disconnected");Is(sent.Count==2,"disconnect rejects");
  foreach(var wire in output)Console.WriteLine(wire);Console.WriteLine("PASS "+checks);
 }
 static void Main(){Console.OutputEncoding=new System.Text.UTF8Encoding(false);new Check().Run();}
}`);
  compileRoslyn(['/nologo','/codepage:65001','/out:'+path.join(dir,'check.exe'),path.join(base,'KemcoSpriteSnapshot.cs'),path.join(dir,'check.cs')]);
  const r=spawnSync(path.join(dir,'check.exe'),[],{windowsHide:true,encoding:'utf8',timeout:5000});assert.ifError(r.error);assert.equal(r.status,0,r.stdout+r.stderr);
  const lines=r.stdout.trim().split(/\r?\n/);assert.match(lines.pop(),/^PASS 4\d$/);const {parseChars}=require('../core/text-paths.cjs');
  const parsed=lines.map(l=>{const x=parseChars(l);assert.ok(x,l);assert.equal(x.hidden,false);return x;});
  assert.equal(parsed[0].text,'日本');assert.equal(parsed[3].role,'name');assert.equal(parsed[4].role,'choice');assert.equal(parsed[5].text,'');assert.equal(parsed[6].line,parsed[2].line);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('new observer is a strict opt-in and old control bytes remain unchanged',()=>{
 const {UnityTextPath}=require('../core/text-paths-unity.cjs'),p=new UnityTextPath(),writes=[];p.sock={write:s=>writes.push(s)};
 p.drawConfig({roles:true,embed:false,zh:false});assert.equal(writes.pop(),'DRAW roles=1 embed=0 zh=0\n');
 p.drawConfig({roles:false,embed:false,kemcoSprites:'true'});assert.equal(writes.pop(),'DRAW roles=0 embed=0 zh=1\n');
 p.drawConfig({kemcoSprites:true});assert.match(writes.pop(),/^KEMCO [a-f0-9]{32}\n$/);assert.equal(writes.pop(),'DRAW roles=0 embed=0 zh=1 kemcoSprites=1\n');
 p.drawConfig({});assert.equal(writes.pop(),'DRAW roles=0 embed=0 zh=1\n');
 assert.match(source,/file.Length!=361472/);assert.match(source,/c4d74235dc06d19630d8b826e49bd3d047c09bc03e8d8badeb0d60dd71dd7314/);
 const observer=source.slice(source.indexOf('// Exact original Raging Loop'));
 assert.doesNotMatch(observer,/\.SetValue\(|\.SetActive\(|\.enabled\s*=|\.color\s*=|\.material\b|hideAsked\s*=/);
 assert.match(observer,/epoch!=kemcoObservedEpoch\) \{ kemcoPages.Reset/);assert.match(observer,/!connected \|\| !kemcoAsked/);
 assert.match(observer,/kemcoRows=KemcoField\(kemcoMessage,"messageSprite",typeof\(List<List<GameObject>>\)\)/);
 assert.match(observer,/root.transform.parent!=parent.transform/);assert.match(observer,/if \(!kemcoRoles/);
});
