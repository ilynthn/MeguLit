// SPDX-License-Identifier: GPL-3.0-or-later
/* E378 Settings → 账号: email + code login and cloud sync (services/account.cjs). Not logged in = everything stays local. */
const T={
 zh:{title:'账号',notReady:'联网服务还在准备中，账号和云同步暂时不能用；所有功能照常在本机使用',intro:'登录后可以在几台电脑之间同步单词、收藏的句子、阅读记录和按游戏设置。不登录也能照常使用全部功能',privacy:'只同步下面打开的内容；不上传游戏路径和日志；邮箱只用来登录',email:'邮箱',
  emailPh:'you@example.com',send:'发送验证码',resend:'重新发送',code:'验证码',codePh:'6 位数字',login:'登录',sentTo:'验证码已发到 {email}，10 分钟内有效',loggedAs:'已登录',lastSync:'上次同步',never:'还没有同步',
  webSync:'同步到网页',webSyncHelp:'收藏的单词和句子、学习统计、阅读进度会自动上传，登录 megulit.com 就能查看。不上传游戏文本和小说正文。关掉后不再上传任何内容',wipe:'删除云端数据',wipeTitle:'删除云端数据？',wipeBody:'会删除服务器上已同步的单词、句子、学习统计和阅读进度，账号保留，并自动关闭「同步到网页」。这台电脑上的数据不会动',wiped:'云端数据已删除，「同步到网页」已关闭',syncNow:'立即同步',syncing:'同步中…',synced:'同步完成',pending:'待上传 {n} 条',kinds:'同步内容',words:'单词与例句',sentences:'收藏的句子',reading:'阅读记录（每日汇总）',settings:'按游戏设置（不含路径）',devices:'已登录的设备',
  thisDevice:'本机',revoke:'移除',logout:'退出登录',remove:'删除账号（含云端数据）',removeTitle:'删除账号和云端数据？',removeBody:'会删除服务器上的账号、所有设备的登录和已同步的数据，无法恢复。本机数据保留不变',confirm:'删除',cancel:'取消',
  removed:'账号已删除',loggedOut:'已退出登录',err:{EMAIL_INVALID:'邮箱格式不对',RATE_LIMITED:'操作太频繁，请稍后再试',WRONG_CODE:'验证码不对',CODE_EXPIRED:'验证码已过期，请重新发送',TOO_MANY_TRIES:'错误次数太多，请重新发送验证码',
  NO_CODE:'请先发送验证码',EMAIL_NOT_CONFIGURED:'邮件服务还在准备中，暂时不能登录',EMAIL_SEND_FAILED:'邮件发送失败，请稍后再试',RATE_LIMITED:'请求太频繁，请稍等一会儿再试',NETWORK:'连不上联网服务，请检查网络',UNAUTHORIZED:'登录已失效，请重新登录',SYNC_QUOTA_EXCEEDED:'云端空间已满，可以关掉部分同步内容',
  RELAY_NOT_CONFIGURED:'联网服务还在准备中',VAULT_UNAVAILABLE:'Windows 加密存储不可用，无法保存登录',other:'操作失败，请稍后再试'}},
 ja:{title:'アカウント',notReady:'オンラインサービスは準備中です。アカウントとクラウド同期はまだ使えません。ほかの機能はこれまでどおり使えます',intro:'ログインすると、単語・保存した文・読書記録・作品別の設定を複数の PC で同期できます。ログインしなくてもすべての機能を使えます',privacy:'オンにした項目だけを同期します。ゲームのパスやログは送信しません。メールアドレスはログインにのみ使います',
  email:'メールアドレス',emailPh:'you@example.com',send:'確認コードを送信',resend:'再送信',code:'確認コード',codePh:'6 桁の数字',login:'ログイン',sentTo:'{email} に確認コードを送りました（10 分間有効）',loggedAs:'ログイン中',
  lastSync:'前回の同期',never:'まだ同期していません',webSync:'Web に同期',webSyncHelp:'保存した単語と文、学習統計、読書の進み具合が自動でアップロードされ、megulit.com にログインして見られます。ゲームの本文やシナリオは送りません。オフにすると何も送りません',wipe:'クラウドのデータを削除',wipeTitle:'クラウドのデータを削除しますか？',wipeBody:'サーバー上の同期済みの単語・文・学習統計・読書の進み具合を削除します。アカウントは残り、「Web に同期」は自動でオフになります。この PC のデータはそのままです',wiped:'クラウドのデータを削除し、「Web に同期」をオフにしました',syncNow:'今すぐ同期',syncing:'同期中…',synced:'同期しました',pending:'未送信 {n} 件',kinds:'同期する内容',words:'単語と例文',sentences:'保存した文',reading:'読書記録（日ごとの合計）',
  settings:'作品別の設定（パスを除く）',devices:'ログイン中のデバイス',thisDevice:'この PC',revoke:'削除',logout:'ログアウト',remove:'アカウントを削除（クラウドのデータも）',removeTitle:'アカウントとクラウドのデータを削除しますか？',
  removeBody:'サーバー上のアカウント、全デバイスのログイン、同期したデータを削除します。元に戻せません。この PC のデータはそのまま残ります',confirm:'削除',cancel:'キャンセル',removed:'アカウントを削除しました',loggedOut:'ログアウトしました',err:{EMAIL_INVALID:'メールアドレスの形式が正しくありません',
  RATE_LIMITED:'操作が多すぎます。しばらくしてからお試しください',WRONG_CODE:'確認コードが違います',CODE_EXPIRED:'確認コードの期限が切れました。再送信してください',TOO_MANY_TRIES:'入力ミスが多すぎます。確認コードを再送信してください',NO_CODE:'先に確認コードを送信してください',
  EMAIL_NOT_CONFIGURED:'メール送信は準備中のため、まだログインできません',EMAIL_SEND_FAILED:'メールを送信できませんでした。しばらくしてからお試しください',RATE_LIMITED:'リクエストが多すぎます。少し待ってからお試しください',NETWORK:'オンラインサービスに接続できません。ネットワークを確認してください',UNAUTHORIZED:'ログインが切れました。もう一度ログインしてください',
  SYNC_QUOTA_EXCEEDED:'クラウドの容量が上限です。同期する内容を減らしてください',RELAY_NOT_CONFIGURED:'オンラインサービスは準備中です',VAULT_UNAVAILABLE:'Windows の暗号化ストアが使えないため、ログインを保存できません',other:'操作に失敗しました。しばらくしてからお試しください'}},
 en:{title:'Account',notReady:'Online services are not ready yet, so accounts and cloud sync are unavailable. Everything else works locally as usual',intro:'Sign in to sync words, saved sentences, reading records and per-game settings between your PCs. Everything works without an account too',
  privacy:'Only what you turn on below is synced. Game paths and logs are never uploaded. Your email is used only to sign in',email:'Email',emailPh:'you@example.com',
  send:'Send code',resend:'Resend',code:'Code',codePh:'6 digits',login:'Sign in',sentTo:'Code sent to {email}, valid for 10 minutes',loggedAs:'Signed in',lastSync:'Last sync',
  never:'Not synced yet',webSync:'Sync to the web',webSyncHelp:'Saved words and sentences, study stats and reading progress upload automatically, so you can view them after signing in at megulit.com. Game text and novel text are never uploaded. When off, nothing is uploaded',wipe:'Delete cloud data',wipeTitle:'Delete cloud data?',wipeBody:'This deletes the synced words, sentences, study stats and reading progress on the server. Your account stays and "Sync to the web" is turned off. Data on this PC is not touched',wiped:'Cloud data deleted and sync to the web turned off',syncNow:'Sync now',syncing:'Syncing…',synced:'Synced',pending:'{n} waiting to upload',kinds:'What to sync',words:'Words and examples',sentences:'Saved sentences',
  reading:'Reading records (daily totals)',settings:'Per-game settings (no paths)',devices:'Signed-in devices',thisDevice:'This PC',revoke:'Remove',logout:'Sign out',
  remove:'Delete account (and cloud data)',removeTitle:'Delete your account and cloud data?',removeBody:'This deletes the account on the server, every device sign-in and all synced data. It cannot be undone. Data on this PC stays as it is',
  confirm:'Delete',cancel:'Cancel',removed:'Account deleted',loggedOut:'Signed out',err:{EMAIL_INVALID:'That email address does not look right',RATE_LIMITED:'Too many attempts, try again later',
  WRONG_CODE:'Wrong code',CODE_EXPIRED:'The code expired, send a new one',TOO_MANY_TRIES:'Too many wrong codes, send a new one',NO_CODE:'Send a code first',EMAIL_NOT_CONFIGURED:'Email delivery is not ready yet, so sign-in is unavailable',
  EMAIL_SEND_FAILED:'Could not send the email, try again later',RATE_LIMITED:'Too many requests, please wait a moment',NETWORK:'Cannot reach the online service, check your connection',UNAUTHORIZED:'Your sign-in expired, sign in again',
  SYNC_QUOTA_EXCEEDED:'Cloud storage is full, turn off some sync items',RELAY_NOT_CONFIGURED:'Online services are not ready yet',VAULT_UNAVAILABLE:'Windows protected storage is unavailable, cannot keep you signed in',
  other:'Something went wrong, try again later'}}
};
/* 2026-11-12 (user: the code mail is slow; add a Steam-like user name and password, chosen once and never changed): two
   ways to sign in (code / password with the e-mail or the user name) and the account page's 登录方式 section */
