# 任务进度 progress.md

## v1.4.0（2026-10-31）

用户明示：手柄操作、防猜测升级、更新本地程序。基线312/312，工作区干净；本地game与注册表仍1.2.0，需要实际就地更新。

|任务|状态|验收|
|---|---|---|
|T27 手柄纯输入/轮询|✅|15/15，死区/边沿/重复/失焦/销毁|
|T28 双向求解/重排基准|✅|solve39/39；560布局独立预言机/镜像旋转/预算|
|T29 Worker生成协议/取消|✅|10/10，异常/超时/取消/过期结果|
|T30 Game异步状态|✅|全部game41/41；不计时/取消/安全布局/兼容|
|T31 装配|✅|main16/16；追加可见但失焦回归红→绿|
|T32 UI/发布/本地更新|✅|全量27文件371/371，双缩放冒烟、打包、E2E32/32、本地更新、发布与公开附件校验全部完成|

- 测试先红：solve.quality原实现9红4绿、game.generation8红2绿、main.controller4红、UI增量2红、smoke新增2红；新模块缺失导入失败。全部由主agent确认后分模块subagent实现。
- 旧{1,4,19}精确契约经独立预言机校正：14确定后unknown=[0,1,3,4,9,19,24]，8连通簇=[[0,1],[19,24],[3,4,9]]。不放宽断言；原S1/S2/S4随机统计保持通过。
- 新版smoke含8项交互检查：普通与DPR2均全true；真实module Worker消息往返成功，Gamepad API模拟轮询可移动和标记，无console警告/错误或渲染崩溃。
- 本地更新前已备份旧清单87个文件，启动确认1.2.0；localStorage有2个键，仅保存摘要不打印值。未连接实体手柄（hardwareCount=0），手柄仅模拟验收。
- 安装E2E32/32通过，原注册表与快捷方式先备份再恢复。之后新Setup --install-dir D:\Minesweeper\game --no-startmenu-shortcut真正就地更新，保留原桌面快捷方式偏好。
- 运行本地副本确认1.2.0→1.4.0、清单/注册表DisplayVersion=1.4.0；localStorage摘要完全一致；副本手柄UI存在且真实Worker可生成10雷布局。验收后已关闭测试启动的游戏。
- 8个升级模块的源码、打包staging、本地安装副本逐字节一致。dist唯一MinesweeperSetup-1.4.0-win.exe（74,357,283字节）；临时文件、验收目录和旧代码备份均已可恢复地移入回收站，.local仅保留原发布凭据。
- T27~T32已分批commit+push；发布提交185ad4c，tag v1.4.0已推送，publish-release成功，Release ID=1259039。
- 公开API验证tag存在；无凭据完整下载附件HTTP200、74,357,283字节，SHA256=a2e3d69335967d3ce6c099b24b437699d1ba9c8a9e7b4808e6ded2f0f3c10975，与本地完全一致。未将凭据/存档/安装副本/产物入库。


## v1.3.0（2026-10-31）

基线 14 文件 / 232 测试全绿；工作区干净；已 fast-forward 同步远端 LICENSE。

|任务|状态|验收|
|---|---|---|
|T21 board 坐标边界|✅|58/58；非法坐标/索引回归先红后绿|
|T22 game 首点守卫|✅|31/31；三种布雷方式的首点旗/问号|
|T23 UI 状态/焦点/样式|✅|41/41；禁用触发点焦点恢复追加红→绿|
|T24 leaderboard 数据边界|✅|27/27；同分契约同步旧测试，未放宽断言|
|T25 main 键盘/DPR/性能|✅|11/11；真实窗口截图复核后补实际布局与滚动回归|
|T26 集成/打包/发布|✅|全量21文件312/312，双缩放Electron冒烟绿；dist唯一70.9MB；安装E2E32/32；v1.3.0已发布并公开下载校验|

