# 详细设计 detailed-design.md

## v1.5.1 图标契约

1. renderer/mine-glyph.js导出drawMineGlyph(ctx,x,y,size,opts={})，opts={color?,highlight?,lost?,danger?}；size≤0或非有限坐标安全不绘制。边界在格子[x+0.1s,x+0.9s]内，八向短刺、描边球体、金属高光，save/restore包围所有状态；支持没有createRadialGradient的测试/简化ctx，使用平面底色降级。color覆盖主体/短刺主色，highlight覆盖高光，lost时用danger或默认红色显示额外警戒底，不替换地雷主体。
2. render.drawCell仅CELL_REVEALED且isMine时调用图元（保持胜利补旗），opts.colors.mine/highlight继续传给主体/失败提示。旧数字/旗/问号/格体保持原行为；渲染层不依赖Image加载或DOM。
3. assets/icon.svg自包含无脚本/外链/字体，viewBox=0 0 512 512。assets/minesweeper.png=512×512 RGBA透明外边；minesweeper.ico包含16/20/24/32/48/64/128/256八个PNG帧。npm run icons调用scripts/generate-icons.cjs，Node入口启动Electron（清掉ELECTRON_RUN_AS_NODE），Electron入口无可见窗口渲染源SVG；每尺寸直接渲染矢量，不用缩放小PNG。生成失败非0退出。
4. scripts/icon-resources.cjs导出embedIcon(exeBuffer,icoBuffer)->Buffer、readIconGroups(exeBuffer)->Array<{id,lang,icons:Array<{width,height,data:Buffer}>}>。可读取带原始证书的Electron底包，但输出保持项目未签名策略；替换所有原图标组，没图标组则添加1/1033。保留所有非3/14资源（包括asar integrity/version）及overlay；非法数据明确中文错误。resedit固定为devDependency 1.7.2，零额外外部exe下载。
5. scripts/icon-after-pack.cjs导出async hook(context)，仅修改context.appOutDir内当前productFilename.exe副本，不触碰node_modules/electron。读取assets/minesweeper.ico，调用embedIcon，重新解析验证每组帧与源一致再写入。setup-builder.yml设置afterPack及win.icon，signAndEditExecutable:false继续保留。portable最终exe的图标由NSIS生成，本钩子先处理被复制为游戏exe的运行时。
6. main.cjs/setup.cjs BrowserWindow icon=path.join(__dirname,'..','assets','minesweeper.png')。setup files含assets/**；build-dist先生成图标（失败停止）后将assets列入GAME_TOP并校验PNG/ICO存在，再打包。npm run dist仍只产一个MinesweeperSetup-1.5.1-win.exe。
7. 测试先检查新图元/多尺寸资源/PE替换不变量/打包和窗口接线红；之后真实PNG检查、16~48px渲染预览、全量/双DPI冒烟、PE资源逐帧比对、安装E2E、本地就地更新/存档摘要、Release公开下载校验。必要assets可入库，截图/临时预览/.build/用户目录不可入库。


## v1.5.0 契约增量（优先于旧描述）

1. core/gamepad.js新增DEFAULT_GAMEPAD_BINDINGS=Object.freeze({reveal:0,mark:1,menu:2,pause:9,restart:3,focus:11,help:8})，isValidGamepadBindings(value)要求恰含全部7个已知动作、0~11互异整数；rebindGamepad(bindings,action,button)返回新完整map，重复键交换原占用动作，非法输入返回原map拷贝。createGamepadMapper({bindings}={})新增setBindings(map)，有效改变才reset中立锁；poll的动作映射由配置决定，restart绑定键仍800ms，方向固定。旧cancel语义由mark在UI作用域实现，保留UI cancel别名供旧调用。
2. renderer/gamepad.js startGamepad新增getBindings可选，默认DEFAULT；每帧发现实际map变化时setBindings，更新期间不产生按住键动作。settings.DEFAULT_SETTINGS新增gamepadBindings（独立默认map）/focusView:false；读损坏map回退完整默认，update非法map忽略，其余字段照旧；get/update/reset返回深复制map，调用方不能修改缓存/默认常量。旧档无需迁移键名。
3. renderer/controller-ui.js导出navigateControls(scope,action)->boolean。支持up/down/left/right/reveal，scope内可见、非disabled、非inert控件；导航焦点并scrollIntoView(nearest)，范围循环；select左右调选项并change，number左右按step且钳制min/max并input/change，checkbox左右设置/A切换，按钮A点击。未知动作false；空scope安全返回。data-controller-grid="N"的键盘按N列上下导航；越过首/末行时进入网格前/后的控件，不能把焦点困在键盘中。
4. createUI新增handleController(action)->boolean、hasControllerContext()->boolean、showHelp()/showControls()/closePage()、setGamepadBindings(map)、setFocusView(bool)/getFocusView()。动作优先模态→说明/键位页→榜单→侧栏；UI消费后不翻格。menu开合侧栏并聚焦可用首控件，mark/cancel在界面返回/关闭，reveal确定；暂停模态reveal/mark/pause继续。help打开说明，focus切换专注（模态内不切）。菜单打开时退出专注；页面打开时收起侧栏并隐藏棋盘/summary。所有页面返回可聚焦棋盘。
5. DOM保留既有id，新增#help-open/#help-page/#help-back，#controls-open/#controls-page/#controls-back，#binding-reveal/mark/menu/pause/restart/focus/help，#bindings-reset；#controller-status/#controls-help/#ag-settings-hint仅位于隐藏的说明/键位专页，主棋盘无教程。键位select onchange调用actions.setGamepadBinding(action,button)，重置调用resetGamepadBindings；setGamepadBindings原位更新选项，不替换正在聚焦控件。页内“返回”可点击/手柄，数字设置左右调整、复选框确认切换。
6. 昵称显示时仍默认聚焦物理输入框；首个手柄动作显示#nickname-keyboard，方向可选屏幕按键（data-key="a"等字母/数字、space/backspace/clear/player），A按键插入/替换当前选区并限长16。输入框聚焦时A提交默认昵称；B(mark)取消。键盘只在昵称模态中可见，关闭/复位隐藏；Tab焦点陷阱包含实际可见控件。
7. #focus-toggle和#focus-exit，body.focus-view时顶栏/侧栏/说明/规格行隐藏，仅棋盘、progress与#focus-hud（#focus-mine-count/#focus-timer）和退出按钮可见；setMineCount/setTime同时更新HUD。setFocusView触发UI布局并使隐藏侧栏inert。用户按钮切换通知actions.setFocusView(bool)，main写settings并fitToWindow。专注恢复不重置对局、计时或Worker；F10切换，F1说明，Escape通过UI返回，专注里Escape退出。
8. main接入getBindings，初始化回填/持久化重映射与专注；controllerEnabled在UI可编辑作用域允许输入框，失焦依旧禁用；handleController先ui.handleController，未消费才board动作。默认B为mark；UI输入不泄漏到棋盘。旧主页面帮助高度回归改为隐藏说明页不占棋盘空间，添加完整作用域/专注/持久化回归。
9. smoke必须通过app.exit(exitCode)明确控制Electron退出码，不能仅process.exitCode+app.quit（实际失败仍可能退出0）；增加成功/失败Electron入口契约测试。虚拟键盘横向越界同样进入前/后控件；菜单切难度resetTransient无模态焦点时不得偷回棋盘。
10. 手柄不能遗留“只能鼠标拖动”的缩放操作：侧栏新增#board-size选择0=自动、16~48整数像素，调用actions.setBoardSize(size)，UI新增setBoardSize(size)原位回填。main维护本局preferredCellSize，自动时按窗口适配，指定后固定大小允许滚动，手柄关闭侧栏不重置；鼠标拖动同步偏好，换局恢复自动。暂停/昵称不再用段落重复解释常识。


## v1.4.0 契约增量（优先于旧描述）

1. core/gamepad.js导出 createGamepadMapper() -> {poll(gamepads,now,enabled=true),reset()}。poll返回{connected,supported,id,actions:string[]}，选择最低index的connected standard手柄；仅非标准手柄时connected=true/supported=false。动作up/down/left/right/reveal/mark/cancel/pause/restart，映射buttons12~15/axes0~1、0/2/1/9/3。新设备或禁用后必须所有绑定键及导航中立才能armed。方向优先十字键，摇杆取主轴，死区≤0.35；初次一次、延迟300ms、每100ms至多一次；动作按下边沿一次；restart持有800ms仅触发一次。缺失/非法数组/API/非有限轴安全处理。
2. renderer/gamepad.js导出 startGamepad({onAction,onStatus,isEnabled,getGamepads,requestFrame,cancelFrame}={}) -> stop()。默认用浏览器API，RAF时间传mapper；异常按未连接处理；onStatus只变化时调用，stop取消帧且幂等。main按语义操作并聚焦棋盘；昵称模态A提交/B取消，暂停模态A/Start继续；普通输入框/失焦禁用。Y长按可取消生成并重开。
3. solve.deduce双向真子集推理；同一局镜像/旋转的solved与unknown集合对应相同，返回结构维持原接口。单次调用缓存邻居表；rows/cols必须为[1,60]整数；非法尺寸/startIdx、非Set雷位/越界雷位/首点为雷返回{solved:false,unknown:Set(),clusters:[],smallest:null}，不得抛错。高级重排state基于当前mineSet，试排失败不能替换移雷验证基准；实际deduce次数≤MAX_TOTAL_DEDUCE。
4. generation-worker.js导出 generateOpening(config,startIdx) -> {mineSet:number[],antiGuessActive,warning,stats}；高级region失败回退标准，density或retries按原精确文案；仅实际可解结果active=true，其余使用最后有效布局或randomMineSet（保持雷数与3×3首点安全）。worker onmessage输入{id,config,startIdx}，输出{id,result}或{id,error:<中文>}，模块在Node导入不得安装全局监听。
5. generation-client.js导出 GENERATION_TIMEOUT_MS=8000、createGenerationClient({workerFactory,timeoutMs}={}) -> {prepare(config,startIdx):Promise,cancel(),destroy()}。每个请求专用Worker(new URL('./generation-worker.js',import.meta.url),{type:'module'})，prepare先取消旧请求；取消/超时/error/messageerror/无效响应都terminate并清理定时器/监听；过期id忽略，成功只接受对象result。cancel拒绝Error('生成已取消')，timeout Error('生成超时')。Worker创建失败以rejected Promise返回，不同步抛出。
6. game STATE.GENERATING='generating'，opts.prepareBoard可选；仅antiGuess首次hidden翻格时注入异步，reveal返回{type:'generating'}。生成时所有棋盘操作noop，计时0；完成验证mineSet精确雷数/整数范围/3×3首点安全后布雷，设置active/warning/stats，开始计时并翻格；发generated事件，由main刷新。失败/无效响应使用randomMineSet并警告'防猜测已关闭：生成超时或失败，已切换普通开局'。cancelGeneration()使当前世代失效，生成态回ready；restart同时失效旧结果；拒绝/晚到结果不得更改已取消Game。
7. createUI新增setControllerStatus({connected,supported,id})，#controller-status role=status及手柄说明；setGameStatus支持generating。main注入Worker客户端（startApp新增可选generationClient/gamepadFactory便于测试）；新局/destroy先cancelGeneration再cancel Worker。generated时若后台标记为true则暂停，焦点回来不自动继续。旧同步tests未注入prepareBoard仍成立；main在无Worker环境可不注入以供Node/jsdom，真实Electron必启用Worker。生成提示留可点击取消重开按钮。
8. 本地更新目标取已验证InstallLocation=D:\Minesweeper\game；先备份代码/清单，静默--install-dir就地覆盖，按原快捷方式选择开关，不卸载/删除外来文件和用户档案；安装后版本、注册表、Worker与手柄状态DOM、用户档案存储文件校验。版本1.4.0标签/发布流程沿用。


## v1.3.0 契约增量（2026-10-31，优先于下文旧描述）

1. board.indexAt 的 rows/cols 为正整数；row/col 为范围内整数，否则 -1。neighborIndexes 同样校验 idx∈[0,rows*cols)，非法空数组。所有依赖此入口的操作不抛错、不改变棋盘。
2. game 首点仅 hidden 可布雷；flagged/questioned 返回 noop，计时、布雷、求解器不动。
3. leaderboard 仅支持 LEADERBOARD_MODES；timeMs 为有限非负数。非法 addScore 返回 {added:false,rank:undefined}，isTopTen 返回 false；满榜同分后写无名次，isTopTen 与之保持一致。读取过滤 null/非对象/非法 timeMs/非字符串 nickname；昵称 trim、空回退玩家、截断16字符；date 非字符串时为空串。getScores 返回条目深度独立拷贝，合法旧记录保留，写入继续原存储键。
4. createUI 新增 setGameStatus({state,mode,rows,cols,mines,revealedCount})、resetTransient()、destroy()。状态区 #game-status（role=status）、#game-meta、#game-progress、#controls-help。暂停只在 playing 可点击；选中难度 aria-pressed。菜单 aria-controls/expanded 与 sidebar.inert 同步。resetTransient 关闭暂停/昵称/榜单、清理焦点状态。昵称弹窗 role=dialog、aria-modal，自动聚焦并选中昵称，Enter 提交（忽略 IME）、Escape 取消、Tab 环绕；关闭回到原触发元素。暂停焦点到继续按钮，Escape 继续。destroy 移除 document 监听器。
5. main 导出 startApp({host,storage}={}) -> {destroy()}；缺省 host=#app，存在根节点才自动启动。所有事件/计时器可清理。UI 每次游戏操作收到 setGameStatus，首点默认初级。F2/P 作用于非输入/非模态环境；仅暂停遮罩内允许 P 继续（无昵称弹窗且目标不是输入框），F2 仍禁止。键盘翻格只在 canvas 聚焦时生效（上下左右限界，Enter/Space/F 不响应 repeat）。canvas tabindex=0、aria-label 描述当前格且不泄露未开雷；#board-focus 标示键盘位置，隐藏于失焦和暂停。window.blur 或 document.hidden 仅暂停 playing，不自动恢复。
6. render 按逻辑像素：canvas CSS 宽高=cols/rows*cellSize，backing 宽高=逻辑大小*DPR（至少1），context.setTransform(actualWidth/logicalWidth,0,0,actualHeight/logicalHeight,0,0)。指针坐标用 CSS 内容区宽高换算、排除边框，resize/换模式自动适配。timer 每200ms只 setTime，禁止整盘轮询重画。重开走 newGame 使用最新设置并清除 pendingScore/临时 UI。
7. smoke 使用隔离临时 userData，校验加载/错误与关键交互（换模式、键盘标记与翻格、暂停重开、侧栏、榜单）；失败退出码非0，finally 清理窗口和临时目录。版本1.3.0，安装器唯一产物保持 MinesweeperSetup-<version>-win.exe。
8. setup-builder.yml 的 files 必须显式包含 styles/main.css，保证 setup/index.html 中 ../styles/main.css 能在 app.asar 内解析。tests/setup.packaging.test.js 检查本地样式文件与打包白名单，修复此前安装器缺共享样式的问题。
9. fit 优先测量 .ms-main 实际宽高，减去 padding、状态/提示/横幅高度、间距与棋盘边框；不可测时回退窗口估算。规格文本先更新再测量，操作说明折叠变化重适配。键盘移动后选中格滚入最近可视区。


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
export function randomMineSet(rows, cols, mines, safeIdx, rng = Math.random)
// 候选池 = 所有格子排除 safeIdx 及其 8 邻居；从中抽取 mines 个（Fisher–Yates，
// 交换时 j = floor(rng() * (i+1))，rng 可注入以支持测试确定性）
// 候选池不足 mines 时抛 Error('Mine pool too small')（校验已保证不会发生）
// -> Set<number>

export function setMines(board, mineSet)
// 直接用给定 mineSet 布雷（跳过随机）：写 cell.isMine、计算每格 count、minesPlaced=true
// 供防猜测重排结果落地使用；返回 board

export function placeMines(board, safeIdx)
// = setMines(board, randomMineSet(rows, cols, mines, safeIdx))；返回 board
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
// unopenedNeighbors = 相邻中 state !== revealed 的格子数（含 hidden/flagged/questioned）
// toFlag = unopened 中 state !== flagged 的格子
// 若 count === unopenedNeighbors 且 board.flagCount + toFlag.length <= board.mines：
//   将 toFlag 全部置为 flagged（旗），flagCount += toFlag.length（不重复计数已标旗者）
// -> { flagged: toFlag } | { blocked: true, flagged: [] }

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

### deduce(rows, cols, mineSet, startIdx) -> DeduceState（v2 新增）
- 是原 `isSolvable` 函数体的逐行搬移（推导循环、规则 1/2/3 完全一致），
  `isSolvable` 变为 `return deduce(...).solved` 的薄包装（行为恒等，不破坏现有测试）。
- 返回：
```js
{
  solved: boolean,          // revealed 数 === rows*cols − mineSet.size（与 isSolvable 一致）
  unknown: Set<number>,     // 不动点仍未判定（未翻开且未标雷）的格子索引集合
  clusters: Array<Set<number>>,  // unknown 的 8-连通簇数组；
  //    排序：按 size 升序，同 size 按簇内最小 idx 升序（确定性，供"取最小簇"使用）
  smallest: Set<number>|null,    // clusters[0]（unknown 为空时 null）
}
```
- **簇内顺序确定性**：每个簇内部的格子按 idx **升序**插入（Set 迭代序 = idx 升序），
  高级算法的候选池/移雷列表均依赖该顺序（rng 注入可复现的前提）。
- 不变式：`solved === true ⟺ unknown.size === 0`；`clusters` 互不相交、并集 === unknown。
- 边界：`clusters` 数量 ≥ 1 时 `smallest` 非空；单格孤立 unknown 也构成 1 格簇。

### generateAntiGuessAdvanced(rows, cols, mines, startIdx, opts={}) -> Result（v2 新增）
```js
// opts: { maxRegionAttempts = MAX_REGION_ATTEMPTS, rng?: () => number }
// -> {
//   ok: boolean, reason?: 'density'|'region', mineSet: Set<number>|null,
//   attempts: number,        // 全局 deduce 调用总次数（含区域重排与候选验证）
//   regionAttempts: number,  // 区域重排尝试次数
//   moves: number,           // 减雷移雷成功次数
//   regions: number,         // 处理过的歧义簇数量
// }
// mineSet 恒为可用布局：size===mines、首点 3×3 安全区无雷；ok:true 时 isSolvable 必为 true
```

**算法（伪代码）：**
```
1) density > MAX_DENSITY → { ok:false, reason:'density', mineSet:null, attempts:0,
                             regionAttempts:0, moves:0, regions:0 }
2) mineSet ← randomMineSet(rows,cols,mines,startIdx,rng)
   totalDeduce ← 0; regionAttempts ← 0; moves ← 0; regions ← 0
3) 外层循环（每轮 = 一次区域级调整）：
   a. state ← deduce(...); totalDeduce++
      state.solved → 返回 { ok:true, mineSet, ...统计 }
      R ← state.smallest（最小 8-连通歧义簇，簇内 idx 升序）；regions++
      mR ← |{ i ∈ mineSet : i ∈ R }|（簇内雷数）
      mR === 0 → 跳出（无法重排也无法减雷）→ 失败
      候选池 poolR ← { i ∈ R : i ∉ 首点安全区 }（idx 升序）
      若 |poolR| < mR → 跳过区域重排直接进 c
   b. 区域重排（簇内雷数不变、簇外雷全部固定；每轮局部计数 resetRound 从 0 起）：
      while resetRound < maxRegionAttempts 且 totalDeduce < MAX_TOTAL_DEDUCE:
        regionAttempts++; resetRound++; totalDeduce++
        newMineSet ← (mineSet \ (R 内雷)) ∪ (Fisher–Yates(poolR, mR, rng))   // 簇外不变
        state ← deduce(...)
        state.solved → 返回 { ok:true, newMineSet, ...统计 }
      （进入 c 前记住 state 与 R，供判定使用）
   c. 减雷移雷（区域重排耗尽或簇全雷/池不足）：
      if totalDeduce ≥ MAX_TOTAL_DEDUCE 或 moves ≥ MAX_MOVES → 跳出 → 失败
      outsideStuck ← state.unknown \ R                       // 移雷前"正常区域"既有歧义格
      removed ← 从 { i ∈ mineSet : i ∈ R }（idx 升序）中按 rng 随机取一颗雷
      candidates ← shuffle({ c : c ∉ R, c ∉ 首点安全区, c ∉ mineSet }（idx 升序）, rng)
                   .slice(0, MAX_MOVE_CANDIDATES)
      for c of candidates:
        totalDeduce++
        m2 ← (mineSet \ {removed}) ∪ {c}
        s2 ← deduce(...)
        s2.solved → mineSet ← m2; moves++; 返回 { ok:true, ...统计 }
        // 「正常区域是否出现猜测」判定（核心语义）：
        // 接受条件：(s2.unknown \ R) ⊆ outsideStuck —— 移雷后正常区域的新歧义
        // 不超出移雷前正常区域既有歧义；允许移入其它既有歧义簇，禁止在干净区域制造新歧义
        if (s2.unknown \ R) ⊆ outsideStuck:
          mineSet ← m2; moves++; 回到外层循环（重新 deduce、重新取最小簇）
      全部候选不接受 → 跳出 → 失败
4) 失败 → { ok:false, reason:'region', mineSet:<最后一次可用布局>, ...统计 }
```

**语义裁定（测试与实现共同依据）：**
- **每轮局部计数**：`maxRegionAttempts` 是**每一轮**（每次进入区域重排）的尝试上限，
  每轮重置；返回的 `regionAttempts` 为全程累计（单调非负）
- 区域重排后若最小簇发生变化（新歧义簇出现），以外层循环重新 deduce 的结果为准
- 簇全雷（mR === R.size）时区域重排只有一种排布，无意义 → 直接进入减雷步
- 首点安全区在推导中恒被洪泛翻开，因此 unknown 不含安全区格（安全区排除是防御性冗余，
  保持"首点 3×3 无雷"不变式的显式保证）
- 减雷后簇雷数递减；簇雷数 0 后既无雷可重排也无雷可减 → 失败
- 失败原因固定为 'region'（区别于标准的 'retries'），由 game.js 负责回退标准模式
- **确定性排序**：poolR（簇内 idx 升序）、移雷列表（簇内雷 idx 升序）、候选列表（idx 升序后洗牌）
  —— 与 deduce 簇内升序共同构成 rng 注入可复现的完整前提

### 常量（v2 新增）
```js
export const MAX_REGION_ATTEMPTS = 20;   // 高级模式区域重排次数默认值
export const MAX_MOVES = 20;             // 减雷移雷轮数上限（内部，不可配置）
export const MAX_MOVE_CANDIDATES = 100;  // 每轮移雷候选位置尝试上限（内部）
export const MAX_TOTAL_DEDUCE = 400;     // 全局 deduce 调用预算（内部，最坏复杂度兜底）
```

### 边界条件清单（须有测试覆盖）
- 已判定可解的确定布局返回 true（用显式构造的 mineSet）
- 经典"需猜测"布局返回 false（如 2×2 两雷对角、或 50/50 死锁）
- density > 0.5 立即返回 reason:'density'
- 重排成功返回 ok:true 且 attempts 在 1..20 内
- 注入 rng 时结果可复现（同一 rng 序列产生同一 mineSet）
- （v2）deduce 提取等价性：对已知布局，`isSolvable === deduce().solved`；
  `unknown`/`clusters`/`smallest` 精确集合断言（如 2×2 对角两雷 → 4 未知 1 簇）
- （v2）高级成功路径：序列型 rng 先产出不可解布局、再在区域重排阶段产出可解布局 →
  ok:true、isSolvable 真、雷数不变、首点安全区无雷
- （v2）**区域外雷固定断言**：成功布局与初始布局在簇外完全一致（集合相等断言）
- （v2）减雷移雷路径：构造"固定雷数所有组合均不可解、减 1 雷后可解"的确定性场景
  （小棋盘穷举）→ moves===1、结果可解
- （v2）移雷候选接受/拒绝：构造使 `(s2.unknown \ R) ⊆ outsideStuck` 成立与不成立两组
- （v2）边界：density 短路零尝试；mR===0 → reason:'region'；簇全雷跳过重排直接减雷；
  预算 MAX_TOTAL_DEDUCE 封顶 → reason:'region'；rng 可复现；统计字段单调非负

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
// config: { rows, cols, mines, antiGuess: boolean, mode: 'beginner'|'intermediate'|'expert'|'custom',
//           antiGuessMethod?: 'standard'|'advanced',   // v2 新增，默认 'standard'
//           maxAttempts?: number,                      // v2 新增，默认 20（范围 1~200）
//           maxRegionAttempts?: number }               // v2 新增，默认 20（范围 1~200，高级模式用）
// opts:   { now?: () => number }  默认 () => Date.now()，可注入假时钟
// -> game
// 说明：config 新字段均有默认值，旧 config（不含新字段）零迁移成本；
//       不校验/不夹取（设置有效性由 settings 模块保证，game 信任入参）
```

### game 对象
- 字段：`state, rows, cols, mines, mode, board`、
  `antiGuess`（开关设置）、`antiGuessActive`（实际生效与否）、`warning`（string|null）、
  `antiGuessMethod, maxAttempts, maxRegionAttempts`（v2 配置字段，restart 保留）、
  `antiGuessStats`（v2：高级模式结果统计副本 `{ok,reason,attempts,regionAttempts,moves,regions}` | null）
- 事件：`game.on(evt, cb)`，支持 `'win' | 'lose' | 'warning'`；`cb(payload)`
- 方法：

```js
restart()          // 新建空棋盘，state=READY，计时清零，warning=null，antiGuessActive 复位，
                   // antiGuessStats=null；保留 antiGuessMethod/maxAttempts/maxRegionAttempts 配置
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
   - 若 `antiGuess`：
     - **method === 'advanced'**（v2）：
       `generateAntiGuessAdvanced(rows, cols, mines, safeIdx, { maxRegionAttempts })`
       → 记录 `antiGuessStats`（含 ok/reason/attempts/regionAttempts/moves/regions）
       - `ok` → `antiGuessActive=true`，`warning=null`，用返回 mineSet 布雷（`setMines`）
       - `reason==='density'` → 与标准 density 分支相同（不回退标准模式，直接关闭）
       - `reason==='region'` → **回退标准整盘重排**：
         `generateAntiGuess(rows, cols, mines, safeIdx, { maxAttempts })`
         - `ok` → `antiGuessActive=true`，`warning=null`，用回退 mineSet 布雷
         - `reason==='retries'` → 与标准 retries 分支相同（关闭 + 横幅）
         - 其它（防御）→ 按 density 分支处理
     - **method === 'standard'**（默认）：现有三分支，`generateAntiGuess(..., { maxAttempts })` 透传配置
       - `ok` → `antiGuessActive=true`，`warning=null`，用返回 mineSet 布雷（`setMines`）
       - `reason==='density'` → `antiGuessActive=false`，`warning='防猜测已关闭：雷密度过高，无法保证无猜'`（精确字符串），`emit('warning', warning)`，用 `placeMines` 普通布雷
       - `reason==='retries'` → `antiGuessActive=false`，`warning=反引号'防猜测已关闭：重排 ${maxAttempts} 次仍无法保证无猜'`（默认 20 时与旧精确字符串逐字符相同），`emit('warning', warning)`，用返回 mineSet 布雷（`setMines`）
   - 否则（防猜测关）：`setMines(board, randomMineSet(rows, cols, mines, safeIdx))`（普通随机），`antiGuessActive=false`，`warning=null`
   - `state=PLAYING`，计时起点 `now()`
   - 说明：game 不调用 `board.placeMines`，而是自行组合 `randomMineSet` + `setMines`，
     以便测试通过 mock `board.randomMineSet` 实现确定性布局；
     必须保持从 solve.js **具名 import** `generateAntiGuess`/`generateAntiGuessAdvanced`（测试 mock 依赖）
2. **胜利/失败**：任何操作后若 `isWin(board)` → `state=WON`、冻结计时、`emit('win', { timeMs, mode, antiGuessActive, rows, cols, mines })`；
   若 explode → `state=LOST`、`revealAllMines(board)`、冻结计时、`emit('lose', { timeMs, mode, antiGuessActive })`
3. **计时**（正向累加）：
   - `startAt` 记录计时基点；`getElapsedMs()` = 播放中 `(now()-startAt) + 已累加值`，暂停时冻结
   - `pause()`：累加当前差值，state=PAUSED
   - `resume()`：重设基点，state=PLAYING
   - 胜利/失败时把最终 elapsed 固化为 `finalTimeMs`
4. **操作守卫**：非 PLAYING 状态下的操作行为——
   - `READY`：`reveal` = 首次点击（触发布雷）；`cycleMark` 允许；`chordLeft/chordRight` → `{type:'noop'}`
   - `PAUSED` / `WON` / `LOST`：`reveal / chordLeft / chordRight / cycleMark` 一律 → `{type:'noop'}`

### 边界条件清单（须有测试覆盖）
- 首次点击必安全：READY 下 reveal 任何格子不爆炸，且 0 区扩散
- 首点前允许标旗；首点前 reveal 之外的 `chordLeft/chordRight` no-op
- 防猜测开启且重排成功 → antiGuessActive=true，warning=null
- 防猜测开启但 density>50% → antiGuessActive=false，warning 含"密度"；且不进行任何重排尝试（attempts=0）
- 防猜测开启但重排失败 → antiGuessActive=false，warning 含"N 次"（N=maxAttempts 配置值，默认 20 文案不变）
- 防猜测关闭 → antiGuessActive=false，warning=null
- win/lose payload 中 `antiGuessActive` 反映**实际**是否无猜
- 暂停期间所有棋盘操作忽略；暂停冻结计时
- 终态后一切操作 no-op
- 假时钟可精确断言 elapsed
- （v2）默认 method='standard' → 只调用 `generateAntiGuess`（回归，旧 config 行为不变）
- （v2）method='advanced' 且高级 ok → active=true、用高级 mineSet、antiGuessStats 记录
- （v2）advanced 返回 reason='density' → **不回退**标准模式，直接用 density 文案
- （v2）advanced 返回 reason='region' + 标准回退 ok → active=true、warning=null、用回退 mineSet
- （v2）advanced 返回 reason='region' + 标准回退 retries → 关闭 + 文案含配置数字
- （v2）maxAttempts=5 时 retries 文案为"防猜测已关闭：重排 5 次仍无法保证无猜"
- （v2）参数透传断言：generateAntiGuess 收到 `{maxAttempts}`；generateAntiGuessAdvanced 收到 `{maxRegionAttempts}`
- （v2）restart 保留防猜测配置字段、重置 antiGuessStats=null

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

## 5b. src/core/settings.js（v2 新增）

防猜测等用户设置持久化（纯 ESM，零 DOM；storage 注入可单测）。

### 常量与默认值
```js
export const SETTINGS_KEY = 'minesweeper.settings.v1';
export const DEFAULT_SETTINGS = Object.freeze({
  antiGuess: true,              // 防猜测总开关
  antiGuessMethod: 'standard',  // 'standard' | 'advanced'
  maxAttempts: 20,              // 标准模式最大重置轮数
  maxRegionAttempts: 20,        // 高级模式区域重排次数
});
export const LIMITS = Object.freeze({ maxAttempts: [1, 200], maxRegionAttempts: [1, 200] });
```

### 校验规则（sanitize，get/update 共用）
- `antiGuess`：`typeof boolean`，否则回退 `true`
- `antiGuessMethod`：∈ {'standard','advanced'}，否则回退 'standard'
- `maxAttempts` / `maxRegionAttempts`：`Number.isInteger` 且在 [1,200]，否则回退默认 20

### createSettings(storage = globalThis.localStorage)
```js
// storage 需实现 { getItem(key), setItem(key, value), removeItem(key) }（测试注入内存 mock）
// -> {
//   get() -> Settings                       // 返回浅拷贝；读取时全字段 sanitize
//   update(patch) -> Settings               // 逐字段校验：非法字段忽略（保留现值），合法字段应用；
//                                           // 写入 storage 后返回新设置拷贝
//   reset() -> Settings                     // 恢复默认并持久化
// }
```
- 读取失败语义：storage.getItem 抛错 → 内存降级为默认值，不崩溃、不写回；
  存储内容为 null / JSON 解析失败 / 非对象 → 默认值
- 写入失败语义：setItem 抛错 → 静默降级（返回新值，不持久化），不崩溃

### 边界条件清单（须有测试覆盖）
- 空存储 → get() 全默认值
- 损坏 JSON / 非对象 / 字段类型错 → 各字段回退默认
- 越界整数（0、500、3.5、'20' 字符串）→ 回退默认
- update 持久化并返回新值；update 非法字段被忽略（原值保留）
- get() 返回拷贝（修改返回值不影响内部）
- storage 抛错 → 降级不崩溃

## 5c. src/core/installer.js（v2 新增）

安装/卸载**纯逻辑**模块（零 fs 副作用；依赖 node:path 仅做字符串处理，可 Node 单测）。
真实文件系统/注册表/快捷方式副作用由主进程 `electron/installer-runner.cjs` 执行。

### 常量
```js
export const MANIFEST_FILE = 'install-manifest.json';
export const UNINSTALL_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Minesweeper';
export const LEGACY_NSIS_DIR_NAME = 'minesweeper';   // %LOCALAPPDATA%\Programs\minesweeper
```

### 清单结构（install-manifest.json，与 exe 同目录）
```json
{
  "version": 1,
  "appName": "Minesweeper",
  "appVersion": "1.0.0",
  "installedAt": "<ISO 时间>",
  "files": ["Minesweeper.exe", "resources\\app.asar", "locales\\zh-CN.pak", "..."],
  "directories": ["resources", "locales", "..."],
  "shortcuts": [ { "type": "desktop", "path": "<绝对路径>" },
                 { "type": "startmenu", "path": "<绝对路径>" } ],
  "registry": { "key": "HKCU\\...\\Uninstall\\Minesweeper" }
}
```
- files/directories 均为**相对路径**（`\` 分隔、无前导 `\`、无盘符、无 `..` 段）

### 接口
```js
toManifestPath(rel) -> string|null
// 规范化相对路径：'/' → '\'；空串、绝对路径（盘符/UNC/以\开头）、含 '..' 段、含 ':' → null

buildManifest({appName, appVersion, files, dirs, shortcuts}) -> string(JSON)
// files/dirs 为 rel 数组（调用方保证合法）；内部经 toManifestPath 规范化，非法条目剔除；
// manifest 含 version:1、installedAt:<ISO>、registry.key=UNINSTALL_KEY

parseManifest(json, baseDir) -> { ok:true, manifest } | { ok:false, error }
// error 为中文：'清单文件不是有效的 JSON' / '清单版本不受支持：<v>' / '清单结构不完整' /
// '清单包含非法路径：<entry>' / '清单包含越界路径：<entry>'
// 校验：JSON 可解析、version===1、files/directories 为数组、每条 toManifestPath 合法
// 且 resolve 后必须以 path.resolve(baseDir) 为前缀（防路径穿越）
// 成功时 manifest 额外含 baseDir = path.resolve(baseDir)（供 planUninstall 使用）

classifyFsError(err, path) -> { code, message }
// err.code: ENOENT→NOT_FOUND('文件不存在，已跳过：<path>')；
//           EACCES/EPERM→PERMISSION('权限不足，无法访问 <path>（可尝试以管理员身份运行）')；
//           EBUSY/EMFILE/ENOTEMPTY→BUSY('文件被占用，无法删除 <path>（请先关闭正在使用该文件的程序）')；
//           其他→FS_ERROR('文件系统错误：<path>（<code>）')

classifyOpError(op, err, ctx={}) -> { code, message }
// op: 'registry'→REG_FAIL('注册表操作失败：<msg>')；
//     'shortcut'→SHORTCUT_FAIL('快捷方式操作失败：<msg>')；
//     'copy'→COPY_FAIL('复制失败：<ctx.src> → <ctx.dst>：<msg>')（ENOSPC 时 <msg>='磁盘空间不足'）；
//     'manifest'→MANIFEST_MISSING('安装清单缺失或损坏：<ctx.path>（无法清单式卸载）')；
//     其他→OP_ERROR('操作失败：<msg>')；其中 <msg> = err.message || String(err)

planInstall({sourceDir, targetDir, files, excludes, renames = {}, relPrefix = null}) -> { steps, dirs }
// files: 源树枚举出的相对路径数组；excludes: 需排除的相对路径（如清单文件）
// renames: Record<源rel, 安装rel>（精确命中，如 { 'MinesweeperSetup.exe': 'Minesweeper.exe' }）
// relPrefix: { src, dst } | null（v3：内嵌游戏目录前缀映射，如
//            { src: 'resources\\game-app', dst: 'resources\\app' }，命中 src 前缀 → dst 前缀）
// 映射优先级：renames 精确命中 > relPrefix 前缀命中 > 原样
// steps: [{ type:'copy', src:<绝对>, dst:<绝对>, rel }]；**step.rel = 安装后实际 rel**
// （清单据此构建；src = path.join(sourceDir, 源 rel)，dst = path.join(targetDir, 安装 rel)）
// dirs: 需创建的目录绝对路径（自顶向下，按映射后的 rel 生成）
// 缺省 renames/relPrefix → 行为与 v2 完全一致（向后兼容）

planUninstall({manifest, tree}) -> { toDelete, skippedExtraneous, skippedMissing }
// tree: { files: string[], dirs: string[] } 磁盘实际扫描（调用方枚举，绝对路径，含安装根目录）
// base = manifest.baseDir
// toDelete: [{ type:'file'|'dir', rel, abs }]，顺序 = 文件全部在前（清单序，末尾追加清单文件自身）、
//           目录按"自底向上"（深→浅），安装根目录（rel='.'）排最后
// skippedExtraneous: [{ rel, abs }]  清单外文件；清单外目录；
//          清单内但含清单外内容的目录（该目录不删，防误删）→ 均跳过并提示
// skippedMissing: string[]          清单内但磁盘不存在的 rel → 跳过（非错误）
// 语义：清单外内容绝不删除；清单内缺失不算错误；
//       安装清单自身（install-manifest.json）在磁盘存在时纳入删除（清单不列出自身，
//       否则残留使根目录永远非空无法删净），且不报为清单外

relocateManifestDir({execPathDir, registryInstallLocation, registryUninstallString, existsSync}) -> string|null
// 优先级链（v3）：execPathDir 下存在清单（existsSync 注入）→ execPathDir；
//   registryInstallLocation（v3 新增，注册表 InstallLocation 原样目录，含引号时去除）
//   下存在清单 → 该目录；
//   否则从 registryUninstallString 解析出 exe 路径（去引号、取首个 token）→
//   path.dirname 后其下存在清单 → 该目录；否则 null
// 说明：v3 起 UninstallString 指向 setup exe（其目录无清单），InstallLocation 是
// 主重定位来源；UninstallString 目录仅兼容 v2 旧安装；新参数缺省 → v2 行为（向后兼容）

suggestInstallDir(drives) -> string
// drives: 非系统盘符数组（如 ['D','E','F']，调用方枚举）；第一个 → `<盘>:\Minesweeper`；
// 空 → `%USERPROFILE%\Minesweeper`

validateInstallDir(dir, {selfDir, isFile}) -> { ok, error }
// 失败（中文 error）：非绝对路径（win32 正则：盘符或 UNC）或空 → '路径无效：<dir>（必须为绝对路径）'；
// dir === selfDir → '不能安装到程序自身所在目录（<selfDir>）'；
// isFile（路径已存在且是文件）→ '目标路径已存在且不是目录，请更换安装位置：<dir>'

detectLegacy({localAppData, registryExists, existsSync, shortcutCandidates}) -> {
  oldNsisDir: string|null,     // localAppData\Programs\minesweeper 存在（existsSync 注入）
  oldShortcuts: string[],      // shortcutCandidates 中 名称匹配 /Minesweeper|扫雷/i 且 .lnk 且存在的
  oldRegistry: boolean,        // registryExists 直传
}

buildUninstallCleanupScript({files, dirs}) -> string
// 生成 .bat 内容（带重试循环，应用退出后文件解锁才能删净）：
// `@echo off` → `ping 127.0.0.1 -n 2 > nul`（初始等待）→ `set tries=0` → `:retry` →
// `set /a tries+=1` → `if %tries% gtr 60 goto done`（上限约 5 分钟防死循环）→
// 每文件 `del /f /q "<abs>"` → 每目录 `rmdir "<abs>"`（自底向上）→
// 每条目 `if exist "<abs>" goto retry` → `:done` → `del "%~f0"`（自删）；路径一律双引号包裹

executeSteps(steps, fsOps, onStep) -> Promise<{ ok, errors:[{code,message,path}], done, skipped }>
// steps: planInstall 的 copy steps 或 planUninstall 的 toDelete
// fsOps 注入: { existsSync, mkdir(p,{recursive}), copyFile, unlink, rmdir }（测试用 fake，async）
// 语义：
//   copy 步：先 mkdir(dirname(dst),{recursive:true})（失败→COPY_FAIL 记录）；src 不存在→
//            NOT_FOUND 记录（skipped++）；copyFile 失败→classifyOpError('copy',…)
//   file/dir 步：unlink/rmdir；NOT_FOUND→视为已删（skipped++，不进 errors）；
//            其他→classifyFsError 记录
//   单步失败 → 归类记录到 errors，继续后续步骤（不中断）
// onStep(step, {ok, error}) 进度回调（可为空）；返回 ok = errors.length===0

formatLogLine(level, module, message, ts) -> string
// '[<ts>] [<LEVEL>] [<module>] <message>'；level ∈ INFO|WARN|ERROR
```

### 错误分类表（中文文案，测试精确断言）
| code | 触发 | 中文消息 |
|---|---|---|
| `PATH_INVALID` | 目录不存在/是文件/自身目录/非绝对路径 | `路径无效：<path>（目录不存在或不是目录）` |
| `PERMISSION` | EACCES/EPERM | `权限不足，无法访问 <path>（可尝试以管理员身份运行）` |
| `BUSY` | EBUSY/EMFILE/ENOTEMPTY | `文件被占用，无法删除 <path>（请先关闭正在使用该文件的程序）` |
| `NOT_FOUND` | ENOENT（删除时视为已删） | `文件不存在，已跳过：<path>` |
| `EXTRANEOUS` | 清单外文件/含清单外内容的目录 | `清单外文件，已跳过：<path>（为安全不删除）` |
| `REG_FAIL` | reg.exe 非零退出 | `注册表操作失败：<detail>` |
| `SHORTCUT_FAIL` | 快捷方式创建/删除异常 | `快捷方式操作失败：<detail>` |
| `COPY_FAIL` | 复制失败（ENOSPC 附"磁盘空间不足"） | `复制失败：<src> → <dst>：<detail>` |
| `MANIFEST_MISSING` | 清单缺失/损坏/越版本 | `安装清单缺失或损坏：<path>（无法清单式卸载）` |
| `LEGACY_FOUND` | 旧版残留检测 | `检测到旧版安装残留：<path>` |
| `BAD_ARG` | IPC 入参非法 | `参数无效：<detail>` |

### 边界条件清单（须有测试覆盖）
- toManifestPath：正常/正反斜杠混用/空/绝对/盘符/UNC/`..` 穿越 → 全部分支
- buildManifest→parseManifest 往返一致；损坏 JSON、version≠1、路径逃逸 → {ok:false,中文}
- classifyFsError / classifyOpError 全表映射（含 ENOSPC 文案）
- planUninstall：清单内存在→删；清单内缺失→skippedMissing；清单外→skippedExtraneous；
  含清单外内容的目录→跳过；文件先删、目录自底向上
- planInstall（v3）：renames 重命名生效且 step.rel=安装后 rel；relPrefix 前缀映射
  （game-app → resources/app）；优先级 renames > relPrefix > 原样；dirs 按映射后 rel；
  缺省参数与 v2 行为一致
- relocateManifestDir：execPath 优先/InstallLocation 重定位/UninstallString 重定位/
  引号路径/三重失效→null/新参数缺省向后兼容
- suggestInstallDir：有 D/无 D 有 E/全无兜底三分支
- detectLegacy 各标志位（注入 existsSync）
- validateInstallDir：非绝对/自身目录/已存在非目录
- executeSteps + fake fsOps：复制成功/目标已存在/源缺失/权限失败 → 错误收集且失败不中断；
  删除 NOT_FOUND 计入 done 不进 errors
- buildUninstallCleanupScript：路径引号转义、目录自底向上、含 self-delete
- formatLogLine 格式精确断言

## 6. renderer（src/renderer/）

### index.html 关键 DOM 契约（T5/T6/T12 实现）
`createUI(host, deps)` 在 host 内**程序化生成**全部控件 DOM（index.html 仅提供
`<div id="app">` 与 `<canvas id="board-canvas">`），id 如下（jsdom 测试按此查询）：

**既有契约（v2 不得破坏，ui.test.js 按此回归）：**
| id / 选择器 | 用途 |
|---|---|
| `#mine-count` / `#timer` | 剩余雷数 / 计时显示（mm:ss），顶栏 |
| `.ms-mode[data-mode]` | 三个标准模式按钮（data-mode=beginner/intermediate/expert），侧栏，**仍为 3 个** |
| `#custom-rows` / `#custom-cols` / `#custom-mines` | 自定义输入框，侧栏 |
| `#custom-apply` / `#custom-error` | 自定义应用按钮 / 错误提示，侧栏 |
| `#anti-guess-toggle` / `#antiguess-status` | 防猜测开关（默认勾选）/ 实际生效文案，侧栏 |
| `#pause-btn` / `#resume-btn` / `#restart-btn` | 暂停 / 继续（遮罩内）/ 重新开始，顶栏 |
| `#warning-banner` + `#warning-banner-text` + `#warning-banner-close` | 防猜测关闭横幅，顶栏下方 |
| `#pause-overlay` | 暂停遮罩 |
| `#nickname-modal` + `#nickname-input` + `#nickname-submit` + `#nickname-cancel` | 昵称弹窗（遮罩弹窗保持） |
| `#leaderboard-modal` + `#leaderboard-tabs` + `#leaderboard-body` + `#leaderboard-close` + `#leaderboard-hint` | **主页面板**（class 由 `overlay` 改为 `ms-panel`，不再全屏遮罩；隐藏语义仍用 `hidden` 类切换） |
| `#board-canvas` / `#board-wrap` / `#scale-handle` | 画布 / 容器 / 缩放手柄（main.js） |

**v2/v3 新增契约：**
| id / 选择器 | 用途 |
|---|---|
| `#sidebar-toggle` | 汉堡按钮（顶栏左上角，三条横线） |
| `aside#sidebar` | 左侧栏（240px；`body.sidebar-open` 时展开，默认收起） |
| `#ag-method` | 防猜测实现方式 select（值 standard/advanced） |
| `#ag-max-attempts` | 最大重置轮数 number（1~200） |
| `#ag-region-attempts` | 区域重排次数 number（1~200；method=standard 时 disabled） |
| `#ag-settings-hint` | 防猜测设置区提示文案 |
| `#leaderboard-open` | 侧栏"排行榜"按钮（点击后主页展示面板） |

> **v3 删除契约**（安装/卸载从游戏剥离，以下 id 不再存在于游戏 DOM，ui.test.js/
> ui.sidebar.test.js 不得再断言）：`#installer-open`、`#installer-modal`、
> `#installer-step`、`#install-dir-input/-suggest/-error`、`#install-desktop-chk`、
> `#install-startmenu-chk`、`#install-progress-track/fill/text`、`#install-report`、
> `#install-next/back/confirm/cancel/close`、`#installer-legacy-clean`。
> 上述 DOM 契约整体迁移至 setup 程序（见 §6b），id 保持不变以复用 CSS/测试模式。

### renderer/ui.js —— 可测 DOM 层（v3 已剥离安装/卸载）
```js
export function createUI(host, deps)
// deps: { leaderboard, getState: () => gameSnapshot,
//         actions: { selectMode, applyCustom, toggleAntiGuess, pause, resume, restart, submitNickname,
//                    toggleSidebar, setAntiGuessMethod, setMaxAttempts, setMaxRegionAttempts,
//                    openLeaderboard } }
// -> {
//    setMineCount(n), setTime(ms), setPauseOverlay(visible), setAntiGuessActive(active),
//    showBanner(msg), hideBanner(), showNicknamePrompt({ timeMs, mode, antiGuessActive }),
//    showLeaderboard(hint?), setCustomError(msg),
//    setAntiGuessSettings({method, maxAttempts, maxRegionAttempts}),   // 回填设置区
//    getSidebarOpen() -> boolean,
// }
```
- 汉堡点击 → `actions.toggleSidebar()`；侧栏 class 由 body 控制（`body.classList.toggle('sidebar-open')`）
- 排行榜面板：`showLeaderboard(hint)` 语义改为"主页展示面板"（签名与隐藏切换不变）；
  按 `(mode, antiGuess)` 标签页展示 6 组榜单；点击面板外区域或关闭按钮隐藏
- 防猜测设置区：控件 change → 对应 action；`setAntiGuessSettings` 回填控件值；
  method=standard 时 `#ag-region-attempts` 置 disabled，advanced 时启用
- 昵称提交：调用 `deps.actions.submitNickname(nickname)`；UI 层负责先 `isTopTen` 判断，进前十才弹输入
- jsdom 测试覆盖：按钮回调触发、横幅显隐、面板内容、计时/雷数刷新、侧栏开合、设置联动

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
- window resize：`cellSize = clamp(floor(min(w/cols, h/rows)), 16, 48)` 重绘；**侧栏展开时可用宽再扣 248px**（`body.sidebar-open` 判断），展开/收起动作后必须重调 `fitToWindow()`
- 装配 ui.js 事件与 game 事件（win/lose/warning → 弹窗/横幅）
- 防猜测设置流：启动时 `settings.get()` 回填 UI 并作为默认对局配置；
  toggle/method/attempts change → `settings.update(...)` 持久化并作用于当前/后续对局
- **v3：无任何安装/卸载流**（window.minesweeperAPI 仅含 app.getVersion，无 installer 面）

## 6b. setup 程序（v3 新增：setup/ 渲染层 + 安装器 UI）

独立安装器 MinesweeperSetup 的渲染层（`setup/` 目录），与游戏 renderer 完全隔离；
`setup/index.html` link `../styles/main.css`（共享类 .overlay/.modal/.ms-input/.ms-btn/
.hidden 等）与 `./wizard.css`（从 styles/main.css 迁移的向导样式）。

```js
export function createSetupUI(host, deps)
// deps: { actions: { suggestDir, startInstall(opts), runUninstall, runCleanLegacy, exit } }
// -> {
//    showStatus(status),            // { installed, installDir, appVersion, legacy }
//    showStep(step, payload),       // step: 'welcome'|'dir'|'options'|'progress'|'report'
//    setProgress({done, total, message}),
//    showReport(result),            // 渲染 li[data-code]（error/warn/ok 语义类）
//    showUninstallConfirm({dir, appVersion}),
//    showLegacyPrompt(legacy),
// }
export function startSetupApp()
// 内置 window.minesweeperAPI 接线（可选链守卫；无 preload 时操作显示中文错误提示不崩）
```

DOM 契约（复用向导类名与 id，CSS 从 main.css 迁移）：
| id / 选择器 | 用途 |
|---|---|
| `#setup-root` | 挂载点（index.html 静态提供） |
| `#setup-mode[data-mode=wizard\|uninstall]` | 向导 / 卸载确认 两种视图切换 |
| `#setup-step[data-step]` | 向导步骤容器（welcome/dir/options/progress/report） |
| `#install-dir-input` / `#install-dir-suggest` / `#install-dir-error` | 安装目录输入 / 建议按钮 / 校验错误 |
| `#install-desktop-chk` / `#install-startmenu-chk` | 快捷方式 checkbox（默认勾选） |
| `#install-progress-track` / `#install-progress-fill` / `#install-progress-text` | 进度条 |
| `#install-report` | 结果报告（`li[data-code]`） |
| `#install-next` / `#install-back` / `#install-confirm` / `#install-cancel` / `#install-close` | 向导按钮 |
| `#uninstall-dir` / `#uninstall-version` / `#uninstall-confirm-btn` | 卸载确认视图：目录 / 版本 / 确认卸载 |
| `#installer-legacy-clean` | 旧版残留清理提示区（条件显示） |

- 流程：`startSetupApp()` → `getStatus()` → installed ? 卸载确认视图 : 向导（welcome）
- 向导：welcome（欢迎+遗留清理提示）→ dir（suggestDir 预填，输入校验）→ options →
  confirm（`startInstall({dir, desktopShortcut, startMenuShortcut})` + 进度订阅）→ report
- 卸载：`runUninstall()`（二次确认按钮）→ 进度 → report
- jsdom 测试（tests/setup.ui.test.js）：步骤切换、卸载视图、进度条、报告分类渲染、
  legacy 提示显隐、按钮 action 接线、无 preload 不崩

## 7. Electron 壳与工程配置

### electron/main.cjs（v3 双应用分派入口）
- **顶部（require 之后、一切逻辑之前）**：
```js
const isSetup = process.env.MINESWEEPER_SETUP === '1' ||
  fs.existsSync(path.join(path.dirname(app.getAppPath()), 'game-app'));
if (isSetup) { require('./setup.cjs'); return; }   // CJS 顶层 return 合法
```
- **游戏侧**：`BrowserWindow({ width: 900, height: 640, minWidth: 480, minHeight: 360,
  autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false,
  preload: <preload.cjs> } })`；鲁棒性（路径运行时解析不缓存 + uncaughtException/
  unhandledRejection 写日志不闪退）；单实例锁（无 second-instance 转发）；
  仅注册 `app:get-version` 一个 IPC handler（senderFrame 校验保留）
- **打包态自愈 InstallLocation**（游戏侧，仅 `app.isPackaged`）：
  `reg.exe query <UNINSTALL_KEY> /v InstallLocation` → 值 ≠ dirname(process.execPath)
  且自身目录存在 install-manifest.json → `reg.exe add ... InstallLocation` 更新；
  失败仅 log.warn 不阻断启动（UNINSTALL_KEY 常量在 main.cjs 内联硬编码，注明来源
  src/core/installer.js，游戏不打包该模块）

### electron/setup.cjs（v3 新增，安装器主进程）
- 由 main.cjs IS_SETUP 分派 require() 后接管 app 生命周期；入口顺序：
  `app.setPath('userData', <os.tmpdir()/MinesweeperSetup-userdata>)`（零痕迹）→
  `createLogger({ dir: <os.tmpdir()/MinesweeperSetup/logs> })`（%TEMP% 自动清理）
- CLI 解析（process.argv）：
  - `--uninstall`：静默卸载（UninstallString 入口；不建窗口；完成后清理子进程 +
    `app.exit(0|1)`）
  - `--install-dir <dir>`：静默安装（默认建桌面+开始菜单快捷方式；
    `--no-desktop-shortcut` / `--no-startmenu-shortcut` 可关；完成后 app.exit）
  - 无参数：GUI 窗口 `BrowserWindow({ width: 520, height: 480, autoHideMenuBar: true,
    webPreferences: { contextIsolation, nodeIntegration: false, preload: preload-setup.cjs } })`
    → loadFile `setup/index.html` → ready 后 `getStatus()` → installed ? 卸载视图 : 向导
- IPC 注册（senderFrame 校验 + install 入参校验逻辑从 v2 main.cjs 迁移）：
  `app:get-version`、`installer:get-status/suggest-dir/install/uninstall/clean-legacy` +
  `installer:progress` 事件；runner = `createRunner({ logger, installerMod, getWindow })`
- 单实例锁：拿不到锁即退出（防双开向导）

### IPC 与 preload（v3 拆分）
- `electron/preload.cjs`（游戏侧）：仅 `app: { getVersion }`
- `electron/preload-setup.cjs`（setup 侧）：v2 preload 全文（app.getVersion + installer 6 方法 + onProgress）
```js
contextBridge.exposeInMainWorld('minesweeperAPI', {
  app: { getVersion: () => ipcRenderer.invoke('app:get-version') },
  installer: {
    getStatus:   () => ipcRenderer.invoke('installer:get-status'),
    suggestDir:  () => ipcRenderer.invoke('installer:suggest-dir'),
    install:     (opts) => ipcRenderer.invoke('installer:install', opts),   // {dir, desktopShortcut, startMenuShortcut}
    uninstall:   () => ipcRenderer.invoke('installer:uninstall'),
    cleanLegacy: () => ipcRenderer.invoke('installer:clean-legacy'),
    onProgress:  (cb) => { const h = (_e, p) => cb(p);
                           ipcRenderer.on('installer:progress', h);
                           return () => ipcRenderer.removeListener('installer:progress', h); },
  },
});
```
- 固定通道白名单；senderFrame 校验；install 入参校验（绝对路径防穿越 + boolean）
- 进度事件 `{ phase:'copy'|'registry'|'shortcut'|'cleanup', done, total, message }`
- `InstallStatus = { installed:boolean, installDir:string|null, appVersion:string,
  legacy:{ oldNsisDir, oldShortcuts:[], oldRegistry:boolean } }`
- 渲染层一律 `window.minesweeperAPI?.installer` 可选链守卫
```
- **固定通道白名单**（无动态 channel）；每个 handler 校验 `event.senderFrame === win.webContents.mainFrame`
- 入参校验在主进程：`dir` 必须绝对路径、`path.resolve` 后 `startsWith(<允许根>)` 防穿越；
  shortcut 必须 boolean；非法 → `{ ok:false, errors:[{ code:'BAD_ARG', message:'参数无效：...' }] }`
- 进度事件 `{ phase:'copy'|'registry'|'shortcut'|'cleanup', done, total, message }`
- `InstallStatus = { installed:boolean, installDir:string|null, appVersion:string,
                    legacy:{ oldNsisDir, oldShortcuts:[], oldRegistry:boolean } }`
- 渲染层一律 `window.minesweeperAPI?.installer` 可选链守卫（无 preload 环境不崩）

### electron/installer-runner.cjs（薄胶水，无业务决策）
- 真实副作用执行者：`original-fs`（Electron asar 补丁 fs 无法复制 .asar 结尾源文件）、
  `reg.exe add|delete|query`（超时 15s，非零退出 → REG_FAIL）、
  `powershell -NoProfile -ExecutionPolicy Bypass`（WScript.Shell 创建/删除 .lnk，→ SHORTCUT_FAIL）
- **安装源语义（v3 打包形态 = setup 程序）**：
  - 打包形态（`app.isPackaged`）：源目录 = `dirname(process.execPath)`（便携解压目录：
    exe/dll/locales/resources/app.asar/resources/game-app…），**枚举整目录**，排除
    `install-manifest.json` 与 `resources\app.asar`（setup 自身代码）；
    `planInstall` 传 `renames: { '<setup exe 名>': 'Minesweeper.exe' }`（exe 重命名）与
    `relPrefix: { src: 'resources\\game-app', dst: 'resources\\app' }`（内嵌游戏 → 安装副本
    unpacked 应用目录）；`buildManifest.files = steps.map(s => s.rel)`（安装后 rel）
  - 开发形态（npm start + MINESWEEPER_SETUP=1）：源目录 = `app.getAppPath()`，白名单枚举
    （预览语义，无重命名/前缀映射）
  - 快捷方式/DisplayIcon 指向**安装副本 exe**：打包 = `<目标目录>\Minesweeper.exe`
    （重命名后）；开发 = 当前 exe；工作目录 = 目标目录
- **卸载项值（v3 变更）**：`DisplayName=扫雷 Minesweeper`、`DisplayVersion`、
  `DisplayIcon=<安装副本 exe>`、`UninstallString="<setup 磁盘 exe>" --uninstall`、
  `InstallLocation=<目标目录>`、`NoModify=1`、`NoRepair=1`、`EstimatedSize(KB)`
  - setup 磁盘 exe = `process.env.PORTABLE_EXECUTABLE_FILE || path.join(dirname(process.execPath),
    basename(process.execPath))`（portable 解压 exe ≠ 磁盘 exe，必须用环境变量）
- **getStatus/卸载重定位**：新增 `queryRegistryInstallLocation()`；relocateManifestDir 传入
  `registryInstallLocation`（v3 主重定位来源）
- 卸载自删：游戏目录内无 setup 自身文件，一般无自锁；若游戏进程在运行（BUSY）→ 生成
  `%TEMP%\minesweeper-uninstall-<ts>.bat`（`buildUninstallCleanupScript`）→ 分离启动 →
  报告后 `app.exit()`

### electron/log.cjs
- `createLogger({dir}) -> { info, warn, error, getLogPath() }`
- 默认路径 `%LOCALAPPDATA%\Minesweeper\logs\minesweeper-YYYY-MM-DD.log`（游戏侧）；
  **setup 侧传入 `{ dir: <os.tmpdir()/MinesweeperSetup/logs> }`**（%TEMP% 自动清理，零痕迹）；
  按日轮转，启动清理 7 天前文件
- 行格式 = `formatLogLine(level, module, message, ts)`（见 §5c）；installer.js 未打包时
  走内联兜底格式化器（格式逐字符一致）；appendFileSync，写失败静默降级 console
- 记录点：启动路径解析、安装/卸载每步、注册表/快捷方式操作、全部错误归类、--uninstall 结果

### package.json 与打包（v3）
```json
{
  "name": "minesweeper",
  "productName": "Minesweeper",
  "version": "1.2.0",
  "description": "Electron 经典扫雷：防猜测模式 + 排行榜 + 独立安装器",
  "main": "electron/main.cjs",
  "type": "module",
  "scripts": {
    "start": "electron .",
    "test": "vitest run",
    "test:watch": "vitest",
    "dist": "node scripts/build-dist.cjs"
  }
}
```
- `build` 字段删除；配置迁至 `scripts/setup-builder.yml`：
  - `productName: MinesweeperSetup`；`files` = electron/{main,setup,preload-setup,
    installer-runner,fs-utils,log}.cjs + src/core/installer.js + setup/** + package.json
  - `extraResources: [{ from: '.build/game-app', to: 'game-app' }]`
  - `win: { target: [portable], signAndEditExecutable: false,
    artifactName: 'MinesweeperSetup-${version}-win.${ext}' }`
- `scripts/build-dist.cjs` 流程：清理 dist/.build → staging 剥离版游戏到
  `.build/game-app/`（index.html、styles/**、src/** 排除 src/core/installer.js、
  electron/{main,preload,log}.cjs、package.json；复制后校验 package.json.main 与
  无 installer 面文件）→ `npx electron-builder --config scripts/setup-builder.yml --win portable`
  → 删除 dist/builder-debug.yml → 摘要输出
- 安装命令需带 Electron 镜像备选：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install`（网络失败时启用）
- vitest 环境：核心测试用 `// @vitest-environment node`，ui/render 测试用 `// @vitest-environment jsdom`（文件头注释声明）

## 8. 测试规格（tests/，先于实现编写）

| 文件 | 覆盖 | 用例数（估） |
|---|---|---|
| modes.test.js | validateCustom 全分支、MODES 常量 | ~12 |
| board.test.js | 创建/邻居/布雷安全区/翻开洪泛/chord×2/标记循环/胜负 | ~30 |
| solve.test.js | 可解/需猜布局、密度短路、重排、rng 确定性 | ~15 |
| solve.retries.test.js | 重排 20 次耗尽（vi.mock 固定不可解布局） | ~2 |
| game.test.js | 状态机、首点、防猜测三分支、计时/暂停、胜负事件（vi.mock solve 保证确定性） | ~25 |
| leaderboard.test.js | 存取/排序/截断/损坏修复/降级 | ~15 |
| ui.test.js（jsdom） | 控件回调、横幅、弹窗、计时刷新（v3 不含安装 DOM） | ~12 |
| render.test.js | 假 ctx 绘制断言 | ~6 |
| **settings.test.js（v2）** | 默认值/持久化/损坏 JSON/越界回退/storage 抛错降级/拷贝语义 | ~12 |
| **solve.advanced.test.js（v2）** | deduce 等价性与精确集合、高级成功路径、区域外雷固定、减雷移雷、边界与预算 | ~20 |
| **game.advanced.test.js（v2）** | 默认 standard 回归、advanced 三分支+回退、参数透传、warning 数字 | ~10 |
| **installer.test.js（v2→v3）** | 路径规范化/清单往返/错误分类全表/卸载计划/重定位（+InstallLocation 链）/目录建议/legacy/执行器 fake fsOps/脚本转义/日志格式 + **planInstall renames/relPrefix 映射** | ~30 |
| **ui.sidebar.test.js（v2→v3, jsdom）** | 汉堡开合/现有 id 回归/设置联动/面板（v3 删除安装向导与报告用例） | ~10 |
| **setup.ui.test.js（v3 新增, jsdom）** | 向导 5 步骤切换/卸载确认视图/进度条/报告分类渲染/legacy 提示/按钮接线/无 preload 不崩 | ~12 |

验收标准：`npm test` 全绿（v3 预计 ~230 用例）；随后 `npm start` 手动冒烟；
冒烟脚本断言追加：`window.minesweeperAPI.app.getVersion` 为函数、`installer` 面**不存在**、
`#installer-open` 不存在、`#sidebar-toggle` 存在、初始 body 无 sidebar-open；
最后 `npm run dist` 出 `dist/MinesweeperSetup-1.2.0-win.exe`（dist 内唯一产物），
`node scripts/installer-e2e.cjs` 四阶段端到端验收（静默安装/冒烟安装副本/移动+自愈+
静默卸载/外来文件+GUI 卸载）。

## 9. 任务依赖图

```
v1:  T6 electron-shell ────────┐
     T1 board ──▶ T2 solve ──▶ T3 game ──▶ T5 renderer(依赖 T1-T3 + T6)
     T4 leaderboard ─────────────────────▶ T5

v2:  T0b 文档链 + 全部新测试（主 agent）
     Wave A（并行）: T7 settings ──▶ ┐
                     T8 installer ──▶ ├──▶ Wave C: T12 renderer（依赖 T7+T10+T11）
                     T9 solve 重构 ──▶│
     Wave B（并行）: T10 game（依赖 T9）┘
                     T11 electron 壳（依赖 T8）──▶ T12
     Wave D: T13 打包 + 全量验证 + README + AGENTS.md

v3（安装剥离为独立 MinesweeperSetup）：
     T14 文档链 + 任务文件 + progress（主 agent，W0）
     Wave A: T15 setup UI（setup/ui.js + wizard.css + index.html，纯 jsdom）
     Wave B: T16 installer.js 扩展（planInstall renames/relPrefix + relocateManifestDir
             registryInstallLocation；测试先行）
     Wave C: T17 electron setup（setup.cjs + preload-setup.cjs + runner 打包态安装适配
             + main.cjs IS_SETUP 分派）── 依赖 T15+T16
     Wave D: T18 游戏剥离（ui.js/main.js/preload.cjs/main.cjs/styles + 自愈
             InstallLocation + ui.sidebar.test.js 删减 + smoke 深断言）
     Wave E: T19 打包（build-dist.cjs + setup-builder.yml + package.json v1.2.0
             + .gitignore；清理 dist/game）── 依赖 T17+T18
     Wave F: T20 E2E 四阶段 + 全量验证 + README/AGENTS/progress 收尾 ── 依赖 T19
```
- v3 Wave A：T15（无依赖）
- v3 Wave B：T16（无依赖）
- v3 Wave C：T17（依赖 T15、T16）
- v3 Wave D：T18（无依赖，可与 A/B/C 并行）
- v3 Wave E：T19（依赖 T17、T18）
- v3 Wave F：T20（依赖 T19；E2E 静默安装/自愈/卸载/GUI 卸载 + 手动验收清单）
