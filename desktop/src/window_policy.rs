// SPDX-License-Identifier: GPL-3.0-or-later
use std::path::Path;
// Commit on the UI thread itself. Tauri's dispatcher can return before its
// queued hide has run; the native visibility bit is the final authority.
pub fn hide_home_surface(window:&tauri::WebviewWindow)->Result<(),String>{
 if window.label()!="main"{return Err("INVALID_HOME_WINDOW".into());}
 #[cfg(windows)] unsafe{hide_native(window.hwnd().map_err(|e|e.to_string())?.0 as *mut std::ffi::c_void)?;}
 Ok(())
}
#[cfg(windows)]unsafe fn hide_native(hwnd:*mut std::ffi::c_void)->Result<(),String>{
  use std::ffi::c_void;
  #[link(name="user32")] extern "system"{fn ShowWindow(hwnd:*mut c_void,command:i32)->i32;fn IsWindowVisible(hwnd:*mut c_void)->i32;fn SetWindowPos(hwnd:*mut c_void,after:*mut c_void,x:i32,y:i32,width:i32,height:i32,flags:u32)->i32;}
  ShowWindow(hwnd,0);
  SetWindowPos(hwnd,std::ptr::null_mut(),0,0,0,0,0x97);
  if IsWindowVisible(hwnd)!=0{return Err(format!("HOME_STILL_VISIBLE hwnd={hwnd:p}"));}
 Ok(())
}
pub fn native_hide_self_test()->Result<(),String>{
 #[cfg(windows)]unsafe{
  use std::ffi::c_void;
  #[link(name="user32")]extern "system"{fn CreateWindowExW(ex:u32,class:*const u16,title:*const u16,style:u32,x:i32,y:i32,w:i32,h:i32,parent:*mut c_void,menu:*mut c_void,instance:*mut c_void,param:*mut c_void)->*mut c_void;fn DestroyWindow(hwnd:*mut c_void)->i32;fn IsWindowVisible(hwnd:*mut c_void)->i32;}
  let class:Vec<u16>="STATIC\0".encode_utf16().collect();let null=std::ptr::null_mut();
  // An isolated offscreen fixture belonging to this test process only.
  let hwnd=CreateWindowExW(0x80,class.as_ptr(),class.as_ptr(),0x90000000,-32000,-32000,16,16,null,null,null,null);
  if hwnd.is_null(){return Err(std::io::Error::last_os_error().to_string());}
  let was_visible=IsWindowVisible(hwnd)!=0;let result=hide_native(hwnd);DestroyWindow(hwnd);
  if !was_visible{return Err("TEST_FIXTURE_NOT_VISIBLE".into());}result?;
 }
 Ok(())
}
// Clip the actual native window, including its opaque background and frame.
// Never resize the WebView or change focus during a transition.
// E268 (user: Alt+M showed a translucent ghost frame that shrank to a bottom strip): the old region clip left the DWM
// shadow and backdrop behind. Fade the whole window, frame and shadow included, with layered alpha instead.
pub fn animate_home_surface(window:&tauri::WebviewWindow,amount:f64){
 #[cfg(windows)] unsafe{
  use std::ffi::c_void;
  #[link(name="user32")]extern "system"{fn GetWindowLongW(hwnd:*mut c_void,index:i32)->i32;fn SetWindowLongW(hwnd:*mut c_void,index:i32,value:i32)->i32;fn SetLayeredWindowAttributes(hwnd:*mut c_void,key:u32,alpha:u8,flags:u32)->i32;}
  if let Ok(handle)=window.hwnd(){let hwnd=handle.0 as *mut c_void;let style=GetWindowLongW(hwnd,-20);if style&0x80000==0{SetWindowLongW(hwnd,-20,style|0x80000);}let a=(amount.clamp(0.0,1.0)*255.0).round() as u8;SetLayeredWindowAttributes(hwnd,0,a,2);}
 }
}
// User 2026-11-14 (「很久都没见过的蓝框又出来了 顶部」): when MeguLit's UI thread stops pumping messages for 5 s, Windows
// swaps every visible window of the process for a "Ghost" window: same title and size, a basic blue caption with an x.
// The reader overlay ("MeguLit tools") spans the whole monitor, so its ghost is a blue strip over the game. Opt the
// process out before any window exists; a busy moment then just waits instead of drawing a frame.
pub fn no_ghost_windows(){
 #[cfg(windows)]unsafe{
  #[link(name="user32")]extern "system"{fn DisableProcessWindowsGhosting();}
  DisableProcessWindowsGhosting();
 }
}
pub fn close_to_tray(root:&Path)->bool{
 std::fs::read(root.join("data/preferences.json")).ok().and_then(|bytes|serde_json::from_slice::<serde_json::Value>(&bytes).ok()).and_then(|value|value["closeToTray"].as_bool()).unwrap_or(true)
}
// E270 (user: a big blue frame appeared over the game when the Alt+T menu took focus): Windows 11 draws its accent
// colour border around a focused borderless window; the full-screen reader overlay must never show one.
pub fn no_accent_border(window:&tauri::WebviewWindow){
 #[cfg(windows)]unsafe{
  use std::ffi::c_void;
  #[link(name="dwmapi")]extern "system"{fn DwmSetWindowAttribute(hwnd:*mut c_void,attribute:u32,value:*const u32,size:u32)->i32;}
  if let Ok(handle)=window.hwnd(){let no_border=0xfffffffeu32;DwmSetWindowAttribute(handle.0 as *mut c_void,34,&no_border,4);}
 }
}
pub fn configure_home_frame(window:&tauri::WebviewWindow){
 if window.label()!="main"{return;}
 #[cfg(windows)]unsafe{
  use std::ffi::c_void;
  #[link(name="dwmapi")]extern "system"{fn DwmSetWindowAttribute(hwnd:*mut c_void,attribute:u32,value:*const u32,size:u32)->i32;}
  if let Ok(handle)=window.hwnd(){let hwnd=handle.0 as *mut c_void;let dark=1u32;let no_border=0xfffffffeu32;let native_policy=0u32;
   // Keep DWM's normal borderless compositing. Disabling it exposes a classic
   // resize frame. Tao's undecorated shadow inset is disabled on the builder.
   DwmSetWindowAttribute(hwnd,2,&native_policy,4);DwmSetWindowAttribute(hwnd,20,&dark,4);DwmSetWindowAttribute(hwnd,34,&no_border,4);
  }
 }
 round_home_frame(window);
}
// Clip the native surface, including the WebView background, rather than only
// rounding an HTML element and leaving opaque square corners behind it.
pub fn round_home_frame(window:&tauri::WebviewWindow){
 if window.label()!="main"{return;}
 #[cfg(windows)]unsafe{
  use std::ffi::c_void;
  #[repr(C)]struct Rect{left:i32,top:i32,right:i32,bottom:i32}
  #[link(name="user32")]extern "system"{fn GetWindowRect(hwnd:*mut c_void,rect:*mut Rect)->i32;fn IsZoomed(hwnd:*mut c_void)->i32;fn GetWindowRgn(hwnd:*mut c_void,rgn:*mut c_void)->i32;fn SetWindowRgn(hwnd:*mut c_void,rgn:*mut c_void,redraw:i32)->i32;fn GetDpiForWindow(hwnd:*mut c_void)->u32;fn SetWindowPos(hwnd:*mut c_void,after:*mut c_void,x:i32,y:i32,width:i32,height:i32,flags:u32)->i32;}
  #[link(name="gdi32")]extern "system"{fn CreateRoundRectRgn(left:i32,top:i32,right:i32,bottom:i32,width:i32,height:i32)->*mut c_void;fn CreateRectRgn(left:i32,top:i32,right:i32,bottom:i32)->*mut c_void;fn EqualRgn(a:*mut c_void,b:*mut c_void)->i32;fn DeleteObject(object:*mut c_void)->i32;}
  #[link(name="dwmapi")]extern "system"{fn DwmSetWindowAttribute(hwnd:*mut c_void,attribute:u32,value:*const u32,size:u32)->i32;}
  if let Ok(handle)=window.hwnd(){let hwnd=handle.0 as *mut c_void;let old=CreateRectRgn(0,0,0,0);if old.is_null(){return;}let existing=GetWindowRgn(hwnd,old);
   // Windows 11: DWM rounds and antialiases the composed surface itself
   // (DWMWA_WINDOW_CORNER_PREFERENCE=33, DWMWCP_ROUND=2) and squares it when
   // maximized. Any window region disables that, so drop it. GDI regions have
   // no partial coverage, which is what made the corners visibly jagged.
   // After a transition region is removed DWM can keep compositing square corners until the frame changes;
   // force that frame change so the rounded, antialiased corners come back immediately.
   let round=2u32;if DwmSetWindowAttribute(hwnd,33,&round,4)==0{if existing!=0{SetWindowRgn(hwnd,std::ptr::null_mut(),1);SetWindowPos(hwnd,std::ptr::null_mut(),0,0,0,0,0x37);}DeleteObject(old);return;}
   if IsZoomed(hwnd)!=0{if existing!=0{SetWindowRgn(hwnd,std::ptr::null_mut(),1);}DeleteObject(old);return;}
   let mut rect=Rect{left:0,top:0,right:0,bottom:0};if GetWindowRect(hwnd,&mut rect)==0{DeleteObject(old);return;}let width=rect.right-rect.left;let height=rect.bottom-rect.top;if width<=0||height<=0{DeleteObject(old);return;}
   let diameter=(24.0*GetDpiForWindow(hwnd).max(96) as f64/96.0).round() as i32;let rounded=CreateRoundRectRgn(0,0,width+1,height+1,diameter,diameter);if !rounded.is_null(){if existing!=0&&EqualRgn(old,rounded)!=0{DeleteObject(rounded);}else if SetWindowRgn(hwnd,rounded,1)==0{DeleteObject(rounded);}}DeleteObject(old);
  }
 }
}
// The opaque home window must never retain the startup animation's cloak,
// temporary layered alpha or a reader-shaped native region after resizing.
pub fn restore_home_surface(window:&tauri::WebviewWindow){
 if window.label()!="main"{return;}
 configure_home_frame(window);
 #[cfg(windows)] unsafe{
  use std::ffi::c_void;
  #[link(name="user32")] extern "system"{fn GetWindowLongW(hwnd:*mut c_void,index:i32)->i32;fn SetWindowLongW(hwnd:*mut c_void,index:i32,value:i32)->i32;fn SetLayeredWindowAttributes(hwnd:*mut c_void,key:u32,alpha:u8,flags:u32)->i32;fn SetWindowRgn(hwnd:*mut c_void,region:*mut c_void,redraw:i32)->i32;fn SetWindowPos(hwnd:*mut c_void,after:*mut c_void,x:i32,y:i32,width:i32,height:i32,flags:u32)->i32;}
  #[link(name="dwmapi")] extern "system"{fn DwmSetWindowAttribute(hwnd:*mut c_void,attribute:u32,value:*const u32,size:u32)->i32;}
  if let Ok(handle)=window.hwnd(){let hwnd=handle.0 as *mut c_void;let cloak=0;DwmSetWindowAttribute(hwnd,13,&cloak,4);let style=GetWindowLongW(hwnd,-20);if style&0x80000!=0{SetLayeredWindowAttributes(hwnd,0,255,2);SetWindowLongW(hwnd,-20,style&!0x80000);}SetWindowRgn(hwnd,std::ptr::null_mut(),1);SetWindowPos(hwnd,std::ptr::null_mut(),0,0,0,0,0x37);}
 }
 round_home_frame(window);
}
/// v1.0.6: the home window must never stay half-faded. If a fade-out ended without the native hide
/// (hide failed, or a game exit raced the transition), clear the layered alpha whenever it is used again.
pub fn ensure_home_opaque(window:&tauri::WebviewWindow){
 if window.label()!="main"{return;}
 #[cfg(windows)] unsafe{
  use std::ffi::c_void;
  #[link(name="user32")]extern "system"{fn GetWindowLongW(hwnd:*mut c_void,index:i32)->i32;}
  if let Ok(handle)=window.hwnd(){if GetWindowLongW(handle.0 as *mut c_void,-20)&0x80000==0{return;}}else{return;}
 }
 restore_home_surface(window);
}
#[cfg(test)] mod tests{
 use super::*;
 #[test] fn missing_or_invalid_preference_defaults_to_tray_without_service(){let folder=std::env::temp_dir().join(format!("tome-policy-{}",std::process::id()));std::fs::create_dir_all(folder.join("data")).unwrap();assert!(close_to_tray(&folder));std::fs::write(folder.join("data/preferences.json"),b"{invalid").unwrap();assert!(close_to_tray(&folder));std::fs::remove_dir_all(folder).unwrap();}
 #[test] fn close_preference_reads_saved_false_and_true_directly(){let folder=std::env::temp_dir().join(format!("tome-policy-values-{}",std::process::id()));std::fs::create_dir_all(folder.join("data")).unwrap();std::fs::write(folder.join("data/preferences.json"),b"{\"closeToTray\":false}").unwrap();assert!(!close_to_tray(&folder));std::fs::write(folder.join("data/preferences.json"),b"{\"closeToTray\":true}").unwrap();assert!(close_to_tray(&folder));std::fs::remove_dir_all(folder).unwrap();}
}