- 2026-10-31 文档链先行；新增严格回归初跑52条中43红，main旧模块无DOM根节点导入崩溃，smoke初跑14红；实现由模块subagent完成，主agent审阅。
- 本轮新增80条用例；额外复现并修复：安装器共享样式漏白名单、禁用暂停按钮焦点恢复、实际窗口提示被挤出视区、Electron脚本require.main差异（冒烟入口补回归）。
- 真窗口SMOKE_RESULT：无console错误/警告、无failLoad/rendererGone，6项交互全true；DPR=2再次通过。未改动求解算法及持久化键。
- npm run dist 成功：唯一 MinesweeperSetup-1.3.0-win.exe，74,352,011字节；app.asar实际检查 styles/main.css 与 setup/wizard.css 均存在。
- 安装E2E32/32：静默安装、安装副本启动、移动目录与InstallLocation自愈、静默卸载、GUI卸载及外来文件保留均通过。验收前备份原卸载注册表，结束后已恢复；没有动现有game安装目录。
- T21/T22/T24/T23/T25/T26各任务独立提交并push origin/main；发布提交5fac1f1，tag v1.3.0已推送，scripts/publish-release.cjs成功，Release ID=1258883。
- 公开API找到v1.3.0，附件下载HTTP200、74,352,011字节；SHA256=e51383e7d6f322b524b512a242346372bdb79b70a2b82f70c974a2b3cf7383f5，与本地产物一致。
- .build、截图、验收注册表备份及本次TEMP目录已可恢复地移入回收站；D:\MinesweeperE2E*无残留；dist仅保留新版安装器。未提交凭据/用户数据/产物。


> 全流程唯一进度源。主 agent 负责维护；subagent 完成一个任务后更新。
> 状态：⬜ 未开始 / 🟨 进行中 / ✅ 完成 / ❌ 阻塞

## 依赖图（v1 + v2 + v3）
```
v1:  T6 ───────────┐
     T1 ──▶ T2 ──▶ T3 ──▶ T5
     T4 ─────────────────▶ T5
v2:  T0b 文档链+测试（主 agent）
     Wave A（并行）: T7 settings ──▶ ┐
                     T8 installer ──▶ ├─▶ T12 renderer（依赖 T7+T10+T11）
                     T9 solve 重构 ──▶│
     Wave B（并行）: T10 game（依赖 T9）┘
                     T11 electron 壳（依赖 T8）──▶ T12
     Wave D: T13 打包 + 全量验证 + README + AGENTS.md
v3:  T14 文档链+任务文件（主 agent，W0）
     Wave A: T15 setup UI（无依赖）
     Wave B: T16 installer.js 扩展（无依赖）
     Wave C: T17 electron setup（依赖 T15+T16）
     Wave D: T18 游戏剥离（无依赖，可与 A/B/C 并行）
     Wave E: T19 打包（依赖 T17+T18）
     Wave F: T20 E2E + 全量验证 + README/AGENTS（依赖 T19）
```

## 任务清单

