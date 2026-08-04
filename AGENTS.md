# AGENTS.md — Minesweeper 项目工作手册

> 本文件在每次新会话启动时加载。目标：让新对话快速上手本项目，并严格按
> vibe-coding 工作流（见 `.agents/skills/vibe-coding-workflow/SKILL.md`）工作。

## 1. 项目概览

Electron 经典扫雷桌面程序（Windows）。核心特性：

- 三种标准模式（初级 9×9/10、中级 16×16/40、高级 16×30/99）+ 自定义行列/雷数
- 拖动缩放手柄缩放显示（格子 16~48px）、窗口等比自适应
- 经典交互：左键翻开/空区扩散、右键 旗→问号→无、左键数字格 chord、右键数字格镜像 chord
- **防猜测模式**：NSS+SNS 子集推理检测可解性；不可解则整体重排雷布局（≤20 次）；
  雷密度 >50% 或重排耗尽时关闭并横幅提醒（精确文案见 §5 game 模块）
- 正向累加计时 + 暂停遮罩、剩余雷数、重开
- 排行榜：3 模式 × 防猜测开/关 共 6 组 × 前十名（昵称+用时，按用时升序），
  localStorage 持久化，胜利后输入昵称，按**实际是否无猜**归组；自定义模式不计榜
- 中文界面，经典 Windows 扫雷 3D 浮雕风格

技术栈：Electron 33 + 原生 ESM（无打包器）+ Canvas 2D + Vitest（测试）+ electron-builder（打包）。

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

## 3. 规则（护栏）

- **核心逻辑必须纯 ESM、零 DOM、零副作用**（`src/core/`），可被 Vitest 在 Node 下直接 import；
  渲染层（`src/renderer/`）只做画与转发。
- **不得修改 `tests/` 下的测试**来迁就实现；认为契约有问题时，先改 `detailed-design.md` 与测试，再改实现。
- 全部界面文案、错误信息、日志必须**中文**。
- 接口变更必须同步更新 `detailed-design.md` 与对应测试（先测试后实现）。
- 不确定的需求/产品决策先向用户确认，不擅自决定（参考 proposal.md §7 的决策记录模式）。
- subagent 规则：不 git commit/push、不改其他任务文件、不留 console.log 调试残留、汇报真实结果。
- 越界访问一律安全返回（undefined/空结果），不抛异常（唯一例外：`randomMineSet` 候选池不足抛错）。
- 数组索引约定：棋盘一维扁平索引 `idx = row * cols + col`。

## 4. 项目结构

```
├── AGENTS.md              本手册
├── index.html             入口（含 CSP；仅 #app/#board-wrap/#board-canvas/#scale-handle，控件由 ui.js 生成）
├── package.json           ESM；scripts: start/test/test:watch/dist；build.win.signAndEditExecutable=false
├── electron/main.cjs      主进程（BrowserWindow 900×640，min 480×360，contextIsolation:true）
├── styles/main.css        经典扫雷风（.hidden/.modal/.banner/.bevel-*/.num-1~8）
├── scripts/smoke.cjs      冒烟诊断：加载页面→收集 console/崩溃→截图→检查画布 DOM→退出
├── src/
│   ├── core/              纯 JS 核心逻辑（Node 可单测）
│   │   ├── modes.js       模式预设 + 自定义参数校验
│   │   ├── board.js       棋盘模型：布雷/翻开洪泛/chord×2/标记循环/胜负
│   │   ├── solve.js       可解性判定（NSS+SNS）+ 防猜测重排
│   │   ├── game.js        游戏状态机 + 正向计时 + 暂停 + 防猜测调度
│   │   └── leaderboard.js localStorage 排行榜
│   └── renderer/          渲染与交互
│       ├── render.js      Canvas 经典 3D 风绘制
│       ├── ui.js          DOM 控件/横幅/暂停遮罩/昵称/排行榜弹窗
│       └── main.js        装配：鼠标/缩放/resize/事件联动
├── tests/                 Vitest 测试（8 个文件，111 用例，先于实现编写）
├── doc/                   需求/设计/任务文档（工作流产物，改功能先改这里）
│   ├── proposal.md        需求提案（含用户决策记录）
│   ├── high-level-design.md / detailed-design.md
│   ├── prompt.md          控制 prompt（主 agent/subagent 规则）
│   └── tasks/             任务文档 + progress.md（唯一进度源）
└── dist/                  electron-builder 产物（gitignore）
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
density(rows,cols,mines) -> number
isSolvable(rows,cols,mineSet,startIdx) -> boolean   // 模拟推导至不动点；全翻非雷=可解
generateAntiGuess(rows,cols,mines,startIdx,opts={maxAttempts,maxDensity,rng})
// -> {ok:true,mineSet,attempts} | {ok:false,reason:'density',mineSet:null,attempts:0}
//  | {ok:false,reason:'retries',mineSet:<最后一次>,attempts:maxAttempts}
```