const P={
 zh:{modeCode:'验证码登录',modePassword:'密码登录',loginId:'邮箱或用户名',loginIdPh:'邮箱或用户名',password:'密码',passwordPh:'密码',sending:'正在发送验证码…邮件一般几秒到一分钟内到达，可以先把输入框准备好',resendIn:'{n} 秒后可重发',
  forgot:'忘记密码？用验证码登录后可以重新设置',methods:'登录方式',methodsHelp:'设置用户名和密码后，可以用邮箱或用户名加密码直接登录，不用每次等验证码',username:'用户名',usernameNone:'还没有设置',usernamePh:'3–20 位，字母开头，可用字母、数字和 _',
  usernameSet:'设置用户名',usernameFixed:'用户名设置后不能更改',usernameWarn:'注意：用户名只能设置一次，设置后永远不能更改',usernameConfirmTitle:'确定使用这个用户名？',usernameConfirmBody:'用户名设置后永远不能更改，也不能换成别的名字。之后可以用它和密码登录',
  usernameDone:'用户名已设置',passwordNone:'还没有设置密码',passwordOn:'已设置',setPassword:'设置密码',changePassword:'修改密码',currentPassword:'当前密码',newPassword:'新密码',newPasswordPh:'至少 8 位',
  repeatPassword:'再输入一次新密码',save:'保存',passwordDone:'密码已保存，下次可以用密码登录',mismatch:'两次输入的密码不一样',suggest:'设置一个密码，下次就能用邮箱或用户名直接登录，不用再等验证码',suggestToast:'登录成功。可以在 设置 → 账号 里设置密码，下次不用再等验证码',
  forgotCurrent:'忘记当前密码？用邮箱验证码重设',useCurrent:'改用当前密码',pwCode:'邮箱验证码',pwCodeHelp:'为了确认是你本人，先给 {email} 发一个验证码',
  otherDevices:'改密码后，其他已登录的设备不会被退出；需要的话可以在下面「已登录的设备」里逐个移除',
  freshHint:'刚用验证码登录：10 分钟内修改密码不需要当前密码（忘记密码时就这样重设）',
  err:{CODE_REQUIRED:'请先发送邮箱验证码并填写',WRONG_PASSWORD:'账号或密码不对',PASSWORD_LENGTH:'密码需要 8–128 位',PASSWORD_WEAK:'密码太简单了，换一个吧',USERNAME_INVALID:'用户名需要 3–20 位，字母开头，只能用字母、数字和 _（部分名字被保留）',USERNAME_TAKEN:'这个用户名已经被别人用了',
   USERNAME_LOCKED:'用户名已经设置过，不能更改',LOGIN_INVALID:'请输入邮箱或用户名',NO_CODE:'请先发送验证码；如果一直没收到邮件，请重新发送'}},
 ja:{modeCode:'確認コードでログイン',modePassword:'パスワードでログイン',loginId:'メールアドレスまたはユーザー名',loginIdPh:'メールアドレスまたはユーザー名',password:'パスワード',passwordPh:'パスワード',sending:'確認コードを送信中…メールは数秒〜1 分ほどで届きます',
  resendIn:'{n} 秒後に再送信できます',forgot:'パスワードを忘れた場合は、確認コードでログインしてから再設定できます',methods:'ログイン方法',methodsHelp:'ユーザー名とパスワードを設定すると、メールアドレスかユーザー名とパスワードですぐにログインできます',username:'ユーザー名',
  usernameNone:'未設定',usernamePh:'3〜20 文字、英字で始まり、英数字と _ が使えます',usernameSet:'ユーザー名を設定',usernameFixed:'ユーザー名は変更できません',usernameWarn:'注意：ユーザー名は一度しか設定できず、あとから変更できません',
  usernameConfirmTitle:'このユーザー名にしますか？',usernameConfirmBody:'設定したユーザー名はあとから変更できません。以後、このユーザー名とパスワードでログインできます',usernameDone:'ユーザー名を設定しました',passwordNone:'パスワード未設定',
  passwordOn:'設定済み',setPassword:'パスワードを設定',changePassword:'パスワードを変更',currentPassword:'現在のパスワード',newPassword:'新しいパスワード',newPasswordPh:'8 文字以上',repeatPassword:'新しいパスワード（確認）',
  save:'保存',passwordDone:'パスワードを保存しました。次回からパスワードでログインできます',mismatch:'パスワードが一致しません',suggest:'パスワードを設定すると、次回から確認コードを待たずにメールアドレスかユーザー名でログインできます',suggestToast:'ログインしました。設定 → アカウントでパスワードを設定すると、次回は確認コードが不要です',
  forgotCurrent:'現在のパスワードを忘れた場合は、メールの確認コードで再設定',useCurrent:'現在のパスワードを使う',pwCode:'メールの確認コード',pwCodeHelp:'本人確認のため、{email} に確認コードを送ります',
  otherDevices:'パスワードを変更しても、ほかのデバイスはログアウトされません。必要なら下の「ログイン中のデバイス」から個別に解除できます',
  freshHint:'確認コードでログインした直後の 10 分間は、現在のパスワードなしで変更できます（忘れたときの再設定）',
  err:{CODE_REQUIRED:'先にメールの確認コードを送信して入力してください',WRONG_PASSWORD:'アカウントまたはパスワードが違います',PASSWORD_LENGTH:'パスワードは 8〜128 文字にしてください',PASSWORD_WEAK:'パスワードが単純すぎます',USERNAME_INVALID:'ユーザー名は 3〜20 文字、英字で始まり、英数字と _ のみ使えます（一部の名前は予約済み）',
   USERNAME_TAKEN:'このユーザー名はすでに使われています',USERNAME_LOCKED:'ユーザー名は設定済みのため変更できません',LOGIN_INVALID:'メールアドレスかユーザー名を入力してください',NO_CODE:'先に確認コードを送信してください。メールが届かない場合は再送信してください'}},
 en:{modeCode:'Sign in with a code',modePassword:'Sign in with a password',loginId:'Email or user name',loginIdPh:'Email or user name',password:'Password',passwordPh:'Password',
  sending:'Sending the code… the email usually arrives within a few seconds to a minute',resendIn:'Resend in {n}s',forgot:'Forgot your password? Sign in with a code, then set a new one',
  methods:'Sign-in methods',methodsHelp:'With a user name and password you can sign in with your email or user name right away, without waiting for a code',username:'User name',
  usernameNone:'Not set',usernamePh:'3–20 characters, starts with a letter; letters, digits and _',usernameSet:'Set user name',usernameFixed:'Your user name cannot be changed',
  usernameWarn:'Note: you can choose a user name only once. It can never be changed afterwards',usernameConfirmTitle:'Use this user name?',usernameConfirmBody:'A user name can never be changed or replaced once it is set. You can then sign in with it and your password',
  usernameDone:'User name set',passwordNone:'No password yet',passwordOn:'Set',setPassword:'Set password',changePassword:'Change password',currentPassword:'Current password',
  newPassword:'New password',newPasswordPh:'At least 8 characters',repeatPassword:'Repeat the new password',save:'Save',passwordDone:'Password saved, you can sign in with it next time',
  mismatch:'The two passwords do not match',suggest:'Set a password to sign in with your email or user name next time, without waiting for a code',suggestToast:'Signed in. Set a password in Settings → Account to skip the code next time',
  forgotCurrent:'Forgot your current password? Reset it with an email code',useCurrent:'Use the current password instead',pwCode:'Email code',pwCodeHelp:'To confirm it is you, we send a code to {email} first',
  otherDevices:'Changing the password does not sign out your other devices; you can remove them one by one under Signed-in devices below',
  freshHint:'You just signed in with a code: for 10 minutes you can change the password without the current one (how a forgotten password is reset)',
  err:{CODE_REQUIRED:'Send the email code first and enter it',WRONG_PASSWORD:'Wrong account or password',PASSWORD_LENGTH:'Passwords need 8–128 characters',PASSWORD_WEAK:'That password is too simple',USERNAME_INVALID:'User names need 3–20 characters, start with a letter and use only letters, digits and _ (some names are reserved)',
   USERNAME_TAKEN:'That user name is already taken',USERNAME_LOCKED:'Your user name is already set and cannot be changed',LOGIN_INVALID:'Enter your email or user name',
   NO_CODE:'Send a code first; if the email never arrives, send a new one'}}
};
for(const k of Object.keys(T)){const {err,...rest}=P[k];Object.assign(T[k],rest);Object.assign(T[k].err,err);}
Object.assign(T.zh.err,{RECORD_TOO_LARGE:'有记录超过云端大小限制，已保留在本机待同步',SYNC_RESPONSE_INVALID:'同步服务返回了无效响应，请重试'});
Object.assign(T.ja.err,{RECORD_TOO_LARGE:'容量制限を超えた記録は、この端末に未送信のまま保存されています',SYNC_RESPONSE_INVALID:'同期サービスの応答が無効です。もう一度お試しください'});
Object.assign(T.en.err,{RECORD_TOO_LARGE:'Some records exceed the cloud size limit and remain queued on this device',SYNC_RESPONSE_INVALID:'The sync service returned an invalid response. Try again'});
const store={get:k=>{try{return localStorage.getItem(k)||'';}catch{return '';}},set:(k,v)=>{try{localStorage.setItem(k,v);}catch{}}};
const KINDS=['words','sentences','reading','settings'];
export const accountLabel={zh:T.zh.title,ja:T.ja.title,en:T.en.title};
function errorText(t,error){const raw=String(error?.code||error?.message||error||'');const code=Object.keys(t.err).find(k=>raw.includes(k));return t.err[code]||t.err.other;
 }
