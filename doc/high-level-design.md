# 高层设计 high-level-design.md

> 依据 doc/proposal.md。本文件描述架构、模块划分、数据流与主要权衡。

## 1. 总体架构

Electron 应用，经典三层：

```
┌─────────────────────────────────────────────────────────┐
│  Electron 主进程  electron/main.js                       │
│   · 创建 BrowserWindow，加载 index.html                  │
│   · 窗口尺寸策略（自适应）                              │
├─────────────────────────────────────────────────────────┤
│  预加载  electron/preload.js  (contextBridge, 最小化)    │
├─────────────────────────────────────────────────────────┤
│  渲染进程  src/renderer/                                │
│   · index.html + styles/main.css（经典扫雷风格）         │
│   · renderer/main.js（事件装配，薄层）                   │
│   · renderer/render.js（Canvas 绘制：3D 浮雕格子）       │
│   · renderer/ui.js（DOM 控件/暂停遮罩/排行榜/昵称弹窗）  │
│   ─────────────────────────────────────────            │
│  核心逻辑（纯 JS ESM，零 DOM 依赖，可被 Vitest 单测）    │
│   · src/core/board.js     棋盘模型 + 布雷 + 翻开 + 标记  │
│   · src/core/solve.js     可解性检测 + 防猜测重排        │
│   · src/core/game.js      游戏状态机 + 计时 + 暂停       │
│   · src/core/modes.js     模式预设 + 自定义约束          │
│   · src/core/leaderboard.js  排行榜（localStorage）      │
└─────────────────────────────────────────────────────────┘
```

**原则**：所有可测试的逻辑（布雷、邻居计数、空区扩散、chord、可解性算法、
防猜测重排、计时、状态机、排行榜）全部下沉到 `src/core/*.js` 纯模块；
渲染层只负责画与转发事件。这保证核心逻辑可在 Node 下用 Vitest 严格测试，
无需 Electron/浏览器环境。

## 2. 模块职责

| 模块 | 职责 | 依赖 |
|---|---|---|
| `core/modes.js` | 模式预设（初/中/高级）、自定义参数校验 | 无 |
| `core/board.js` | 生成棋盘、首次点击后布雷、邻居雷数、翻开/空区扩散、标旗/问号循环、chord、镜像 chord、胜负判定 | modes |
| `core/solve.js` | 从某一已翻开局面做逻辑推导直至结束，判定"是否可无猜解"；防猜测重排（≤20 次）、密度>50% 判定 | board |
| `core/game.js` | 游戏生命周期状态机（ready/playing/paused/won/lost）、正向计时、防猜测开关调度、胜利/失败结果回调 | board, solve |
| `core/leaderboard.js` | 按 (模式 × 防猜测) 分组的 top-10 榜单读写（localStorage）、排序、写入、查询 | 无 |
| `renderer/render.js` | Canvas 经典 3D 风绘制（未开/翻开/旗/问号/数字/雷） | 无 |
| `renderer/ui.js` | DOM 控件、暂停遮罩、排行榜弹窗、昵称输入、提醒横幅 | modes, leaderboard |
| `renderer/main.js` | 装配：事件→core 调用→重绘；缩放手柄拖动；窗口 resize 适配 | 全部 |
| `electron/main.js` | BrowserWindow、加载页面 | 无 |

## 3. 数据流

### 开局
```
用户选模式/自定义参数 → game.start(config)
  → board.placeMines(cols, rows, mines, safeCell)   // 首次点击后调用
  → 若防猜测开：solve.isSolvable(board) 不通过则重排（≤20 次）
  → 超限/密度>50% → 关闭防猜测 + 回调提醒
```

### 交互
```
鼠标事件 → renderer/main.js → game.handleLeftClick / handleRightClick
  → board.reveal / board.chord / board.flagCycle / board.chordFlag
  → game 更新计时/状态 → renderer 重绘 → 若胜利/失败进入结算
```

### 胜利结算
```
game 判定胜利 → 标准模式 → ui.js 弹昵称输入
  → leaderboard.add(mode, antiGuess, {nickname, timeMs})
  → 弹排行榜（显示新成绩排名）
```

## 4. 关键算法与权衡

### 4.1 可解性检测（防猜测核心）
采用**前沿局部推导（Frontier Deduction）+ 子集分析**组合，迭代推进直到棋盘全翻开
或无法再推进（出现死局=需猜测）：

1. **NSS 单格约束**：
   - 数字格 a，若 `a == 周围未翻开数` → 全部标雷
   - 数字格 a，若 `a == 周围标雷数` → 翻开全部未标雷邻居
2. **SNS 子集约束（2 集推理）**：对前沿上的数字格集合，
   若集合 A 的候选雷集 C_A ⊆ 集合 B 的候选雷集 C_B 且 `|C_A| - |A| == |C_B| - |B|`
   则 B 中多出的候选格非雷（可翻）→ 归纳更复杂局面的常规手段。
3. 迭代到不动点；若所有非雷格全部翻开 → **可解**；否则 → **需猜测**。

**权衡说明**：完整"对任意局面证明存在无猜策略"在一般情况下是困难问题
（与计算复杂度相关），本实现采用 NSS+SNS 组合，足以处理 5~60 格棋盘上
绝大多数真实局面；对极少数需更复杂推理的极限局面可能误判为"需猜测"。
因防猜测失败时仅触发一次重排（≤20 次），该近似不会造成功能错误，
只可能更频繁地重排。此取舍写入 detailed-design 并在 README 说明。

### 4.2 防猜测重排
- 固定首点及其 3×3 邻域为雷区外（空区扩散前提）
- 在其余格子均匀随机布雷（Fisher–Yates 抽取雷位）
- `isSolvable(首点展开后局面)` → 不通过则重排，最多 20 次
- 提前终止：若 `mines / (rows*cols) > 0.5` 直接关闭不尝试

### 4.3 棋盘渲染缩放
- 棋盘像素尺寸 = `cols*cellSize × rows*cellSize`，cellSize ∈ [16,48]
- 窗口 resize：按可用区与棋盘宽高比取 `floor(min(w/cols, h/rows))` 再夹到 [16,48]
- 拖拽缩放手柄：实时改 cellSize，夹到 [16,48]

### 4.4 排行榜
- localStorage key：`minesweeper.leaderboard.v1`
- 结构：`{ beginner: { antiGuess: {on:[…], off:[…]}, noAntiGuess: …}, … }`（详见 detailed-design）
- 每组至多 10 条，按 timeMs 升序

## 5. 依赖与工具
- 运行时：`electron`（唯一运行时依赖）
- 开发：`vitest`（测试）、`electron-builder`（打包 exe）、`concurrently`（可选）
- 模块类型：ESM（`"type": "module"`）；Electron 主进程按需使用 CommonJS 或 ESM（Electron ≥28 支持 ESM main）

## 6. 风险与备选
| 风险 | 应对 |
|---|---|
| 求解器对极限局面误判 | NSS+SNS 组合 + 重排上限兜底，不会产生错误棋盘 |
| 高密度下防猜测频繁重排慢 | 密度>50% 提前短路；20 次上限；20×30 全板推导耗时 <100ms |
| electron-builder 下载网络不稳定 | 打包作为独立任务，失败不阻塞功能交付；必要时换镜像 |
| localStorage 在渲染进程差异 | 用标准 Web Storage API，Vitest 用 stub 模拟 |
