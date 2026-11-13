# SPDX-License-Identifier: GPL-3.0-or-later
# E578 export per-title archive keys from GARbro's key database (GameData\Formats.dat, morkt, MIT) to JSON, the way
# cx-schemes.json and paz-schemes.json were made. Run against the "archives" runtime pack (runtime\garbro):
#   powershell -NoProfile -File tools\garbro-schemes.ps1 -GarbroDir runtime\garbro -Engine malie > malie-schemes.json
#   -Engine malie : Malie LIBP/LIBU keys (DatOpener.KnownSchemes): Camellia (the 16 key bytes) or CFI (key + rotate key)
#   -Engine warc  : ShiinaRio WARC schemes with their key bytes, stored the way OpenShiina's Formats.Json does (E602):
#                   SharedData (hex byte arrays used by more than one title, named "@name" from a scheme), CommonImages
#                   (the base64 common parts of the ShiinaImages) and per title CryptKey / HelperKey / Region / DecodeBin,
#                   ShiinaImage {Common, CommonLength, Tail (base64), Length, Sha256} and ExtraCrypt {$type, fields};
#                   GameMap is exe/archive name -> title
param([string]$GarbroDir,[string]$Engine='malie')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$gameRes=[Reflection.Assembly]::LoadFrom((Join-Path $GarbroDir 'GameRes.dll'))
$arcFormats=[Reflection.Assembly]::LoadFrom((Join-Path $GarbroDir 'ArcFormats.dll'))
$catalog=$gameRes.GetType('GameRes.FormatCatalog')::Instance
$st=[IO.File]::OpenRead((Join-Path $GarbroDir 'GameData\Formats.dat'));try{$catalog.DeserializeScheme($st)}finally{$st.Dispose()}
$bf=[Reflection.BindingFlags]'Public,NonPublic,Instance,Static'
function Field($o,$name){$t=$o.GetType();while($t){$f=$t.GetField($name,$bf);if($f){return $f.GetValue($o)};$p=$t.GetProperty($name,$bf);if($p){return $p.GetValue($o)};$t=$t.BaseType};return $null}
function Hex($bytes){if($null -eq $bytes){return $null};return (($bytes|ForEach-Object{$_.ToString('x2')}) -join '')}
$out=[ordered]@{source='GARbro '+$gameRes.GetName().Version.ToString()+' GameData/Formats.dat';schemes=[ordered]@{}}
if($Engine -eq 'malie'){
 $known=$arcFormats.GetType('GameRes.Formats.Malie.DatOpener')::KnownSchemes
 foreach($k in $known.Keys){$s=$known[$k];$align=[uint32](Field $s 'DataAlign')
  if($s.GetType().Name -eq 'LibCamelliaScheme'){$w=$s.Key;$b=New-Object byte[] 16
   for($i=0;$i -lt 4;$i++){$v=[uint32]$w[48+$i];$b[$i*4]=[byte]($v -shr 24);$b[$i*4+1]=[byte](($v -shr 16) -band 255);$b[$i*4+2]=[byte](($v -shr 8) -band 255);$b[$i*4+3]=[byte]($v -band 255)}
   $out.schemes[$k]=[ordered]@{cipher='camellia';align=$align;key=(Hex $b)}}
  elseif($s.GetType().Name -eq 'LibCfiScheme'){$out.schemes[$k]=[ordered]@{cipher='cfi';align=$align;key=(Hex $s.Key);rotate=@($s.RotateKey|ForEach-Object{[uint32]$_})}}
  else{$out.schemes[$k]=[ordered]@{cipher=$s.GetType().Name;align=$align}}}
}elseif($Engine -eq 'warc'){
 $known=$arcFormats.GetType('GameRes.Formats.ShiinaRio.Decoder')::KnownSchemes
 $sha=[Security.Cryptography.SHA256]::Create();function Sha($b){return (Hex $sha.ComputeHash([byte[]]$b))}
 # byte arrays: counted first, those used by two titles or more go to SharedData under "<Field><n>"
 $uses=@{};$names=@{};$shared=[ordered]@{};$commons=[ordered]@{};$commonNames=@{}
 function Count($field,$b){if($null -eq $b -or $b.Length -lt 16){return};$h=Sha $b;if(-not $uses.ContainsKey($h)){$uses[$h]=@{n=0;field=$field}};$uses[$h].n++}
 function Bytes($field,$b){if($null -eq $b){return $null};if($b.Length -eq 0){return ''};$hex=Hex $b;if($b.Length -lt 16){return $hex};$h=Sha $b
  if($uses[$h].n -lt 2){return $hex};if(-not $names.ContainsKey($h)){$i=1;while($shared.Contains("$field$i")){$i++};$names[$h]="$field$i";$shared["$field$i"]=$hex};return '@'+$names[$h]}
 foreach($s in $known){Count 'CryptKey' $s.CryptKey;Count 'Region' $s.Region;Count 'DecodeBin' $s.DecodeBin;if($s.ExtraCrypt){$t=[byte[]](Field $s.ExtraCrypt 'DecodeTable');if($t){Count 'DecodeTable' $t}}}
 $list=@()
 foreach($s in $known){
  $e=[ordered]@{Name=$s.Name;OriginalTitle=$s.OriginalTitle;Version=[int]$s.Version;EntryNameSize=[int]$s.EntryNameSize}
  $e.CryptKey=Bytes 'CryptKey' $s.CryptKey
  if($s.HelperKey){$e.HelperKey=@($s.HelperKey|ForEach-Object{'0x'+([uint32]$_).ToString('X8')})}
  $e.Region=Bytes 'Region' $s.Region;$e.DecodeBin=Bytes 'DecodeBin' $s.DecodeBin
  $img=$s.ShiinaImage
  if($img){$common=[byte[]](Field $img 'm_common');$tail=[byte[]](Field $img 'm_extra');if($null -eq $tail){$tail=New-Object byte[] 0};$cl=[int](Field $img 'm_common_length');$ch=Sha $common
   if(-not $commonNames.ContainsKey($ch)){$n='Image'+($commons.Count+1);$commonNames[$ch]=$n;$commons[$n]=[Convert]::ToBase64String($common)}
   $whole=New-Object byte[] ($cl+$tail.Length);[Array]::Copy($common,$whole,$cl);[Array]::Copy($tail,0,$whole,$cl,$tail.Length)
   $e.ShiinaImage=[ordered]@{Common=$commonNames[$ch];CommonLength=$cl;Tail=[Convert]::ToBase64String($tail);Length=$whole.Length;Sha256=(Sha $whole)}}
  $x=$s.ExtraCrypt
  if($x){$xe=[ordered]@{'$type'=$x.GetType().Name}
   foreach($f in 'Seed','MinLength','PostDataOffset','EncryptedSize','m_key'){$v=Field $x $f;if($null -ne $v){$xe[$(if($f -eq 'm_key'){'Key'}else{$f})]=[uint32]$v}}
   $t=[byte[]](Field $x 'DecodeTable');if($t){$xe.DecodeTable=Bytes 'DecodeTable' $t}
   $e.ExtraCrypt=$xe}
  $list+=$e}
 $out.Remove('schemes');$out.SharedData=$shared;$out.CommonImages=$commons;$out.schemes=$list
}
$titles=@{};if($Engine -eq 'warc'){foreach($e in $out.schemes){$titles[$e.Name]=1}}else{foreach($k in $out.schemes.Keys){$titles[$k]=1}}
$map=Field $catalog 'm_game_map';if($map){$g=[ordered]@{};foreach($k in ($map.Keys|Sort-Object)){if($titles.ContainsKey($map[$k])){$g[$k]=$map[$k]}};$out[$(if($Engine -eq 'warc'){'GameMap'}else{'games'})]=$g}
[Console]::Out.WriteLine($(if($Engine -eq 'warc'){$out|ConvertTo-Json -Depth 8 -Compress}else{$out|ConvertTo-Json -Depth 6}))