| 任务 | 内容 | 依赖 | 状态 | 测试命令 | 备注 |
|---|---|---|---|---|---|
| T1 | core/board.js 棋盘模型 | 无 | ✅ | `npx vitest run tests/board.test.js tests/modes.test.js` | v1 Wave A |
| T4 | core/leaderboard.js 排行榜 | 无 | ✅ | `npx vitest run tests/leaderboard.test.js` | v1 Wave A |
| T6 | electron 壳 + package.json + index.html + css | 无 | ✅ | vitest 可启动 / node --check | v1 Wave A |
| T2 | core/solve.js 可解性+防猜测 | T1 | ✅ | `npx vitest run tests/solve.test.js tests/solve.retries.test.js` | v1 Wave B |
| T3 | core/game.js 状态机+计时 | T1+T2 | ✅ | `npx vitest run tests/game.test.js` | v1 Wave B |
| T5 | renderer（render/ui/main） | T1-T3+T6 | ✅ | `npx vitest run tests/ui.test.js tests/render.test.js` | v1 Wave C |
| T0 | tests/ 全套测试（主 agent 先写） | 无 | ✅ | `npm test` | v1 先行完成 |
| T0b | **v2 文档链 + 5 个严格测试文件** | 无 | 🟨 | `npm test`（旧 111 全绿；新测试预期红=未实现） | v2 先行 |
| T7 | core/settings.js 设置持久化 | 无 | ✅ | `npx vitest run tests/settings.test.js` | v2 Wave A，14/14 |
| T8 | core/installer.js 安装/卸载纯逻辑 | 无 | ✅ | `npx vitest run tests/installer.test.js` | v2 Wave A，43/43（含主 agent 修正测试假数据 1 处） |
| T9 | solve.js 重构 deduce + 高级局部重排 | T1+T2 | ✅ | `npx vitest run tests/solve.test.js tests/solve.retries.test.js tests/solve.advanced.test.js` | v2 Wave A，24/24（主 agent 补候选循环预算检查） |
| T10 | core/game.js 防猜测配置集成+回退 | T9 | ✅ | `npx vitest run tests/game.test.js tests/game.advanced.test.js` | v2 Wave B已完成，2026-10-31校正旧状态 |
| T11 | electron 主进程（preload/IPC/runner/log + 冒烟更新） | T8 | ✅ | node --check + 冒烟 | v2 Wave B已完成，后续v3验收覆盖 |
| T12 | renderer 侧栏+面板+安装向导+美化 | T7+T10+T11 | ✅ | `npx vitest run tests/ui.test.js tests/ui.sidebar.test.js` + 冒烟 | v2 Wave C已完成，后续v3验收覆盖 |
| T13 | 打包 dir/zip + 全量验证 + README + AGENTS.md | 全部 | ✅ | `npm test` 205/205 + 冒烟 + `npm run dist` + E2E 20/20 | v2 Wave D |
| T14 | **v3 文档链 + 任务文件 t15~t20 + progress** | 无 | ✅ | 文档一致性自查 | v3 W0（主 agent） |
| T15 | setup UI（setup/ui.js + wizard.css + index.html） | 无 | ✅ | `npx vitest run tests/setup.ui.test.js` 17/17 | v3 Wave A |
| T16 | installer.js 扩展（planInstall renames/relPrefix + relocateManifestDir InstallLocation） | 无 | ✅ | `npx vitest run tests/installer.test.js` 55/55 | v3 Wave B |
| T17 | electron setup（setup.cjs + preload-setup.cjs + runner 适配 + IS_SETUP 分派） | T15+T16 | ✅ | node --check 4/4 + `npm test` 230/230 + dev setup 冒烟 | v3 Wave C |
| T18 | 游戏剥离（ui/main/preload/main.cjs/styles/tests/smoke + 自愈 InstallLocation） | 无 | ✅ | ui 测试 + 冒烟（noInstallerApi=true）+ `npm test` 230/230 | v3 Wave D |
| T19 | 打包（build-dist.cjs + setup-builder.yml + package.json v1.2.0 + 清理） | T17+T18 | ✅ | `npm run dist` → dist 唯一产物 70.9MB | v3 Wave E |
| T20 | E2E 四阶段重写 + README/AGENTS/progress 收尾 + 全量验收 | T19 | ✅ | `node scripts/installer-e2e.cjs` 32/32 + `npm test` 230/230 | v3 Wave F |

## 运行日志
- 2026-08-03 需求确认完成（4 轮提问，12 项决策）。
- 2026-08-03 proposal / high-level-design / detailed-design 已提交。
- 2026-08-03 git 初始化并 push 到 gitee 成功。
- 2026-08-03 T0 测试套件已编写并提交（8 个测试文件，约 130 用例）。
- 2026-08-03 T6 Electron 壳 + 依赖安装完成（Electron 33.4.11，经 npmmirror 镜像）。
- 2026-08-03 T4 core/leaderboard.js 已实现并通过（13/13）。
- 2026-08-03 T1 core/modes.js + core/board.js 已实现并通过（48/48）。
- 2026-08-03 主 agent 审阅修复 chordRight 旗数重复计数缺陷，补 2 条测试，共 61/61 绿。
- 2026-08-03 T2 core/solve.js 可解性算法（NSS+SNS）与防猜测重排完成（12/12 绿）。
- 2026-08-03 T3 core/game.js 状态机+计时+防猜测调度完成（16/16 绿）。
- 2026-08-03 T5 renderer 渲染/UI/装配完成，全量 `npm test` 111/111 绿。
- 2026-08-03 README 已编写提交。
- 2026-08-03 electron 冒烟：页面加载成功、无渲染崩溃、无 JS 错误、画布与 UI 正常（CSP 警告已修复）。
- 2026-08-03 `npm run dist` 打包成功：`dist/Minesweeper Setup 1.0.0.exe`（NSIS，78MB）+ `dist/win-unpacked/Minesweeper.exe`。
- 2026-08-03 打包备注：需 ELECTRON_MIRROR / ELECTRON_BUILDER_BINARIES_MIRROR 镜像；signAndEditExecutable=false 避开 winCodeSign 符号链接权限问题。
- 2026-08-03 全部任务完成，待最终推送。
- 2026-08-04 **v2 需求确认完成**（2 轮提问，8 项决策）：应用内安装/卸载管理器、D:\Minesweeper 默认路径、清单式删除、不复现崩溃走鲁棒性防御、歧义连通簇、回退标准、侧栏划分、主页面板+美化。
- 2026-08-04 v2 文档链更新：proposal（FR9/FR10/FR11 + 决策记录）、high-level-design、detailed-design（§3 deduce/高级算法、§4 game v2、§5b settings、§5c installer、§6 侧栏 DOM、§7 IPC）、任务文件 t7~t13。
- 2026-08-04 T0b 编写 5 个严格测试文件（settings/solve.advanced/game.advanced/installer/ui.sidebar），旧 111 用例保持全绿基线。
- 2026-08-04 Wave A 完成：T7 settings.js（14/14）、T8 installer.js（43/43）、T9 solve.js deduce+高级模式（24/24）。
  主 agent 审阅：修正 installer.test.js 假数据缺源文件 1 处（T8 报告阻塞）；solve.js 补候选循环预算检查（契约偏差）。
