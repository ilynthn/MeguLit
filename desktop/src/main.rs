// SPDX-License-Identifier: GPL-3.0-or-later
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod broker;
mod runtime_setup;
mod single_instance;
mod clipboard;
#[tauri::command]
fn read_clipboard()->Result<String,String>{clipboard::read()}
mod window_policy;
mod window_memory;
mod home_transition;
mod tray_menu;
mod hot_assets;
#[cfg(windows)]
mod reader_pointer;
use serde_json::{json, Value};
use std::{path::PathBuf, process::Command, sync::atomic::{AtomicBool, Ordering}};
use tauri::{Emitter, Manager, State, WindowEvent, tray::{TrayIconBuilder, TrayIconEvent, MouseButtonState, MouseButton}};
use tauri_plugin_dialog::DialogExt;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

struct DesktopState { root: PathBuf, exiting: AtomicBool, headless: bool, splash: Option<PathBuf>, window_memory:window_memory::WindowMemory,reader_background:AtomicBool,home_transition:home_transition::HomeTransition }
struct TrayItems { language:std::sync::Mutex<String> }

// Open the provider's own dialog, including its verification and QR flow.
const MOJI_OPEN_SIGN_IN:&str=r#"
if (window.top === window && location.origin === 'https://www.mojidict.com' && location.pathname === '/') {
  const openSignIn = () => {
    const label = document.querySelector('.header-user .login-text');
    if (!label || !['登录/注册','登录MOJi/注册'].includes(label.textContent.trim()) || !label.getClientRects().length) return false;
    label.click();
    return true;
  };
  const start = () => {
    if (openSignIn()) return;
    const observer = new MutationObserver(() => { if (openSignIn()) observer.disconnect(); });
    observer.observe(document.body, {subtree:true, childList:true});
    setTimeout(() => observer.disconnect(), 10000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
}
"#;

#[tauri::command]
async fn moji_login(window:tauri::WebviewWindow)->Result<(),String>{
    if window.label()!="main"{return Err("INVALID_HOME_WINDOW".into());}
    let app=window.app_handle();
    if let Some(login)=app.get_webview_window("moji-login"){
        login.show().map_err(|e|e.to_string())?;
        return login.set_focus().map_err(|e|e.to_string());
    }
    let url="https://www.mojidict.com/".parse().map_err(|_|"INVALID_MOJI_URL".to_string())?;
    tauri::WebviewWindowBuilder::new(app,"moji-login",tauri::WebviewUrl::External(url))
        .title("MOJi 辞書 · 官方扫码登录")
        .inner_size(920.0,720.0).min_inner_size(620.0,500.0).center()
        .data_directory(app.state::<DesktopState>().root.join("cache/moji-web-profile"))
        .initialization_script(MOJI_OPEN_SIGN_IN)
        .on_navigation(|url|url.scheme()=="https"&&matches!(url.host_str(),Some("www.mojidict.com"|"www2.mojidict.com"|"mojidict.com"|"open.weixin.qq.com")))
        .on_new_window(|_,_|tauri::webview::NewWindowResponse::Deny)
        .build().map_err(|e|e.to_string())?;
    Ok(())
}

/// 学习 → 五十音 → 汉字读音：在独立窗口里打开《漢字でGO!》官方网页（PLiCy），不改动、不缓存页面内容。
#[tauri::command]
async fn kanji_go_open(window:tauri::WebviewWindow)->Result<(),String>{
    if window.label()!="main"{return Err("INVALID_HOME_WINDOW".into());}
    let app=window.app_handle();
    if let Some(existing)=app.get_webview_window("kanji-go"){
        existing.show().map_err(|e|e.to_string())?;
        return existing.set_focus().map_err(|e|e.to_string());
    }
    let url="https://plicy.net/GamePlay/155561".parse().map_err(|_|"INVALID_KANJI_GO_URL".to_string())?;
    tauri::WebviewWindowBuilder::new(app,"kanji-go",tauri::WebviewUrl::External(url))
        .title("漢字でGO!（Micelle · PLiCy）· 外部网站")
        .inner_size(1180.0,800.0).min_inner_size(720.0,520.0).center()
        .data_directory(app.state::<DesktopState>().root.join("cache/kanji-go-profile"))
        .on_navigation(|url|url.scheme()=="https"&&url.host_str().is_some_and(|h|h=="plicy.net"||h.ends_with(".plicy.net")))
        .on_new_window(|_,_|tauri::webview::NewWindowResponse::Deny)
        .build().map_err(|e|e.to_string())?;
    Ok(())
}

/// 学习 → 五十音 → 汉字读音：原样显示 PLiCy 官方整页（含广告与署名）。
/// 不往主窗口里加第二个网页（那样主窗口就不再是普通窗口，标题栏按钮和页面命令会失效），
/// 而是开一个无边框、归 MeguLit 所有的小窗口，精确贴在页面里的边框上；主窗口移动、缩放时由页面通知跟随。
fn kanji_log(root:&std::path::Path,line:&str){use std::io::Write;if let Ok(mut f)=std::fs::OpenOptions::new().create(true).append(true).open(root.join("logs/kanji-embed.log")){let _=writeln!(f,"{:?} {}",std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d|d.as_millis()).unwrap_or(0),line);}}
#[tauri::command]
async fn kanji_go_embed(window:tauri::WebviewWindow,x:f64,y:f64,width:f64,height:f64,zoom:Option<f64>)->Result<(),String>{
    if window.label()!="main"{return Err("INVALID_HOME_WINDOW".into());}
    let app=window.app_handle().clone();let root=app.state::<DesktopState>().root.clone();
    let scale=window.scale_factor().map_err(|e|e.to_string())?;
    let origin=window.inner_position().map_err(|e|e.to_string())?;
    let position=tauri::PhysicalPosition::new(origin.x+(x*scale).round() as i32,origin.y+(y*scale).round() as i32);
    let size=tauri::PhysicalSize::new((width.max(160.0)*scale).round() as u32,(height.max(120.0)*scale).round() as u32);
    let zoom=zoom.unwrap_or(1.0).clamp(0.75,2.0);
    let embed=match app.get_webview_window("kanji-go-embed"){
        Some(existing)=>existing,
        None=>{
            let url="https://plicy.net/GamePlay/155561".parse().map_err(|_|"INVALID_KANJI_GO_URL".to_string())?;
            let built=tauri::WebviewWindowBuilder::new(&app,"kanji-go-embed",tauri::WebviewUrl::External(url))
                .title("漢字でGO!（PLiCy · 外部网站）")
                .decorations(false).resizable(false).skip_taskbar(true).shadow(false).visible(false).focused(false)
                .parent(&window).map_err(|e|e.to_string())?
                .data_directory(root.join("cache/kanji-go-profile"))
                .on_navigation(|url|url.scheme()=="https"&&url.host_str().is_some_and(|h|h=="plicy.net"||h.ends_with(".plicy.net")))
                .on_new_window(|_,_|tauri::webview::NewWindowResponse::Deny)
                .build();
            kanji_log(&root,&format!("create -> {:?}",built.as_ref().map(|_|())));
            built.map_err(|e|e.to_string())?
        }
    };
    let result=embed.set_size(size).and_then(|_|embed.set_position(position)).and_then(|_|embed.set_zoom(zoom)).and_then(|_|embed.show());
    kanji_log(&root,&format!("place {}x{} at {},{} zoom {zoom} -> {result:?}",size.width,size.height,position.x,position.y));
    result.map_err(|e|e.to_string())
}

/// 离开「汉字读音」页面：关闭贴着的小窗口（回来时重新打开）。
#[tauri::command]
async fn kanji_go_hide(app:tauri::AppHandle)->Result<(),String>{
    if let Some(embed)=app.get_webview_window("kanji-go-embed"){
        let root=app.state::<DesktopState>().root.clone();let closed=embed.close();kanji_log(&root,&format!("close -> {closed:?}"));
    }
    Ok(())
}

/// 关于 → 更新：更新脚本已在后台等待，主窗口发起退出，让脚本替换程序文件。
// Hot update (services/hot-update.cjs): not while a game is being read, since the service restart would drop it. With
// dry_run the caller only asks whether now is fine; otherwise the service restarts and every MeguLit page reloads.
#[tauri::command]
async fn hot_reload(app:tauri::AppHandle,dry_run:Option<bool>)->Result<bool,String>{
    if let Some(reader)=app.get_webview_window("reader"){if reader.is_visible().unwrap_or(false){return Err("READER_OPEN".into());}}
    if dry_run==Some(true){return Ok(true);}
    let root=app.state::<DesktopState>().root.clone();
    let on=hot_assets::refresh(&root);
    tauri::async_runtime::spawn_blocking(broker::shutdown).await.map_err(|e|e.to_string())?;
    for label in ["reader","tray-menu","main"]{if let Some(window)=app.get_webview_window(label){let _=window.eval("location.reload()");}}
    Ok(on)
}
#[tauri::command]
fn app_exit_for_update(window:tauri::WebviewWindow){
    if window.label()!="main"{return;}
    let app=window.app_handle();app.state::<DesktopState>().exiting.store(true,Ordering::SeqCst);app.exit(0);
}

#[tauri::command]
async fn reader_open(app:tauri::AppHandle,background:Option<bool>)->Result<(),String>{
    reader_log(&app.state::<DesktopState>().root,"open-request","");
    if let Some(window)=app.get_webview_window("reader"){if background!=Some(true){app.state::<DesktopState>().reader_background.store(false,Ordering::SeqCst);window.show().map_err(|e|e.to_string())?;}return Ok(());}
    let state=app.state::<DesktopState>();
    state.reader_background.store(background==Some(true),Ordering::SeqCst);
    tauri::WebviewWindowBuilder::new(&app,"reader",tauri::WebviewUrl::App("reader/index.html".into()))
        .title("MeguLit tools").inner_size(1000.0,700.0).decorations(false).shadow(false).resizable(false).transparent(true).background_color(tauri::utils::config::Color(0,0,0,0)).visible(false).skip_taskbar(true)
        .data_directory(state.root.join("cache/webview-profile"))
        .initialization_script("document.addEventListener('contextmenu',event=>event.preventDefault(),true);")
        .build().map_err(|e|{reader_log(&state.root,"window-create-failed",&e.to_string());e.to_string()})
        .map(|w|window_policy::no_accent_border(&w))?;reader_log(&state.root,"window-created","");Ok(())
}

#[tauri::command]
async fn reader_connect(window:tauri::WebviewWindow,state:State<'_,DesktopState>)->Result<Value,String>{
    if window.label()!="reader"{return Err("INVALID_READER_WINDOW".into());}
    #[cfg(windows)] let hwnd=(window.hwnd().map_err(|e|e.to_string())?.0 as usize).to_string();
    #[cfg(not(windows))] let hwnd=String::from("0");
    reader_log(&state.root,"connect-request","");
    let root=state.root.clone();let result=tauri::async_runtime::spawn_blocking(move||run_service(root,json!({"action":"reader_attach","pid":std::process::id(),"hwnd":hwnd}))).await.map_err(|e|e.to_string())??;
    reader_log(&state.root,"native-attached","");
    if !state.reader_background.load(Ordering::SeqCst){window.show().map_err(|e|e.to_string())?;}Ok(result)
}

fn reader_log(root:&std::path::Path,phase:&str,error:&str){use std::io::Write;let _=std::fs::create_dir_all(root.join("logs"));if let Ok(mut file)=std::fs::OpenOptions::new().create(true).append(true).open(root.join("logs/reader-native.log")){let _=writeln!(file,"{}",json!({"phase":phase,"error":error,"pid":std::process::id()}));}}
#[tauri::command]
async fn reader_restart(app:tauri::AppHandle)->Result<(),String>{let root=app.state::<DesktopState>().root.clone();tauri::async_runtime::spawn_blocking(move||run_service(root,json!({"action":"reader_detach"}))).await.map_err(|e|e.to_string())??;if let Some(window)=app.get_webview_window("reader"){window.eval("location.reload()").map_err(|e|e.to_string())?;Ok(())}else{reader_open(app,Some(true)).await}}

#[tauri::command]
async fn pick_executable(app:tauri::AppHandle,directory:Option<String>) -> Result<Option<String>,String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut picker=app.dialog().file().add_filter("Game",&["exe"]);
        if let Some(folder)=directory.map(PathBuf::from).filter(|folder|folder.is_absolute()){
            if let Some(existing)=folder.ancestors().find(|part|part.is_dir()){picker=picker.set_directory(existing);}
        }
        picker.blocking_pick_file().map(|p|p.into_path().map(|v|v.to_string_lossy().to_string()).map_err(|e|e.to_string())).transpose()
    }).await.map_err(|e|e.to_string())?
}

