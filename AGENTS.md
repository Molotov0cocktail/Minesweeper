# AGENTS.md — Minesweeper 项目工作手册

> 本文件在每次新会话启动时加载。目标：让新对话快速上手本项目，并严格按
> vibe-coding 工作流（见 `.agents/skills/vibe-coding-workflow/SKILL.md`）工作。

## 1. 项目概览

Electron 经典扫雷桌面程序（Windows）。核心特性：

- 三种标准模式（初级 9×9/10、中级 16×16/40、高级 16×30/99）+ 自定义行列/雷数
- **左侧侧栏**（汉堡按钮展开/收起，默认收起）：等级选择/自定义/防猜测设置/排行榜入口/安装卸载入口；
  顶栏保留汉堡/标题/剩余雷数/时间/暂停/重开/横幅；展开时棋盘缩放适配（可用宽扣 248px）
- 拖动缩放手柄缩放显示（格子 16~48px）、窗口等比自适应
- 经典交互：左键翻开/空区扩散、右键 旗→问号→无、左键数字格 chord、右键数字格镜像 chord
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
- **应用内安装/卸载管理器**（免安装绿色版分发）：
  - 安装向导：选地址（默认 D:\Minesweeper，无 D 盘回退其他盘）+ 桌面/开始菜单快捷方式勾选 →
    复制完整运行时（打包形态）+ 写 `install-manifest.json`（相对路径清单）+ 注册表卸载项 + 快捷方式
  - 卸载：**清单式删除**（只删清单内文件/自建目录；清单外文件保留并提示；失败分类报错继续）；
    占用文件延迟清理 .bat 重试删除；移动目录自动重定位不崩溃；`--uninstall` 静默入口（控制面板）
  - 日志：`%LOCALAPPDATA%\Minesweeper\logs\`（按日轮转）；主进程未捕获异常写日志不闪退
  - 旧版 NSIS 残留（目录/快捷方式/注册表）检测 + 一键清理
- 中文界面，经典 Windows 扫雷 3D 浮雕风格（侧栏/面板/向导经美化升级）

技术栈：Electron 33 + 原生 ESM（无打包器）+ Canvas 2D + Vitest（测试）+ electron-builder（打包 dir/zip 绿色版）。

## 2. 工作流程（必须遵守）

项目按 **vibe-coding 工作流**推进，核心是"文档驱动 + 测试先行 + 任务拆分 + subagent 实现"：

1. **文档链**（位于 `doc/`，改需求必须改文档再动代码）：
   `proposal.md`（需求）→ `high-level-design.md`（架构）→ `detailed-design.md`（接口契约）→
   `tasks/tN-*.md`（任务）→ `tasks/progress.md`（唯一进度源）。
2. **测试先行**：行为契约必须先写成 `tests/` 测试，再实现。测试是契约的权威——
   实现以 `detailed-design.md` 为准，测试以实际断言为准（两者冲突时以测试为准并同步设计文档）。
3. **任务拆分**：复杂改动拆成独立小任务（每任务 ≤ 1 个模块），各任务写 `doc/tasks/tN-*.md`，
   由 **subagent** 实现；subagent 只做自己任务文件规定的文件，不碰其他任务的文件。
4. **验证闭环**：每个任务完成后 → 运行其测试 → 主 agent 审阅 diff → 更新 progress.md →
   **git commit + push**（每次改动后都推送，仓库：`https://gitee.com/Molotov0coaktail/minesweeper`）。
5. **集成验证**：全量 `npm test` → `scripts/smoke.cjs` 冒烟（确认页面加载/无 JS 错误/无渲染崩溃）→
   `npm run dist` 打包。
6. **⚠️ 大作业收尾必须更新 AGENTS.md**：每完成一次大的作业（新功能、重构、接口变更、
   结构/命令/流程变化等）后，必须回头刷新本文件的相应章节——接口速查（§5）、项目结构（§4）、
   常用命令（§6）、测试约定（§7）——保证新会话看到的文档与现实代码一致。
   检查方法：`grep -n "^export" src/core/*.js src/renderer/*.js` 与实际签名对比。

## 3. 规则（护栏）

- **核心逻辑必须纯 ESM、零 DOM、零副作用**（`src/core/`），可被 Vitest 在 Node 下直接 import；
  渲染层（`src/renderer/`）只做画与转发。
