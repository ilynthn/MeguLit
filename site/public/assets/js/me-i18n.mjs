// SPDX-License-Identifier: GPL-3.0-or-later
/* megulit.com /me/ text, zh / ja / en. The language is the site's own choice (localStorage megulit-lang). */
export const STRINGS = {
  zh: {
    title: '个人中心', signIn: '登录', signInHint: '用 MeguLit 账号登录，看你在桌面端同步上来的学习数据', typed: 'your grimoire, synced',
    email: '邮箱', emailPh: 'you@example.com', sendCode: '发送验证码', code: '验证码', codePh: '6 位数字', verify: '登录', sentTo: '验证码已发到 {email}，10 分钟内有效',
    loginId: '邮箱或用户名', password: '密码', modeCode: '验证码登录', modePassword: '密码登录',
    noAccount: '还没有账号？在 MeguLit 桌面端「设置 → 账号」里登录一次就会自动创建。网页不会改动你的学习数据',
    tabStats: '看板', tabLines: '收藏句子', tabWords: '单词本', tabRoute: '阅读进度',
    welcome: 'おかえり,', lastSync: '上次同步 {when}', never: '还没有同步', offline: '离线 · 上次同步 {when} · 已同步的内容可离线查看', syncing: '同步中…', syncNow: '立即同步',
    readTime: '阅读时长', chars: '读过的字', wordsSaved: '单词本', linesSaved: '收藏句子', streak: '连读 {n} 天', hours: '时', minutes: '分',
    last30: '近 30 天', minutesPerDay: 'minutes per day', routes: 'routes', recent: '最近收藏', mastery: '熟练度', masteryNew: '新词', masteryLearning: '学习中', masteryKnown: '已掌握',
    studyTitle: '学习记录', lookups: '查词', reviews: '复习', newWords: '新增单词', byGame: '各作品阅读时间',
    search: '搜索原文或译文', allGames: '全部作品', tapHint: '点一下句子里的字查词', noLines: '还没有收藏的句子。在桌面端读游戏时收藏，会自动出现在这里', noWords: '单词本是空的', noMatch: '没有匹配的内容',
    allStatus: '全部', example: '例句', noRoute: '还没有阅读进度。在桌面端读几句就会出现', progressUnknown: '进度未知', read: '已读', ofTotal: '共 {n} 行', played: '最近 {when}',
    bookmarks: '书签（收藏的句子）', inWordbook: '在单词本里', notInWordbook: '不在单词本', dictOff: '词典还没下载，联网后点一下字就会自动下载并缓存', noEntry: '词典里没有找到这个词',
    menu: '菜单', signOut: '退出登录', signedOutNote: '退出会清掉这台设备上缓存的数据', downloadDict: '下载完整离线词典', dictProgress: '词典 {done} / {total}', dictDone: '词典已下载，离线也能查词', cancel: '取消',
    close: '关闭', loading: '加载中…', error: '出错了：{code}', sessionExpired: '登录已过期，请重新登录', deviceNote: '网页是只读的：想改收藏或删数据，请在桌面端操作',
    tabAccount: '账号', pwTitle: '密码', pwHas: '已设置密码。桌面端和网页都可以用邮箱或用户名加密码登录', pwNone: '还没有设置密码。设置后，桌面端和网页都能用邮箱或用户名加密码登录，不用等验证码',
    setPassword: '设置密码', changePassword: '修改密码', currentPassword: '当前密码', newPassword: '新密码', newPasswordPh: '至少 8 位', repeatPassword: '再输入一次新密码',
    forgotCurrent: '忘记当前密码？用邮箱验证码重设', useCurrent: '改用当前密码', pwCode: '邮箱验证码', pwCodeHelp: '为了确认是你本人，先给 {email} 发一个验证码',
    passwordDone: '密码已保存，下次可以用密码登录', mismatch: '两次输入的新密码不一样', otherDevices: '改密码后，其他已登录的设备不会被退出。需要的话，在桌面端「设置 → 账号 → 已登录的设备」里逐个移除',
    accountEmail: '登录邮箱',
    errors: { QUOTA_EXCEEDED: '服务器今日额度已满，北京时间 8 点恢复', CODE_REQUIRED: '请先发送邮箱验证码并填写', PASSWORD_LENGTH: '密码需要 8–128 位', PASSWORD_WEAK: '密码太简单了，换一个吧', EMAIL_INVALID: '邮箱格式不对', WRONG_CODE: '验证码不对', CODE_EXPIRED: '验证码已过期，请重新发送', TOO_MANY_TRIES: '错误次数太多，请重新发送', NO_CODE: '请先发送验证码', RATE_LIMITED: '操作太频繁，请稍后再试', WRONG_PASSWORD: '账号或密码不对', EMAIL_NOT_CONFIGURED: '邮件服务还在准备中', EMAIL_SEND_FAILED: '邮件发送失败，请稍后再试', NETWORK: '连不上服务器，请检查网络', other: '操作失败，请稍后再试' },
    today: '今天', yesterday: '昨天'
  },
  ja: {
    title: 'マイページ', signIn: 'ログイン', signInHint: 'MeguLit アカウントでログインして、デスクトップから同期した学習データを見ます', typed: 'your grimoire, synced',
    email: 'メールアドレス', emailPh: 'you@example.com', sendCode: '確認コードを送信', code: '確認コード', codePh: '6 桁の数字', verify: 'ログイン', sentTo: '{email} に確認コードを送りました（10 分間有効）',
    loginId: 'メールまたはユーザー名', password: 'パスワード', modeCode: '確認コードでログイン', modePassword: 'パスワードでログイン',
    noAccount: 'アカウントがない場合は、MeguLit デスクトップの「設定 → アカウント」で一度ログインすると作られます。Web から学習データが変更されることはありません',
    tabStats: 'ダッシュボード', tabLines: '保存した文', tabWords: '単語帳', tabRoute: '読書の進み',
    welcome: 'おかえり,', lastSync: '前回の同期 {when}', never: 'まだ同期していません', offline: 'オフライン · 前回の同期 {when} · 同期済みの内容は見られます', syncing: '同期中…', syncNow: '今すぐ同期',
    readTime: '読書時間', chars: '読んだ文字数', wordsSaved: '単語帳', linesSaved: '保存した文', streak: '{n} 日連続', hours: '時間', minutes: '分',
    last30: '直近 30 日', minutesPerDay: 'minutes per day', routes: 'routes', recent: '最近保存', mastery: '習熟度', masteryNew: '新規', masteryLearning: '学習中', masteryKnown: '習得済み',
    studyTitle: '学習の記録', lookups: '辞書引き', reviews: '復習', newWords: '追加した単語', byGame: '作品ごとの読書時間',
    search: '原文・訳を検索', allGames: 'すべての作品', tapHint: '文中の文字をタップすると辞書が引けます', noLines: '保存した文はまだありません。デスクトップで保存するとここに表示されます', noWords: '単語帳は空です', noMatch: '一致するものがありません',
    allStatus: 'すべて', example: '例文', noRoute: '読書の進み具合はまだありません。デスクトップで少し読むと表示されます', progressUnknown: '進み具合は不明', read: '既読', ofTotal: '全 {n} 行', played: '最近 {when}',
    bookmarks: 'しおり（保存した文）', inWordbook: '単語帳にあります', notInWordbook: '単語帳にありません', dictOff: '辞書はまだ入っていません。オンラインで文字をタップすると自動で取得・保存されます', noEntry: '辞書に見つかりませんでした',
    menu: 'メニュー', signOut: 'ログアウト', signedOutNote: 'ログアウトすると、この端末に保存したデータを消します', downloadDict: '辞書を全部ダウンロード', dictProgress: '辞書 {done} / {total}', dictDone: '辞書をダウンロードしました。オフラインでも引けます', cancel: 'キャンセル',
    close: '閉じる', loading: '読み込み中…', error: 'エラー: {code}', sessionExpired: 'ログインの期限が切れました。もう一度ログインしてください', deviceNote: 'Web は閲覧専用です。保存内容の変更や削除はデスクトップで行ってください',
    tabAccount: 'アカウント', pwTitle: 'パスワード', pwHas: 'パスワードは設定済みです。デスクトップでも Web でも、メールアドレスかユーザー名とパスワードでログインできます', pwNone: 'パスワードは未設定です。設定すると、デスクトップでも Web でも確認コードを待たずにログインできます',
    setPassword: 'パスワードを設定', changePassword: 'パスワードを変更', currentPassword: '現在のパスワード', newPassword: '新しいパスワード', newPasswordPh: '8 文字以上', repeatPassword: '新しいパスワード（確認）',
    forgotCurrent: '現在のパスワードを忘れた場合は、メールの確認コードで再設定', useCurrent: '現在のパスワードを使う', pwCode: 'メールの確認コード', pwCodeHelp: '本人確認のため、{email} に確認コードを送ります',
    passwordDone: 'パスワードを保存しました。次回からパスワードでログインできます', mismatch: '新しいパスワードが一致しません', otherDevices: 'パスワードを変更しても、ほかのデバイスはログアウトされません。必要なら、デスクトップの「設定 → アカウント → ログイン中のデバイス」から個別に解除してください',
    accountEmail: 'ログイン用メールアドレス',
    errors: { QUOTA_EXCEEDED: 'サーバーの本日の利用枠が上限に達しました。北京時間 8 時（日本時間 9 時）に回復します', CODE_REQUIRED: '先にメールの確認コードを送信して入力してください', PASSWORD_LENGTH: 'パスワードは 8〜128 文字にしてください', PASSWORD_WEAK: 'パスワードが単純すぎます', EMAIL_INVALID: 'メールアドレスの形式が違います', WRONG_CODE: '確認コードが違います', CODE_EXPIRED: '確認コードの期限が切れました。再送信してください', TOO_MANY_TRIES: '入力ミスが多すぎます。再送信してください', NO_CODE: '先に確認コードを送信してください', RATE_LIMITED: '操作が多すぎます。しばらくしてからお試しください', WRONG_PASSWORD: 'アカウントまたはパスワードが違います', EMAIL_NOT_CONFIGURED: 'メールサービスは準備中です', EMAIL_SEND_FAILED: 'メールを送信できませんでした', NETWORK: 'サーバーに接続できません。ネットワークを確認してください', other: '失敗しました。しばらくしてからお試しください' },
    today: '今日', yesterday: '昨日'
  },
  en: {
    title: 'My MeguLit', signIn: 'Sign in', signInHint: 'Sign in with your MeguLit account to see the study data your desktop app synced', typed: 'your grimoire, synced',
    email: 'Email', emailPh: 'you@example.com', sendCode: 'Send code', code: 'Code', codePh: '6 digits', verify: 'Sign in', sentTo: 'Code sent to {email}, valid for 10 minutes',
    loginId: 'Email or user name', password: 'Password', modeCode: 'Sign in with a code', modePassword: 'Sign in with a password',
    noAccount: 'No account yet? Sign in once from MeguLit on your PC (Settings → Account) and it is created. The web never changes your study data',
    tabStats: 'Stats', tabLines: 'Saved lines', tabWords: 'Words', tabRoute: 'Progress',
    welcome: 'Welcome back,', lastSync: 'Last sync {when}', never: 'Not synced yet', offline: 'Offline · last sync {when} · what was synced is still here', syncing: 'Syncing…', syncNow: 'Sync now',
    readTime: 'Reading time', chars: 'Characters read', wordsSaved: 'Words saved', linesSaved: 'Lines saved', streak: '{n}-day streak', hours: 'h', minutes: 'm',
    last30: 'Last 30 days', minutesPerDay: 'minutes per day', routes: 'routes', recent: 'Recent lines', mastery: 'Mastery', masteryNew: 'New', masteryLearning: 'Learning', masteryKnown: 'Known',
    studyTitle: 'Study log', lookups: 'Look-ups', reviews: 'Reviews', newWords: 'New words', byGame: 'Reading time by work',
    search: 'Search text or translation', allGames: 'All works', tapHint: 'Tap a character in a line to look it up', noLines: 'No saved lines yet. Save one while reading on your PC and it shows up here', noWords: 'The word book is empty', noMatch: 'Nothing matches',
    allStatus: 'All', example: 'Examples', noRoute: 'No reading progress yet. Read a few lines on your PC and it appears', progressUnknown: 'Progress unknown', read: 'Read', ofTotal: '{n} lines', played: 'Last {when}',
    bookmarks: 'Bookmarks (saved lines)', inWordbook: 'In your word book', notInWordbook: 'Not in your word book', dictOff: 'The dictionary is not downloaded yet. Tap a character while online and it downloads and stays cached', noEntry: 'Not found in the dictionary',
    menu: 'Menu', signOut: 'Sign out', signedOutNote: 'Signing out clears the data cached on this device', downloadDict: 'Download the full offline dictionary', dictProgress: 'Dictionary {done} / {total}', dictDone: 'Dictionary downloaded, look-ups work offline', cancel: 'Cancel',
    close: 'Close', loading: 'Loading…', error: 'Something went wrong: {code}', sessionExpired: 'Your sign-in expired, please sign in again', deviceNote: 'The web is read-only: change or delete data from the desktop app',
    tabAccount: 'Account', pwTitle: 'Password', pwHas: 'A password is set. You can sign in on the desktop app and the web with your email or user name and password', pwNone: 'No password yet. With one you can sign in on the desktop app and the web without waiting for a code',
    setPassword: 'Set password', changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password', newPasswordPh: 'At least 8 characters', repeatPassword: 'Repeat the new password',
    forgotCurrent: 'Forgot your current password? Reset it with an email code', useCurrent: 'Use the current password instead', pwCode: 'Email code', pwCodeHelp: 'To confirm it is you, we send a code to {email} first',
    passwordDone: 'Password saved, you can sign in with it next time', mismatch: 'The two new passwords do not match', otherDevices: 'Changing the password does not sign out your other devices. If you need to, remove them one by one in the desktop app under Settings → Account → Signed-in devices',
    accountEmail: 'Sign-in email',
    errors: { QUOTA_EXCEEDED: 'The server has used up today’s quota. It comes back at 08:00 Beijing time (00:00 UTC)', CODE_REQUIRED: 'Send the email code first and enter it', PASSWORD_LENGTH: 'Passwords need 8–128 characters', PASSWORD_WEAK: 'That password is too simple', EMAIL_INVALID: 'That email address does not look right', WRONG_CODE: 'Wrong code', CODE_EXPIRED: 'The code expired, send a new one', TOO_MANY_TRIES: 'Too many wrong codes, send a new one', NO_CODE: 'Send a code first', RATE_LIMITED: 'Too many attempts, try again later', WRONG_PASSWORD: 'Wrong account or password', EMAIL_NOT_CONFIGURED: 'Email delivery is not ready yet', EMAIL_SEND_FAILED: 'Could not send the email, try again later', NETWORK: 'Cannot reach the server, check your connection', other: 'Something went wrong, try again later' },
    today: 'today', yesterday: 'yesterday'
  }
};
export function pickLang(saved, languages = []) {
  const want = [saved, ...languages].filter(Boolean).map(s => String(s).toLowerCase());
  for (const w of want) { if (w.startsWith('zh')) return 'zh'; if (w.startsWith('ja')) return 'ja'; if (w.startsWith('en')) return 'en'; }
  return 'zh';
}
export const fill = (text, vars = {}) => String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
export function translator(lang) { const table = STRINGS[lang] || STRINGS.zh; return (key, vars) => fill(table[key] ?? STRINGS.zh[key] ?? key, vars); }
export const errorText = (lang, code) => (STRINGS[lang] || STRINGS.zh).errors[code] || (STRINGS[lang] || STRINGS.zh).errors.other;