- 2026-08-04 Wave B 完成：T10 game.js 防猜测配置集成+回退（game 16/16 原样 + advanced 9/9）、T11 electron 主进程
  （preload/IPC/installer-runner/log/--uninstall/冒烟，node --check 6/6，冒烟 hasAPI=true）。
- 2026-08-04 Wave C 完成：T12 renderer 侧栏+主页面板+安装向导+美化（ui 16/16 原样 + sidebar 15/15），全量 204/204 绿。
- 2026-08-04 Wave D（T13）完成：
  - 打包改绿色版 `build.win.target=["dir","zip"]`（win-unpacked + zip，无 NSIS）
  - 主 agent 集成审查修复 3 处真实缺陷：
    1) 打包安装源：原实现只复制 asar 内源码 → 改为打包形态复制**完整运行时目录**（exe/dll/resources/locales），
       快捷方式/注册表指向安装副本（fs-utils enumSourceTree 增加 fullTree/excludes 模式）
    2) Electron asar 补丁 fs 无法复制以 `.asar` 结尾的源文件（app.asar 报 ENOENT "not found in ..."）→
       runner/fs-utils 改用 `original-fs`（未补丁原生 fs）
    3) 卸载残留 install-manifest.json（清单不列出自身 → 被当清单外保留 → 根目录永不空）→
       planUninstall 将清单自身纳入删除且不报清单外（新增 1 测试，全量 205/205 绿）
  - 静默卸载退出优化：--uninstall 完成后清理子进程（getAppMetrics）+ app.exit(0)，
    避免 GPU/utility 子进程锁住安装目录导致延迟清理慢（实测目录删除从 ~100s 降到 ~29s）
  - **端到端验收 20/20 通过**（scripts/installer-e2e.cjs，CDP 驱动打包版真实安装/移动/卸载）：
    安装完整运行时+注册表+快捷方式 ✓ / 移动目录后运行+静默卸载 ✓ / 延迟清理删除 ✓ /
    外来文件保留+根目录 BUSY 具体原因 ✓ / 旧残留检测 ✓
  - README、AGENTS.md 已按 v2 收尾更新（结构/接口速查/命令/测试约定）
- 2026-08-04 **v3 需求确认完成**（1 轮提问，1 项决策）：安装从游戏剥离为独立便携 MinesweeperSetup exe
  （用户选定 portable 单文件形态，v1.2.0；双击=安装/已装=卸载确认；setup 零痕迹）。
- 2026-08-04 v3 文档链更新（T14）：proposal（FR9 去安装入口 / FR10 重写 + 决策记录 v3 行）、
  high-level-design（双应用架构）、detailed-design（§5c 签名扩展、§6 删除契约、§6b setup UI、
  §7 setup.cjs/CLI/preload 拆分/打包、§8 测试规格、§9 依赖图 v3）、任务文件 t15~t20、progress 更新。
- 2026-08-04 v3 Wave A 完成：T15 setup UI（setup/ui.js + wizard.css + index.html，17/17）。
- 2026-08-04 v3 Wave B 完成：T16 installer.js 扩展（planInstall renames/relPrefix、relocateManifestDir
  InstallLocation 链，+11 用例 55/55）。全量 233/233 绿（Wave A+B 合并提交）。
- 2026-08-04 v3 Wave D 完成：T18 游戏剥离（ui.js/main.js/preload.cjs/main.cjs/styles 删 696 行，
  无 installer 面；main.cjs 打包态 InstallLocation 自愈；smoke 深断言 hasGetVersion/noInstallerApi/
  noInstallerOpenBtn；新增 2 条剥离回归测试），230/230 绿 + 冒烟通过。