- **不得修改 `tests/` 下的测试**来迁就实现；认为契约有问题时，先改 `detailed-design.md` 与测试，再改实现。
- 全部界面文案、错误信息、日志必须**中文**。
- 接口变更必须同步更新 `detailed-design.md` 与对应测试（先测试后实现）。
- 不确定的需求/产品决策先向用户确认，不擅自决定（参考 proposal.md §7 的决策记录模式）。
- **完成大的作业后必须同步更新 AGENTS.md**（见 §2 第 6 步）：接口、结构、命令、测试约定
  任何一处变化都要反映到本文件，这是本文件的维护义务，不是可选项。
- subagent 规则：不 git commit/push、不改其他任务文件、不留 console.log 调试残留、汇报真实结果。
- 越界访问一律安全返回（undefined/空结果），不抛异常（唯一例外：`randomMineSet` 候选池不足抛错）。
- 数组索引约定：棋盘一维扁平索引 `idx = row * cols + col`。

## 4. 项目结构

```
├── AGENTS.md              本手册
├── index.html             入口（含 CSP；仅 #app/#board-wrap/#board-canvas/#scale-handle，控件由 ui.js 生成）
├── package.json           ESM；scripts: start/test/test:watch/dist；build.win.target=["dir","zip"]；signAndEditExecutable=false
├── electron/              主进程（CommonJS .cjs）
│   ├── main.cjs           窗口/preload/IPC 白名单(senderFrame 校验)/单实例锁/--uninstall 静默卸载/崩溃日志
│   ├── preload.cjs        contextBridge 暴露 window.minesweeperAPI（app.getVersion + installer 6 方法）
│   ├── installer-runner.cjs 安装/卸载真实副作用（fs/reg.exe/PowerShell 快捷方式，薄胶水）
│   ├── fs-utils.cjs       源树枚举（白名单/全量）/目标树扫描/递归删除
│   └── log.cjs            按日轮转日志（%LOCALAPPDATA%\Minesweeper\logs\，清理 7 天前）
├── styles/main.css        经典扫雷风（.hidden/.modal/.banner/.bevel-*/.num-1~8 + 侧栏/面板/向导/美化）
├── scripts/smoke.cjs      冒烟诊断：加载页面→收集 console/崩溃→截图→检查画布/DOM/minesweeperAPI→退出
├── src/
│   ├── core/              纯 JS 核心逻辑（Node 可单测）
│   │   ├── modes.js       模式预设 + 自定义参数校验
│   │   ├── board.js       棋盘模型：布雷/翻开洪泛/chord×2/标记循环/胜负
│   │   ├── solve.js       可解性判定（deduce：暴露 unknown/连通簇）+ 防猜测重排（标准/高级局部）
│   │   ├── game.js        游戏状态机 + 正向计时 + 暂停 + 防猜测调度（标准/高级+回退）
│   │   ├── leaderboard.js localStorage 排行榜
│   │   ├── settings.js    防猜测设置持久化（sanitize/损坏回退/降级）
│   │   └── installer.js   安装清单/卸载计划/错误分类/路径重定位（纯逻辑零副作用，fsOps 注入）
│   └── renderer/          渲染与交互
│       ├── render.js      Canvas 经典 3D 风绘制
│       ├── ui.js          顶栏/侧栏/主页面板/安装向导/横幅/暂停遮罩/昵称
│       └── main.js        装配：鼠标/缩放/resize/设置持久化接线/IPC 调用
├── tests/                 Vitest 测试（13 个文件，204 用例，先于实现编写）
├── doc/                   需求/设计/任务文档（工作流产物，改功能先改这里）
│   ├── proposal.md        需求提案（含用户决策记录）
│   ├── high-level-design.md / detailed-design.md
│   ├── prompt.md          控制 prompt（主 agent/subagent 规则）
│   └── tasks/             任务文档 + progress.md（唯一进度源）
└── dist/                  electron-builder 产物（gitignore；win-unpacked/ + zip 绿色版）
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
STATE = { READY:'ready', PLAYING:'playing', PAUSED:'paused', WON:'won', LOST:'lost' }
createGame(config, opts={})
// config:{rows,cols,mines,antiGuess,mode, antiGuessMethod?,maxAttempts?,maxRegionAttempts?}
//   antiGuessMethod:'standard'|'advanced'(默认 standard)；maxAttempts/maxRegionAttempts 默认 20
// opts:{now?:()=>number}
game: { state,rows,cols,mines,mode,board,antiGuess,antiGuessActive,warning,
        antiGuessMethod,maxAttempts,maxRegionAttempts,antiGuessStats|null }
game.restart()                // 保留防猜测配置字段，重置 antiGuessStats=null
game.pause()/resume()   game.getElapsedMs()  game.getRemainingMines()
game.reveal(row,col)    -> {type:'reveal'|'win'|'lose'|'noop'}
game.chordLeft(row,col) -> {type:'reveal'|'win'|'lose'|'noop'}
game.chordRight(row,col)-> {type:'flag'|'blocked'|'noop'}
game.cycleMark(row,col) -> {type:'mark', state, blocked}
game.on('win'|'lose'|'warning', cb)
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
DEFAULT_SETTINGS = { antiGuess:true, antiGuessMethod:'standard', maxAttempts:20, maxRegionAttempts:20 }
LIMITS = { maxAttempts:[1,200], maxRegionAttempts:[1,200] }
createSettings(storage=globalThis.localStorage) -> { get()->拷贝, update(patch)->拷贝, reset()->拷贝 }
// 读取全字段 sanitize（损坏/越界回退默认）；update 非法字段忽略保留现值；storage 抛错内存降级
```

