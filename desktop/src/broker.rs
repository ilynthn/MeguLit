// SPDX-License-Identifier: GPL-3.0-or-later
use serde_json::{json,Value};
use std::{collections::HashMap,io::{BufRead,BufReader,Write},path::PathBuf,process::{Child,ChildStdin,Command,Stdio},sync::{Arc,Mutex,OnceLock,atomic::{AtomicU64,Ordering},mpsc},time::{Duration,Instant}};
#[cfg(windows)] use std::os::windows::process::CommandExt;
use tauri::Emitter;
type Reply=Result<Value,String>;
struct Process { child:Child,input:ChildStdin }
pub struct Broker { root:PathBuf,process:Mutex<Option<Process>>,pending:Arc<Mutex<HashMap<u64,mpsc::Sender<Reply>>>>,serial:AtomicU64,generation:Arc<AtomicU64> }
static BROKER:OnceLock<Broker>=OnceLock::new();
static APP:OnceLock<tauri::AppHandle>=OnceLock::new();
pub fn attach(app:tauri::AppHandle){let _=APP.set(app);}
pub fn request(root:PathBuf,request:Value)->Reply{BROKER.get_or_init(||Broker{root,process:Mutex::new(None),pending:Arc::new(Mutex::new(HashMap::new())),serial:AtomicU64::new(1),generation:Arc::new(AtomicU64::new(0))}).request(request)}
impl Broker {
 fn start(&self,slot:&mut Option<Process>)->Result<(),String>{
  if let Some(process)=slot {if process.child.try_wait().map_err(|_|"SERVICE_STATUS_FAILED")?.is_none(){return Ok(());}}
  let mut command=Command::new(self.root.join("runtime/node.exe"));
  command.arg(self.root.join("services/server.cjs")).current_dir(&self.root).env("MEGULIT_ROOT",&self.root).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
  #[cfg(windows)] command.creation_flags(0x08000000);
  let mut child=command.spawn().map_err(|_|"SERVICE_START_FAILED")?;
  #[cfg(windows)] kill_with_app(&child);
  let input=child.stdin.take().ok_or("SERVICE_PIPE_FAILED")?;let output=child.stdout.take().ok_or("SERVICE_PIPE_FAILED")?;
  for(_,sender)in self.pending.lock().unwrap_or_else(|e|e.into_inner()).drain(){let _=sender.send(Err("SERVICE_DISCONNECTED".into()));}
  let generation=self.generation.clone();let epoch=generation.fetch_add(1,Ordering::SeqCst)+1;let pending=self.pending.clone();
  std::thread::spawn(move||{
   for line in BufReader::new(output).lines(){let Ok(line)=line else{break};let Ok(value)=serde_json::from_str::<Value>(&line)else{continue};
    if let Some(event)=value["event"].as_str(){
     if let Some(app)=APP.get(){
      if event=="home-toggle"{let ui=app.clone();let _=app.run_on_main_thread(move||crate::toggle_home(&ui));continue;}
      #[cfg(windows)]
      if event=="reader-pointer-input"{crate::reader_pointer::dispatch(app,&value["data"]);continue;}
      let _=app.emit(event,value["data"].clone());
     }
     continue;
    }
    if let Some(id)=value["id"].as_u64(){if let Some(sender)=pending.lock().unwrap_or_else(|e|e.into_inner()).remove(&id){let result=if value["ok"]==true{Ok(value["data"].clone())}else{Err(value["error"].as_str().unwrap_or("SERVICE_FAILED").to_string())};let _=sender.send(result);}}
   }
   if generation.load(Ordering::SeqCst)==epoch{for(_,sender)in pending.lock().unwrap_or_else(|e|e.into_inner()).drain(){let _=sender.send(Err("SERVICE_DISCONNECTED".into()));}}
  });
  *slot=Some(Process{child,input});Ok(())
 }
 fn request(&self,request:Value)->Reply{
  if CLOSING.load(Ordering::SeqCst){return Err("SERVICE_CLOSING".into());}
  let id=self.serial.fetch_add(1,Ordering::Relaxed);let(tx,rx)=mpsc::channel();
  {let mut process=self.process.lock().map_err(|_|"SERVICE_LOCK_FAILED")?;self.start(&mut process)?;
   self.pending.lock().unwrap_or_else(|e|e.into_inner()).insert(id,tx);let encoded=json!({"id":id,"request":request}).to_string()+"\n";
   if process.as_mut().unwrap().input.write_all(encoded.as_bytes()).is_err(){self.pending.lock().unwrap_or_else(|e|e.into_inner()).remove(&id);return Err("SERVICE_DISCONNECTED".into());}
  }
  match rx.recv_timeout(Duration::from_secs(240)){Ok(result)=>result,Err(_)=>{self.pending.lock().unwrap_or_else(|e|e.into_inner()).remove(&id);Err("SERVICE_TIMEOUT".into())}}
 }
}
static CLOSING:std::sync::atomic::AtomicBool=std::sync::atomic::AtomicBool::new(false);
/* Exit must never hang on a stuck service: a request blocked in write_all on a full pipe holds the lock, and our own
   shutdown write can block the same way. Wait for the lock at most 2 s and write on a throwaway thread; if we give up,
   the job object (KILL_ON_JOB_CLOSE) ends node.exe when MeguLit exits. CLOSING stops requests from restarting node. */
