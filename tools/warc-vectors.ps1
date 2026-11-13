# SPDX-License-Identifier: GPL-3.0-or-later
# E602 reference vectors for the ShiinaRio WARC decryptor in services/original-engines/shiinario-crypt.cjs: GARbro's own
# Decoder (ArcFormats.dll, morkt, MIT) is run on fixed pseudo-random bytes for every scheme of its key database, and the
# SHA-256 of what comes out is written as JSON (validation/helpers/warc-vectors.json). The JS port has to give the same
# bytes. Run against the "archives" runtime pack:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\warc-vectors.ps1 -GarbroDir runtime\garbro [-RangeDir dir] [-OpenDir dir]
#   -RangeDir : *.bin files decoded with GARbro's Kogado range coder (the WARC 1.2-1.6 index), hashes of the output
#   -OpenDir  : <folder>\*.war archives opened by GARbro's WarOpener (the scheme from a game-map .exe in the folder,
#               else the one named in <folder>\scheme.txt), hashes of every entry
#   -TokenFile: the cipher's angle token for every byte pair (a, b) in -128..255 as raw doubles, .NET's Math.Acos; it
#               differs from V8's in the last bits for 764 pairs: node tools/warc-acos-fix.cjs <file> writes
#               services/original-engines/shiinario-acos.json from it
# The bytes: x = x * 1103515245 + 12345 (mod 2^32) from a seed, each byte (x >> 16) & 255.
param([string]$GarbroDir,[string]$RangeDir='',[string]$OpenDir='',[string]$TokenFile='',[string]$OutFile='')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$gameResPath=(Resolve-Path (Join-Path $GarbroDir 'GameRes.dll')).Path;$arcPath=(Resolve-Path (Join-Path $GarbroDir 'ArcFormats.dll')).Path
$gameRes=[Reflection.Assembly]::LoadFrom($gameResPath);$arcFormats=[Reflection.Assembly]::LoadFrom($arcPath)
$catalog=$gameRes.GetType('GameRes.FormatCatalog')::Instance
$st=[IO.File]::OpenRead((Join-Path $GarbroDir 'GameData\Formats.dat'));try{$catalog.DeserializeScheme($st)}finally{$st.Dispose()}
Add-Type -ReferencedAssemblies $gameResPath,$arcPath,'System.Core' -TypeDefinition @'
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Reflection;
using System.Collections.Generic;
using System.Security.Cryptography;
public static class WarcVec
{
    const BindingFlags BF = BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Instance|BindingFlags.Static;
    static Type Dec;
    public static void Init (Assembly arc) { Dec = arc.GetType ("GameRes.Formats.ShiinaRio.Decoder"); }
    public static byte[] Gen (uint seed, int n)
    {
        var b = new byte[n]; uint x = seed;
        for (int i = 0; i < n; ++i) { x = x * 1103515245u + 12345u; b[i] = (byte)(x >> 16); }
        return b;
    }
    public static string Hash (byte[] b) { using (var s = SHA256.Create()) return BitConverter.ToString (s.ComputeHash (b)).Replace ("-", "").ToLowerInvariant(); }
    static object NewDec (int ver, object scheme) { return Activator.CreateInstance (Dec, BF, null, new object[] { ver, scheme }, null); }
    static object Call (object o, string m, params object[] a) { return Dec.GetMethod (m, BF).Invoke (o, a); }
    static void SetRand (object o, uint r) { Dec.GetProperty ("Rand", BF).SetValue (o, r, null); }
    static uint GetRand (object o) { return (uint)Dec.GetProperty ("Rand", BF).GetValue (o, null); }
    static object Field (object o, string name)
    {
        for (var t = o.GetType(); t != null; t = t.BaseType)
        {
            var f = t.GetField (name, BF); if (f != null) return f.GetValue (o);
            var p = t.GetProperty (name, BF); if (p != null) return p.GetValue (o, null);
        }
        return null;
    }
    static void U32 (MemoryStream s, uint v) { s.Write (BitConverter.GetBytes (v), 0, 4); }
    static void F64 (MemoryStream s, double v) { s.Write (BitConverter.GetBytes (v), 0, 8); }