// E280: manual patch pick. The title says which file to choose; any file type is accepted (the picked file's folder is read).
#[tauri::command]
async fn pick_patch_file(app:tauri::AppHandle,title:String,directory:Option<String>) -> Result<Option<String>,String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut picker=app.dialog().file().set_title(title);
        if let Some(folder)=directory.map(PathBuf::from).filter(|folder|folder.is_absolute()){
            if let Some(existing)=folder.ancestors().find(|part|part.is_dir()){picker=picker.set_directory(existing);}
        }
        picker.blocking_pick_file().map(|p|p.into_path().map(|v|v.to_string_lossy().to_string()).map_err(|e|e.to_string())).transpose()
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
async fn pick_image(app:tauri::AppHandle) -> Result<Option<String>,String> {
    tauri::async_runtime::spawn_blocking(move || app.dialog().file().add_filter("Image",&["png","jpg","jpeg","jfif","jpe","webp","gif","bmp","avif"]).blocking_pick_file().map(|p|p.into_path().map(|v|v.to_string_lossy().to_string()).map_err(|e|e.to_string())).transpose()).await.map_err(|e|e.to_string())?
}

#[tauri::command]
async fn pick_directories(app:tauri::AppHandle,multiple:Option<bool>)->Result<Vec<String>,String>{
    tauri::async_runtime::spawn_blocking(move||{
        let picker=app.dialog().file();let selected=if multiple==Some(true){picker.blocking_pick_folders()}else{picker.blocking_pick_folder().map(|p|vec![p])};
        selected.unwrap_or_default().into_iter().map(|p|p.into_path().map(|p|p.to_string_lossy().to_string()).map_err(|e|e.to_string())).collect::<Result<Vec<_>,_>>()
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
async fn pick_backup(app:tauri::AppHandle,save:bool)->Result<Option<String>,String>{
    tauri::async_runtime::spawn_blocking(move||{let picker=app.dialog().file().add_filter("MeguLit backup",&["megulitbak","tomebak"]);let value=if save{picker.set_file_name("MeguLit.megulitbak").blocking_save_file()}else{picker.blocking_pick_file()};value.map(|p|p.into_path().map(|v|v.to_string_lossy().to_string()).map_err(|e|e.to_string())).transpose()}).await.map_err(|e|e.to_string())?
}

#[tauri::command]
fn set_tray_language(language:String,app:tauri::AppHandle) -> Result<(),String> {
    if let Some(items)=app.try_state::<TrayItems>() { *items.language.lock().map_err(|e|e.to_string())?=language; }
    Ok(())
}

fn root_directory() -> PathBuf {
    if let Some(root) = std::env::var_os("MEGULIT_ROOT").or_else(||std::env::var_os("TOME_FINAL_ROOT")) { return root.into(); }
    let executable = std::env::current_exe().expect("Executable path unavailable");
    let parent = executable.parent().unwrap();
    if parent.join("services").is_dir() { return parent.into(); }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().into()
}

fn run_service(root: PathBuf, request: Value) -> Result<Value, String> { broker::request(root,request) }

#[tauri::command]
async fn service(request: Value, state: State<'_, DesktopState>) -> Result<Value, String> {
    let root = state.root.clone();
    let anki_open = request.get("action").and_then(|v| v.as_str()) == Some("anki_open");
    let mut result = tauri::async_runtime::spawn_blocking(move || run_service(root, request)).await.map_err(|e| e.to_string())??;
    // E215.9 (user: Anki's add-ons window never appeared): only the process that holds the foreground may hand it on,
    // and after the click that is MeguLit itself. So this window process brings Anki forward and presses Anki's own
    // shortcut (Ctrl+Shift+A add-ons; on a deck overview O options, C custom study).
    #[cfg(windows)]
    if anki_open {
        let shortcut = result.get("shortcut").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let focused = tauri::async_runtime::spawn_blocking(move || anki_focus(&shortcut)).await.unwrap_or(false);
        if let Some(object) = result.as_object_mut() { object.insert("focused".into(), Value::Bool(focused)); }
    }
    Ok(result)
}

#[cfg(windows)]
fn anki_focus(shortcut: &str) -> bool {
    use std::ffi::c_void;
    #[link(name="user32")] extern "system" {
        fn EnumWindows(callback: extern "system" fn(*mut c_void, isize) -> i32, param: isize) -> i32;
        fn GetWindowTextW(h: *mut c_void, text: *mut u16, max: i32) -> i32;
        fn GetClassNameW(h: *mut c_void, text: *mut u16, max: i32) -> i32;
        fn IsWindowVisible(h: *mut c_void) -> i32;
        fn GetWindow(h: *mut c_void, cmd: u32) -> *mut c_void;
        fn ShowWindow(h: *mut c_void, cmd: i32) -> i32;
        fn IsIconic(h: *mut c_void) -> i32;
        fn SetForegroundWindow(h: *mut c_void) -> i32;
        fn GetForegroundWindow() -> *mut c_void;
        fn keybd_event(key: u8, scan: u8, flags: u32, extra: usize);
    }
    extern "system" fn visit(h: *mut c_void, found: isize) -> i32 {
        unsafe {
            if IsWindowVisible(h) == 0 || !GetWindow(h, 4).is_null() { return 1; }
            let mut class = [0u16; 128]; let n = GetClassNameW(h, class.as_mut_ptr(), 128).max(0) as usize;
            if !String::from_utf16_lossy(&class[..n]).starts_with("Qt") { return 1; }
            let mut title = [0u16; 256]; let n = GetWindowTextW(h, title.as_mut_ptr(), 256).max(0) as usize;
            let title = String::from_utf16_lossy(&title[..n]);
            if title == "Anki" || title.ends_with(" - Anki") { *(found as *mut *mut c_void) = h; return 0; }
            1
        }
    }
    let mut window: *mut c_void = std::ptr::null_mut();
    // Anki may still be showing its window or switching to the deck; give it up to a second.
    for _ in 0..10 {
        unsafe { EnumWindows(visit, &mut window as *mut *mut c_void as isize); }
        if !window.is_null() { break; }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    if window.is_null() { return false; }
    unsafe {
        if IsIconic(window) != 0 { ShowWindow(window, 9); }
        SetForegroundWindow(window);
        std::thread::sleep(std::time::Duration::from_millis(250));
        if GetForegroundWindow() != window { return false; }
        let press = |keys: &[u8]| { for k in keys { keybd_event(*k, 0, 0, 0); } for k in keys.iter().rev() { keybd_event(*k, 0, 2, 0); } };
        match shortcut { "addons" => press(&[0x11, 0x10, 0x41]), "options" => press(&[0x4F]), "custom" => press(&[0x43]), _ => {} }
    }
    true
}

fn hide_home(app:&tauri::AppHandle)->Result<(),String>{
    let state=app.state::<DesktopState>();
    if let Some(flag)=&state.splash{let _=std::fs::write(format!("{}.suppressed",flag.display()),"1");}
    if let Some(home)=app.get_webview_window("main"){
        let taskbar=home.set_skip_taskbar(true);
        let _=home.set_always_on_top(false);home.hide().map_err(|e|e.to_string())?;
        window_policy::hide_home_surface(&home)?;
        reader_log(&state.root,"home-hidden",if home.is_visible().unwrap_or(true){"HOME_STILL_VISIBLE"}else{""});
        taskbar.map_err(|e|e.to_string())?;
    }
    Ok(())
}
fn begin_home_exit(app:&tauri::AppHandle)->Result<(),String>{
    let Some(home)=app.get_webview_window("main")else{return Ok(());};
    if !home.is_visible().map_err(|e|e.to_string())?{return hide_home(app);}
    let Some(ticket)=app.state::<DesktopState>().home_transition.begin()else{return Ok(());};
    reader_log(&app.state::<DesktopState>().root,"home-exit-request","");
    animate_home(app.clone(),ticket,true);
    // Native clipping includes the opaque window background, independent of JS.
    let _=app.emit("overlay-home","enter");Ok(())
}
fn toggle_home(app:&tauri::AppHandle){
    let state=app.state::<DesktopState>();
    if state.headless||state.exiting.load(Ordering::SeqCst){return;}
    let Some(home)=app.get_webview_window("main")else{return;};
    if state.home_transition.is_leaving(){return;}
    if !home.is_visible().unwrap_or(false)||home.is_minimized().unwrap_or(false){
        reveal(app);
    }else if let Err(error)=begin_home_exit(app){
        reader_log(&state.root,"home-toggle-failed",&error);
    }
}
fn animate_home(handle:tauri::AppHandle,ticket:u64,leaving:bool){
    std::thread::spawn(move||{
      for step in 0..=14{
        let ui=handle.clone();let _=handle.run_on_main_thread(move||{
            let state=ui.state::<DesktopState>();
            if state.exiting.load(Ordering::SeqCst){return;}
            // A superseded fade-in must not leave the window partly transparent: if nothing is leaving, finish opaque.
            if !state.home_transition.current(ticket){if step==14&&!leaving&&!state.home_transition.is_leaving(){if let Some(home)=ui.get_webview_window("main"){window_policy::ensure_home_opaque(&home);}}return;}
            if step==14{
              if leaving&&state.home_transition.commit(ticket){if let Err(error)=hide_home(&ui){reader_log(&state.root,"home-hide-failed",&error);if let Some(home)=ui.get_webview_window("main"){window_policy::restore_home_surface(&home);}}else{let _=ui.emit("overlay-home","hidden");}}
              if !leaving{if let Some(home)=ui.get_webview_window("main"){window_policy::restore_home_surface(&home);}}
            }else if let Some(home)=ui.get_webview_window("main"){let p=step as f64/14.0;let eased=1.0-(1.0-p).powi(3);window_policy::animate_home_surface(&home,if leaving{1.0-p*p}else{eased});}
        });
        if step<14{std::thread::sleep(std::time::Duration::from_millis(home_transition::EXIT_MILLIS/14));}
      }
    });
}

#[tauri::command]
async fn window_action(action: String, window: tauri::WebviewWindow, state: State<'_, DesktopState>) -> Result<(), String> {
    match action.as_str() {
        "ready" => {
            if window.label()=="main"&&!state.headless{state.window_memory.enable();}
            if state.headless {
                let status=json!({"host":"app.megulit","frontend":true,"visible":false});
                let _=std::fs::create_dir_all(state.root.join("validation"));
                let _=std::fs::write(state.root.join("validation/frontend-smoke.json"),serde_json::to_vec_pretty(&status).unwrap());
            } else if let Some(flag)=&state.splash {
                let flag=flag.clone();
                let _=std::fs::write(format!("{}.progress",flag.display()),"100");if window.label()=="main"{startup_mark(&state.root,"home-ready");}
                // E391 once the startup island starts fading the window in (it writes .revealed), the page plays its entrance
                let app=window.app_handle().clone();
                std::thread::spawn(move || { std::thread::sleep(std::time::Duration::from_millis(450));let _=std::fs::write(&flag,"1");
                    let revealed=std::path::PathBuf::from(format!("{}.revealed",flag.display()));
                    for _ in 0..200 {if revealed.is_file(){break;}std::thread::sleep(std::time::Duration::from_millis(25));}
                    let _=std::fs::remove_file(&revealed);let _=app.emit("home-revealed","splash"); });
            } else { window.show().map_err(|e| e.to_string())?;let _=window.app_handle().emit("home-revealed","shown"); }
        },
        "enter_overlay" => begin_home_exit(window.app_handle())?,
        "hide_home" => {state.home_transition.cancel();hide_home(window.app_handle())?;},
        "show_home" => reveal(window.app_handle()),
        "resize_nw"|"resize_ne"|"resize_sw"|"resize_se" => {if window.label()!="main"{return Err("INVALID_HOME_WINDOW".into());}if !window.is_maximized().unwrap_or(false){let name=match action.as_str(){"resize_nw"=>"NorthWest","resize_ne"=>"NorthEast","resize_sw"=>"SouthWest",_=>"SouthEast"};let direction=serde_json::from_value(json!(name)).map_err(|e|e.to_string())?;let native:&tauri::Webview<tauri::Wry>=window.as_ref();native.window().start_resize_dragging(direction).map_err(|e|e.to_string())?;}},
        "minimize" => window.minimize().map_err(|e| e.to_string())?,
        // 2026-11-13 Anki review: immersive full screen (Esc in the page leaves it)
        // (user 2026-11-13: F made the whole MeguLit vanish) Tao's set_fullscreen on this borderless window whose HWND the
        // StartupIsland showed outside Tao applied a hide with the change. Instead: make Tao see the window as visible, then
        // cover the current monitor by hand and put back the saved rect on leave. Never hides; errors go to page full screen.
        "fullscreen_on"|"fullscreen_off" => {if window.label()!="main"{return Err("INVALID_HOME_WINDOW".into());}fill_monitor(&window,action=="fullscreen_on")?;},
        // StartupIsland shows the HWND outside Tao. Synchronize Tao's VISIBLE flag
        // before changing MAXIMIZED; otherwise apply_diff maximizes then hides the
        // window, and a subsequent show exposes only the final rectangle.
        "maximize" => {window_policy::restore_home_surface(&window);window.show().map_err(|e|e.to_string())?;if window.is_minimized().unwrap_or(false){window.unminimize().map_err(|e|e.to_string())?;}if window.is_maximized().unwrap_or(false) { window.unmaximize() } else { window.maximize() }.map_err(|e| e.to_string())?;},
        "close" => {
            let native:&tauri::Webview<tauri::Wry>=window.as_ref();state.window_memory.capture(&native.window());
            state.window_memory.flush();
            window.hide().map_err(|e|e.to_string())?;
            if !window_policy::close_to_tray(&state.root) { state.exiting.store(true, Ordering::SeqCst); window.app_handle().exit(0); }
        },
        "exit" => { state.exiting.store(true, Ordering::SeqCst); window.app_handle().exit(0); },
        _ => return Err("Unknown window action".into()),
    }
    Ok(())
}

static FULL_RESTORE:std::sync::Mutex<Option<(tauri::PhysicalPosition<i32>,tauri::PhysicalSize<u32>,bool)>>=std::sync::Mutex::new(None);
fn fill_monitor(window:&tauri::WebviewWindow,on:bool)->Result<(),String>{
    window_policy::restore_home_surface(window);window.show().map_err(|e|e.to_string())?;
    if window.is_minimized().unwrap_or(false){window.unminimize().map_err(|e|e.to_string())?;}
    let mut saved=FULL_RESTORE.lock().map_err(|_|"FULLSCREEN_LOCK".to_string())?;
    let result=(||->Result<(),String>{
        if on {
            if saved.is_none(){*saved=Some((window.outer_position().map_err(|e|e.to_string())?,window.outer_size().map_err(|e|e.to_string())?,window.is_maximized().unwrap_or(false)));}
            let monitor=match window.current_monitor().map_err(|e|e.to_string())?{Some(m)=>m,None=>window.primary_monitor().map_err(|e|e.to_string())?.ok_or("NO_MONITOR")?};
            if window.is_maximized().unwrap_or(false){window.unmaximize().map_err(|e|e.to_string())?;}
            window.set_position(tauri::Position::Physical(*monitor.position())).map_err(|e|e.to_string())?;
            window.set_size(tauri::Size::Physical(*monitor.size())).map_err(|e|e.to_string())?;
        } else if let Some((pos,size,max))=saved.take(){
            window.set_size(tauri::Size::Physical(size)).map_err(|e|e.to_string())?;window.set_position(tauri::Position::Physical(pos)).map_err(|e|e.to_string())?;
            if max{window.maximize().map_err(|e|e.to_string())?;}
        }
        Ok(())
    })();
    /* whatever happened, the window stays on screen and focused */
    let _=window.show();let _=window.set_focus();
    if result.is_err()&&on{if let Some((pos,size,max))=saved.take(){let _=window.set_size(tauri::Size::Physical(size));let _=window.set_position(tauri::Position::Physical(pos));if max{let _=window.maximize();}}}
    result
}

// Closing a game asks for the home window several times within a few hundred milliseconds; each call used to restart
// the entrance animation from transparent, which showed as a flash (user, E215.3). Repeats within 800 ms only make sure
// the window is shown and focused.
static LAST_REVEAL:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
fn reveal(app: &tauri::AppHandle) {
    let now=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d|d.as_millis() as u64).unwrap_or(0);
    let last=LAST_REVEAL.swap(now,Ordering::SeqCst);
    if let Some(flag)=&app.state::<DesktopState>().splash{let _=std::fs::write(format!("{}.suppressed",flag.display()),"0");}
    if let Some(window) = app.get_webview_window("main") { let was_visible=window.is_visible().unwrap_or(false)&&!window.is_minimized().unwrap_or(false);
        // v1.1.1 (home stayed half transparent after a game closed): closing a game reveals home twice in a row. The second
        // reveal used to cancel the first one's fade-in and then return early, freezing the window at partial alpha.
        // A repeated reveal now leaves a running fade-in alone; only a pending exit is cancelled.
        if was_visible&&!app.state::<DesktopState>().home_transition.is_leaving()&&now.saturating_sub(last)<800{let _=window.set_focus();return;}
        let reversing=app.state::<DesktopState>().home_transition.cancel();let _=window.set_skip_taskbar(false);let _=window.set_always_on_top(false);window_policy::restore_home_surface(&window);let _ = window.unminimize();if !was_visible||reversing{let _=app.emit("overlay-home","return");}if !was_visible||reversing{window_policy::animate_home_surface(&window,0.01);}let _ = window.show();let _ = window.set_focus();if !was_visible||reversing{animate_home(app.clone(),app.state::<DesktopState>().home_transition.generation(),false);}if !was_visible{reader_log(&app.state::<DesktopState>().root,"home-shown","");} }
}

// E384 startup timeline: one line per stage with the time since launch, so a slow start says which step waited.
static STARTED:std::sync::OnceLock<std::time::Instant>=std::sync::OnceLock::new();
fn startup_mark(root:&std::path::Path,label:&str){
    let since=STARTED.get_or_init(std::time::Instant::now).elapsed().as_millis();
    let file=root.join(if std::env::args().any(|a|a=="--headless-check"){"logs/startup-timeline-headless.log"}else{"logs/startup-timeline.log"});let _=std::fs::create_dir_all(root.join("logs"));
    if std::fs::metadata(&file).map(|m|m.len()>256*1024).unwrap_or(false){let _=std::fs::remove_file(&file);}
    let now=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d|d.as_millis()).unwrap_or(0);
    use std::io::Write;if let Ok(mut f)=std::fs::OpenOptions::new().create(true).append(true).open(&file){let _=writeln!(f,"{now} +{since}ms pid={} {label}",std::process::id());}
}
fn prepare_profile(root:&std::path::Path,profile:&std::path::Path) {
    let checkpoint=root.join("migration/baseline-20261103/webview-local-storage");
    let destination=profile.join("EBWebView/Default/Local Storage/leveldb");
    if !destination.exists() && checkpoint.is_dir() {
        let _=std::fs::create_dir_all(&destination);
        if let Ok(entries)=std::fs::read_dir(checkpoint) {for entry in entries.flatten() {
            if entry.path().is_file() && entry.file_name()!="LOCK" {let _=std::fs::copy(entry.path(),destination.join(entry.file_name()));}
        }}
    }
}

fn main() {
    STARTED.get_or_init(std::time::Instant::now);
    let root = root_directory();
    if std::env::args().any(|arg|arg=="--home-window-self-test"){
        let result=window_policy::native_hide_self_test();let _=std::fs::create_dir_all(root.join("validation"));
        let _=std::fs::write(root.join("validation/home-native-hide.json"),serde_json::to_vec_pretty(&json!({"ok":result.is_ok(),"error":result.as_ref().err(),"scope":"native hide on an isolated offscreen HWND, not game acceptance"})).unwrap());std::process::exit(if result.is_ok(){0}else{1});
    }
    if std::env::args().any(|arg|arg=="--service-self-test"){
        let home=run_service(root.clone(),json!({"action":"home"}));let settings=run_service(root.clone(),json!({"action":"settings_get"}));let models=run_service(root.clone(),json!({"action":"model_status"}));
        let status=json!({"nativeBroker":true,"home":home.is_ok(),"settings":settings.is_ok(),"models":models.is_ok(),"settingsGroups":settings.ok().and_then(|v|v["groups"].as_array().map(|a|a.len())),"visibleWindows":false,"gameHooksStarted":false});
        let _=std::fs::write(root.join("validation/service-host-check.json"),serde_json::to_vec_pretty(&status).unwrap());broker::shutdown();if status["home"]!=true||status["settings"]!=true||status["models"]!=true{std::process::exit(1);}return;
    }
    let control=if std::env::args().any(|arg|arg=="--stop-instance"){Some("exit")}else{None};
    let isolated=std::env::args().any(|arg|arg=="--headless-check"||arg=="--headless-ui-check");
    let _instance_lease=if isolated{None}else{match single_instance::acquire(&root,control){Ok(single_instance::Acquisition::Owner(lease))=>{if control.is_none()&&std::env::var("MEGULIT_SIDE_BY_SIDE").map(|v|v!="1").unwrap_or(true){single_instance::retire_other_installations(&root);}Some(lease)},Ok(_)=>return,Err(error)=>{let _=std::fs::create_dir_all(root.join("logs"));let _=std::fs::write(root.join("logs/instance-error.log"),error);return;}}};
    startup_mark(&root,"process-start");
    if !isolated&&!runtime_setup::ensure(&root){return;}
    startup_mark(&root,"runtime-ready");
    let diagnostic_root=root.clone();
    std::panic::set_hook(Box::new(move |info| {
        let _=std::fs::create_dir_all(diagnostic_root.join("logs"));
        let _=std::fs::write(diagnostic_root.join("logs/native-startup-error.log"),info.to_string());
    }));
    let ui_check = std::env::args().any(|arg| arg == "--headless-ui-check");
    let headless = ui_check || std::env::args().any(|arg| arg == "--headless-check");
    let cache=root.join("cache");let _=std::fs::create_dir_all(&cache);
    let profile=cache.join(if headless {"smoke-profile"}else{"webview-profile"});
    prepare_profile(&root,&profile);
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER",&profile);
    // E390 WebView2's own log is opt-in (MEGULIT_WEBVIEW_LOG=1): --enable-logging also opens a console window on Windows,
    // which 1.3.1 showed beside MeguLit. MEGULIT_WEBVIEW_ARGS adds arguments for comparison tests. The variable replaces
    // Tauri's default browser arguments, so they are repeated; every window shares one set of arguments.
    {let log_on=std::env::var("MEGULIT_WEBVIEW_LOG").map(|v|v=="1").unwrap_or(false);let extra=std::env::var("MEGULIT_WEBVIEW_ARGS").unwrap_or_default();
     if log_on||!extra.is_empty(){let log=root.join(if headless{"logs/webview2-headless.log"}else{"logs/webview2-browser.log"});let logging=if log_on{format!(" --enable-logging --log-file=\"{}\" --log-level=1",log.display())}else{String::new()};std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",format!("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection{logging} {extra}"));}}
    let mut context=tauri::generate_context!();
    for window in &mut context.config_mut().app.windows {window.data_directory=Some(profile.clone());window.create=false;}
    hot_assets::wrap(&mut context,&root);
    let splash=if !headless && root.join("native/StartupIsland.exe").is_file() {
        let flag=cache.join(format!("splash-{}.flag",std::process::id()));
        let preferences=run_service(root.clone(),json!({"action":"preferences"})).unwrap_or(json!({}));
        let mut command=Command::new(root.join("native/StartupIsland.exe"));
        command.arg(&flag).arg(preferences["language"].as_str().unwrap_or("zh")).arg(preferences["accent"].as_str().unwrap_or("#ad1539"));
        #[cfg(windows)] command.creation_flags(0x08000000);
        startup_mark(&root,"splash-start");if command.spawn().is_ok() {let _=std::fs::write(format!("{}.pid",flag.display()),std::process::id().to_string());let _=std::fs::write(format!("{}.progress",flag.display()),"20");Some(flag)}else{None}
    }else{None};
    let window_memory=window_memory::WindowMemory::new(&root);
    let state = DesktopState { root, exiting: AtomicBool::new(false), headless, splash,window_memory,reader_background:AtomicBool::new(true),home_transition:home_transition::HomeTransition::default() };
    tauri::Builder::default().manage(state).plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![service, tray_menu::tray_menu_action, window_action, pick_executable, pick_patch_file, pick_image, pick_directories, pick_backup, set_tray_language, reader_open, reader_connect, reader_restart, read_clipboard, moji_login, kanji_go_open, kanji_go_embed, kanji_go_hide, app_exit_for_update, hot_reload])
        .setup(move |app| {
            broker::attach(app.handle().clone());
            if !headless{single_instance::watch(app.handle().clone(),app.state::<DesktopState>().root.clone());}
            let state=app.state::<DesktopState>();
            let _=std::fs::create_dir_all(state.root.join("logs"));
            let stage=state.root.join("logs/native-startup-stage.log");
            let _=std::fs::write(&stage,"creating hidden WebView");startup_mark(&state.root,"webview-build-start");
            let mut config=app.config().app.windows[0].clone();
            if !headless{
                let mut saved=state.window_memory.snapshot();
                if let Some(monitor)=app.primary_monitor()?{let scale=monitor.scale_factor();let area=monitor.work_area();saved.fit(area.size.width as f64/scale,area.size.height as f64/scale);}
                config.width=saved.width;config.height=saved.height;config.maximized=saved.maximized;config.center=true;
                state.window_memory.prepare(saved);
            }
            tauri::WebviewWindowBuilder::from_config(app,&config)?.data_directory(profile.clone()).visible(false).shadow(false)
                .initialization_script("document.addEventListener('contextmenu',function(event){event.preventDefault();},true);")
                .build()
                .map_err(|error| {let _=std::fs::write(&stage,format!("WebView creation failed: {error:?}"));error})?;
            let _=std::fs::write(&stage,"WebView created");startup_mark(&state.root,"webview-built");
            if let Some(home)=app.get_webview_window("main"){window_policy::configure_home_frame(&home);}
            if !headless {
                app.manage(TrayItems{language:std::sync::Mutex::new("zh".into())});
                tray_menu::create(app.handle())?;
                let rgba = include_bytes!("../icons/tray.rgba").to_vec();
                TrayIconBuilder::new().icon(tauri::image::Image::new_owned(rgba,32,32)).tooltip("MeguLit")
                    .show_menu_on_left_click(false)
                    .on_tray_icon_event(|tray,event| if let TrayIconEvent::Click {button,button_state:MouseButtonState::Up,position,..}=event {
                        match button {MouseButton::Left=>reveal(tray.app_handle()),MouseButton::Right=>{if let Err(error)=tray_menu::show(tray.app_handle(),position){reader_log(&tray.app_handle().state::<DesktopState>().root,"tray-menu-failed",&error);}},_=>()}
                    })
                    .build(app)?;
                let language=run_service(app.state::<DesktopState>().root.clone(),json!({"action":"preferences"})).ok().and_then(|v|v["language"].as_str().map(str::to_string)).unwrap_or_else(||"zh".into());
                let _=set_tray_language(language,app.handle().clone());
            }
            if headless && !ui_check {
                let handle=app.handle().clone();
                std::thread::spawn(move || {
                    let state=handle.state::<DesktopState>();
                    startup_mark(&state.root,"service-home-start");let result=run_service(state.root.clone(),json!({"action":"home"}));startup_mark(&state.root,"service-home-done");
                    let status=json!({"host":"app.megulit","service":result.is_ok(),"error":result.err(),"visible":false});
                    let _=std::fs::create_dir_all(state.root.join("validation"));
                    let _=std::fs::write(state.root.join("validation/desktop-smoke.json"),serde_json::to_vec_pretty(&status).unwrap());
                    let mut frontend=false;
                    for _ in 0..150 {if state.root.join("validation/frontend-smoke.json").is_file(){frontend=true;break;}std::thread::sleep(std::time::Duration::from_millis(100));}
                    state.exiting.store(true,Ordering::SeqCst);handle.exit(if status["service"]==true && frontend {0} else {1});
                });
            }
            Ok(())
        })
        .on_window_event(|window,event| {
            if window.label()=="main"&&matches!(event,WindowEvent::Resized(_)|WindowEvent::Moved(_)|WindowEvent::ScaleFactorChanged{..}){window.state::<DesktopState>().window_memory.queue_capture(window.clone());if matches!(event,WindowEvent::Resized(_)|WindowEvent::ScaleFactorChanged{..}){if let Some(home)=window.app_handle().get_webview_window("main"){window_policy::round_home_frame(&home);}}}
            // Showing, focusing or restoring the home window re-asserts its rounded corners.
            if window.label()=="main"&&matches!(event,WindowEvent::Focused(true)){if let Some(home)=window.app_handle().get_webview_window("main"){if !window.state::<DesktopState>().home_transition.is_leaving(){window_policy::ensure_home_opaque(&home);}window_policy::round_home_frame(&home);}}
            if let WindowEvent::CloseRequested { api,.. }=event {
            let state=window.state::<DesktopState>();
            if window.label()=="reader"{let root=state.root.clone();tauri::async_runtime::spawn_blocking(move||{let _=run_service(root,json!({"action":"reader_detach"}));});return;}
            if window.label()!="main"{return;}
            if !state.exiting.load(Ordering::SeqCst) {
                state.window_memory.capture(window);state.window_memory.flush();
                let close_to_tray=window_policy::close_to_tray(&state.root);
                if close_to_tray { api.prevent_close(); let _=window.hide(); }
            }
        }})
        .build(context).expect("MeguLit desktop startup failed").run(|app,event|{if matches!(event,tauri::RunEvent::Exit){app.state::<DesktopState>().window_memory.flush();broker::shutdown();}});
}
