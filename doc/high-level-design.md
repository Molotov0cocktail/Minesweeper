# 高层设计 high-level-design.md

> 依据 doc/proposal.md。本文件描述架构、模块划分、数据流与主要权衡。

## 1. 总体架构

Electron 应用，经典三层：

```
┌─────────────────────────────────────────────────────────┐
│  Electron 主进程  electron/                              │
│   · main.cjs            窗口 + IPC 注册 + --uninstall    │
│   · preload.cjs         contextBridge 最小 API 面        │
│   · installer-runner.cjs 安装/卸载执行（薄胶水）         │
│   · log.cjs             %LOCALAPPDATA% 日志（按日轮转）  │
├─────────────────────────────────────────────────────────┤
│  渲染进程  src/renderer/                                │
│   · index.html + styles/main.css（经典扫雷风格+美化）    │
│   · renderer/main.js（事件装配，薄层，含侧栏适配）       │
│   · renderer/render.js（Canvas 绘制：3D 浮雕格子）       │
│   · renderer/ui.js（顶栏/侧栏/面板/向导/弹窗 DOM）       │
│   ─────────────────────────────────────────            │
│  核心逻辑（纯 JS ESM，零 DOM 依赖，可被 Vitest 单测）    │
│   · src/core/board.js     棋盘模型 + 布雷 + 翻开 + 标记  │
│   · src/core/solve.js     可解性检测（deduce）+ 防猜测   │
│                            重排（标准/高级局部重排）     │
│   · src/core/game.js      游戏状态机 + 计时 + 防猜测调度 │
│   · src/core/modes.js     模式预设 + 自定义约束          │
│   · src/core/leaderboard.js  排行榜（localStorage）      │
│   · src/core/settings.js  防猜测等设置持久化             │
│   · src/core/installer.js 安装/卸载清单与错误分类（纯逻辑│
│                            零 fs，注入 fsOps 执行）      │
└─────────────────────────────────────────────────────────┘
```

**原则**：所有可测试的逻辑（布雷、邻居计数、空区扩散、chord、可解性算法、
防猜测重排、计时、状态机、排行榜、设置持久化、安装清单/错误分类）全部下沉到
`src/core/*.js` 纯模块；渲染层只负责画与转发事件；主进程只做真实文件系统/
注册表/快捷方式副作用（薄胶水）。这保证核心逻辑可在 Node 下用 Vitest 严格测试，
无需 Electron/浏览器环境。安装/卸载决策（清单、比对、错误归类）与副作用执行分离，
前者可注入式单测。

## 2. 模块职责

| 模块 | 职责 | 依赖 |
|---|---|---|
| `core/modes.js` | 模式预设（初/中/高级）、自定义参数校验 | 无 |
| `core/board.js` | 生成棋盘、首次点击后布雷、邻居雷数、翻开/空区扩散、标旗/问号循环、chord、镜像 chord、胜负判定 | modes |
| `core/solve.js` | `deduce` 逻辑推导（暴露不动点未知格/连通簇）；`isSolvable` 判定；标准防猜测整盘重排（≤maxAttempts）；高级局部重排（歧义簇重排+减雷移雷）；密度>50% 判定 | board |
| `core/game.js` | 游戏生命周期状态机（ready/playing/paused/won/lost）、正向计时、防猜测调度（标准/高级+回退）、胜利/失败结果回调 | board, solve |
| `core/leaderboard.js` | 按 (模式 × 防猜测) 分组的 top-10 榜单读写（localStorage）、排序、写入、查询 | 无 |
| `core/settings.js` | 防猜测等用户设置持久化（localStorage，损坏/越界自动回退默认） | 无 |
| `core/installer.js` | 安装清单构建/解析、卸载比对计划、错误分类（中文）、路径建议/校验/重定位、执行器（fsOps 注入） | 无 |
| `renderer/render.js` | Canvas 经典 3D 风绘制（未开/翻开/旗/问号/数字/雷） | 无 |
| `renderer/ui.js` | 顶栏（汉堡/状态/暂停重开）、左侧栏（等级/自定义/防猜测设置/排行榜/安装入口）、主页面板、安装向导、昵称输入、提醒横幅 | modes, leaderboard |
| `renderer/main.js` | 装配：事件→core 调用→重绘；缩放手柄拖动；窗口 resize 适配（含侧栏展开扣除宽度）；IPC 调用 | 全部 |
| `electron/main.cjs` | BrowserWindow、preload、IPC handler 注册、`--uninstall` 入口、单实例锁、崩溃日志 | installer |
| `electron/preload.cjs` | contextBridge 暴露 `window.minesweeperAPI`（最小 API 面） | 无 |
| `electron/installer-runner.cjs` | 真实 fs/注册表/快捷方式副作用执行（薄胶水，无业务决策） | installer |
| `electron/log.cjs` | 按日轮转日志（%LOCALAPPDATA%\Minesweeper\logs\） | 无 |

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