pub fn shutdown(){CLOSING.store(true,Ordering::SeqCst);if let Some(broker)=BROKER.get(){
 let deadline=Instant::now()+Duration::from_secs(2);
 let mut slot=loop{match broker.process.try_lock(){Ok(g)=>break g,Err(std::sync::TryLockError::Poisoned(e))=>break e.into_inner(),Err(std::sync::TryLockError::WouldBlock)=>{if Instant::now()>=deadline{return;}std::thread::sleep(Duration::from_millis(20));}}};
 let Some(Process{mut child,mut input})=slot.take() else{return};drop(slot);
 std::thread::spawn(move||{let _=input.write_all(b"{\"id\":0,\"request\":{\"action\":\"__shutdown\"}}\n");});
 let deadline=Instant::now()+Duration::from_secs(8);loop{if child.try_wait().map(|s|s.is_some()).unwrap_or(true){break;}if Instant::now()>=deadline{let _=child.kill();let _=child.wait();break;}std::thread::sleep(Duration::from_millis(50));}
}}
/* Ties the Node service to this process: when MeguLit exits or is killed, Windows closes the job and ends node.exe too. */
#[cfg(windows)]
fn kill_with_app(child:&Child){
 use std::os::windows::io::AsRawHandle;use std::ffi::c_void;
 #[repr(C)] #[derive(Default)] struct Basic{a:i64,b:i64,flags:u32,c:usize,d:usize,e:u32,f:usize,g:u32,h:u32}
 #[repr(C)] #[derive(Default)] struct Io{v:[u64;6]}
 #[repr(C)] #[derive(Default)] struct Extended{basic:Basic,io:Io,p:usize,j:usize,pp:usize,pj:usize}
 #[link(name="kernel32")] extern "system"{fn CreateJobObjectW(a:*mut c_void,n:*const u16)->*mut c_void;fn SetInformationJobObject(j:*mut c_void,class:i32,info:*const c_void,len:u32)->i32;fn AssignProcessToJobObject(j:*mut c_void,p:*mut c_void)->i32;}
 static JOB:OnceLock<usize>=OnceLock::new();
 let job=*JOB.get_or_init(||unsafe{let j=CreateJobObjectW(std::ptr::null_mut(),std::ptr::null());if j.is_null(){return 0;}let mut info=Extended::default();info.basic.flags=0x2000;if SetInformationJobObject(j,9,&info as *const _ as *const c_void,std::mem::size_of::<Extended>() as u32)==0{return 0;}j as usize});
 if job!=0{unsafe{AssignProcessToJobObject(job as *mut c_void,child.as_raw_handle() as *mut c_void);}}
}
