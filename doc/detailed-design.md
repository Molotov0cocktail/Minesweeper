# 详细设计 detailed-design.md

> 依据 doc/proposal.md 与 doc/high-level-design.md。
> 本文件定义模块职责、精确接口契约、算法细节、边界条件与测试规格。
> 接口契约是测试代码（tests/）与各任务 subagent 实现的唯一依据；改动需同步更新测试。

## 0. 全局约定

- 所有核心模块为 **ESM 纯 JS**，零 DOM/Electron 依赖，可被 Vitest 在 Node 环境直接 import。
- 棋盘用**一维扁平索引**：`idx = row * cols + col`。
- 坐标入参统一 `(row, col)`（0 起）。越界访问一律安全返回（undefined / 空结果），不抛异常。
- 错误信息、UI 文案一律**中文**。
- 数字类型全部整数。`rows*cols` 最大 3600，性能无需优化级别担忧。

## 1. src/core/modes.js

### 常量
```js
export const MODES = {
  beginner:     { key: 'beginner',     name: '初级', rows: 9,  cols: 9,  mines: 10 },
  intermediate: { key: 'intermediate', name: '中级', rows: 16, cols: 16, mines: 40 },
  expert:       { key: 'expert',       name: '高级', rows: 16, cols: 30, mines: 99 },
};
export const CUSTOM_RANGE = { min: 5, max: 60 };   // 行列范围
export const CUSTOM_MAX_DENSITY = 0.8;             // 自定义雷数密度上限
```

### validateCustom(rows, cols, mines)
- 校验（任一失败即返回 `{ ok:false, error:<中文信息> }`）：
  1. `rows, cols, mines` 均为整数（输入可为字符串，需 `Number()` 转换并校验为有限数）
  2. `CUSTOM_RANGE.min <= rows, cols <= CUSTOM_RANGE.max`
  3. `mines >= 1`
  4. `mines <= floor(rows*cols*CUSTOM_MAX_DENSITY)`
  5. `mines <= rows*cols - 9`
- 全部通过 → `{ ok:true, rows, cols, mines }`（已规范为整数）。
- 错误文案示例："行数需在 5~60 之间"、"雷数需在 1 到 N 之间"（含具体数字）。

## 2. src/core/board.js

### 单元格与棋盘
```js
export const CELL_HIDDEN = 'hidden';
export const CELL_FLAGGED = 'flagged';
export const CELL_QUESTIONED = 'questioned';
export const CELL_REVEALED = 'revealed';

// Cell = { idx, row, col, isMine: boolean, count: number, state: string }
export function createBoard(rows, cols, mines)
// -> { rows, cols, mines, cells: Cell[], revealedCount: 0, flagCount: 0, minesPlaced: false }
//   cells 按行优先一维数组，count 初始 0，state 初始 CELL_HIDDEN

export function cellAt(board, row, col) // -> Cell | undefined
export function indexAt(rows, cols, row, col) // -> idx（越界返回 -1）
export function neighborIndexes(rows, cols, idx) // -> number[]，最多 8 个，不含自身，升序
export function neighborsOf(board, row, col) // -> Cell[]（越界自动过滤）
```

### 布雷（首次点击后调用）
```js
export function randomMineSet(rows, cols, mines, safeIdx)
// 候选池 = 所有格子排除 safeIdx 及其 8 邻居；从中等概率抽取 mines 个（Fisher–Yates）
// 候选池不足 mines 时抛 Error('Mine pool too small')（校验已保证不会发生）
// -> Set<number>

export function placeMines(board, safeIdx)
// 用 randomMineSet 布雷：写 cell.isMine；随后计算每格 count = 相邻雷数；
// board.minesPlaced = true；返回 board
```