### core/installer.js（v2，纯逻辑零副作用，fsOps 注入）
```js
MANIFEST_FILE = 'install-manifest.json';  UNINSTALL_KEY = 'HKCU\\...\\Uninstall\\Minesweeper'
toManifestPath(rel)->string|null           // 规范化；空/绝对/..穿越/: → null
buildManifest({appName,appVersion,files,dirs,shortcuts})->string
parseManifest(json,baseDir)->{ok,manifest|error}   // 版本/结构/越界校验，成功含 baseDir
classifyFsError(err,path)->{code,message}  // NOT_FOUND/PERMISSION/BUSY/FS_ERROR（中文）
classifyOpError(op,err,ctx)->{code,message} // REG_FAIL/SHORTCUT_FAIL/COPY_FAIL(ENOSPC 磁盘不足)/MANIFEST_MISSING
planInstall({sourceDir,targetDir,files,excludes})->{steps,dirs}
planUninstall({manifest,tree})->{toDelete,skippedExtraneous,skippedMissing}
// 文件先、目录自底向上、根目录最后；清单外/含外来内容的目录跳过保留
relocateManifestDir({execPathDir,registryUninstallString,existsSync})->dir|null  // 移动目录重定位
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

### renderer/ui.js
```js
createUI(host, deps) -> { setMineCount, setTime, setPauseOverlay, setAntiGuessActive,
                          showBanner, hideBanner, showNicknamePrompt, showLeaderboard, setCustomError,
                          setAntiGuessSettings, setInstallerLabel, showInstallerWizard,
                          setInstallerProgress, showInstallerReport, getSidebarOpen }
deps = { leaderboard, getState, actions:{ selectMode, applyCustom, toggleAntiGuess,
                                          pause, resume, restart, submitNickname,
                                          toggleSidebar, setAntiGuessMethod, setMaxAttempts,
                                          setMaxRegionAttempts, openLeaderboard, openInstaller,
                                          runInstall, runUninstall, runCleanLegacy,
                                          wizardNext, wizardBack, wizardCancel, suggestDir } }
