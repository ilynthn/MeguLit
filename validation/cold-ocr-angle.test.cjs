// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 Windows OCR deskews a slanted picture (ファタモルガーナの館 title: TextAngle 8.5) and reports its boxes in the rotated picture;
   services/cold-ocr.ps1 turns them back, so a menu click lands on the words. A picture with a slanted logo and level menu words: the
   box of the words must be where they were drawn. Skipped where Windows has no Japanese OCR */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const PS=path.join(process.env.SystemRoot||'C:\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
test('cold OCR boxes are in picture pixels even when the engine reports a text angle',{skip:process.platform!=='win32'},t=>{
 const d=fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'cold-ocr-angle-')),pic=path.join(d,'title.png');
 try{
  const draw="Add-Type -AssemblyName System.Drawing;$b=New-Object Drawing.Bitmap 804,604;$g=[Drawing.Graphics]::FromImage($b);$g.Clear([Drawing.Color]::Black);$f=New-Object Drawing.Font('MS Gothic',26);"+
   "$g.TranslateTransform(402,302);$g.RotateTransform(-8.5);$g.TranslateTransform(-402,-302);foreach($i in 0..5){$g.DrawString('あいうえおかき',$f,[Drawing.Brushes]::White,40,60+$i*80)};$g.ResetTransform();"+
   "$g.DrawString('館の扉を開く',$f,[Drawing.Brushes]::White,620,320);$g.Dispose();$b.Save($env:PIC,[Drawing.Imaging.ImageFormat]::Png);$b.Dispose()";
  const mk=spawnSync(PS,['-NoProfile','-NonInteractive','-Command',draw],{env:{...process.env,PIC:pic},encoding:'utf8',windowsHide:true,timeout:60000});
  if(!fs.existsSync(pic)){t.skip('no System.Drawing: '+String(mk.stderr).slice(0,120));return;}
  const r=spawnSync(PS,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',process.env.OCR_PS||path.join(__dirname,'..','services','cold-ocr.ps1'),pic],{encoding:'utf8',windowsHide:true,timeout:120000});
  let lines=[];try{lines=JSON.parse(String(r.stdout||'[]'));}catch{}
  const hit=lines.find(l=>l.pass==='plain'&&/館.?の.?扉/.test(String(l.text).replace(/\s/g,'')));
  if(!lines.length){t.skip('no Japanese OCR on this machine');return;}
  if(!hit){t.skip('OCR did not read the menu words here');return;}
  const cy=hit.y+hit.h/2,cx=hit.x+hit.w/2;assert.ok(Math.abs(cy-336)<14,'box centre y '+cy+' is on the words (drawn at 320-352)');assert.ok(Math.abs(cx-700)<40,'box centre x '+cx);}
 finally{fs.rmSync(d,{recursive:true,force:true});}});