### 翻开与标记
```js
export function reveal(board, row, col)
// 前置：board.minesPlaced === true（否则返回空结果 { revealed: [], exploded: false }）
// - 非 hidden 状态（旗/问号/已翻开）→ 不操作
// - 是雷 → 置 revealed，revealedCount+1，exploded=true
// - 非雷 → 翻开；若 count===0 递归洪泛翻开 0 区邻居（经典空区扩散）
// - 维护 revealedCount
// -> { revealed: number[], exploded: boolean }   revealed=本次新翻开的索引（含雷）

export function chordLeft(board, row, col)
// 前置：该格已翻开且 count>0；否则 no-op
// 若 flagCount == 相邻已标旗数 且 相邻存在未翻开格：
//   翻开所有相邻未翻开格（洪泛 0 区同样适用）；若其中有雷 → exploded=true
// -> { revealed: number[], exploded: boolean }

export function chordRight(board, row, col)
// 前置：该格已翻开且 count>0；否则 no-op
// unopenedNeighbors = 相邻中 state !== revealed 的格子数
// 若 count === unopenedNeighbors 且 board.flagCount + count <= board.mines：
//   将全部相邻未翻开格置为 flagged（旗），flagCount += count
// -> { flagged: number[] } | { blocked: true, flagged: [] }

export function cycleMark(board, row, col)
// hidden -> flagged（若 flagCount < mines；否则 blocked）-> questioned -> hidden
// -> { state: 操作后状态, blocked: boolean }   （blocked 仅发生于 hidden 想标旗但旗已满）
// 已翻开格 → 不操作，返回 { state: 当前状态, blocked: false }

export function isWin(board) // -> boolean：revealedCount === rows*cols - mines
export function revealAllMines(board) // 失败结算用：把所有 isMine 置 revealed，返回雷索引数组
```

### 边界条件清单（须有测试覆盖）
- 角落/边缘格子的邻居数（3 / 5 / 8）
- 首次点击安全区：safeIdx 在角落时安全区只有 4 格，布雷仍成功
- reveal 已翻开格、旗、问号均为 no-op
- chordLeft 无旗子时 `count===0` 不生效
- chordRight 旗数超上限 → blocked，不标旗
- 0 区洪泛不越界、不重复

## 3. src/core/solve.js

依赖 board.js 的 `neighborIndexes`、`randomMineSet`。

### 常量
```js
export const MAX_ATTEMPTS = 20;
export const MAX_DENSITY = 0.5;
```

### density(rows, cols, mines) -> number
### isSolvable(rows, cols, mineSet, startIdx) -> boolean

模拟从 `startIdx` 翻开开始，用"洪泛 + 逻辑推理"推进，直至不动点。

**推理规则（NSS + SNS 子集）：**
- 维护每个格子状态：`revealed / flagged(推理=雷) / unknown(未翻开)`。
- 对每个已翻开且 count>0 的前沿格 A：
  - `cand_A` = A 的相邻 unknown 格集合
  - `need_A` = A.count − A 的相邻 flagged 格数
  - 规则 1（翻）：`need_A === 0` 且 `cand_A` 非空 → 全部翻开 `cand_A`（若翻到 count===0 则继续洪泛）
  - 规则 2（标雷）：`need_A === cand_A.size` → 全部标为 flagged
- 规则 3（2-集子集排除）：对任意两前沿格 A、B：
  - 若 `cand_A ⊆ cand_B` 且 `need_A === need_B` → `cand_B \ cand_A` 全部安全 → 翻开
  - 若 `cand_A ⊆ cand_B` 且 `need_B − need_A === cand_B.size − cand_A.size` → `cand_B \ cand_A` 全部为雷 → 标为 flagged
- 迭代到无任何变化为止。
- 返回：`revealed 格数 === rows*cols − mineSet.size`（全部非雷翻开）。

> 该算法为"充分条件"启发式：可解则证明无猜，判为不可解时可能高估（复杂子集未覆盖）。这是有意取舍——防猜测失败仅触发重排，不会生成错误棋盘。

