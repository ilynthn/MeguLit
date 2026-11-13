// SPDX-License-Identifier: GPL-3.0-or-later
// Stand-in game window with a MeguLit-style overlay popup on top of it, both cloaked (nothing shows on the
// user's screen). Saved pictures must come from GameCapture.Picture: the game's stripes, none of the overlay's green.
// harness.exe <result.json> writes one JSON object to result.json.
// Compiled with native/GameCapture.cs by validation/shot-own-overlay.test.cjs.
using System;using System.Drawing;using System.Drawing.Imaging;using System.IO;using System.Runtime.InteropServices;using System.Threading;using System.Windows.Forms;
static class ShotOverlayHarness{
 [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr hwnd,int attr,ref int value,int size);
 // DWMWA_CLOAK: the window stays on the desktop, keeps its own DWM surface and counts as covering the game, but is never
 // drawn on the monitor, so the test needs no visible window and the game still reads like one on screen.
 static void Cloak(IntPtr hwnd){int on=1;DwmSetWindowAttribute(hwnd,13,ref on,4);}
 sealed class Game:Form{
  public bool Black;
  public Game(){FormBorderStyle=FormBorderStyle.None;StartPosition=FormStartPosition.Manual;Bounds=new Rectangle(X0,Y0,400,300);ShowInTaskbar=false;DoubleBuffered=true;}
  protected override bool ShowWithoutActivation{get{return true;}}
  protected override CreateParams CreateParams{get{var p=base.CreateParams;p.ExStyle|=0x08000000|0x80;return p;}}
  protected override void OnHandleCreated(EventArgs e){Cloak(Handle);base.OnHandleCreated(e);}
  protected override void OnPaint(PaintEventArgs e){if(Black){e.Graphics.Clear(Color.Black);return;}
   for(int x=0;x<400;x+=20)using(var b=new SolidBrush((x/20)%2==0?Color.FromArgb(220,40,40):Color.FromArgb(30,30,120)))e.Graphics.FillRectangle(b,x,0,20,300);}
 }
 sealed class Overlay:Form{
  public Overlay(){FormBorderStyle=FormBorderStyle.None;StartPosition=FormStartPosition.Manual;Bounds=new Rectangle(X0+100,Y0+100,200,100);ShowInTaskbar=false;TopMost=true;BackColor=Color.FromArgb(0,255,0);}
  protected override bool ShowWithoutActivation{get{return true;}}
  protected override CreateParams CreateParams{get{var p=base.CreateParams;p.ExStyle|=0x08000000|0x80;return p;}}
  protected override void OnHandleCreated(EventArgs e){Cloak(Handle);base.OnHandleCreated(e);}
 }
 const int X0=0,Y0=0;
 static bool Green(Color c){return c.G>200&&c.R<60&&c.B<60;}
 static int CountGreen(Bitmap b){int n=0;for(int y=0;y<b.Height;y+=4)for(int x=0;x<b.Width;x+=4)if(Green(b.GetPixel(x,y)))n++;return n;}
 static void Pump(int n){for(int i=0;i<n;i++){Application.DoEvents();Thread.Sleep(20);}}
 [STAThread]static int Main(string[] args){
  if(args.Length!=1)return 2;File.WriteAllText(args[0],Run());return 0;
 }
 static string Run(){
  try{
   var game=new Game();var overlay=new Overlay();game.Show();overlay.Show();Pump(30);game.Refresh();overlay.Refresh();Pump(5);
   bool overlaps=overlay.Bounds.IntersectsWith(game.Bounds)&&overlay.Visible&&overlay.TopMost;
   int pictureGreen=-1,stripes=0;bool picture;
   using(var image=new Bitmap(400,300,PixelFormat.Format32bppRgb)){
    picture=GameCapture.Picture(game.Handle,image);
    if(picture){pictureGreen=CountGreen(image);var a=image.GetPixel(170,150);var b=image.GetPixel(150,150);if(a.R>150&&a.B<80)stripes++;if(b.B>90&&b.R<80)stripes++;}
   }
   // A plain black game frame: the window surface is blank, so nothing is saved (never a screen copy in its place).
   game.Black=true;game.Refresh();Pump(5);bool blankSaved;
   using(var image=new Bitmap(400,300,PixelFormat.Format32bppRgb))blankSaved=GameCapture.Picture(game.Handle,image);
   overlay.Close();game.Close();
   return "{\"overlaps\":"+(overlaps?"true":"false")+",\"picture\":"+(picture?"true":"false")+",\"pictureGreen\":"+pictureGreen+",\"stripes\":"+stripes+",\"blankSaved\":"+(blankSaved?"true":"false")+"}";
  }catch(Exception e){return "{\"error\":\""+e.GetType().Name+"\"}";}
 }
}