// v2 新增 actions 一律可选链调用（旧测试 deps 无这些键）
formatTime(ms) -> 'MM:SS'
// DOM 契约（jsdom 测试按 id 查询，新增控件不得破坏这些 id）：
// 顶栏：#sidebar-toggle #mine-count #timer #pause-btn #resume-btn(遮罩内) #restart-btn
//       #warning-banner(+text/close)
// 侧栏：#sidebar .ms-mode[data-mode=beginner|intermediate|expert]×3
//       #custom-rows/cols/mines #custom-apply #custom-error
//       #anti-guess-toggle #antiguess-status #ag-method #ag-max-attempts #ag-region-attempts #ag-settings-hint
//       #leaderboard-open #installer-open
// 主页面板：#leaderboard-modal(ms-panel，非 overlay！)+tabs/body/close/hint
// 弹窗：#pause-overlay #nickname-modal(+input/submit/cancel)
// 安装向导：#installer-modal #installer-step(data-step=welcome|dir|options|progress|report)
//       #install-dir-input #install-dir-error #install-desktop-chk #install-startmenu-chk
//       #install-progress-track/fill/text #install-report(li[data-code]) #installer-legacy-clean
//       #install-next/back/confirm/cancel/close
```

### renderer/main.js 要点（v2）
- 启动 `settings.get()` 回填 UI 并作为新对局 config；变更 → `settings.update()` 持久化
- `toggleSidebar` → fitToWindow()（侧栏展开可用宽扣 248px）
- 安装/卸载流：`window.minesweeperAPI?.installer` 可选链（无 preload 横幅降级）→ 向导/IPC/进度/报告

### electron（v2，详见 detailed-design §7）
```js
// preload.cjs 暴露 window.minesweeperAPI：
//   app.getVersion() / installer.getStatus()/suggestDir()/install({dir,desktopShortcut,startMenuShortcut})
//   /uninstall()/cleanLegacy()/onProgress(cb)->unsubscribe
// 固定 IPC 通道白名单（app:get-version、installer:get-status/suggest-dir/install/uninstall/clean-legacy、
// installer:progress 事件）；handler 校验 senderFrame===mainFrame；install 入参校验（绝对路径防穿越+boolean）
// main.cjs：单实例锁（second-instance 转发 --uninstall）；--uninstall 静默卸载（控制面板入口）；
// uncaughtException/unhandledRejection 写日志不闪退；路径全运行时解析不缓存
// installer-runner.cjs：安装源 = 打包? dirname(process.execPath) 全量复制 : app.getAppPath() 白名单；
// 快捷方式/注册表指向安装副本 exe；卸载重定位→清单→扫描→计划→删除→注册表/快捷方式→占用延迟 bat
```

## 6. 常用命令

```bash
npm install   # 国内网络：ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
              # ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ npm install --registry=https://registry.npmmirror.com
npm start     # 启动程序。注意：本机 shell 预设 ELECTRON_RUN_AS_NODE=1，需先 unset
              # （unset ELECTRON_RUN_AS_NODE && npm start）
npm test      # 全量 Vitest（204 用例，全部必须绿）
npm run test:watch
npm run dist  # 打包绿色版到 dist/（win-unpacked + zip，无 NSIS；需设上述镜像环境变量；
              # 已配置 signAndEditExecutable=false；build.win.target=["dir","zip"]）
# 冒烟：unset ELECTRON_RUN_AS_NODE && npx electron scripts/smoke.cjs
# 输出 SMOKE_RESULT JSON：rendererGone/failLoad 为 null、consoleLines 空、canvasW/H>0、
# hasAPI=true、hasSidebarToggle=true 即正常
# 端到端安装/卸载验收（可选）：node scripts/installer-e2e.cjs（先 npm run dist；
# 会在 D:\MinesweeperE2E 真实安装/移动/卸载，用后清理）
```

## 7. 测试约定

- 测试文件与模块一一对应：`tests/<module>.test.js`。
- 确定性布局注入：`solve.retries.test.js` / `game.test.js` / `solve.advanced.test.js` / `game.advanced.test.js`
  通过 `vi.mock` 注入（依赖实现必须从 board.js 具名 import `randomMineSet`、从 solve.js 具名 import
  `generateAntiGuess`/`generateAntiGuessAdvanced`，mock 才能生效）。solve.advanced.test.js 的精确数值
  来自契约预言机验证（deduce 簇内 idx 升序/候选池顺序/rng 消耗顺序是确定性的前提）。
- `ui.test.js` / `ui.sidebar.test.js` 用 jsdom（文件头 `@vitest-environment jsdom`），其余默认 node。
- `installer.test.js` 注入 fake fsOps 测 executeSteps；错误分类中文文案逐字断言。
- 新增功能：先在 `tests/` 写测试 → 在 `detailed-design.md` 记录契约 → 再实现 → 全绿后提交推送。
- 集成冒烟用 `scripts/smoke.cjs`；打包后安装/卸载端到端用 `scripts/installer-e2e.cjs`（可选）。