### generateAntiGuess(rows, cols, mines, startIdx, opts={}) -> Result
```js
// opts: { maxAttempts = MAX_ATTEMPTS, maxDensity = MAX_DENSITY, rng?: () => number }
// rng 可注入（测试用确定性随机），默认 Math.random
// 流程：
//   1) density > maxDensity → { ok:false, reason:'density', mineSet:null, attempts:0 }
//   2) 至多 maxAttempts 次：
//        mineSet = randomMineSet(...)（rng 注入）
//        若 isSolvable(...) → { ok:true, mineSet, attempts:k }
//   3) 全部失败 → { ok:false, reason:'retries', mineSet:<最后一次 mineSet>, attempts:maxAttempts }
// Result 中 mineSet 恒为可用布局（reason:'density' 时为 null）
```

### 边界条件清单（须有测试覆盖）
- 已判定可解的确定布局返回 true（用显式构造的 mineSet）
- 经典"需猜测"布局返回 false（如 2×2 两雷对角、或 50/50 死锁）
- density > 0.5 立即返回 reason:'density'
- 重排成功返回 ok:true 且 attempts 在 1..20 内
- 注入 rng 时结果可复现（同一 rng 序列产生同一 mineSet）

## 4. src/core/game.js

### 状态机
```
READY ──(首次 reveal 成功布雷)──▶ PLAYING ◀──(resume)── PAUSED
PLAYING ──(胜利/踩雷)──▶ WON / LOST   （终态，忽略一切输入）
READY ──(标旗/问号)──▶ READY（允许首点前预标）
```
`paused` 仅由 `pause()` 进入；任何棋盘操作在 paused 时忽略。

### createGame(config, opts={})
```js
// config: { rows, cols, mines, antiGuess: boolean, mode: 'beginner'|'intermediate'|'expert'|'custom' }
// opts:   { now?: () => number }  默认 () => Date.now()，可注入假时钟
// -> game
```

### game 对象
- 字段：`state, rows, cols, mines, mode, board`、
  `antiGuess`（开关设置）、`antiGuessActive`（实际生效与否）、`warning`（string|null）
- 事件：`game.on(evt, cb)`，支持 `'win' | 'lose' | 'warning'`；`cb(payload)`
- 方法：

```js
restart()          // 新建空棋盘，state=READY，计时清零，warning=null，antiGuessActive 复位
reveal(row, col)   // -> { type:'reveal'|'win'|'lose'|'noop' }
chordLeft(row, col)// -> { type:'reveal'|'win'|'lose'|'noop' }
chordRight(row, col)// -> { type:'flag'|'blocked'|'noop' }
cycleMark(row, col)// -> { type:'mark', state, blocked }
pause() / resume()
getElapsedMs() -> number
getRemainingMines() -> number   // max(0, mines - flagCount)
```

### 关键流程
1. **首次 reveal**（state===READY）：
   - 确定 `safeIdx`
   - 若 `antiGuess`：`generateAntiGuess(rows, cols, mines, safeIdx)`
     - `ok` → `antiGuessActive=true`，用返回 mineSet 布雷
     - `!ok` → `antiGuessActive=false`，`warning=中文原因`，`emit('warning', warning)`，用返回 mineSet 布雷（density 情形用 `randomMineSet`）
   - 否则：`placeMines(board, safeIdx)`（普通随机）
   - `state=PLAYING`，计时起点 `now()`
2. **胜利/失败**：任何操作后若 `isWin(board)` → `state=WON`、冻结计时、`emit('win', { timeMs, mode, antiGuessActive, rows, cols, mines })`；
   若 explode → `state=LOST`、`revealAllMines(board)`、冻结计时、`emit('lose', { timeMs, mode, antiGuessActive })`
3. **计时**（正向累加）：
   - `startAt` 记录计时基点；`getElapsedMs()` = 播放中 `(now()-startAt) + 已累加值`，暂停时冻结
   - `pause()`：累加当前差值，state=PAUSED
   - `resume()`：重设基点，state=PLAYING
   - 胜利/失败时把最终 elapsed 固化为 `finalTimeMs`

