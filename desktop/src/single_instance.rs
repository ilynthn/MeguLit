// SPDX-License-Identifier: GPL-3.0-or-later
//! One independent desktop host per installation, with local reopen/exit requests.
use std::{path::{Path,PathBuf},time::{SystemTime,UNIX_EPOCH,Duration,Instant},sync::atomic::Ordering};
use serde_json::json;
use tauri::Manager;
fn fingerprint(root:&Path)->u64{let mut h=14695981039346656037u64;for b in root.to_string_lossy().to_lowercase().bytes(){h^=b as u64;h=h.wrapping_mul(1099511628211);}h}
#[cfg(windows)]
#[link(name="kernel32")]
extern "system"{
 fn CreateMutexW(attrs:*const std::ffi::c_void,owner:i32,name:*const u16)->*mut std::ffi::c_void;
 fn OpenMutexW(access:u32,inherit:i32,name:*const u16)->*mut std::ffi::c_void;
 fn GetLastError()->u32;
 fn CloseHandle(h:*mut std::ffi::c_void)->i32;
 fn OpenProcess(access:u32,inherit:i32,pid:u32)->*mut std::ffi::c_void;
 fn TerminateProcess(h:*mut std::ffi::c_void,code:u32)->i32;
 fn WaitForSingleObject(h:*mut std::ffi::c_void,ms:u32)->u32;
 fn QueryFullProcessImageNameW(h:*mut std::ffi::c_void,flags:u32,name:*mut u16,size:*mut u32)->i32;
 fn CreateToolhelp32Snapshot(flags:u32,pid:u32)->*mut std::ffi::c_void;
 fn Process32FirstW(h:*mut std::ffi::c_void,entry:*mut ProcessEntry)->i32;
 fn Process32NextW(h:*mut std::ffi::c_void,entry:*mut ProcessEntry)->i32;
}
#[cfg(windows)]
#[repr(C)]
struct ProcessEntry{size:u32,usage:u32,pid:u32,heap:usize,module:u32,threads:u32,parent:u32,priority:i32,flags:u32,exe:[u16;260]}
/* E476 (player report 2026-11-12: could not find the first download, downloaded MeguLit again, and the new copy kept saying
   "Alt+T is taken or two MeguLit are open"): the single-instance mutex is per installation folder, so a copy in another
   folder kept running unseen (tray, closed window) with Alt+T and its helpers. The copy the player opens now wins: every
   other installation's MeguLit.exe is asked to exit through its own command file, ended if it does not within 4 s, and
   the helper programs still running from that folder (GalWindowBridge, HookBridge, node, python...) are ended too. Only
   processes whose program file lies inside another MeguLit folder (one that holds MeguLit.exe) are touched. */
