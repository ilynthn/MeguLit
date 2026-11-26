# Unity（Mono / IL2CPP / 各 VN 框架）

> 这页回答：Unity 游戏怎么认、Mono 和 IL2CPP 两条路、框架怎么分、隐藏能做到哪

## 识别

`unityplayer.dll`，或 `<Name>_Data` + 同名 exe；按 Managed 程序集再分 Utage、Naninovel、Yarn、GameCreator、Adventure Creator、Aokana（`services/original-engines/registry.cjs`）；魔数 `UnityFS`、`UnityWeb`、`UnityRaw`、`FSB5`

## 读原文

- 离线：`unity-text`、`naninovel`、`utage`、`yarnspinner`、`higurashi`、`capcom-msg`、`vgprompter`、`unity-assets` 等（`services/original-engines/`）
- 框架型引擎：剧本格式由各作品定，按 VN 插件 / 厂商分开做，不按引擎做（`docs/engine-families.md` F 族）

## 运行时

- **Mono**：`native/unitytext/MeguLitUnityText.cs`（BepInEx 5）不挂钩，看 TMP_Text / uGUI Text，按组件名判角色；内嵌是改 TMP 文本
- **IL2CPP**：`MeguLitUnityText.IL2CPP.cs`（BepInEx 6）只读文本源，协议 `ToMe_UNITY il2cpp1`（`docs/engine-unity-il2cpp-play.md`）；`Il2cppDraw.h` / `Il2cppDrawRoles.h` 在 LunaHook 的 TMP / UI.Text setter 里沿调用帧回溯，按框架方法判角色（Naninovel、Fungus）。JS 规则 `tools/engine-sigs/il2cpp-text.cjs` 必须和 `Il2cppDrawRoles.h` 的 RULES 一致
- **KEMCO**：`KemcoSpriteSnapshot.cs` 只读观察逐字 TextMesh，开关 `kemcoSprites`（`docs/re-unity-kemco.md`）

## 藏原文

Mono 插件把组件 alpha 置 0；IL2CPP 不隐藏。Naninovel：`native/HookBridge.cs` 用零尺寸字形（reveal 会改顶点色，alpha 盖不住）

## 已知坑

- Naninovel 的 TextRevealer 每帧改顶点色，可能覆盖 alpha 0（待实机）
- 加壳的 exe 按规矩跳过（例：逆転検事 1&2）
- KEMCO 只认原版 Assembly-CSharp

## 代表游戏

`The Seed/unity/`（7 个 skeleton）：ace-attorney-investigations-collection、doki-doki-literature-club-plus、haisha-fengyun、higurashi-hou-ch1-onikakushi、magical-girl-witch-trials、summer-clover、tsuki-ni-yorisou-otome-no-sahou；`The Seed/aokana/aokana` 单独成目录

## 相关代码 / 相关文档

- 代码：`native/unitytext/`、`native/megulithook/Il2cppDraw.h`、`Il2cppDrawRoles.h`、`core/text-paths-unity.cjs`、`core/unity-font.cjs`、`core/unity-il2cpp-source.cjs`、`services/original-engines/unity-*.cjs`
- 文档：`docs/engine-unity-il2cpp-play.md`、`docs/re-unity-kemco.md`、`docs/engine-draw-native.md`