### 边界条件清单（须有测试覆盖）
- 首次点击必安全：READY 下 reveal 任何格子不爆炸，且 0 区扩散
- 首点前允许标旗；首点前 reveal 之外的 `chordLeft/chordRight` no-op
- 防猜测开启且重排成功 → antiGuessActive=true，warning=null
- 防猜测开启但 density>50% → antiGuessActive=false，warning 含"密度"；且不进行任何重排尝试（attempts=0）
- 防猜测开启但 20 次失败 → antiGuessActive=false，warning 含"20 次"
- 防猜测关闭 → antiGuessActive=false，warning=null
- win/lose payload 中 `antiGuessActive` 反映**实际**是否无猜
- 暂停期间所有棋盘操作忽略；暂停冻结计时
- 终态后一切操作 no-op
- 假时钟可精确断言 elapsed

## 5. src/core/leaderboard.js

### 结构
```js
export const LEADERBOARD_KEY = 'minesweeper.leaderboard.v1';
export const TOP_N = 10;
export const LEADERBOARD_MODES = ['beginner', 'intermediate', 'expert'];
// 存储结构（localStorage JSON 字符串）：
// { [mode]: { on: [entry...], off: [entry...] }, ... }
// entry = { nickname: string, timeMs: number, date: string /* ISO */ }
```

### createLeaderboard(storage = globalThis.localStorage)
```js
// storage 需实现 { getItem(key), setItem(key, value), removeItem(key) }（测试注入内存 mock）
// -> {
//    getScores(mode, antiGuess) -> entry[]            按 timeMs 升序，至多 10 条
//    isTopTen(mode, antiGuess, timeMs) -> boolean     若时间 <= 该组第 10 名（或不足 10 条）→ true
//    addScore(mode, antiGuess, nickname, timeMs) -> { added: boolean, rank: number|undefined }
//       rank 为 1 起；加入后排序、截断 10、持久化；相等时间新纪录排在旧纪录之后
//    getLastNickname() -> string                      记忆上次昵称，默认 '玩家'
//    setLastNickname(name) -> void                    截断 16 字符
//    clear() -> void                                  清空
// }
```

### 边界条件清单（须有测试覆盖）
- 空存储 → getScores 返回 []
- 满 10 条后更慢成绩不加入 → added=false
- 相同 timeMs 排序稳定（后写的排后面）
- 非法/损坏 JSON → 视为空并自动修复
- antiGuess 参数映射 on/off 键正确
- localStorage 不可用时（getItem 抛错）→ 优雅降级为空存储

## 6. renderer（src/renderer/）

### index.html 关键 DOM 契约（T5/T6 实现）
| id | 用途 |
|---|---|
| `mode-buttons` | 三个标准模式按钮（data-mode） |
| `custom-rows` / `custom-cols` / `custom-mines` | 自定义输入框 |
| `custom-apply` | 自定义应用按钮 |
| `anti-guess-toggle` | 防猜测开关（checkbox） |
| `pause-btn` / `restart-btn` | 暂停 / 重开 |
| `mine-count` | 剩余雷数 |
| `timer` | 计时显示（mm:ss） |
| `board-canvas` / `board-wrap` | 棋盘画布与容器 |
| `scale-handle` | 缩放手柄（右下角） |
| `pause-overlay` | 暂停遮罩（含"继续"按钮） |
| `warning-banner` | 防猜测关闭横幅（含关闭按钮） |
| `nickname-modal` / `leaderboard-modal` | 昵称输入 / 排行榜弹窗 |

### renderer/ui.js —— 可测 DOM 层
```js
export function createUI(host, deps)
// deps: { leaderboard, getState: () => gameSnapshot, actions: { selectMode, applyCustom, toggleAntiGuess,
//         pause, resume, restart, submitNickname } }
// -> {
//    setMineCount(n), setTime(ms), setPauseOverlay(visible), setAntiGuessActive(active),
//    showBanner(msg), hideBanner(), showNicknamePrompt({ timeMs, mode, antiGuessActive }),
//    showLeaderboard(), refresh(), setCustomError(msg)
// }
```
- 昵称提交：调用 `deps.actions.submitNickname(nickname)`；UI 层负责先 `isTopTen` 判断，进前十才弹输入
- 排行榜弹窗按 `(mode, antiGuess)` 标签页展示两组榜单
- jsdom 测试覆盖：按钮回调触发、横幅显隐、弹窗内容、计时/雷数刷新