/* E385 the sign-in form on its own, shared by Settings → 账号, the profile panel, the forum and the leaderboard join
   card. Two modes: e-mail + code, or e-mail/user name + password. kinds() gives the sync choice to save at sign-in (null
   keeps the saved/default one); onDone({method,suggestPassword}) runs after a successful sign-in. */
export function mountEmailLogin(box,{api,locale,esc,toast,kinds=()=>null,onDone=()=>{},suggest=true}){
 const t=T[locale]||T.zh,fill=(s,v)=>s.replace(/\{(\w+)\}/g,(_,k)=>esc(String(v[k]??'')));
 let mode=store.get('megulit.loginMode')==='password'?'password':'code';
 box.innerHTML=`<div class="login-modes" role="tablist"><button type="button" role="tab" data-mode="code">${t.modeCode}</button><button type="button" role="tab" data-mode="password">${t.modePassword}</button></div>
  <div data-pane="code"><label class="form-label">${t.email}</label><div class="input-group"><input class="form-input" type="email" data-login-email autocomplete="email" spellcheck="false" placeholder="${t.emailPh}" aria-label="${t.email}"><button type="button" class="secondary" data-send>${t.send}</button></div>
   <div data-code-step hidden><p class="settings-help u-status" data-sent></p><label class="form-label">${t.code}</label><div class="input-group"><input class="form-input" data-login-code inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="${t.codePh}" aria-label="${t.code}"><button type="button" class="primary" data-login>${t.login}</button></div></div></div>
  <form data-pane="password" autocomplete="on" onsubmit="return false"><label class="form-label">${t.loginId}</label><input class="form-input" data-login-id name="username" autocomplete="username" spellcheck="false" maxlength="254" placeholder="${t.loginIdPh}" aria-label="${t.loginId}">
   <label class="form-label">${t.password}</label><div class="input-group"><input class="form-input" type="password" data-login-password name="password" autocomplete="current-password" maxlength="128" placeholder="${t.passwordPh}" aria-label="${t.password}"><button type="submit" class="primary" data-password-login>${t.login}</button></div>
   <p class="settings-help"><button type="button" class="text-button login-forgot" data-forgot>${t.forgot}</button></p></form>`;
 const email=box.querySelector('[data-login-email]'),code=box.querySelector('[data-login-code]'),step=box.querySelector('[data-code-step]'),send=box.querySelector('[data-send]'),
  sent=box.querySelector('[data-sent]');
 const loginId=box.querySelector('[data-login-id]'),password=box.querySelector('[data-login-password]');
 loginId.value=store.get('megulit.loginId');
 const show=next=>{mode=next;store.set('megulit.loginMode',mode);box.querySelectorAll('[data-mode]').forEach(b=>{const on=b.dataset.mode===mode;b.setAttribute('aria-selected',
  String(on));b.classList.toggle('active',on);});box.querySelectorAll('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==mode);};
 box.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{show(b.dataset.mode);(mode==='code'?email:loginId.value?password:loginId).focus();});
 box.querySelector('[data-forgot]').onclick=()=>{if(loginId.value.includes('@')&&!email.value)email.value=loginId.value.trim();show('code');email.focus();};
 show(mode);
 const finish=async method=>{
  let suggestPassword=false;
  if(method==='code'&&suggest){try{const me=await api('account_me',{});suggestPassword=!me?.hasPassword;}catch{}}
  await onDone({method,suggestPassword});
  if(suggestPassword&&suggest!=='inline')toast(t.suggestToast);
 };
 /* the code step opens at once with a "sending" line; the relay answers within ~1.5 s even when the mail is still on
    its way, and resending waits out the relay's 60-second gap */
 let timer=0;
 const countdown=seconds=>{clearInterval(timer);let left=seconds;const tick=()=>{if(!box.isConnected){clearInterval(timer);return;}if(left<=0){clearInterval(timer);
  send.disabled=false;send.textContent=t.resend;return;}send.disabled=true;send.textContent=fill(t.resendIn,{n:left});left--;};tick();timer=setInterval(tick,1000);
  };
 send.onclick=async()=>{
  const value=email.value.trim();if(!value){email.focus();return;}
  send.disabled=true;step.hidden=false;sent.dataset.state='busy';sent.textContent=t.sending;code.focus();
  try{const r=await api('account_code',{email:value});sent.dataset.state='';sent.innerHTML=fill(t.sentTo,{email:r.email});countdown(60);}
  catch(error){sent.dataset.state='error';sent.textContent=errorText(t,error);toast(errorText(t,error));const retry=Number(error?.detail?.retryAfter)||0;if(retry)countdown(retry);
   else{send.disabled=false;send.textContent=t.resend;}}
 };
 email.onkeydown=e=>{if(e.key==='Enter')send.click();};
 let running=false;
 const busy=on=>box.querySelectorAll('[data-pane] button,[data-pane] input,[data-mode]').forEach(el=>{if(el!==send)el.disabled=on;});
 const login=async()=>{if(running)return;running=true;busy(true);try{await api('account_verify',{email:email.value,code:code.value,kinds:kinds()});clearInterval(timer);
  await finish('code');}catch(error){toast(errorText(t,error));busy(false);}finally{running=false;}};
 box.querySelector('[data-login]').onclick=login;code.onkeydown=e=>{if(e.key==='Enter')login();};
 code.oninput=()=>{code.value=code.value.replace(/\D/g,'').slice(0,6);if(code.value.length===6)login();};
 const passwordLogin=async()=>{
  if(running)return;if(!loginId.value.trim()){loginId.focus();return;}if(!password.value){password.focus();return;}
  running=true;busy(true);
  try{await api('account_password_login',{login:loginId.value.trim(),password:password.value,kinds:kinds()});store.set('megulit.loginId',loginId.value.trim());password.value='';
   await finish('password');}
  catch(error){toast(errorText(t,error));busy(false);password.select();}finally{running=false;}
 };
 box.querySelector('[data-password-login]').onclick=passwordLogin;
 loginId.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();password.focus();}};
 password.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();passwordLogin();}};
}
/* 登录方式: the user name (chosen once, with a confirmation) and the password (set, or change with the current one;
   a code sign-in in the last 10 minutes resets it without). me = the relay's /api/me answer when known. */