### 4.2 防猜测重排（标准模式）
- 固定首点及其 3×3 邻域为雷区外（空区扩散前提）
- 在其余格子均匀随机布雷（Fisher–Yates 抽取雷位）
- `isSolvable(首点展开后局面)` → 不通过则重排，最多 **最大重置轮数**（默认 20，可配置 1~200）
- 提前终止：若 `mines / (rows*cols) > 0.5` 直接关闭不尝试

### 4.2b 防猜测高级模式（局部重排）
- 推导至不动点时，未判定格组成的 8-连通簇即"猜测区域"；取**最小簇**优先处理
- **区域重排**：簇外雷全部固定，仅簇内重新随机分布（簇雷数不变，rng 可注入）；
  次数上限 = 区域重排次数（默认 20，可配置 1~200）
- **减雷移雷**：区域重排耗尽仍不可解 → 簇内减 1 雷移至正常区域（候选位置逐个验证，
  移动后正常区域不新增猜测才接受）；移动后继续区域重排循环，簇雷数递减
- **终止**：可解 → 成功；簇雷数 0 / 无有效候选 / 内部预算封顶 → 失败
- **回退**：高级失败 → game.js 回退标准整盘重排 → 标准也失败 → 关闭防猜测+横幅
- 与标准模式一致的不变式：雷总数不变、首点 3×3 无雷、ok 时必可无猜解
- 算法细节与边界条件见 detailed-design §3

### 4.3 棋盘渲染缩放
- 棋盘像素尺寸 = `cols*cellSize × rows*cellSize`，cellSize ∈ [16,48]
- 窗口 resize：按可用区与棋盘宽高比取 `floor(min(w/cols, h/rows))` 再夹到 [16,48]
- 拖拽缩放手柄：实时改 cellSize，夹到 [16,48]

### 4.4 排行榜
- localStorage key：`minesweeper.leaderboard.v1`
- 结构：`{ beginner: { antiGuess: {on:[…], off:[…]}, noAntiGuess: …}, … }`（详见 detailed-design）
- 每组至多 10 条，按 timeMs 升序

### 4.5 安装/卸载（应用内管理器）
- 分发：免安装绿色版（`build.win.target: ["dir","zip"]`）
- 安装 = 复制自身文件树（跳过清单文件）+ 写 `install-manifest.json` + 注册表卸载项 +
  快捷方式（桌面/开始菜单按向导勾选）
- 卸载 = 读清单（支持注册表失效重定位）→ 扫描磁盘树比对 → 清单式删除 +
  清单外文件跳过提示 + 删除失败归类继续 → 清理注册表/快捷方式 → 自身占用文件用
  临时 .bat 延迟清理
- 决策（清单/比对/分类）在 `core/installer.js` 纯逻辑可单测；副作用在
  `installer-runner.cjs` 薄胶水执行；错误全中文分类（见 detailed-design §8）

## 5. 依赖与工具
- 运行时：`electron`（唯一运行时依赖；注册表/快捷方式用系统自带 reg.exe / PowerShell）
- 开发：`vitest`（测试）、`electron-builder`（打包绿色版 dir/zip）
- 模块类型：ESM（`"type": "module"`）；Electron 主进程使用 CommonJS（.cjs）

## 6. 风险与备选
| 风险 | 应对 |
|---|---|
| 求解器对极限局面误判 | NSS+SNS 组合 + 重排上限兜底，不会产生错误棋盘 |
| 高密度下防猜测频繁重排慢 | 密度>50% 提前短路；重排上限兜底；高级模式加 deduce 总调用预算（400）封顶 |
| 高级模式最坏情况耗时 | 每轮区域重排/候选验证均为整盘推导；预算封顶（约 4~20s 最坏，多数布局首轮即成功）；v1 不做局部重推优化 |
| electron-builder 下载网络不稳定 | 打包作为独立任务，失败不阻塞功能交付；必要时换镜像 |
| localStorage 在渲染进程差异 | 用标准 Web Storage API，Vitest 用 stub 模拟 |
| 卸载误删/漏删 | 清单式删除 + 清单外文件保留提示 + 删除失败归类继续 + 卸载后汇总报告 |
| 移动安装目录后崩溃 | 全部路径运行时从 process.execPath 解析、不缓存绝对路径；清单同目录；注册表失效自动重定位；异常中文报错 + 日志 |
| CSP 限制美化手段 | 系统字体栈 + 纯 CSS（阴影/渐变/transition），零外部资源 |