### renderer/render.js —— 画布绘制
```js
export function drawBoard(ctx, game, cellSize, opts)
// opts: { colors, bevel } 可调
// 经典 3D 风：未开=凸起灰，翻开=凹下，旗=红底旗形，问号=蓝色"?"，雷=黑雷形，数字用经典配色
// 数字颜色：1蓝 2绿 3红 4深蓝 5深红 6青 7黑 8灰
export function drawCell(ctx, x, y, size, cell, gameState)
// gameState 用于区分普通/爆炸/胜利高亮
```
- 测试：注入记录式假 ctx（fillRect/strokeText/fillText 调用可断言），验证格子数与关键绘制调用。

### renderer/main.js —— 装配
- 监听 mousedown/mouseup/mousemove：左键/右键映射到 game 方法与 chord（`chordLeft/chordRight` 由 renderer 判定"已打开格子上再按一次同键"触发；注：经典扫雷 chord 是"同时按左右键"或"对已翻开格按某键"，本需求按 FR3.3/FR3.4 直接定义为"点击已翻开格"触发）
- 缩放手柄拖动：cellSize 在 [16,48] 内连续变化并重绘
- window resize：`cellSize = clamp(floor(min(w/cols, h/rows)), 16, 48)` 重绘
- 装配 ui.js 事件与 game 事件（win/lose/warning → 弹窗/横幅）

## 7. Electron 壳与工程配置

### electron/main.cjs
- `BrowserWindow({ width: 900, height: 640, minWidth: 480, minHeight: 360, autoHideMenuBar: true })`
- `loadFile('index.html')`；`contextIsolation: true`（默认安全）
- 无需自定义 IPC（无主进程功能需求）

### package.json（要点）
```json
{
  "name": "minesweeper",
  "productName": "Minesweeper",
  "version": "1.0.0",
  "description": "Electron 经典扫雷：防猜测模式 + 排行榜",
  "main": "electron/main.cjs",
  "type": "module",
  "scripts": {
    "start": "electron .",
    "test": "vitest run",
    "test:watch": "vitest",
    "dist": "electron-builder --win"
  },
  "build": {
    "appId": "com.molotov.minesweeper",
    "productName": "Minesweeper",
    "files": ["electron/**", "src/**", "index.html", "package.json"],
    "win": { "target": "nsis" }
  }
}
```
- 安装命令需带 Electron 镜像备选：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install`（网络失败时启用）
- vitest 环境：核心测试用 `// @vitest-environment node`，ui/render 测试用 `// @vitest-environment jsdom`（文件头注释声明）

## 8. 测试规格（tests/，先于实现编写）

| 文件 | 覆盖 | 用例数（估） |
|---|---|---|
| modes.test.js | validateCustom 全分支、MODES 常量 | ~12 |
| board.test.js | 创建/邻居/布雷安全区/翻开洪泛/chord×2/标记循环/胜负 | ~30 |
| solve.test.js | 可解/需猜布局、密度短路、重排、rng 确定性 | ~15 |
| game.test.js | 状态机、首点、防猜测三分支、计时/暂停、胜负事件 | ~25 |
| leaderboard.test.js | 存取/排序/截断/损坏修复/降级 | ~15 |
| ui.test.js（jsdom） | 控件回调、横幅、弹窗、计时刷新 | ~12 |
| render.test.js（jsdom） | 假 ctx 绘制断言 | ~6 |

验收标准：`npm test` 全绿；随后 `npm start` 手动冒烟；最后 `npm run dist` 出包。

## 9. 任务依赖图

```
T6 electron-shell ────────┐
T1 board ──▶ T2 solve ──▶ T3 game ──▶ T5 renderer(依赖 T1-T3 + T6)
T4 leaderboard ─────────────────────▶ T5
```
- Wave A（并行）：T1、T4、T6
- Wave B：T2（依赖 T1）、T3（依赖 T1+T2）
- Wave C：T5（依赖全部 core + 壳）
- Wave D：集成冒烟、打包、README、推送
