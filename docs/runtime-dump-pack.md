# runtime-dump 冷包约定

MeguLitDump32/64.dll 是冷工具：用户看不到、也不用开。它在 MeguLit 里是一个运行时包 `runtime-dump`，和 base / reading / voice / archives 并列，但不出现在设置里，也没有开关。以后的运行时功能（剧本收割、语音收割、首句位置、CG 解锁……）都写进这一个 DLL，跟着这个包一起发

## 生命周期

1. **注册**：`setup/runtime.json` 里 `packs["runtime-dump"]` 占一行（`native/runtimedump/pack.ps1` 生成）：`onDemand:true`、`hidden:true`、`dest:"runtime/runtime-dump"`、`files:[MeguLitDump32.dll, MeguLitDump64.dll, pack.json]`、sha256、`urls` 指向 GitHub release `runtime-dump-v<ver>`（镜像规则和其他包一样）
2. **下载**：`core/hook-native.cjs` 的 `HookNative.fetchRuntimeDump()`。每次开始 hook 游戏时调用；如果没装，就在后台跑 `RuntimePacks.ensure('runtime-dump')`，同一时间只跑一个。失败（离线、校验不对）就静默放弃，不报错不提示，下次启动游戏再试一次
3. **注入**：`native/HookBridge.cs` 的 `RuntimeDump()`。DLL 先找 `<安装目录>\runtime\runtime-dump\`，找不到再找 HookBridge 旁边（开发构建用）。第一次启动时如果包还在下载，后台线程会等最多 15 分钟，文件一到就注入，只要游戏还开着。注入失败只写进 `logs\hook-diagnostics.log`。注入前 HookBridge 把 dump 根目录写进 DLL 旁边的 `root.txt`：游戏进程里拿不到 MeguLit 的环境变量，DLL 只能从这个文件知道根目录
4. **默认开启**：DLL 只看 `cache\runtime-dump\<key>\off`（key = 小写游戏目录的 FNV-1a）。这个文件只在 DLL 自己出错时写（比如反复读内存出错），之后这个游戏就不再碰。`MEGULIT_RUNTIME_DUMP_OFF=1` 是测试用的总开关
5. **runtime-packs 的规则**：`hidden` 包不出现在 `status()` 里，不能 `uninstall`，也不参加「全部下载」。包是否完整按它自己的 `files` 判断

## 包文件布局

```
MeguLit-runtime-dump-v<ver>.zip
├─ MeguLitDump32.dll
├─ MeguLitDump64.dll
└─ pack.json        {"pack":"runtime-dump","version":"<ver>","contract":2,"commit":"<sha>"}
```

发包步骤：`native\runtimedump\build.cmd` → `native\runtimedump\selftest\run.ps1` → `native\runtimedump\pack.ps1 -Version x.y.z`（会改 `setup/runtime.json`）→ 把 zip 上传到 release `runtime-dump-vx.y.z`。上传算发版，要先问用户。zip 每次打包的 sha 都会变，所以 runtime.json 必须和实际上传的那个 zip 是同一次打出来的

## DLL 导出

- `int MeguLitDumpVersion()`：约定版本号，目前是 2。改了模块接口就加 1
- 没有别的导出：DllMain 起一个观察线程，所有东西都从这个线程里跑

## 加功能模块（mem-voice / mem-cg 等）

只改两处，冲突最小：

1. 新文件 `native/runtimedump/modules/<Name>.cpp`（`build.cmd` 会编译 `modules\*.cpp`），定义：
   - `void <Name>Start(const wchar_t *out)`：文件 hook 装好后调用一次。`out` 是这个游戏的输出目录（以 `\` 结尾），模块自己的输出放在这里，文件名用模块名开头
   - `void <Name>Tick()`：观察线程大约每 120 ms 调一次，要很轻
2. 在 `native/runtimedump/modules/modules.h` 的 `MEGULIT_DUMP_MODULES` 里加一行 `MODULE(<Name>) \`，单独一个提交

两个函数都在 SEH 里跑：一个模块出错只关掉它自己（日志里写 `module off after a fault: <Name>`），其他模块和游戏都不受影响。模块要自己装 hook 的话用 MinHook（`MH_Initialize` 已经调过了），hook 函数里先看 `Inside()`，用 `Guard` 防止重入。读回的那一侧放在 `services/` 下，按 `<out>` 目录约定去读

模块能用的核心接口在 `modules/dump_api.h`：`DumpSave`（写进 index.jsonl；`force` 跳过「像不像文本」的判断）、`DumpLog`、`DumpInside` / `DumpScope`（防重入，保留 GetLastError）、`DumpSkipped`、`DumpHook` / `DumpUnhook`（MinHook）、`DumpReadable`

自测用例：`native/runtimedump/selftest/cases/<Name>.cpp` + `cases/cases.h` 一行，说明见 `selftest/fakegame.h`

## 现在 DLL 里有的东西

- 抓解密/解压的输出：ReadFile/MapView 原地解密、读文件后同尺寸的新缓冲、RtlDecompressBuffer、zlib → `index.jsonl` + `NNNNN_<source>_<how>.bin`
- 种子扩张：读 `seeds.txt`（MeguLit 写的 hook 行，UTF-8，一行一句），在进程内存里找到包含这句的整块文本，存为 `how:"seed"`
- 读回：`services/runtime-dump.cjs`（原始缓冲）、`services/script-harvest.cjs`（整理好的剧本、日中配对、报告 → `harvest.json`）
- KiriKiri 模块 `modules/Krkr.cpp`（仅 32 位）：挂 TVPCreateStream（KRKRZ/KRKR2 特征码，加壳的 exe 等到 GetProcAddress("V2Link") 时再找），把引擎刚打开、已经解密的流整份读出来再 Seek 回 0，KAG SimpleCrypt（FE FE 0/1/2）解成带 BOM 的 UTF-16，存为 `how:"krkr"`
