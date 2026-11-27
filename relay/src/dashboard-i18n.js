// SPDX-License-Identifier: GPL-3.0-or-later
/* Dashboard text, Chinese + English. DASH_DICT: key -> [zh, en]. Placeholders {0} {1} are filled by t(key, a, b).
   ADMIN_EN: zh source string/fragment -> en, used by the Seed admin client (its strings are built from Chinese
   fragments, so it translates by exact match first, then by longest-fragment substitution). */
export const DASH_DICT={
 'title':['MeguLit 运行看板','MeguLit Live Ops'],
 'nav.seed':['Seed 管理','Seed admin'],
 'lang.aria':['切换语言','Switch language'],
 
 'loading':['加载中…','Loading…'],'nodata':['暂无数据','No data'],'norows':['暂无数据','No rows'],
 
 
 
 'k.now1h':['当前 / 近 1 小时','Now / 1h'],'k.avg6h':['6 小时均值','6h avg'],'u.per10':[' /10 分钟',' per 10 min'],
 
 's.active1h':['1 小时活跃','Active 1h'],'s.activeToday':['今日活跃','Active today'],'s.active24h':['24 小时活跃','Active 24h'],
 's.peak10':['10 分钟峰值','Peak 10 min'],'s.avgOnline':['平均在线','Avg online'],
 's.long':['超 1 小时会话','1h+ sessions'],
 's.reporters':['上报者','Reporters'],'s.perGame':['每作品上报','Per game'],
 
 
 'h.peakHour':['峰值小时','Peak hour'],'h.at':['于 {0}','at {0}'],'h.avgHour':['小时均值','Avg / hour'],'h.quiet':['空闲小时','Quiet hours'],
 'h.thisHour':['本小时','This hour'],'h.busy3':['最忙 3 小时','Busiest 3h'],'h.vsAvg':['对比均值 {0}','vs {0} avg'],
 
 'q.workers':['Workers 请求','Workers requests'],'q.d1r':['D1 读取','D1 reads'],'q.d1w':['D1 写入','D1 writes'],'q.d1s':['D1 存储','D1 storage'],
 'q.r2s':['R2 存储','R2 storage'],'q.r2a':['R2 A 类操作','R2 class A'],'q.r2b':['R2 B 类操作','R2 class B'],'q.ai':['AI neurons','AI neurons'],'q.gh':['GitHub API','GitHub API'],
 'q.day':['每日','per day'],'q.mo':['每月','per month'],'q.hr':['每小时','per hour'],'q.total':['总量','total'],'q.est':['估算','estimate'],
 'q.reset':['每日重置还有 {0} 小时 {1} 分 · R2 操作按月 · GitHub 按小时','Daily reset in {0}h {1}m · R2 ops monthly · GitHub hourly'],
 'q.offline':['CF 用量不可用','CF usage offline'],'q.needs':[' · 需要 CF_API_TOKEN',' · needs CF_API_TOKEN'],
 
 'seed.counting':['正在统计 The Seed/（首次统计在后台运行）','Counting The Seed/ (the first count runs in the background)'],
 'seed.games':['已收录作品','games seeded'],'seed.versions':['个 exe 版本','exe versions'],
 
 'seed.verified':['已验证','verified'],'seed.ownerok':['作者确认','owner-ok'],'seed.read':['已读取','read'],'seed.skeleton':['骨架','skeleton'],'seed.other':['其他','other'],
 
 'seed.updated':[' · 更新于 {0}',' · updated {0}'],
 
 'card.none':['暂无 Cardinal 数据','No Cardinal data'],'card.scores':['今日评分','scores today'],'card.total':['累计 {0}','{0} in total'],
 'card.upgraded':['今日升级 {0}','upgraded today {0}'],'card.repair':['今日入修复队列 {0}','repair queue today {0}'],
 'card.note':['Cardinal 已验证 {0} · 修复队列中 {1} · 日界 UTC+8','verified by Cardinal {0} · in repair queue {1} · day = UTC+8'],
 
 'why.quality':['探针质量','Probe quality'],'why.desens':[' · {0} 份脱敏探针',' · {0} desensitized probes'],
 'why.vndb':['VNDB 已匹配','VNDB matched'],'why.issues':['GitHub Issues','GitHub issues'],'why.adapted':['已适配','Adapted'],
 'why.dumps':[' / {0} 份完整转储 · {1}%',' / {0} full dumps · {1}%'],
 
 'a.packs':['适配包','Packs'],'a.packsv':[' {0} 部作品 · {1} 已撤回',' {0} games · {1} withdrawn'],'a.records':['共享记录','Shared records'],
 'a.recReports':['记录举报','Record reports'],'a.probeReq':['探针请求','Probe requests'],'a.probeReqv':[' 待处理 / {0}',' open / {0}'],
 'a.packReports':['适配包报告','Pack reports'],'a.contrib':['贡献上传','Contrib uploads'],'a.uploads':['上传','Uploads'],
 'a.diag':['诊断','Diagnostics'],'a.diagIssues':['诊断 Issues','Diag issues'],'a.bundles':['探针包','Probe bundles'],
 
 'ac.total':['账号总数','Accounts'],'ac.login7':['7 日登录','Logged in 7d'],'ac.sessions':['在线会话','Live sessions'],'ac.records':['已同步记录','Synced records'],
 'ac.users':['已同步用户','Synced users'],'ac.byKind':['按类型同步','Sync by kind'],'d7':[' 7 日',' 7d'],
 
 'c.boardUsers':['榜单用户','Board users'],'c.share':[' {0} 人分享作品',' {0} share games'],'c.boardActive':['榜单活跃','Board active'],
 'c.chars':['阅读字数','Chars read'],'c.time':['阅读时长','Time read'],'c.games':['统计作品数','Games tracked'],
 'c.forum':['论坛','Forum'],'c.posts':['帖子','Posts'],'c.replies':['回复','Replies'],'c.authors':['作者','Authors'],
 'c.social':['社交','Social'],'c.profiles':['个人主页','Profiles'],'c.public':[' {0} 公开',' {0} public'],'c.follows':['关注','Follows'],
 'c.lookups':['查词','Lookups'],'c.lookupsv':[' {0} 词 · {1} 用户',' {0} words · {1} users'],'c.avatar':['头像 {0}','avatar {0}'],
 
 't.title':['标题','Title'],'t.ppl':['人数','Ppl'],'t.chars':['字数','Chars'],'t.time':['时长','Time'],'t.seen':['最近','Seen'],
 't.why':['原因','Why'],'t.size':['大小','Size'],'t.state':['状态','State'],'t.full':['完整','full'],
 'playing.none':['本周榜单上无人阅读','Nobody on the board read this week'],
 
 'st.r2used':['R2 已用','R2 used'],
 'st.free':[' / 10 GB 免费额度',' / 10 GB free'],'st.inflight':['进行中','In flight'],'st.lastpart':[' · 最近分片 {0}',' · last part {0}'],
 'st.byapp':['按应用版本的转储','Dumps by app version'],
 
 
 'f.ready':['就绪','Ready'],'f.uploading':['上传中','Uploading'],'f.done':['已完成','Done'],'f.stored':['已存储','Stored'],'f.avg':['平均每份','Avg / dump'],'f.last':['最近上传','Last upload'],
 'log.lat':['延迟 {0}ms','Latency {0}ms'],
 'log.attached':['会话已连接','session attached'],'log.failed':['所有节点均请求失败 · {0} 秒后重试','failed on every node · retry in {0}s'],
 'log.render':['面板渲染失败 {0}：{1}','render {0}: {1}'],'log.renderOk':['面板 {0} 已恢复','render {0} ok again'],'log.server':['服务端 {0}：{1}','server {0}: {1}'],
 'log.agg':['聚合数据暂不可用，{0} 秒后重试','aggregates unavailable, retry in {0}s'],
 'st.link':['在线','LIVE'],'st.down':['离线','DOWN'],'st.timeout':['超时','timeout'],'foot.ext':['聚合 {0}','ext {0}'],'foot.poll':['每 {0} 秒刷新','poll {0}s'],
 'ago.suf':['前',' ago'],'u.s':['{0} 秒','{0}s'],'u.m':['{0} 分钟','{0}m'],'u.h':['{0} 小时 {1} 分','{0}h{1}m'],'u.d':['{0} 天','{0}d'],
 
 
 /* v2 layout copy: every card = title + one-sentence description + source */
 'src':['数据来源','Source'],
 'nav.overview':['概览','Overview'],'nav.calib':['校准与适配','Calibration'],'nav.comm':['社区','Community'],'nav.works':['作品与存储','Titles & storage'],
 'h.overview':['概览','Overview'],'h.calib':['校准与适配','Calibration & adapters'],'h.comm':['用户与社区','Users & community'],'h.works':['作品、存储与运行记录','Titles, storage & run log'],
 'hd.overview':['此刻有多少人在用，以及最近一天的变化','How many people are using MeguLit right now, and how the last day went'],
 'hd.calib':['适配库的进度、探针的状态，以及玩家回传的数据','Adapter library progress, probe health and data players send back'],
 'hd.comm':['账号、同步、榜单与论坛的使用量','Accounts, sync, leaderboard and forum activity'],
 'hd.works':['哪些作品被探测、存储用了多少、请求是否正常','Which titles were probed, how much storage is used, and whether requests are healthy'],
 'k.online':['当前在线','Online now'],'k.online.d':['近 10 分钟内有心跳的玩家，单位：人 · 页面打开后的峰值 {0}','Players with a heartbeat in the last 10 min, people · peak since this page opened {0}'],
 'k.a24':['24 小时活跃','Active in 24h'],'k.a24.d':['过去 24 小时出现过的玩家，单位：人','Players seen in the last 24 hours, people'],
 'k.today':['今日活跃','Active today'],'k.today.d':['今天出现过的玩家，单位：人 · 其中近 1 小时 {0} 人','Players seen today, people · {0} in the last hour'],
 'k.seed':['已收录作品','Games seeded'],'k.seed.d':['The Seed 适配库中的作品数 · 已确认 {0}%','Games in The Seed library · {0}% confirmed'],
 'k.probed':['已探测作品','Probed games'],'k.probed.d':['有玩家上报探针的作品数 · 共 {0} 位上报者','Games with player probe reports · {0} reporters'],
 'vs.poll':['较上次 {0}','{0} vs last poll'],
 'c.hour':['每小时在线人数','Online players per hour'],'c.hour.d':['过去 24 小时，每小时的在线人数，单位：人。悬停柱子查看具体数值。','The last 24 hours, online players per hour, people. Hover a bar for the exact value.'],
 'c.six':['近 6 小时走势','Last 6 hours'],'c.six.d':['每 10 分钟一个点的在线人数，单位：人。','Online players, one point per 10 minutes, people.'],
 'c.table':['表格视图','Table view'],'c.hourcol':['时间','Time'],'c.valcol':['人数','Players'],'c.unit':['{0} 人','{0} players'],
 'p.act':['玩家活跃','Player activity'],'p.act.d':['活跃玩家数与会话时长，单位：人 / 分钟。','Active players and session length, people / minutes.'],
 'p.quota2':['免费额度用量','Free-plan quota'],'p.quota2.d':['各项服务已用额度占上限的比例，超过 80% 标红。','Share of each free limit already used; over 80% turns red.'],
 'p.seed2':['The Seed 适配库','The Seed library'],'p.seed2.d':['已收录的作品与 exe 版本，按是否已被确认分类。','Games and exe versions in the library, split by whether they are confirmed.'],
 'p.cardinal2':['Cardinal 回放评分','Cardinal replay scores'],'p.cardinal2.d':['玩家回放后回传的评分：今日数量、升级为已验证、进入修复队列。','Scores sent back after replays: today\'s count, upgrades to verified, and repair-queue entries.'],
 'p.why2':['探针停在哪一步','Where probes stop'],'p.why2.d':['玩家上报的探针按步骤分布，以及探针质量，单位：份。','Player probe reports by step, plus probe quality, count.'],
 'p.adapters2':['适配包与上传','Adapter packs & uploads'],'p.adapters2.d':['适配包数量、举报，以及玩家贡献和诊断上传。','Adapter packs, reports, and player contributions and diagnostics.'],
 'p.accounts2':['账号与同步','Accounts & sync'],'p.accounts2.d':['注册账号、近 7 日登录，以及云同步的记录数。','Registered accounts, 7-day logins and cloud-sync records.'],
 'p.community2':['榜单、论坛与社交','Board, forum & social'],'p.community2.d':['阅读榜、论坛帖子、个人主页和查词的使用量。','Reading board, forum posts, profiles and word lookups.'],
 'p.playing2':['正在玩的作品','Being played now'],'p.playing2.d':['近 7 天榜单上有人阅读的作品，按最近阅读时间排序。','Titles read on the board in the last 7 days, newest first.'],
 'p.most2':['阅读最多的作品','Most-read titles'],'p.most2.d':['按累计阅读字数排名，单位：字。','Ranked by total characters read.'],
 'p.targets2':['探针作品','Probed titles'],'p.targets2.d':['按上报人数排序，附适配进度、完整转储大小和状态。','Sorted by reporters, with adapter step, full-dump size and state.'],
 'p.full2':['完整转储','Full dumps'],'p.full2.d':['玩家上传的完整探针包：就绪、上传中、已完成，以及 R2 占用。','Full probe bundles uploaded by players: ready, uploading, done, and R2 usage.'],
 'p.stor2':['存储占用','Storage'],'p.stor2.d':['R2 免费 10 GB 额度的构成，以及正在上传的任务。','What fills the 10 GB free R2 allowance, and uploads in flight.'],
 'p.log2':['请求日志','Request log'],'p.log2.d':['本页每 15 秒向两个节点拉取一次数据，记录状态与延迟，单位：毫秒。','This page polls both nodes every 15 s; status and latency in milliseconds.'],
 
 'lg.confirmed':['已确认（已验证 + 作者确认）','Confirmed (verified + owner-ok)'],'lg.waiting':['等待更多玩家（已读取 + 骨架）','Waiting for players (read + skeleton)'],
 
 
 'in.k.dumps':['完整转储','Full dumps'],'in.k.contrib':['贡献上传','Contributions'],'in.k.bundles':['探针包','Probe bundles'],'in.k.diag':['诊断','Diagnostics'],
 
 'pf.idle':['当前没有上传任务','No uploads in flight'],
 /* Seed admin (static parts) */
 'a.title':['The Seed 管理','The Seed admin'],'a.hint':['管理 · 需手动确认','admin · explicit actions'],'a.h2':['Seed 管理控制台','Seed admin console'],
 'a.token':['管理员凭证','Admin token'],'a.tokenph':['仅本页内存，不保存','Kept in page memory only, never saved'],'a.connect':['连接管理接口','Connect'],
 'a.disconnect':['断开并清除凭证','Disconnect & clear token'],'a.refresh':['刷新管理记录','Refresh records'],'a.policy':['自动处理 Seed','Auto-process Seed'],
 'a.adv':['高级管理','Advanced'],'a.catalog':['历史审核目录','Review catalog'],'a.catalogd':['这里汇总仓库版本、配置上报和候选等审核记录，实时待处理任务数见上方开关','Review records for repository versions, config reports and candidates. Live pending task counts are shown by the switch above.'],
 'a.state':['状态','State'],'a.all':['全部','All'],'s.pending':['待核查','Pending review'],'s.reviewing':['核查中','In review'],'s.needs':['需修改','Needs changes'],
 's.passed':['旧人工标记（非质量结论）','Legacy manual mark (not a quality verdict)'],'s.deleted':['已删除','Deleted'],
 'a.search':['搜索','Search'],'a.searchph':['作品、引擎、作者或版本','Title, engine, author or version'],'a.more':['读取下一页','Load next page'],
 'a.detailaria':['作品管理详情','Record details'],'a.detail0':['连接后选择一份记录查看证据与可用操作','Connect, then pick a record to see its evidence and actions'],
 'a.up':['上传者与各作品明细','Uploaders & per-title details'],'a.upcov':['仅统计新接收事件，上传标识不等于真人；旧历史未知','Counts new ingest events only. An upload ID is not a person; older history is unknown.'],
 'a.upload':['读取上传者明细','Load uploader details'],'a.upmore':['读取更多上传标识','Load more upload IDs'],
 'a.notice0':['未连接管理员会话，未发送管理请求','No admin session connected; no admin request sent']
};
export const ADMIN_EN={
 '待核查':'Pending review','核查中':'In review','需修改':'Needs changes','旧人工标记（非质量结论）':'Legacy manual mark (not a quality verdict)','已删除':'Deleted','未知':'Unknown',
 '在线':'Online','离线':'Offline','未确认':'Unconfirmed','繁忙':'Busy','未就绪':'Not ready','未配置':'Not configured','已开启':'Enabled','已暂停':'Paused',
 '上传留在队列':'Uploads stay queued','扫描通过后自动签发下发':'Auto-signed and released once the scan passes','等待空闲后继续处理':'Continues when idle','等待确认扫描服务状态':'Waiting to confirm scanner status',
 '，待处理 ':', pending ',' 份，扫描服务':' items, scanner ','，':', ','正在确认自动处理状态':'Checking auto-processing status',' · 待处理任务 ':' · pending tasks ',' 项 · 扫描中 ':' · scanning ',' · 实测中 ':' · live testing ',' · 扫描服务':' · scanner ',
 '实测宿主在线':'test host online','等待可信实测宿主':'waiting for a trusted test host','状态读取失败，请刷新':'Failed to read status, please refresh',
 '暂停 Seed 自动发布？已发布版本仍可接收，新的上传将排队。':'Pause automatic Seed publishing? Published versions are still served; new uploads will queue.',
 '恢复 Seed 自动发布并处理等待中的任务？':'Resume automatic Seed publishing and process waiting tasks?',
 '策略已由其他管理员更改，请核对当前状态':'The policy was changed by another admin; check the current state','操作结果待核对':'Outcome not yet confirmed',
 '授权未通过，凭证已清除，需要重新授权':'Authorization failed and the token was cleared; authorize again','授权未通过，凭证已清除；需要重新授权':'Authorization failed and the token was cleared; authorize again',
 '撤回文档或签名未通过服务器验证，请核对离线签名和受信公钥，未确认撤回':'The revocation document or signature failed server verification; check the offline signature and trusted public key. Revocation not confirmed',
 '管理接口或数据库尚未就绪，公共 dashboard 仍可查看；没有把失败当作空队列':'Admin API or database not ready; the public dashboard still works. The failure was not treated as an empty queue',
 '管理接口尚未接入，公共统计仍可查看':'Admin API not connected; public stats are still available','记录已改变，请刷新后重新确认':'The record changed; refresh and confirm again',
 '此版本已签名，必须走独立签名撤回流程，未执行删除':'This version is signed and must go through the separate signed revocation flow; nothing was deleted','已断开或换会话，忽略旧响应':'Disconnected or session changed; stale response ignored',
 '先连接管理员会话':'Connect an admin session first','本次请求未确认完成，请先刷新核实，不自动重试操作':'This request was not confirmed; refresh to verify. Nothing is retried automatically',
 '已断开，凭证只存在过本页内存':'Disconnected; the token only ever lived in this page\'s memory','请输入有效管理员凭证':'Enter a valid admin token',
 '仓库版本':'Repository versions','配置上报':'Config reports','自动候选':'Auto candidates','已签名版本':'Signed releases','发布提案':'Release proposals','签发记录':'Signing records','探测记录':'Probe records','探测待办':'Probe backlog','审核记录':'Review record',
 '审核目录共':'Catalog total','收到上传':'Uploads received','上传标识':'Upload IDs','不同产物':'Distinct artifacts','采用会话':'Adoption sessions',' · 统计始于 ':' · counting since ',
 '作品名取自目录或已记录的标题。新上传事件可补充次数和标识，标识去重不等于真实人数。Cardinal 有对应版本的评分或评审时才显示。':'Titles come from the catalog or recorded titles. New upload events add counts and IDs; de-duplicated IDs are not real headcounts. Cardinal is shown only when that version has a score or review.',
 '仓库快照 ':'Repository snapshot ',' 部 / ':' games / ',' 版本 · ':' versions · ','已撤回下发':'Release revoked','已签名下发':'Signed & released','上传':'Uploads','标识':'IDs',
 '当前筛选无记录 · ':'No records for this filter · ','全部来源':'All sources','全部状态':'All states',' · 搜索 ':' · search ','查看详情':'View details','查看全部':'Show all',
 '正在读取管理记录…':'Reading admin records…','请选择一份记录查看最新详情':'Pick a record to see its latest details','已读取 ':'Loaded ',' 份记录，统计和使用量只按接口已观测数据展示':' records; stats and usage show only what the API has observed',
 '暂无数据':'No data','病毒检查（人工）':'Malware check (manual)','只记录维护者实际完成的病毒扫描，不运行扫描器，不代替 Cardinal 自动质量判断':'Only records scans a maintainer actually ran. It does not run a scanner and does not replace Cardinal\'s automatic quality verdict',
 '尚未读取此产物的病毒检查记录':'This artifact\'s malware-check record has not been loaded','读取病毒检查记录':'Load malware-check record',
 '扫描软件':'Scanner','软件版本':'Scanner version','病毒库版本':'Definitions version','扫描完成时间（本地时间）':'Scan finished (local time)','扫描结果或证据摘要（单行，最多 300 字）':'Scan result or evidence summary (one line, max 300 chars)',
 '只写扫描结论和证据编号，不写本机路径、邮箱、账号或存档内容；重新待查不表示扫描通过':'Write only the verdict and evidence IDs. No local paths, emails, accounts or save data. "Re-check" does not mean the scan passed',
 '检查状态：':'Check state: ','待检查':'Pending check','病毒检查通过':'Malware check passed','发现风险':'Risk found',' · 检查修订 ':' · check revision ','绑定摘要 ':'Bound digest ',' · 精确已签名产物':' · exact signed artifact',
 ' · 未绑定完整签名产物，本记录不能许可后来未知签名稿发布':' · not bound to a full signed artifact; this record cannot authorize a later unknown signed draft',
 '已读取检查记录，尚未提交新结论':'Check record loaded; no new verdict submitted','请填写不含路径、邮箱或换行的简短证据摘要，最多 300 字':'Enter a short evidence summary without paths, emails or line breaks (max 300 chars)',
 '请填写扫描软件、版本、病毒库版本与实际扫描时间':'Enter the scanner, version, definitions version and actual scan time','重新待查':'Re-check',
 '检查记录或绑定身份已变化，已回读最新状态，请核对后手动提交':'The check record or bound identity changed; the latest state was re-read. Review and submit manually',
 '病毒检查记录已确认并回读，审计 ':'Malware check confirmed and read back, audit ','；自动质量与发布仍由独立流程判断':'; automatic quality and release are still decided by their own process',
 '病毒检查修订冲突，已回读当前记录，请核对后手动提交；没有自动重试':'Malware check revision conflict; the current record was re-read. Review and submit manually. Nothing was retried','；检查写入尚未确认，先刷新核实':'; the check write is not confirmed, refresh to verify',
 '这不是适配质量验收，确认记录？':'This is not an adapter quality sign-off. Record it?','作品：':'Title: ','版本：':'Version: ','绑定摘要：':'Bound digest: ','证据：':'Evidence: ','目标：':'Target: ','原因：':'Reason: ',
 '引擎未知':'Unknown engine','版本未知':'Unknown version',' · 收到上传次数 ':' · uploads received ','匿名上传标识':'Anonymous upload ID',' · 不同 Seed 产物数 ':' · distinct Seed artifacts ','作品名未知 / ':'Unknown title / ',
 '当前公开署名':'Current public names','未提供公开署名':'No public name provided','公开署名列表仅显示部分':'Only part of the public-name list is shown','作品明细仅返回部分，后续游标未提供，不能认作完整清单':'Only part of the title details was returned and no further cursor was given; do not treat it as the full list',
 '继续读取此标识的作品':'Load more titles for this ID','已读取后续作品页，仍仅覆盖新接收统计期':'Loaded the next titles page; still covers only the new-ingest period','新接收统计期暂无上传标识记录，历史上传情况未知':'No upload-ID records in the new-ingest period; earlier upload history is unknown',
 '覆盖始于 ':'Coverage since ',' · 上传标识不是人数，旧历史不回填':' · upload IDs are not headcounts; old history is not backfilled','已读取上传者明细；点作品可复用当前详情，不自动执行核查':'Uploader details loaded; clicking a title reuses the current detail view and runs no check',
 '停止下发：导入离线签名撤回文档':'Stop release: import an offline-signed revocation document','网页不持有私钥、不生成签名，导入后仍由服务器验签；撤回保留历史，不删除已安装 builtin':'This page holds no private key and creates no signature; the server still verifies after import. Revocation keeps history and does not delete installed builtins',
 '撤回模板原因':'Revocation template reason','未签名撤回模板':'Unsigned revocation template','下载未签名模板':'Download unsigned template','已签名撤回 JSON':'Signed revocation JSON','选择已签名撤回 JSON 文件':'Choose a signed revocation JSON file',
 '维护者在离线环境执行 ':'A maintainer runs ','，使用仓库外既有 MEGULIT_PROFILE_KEY 与 KEY_ID；将输出以 UTF-8 保存或粘贴到下方，服务器仍须配置匹配的受信公钥，CLI 成功不等于线上已信任。不要用 PowerShell 5 默认重定向写成 UTF-16':' offline, using the existing MEGULIT_PROFILE_KEY and KEY_ID kept outside the repo. Save or paste the output below as UTF-8. The server must still have the matching trusted public key; CLI success does not mean the server trusts it. Do not use PowerShell 5 default redirection (it writes UTF-16)',
 '粘贴已由可信维护者离线签名的 JSON（最多 8 KiB）':'Paste JSON signed offline by a trusted maintainer (max 8 KiB)','已载入文档，尚未发送或验签':'Document loaded; not sent or verified yet','撤回文件无效、目标不符或超过 8 KiB，未发送':'Revocation file invalid, wrong target or over 8 KiB; not sent',
 '撤回 JSON 不符合严格格式或目标摘要不符，未发送':'Revocation JSON does not match the strict format or target digest; not sent','确认导入并停止下发':'Confirm import & stop release','停止下发已签名版本':'Stop releasing a signed version','服务器验签后撤回，保留历史，是否继续？':'The server will verify, then revoke and keep history. Continue?',
 '已验签撤回，并从签名历史回读确认停止下发；已有安装不会被删除':'Revocation verified and confirmed from the signing history; existing installs are not removed','；撤回尚未确认，先刷新核实，不自动重发':'; revocation not confirmed, refresh to verify. It will not be re-sent automatically',
 '适配质量由自动流程判断，不能在此人工通过':'Adapter quality is decided by the automatic process and cannot be passed manually here','请填写 1 至 200 字且不含换行或控制字符的操作原因，便于留痕':'Enter a reason of 1–200 characters with no line breaks or control characters, for the audit trail',
 '此操作会写入服务端并留痕，是否继续？':'This writes to the server and is audited. Continue?','操作已确认并回读，审计记录 ':'Action confirmed and read back, audit record ','；当前记录随后又被更新，请核对':'; the record was updated again afterwards, please check','；刷新可核对汇总与队列':'; refresh to verify totals and queue',
 '版本冲突，已回读当前记录，请核对后手动重新操作；没有自动重试':'Version conflict; the current record was re-read. Review and act again manually. Nothing was retried','提交已确认，但回读未完成；':'Submission confirmed but read-back did not finish; ','；':'; ','写操作已暂停，先刷新核实':'writes are paused, refresh to verify',
 '状态':'State','作者':'Author','传火编号 ':'Torch no. ','上传时间':'Uploaded','版本':'Version','产物类型':'Artifact kind','信任来源':'Trust source','产物摘要':'Artifact digest','客户端回报采用会话':'Client-reported adoption sessions','队列优先级':'Queue priority','最近处理原因':'Last action reason',
 'Cardinal 可靠性':'Cardinal reliability','有可靠记录':'Has reliable records','不可靠':'Unreliable','Cardinal 依据':'Cardinal basis','复测范围':'Retest scope','按 EXE 复测当前可用种子，尚不能指定某个种子版本执行':'Retests the currently available seeds per EXE; a specific seed version cannot be chosen yet',
 '自动质量与下发（只读）':'Automatic quality & release (read-only)','适配质量、Cardinal 与择优下发由自动流程判断，人工状态不作为质量许可':'Adapter quality, Cardinal and best-pick release are decided automatically; a manual state is not a quality approval',
 'Cardinal 得分':'Cardinal score','可靠观测':'Reliable observations','服务端有可靠记录':'Server has reliable records','尚无可靠记录':'No reliable records yet','可信质量收据':'Trusted quality receipt','服务端已验证 release 评审签名':'Server verified the release review signature','尚未提供可信自动评审结论':'No trusted automatic review verdict yet',
 '自动比较结果':'Automatic comparison','当前接口未提供独立比较证据':'The API gives no independent comparison evidence yet','当前下发':'Current release','已停止下发':'Release stopped','服务端标记已发布':'Marked published by the server','未发布或状态未知':'Not published, or state unknown',
 '正文':'Body','稳定':'Stable','杂字':'Stray text','翻页清除':'Page clear','选项':'Choice','配对':'Pairing','残留':'Leftover',
 '单行操作原因，最多 200 字，不写凭证或个人信息':'One-line reason, max 200 chars. No credentials or personal info','插到队首':'Move to front','将此项插到队首':'Move this item to the front of the queue','移动到此记录之前':'Move before this record','移到所选项之前':'Move before selected',
 '当前没有其它已读取队列项，请刷新或读取下一页':'No other queue items loaded; refresh or load the next page','调整队列排序':'Reorder the queue','新的核查状态':'New review state','更新核查状态':'Update review state','恢复到待核查':'Restore to pending review','恢复此项到待核查，不改签名或下发版本':'Restore this item to pending review; signatures and released versions are untouched',
 '停用此仓库条目':'Disable this repository entry','停用远端条目，保留 GitHub 与已安装 builtin，不抹除历史':'Disable the remote entry; GitHub and installed builtins are kept and history is not erased','删除此项':'Delete this item','确认删除此项（操作留痕，版本历史不应被抹除）':'Confirm deleting this item (audited; version history should not be erased)',
 '已下发版本不能普通删除；仅已验证且允许撤回的版本可导入离线签名文档':'A released version cannot be deleted normally; only verified, revocable versions accept an offline-signed document','服务端标记已撤回，发布历史保留；不代表删除已安装副本':'Marked revoked by the server; release history is kept. This does not delete installed copies',
 '此项暂未提供可执行管理能力':'No management actions are available for this item yet','管理操作留痕':'Audit trail','操作未知':'Unknown action','时间未知':'Unknown time','未返回操作留痕，不代表没有历史':'No audit trail returned; that does not mean there is no history',
 '发布与撤回历史仍需签名协议接口核验，未接入项保持未知；本页面不生成签名':'Release and revocation history still needs verification through the signing-protocol API; unconnected items stay unknown. This page creates no signatures',
 '自动处理 Seed':'Auto-process Seed','：':': '
};