### core/game.js
```js
STATE = { READY:'ready', PLAYING:'playing', PAUSED:'paused', WON:'won', LOST:'lost' }
createGame(config, opts={})   // config:{rows,cols,mines,antiGuess,mode}  opts:{now?:()=>number}
game: { state,rows,cols,mines,mode,board,antiGuess,antiGuessActive,warning }
game.restart()                game.pause()/resume()   game.getElapsedMs()  game.getRemainingMines()
game.reveal(row,col)    -> {type:'reveal'|'win'|'lose'|'noop'}
game.chordLeft(row,col) -> {type:'reveal'|'win'|'lose'|'noop'}
game.chordRight(row,col)-> {type:'flag'|'blocked'|'noop'}
game.cycleMark(row,col) -> {type:'mark', state, blocked}
game.on('win'|'lose'|'warning', cb)
// win/lose payload: {timeMs, mode, antiGuessActive, rows, cols, mines}
// warning 精确文案：
//   '防猜测已关闭：雷密度过高，无法保证无猜'
//   '防猜测已关闭：重排 20 次仍无法保证无猜'
// 操作守卫：READY 可 reveal(首点)/cycleMark；PAUSED/WON/LOST 一切操作 noop
// 首次 reveal 触发布雷（防猜测三分支），布雷方式：setMines(board, randomMineSet(...)) 或返回的 mineSet
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
                          showBanner, hideBanner, showNicknamePrompt, showLeaderboard, setCustomError }
deps = { leaderboard, getState, actions:{ selectMode, applyCustom, toggleAntiGuess,
                                          pause, resume, restart, submitNickname } }
formatTime(ms) -> 'MM:SS'
// DOM 契约（jsdom 测试按 id 查询，新增控件不得破坏这些 id）：
// #mine-count #timer #custom-rows/cols/mines #custom-apply #custom-error #anti-guess-toggle
// #antiguess-status #pause-btn #resume-btn(遮罩内) #restart-btn #warning-banner(+text/close)
// #pause-overlay #nickname-modal(+input/submit/cancel) #leaderboard-modal(+tabs/body/close)
// .ms-mode[data-mode=beginner|intermediate|expert]
```

## 6. 常用命令

```bash
npm install   # 国内网络：ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
              # ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ npm install --registry=https://registry.npmmirror.com
npm start     # 启动程序。注意：本机 shell 预设 ELECTRON_RUN_AS_NODE=1，需先 unset
              # （unset ELECTRON_RUN_AS_NODE && npm start）
npm test      # 全量 Vitest（111 用例，全部必须绿）
npm run test:watch
npm run dist  # 打包 NSIS 安装包到 dist/（需设上述镜像环境变量；已配置 signAndEditExecutable=false）
# 冒烟：unset ELECTRON_RUN_AS_NODE && npx electron scripts/smoke.cjs
# 输出 SMOKE_RESULT JSON：rendererGone/failLoad 为 null、consoleLines 空、canvasW/H>0 即正常
```

## 7. 测试约定

- 测试文件与模块一一对应：`tests/<module>.test.js`。
- `solve.retries.test.js` / `game.test.js` 通过 `vi.mock` 注入确定性布局（依赖实现
  必须从 board.js 具名 import `randomMineSet`、从 solve.js 具名 import `generateAntiGuess`，mock 才能生效）。
- `ui.test.js` 用 jsdom（文件头 `@vitest-environment jsdom`），其余默认 node。
- 新增功能：先在 `tests/` 写测试 → 在 `detailed-design.md` 记录契约 → 再实现 → 全绿后提交推送。
- 集成冒烟用 `scripts/smoke.cjs`（不是人工肉眼验证的唯一手段，CI 式快速回执）。
