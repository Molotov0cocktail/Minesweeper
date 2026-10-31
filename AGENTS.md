# AGENTS.md — Minesweeper 项目工作手册

> **当前版本1.5.0（2026-10-31）**：简洁主界面、完整手柄菜单、B标雷、可自定义键位、专注视图。以下v1.5速查优先于历史记录。
> 已发布 [Gitee v1.5.0](https://gitee.com/Molotov0coaktail/minesweeper/releases/tag/v1.5.0)，414测试/双缩放12项冒烟/E2E32项通过；公开附件HTTP200且SHA256一致。本地game已更新到1.5.0，原设置与排行榜摘要未变。

### v1.5.0 维护速查

- 默认DEFAULT_GAMEPAD_BINDINGS={reveal:0,mark:1,menu:2,pause:9,restart:3,focus:11,help:8}；B标雷/界面返回，X菜单，R3专注，View说明。方向固定；7动作可绑0~11互异整数，冲突交换；重开仍长按800ms。
- core/gamepad新增isValidGamepadBindings/rebindGamepad，mapper.setBindings仅值变化时中立重锁；renderer/gamepad新增getBindings回调动态读取。
- settings新增gamepadBindings/focusView:false，旧档补默认、坏map整组回退、非法更新忽略，get/update/reset均深复制map，不更换存储键。
- renderer/controller-ui.js导出navigateControls(scope,action)，作用域控件焦点/scroll、number stepUp/stepDown、select change、checkbox/按钮确认、10列昵称键盘；网格任何边缘可进入输入或提交，不能困焦点。
- UI新增handleController/hasControllerContext、showHelp/showControls/closePage、setGamepadBindings/setFocusView/getFocusView/setBoardSize。主页面无常驻教程或手柄提示；#controls-help/#ag-settings-hint在#help-page，#controller-status在#controls-page。
- 新DOM：#help-open/page/back，#controls-open/page/back，#binding-<7action>、#bindings-reset，#nickname-keyboard[data-key]，#focus-toggle/exit/hud/mine-count/timer，#board-size。昵称屏幕键盘仅手柄操作时显示，物理键盘不受影响。
- main先将手柄交UI消费，设置输入不穿透棋盘；F1说明/F10专注/Escape返回。视图只改展示不重开，手柄键位/专注持久化。侧栏缩放0自动/16~48固定，手动缩放保留到新局，选自动恢复窗口适配。
- body.focus-view隐藏顶栏/侧栏/规格，仅棋盘、进度与紧凑雷数/时间/退出；退出按钮、F10、R3、X菜单均可恢复。模态不允许专注切换穿透。
- smoke新增controllerMenu/rebind/focusView/helpPage，共12项；必须app.exit(exitCode)，普通process.exitCode+app.quit无法保证Electron失败退出码。生成normal/focus两张临时截图，均须清理，不入库。
- 测试32文件414项；新增gamepad.bindings/settings.input/controller-ui/ui.pages/main.interface；旧默认映射/默认设置精确断言随新契约更新。硬件未连接时不宣称实体实测。


> **历史版本 1.4.0（2026-10-31）**：标准手柄操作、双向子集推理、可取消Worker首点生成；冲突时以顶部v1.5契约为准。
> 已发布 [Gitee v1.4.0](https://gitee.com/Molotov0coaktail/minesweeper/releases/tag/v1.4.0)，371测试/双缩放冒烟/安装E2E32项通过，公开附件HTTP200且SHA256一致。本地D:\Minesweeper\game已真正更新到1.4.0，存档摘要未变；硬件未连接，手柄仅模拟验收。

### v1.4.0 维护速查

- core/gamepad.js：createGamepadMapper()->{poll(gamepads,now,enabled=true),reset()}；标准映射、0.35死区、中立解锁、动作边沿、方向300/100ms连发、Y持800ms重开。renderer/gamepad.js：startGamepad(回调及API注入)->stop()，RAF轮询/状态去重/清理。
- 手柄：方向键/左摇杆移动，A/叉翻开或确认，X/方块标记，B/圆取消昵称或面板，Start暂停/继续；长按Y/三角800ms重开。昵称A提交默认昵称，暂停A继续；失焦/普通输入框禁用，非standard映射不猜测按键。
- solve.deduce修复双方向真子集，缓存单次邻居表，尺寸[1,60]与非法布局安全返回不可解；高级失败试排不污染移雷基准，真实deduce次数≤400。独立预言机穷举560种5×5三雷布局；旧{1,4,19}能排除14并分成3簇，精确测试随契约更新。
- renderer/generation-worker.js：generateOpening(config,startIdx)统一标准/高级回退，消息{id,config,startIdx}->{id,result|error}。generation-client.js：createGenerationClient()->{prepare,cancel,destroy}，独立module Worker、8000ms硬超时，取消直接terminate，不在UI线程补跑求解。
- game新增STATE.GENERATING与opts.prepareBoard；reveal可返回{type:'generating'}，生成时不计时且棋盘操作noop；cancelGeneration/restart使世代失效；结果验证精确雷数、索引与首点3×3安全后提交并发generated。异常/超时回退普通开局，中文横幅明确告知无猜已关闭。
- main.startApp新增generationClient/gamepadFactory可选注入；新局先cancelGeneration再cancel Worker，销毁同时释放轮询与生成器；后台完成后暂停。独立focused状态防止visibilitychange错误重新启用手柄。
- UI新增setControllerStatus({connected,supported,id})及#controller-status；生成状态aria-busy与中文提示、重开可取消。smoke增加真实Worker通信和模拟Gamepad轮询检查。
- 测试27文件/371项；新增gamepad/gamepad.poller/solve.quality/generation/game.generation/main.controller。硬件未连接时只报告模拟验收。
- 本地就地更新D:\Minesweeper\game：先备份原清单文件并对localStorage做摘要校验；使用新Setup --install-dir，保留原用户数据/外来文件/快捷方式偏好；不将.local或game入库。


> **历史版本 1.3.0（2026-10-31）**：质量/键盘/高分屏体验升级。下面保留该次维护记录，冲突时以本文件顶部v1.4.0契约为准。
> 已发布 [Gitee v1.3.0](https://gitee.com/Molotov0coaktail/minesweeper/releases/tag/v1.3.0)，公开附件HTTP200且SHA256与本地一致；312测试、双缩放冒烟、安装E2E32/32均通过。

### v1.3.0 维护速查（优先于下文旧概述）

- board：indexAt/neighborIndexes 拒绝非法尺寸、非整数/越界索引；各操作安全空返回。game：首点旗/问号 noop，不布雷或计时。
- leaderboard：白名单模式、有限非负时间；读档清洗坏记录保留好成绩；getScores 返回独立记录拷贝；昵称 trim/16字符；满榜同分后写第11，isTopTen=false。
- renderer/main.js：导出 startApp({host,storage}={}) -> {destroy()}，只在 #app 存在时自动启动。DPR backing/CSS逻辑像素分离、鼠标扣边框换算；事件重绘，200ms定时只刷新时间。新局/换模式重新适配，重开用最新设置并清空临时 UI/待提交成绩。
- 键盘：棋盘聚焦后方向键移动、Enter/Space 翻开或chord、F标记或镜像chord；P暂停/继续（暂停遮罩允许P恢复），F2重开。输入/IME/修饰键/昵称模态不劫持；失焦/页面隐藏自动暂停，不自动继续。
- UI 新API：setGameStatus({state,mode,rows,cols,mines,revealedCount})、resetTransient()、destroy()。新增 #game-status/#game-meta/#game-progress/#controls-help；main 创建 #board-focus。进度只统计已翻安全格。菜单 aria-expanded/inert；弹窗焦点、Tab/Enter/Escape；无效触发点恢复到棋盘。
- 测试：21文件，新增 board.safety/game.safety/leaderboard.safety/ui.experience/main/smoke/setup.packaging；main/UI使用jsdom，其余node。全量312项（以最后验收结果为准）。主agent编写甄别回归并确认红后分派，不允许subagent放宽测试。
- 安装器构建白名单显式包含 styles/main.css（setup/index 引用的共享样式）；setup.packaging 回归校验。
- 冒烟：scripts/smoke.cjs 使用隔离临时userData，校验页面及换难度/键盘/暂停重开/侧栏/排行榜，失败退出码非0；导出 collectSmokeFailures 供测试。PowerShell先 Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue，再 npx electron scripts/smoke.cjs。
- v1.4.0已将首点生成移入Worker并提供取消/超时；Canvas键盘可用及文字反馈已补齐，尚非每格DOM读屏网格。


> 本文件在每次新会话启动时加载。目标：让新对话快速上手本项目，并严格按
> vibe-coding 工作流（见 `.agents/skills/vibe-coding-workflow/SKILL.md`）工作。

## 1. 项目概览

Electron 经典扫雷桌面程序（Windows）。核心特性：

- 三种标准模式（初级 9×9/10、中级 16×16/40、高级 16×30/99）+ 自定义行列/雷数
- **左侧侧栏**（汉堡按钮展开/收起，默认收起）：等级选择/自定义/防猜测设置/排行榜入口
  （v3 起无安装入口）；顶栏保留汉堡/标题/剩余雷数/时间/暂停/重开/横幅；展开时棋盘缩放适配（可用宽扣 248px）
- 拖动缩放手柄缩放显示（格子 16~48px）、窗口等比自适应
- 经典交互：左键翻开/空区扩散、右键 旗→问号→无、左键数字格 chord、右键数字格镜像 chord
- 键盘与反馈（v1.3.0）：方向键/Enter/空格/F/P/F2、失焦自动暂停、状态与安全格进度；DPR高清画布、事件重绘、实际布局适配。
- **防猜测模式**（设置持久化 localStorage `minesweeper.settings.v1`）：
  - 标准方式（整盘重排）：NSS+SNS 子集推理（`deduce` 暴露不动点未知格/连通簇）检测可解性；
    不可解则整体重排雷布局（≤ 最大重置轮数，默认 20，可调 1~200）
  - 高级方式（局部重排）：检测最小歧义连通簇 → 簇外雷固定、簇内重排（次数可调）→
    仍不可解则簇内减 1 雷移至正常区域（候选验证不引入新猜测）→ 循环；失败回退标准方式
  - 雷密度 >50% 或重排耗尽时关闭并横幅提醒（精确文案见 §5 game 模块）
- 正向累加计时 + 暂停遮罩、剩余雷数、重开
- 排行榜：3 模式 × 防猜测开/关 共 6 组 × 前十名（昵称+用时，按用时升序），
  localStorage 持久化，胜利后输入昵称，按**实际是否无猜**归组；自定义模式不计榜；
  侧栏「排行榜」按钮 → 主页面板展示（非弹窗）
- **独立便携安装器 MinesweeperSetup v1.5.0**（v3：安装功能从游戏程序剥离，dist 唯一产物）：
  - 单文件便携 exe（electron-builder portable，NSIS 压缩约 70MB）；双击未安装=安装向导、
    已安装=卸载确认；`--uninstall` 静默卸载（控制面板 UninstallString 入口）；
    `--install-dir <dir>` 静默安装（附 `--no-desktop-shortcut`/`--no-startmenu-shortcut`）
  - 安装 = 复制自身运行时（排除 setup 自身 app.asar；setup exe 重命名 `Minesweeper.exe`）+
    内嵌游戏目录 `resources/game-app/` 前缀映射为目标 `resources/app/`（unpacked）+ 写
    `install-manifest.json`（安装后相对路径清单）+ 注册表卸载项（UninstallString 指向
    setup 磁盘 exe `--uninstall`、InstallLocation）+ 快捷方式
  - 卸载：**清单式删除**（只删清单内文件/自建目录；清单外文件保留并提示；失败分类报错继续）；
    占用文件延迟清理 .bat 重试删除；重定位链 = 自身目录 → 注册表 InstallLocation →
    UninstallString 目录；游戏启动（打包态）自愈 InstallLocation（移动目录后仍可卸载）
  - **setup 零痕迹**：userData 与日志全部落 %TEMP%（便携解压目录退出自动删除）；
    不写自身注册表/AppData/快捷方式——删除磁盘 exe 即无印记
  - 游戏日志：`%LOCALAPPDATA%\Minesweeper\logs\`（按日轮转）；主进程未捕获异常写日志不闪退
  - 旧版 NSIS 残留（目录/快捷方式/注册表）检测 + 一键清理（setup 内）
- 中文界面，经典 Windows 扫雷 3D 浮雕风格（侧栏/面板/向导经美化升级）

技术栈：Electron 33 + 原生 ESM（无打包器）+ Canvas 2D + module Worker + Gamepad API + Vitest（测试）+ electron-builder（portable安装器）。

## 2. 工作流程（必须遵守）

项目按 **vibe-coding 工作流**推进，核心是"文档驱动 + 测试先行 + 任务拆分 + subagent 实现"：

1. **文档链**（位于 `doc/`，改需求必须改文档再动代码）：
   `proposal.md`（需求）→ `high-level-design.md`（架构）→ `detailed-design.md`（接口契约）→
   `tasks/tN-*.md`（任务）→ `tasks/progress.md`（唯一进度源）。
2. **测试先行（TDD 红→绿）**：任何改动前，必须**重新编写严谨、详细、严格的测试**，断言
   设想中的目标文件结构/接口/行为（不得参考当前实现"对答案"）。写完先运行验证：
   **现有文件必须无法通过测试（红）**，只有设想的文件结构才能让测试通过（绿）——测试必须
   能甄别新旧结构。测试是契约的权威——实现以 `detailed-design.md` 为准，测试以实际断言为
   准（两者冲突时以测试为准并同步设计文档）。
3. **任务拆分**：复杂改动拆成独立小任务（每任务 ≤ 1 个模块），各任务写 `doc/tasks/tN-*.md`，
   由 **subagent** 实现；subagent 只做自己任务文件规定的文件，不碰其他任务的文件。
4. **验证闭环**：每个任务完成后 → 运行其测试 → 主 agent 审阅 diff → 更新 progress.md →
   **git commit + push**（每次改动后都推送，仓库：`https://gitee.com/Molotov0coaktail/minesweeper`）。
5. **集成验证**：全量 `npm test` → `scripts/smoke.cjs` 冒烟（确认页面加载/无 JS 错误/无渲染崩溃）→
   `npm run dist` 重新打包（**每次作业必做，见 §3 规则**）。
6. **重大版本更新自动发布 Gitee Release**（version 提升时，见 §3 发布闭环，2026-08-04 起）：
   `git tag v<version>` 推送 → `node scripts/publish-release.cjs`（幂等）→ 公开 API 验证
   Release 与附件 → 发布后同步 AGENTS.md/README 中的版本与发布信息。
7. **⚠️ 自动更新 AGENTS.md（每作业必做）**：每完成一次作业（新功能、修复、重构、接口变更、
   结构/命令/流程变化、版本发布等）后，**自动**回头刷新本文件的相应章节——接口速查（§5）、
   项目结构（§4）、常用命令（§6）、测试约定（§7）、发布流程（§2 第 6 步/§3）——
   保证新会话看到的文档与现实代码一致，无需用户提醒。
   检查方法：`grep -n "^export" src/core/*.js src/renderer/*.js` 与实际签名对比。

## 3. 规则（护栏）

- **核心逻辑必须纯 ESM、零 DOM、零副作用**（`src/core/`），可被 Vitest 在 Node 下直接 import；
  渲染层（`src/renderer/`）只做画与转发。
- **不得修改 `tests/` 下的测试**来迁就实现；认为契约有问题时，先改 `detailed-design.md` 与测试，再改实现。
- **改动前必写甄别性测试（红线）**：所有改动前须重新编写严谨、详细、严格的测试，并先跑一遍
  确认**现有文件无法通过、只有设想的文件结构才能通过**（红→绿）；弱测试（旧代码也能过、
  不触及新结构）视为无效，必须重写到能甄别新旧为止。
- **作业完成闭环（红线，2026-08-04 用户明示）**：任何作业（新功能/修复/重构/构建链改动）
  完成后，除全量测试与冒烟外，**必须** `npm run dist` 重新打包并校验产物
  （dist 唯一 `MinesweeperSetup-<version>-win.exe`），再 git commit + push（§2.4），
  全部完成才算作业结束；**重大版本更新（version 提升）额外发布 Gitee Release**：
  `git tag v<version>` 推送 + `node scripts/publish-release.cjs`（幂等，见 §6）。
  只有纯文档/纯文案改动（不触及 src/electron/setup/ 与打包构建脚本 build-dist.cjs 等
  产物链）可免重新打包，但提交推送仍必须。教训：排行榜修复后未重打包，用户复装旧包症状依旧。
- **Gitee 发布令牌管理（2026-08-04 用户明示）**：发布凭据 = 环境变量 `GITEE_TOKEN` 或
  `.local/gitee-token`（已 .gitignore，**严禁入库/打印**）。令牌更新要求：在
  gitee.com/profile/personal_access_tokens 重新生成（勾选 projects 权限）后，同步替换
  环境变量或 `.local/gitee-token` 文件，并在 progress.md 记录更换时间。
- 全部界面文案、错误信息、日志必须**中文**。
- 接口变更必须同步更新 `detailed-design.md` 与对应测试（先测试后实现）。
- 不确定的需求/产品决策先向用户确认，不擅自决定（参考 proposal.md §7 的决策记录模式）。
- **完成大的作业后必须同步更新 AGENTS.md**（见 §2 第 6 步）：接口、结构、命令、测试约定
  任何一处变化都要反映到本文件，这是本文件的维护义务，不是可选项。
- subagent 规则：不 git commit/push、不改其他任务文件、不留 console.log 调试残留、汇报真实结果。
- 越界访问一律安全返回（undefined/空结果），不抛异常（唯一例外：`randomMineSet` 候选池不足抛错）。
- 数组索引约定：棋盘一维扁平索引 `idx = row * cols + col`。
- **git 上传纪律（只传必要文件）**：仅提交源码、文档、测试、构建配置等必要文件。
  禁止提交：用户数据（localStorage 数据、`%LOCALAPPDATA%\Minesweeper\logs\` 日志、
  `install-manifest.json` 安装清单、安装副本目录如 `game/`）、个人配置、临时/探测脚本、
  构建产物与截图（dist/、smoke-screenshot.png）。提交前必须 `git status --short` 检查：
  未跟踪的冗余目录先加入 `.gitignore` 再提交，绝不明文提交。
- **清理纪律（每次更新后清除冗余）**：每次任务/更新完成后清理旧版本产物与缓存：
  `dist/` 旧包（重新打包前删除旧目录再构建）、`smoke-screenshot.png`、日志、
  `scripts/` 下用后即删的探测/调试脚本、`%TEMP%` 卸载清理 bat 残留、
  测试安装目录（`D:\MinesweeperE2E*`）。提交前复查工作区无冗余文件。

## 4. 项目结构

```
├── AGENTS.md              本手册
├── index.html             入口（含 CSP；仅 #app/#board-wrap/#board-canvas/#scale-handle，控件由 ui.js 生成）
├── package.json           ESM；version 1.5.0；scripts: start/test/test:watch/dist（node scripts/build-dist.cjs）
├── electron/              主进程（CommonJS .cjs，双应用分派）
│   ├── main.cjs           顶部 IS_SETUP 分派（resources/game-app 存在 或 MINESWEEPER_SETUP=1 → setup.cjs）；
│   │                      游戏侧：窗口/preload/IPC（仅 app:get-version，senderFrame 校验）/单实例锁/
│   │                      崩溃日志/打包态 InstallLocation 自愈（reg.exe）
│   ├── setup.cjs          安装器主进程：窗口 + CLI（--uninstall/--install-dir/--no-*-shortcut）+
│   │                      installer IPC 6 通道；userData/日志重定向 %TEMP%（零痕迹）
│   ├── preload.cjs        游戏侧 contextBridge（仅 app.getVersion）
│   ├── preload-setup.cjs  安装器侧 contextBridge（app.getVersion + installer 6 方法 + 进度事件）
│   ├── installer-runner.cjs 安装/卸载真实副作用（fs/reg.exe/PowerShell 快捷方式，薄胶水；
│   │                      打包态安装=运行时复制+exe 重命名+game-app→resources/app 前缀映射）
│   ├── fs-utils.cjs       源树枚举（白名单/全量）/目标树扫描/递归删除
│   └── log.cjs            按日轮转日志（dir 可覆盖：游戏 %LOCALAPPDATA%、setup %TEMP%，清理 7 天前）
├── setup/                 安装器渲染层（v3）
│   ├── index.html         向导/卸载确认页面（CSP 同游戏；link ../styles/main.css + ./wizard.css）
│   ├── ui.js              createSetupUI/startSetupApp（向导 5 步 + 卸载确认 + legacy 清理，jsdom 可测）
│   └── wizard.css         向导样式（自 styles/main.css 迁移；共享类由 main.css 提供）
├── styles/main.css        经典扫雷风（.hidden/.modal/.banner/.bevel-*/.num-1~8 + 侧栏/面板/美化；无向导样式）
├── scripts/
│   ├── smoke.cjs          冒烟诊断：加载页面→收集 console/崩溃→截图→检查画布/DOM/
│   │                      minesweeperAPI（深断言：hasGetVersion=true、noInstallerApi=true）→退出
│   ├── build-dist.cjs     打包流水线（npm run dist）：清理→staging 剥离版游戏到 .build/game-app
│   │                      （校验 package.json.main 与无 installer 面）→ electron-builder portable
│   │                      （--config scripts/setup-builder.yml）→ 清理辅助产物+唯一产物校验
│   ├── setup-builder.yml  安装器构建配置（productName MinesweeperSetup、files 白名单、
│   │                      extraResources .build/game-app→game-app、artifactName 带版本）
│   ├── installer-e2e.cjs  端到端验收（npm run dist 后运行；静默安装/冒烟副本/移动+自愈/
│   │                      --uninstall 静默卸载/外来文件+GUI 卸载，四阶段）
│   └── publish-release.cjs 发布 Gitee Release（v1.2.0 起；tag v<version> 幂等校验 +
│                           dist 唯一 exe 附件上传；凭据 GITEE_TOKEN 或 .local/gitee-token）
├── src/
│   ├── core/              纯 JS 核心逻辑（Node 可单测）
│   │   ├── modes.js       模式预设 + 自定义参数校验
│   │   ├── board.js       棋盘模型：布雷/翻开洪泛/chord×2/标记循环/胜负
│   │   ├── solve.js       可解性判定（deduce：暴露 unknown/连通簇）+ 防猜测重排（标准/高级局部）
│   │   ├── gamepad.js     纯标准手柄映射状态机（死区/中立解锁/边沿/重复/长按）
│   │   ├── game.js        游戏状态机 + 正向计时 + 暂停 + 防猜测调度（标准/高级+回退）
│   │   ├── leaderboard.js localStorage 排行榜
│   │   ├── settings.js    防猜测设置持久化（sanitize/损坏回退/降级）
│   │   └── installer.js   安装清单/卸载计划/错误分类/路径重定位/映射（纯逻辑零副作用，fsOps 注入；
│   │                      v3：planInstall renames/relPrefix、relocateManifestDir InstallLocation 链；
│   │                      仅安装器打包，游戏包不含）
│   └── renderer/          渲染与交互（v3 无任何安装相关代码）
│       ├── render.js      Canvas 经典 3D 风绘制
│       ├── ui.js          顶栏/侧栏/主页面板/横幅/暂停遮罩/昵称
│       ├── gamepad.js     浏览器手柄RAF轮询，返回stop清理函数
│       ├── controller-ui.js 作用域控件导航/编辑与昵称键盘焦点
│       ├── generation-client.js Worker生命周期/取消/超时
│       ├── generation-worker.js Worker生成协议与标准/高级回退
│       └── main.js        装配：鼠标/缩放/resize/设置持久化接线
├── tests/                 Vitest 测试（32 个文件，414 用例，先于实现编写；含 setup.ui.test.js）
├── doc/                   需求/设计/任务文档（工作流产物，改功能先改这里）
│   ├── proposal.md        需求提案（含用户决策记录）
│   ├── high-level-design.md / detailed-design.md
│   ├── prompt.md          控制 prompt（主 agent/subagent 规则）
│   └── tasks/             任务文档 + progress.md（唯一进度源）
└── dist/                  打包产物（gitignore；唯一文件 MinesweeperSetup-1.5.0-win.exe）
.build/                    打包 staging（gitignore；剥离版游戏文件，脚本生成）
.local/                    本地凭据/私有配置（gitignore；.local/gitee-token 发布令牌，严禁入库）
```

## 5. 模块接口速查

### core/modes.js
```js
MODES = { beginner:{key,name:'初级',rows:9,cols:9,mines:10},
          intermediate:{...16,16,40}, expert:{...16,30,99} }
CUSTOM_RANGE = { min:5, max:60 };  CUSTOM_MAX_DENSITY = 0.8
validateCustom(rows, cols, mines)
// -> {ok:true, rows, cols, mines} | {ok:false, error:<中文>}
// 约束：整数；行列∈[5,60]；mines∈[1, min(⌊总数×0.8⌋, 总数−9)]
```

### core/board.js（Cell = { idx,row,col,isMine,count,state }）
```js
CELL_HIDDEN='hidden' CELL_FLAGGED='flagged' CELL_QUESTIONED='questioned' CELL_REVEALED='revealed'
createBoard(rows, cols, mines) -> {rows,cols,mines,cells,revealedCount,flagCount,minesPlaced:false}
indexAt(rows,cols,row,col) -> idx | -1            cellAt(board,row,col) -> Cell|undefined
neighborIndexes(rows,cols,idx) -> number[]（≤8 升序）  neighborsOf(board,row,col) -> Cell[]
randomMineSet(rows,cols,mines,safeIdx,rng=Math.random) -> Set<number>（Fisher–Yates；池不足抛错）
setMines(board, mineSet) -> board（写雷+算 count）   placeMines(board, safeIdx) -> board
reveal(board,row,col)     -> {revealed:number[], exploded:boolean}   // 0 区洪泛
chordLeft(board,row,col)  -> {revealed, exploded}   // 旗数==count→翻开未标旗邻居；有雷爆炸
chordRight(board,row,col) -> {flagged:number[]} | {blocked:true,flagged:[]}  // count==未翻开数→批量标旗
cycleMark(board,row,col)  -> {state, blocked}       // hidden→flagged(旗满blocked)→questioned→hidden
isWin(board) -> revealedCount===rows*cols-mines      revealAllMines(board) -> number[]
```

### core/solve.js（NSS 单格 + SNS 2-集子集推理）
```js
MAX_ATTEMPTS = 20;  MAX_DENSITY = 0.5
MAX_REGION_ATTEMPTS = 20;  MAX_MOVES = 20;  MAX_MOVE_CANDIDATES = 100;  MAX_TOTAL_DEDUCE = 400
density(rows,cols,mines) -> number
deduce(rows,cols,mineSet,startIdx) -> { solved, unknown:Set, clusters:Array<Set>, smallest:Set|null }
// 推导至不动点；unknown=未判定格（含未标雷的雷）；clusters=8-连通簇（簇内 idx 升序，
// 按 size 升序、同 size 按最小 idx 升序）；smallest=clusters[0]
isSolvable(rows,cols,mineSet,startIdx) -> boolean   // = deduce(...).solved（薄包装）
generateAntiGuess(rows,cols,mines,startIdx,opts={maxAttempts,maxDensity,rng})
// -> {ok:true,mineSet,attempts} | {ok:false,reason:'density',mineSet:null,attempts:0}
//  | {ok:false,reason:'retries',mineSet:<最后一次>,attempts:maxAttempts}
generateAntiGuessAdvanced(rows,cols,mines,startIdx,opts={maxRegionAttempts,rng})
// -> {ok, reason?:'density'|'region', mineSet, attempts, regionAttempts, moves, regions}
// 高级局部重排：最小歧义簇 → 簇外雷固定簇内重排（每轮局部计数）→ 减雷移雷（候选验证
// (s2.unknown\R)⊆outsideStuck 接受）→ 循环；预算/上限封顶 → reason:'region'（game 负责回退标准）
```

### core/game.js
```js
STATE = { READY:'ready', GENERATING:'generating', PLAYING:'playing', PAUSED:'paused', WON:'won', LOST:'lost' }
createGame(config, opts={})
// config:{rows,cols,mines,antiGuess,mode, antiGuessMethod?,maxAttempts?,maxRegionAttempts?}
//   antiGuessMethod:'standard'|'advanced'(默认 standard)；maxAttempts/maxRegionAttempts 默认 20
// opts:{now?:()=>number, prepareBoard?:(config,startIdx)=>Promise<Opening>}
game: { state,rows,cols,mines,mode,board,antiGuess,antiGuessActive,warning,
        antiGuessMethod,maxAttempts,maxRegionAttempts,antiGuessStats|null }
game.restart()                // 保留防猜测配置字段，重置 antiGuessStats=null
game.pause()/resume()   game.getElapsedMs()  game.getRemainingMines()
game.reveal(row,col)    -> {type:'generating'|'reveal'|'win'|'lose'|'noop'}
game.chordLeft(row,col) -> {type:'reveal'|'win'|'lose'|'noop'}
game.chordRight(row,col)-> {type:'flag'|'blocked'|'noop'}
game.cycleMark(row,col) -> {type:'mark', state, blocked}
game.cancelGeneration()       // 使异步世代失效，生成态回ready
game.on('win'|'lose'|'warning'|'generated', cb)
// win/lose payload: {timeMs, mode, antiGuessActive, rows, cols, mines}
// warning 精确文案：
//   '防猜测已关闭：雷密度过高，无法保证无猜'
//   `防猜测已关闭：重排 ${maxAttempts} 次仍无法保证无猜`（默认 20）
// 高级模式调度：advanced ok→生效；reason:'density'→不回退；reason:'region'→回退标准
// （透传 maxAttempts）；标准 retries → 关闭+横幅
// 操作守卫：READY 可 reveal(首点)/cycleMark；PAUSED/WON/LOST 一切操作 noop
// 首次 reveal 触发布雷，布雷方式：setMines(board, randomMineSet(...)) 或返回的 mineSet
// 必须从 solve.js 具名 import generateAntiGuess/generateAntiGuessAdvanced（测试 mock 依赖）
```

### core/settings.js（v2）
```js
SETTINGS_KEY = 'minesweeper.settings.v1'
DEFAULT_SETTINGS = { antiGuess:true, antiGuessMethod:'standard', maxAttempts:20, maxRegionAttempts:20,
                     gamepadBindings:{reveal:0,mark:1,menu:2,pause:9,restart:3,focus:11,help:8}, focusView:false }
LIMITS = { maxAttempts:[1,200], maxRegionAttempts:[1,200] }
createSettings(storage=globalThis.localStorage) -> { get()->拷贝, update(patch)->拷贝, reset()->拷贝 }
// 读取全字段 sanitize（损坏/越界回退默认）；update 非法字段忽略保留现值；storage 抛错内存降级
```

### core/installer.js（v2→v3，纯逻辑零副作用，fsOps 注入；仅安装器打包，游戏不含）
```js
MANIFEST_FILE = 'install-manifest.json';  UNINSTALL_KEY = 'HKCU\\...\\Uninstall\\Minesweeper'
toManifestPath(rel)->string|null           // 规范化；空/绝对/..穿越/: → null
buildManifest({appName,appVersion,files,dirs,shortcuts})->string
parseManifest(json,baseDir)->{ok,manifest|error}   // 版本/结构/越界校验，成功含 baseDir
classifyFsError(err,path)->{code,message}  // NOT_FOUND/PERMISSION/BUSY/FS_ERROR（中文）
classifyOpError(op,err,ctx)->{code,message} // REG_FAIL/SHORTCUT_FAIL/COPY_FAIL(ENOSPC 磁盘不足)/MANIFEST_MISSING
planInstall({sourceDir,targetDir,files,excludes,renames={},relPrefix=null})->{steps,dirs}
// v3：renames 精确重命名（{ 'MinesweeperSetup.exe':'Minesweeper.exe' }）；
// relPrefix 前缀映射（{ src:'resources\\game-app', dst:'resources\\app' }）；
// 优先级 renames > relPrefix > 原样；step.rel = 安装后 rel（清单据此构建）；缺省= v2 行为
planUninstall({manifest,tree})->{toDelete,skippedExtraneous,skippedMissing}
// 文件先、目录自底向上、根目录最后；清单外/含外来内容的目录跳过保留
relocateManifestDir({execPathDir,registryInstallLocation,registryUninstallString,existsSync})->dir|null
// v3 链：自身目录 → 注册表 InstallLocation（去引号）→ UninstallString exe 目录 → null；缺省= v2 行为
suggestInstallDir(drives)->string          // 首个非系统盘 → '<盘>:\Minesweeper'；空 → %USERPROFILE%
validateInstallDir(dir,{selfDir,isFile})->{ok,error}
detectLegacy({localAppData,registryExists,existsSync,shortcutCandidates})->{oldNsisDir,oldShortcuts,oldRegistry}
buildUninstallCleanupScript({files,dirs})->string  // 重试循环 bat（应用退出后删占用文件）
executeSteps(steps,fsOps,onStep)->Promise<{ok,errors,done,skipped}>  // 单步失败归类继续；ENOENT 视为已删
formatLogLine(level,module,message,ts)->string
```

### core/leaderboard.js
```js
LEADERBOARD_KEY='minesweeper.leaderboard.v1';  TOP_N=10;  LEADERBOARD_MODES=['beginner','intermediate','expert']
createLeaderboard(storage=globalThis.localStorage) -> {
  getScores(mode, antiGuess) -> entry[]            // {nickname,timeMs,date} 按 timeMs 升序，≤10
  isTopTen(mode, antiGuess, timeMs) -> boolean
  addScore(mode, antiGuess, nickname, timeMs) -> {added, rank}   // 相同 timeMs 后写排后
  getLastNickname() / setLastNickname(name)        // 默认'玩家'，截断 16 字符
  clear()
}
// 损坏 JSON 自动修复；storage 抛错内存降级不崩溃
```

### renderer/render.js
```js
drawCell(ctx, x, y, size, cell, gameState, opts={})   // 经典 3D 浮雕；数字配色 1蓝2绿3红4深蓝5深红6青7黑8灰
drawBoard(ctx, game, cellSize, opts={})
```

### renderer/ui.js（v3 已剥离安装/卸载）
```js
createUI(host, deps) -> { setMineCount, setTime, setPauseOverlay, setAntiGuessActive,
                          showBanner, hideBanner, showNicknamePrompt, showLeaderboard, setCustomError,
                          setAntiGuessSettings, getSidebarOpen, setGameStatus, setControllerStatus,
                          handleController, hasControllerContext, showHelp, showControls, closePage,
                          setGamepadBindings, setFocusView, getFocusView, setBoardSize, resetTransient, destroy }
deps = { leaderboard, getState, actions:{ selectMode, applyCustom, toggleAntiGuess,
                                          pause, resume, restart, submitNickname,
                                          toggleSidebar, setAntiGuessMethod, setMaxAttempts,
                                          setMaxRegionAttempts, openLeaderboard, setGamepadBinding,
                                          resetGamepadBindings, setFocusView, setBoardSize } }
// v2 新增 actions 一律可选链调用（旧测试 deps 无这些键）
formatTime(ms) -> 'MM:SS'
// DOM 契约（jsdom 测试按 id 查询，新增控件不得破坏这些 id）：
// 顶栏：#sidebar-toggle #mine-count #timer #pause-btn #resume-btn(遮罩内) #restart-btn
//       #warning-banner(+text/close)
// 侧栏：#sidebar .ms-mode[data-mode=beginner|intermediate|expert]×3
//       #custom-rows/cols/mines #custom-apply #custom-error
//       #anti-guess-toggle #antiguess-status #ag-method #ag-max-attempts #ag-region-attempts #ag-settings-hint
//       #leaderboard-open（v3 无 #installer-open）
// 主页面板：#leaderboard-modal(ms-panel，非 overlay！)+tabs/body/close/hint
// 弹窗：#pause-overlay #nickname-modal(+input/submit/cancel)
```

### renderer/main.js 要点（v2/v3）
- v1.3.0：startApp({host,storage}={}) -> {destroy()}；键盘/自动暂停/DPR/实际布局与事件重绘契约见顶部维护速查。
- 启动 `settings.get()` 回填 UI 并作为新对局 config；变更 → `settings.update()` 持久化
- `toggleSidebar` → fitToWindow()（侧栏展开可用宽扣 248px）
- v3：无安装/卸载流（window.minesweeperAPI 仅 app.getVersion）

### setup 渲染层（v3，setup/ui.js，详见 detailed-design §6b）
```js
createSetupUI(host, deps) -> { showStatus(status), showStep(step,payload), setProgress({done,total,message}),
                               showReport(result), showUninstallConfirm({dir,appVersion}),
                               showLegacyPrompt(legacy), showError(msg) }
// deps.actions = { suggestDir, startInstall(opts), runUninstall, runCleanLegacy, exit }（可选链）
// DOM： #setup-mode[data-mode=wizard|uninstall] #setup-step[data-step]
//       #install-dir-input/-suggest/-error #install-desktop-chk/-startmenu-chk
//       #install-progress-track/fill/text #install-report(li[data-code])
//       #install-next/back/confirm/cancel/close #uninstall-dir/-version/-confirm-btn
//       #installer-legacy-clean
startSetupApp()  // 内置 window.minesweeperAPI?.installer 接线；无 preload 显示中文提示不崩；
// ui.js 底部：#setup-root 存在才自动启动（jsdom 测试不自动跑）
```

### electron（v3 双应用，详见 detailed-design §7）
```js
// main.cjs 顶部 IS_SETUP 分派：
//   const isSetup = process.env.MINESWEEPER_SETUP === '1' ||
//     fs.existsSync(path.join(path.dirname(app.getAppPath()), 'game-app'));
//   if (isSetup) { require('./setup.cjs'); return; }
// 游戏侧 preload.cjs：仅 app.getVersion（app:get-version 单 IPC 通道，senderFrame 校验）；
// 单实例锁（无 second-instance 转发）；崩溃日志；打包态 selfHealInstallLocation
// （仅 app.isPackaged：reg query InstallLocation ≠ 自身目录且自身有清单 → reg add 更新，
//  UNINSTALL_KEY 内联硬编码，失败仅 warn）
// 安装器侧：
//   setup.cjs：setPath('userData', %TEMP%\MinesweeperSetup-userdata) + 日志落 %TEMP%（零痕迹）；
//   CLI --uninstall / --install-dir <dir>（+--no-desktop-shortcut/--no-startmenu-shortcut）；
//   GUI 窗口 520×480 preload=preload-setup.cjs；installer IPC 6 通道（校验同 v2）
//   preload-setup.cjs：app.getVersion + installer.getStatus/suggestDir/install/uninstall/
//     cleanLegacy/onProgress
// installer-runner.cjs（仅安装器打包）：
//   打包态安装源 = dirname(process.execPath) 全量，excludes=[MANIFEST_FILE,'resources\\app.asar']；
//   planInstall renames={setup exe 名:'Minesweeper.exe'} + relPrefix={src:'resources\\game-app',
//   dst:'resources\\app'}；manifest files=steps.map(s=>s.rel)（安装后 rel）；
//   注册表：UninstallString="<PORTABLE_EXECUTABLE_FILE || 自身 exe>" --uninstall、
//   DisplayIcon/快捷方式指向 目标\Minesweeper.exe、InstallLocation=目标目录；
//   getStatus/卸载重定位传 registryInstallLocation；卸载流程与 v2 一致（占用延迟 bat）
```

## 6. 常用命令

```bash
npm install   # 国内网络：ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
              # ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ npm install --registry=https://registry.npmmirror.com
npm start     # 启动游戏。注意：本机 shell 预设 ELECTRON_RUN_AS_NODE=1，需先 unset
              # （unset ELECTRON_RUN_AS_NODE && npm start）
              # 开发态启动安装器：MINESWEEPER_SETUP=1 npm start（调试 setup 向导/卸载界面）
npm test      # 全量 Vitest（414 用例，全部必须绿）
npm run test:watch
npm run dist  # 打包独立便携安装器到 dist/（唯一产物 MinesweeperSetup-1.5.0-win.exe；
              # 需设上述镜像环境变量；signAndEditExecutable=false；target=portable）
# 冒烟：unset ELECTRON_RUN_AS_NODE && npx electron scripts/smoke.cjs
# 输出 SMOKE_RESULT JSON：rendererGone/failLoad 为 null、consoleLines 空、canvasW/H>0、
# hasGetVersion=true、noInstallerApi=true、noInstallerOpenBtn=true、hasSidebarToggle=true 即正常
# 端到端安装/卸载验收：node scripts/installer-e2e.cjs（先 npm run dist；
# 四阶段：静默安装→冒烟安装副本+移动+自愈+静默卸载→外来文件+GUI 卸载→清理；
# 会在 D:\MinesweeperE2E 真实安装/移动/卸载，用后清理；当前 32/32 通过）
# 发布 Gitee Release（重大版本更新后必做，§2 第 6 步）：git tag v<version> && git push origin v<version>
#   && node scripts/publish-release.cjs（幂等：tag 已发布则拒绝覆盖；产物校验；
#   凭据 GITEE_TOKEN 环境变量或 .local/gitee-token，更新要求见 §3）
#   发布后验证（公开 API，无需令牌）：
#   curl https://gitee.com/api/v5/repos/Molotov0coaktail/minesweeper/releases
#   首个 Release：v1.2.0（2026-08-04，含排行榜修复；发布流程经实测稳定，含 3 个踩坑修复）
#   最新 Release：v1.5.0（2026-10-31，完整手柄界面/默认B/自定义键位/说明专页/专注；414用例、E2E32/32）
```

## 7. 测试约定

- **改动前重写测试（红线，见 §2 第 2 步）**：任何改动前必须重新编写严谨、详细、严格的测试，
  断言设想中的文件结构/接口/行为，不得按当前实现"对答案"；先运行确认**现有文件无法通过
  测试、只有设想的文件结构才能通过**（红），再改实现直至全绿（绿）。禁止编写旧代码也能
  通过的弱测试，禁止用放宽断言来让现有实现过关。
- 测试文件与模块一一对应：`tests/<module>.test.js`。
- 确定性布局注入：`solve.retries.test.js` / `game.test.js` / `solve.advanced.test.js` / `game.advanced.test.js`
  通过 `vi.mock` 注入（依赖实现必须从 board.js 具名 import `randomMineSet`、从 solve.js 具名 import
  `generateAntiGuess`/`generateAntiGuessAdvanced`，mock 才能生效）。solve.advanced.test.js 的精确数值
  来自契约预言机验证（deduce 簇内 idx 升序/候选池顺序/rng 消耗顺序是确定性的前提）。
- `ui.test.js` / `ui.sidebar.test.js` / `setup.ui.test.js` 用 jsdom（文件头 `@vitest-environment jsdom`），其余默认 node。
- `installer.test.js` 注入 fake fsOps 测 executeSteps；错误分类中文文案逐字断言；
  v3 新增 planInstall renames/relPrefix 映射与 relocateManifestDir InstallLocation 链用例。
- `setup.ui.test.js` 测安装向导/卸载确认/进度/报告/legacy（setup/ui.js，与游戏 renderer 隔离）。
- 新增功能：先在 `tests/` 写测试 → 在 `detailed-design.md` 记录契约 → 再实现 → 全绿后提交推送。
- 集成冒烟用 `scripts/smoke.cjs`（断言游戏无 installer 面）；打包后安装/卸载端到端用
  `scripts/installer-e2e.cjs`（先 `npm run dist`，四阶段全过）。

## 8. 程序弱点评估与改进建议

> 基于 2026-08-04 v3 全量验收（230/230 测试 + 冒烟 + 端到端 32/32）后的诚实评估。
> 按影响排序；每条给出建议，实施前须走文档链（proposal → 设计 → 测试先行）。
> v3 变化：安装/卸载已从游戏剥离为独立便携 MinesweeperSetup（8.3/8.4/8.7 相应更新）。

### 8.1 可解性算法为充分条件启发式（影响：玩法体验）
- **弱点**：NSS 单格 + SNS 2-集子集推理"判可解必真，判不可解可能高估"——需更复杂推理
  （3+ 集子集、组合约束）的极限局面会被误判为"需猜测"而触发不必要重排。
- **建议**：如需要更强的无猜保证，扩展高阶子集推理或引入完整解算器（代价是推导耗时上升，
  需配预算与缓存）；否则维持现状并在 README 说明近似性。

### 8.2 高级防猜测模式最坏情况耗时（影响：大棋盘首点延迟）
- v1.4.0 已移至Worker，首点不阻塞UI；可重开取消，8秒硬超时后普通安全开局并警告。推理邻居表已单次缓存，仍无增量推理/跨布局缓存，不能保证所有局面8秒内生成无猜盘。
- **弱点**：每次区域重排/候选验证都是整盘 `deduce`（60×60 单次约 10~50ms），
  最坏场景受 `MAX_TOTAL_DEDUCE=400` 预算兜底，首点延迟可达数秒。
- **建议**：区域重排后增量重推（仅重算受影响区域的前沿）；同一对局内 deduce 结果缓存；
  或预算按棋盘规模自适应（小棋盘收紧、大棋盘放宽）。

### 8.3 游戏运行中卸载依赖延迟清理（影响：卸载体验）
- **弱点**：v3 已大幅缓解——安装器与游戏分离，卸载游戏目录时 setup 自身无占用；
  若游戏进程仍在运行（BUSY）仍靠延迟 .bat 重试删除（实测约 30s 内完成），期间目录可见。
- **建议**：卸载前检测游戏进程是否在运行，提示先退出再卸载；或
  "复制卸载器到 %TEMP% 后退出再删自身"模式，使卸载在 1~2s 内完成。

### 8.4 注册表 UninstallString/快捷方式指向绝对路径（影响：移动后的便利性）
- **弱点**：安装时记录的绝对路径——setup exe 被移动/删除后控制面板卸载入口失效；
  安装目录被移动后快捷方式指向旧路径而失效（v3 已自愈 InstallLocation，游戏运行一次后
  setup 仍能定位卸载）。
- **建议**：游戏启动时检测快捷方式指向与当前 exe 不符 → 提示或自动重建；卸载时一并清理；
  控制面板入口失效时提示"重新获取 setup 即可卸载"。

### 8.5 注册表卸载项仅 HKCU（影响：多用户环境）
- **弱点**：卸载项写 HKCU，仅当前用户可见；其他用户无法从控制面板卸载。
- **建议**：如面向多用户分发，HKLM（需管理员权限）+ HKCU 双写；写入失败降级 HKCU 并提示。

### 8.6 排行榜数据仅存 localStorage（影响：数据持久性）
- **弱点**：清浏览器数据/系统清理即丢失；无备份迁移手段。
- **建议**：增加导出/导入（JSON 文件对话框），或迁移至 `%APPDATA%` 用户数据文件。

### 8.7 主进程副作用无单元测试（影响：回归风险）
- **弱点**：IPC/注册表/快捷方式/自删 bat 等真实副作用依赖 node --check + 冒烟 + E2E 覆盖
  （v3 E2E 四阶段 32/32 已覆盖静默安装/自愈/静默卸载/GUI 卸载/外来文件保留），无 Vitest 单测。
- **建议**：将 reg.exe/PowerShell 调用抽象为可注入执行器（薄胶水之上再加一层接口），补单测。

### 8.8 core 层入参校验缺失（影响：健壮性）
- v1.3.0：board坐标/索引校验、game首点状态守卫、leaderboard数据边界已补；以下完整config/求解参数校验仍待后续。
- **弱点**：`generateAntiGuess*`/`createGame` 信任入参（范围校验仅在 settings 层），
  越界值可能引发异常行为。
- **建议**：core 层加防御性校验（非法回退默认值，保持"安全返回不抛异常"铁律）。

### 8.9 绿色版未代码签名（影响：分发信任）
- **弱点**：`signAndEditExecutable=false` 未签名，Windows SmartScreen 可能警告。
- **建议**：正式分发配置代码签名证书；需要时启用 asar 压缩减小体积（当前未压缩）。

### 8.10 交互可访问性有限（影响：无障碍）
- v1.3.0 已增加方向键/空格/Enter/F操作、焦点轮廓与格状态中文描述、模态焦点管理；forced-colors下增强选中轮廓。
- **仍有限制**：Canvas未提供每格DOM读屏网格，尚无完整高对比度棋盘主题；需要时进一步扩展，不宣称完全无障碍。

### 8.11 防御性分支缺端到端验证（影响：覆盖盲区）
- **弱点**：高级防猜测的"簇全雷/簇内无雷/全部候选被拒绝"分支在小棋盘上不可达，
  预算封顶路径仅单测覆盖。
- **建议**：构造大棋盘（60×60）压力测试脚本，验证预算路径与回退链的端到端行为。

### 8.12 日志含完整路径（影响：隐私）
- **弱点**：日志记录完整路径（安装/卸载目标、用户名目录）。
- **建议**：面向公开分发时提供路径脱敏配置（默认开启）。