    public static byte[] Tokens;
    /// the double / float helpers over their whole input domain
    public static Dictionary<string,string> Helpers (object scheme)
    {
        var r = new Dictionary<string,string>();
        var d130 = NewDec (130, scheme); var d120 = NewDec (120, scheme);
        var h1 = new MemoryStream();
        for (int a = -128; a < 256; ++a) F64 (h1, (double)Call (d130, "DecryptHelper1", (double)a));
        r["helper1"] = Hash (h1.ToArray());
        var tok = new MemoryStream(); var h2 = new MemoryStream(); var h2old = new MemoryStream();
        for (int a = -128; a < 256; ++a)
        for (int b = -128; b < 256; ++b)
        {
            double token = 0.0;
            if (0 != (a|b))
            {
                token = Math.Acos ((double)a / Math.Sqrt ((double)(a*a + b*b)));
                token = token / Math.PI * 180.0;
            }
            if (b < 0)
                token = 360.0 - token;
            F64 (tok, token);
            uint seed = (uint)((a & 0x1ff) << 9 | (b & 0x1ff)) * 2654435761u + 1u;
            if (a < 128 && b < 128)
            {
                SetRand (d130, seed); U32 (h2, (uint)Call (d130, "DecryptHelper2", token)); U32 (h2, GetRand (d130));
            }
            if (a >= 0 && b >= 0)
            {
                SetRand (d120, seed); U32 (h2old, (uint)Call (d120, "DecryptHelper2", token)); U32 (h2old, GetRand (d120));
            }
        }
        Tokens = tok.ToArray(); r["token"] = Hash (Tokens); r["helper2"] = Hash (h2.ToArray()); r["helper2v120"] = Hash (h2old.ToArray());
        var h3 = new MemoryStream(); var src = Gen (3, 4096);
        for (int i = 0; i < 4096; i += 4) U32 (h3, (uint)Call (d130, "DecryptHelper3", BitConverter.ToUInt32 (src, i)));
        for (uint k = 0; k < 256; ++k) U32 (h3, (uint)Call (d130, "DecryptHelper3", k * 0x01010101u));
        r["helper3"] = Hash (h3.ToArray());
        return r;
    }

    public static readonly int[] Versions = { 120, 130, 140, 150, 160, 170 };
    public static readonly int[] Lengths = { 2, 3, 4, 0x7f, 0x80, 0x81, 0x84, 0x100, 0x3ff, 0x400, 0x401, 0x1000, 0x2345 };
    static uint Seed (int ver, int len, int k) { return (uint)(ver * 7919 + len * 31 + k); }

    /// Decrypt / Encrypt / DecryptIndex / Decrypt2 / ExtraCrypt of one scheme
    public static Dictionary<string,string> Scheme (object scheme)
    {
        var r = new Dictionary<string,string>();
        var all = new MemoryStream();
        foreach (int ver in Versions)
        {
            var dec = NewDec (ver, scheme); var s = new MemoryStream();
            foreach (int len in Lengths)
            for (int k = 0; k < 3; ++k)
            {
                var data = Gen (Seed (ver, len, k), len + 8);
                Call (dec, "Decrypt", data, 8, (uint)len); s.Write (data, 0, data.Length);
                var enc = Gen (Seed (ver, len, k) ^ 0x55u, len + 8);
                Call (dec, "Encrypt", enc, 8, (uint)len); s.Write (enc, 0, enc.Length);
            }
            uint max = (uint)Dec.GetProperty ("MaxIndexLength", BF).GetValue (dec, null);
            var idx = Gen (Seed (ver, 0, 9), (int)max);
            Call (dec, "DecryptIndex", 0x12345678u ^ (uint)ver, idx);
            s.Write (idx, 0, 0x1400); s.Write (idx, idx.Length - 0x40, 0x40);
            foreach (int len in new[] { 0x3ff, 0x400, 0x1000 })
            {
                var data = Gen (Seed (ver, len, 7), len + 8);
                Call (dec, "Decrypt2", data, 8, (uint)len); s.Write (data, 0, data.Length);
            }
            var b = s.ToArray(); r["v" + ver] = Hash (b); all.Write (b, 0, b.Length);
        }
        var extra = Field (scheme, "ExtraCrypt");
        if (extra != null)
        {
            var s = new MemoryStream();
            // through the interface, as the opener calls it (NyaruCrypt re-implements it with "new" methods)
            var iface = Dec.Assembly.GetType ("GameRes.Formats.ShiinaRio.IDecryptExtra");
            var dmeth = iface.GetMethod ("Decrypt"); var emeth = iface.GetMethod ("Encrypt");
            foreach (uint flags in new uint[] { 0x202, 0x204, 0x206 })
            foreach (int len in new[] { 0xff, 0x100, 0x1ff, 0x200, 0x201, 0x203, 0x3ff, 0x400, 0x1234 })
            for (int k = 0; k < 4; ++k)
            {
                // k 1..3: the packed-block form some ExtraCrypts look for (0x718E958D, a small count), k 3 far into a buffer
                int at = k == 3 ? 0x2100 : 8;
                var data = Gen (Seed ((int)flags, len, k), at + len + (k == 3 ? 0x20000 : 0));
                if (k > 0 && len >= 0x10)
                {
                    data[at] = 0x8D; data[at+1] = 0x95; data[at+2] = 0x8E; data[at+3] = 0x71;
                    int count = k == 1 ? 40 : 90;
                    data[at+8] = (byte)count; data[at+9] = 0; data[at+10] = 0; data[at+11] = 0;
                }
                string tag = "ok";
                try { dmeth.Invoke (extra, new object[] { data, at, (uint)len, flags }); }
                catch (TargetInvocationException) { tag = "throw"; }
                s.Write (Encoding.ASCII.GetBytes (tag), 0, tag.Length); s.Write (data, 0, data.Length);
                if (k == 0)
                {
                    var enc = Gen (Seed ((int)flags, len, 5), len + 8); tag = "ok";
                    try { emeth.Invoke (extra, new object[] { enc, 8, (uint)len, flags ^ 0x300u }); }
                    catch (TargetInvocationException) { tag = "throw"; }
                    s.Write (Encoding.ASCII.GetBytes (tag), 0, tag.Length); s.Write (enc, 0, enc.Length);
                }
            }
            var b = s.ToArray(); r["extra"] = Hash (b); all.Write (b, 0, b.Length);
        }
        r["all"] = Hash (all.ToArray());
        return r;
    }