#[cfg(windows)]
fn processes()->Vec<(u32,String)>{unsafe{
 let mut list=Vec::new();let snap=CreateToolhelp32Snapshot(0x2,0);if snap.is_null()||snap as isize==-1{return list;}
 let mut e:ProcessEntry=std::mem::zeroed();e.size=std::mem::size_of::<ProcessEntry>() as u32;
 let mut ok=Process32FirstW(snap,&mut e)!=0;
 while ok{let n=e.exe.iter().position(|c|*c==0).unwrap_or(260);list.push((e.pid,String::from_utf16_lossy(&e.exe[..n]).to_lowercase()));ok=Process32NextW(snap,&mut e)!=0;}
 CloseHandle(snap);list
}}
#[cfg(windows)]
fn image_of(pid:u32)->Option<PathBuf>{unsafe{
 let h=OpenProcess(0x1000,0,pid);if h.is_null(){return None;}
 let mut buffer=vec![0u16;1024];let mut size=buffer.len() as u32;let ok=QueryFullProcessImageNameW(h,0,buffer.as_mut_ptr(),&mut size)!=0;CloseHandle(h);
 if ok{Some(PathBuf::from(String::from_utf16_lossy(&buffer[..size as usize])))}else{None}
}}
#[cfg(windows)]
fn end_pid(pid:u32,wait_ms:u32)->bool{unsafe{
 let h=OpenProcess(0x0001|0x00100000,0,pid);if h.is_null(){return false;}
 if wait_ms>0&&WaitForSingleObject(h,wait_ms)==0{CloseHandle(h);return true;}
 let ended=TerminateProcess(h,1)!=0;if ended{WaitForSingleObject(h,3000);}CloseHandle(h);ended
}}
fn norm(p:&Path)->String{let s=p.to_string_lossy().replace('/',"\\").to_lowercase();s.trim_start_matches("\\\\?\\").trim_end_matches('\\').to_string()}
#[cfg(windows)]
pub fn retire_other_installations(root:&Path){
 let own=norm(&root.canonicalize().unwrap_or_else(|_|root.to_path_buf()));let me=std::process::id();
 let mut others:Vec<PathBuf>=Vec::new();
 for (pid,name) in processes(){
  if pid==me||name!="megulit.exe"{continue;}
  let Some(image)=image_of(pid)else{continue};let Some(dir)=image.parent()else{continue};
  if norm(dir)==own{continue;}
  let _=send(dir,"exit");
  let ended=end_pid(pid,4000);
  log(root,"other-installation",json!({"pid":pid,"root":dir,"ended":ended}));
  if !others.iter().any(|o|norm(o)==norm(dir)){others.push(dir.to_path_buf());}
 }
 if others.is_empty(){return;}
 std::thread::sleep(Duration::from_millis(300));
 for (pid,_) in processes(){
  if pid==me{continue;}
  let Some(image)=image_of(pid)else{continue};let path=norm(&image);
  if let Some(dir)=others.iter().find(|o|{let d=norm(o);path.starts_with(&(d+"\\"))}){let ended=end_pid(pid,0);log(root,"other-installation-helper",json!({"pid":pid,"image":image,"root":dir,"ended":ended}));}
 }
}
#[cfg(not(windows))]
pub fn retire_other_installations(_root:&Path){}
#[cfg(windows)]
pub struct Lease(*mut std::ffi::c_void);
#[cfg(windows)]
impl Drop for Lease{fn drop(&mut self){unsafe{CloseHandle(self.0);}}}
#[cfg(not(windows))]
pub struct Lease;
pub enum Acquisition{Owner(Lease),Forwarded,NotRunning}
fn command_file(root:&Path)->PathBuf{root.join("cache/desktop-command.json")}
fn send(root:&Path,command:&str)->Result<(),String>{std::fs::create_dir_all(root.join("cache")).map_err(|e|e.to_string())?;let value=json!({"command":command,"nonce":SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos().to_string()});let tmp=root.join(format!("cache/desktop-command-{}.tmp",std::process::id()));std::fs::write(&tmp,serde_json::to_vec(&value).unwrap()).map_err(|e|e.to_string())?;if command_file(root).exists(){let _=std::fs::remove_file(command_file(root));}std::fs::rename(tmp,command_file(root)).map_err(|e|e.to_string())}
// E426 A player closed MeguLit, clicked the exe again and nothing opened until a reboot: the old host still held the
// installation mutex but no longer read commands (no window, hung, or stuck while exiting), so every launch forwarded
// "show" into the void and quit. The owner now deletes each command it handles. A launch whose command is not taken
// within the grace period ends that stale host (only when its image is this same executable), logs it to
// logs/instance.log and takes ownership itself.
pub fn acquire(root:&Path,command:Option<&str>)->Result<Acquisition,String>{acquire_with(root,command,Duration::from_millis(3000))}
fn acquire_with(root:&Path,command:Option<&str>,grace:Duration)->Result<Acquisition,String>{
 for attempt in 0..2{
  if let Some(owner)=try_acquire(root,command)?{if attempt>0{log(root,"took-over",json!({}));}return Ok(owner);}
  if wait_consumed(root,grace){return Ok(Acquisition::Forwarded);}
  if command==Some("exit")||attempt==1{log(root,"stale-owner-left",json!({"command":command}));break;}
  let pid=owner_pid(root);
  let ended=match pid{Some(pid)=>end_stale(pid),None=>Err("OWNER_PID_UNKNOWN".into())};
  log(root,"stale-owner",json!({"owner":pid,"ended":ended.is_ok(),"error":ended.as_ref().err()}));
  let _=std::fs::remove_file(command_file(root));
  if ended.is_err(){break;}
  let deadline=Instant::now()+Duration::from_secs(5);
  while Instant::now()<deadline&&mutex_held(root){std::thread::sleep(Duration::from_millis(100));}
 }
 Ok(Acquisition::Forwarded)
}
fn log(root:&Path,phase:&str,detail:serde_json::Value){use std::io::Write;let _=std::fs::create_dir_all(root.join("logs"));if let Ok(mut file)=std::fs::OpenOptions::new().create(true).append(true).open(root.join("logs/instance.log")){let _=writeln!(file,"{}",json!({"at":SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64,"pid":std::process::id(),"phase":phase,"detail":detail}));}}
fn wait_consumed(root:&Path,grace:Duration)->bool{let deadline=Instant::now()+grace;loop{if !command_file(root).exists(){return true;}if Instant::now()>=deadline{return false;}std::thread::sleep(Duration::from_millis(50));}}
fn owner_pid(root:&Path)->Option<u32>{let bytes=std::fs::read(root.join("cache/desktop-instance.json")).ok()?;let value:serde_json::Value=serde_json::from_slice(&bytes).ok()?;value["pid"].as_u64().map(|v|v as u32).filter(|pid|*pid!=std::process::id())}
#[cfg(windows)]
fn mutex_name(root:&Path)->Vec<u16>{use std::os::windows::ffi::OsStrExt;std::ffi::OsStr::new(&format!("Local\\MeguLit-{:016x}",fingerprint(root))).encode_wide().chain(Some(0)).collect()}
#[cfg(windows)]
fn mutex_held(root:&Path)->bool{unsafe{let h=OpenMutexW(0x00100000,0,mutex_name(root).as_ptr());if h.is_null(){return false;}CloseHandle(h);true}}
#[cfg(not(windows))]
fn mutex_held(_root:&Path)->bool{false}
#[cfg(windows)]
fn end_stale(pid:u32)->Result<(),String>{unsafe{
 let h=OpenProcess(0x0001|0x1000|0x00100000,0,pid);if h.is_null(){return Err(format!("OWNER_OPEN_FAILED {}",std::io::Error::last_os_error()));}
 let mut buffer=vec![0u16;1024];let mut size=buffer.len() as u32;let ok=QueryFullProcessImageNameW(h,0,buffer.as_mut_ptr(),&mut size)!=0;
 let image=if ok{PathBuf::from(String::from_utf16_lossy(&buffer[..size as usize]))}else{PathBuf::new()};
 let own=std::env::current_exe().ok().and_then(|p|p.canonicalize().ok());
 if !ok||own.is_none()||image.canonicalize().ok()!=own{CloseHandle(h);return Err(format!("OWNER_IMAGE_MISMATCH {}",image.display()));}
 let ended=TerminateProcess(h,1)!=0;let error=std::io::Error::last_os_error();if ended{WaitForSingleObject(h,5000);}CloseHandle(h);
 if ended{Ok(())}else{Err(format!("OWNER_TERMINATE_FAILED {error}"))}
}}
#[cfg(not(windows))]
fn end_stale(_pid:u32)->Result<(),String>{Err("UNSUPPORTED".into())}
fn try_acquire(root:&Path,command:Option<&str>)->Result<Option<Acquisition>,String>{
 #[cfg(windows)]unsafe{
  let name=mutex_name(root);let handle=CreateMutexW(std::ptr::null(),0,name.as_ptr());if handle.is_null(){return Err(std::io::Error::last_os_error().to_string());}
  let exists=GetLastError()==183;if exists{CloseHandle(handle);send(root,command.unwrap_or("show"))?;return Ok(None);}
  if command.is_some(){CloseHandle(handle);return Ok(Some(Acquisition::NotRunning));}let _=std::fs::remove_file(command_file(root));Ok(Some(Acquisition::Owner(Lease(handle))))
 }
 #[cfg(not(windows))]{let _=(root,command);Ok(Some(Acquisition::Owner(Lease)))}
}
/* Claim the command file by renaming it first, so a newer command written between read and delete is never lost */
fn take_command(file:&Path)->Option<serde_json::Value>{let taken=file.with_extension(format!("{}.taken",std::process::id()));if std::fs::rename(file,&taken).is_err(){return None;}let bytes=std::fs::read(&taken).ok();let _=std::fs::remove_file(&taken);serde_json::from_slice::<serde_json::Value>(&bytes?).ok()}
pub fn watch(app:tauri::AppHandle,root:PathBuf){
 let _=std::fs::create_dir_all(root.join("cache"));let _=std::fs::write(root.join("cache/desktop-instance.json"),serde_json::to_vec(&json!({"pid":std::process::id(),"root":root})).unwrap());
 std::thread::spawn(move||{let mut last=String::new();loop{std::thread::sleep(Duration::from_millis(200));if app.state::<crate::DesktopState>().exiting.load(Ordering::SeqCst){break;}let Some(value)=take_command(&command_file(&root))else{continue};let nonce=value["nonce"].as_str().unwrap_or("");if nonce.is_empty()||nonce==last{continue;}last=nonce.to_string();match value["command"].as_str(){Some("show")=>crate::reveal(&app),Some("exit")=>{app.state::<crate::DesktopState>().exiting.store(true,Ordering::SeqCst);app.exit(0);break;},_=>{}}}});
}
#[cfg(test)]mod tests{use super::*;#[test]fn take_command_claims_and_removes_file(){let dir=std::env::temp_dir().join(format!("megulit-take-{}",std::process::id()));std::fs::create_dir_all(&dir).unwrap();let f=dir.join("desktop-command.json");assert!(take_command(&f).is_none());std::fs::write(&f,br#"{"command":"show","nonce":"a"}"#).unwrap();assert_eq!(take_command(&f).unwrap()["command"],"show");assert!(!f.exists());assert_eq!(std::fs::read_dir(&dir).unwrap().count(),0);std::fs::remove_dir_all(dir).unwrap();}#[test]fn installation_fingerprint_is_stable_and_case_insensitive(){assert_eq!(fingerprint(Path::new("E:/Apps/ToMe_Final")),fingerprint(Path::new("e:/apps/tome_final")));assert_ne!(fingerprint(Path::new("E:/Apps/ToMe_Final")),fingerprint(Path::new("E:/Apps/MeguLit")));}
fn consumer(file:PathBuf)->(std::sync::Arc<std::sync::atomic::AtomicBool>,std::thread::JoinHandle<Vec<String>>){let stop=std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));let flag=stop.clone();(stop,std::thread::spawn(move||{let mut seen=Vec::new();while !flag.load(Ordering::SeqCst){if let Ok(bytes)=std::fs::read(&file){if let Ok(v)=serde_json::from_slice::<serde_json::Value>(&bytes){seen.push(v["command"].as_str().unwrap_or("").to_string());let _=std::fs::remove_file(&file);}}std::thread::sleep(Duration::from_millis(20));}seen}))}
#[cfg(windows)]#[test]fn duplicate_instance_forwards_to_existing_owner_and_releases_after_drop(){let root=std::env::temp_dir().join(format!("tome-instance-{}",std::process::id()));std::fs::create_dir_all(&root).unwrap();let first=match acquire(&root,None).unwrap(){Acquisition::Owner(lease)=>lease,_=>panic!("expected owner")};let(stop,watcher)=consumer(command_file(&root));assert!(matches!(acquire_with(&root,None,Duration::from_secs(2)).unwrap(),Acquisition::Forwarded));assert!(matches!(acquire_with(&root,Some("exit"),Duration::from_secs(2)).unwrap(),Acquisition::Forwarded));stop.store(true,Ordering::SeqCst);assert_eq!(watcher.join().unwrap(),vec!["show".to_string(),"exit".to_string()]);assert!(!root.join("logs/instance.log").exists());drop(first);assert!(!mutex_held(&root));assert!(matches!(acquire(&root,Some("exit")).unwrap(),Acquisition::NotRunning));std::fs::remove_dir_all(root).unwrap();}
#[cfg(windows)]#[test]fn unanswered_owner_with_a_foreign_image_is_logged_and_left_alone(){let root=std::env::temp_dir().join(format!("tome-stale-{}",std::process::id()));std::fs::create_dir_all(root.join("cache")).unwrap();let first=match acquire(&root,None).unwrap(){Acquisition::Owner(lease)=>lease,_=>panic!("expected owner")};let mut other=std::process::Command::new("cmd.exe").args(["/c","ping","-n","6","127.0.0.1"]).stdout(std::process::Stdio::null()).spawn().unwrap();std::fs::write(root.join("cache/desktop-instance.json"),serde_json::to_vec(&json!({"pid":other.id()})).unwrap()).unwrap();assert!(matches!(acquire_with(&root,None,Duration::from_millis(200)).unwrap(),Acquisition::Forwarded));let log=std::fs::read_to_string(root.join("logs/instance.log")).unwrap();assert!(log.contains("\"stale-owner\"")&&log.contains("OWNER_IMAGE_MISMATCH"));assert!(other.try_wait().unwrap().is_none());let _=other.kill();let _=other.wait();drop(first);std::fs::remove_dir_all(root).unwrap();}
#[cfg(windows)]#[test]fn unanswered_owner_running_this_executable_is_ended_and_ownership_taken(){let root=std::env::temp_dir().join(format!("tome-takeover-{}",std::process::id()));std::fs::create_dir_all(root.join("cache")).unwrap();let exe=std::env::current_exe().unwrap();let mut holder=std::process::Command::new(&exe).args(["--exact","single_instance::tests::hold_mutex_for_takeover","--ignored","--nocapture"]).env("MEGULIT_TAKEOVER_ROOT",&root).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn().unwrap();let deadline=Instant::now()+Duration::from_secs(10);while !mutex_held(&root){assert!(Instant::now()<deadline,"holder never took the mutex");std::thread::sleep(Duration::from_millis(50));}std::fs::write(root.join("cache/desktop-instance.json"),serde_json::to_vec(&json!({"pid":holder.id()})).unwrap()).unwrap();let lease=match acquire_with(&root,None,Duration::from_millis(300)).unwrap(){Acquisition::Owner(lease)=>lease,_=>panic!("expected takeover")};assert!(holder.wait().unwrap().code()==Some(1));let log=std::fs::read_to_string(root.join("logs/instance.log")).unwrap();assert!(log.contains("\"ended\":true")&&log.contains("took-over"));drop(lease);std::fs::remove_dir_all(root).unwrap();}
#[test]#[ignore]fn hold_mutex_for_takeover(){let Ok(root)=std::env::var("MEGULIT_TAKEOVER_ROOT")else{return};let _lease=acquire(Path::new(&root),None).unwrap();std::thread::sleep(Duration::from_secs(30));}}