export function mountSignInMethods(box,{api,locale,esc,toast,status,me=null,onChange=()=>{}}){
 const t=T[locale]||T.zh,fill=(x,v)=>x.replace(/\{(\w+)\}/g,(_,k)=>String(v[k]??'')),username=me?(me.username||''):status.username||'',hasPassword=me?!!me.hasPassword:!!status.hasPassword,known=!!me||status.passwordKnown;
 const fresh=!!status.codeFresh,email=me?.email||status.email||'';
 box.innerHTML=`<h3 class="settings-label" style="margin:22px 0 4px">${t.methods}</h3><p class="settings-help">${t.methodsHelp}</p>
  ${known&&!hasPassword?`<p class="settings-help u-status account-suggest" data-state="busy">${t.suggest}</p>`:''}
  <div class="settings-row"><span><span class="settings-label">${t.username}</span><p class="settings-help">${username?esc(username)+' · '+t.usernameFixed:t.usernameNone}</p></span></div>
  ${username?'':`<div class="account-username"><div class="input-group"><input class="form-input" data-username maxlength="20" spellcheck="false" autocomplete="off" placeholder="${t.usernamePh}" aria-label="${t.username}"><button type="button" class="secondary" data-username-set>${t.usernameSet}</button></div><p class="settings-help u-status" data-state="error">${t.usernameWarn}</p></div>`}
  <div class="settings-row"><span><span class="settings-label">${t.password}</span><p class="settings-help">${known?(hasPassword?t.passwordOn:t.passwordNone):'…'}</p></span><button type="button" class="secondary" data-password-open>${hasPassword?t.changePassword:t.setPassword}</button></div>
  <form class="account-password" data-password-form hidden autocomplete="off" onsubmit="return false">
   <div data-proof="current"><label class="form-label">${t.currentPassword}</label><input class="form-input" type="password" data-current autocomplete="current-password" maxlength="128" aria-label="${t.currentPassword}">
    <button type="button" class="link-button" data-use="code">${t.forgotCurrent}</button></div>
   <div data-proof="code"><label class="form-label">${t.pwCode}</label><p class="settings-help">${fill(t.pwCodeHelp,{email:esc(email)})}</p>
    <div class="input-group"><input class="form-input" data-pw-code inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="${t.codePh}" aria-label="${t.pwCode}"><button type="button" class="secondary" data-pw-send>${t.send}</button></div>
    <p class="settings-help u-status" data-pw-sent hidden></p>${hasPassword?`<button type="button" class="link-button" data-use="current">${t.useCurrent}</button>`:''}</div>
   ${hasPassword&&fresh?`<p class="settings-help">${t.freshHint}</p>`:''}
   <label class="form-label">${t.newPassword}</label><input class="form-input" type="password" data-new autocomplete="new-password" maxlength="128" placeholder="${t.newPasswordPh}" aria-label="${t.newPassword}">
   <label class="form-label">${t.repeatPassword}</label><input class="form-input" type="password" data-repeat autocomplete="new-password" maxlength="128" aria-label="${t.repeatPassword}">
   <p class="settings-help">${t.otherDevices}</p>
   <div class="review-controls" style="justify-content:flex-start;margin-top:14px"><button type="submit" class="primary" data-password-save>${t.save}</button></div></form>`;
 const form=box.querySelector('[data-password-form]');
 /* proof: nothing right after a code sign-in (relay: 10 minutes), the current password when one is set, else a mailed code */
 let proof=fresh?'':hasPassword?'current':'code';
 const showProof=()=>{form.querySelectorAll('[data-proof]').forEach(el=>el.hidden=el.dataset.proof!==proof);};showProof();
 form.querySelectorAll('[data-use]').forEach(b=>b.onclick=()=>{proof=b.dataset.use;showProof();(form.querySelector(proof==='code'?'[data-pw-send]':'[data-current]')).focus();});
 box.querySelector('[data-password-open]').onclick=()=>{form.hidden=!form.hidden;if(!form.hidden)(form.querySelector(proof==='current'?'[data-current]':proof==='code'?'[data-pw-send]':'[data-new]')).focus();
  };
 const sendCode=form.querySelector('[data-pw-send]'),sentLine=form.querySelector('[data-pw-sent]'),codeInput=form.querySelector('[data-pw-code]');let timer=0;
 const countdown=seconds=>{clearInterval(timer);let left=seconds;const tick=()=>{if(!box.isConnected||left<=0){clearInterval(timer);sendCode.disabled=false;sendCode.textContent=t.resend;return;}
  sendCode.disabled=true;sendCode.textContent=fill(t.resendIn,{n:left});left--;};tick();timer=setInterval(tick,1000);};
 codeInput.oninput=()=>{codeInput.value=codeInput.value.replace(/\D/g,'').slice(0,6);};
 sendCode.onclick=async()=>{
  sendCode.disabled=true;sentLine.hidden=false;sentLine.dataset.state='busy';sentLine.textContent=t.sending;
  try{const r=await api('account_password_code',{});sentLine.dataset.state='';sentLine.innerHTML=fill(t.sentTo,{email:esc(r.email)});countdown(60);codeInput.focus();}
  catch(error){sentLine.dataset.state='error';sentLine.textContent=errorText(t,error);const retry=Number(error?.detail?.retryAfter)||0;if(retry)countdown(retry);else sendCode.disabled=false;}
 };
 const save=form.querySelector('[data-password-save]');
 save.onclick=async()=>{
  const next=form.querySelector('[data-new]').value,again=form.querySelector('[data-repeat]').value,current=proof==='current'?form.querySelector('[data-current]').value:'',code=proof==='code'?codeInput.value:'';
  if(proof==='current'&&!current){toast(t.err.WRONG_PASSWORD);form.querySelector('[data-current]').focus();return;}
  if(proof==='code'&&!/^\d{6}$/.test(code)){toast(t.err.CODE_REQUIRED);(sendCode.disabled?codeInput:sendCode).focus();return;}
  if(next.length<8||next.length>128){toast(t.err.PASSWORD_LENGTH);return;}
  if(next!==again){toast(t.mismatch);return;}
  form.querySelectorAll('input,button').forEach(el=>el.disabled=true);
  try{await api('account_password',{password:next,current,code});clearInterval(timer);form.reset();toast(t.passwordDone);await onChange();}
  catch(error){toast(errorText(t,error));form.querySelectorAll('input,button').forEach(el=>el.disabled=false);const raw=String(error?.code||error?.message||'');if(raw.includes('CODE_REQUIRED')){proof='code';showProof();}else if(!proof&&raw.includes('WRONG_PASSWORD')){proof=hasPassword?'current':'code';showProof();}}
 };
 const setName=box.querySelector('[data-username-set]');
 if(setName){
  const input=box.querySelector('[data-username]');input.onkeydown=e=>{if(e.key==='Enter')setName.click();};
  setName.onclick=()=>{
   const name=input.value.trim();if(!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(name)){toast(t.err.USERNAME_INVALID);input.focus();return;}
   const dialog=document.createElement('dialog');dialog.innerHTML=`<h2>${t.usernameConfirmTitle}</h2><p class="dialog-word">${esc(name)}</p><p>${t.usernameConfirmBody}</p><div class="dialog-actions"><button class="secondary" data-no>${t.cancel}</button><button class="primary" data-yes>${t.usernameSet}</button></div>`;
   document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.querySelector('[data-no]').onclick=()=>dialog.close();
   dialog.querySelector('[data-yes]').onclick=async()=>{dialog.querySelectorAll('button').forEach(b=>b.disabled=true);try{await api('account_username',{username:name});
    dialog.close();toast(t.usernameDone);await onChange();}catch(error){dialog.close();toast(errorText(t,error));if(String(error?.code||error?.message||error).includes('USERNAME_LOCKED'))await onChange();
    }};
   dialog.showModal();
  };
 }
}
export async function renderAccount({target,api,locale,esc,toast}){
 const t=T[locale]||T.zh,fill=(s,v)=>s.replace(/\{(\w+)\}/g,(_,k)=>esc(String(v[k]??'')));
 const when=ms=>ms?new Date(ms).toLocaleString(locale==='zh'?'zh-CN':locale==='ja'?'ja-JP':'en-US'):t.never;
 let status;try{status=await api('account_status',{});}catch(error){target.innerHTML=`<section class="panel"><h2>${t.title}</h2><p class="settings-help u-status" data-state="error">${esc(errorText(t,error))}</p></section>`;
  return;}
 const kindRows=kinds=>KINDS.map(k=>`<label class="settings-row"><span class="settings-label">${t[k]}</span><input class="switch" type="checkbox" data-kind="${k}" ${kinds[k]?'checked':''}></label>`).join('');
 const busy=(on,root=target)=>root.querySelectorAll('button,input').forEach(el=>el.disabled=on);
 const fail=error=>{toast(errorText(t,error));if(String(error?.message||'').includes('UNAUTHORIZED'))paint().catch(()=>{});};
 async function paint(){
  status=await api('account_status',{autoSync:false});
  if(!status.configured){target.innerHTML=`<section class="panel"><h2>${t.title}</h2><p class="settings-help">${t.notReady}</p></section>`;return;}
  if(!status.loggedIn){
   target.innerHTML=`<section class="panel account-login"><h2>${t.title}</h2><p class="settings-help">${t.intro}</p><p class="settings-help">${t.privacy}</p><div data-email-login></div>
    <h3 class="settings-label" style="margin:22px 0 4px">${t.kinds}</h3>${kindRows(status.kinds)}</section>`;
   const chosen=()=>Object.fromEntries([...target.querySelectorAll('[data-kind]')].map(el=>[el.dataset.kind,el.checked]));
   mountEmailLogin(target.querySelector('[data-email-login]'),{api,locale,esc,toast,kinds:chosen,suggest:'inline',onDone:()=>paint()});
   return;
  }
  const pending=Object.values(status.pending||{}).reduce((a,b)=>a+b,0);
  target.innerHTML=`<section class="panel account-panel"><h2>${t.title}</h2>
    <div class="settings-row"><span><span class="settings-label">${t.loggedAs}</span><p class="settings-help">${esc(status.email)}</p></span></div>
    <label class="settings-row"><span><span class="settings-label">${t.webSync}</span><p class="settings-help">${t.webSyncHelp}</p></span><input class="switch" type="checkbox" data-websync ${status.webSync?'checked':''}></label>
    <div class="settings-row"><span><span class="settings-label">${t.lastSync}</span><p class="settings-help" data-last>${esc(when(status.lastSyncAt))}${pending?' · '+fill(t.pending,{n:pending}):''}${status.lastError?' · '+esc(errorText(t,status.lastError)):''}</p></span><button class="primary" data-sync ${status.webSync?'':'disabled'}>${status.syncing?t.syncing:t.syncNow}</button></div>
    <div data-methods></div>
    <h3 class="settings-label" style="margin:22px 0 4px">${t.kinds}</h3>${kindRows(status.kinds)}<p class="settings-help">${t.privacy}</p>
    <h3 class="settings-label" style="margin:22px 0 4px">${t.devices}</h3><div data-devices><p class="settings-help">…</p></div>
    <div class="review-controls" style="justify-content:flex-start;margin-top:22px"><button class="secondary" data-logout>${t.logout}</button><button class="secondary" data-wipe>${t.wipe}</button><button class="secondary" data-remove>${t.remove}</button></div></section>`;
  const syncButton=target.querySelector('[data-sync]');
  syncButton.onclick=async()=>{syncButton.disabled=true;syncButton.textContent=t.syncing;try{await api('account_sync',{});toast(t.synced);}catch(error){fail(error);
   }await paint().catch(()=>{});};
  target.querySelectorAll('[data-kind]').forEach(el=>el.onchange=async()=>{try{await api('account_kinds',{kinds:{[el.dataset.kind]:el.checked}});}catch(error){el.checked=!el.checked;
   fail(error);}});
  const webSwitch=target.querySelector('[data-websync]');
  webSwitch.onchange=async()=>{webSwitch.disabled=true;try{await api('account_web_sync',{enabled:webSwitch.checked});}catch(error){fail(error);}await paint().catch(()=>{});};
  target.querySelector('[data-wipe]').onclick=()=>{
   const dialog=document.createElement('dialog');dialog.innerHTML=`<h2>${t.wipeTitle}</h2><p>${t.wipeBody}</p><div class="dialog-actions"><button class="secondary" data-no>${t.cancel}</button><button class="primary" data-yes>${t.confirm}</button></div>`;
   document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.querySelector('[data-no]').onclick=()=>dialog.close();
   dialog.querySelector('[data-yes]').onclick=async()=>{busy(true,dialog);try{await api('account_wipe_cloud',{});dialog.close();toast(t.wiped);await paint();}catch(error){busy(false,dialog);fail(error);}};
   dialog.showModal();
  };
  target.querySelector('[data-logout]').onclick=async()=>{busy(true);try{await api('account_logout',{});toast(t.loggedOut);}catch(error){fail(error);}await paint().catch(()=>{
   });};
  target.querySelector('[data-remove]').onclick=()=>{
   const dialog=document.createElement('dialog');dialog.innerHTML=`<h2>${t.removeTitle}</h2><p>${t.removeBody}</p><p>${esc(status.email)}</p><div class="dialog-actions"><button class="secondary" data-no>${t.cancel}</button><button class="primary" data-yes>${t.confirm}</button></div>`;
   document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.querySelector('[data-no]').onclick=()=>dialog.close();
   dialog.querySelector('[data-yes]').onclick=async()=>{busy(true,dialog);try{await api('account_delete',{});dialog.close();toast(t.removed);await paint();}catch(error){
    busy(false,dialog);fail(error);}};
   dialog.showModal();
  };
  const methods=me=>{const box=target.querySelector('[data-methods]');if(box)mountSignInMethods(box,{api,locale,esc,toast,status,me,onChange:()=>paint()});};
  methods(null);
  /* while a sync runs the page refreshes every 3 s, but never under someone typing a user name or password */
  if(status.syncing){const again=()=>{if(!target.isConnected)return;if(target.querySelector('[data-methods] input:focus,[data-methods] [data-password-form]:not([hidden]),[data-methods] [data-username]:not(:placeholder-shown)'))setTimeout(again,
   3000);else paint().catch(()=>{});};setTimeout(again,3000);}
  try{
   const me=await api('account_me',{}),box=target.querySelector('[data-devices]');if(!box)return;if(!status.passwordKnown||(me.username||'')!==status.username||!!me.hasPassword!==status.hasPassword)methods(me);
   box.innerHTML=(me.devices||[]).map(d=>`<div class="settings-row"><span><span class="settings-label">${esc(d.device)}${d.current?` · ${t.thisDevice}`:''}</span><p class="settings-help">${esc(when((d.lastUsedAt||0)*1000))}</p></span>${d.current?'':`<button class="secondary" data-revoke="${esc(d.id)}">${t.revoke}</button>`}</div>`).join('');
   box.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('account_logout',{sessionId:b.dataset.revoke});b.closest('.settings-row').remove();
    }catch(error){b.disabled=false;fail(error);}});
  }catch(error){const box=target.querySelector('[data-devices]');if(box)box.innerHTML=`<p class="settings-help u-status" data-state="error">${esc(errorText(t,error))}</p>`;
   }
 }
 /* the first account_status above also starts a background sync when the last one is older than 15 minutes */
 await paint();
}