    public static string Range (Assembly arc, byte[] input, int max)
    {
        var t = arc.GetType ("GameRes.Formats.Kogado.CRangeCoder");
        var coder = Activator.CreateInstance (t, true);
        t.GetMethod ("InitQSModel", new[] { typeof(int), typeof(int), typeof(int), typeof(int[]), typeof(bool) }).Invoke (coder, new object[] { 257, 12, 2000, null, false });
        var output = new byte[max];
        uint n = (uint)t.GetMethod ("Decode", new[] { typeof(byte[]), typeof(uint), typeof(uint), typeof(byte[]), typeof(uint), typeof(uint) })
            .Invoke (coder, new object[] { output, 0u, (uint)max, input, 0u, (uint)input.Length });
        var res = new byte[n]; Array.Copy (output, res, n);
        return n + ":" + Hash (res);
    }
}
'@
[WarcVec]::Init($arcFormats)
$known=$arcFormats.GetType('GameRes.Formats.ShiinaRio.Decoder')::KnownSchemes
$out=[ordered]@{source='GARbro '+$gameRes.GetName().Version.ToString()+' ArcFormats.dll ShiinaRio.Decoder'}
$out['helpers']=[WarcVec]::Helpers($known[0])
if($TokenFile){[IO.File]::WriteAllBytes($TokenFile,[WarcVec]::Tokens)}
$schemes=[ordered]@{};foreach($s in $known){$schemes[$s.Name]=[WarcVec]::Scheme($s)};$out['schemes']=$schemes
if($RangeDir){$r=[ordered]@{};foreach($f in Get-ChildItem $RangeDir -Filter *.bin|Sort-Object Name){$r[$f.Name]=[WarcVec]::Range($arcFormats,[IO.File]::ReadAllBytes($f.FullName),1 -shl 20)};$out['range']=$r}
if($OpenDir){
 $settings=$arcFormats.GetType('GameRes.Formats.Properties.Settings')::Default
 $opener=$catalog.ArcFormats|Where-Object{$_.Tag -eq 'WAR'}|Select-Object -First 1
 $o=[ordered]@{}
 # an archive no game-map .exe names: GARbro asks for the scheme; answered with the one in scheme.txt
 $catalog.add_ParametersRequest({param($sender,$e) $e.InputResult=$true})
 foreach($d in Get-ChildItem $OpenDir -Directory){$sf=Join-Path $d.FullName 'scheme.txt';$settings.WARCScheme=$(if(Test-Path $sf){[IO.File]::ReadAllText($sf).Trim()}else{''})
  foreach($f in Get-ChildItem $d.FullName -Filter *.war|Sort-Object Name){$key=$d.Name+'/'+$f.Name
   try{$view=New-Object GameRes.ArcView($f.FullName);$arc=$opener.TryOpen($view)
    if($null -eq $arc){$o[$key]='null';continue}
    $e=[ordered]@{};foreach($entry in $arc.Dir){$st=$opener.OpenEntry($arc,$entry);$ms=New-Object IO.MemoryStream;$st.CopyTo($ms);$st.Dispose();$e[$entry.Name]=[WarcVec]::Hash($ms.ToArray())}
    $o[$key]=$e;$arc.Dispose()}catch{$o[$key]='error: '+$_.Exception.InnerException.Message+' '+$_.Exception.Message}}}
 $out['open']=$o}
$json=$out|ConvertTo-Json -Depth 6
if($OutFile){[IO.File]::WriteAllText($OutFile,$json,[Text.UTF8Encoding]::new($false))}else{[Console]::Out.WriteLine($json)}