- 2026-08-04 v3 Wave C 完成：T17 electron setup（setup.cjs 窗口/CLI/IPC + userData/日志 %TEMP% 零痕迹、
  preload-setup.cjs、installer-runner 打包态安装适配：排除 app.asar、exe 重命名、game-app→resources/app
  前缀映射、UninstallString 指向 setup 磁盘 exe（PORTABLE_EXECUTABLE_FILE）、重定位链含 InstallLocation），
  node --check 4/4 + 230/230 绿 + dev 态 setup 冒烟验证（CDP 确认向导视图）。
- 2026-08-04 v3 Wave E 完成：T19 打包流水线（build-dist.cjs：清理→staging 剥离版游戏（白名单+校验）→
  electron-builder portable→清理+唯一产物校验；setup-builder.yml；package.json v1.2.0；
  主 agent 修复 staging rel 前缀 bug 与 win-unpacked 中间产物清理），产物
  `dist/MinesweeperSetup-1.2.0-win.exe`（70.9MB）。
- 2026-08-04 v3 Wave F 完成：T20 E2E 四阶段重写（主 agent 修复 CDP 时序竞态：加 waitFor 轮询
  等 module 执行与报告渲染），**端到端 32/32 通过**：
  静默安装（exe 重命名/unpacked resources/app/清单/注册表 UninstallString→setup exe/InstallLocation/
  快捷方式）✓ 安装副本冒烟（无 installer 面）✓ 移动目录+自愈+静默卸载（重定位链+延迟清理）✓
  外来文件保留+GUI 卸载 ✓；README/AGENTS.md/progress 已按 v3 收尾。
- 2026-08-04 **bug 修复：排行榜按钮点击无反应**（用户反馈：点击「排行榜」后无任何窗口/改动）。
  - 根因（subagent 定位 + 主 agent 复核实证）：ui.js「点击面板外区域隐藏面板」的 document 级 click
    监听器与打开按钮的点击发生在同一次事件分发内——按钮监听器目标阶段先打开面板（移除 hidden），
    同一 click 冒泡到 document 后监听器立即将面板重新隐藏，用户无感。v2 Wave C 引入；测试盲区：
    旧按钮用例用空 mock 只断言 action 被调用、不查面板可见性。
  - 修复（ui.js:354-356）：document 监听器忽略来自 #leaderboard-open 的点击（`leaderboardOpen.contains(e.target)`），
    与 detailed-design §6 契约「点击面板外区域或关闭按钮隐藏」一致。
  - 测试（红→绿）：ui.sidebar.test.js 重写按钮点击用例为甄别性测试（真实 openLeaderboard 接线 +
    面板可见性断言，修复前 2 红）+ 新增「点击面板外→隐藏」「已展开时再点→保持可见」边界用例。
  - 验证：全量 232/232 绿 + Electron 冒烟通过（无 JS 错误/无渲染崩溃）。
  - 跟进（同日晚）：用户复装旧安装包无效 → 补 `npm run dist` 重新打包；发现并修复
    build-dist.cjs spawnSync 直启 npx.cmd 报 EINVAL（Node ≥24 不再支持不经 shell 执行批处理，
    win32 改经 cmd.exe /c 执行，命令为静态常量无注入面）。产物
    `dist/MinesweeperSetup-1.2.0-win.exe`（70.9MB），staging 校验 ui.js:356 已含修复。
  - 用户明示新增 AGENTS.md §3 规则「作业完成闭环（红线）」：作业完成后必须重新打包
    （npm run dist + 产物校验）+ 提交推送，纯文档改动可免打包但提交仍必须（教训沉淀）。
  - 首次发布 Gitee Release v1.2.0（用户提供令牌并明示：重大版本更新后自动发布）：
    scripts/publish-release.cjs（幂等：tag 已存在拒绝覆盖；凭据 GITEE_TOKEN 或
    .local/gitee-token，严禁入库）；AGENTS.md §3 新增「发布闭环（重大版本必发 Release）」
    与「令牌管理/更新要求」，§4/§6 同步。
  - 用户明示「以后自动更新」：AGENTS.md §2 新增第 6 步「重大版本更新自动发布 Gitee Release」、
    第 7 步「自动更新 AGENTS.md（每作业必做，无需用户提醒）」；§6 补充发布后公开 API 验证
    命令与首个 Release 记录。
