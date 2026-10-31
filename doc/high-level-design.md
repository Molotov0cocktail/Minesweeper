# 高层设计 high-level-design.md

## v1.5.1 图标架构

renderer/mine-glyph.js为无DOM的Canvas矢量图元，render.js仅在可见雷格调用。assets/icon.svg为应用图标源；scripts/generate-icons.cjs用项目Electron/Chromium渲染各尺寸PNG并封装ICO，结果作为必要应用资源入库。scripts/icon-resources.cjs以固定resedit版本纯JS替换PE图标并保留其他资源；afterPack钩子编辑本次打包副本，win.icon配置portable图标。assets进入setup白名单与剥离游戏staging，游戏/setup窗口显式使用PNG。不涉及游戏状态/存档/手柄逻辑。


## v1.5.0 架构增量

core/gamepad提供默认键位、严格校验与交换重映射；settings新增gamepadBindings/focusView并深复制。轮询层从getBindings动态读取，改变后重置中立锁。renderer/controller-ui.js封装控件焦点导航/数值及选项调整；ui.js决定当前作用域（模态/页面/排行榜/侧栏），主装配先委托UI，未消费的动作才操作棋盘。说明和键位页与棋盘互斥；专注视图由CSS+UI状态管理，main负责持久化/适配。保持Worker和求解接口不变。


## v1.4.0 架构增量

core/gamepad.js为纯输入状态机，renderer/gamepad.js负责RAF轮询与清理；main将语义动作路由至现有game动作/模态确认。renderer/generation-client.js管理可取消的Worker请求/8秒超时，generation-worker.js调用原纯求解器并统一标准/高级回退结果。game通过opts.prepareBoard注入Promise生成器，保留未注入时原同步API；GENERATING状态及世代令牌守卫异步结果，零DOM/Worker依赖。main新局/销毁取消Worker和旧Game。UI显示手柄状态与生成状态。


## v1.3.0 升级架构（2026-10-31）

沿用 core / renderer / Electron 双应用结构。board 统一拦截非法坐标；game 在首点布雷前检查格状态；leaderboard 在数据边界清洗及复制。renderer UI 管显示状态与弹窗焦点；main 导出可清理的 startApp，负责键盘、失焦暂停、DPR 画布和事件驱动重绘。计时刷新与棋盘绘制分离。无新增运行时依赖，不变更持久化键及安装流程。


> 依据 doc/proposal.md。本文件描述架构、模块划分、数据流与主要权衡。

## 1. 总体架构

**v3 起为双应用架构**（一个仓库、一个 package.json）：游戏程序（剥离安装功能）与
独立安装器 MinesweeperSetup（便携 exe，内含游戏文件）。主进程共用入口
`electron/main.cjs`，顶部 IS_SETUP 检测（resources 下存在 `game-app` 目录或环境变量
`MINESWEEPER_SETUP=1`）→ `require('./setup.cjs'); return` 分派到安装器侧。

```
┌─ 游戏程序（安装产物：目标目录 resources/app/，unpacked）─────────────┐
│  Electron 主进程  electron/                                          │
│   · main.cjs            窗口 + IPC（仅 app:get-version）+ 单实例锁    │
│                         + crash 日志 + 打包态 InstallLocation 自愈    │
│   · preload.cjs         仅 app.getVersion                            │
│   · log.cjs             %LOCALAPPDATA% 日志（按日轮转）              │
│  渲染进程  src/renderer/（ui.js 无任何安装相关 DOM）                  │
│  核心逻辑  src/core/（modes/board/solve/game/leaderboard/settings）   │
└──────────────────────────────────────────────────────────────────────┘

┌─ MinesweeperSetup（便携 exe，dist 唯一产物）─────────────────────────┐
│  app.asar = setup 代码                                               │
│   · electron/main.cjs（IS_SETUP 分派）+ setup.cjs（窗口/CLI/IPC）    │
│   · preload-setup.cjs（app.getVersion + installer 6 方法）           │
│   · installer-runner.cjs / fs-utils.cjs / log.cjs（薄胶水）          │
│   · src/core/installer.js（安装/卸载纯逻辑）                          │
│   · setup/（index.html + ui.js + wizard.css，向导/卸载界面）          │
│  resources/game-app/ = extraResources 内嵌的剥离版游戏文件            │
│  （安装时映射复制为 目标/resources/app/；卸载复用清单式删除）          │
└──────────────────────────────────────────────────────────────────────┘
```

**原则**：所有可测试的逻辑（布雷、邻居计数、空区扩散、chord、可解性算法、
防猜测重排、计时、状态机、排行榜、设置持久化、安装清单/错误分类）全部下沉到
`src/core/*.js` 纯模块；渲染层只负责画与转发事件；主进程只做真实文件系统/
注册表/快捷方式副作用（薄胶水）。这保证核心逻辑可在 Node 下用 Vitest 严格测试，
无需 Electron/浏览器环境。安装/卸载决策（清单、比对、错误归类）与副作用执行分离，
前者可注入式单测。setup 的 userData 与日志全部 `setPath`/落盘到 %TEMP%（便携解压
目录退出自动删除）——setup 自身零痕迹。

## 2. 模块职责

| 模块 | 职责 | 依赖 |
|---|---|---|
| `core/modes.js` | 模式预设（初/中/高级）、自定义参数校验 | 无 |
| `core/board.js` | 生成棋盘、首次点击后布雷、邻居雷数、翻开/空区扩散、标旗/问号循环、chord、镜像 chord、胜负判定 | modes |
| `core/solve.js` | `deduce` 逻辑推导（暴露不动点未知格/连通簇）；`isSolvable` 判定；标准防猜测整盘重排（≤maxAttempts）；高级局部重排（歧义簇重排+减雷移雷）；密度>50% 判定 | board |
| `core/game.js` | 游戏生命周期状态机（ready/playing/paused/won/lost）、正向计时、防猜测调度（标准/高级+回退）、胜利/失败结果回调 | board, solve |
| `core/leaderboard.js` | 按 (模式 × 防猜测) 分组的 top-10 榜单读写（localStorage）、排序、写入、查询 | 无 |
| `core/settings.js` | 防猜测等用户设置持久化（localStorage，损坏/越界自动回退默认） | 无 |
| `core/installer.js` | 安装清单构建/解析、卸载比对计划、错误分类（中文）、路径建议/校验/重定位、执行器（fsOps 注入）；v3 扩展 planInstall renames/relPrefix 与 relocateManifestDir InstallLocation | 无 |
| `renderer/render.js` | Canvas 经典 3D 风绘制（未开/翻开/旗/问号/数字/雷） | 无 |
| `renderer/ui.js` | 顶栏（汉堡/状态/暂停重开）、左侧栏（等级/自定义/防猜测设置/排行榜）、主页面板、昵称输入、提醒横幅（v3 无任何安装相关 DOM） | modes, leaderboard |
| `renderer/main.js` | 装配：事件→core 调用→重绘；缩放手柄拖动；窗口 resize 适配（含侧栏展开扣除宽度） | 全部 |
| `electron/main.cjs` | 双应用分派入口（IS_SETUP → setup.cjs）；游戏侧：BrowserWindow、app:get-version IPC、单实例锁、崩溃日志、打包态 InstallLocation 自愈 | 无 |
| `electron/preload.cjs` | contextBridge 暴露 `window.minesweeperAPI.app.getVersion`（游戏侧最小 API 面） | 无 |
| `electron/setup.cjs` | 安装器主进程：窗口 + CLI（--uninstall/--install-dir/--no-*-shortcut）+ installer IPC 6 通道 + runner 装配；userData/日志重定向 %TEMP% | installer-runner |
| `electron/preload-setup.cjs` | setup 侧 contextBridge：app.getVersion + installer 6 方法 + onProgress | 无 |
| `electron/installer-runner.cjs` | 真实 fs/注册表/快捷方式副作用执行（薄胶水，无业务决策）；v3 打包态安装=运行时复制+exe 重命名+game-app→resources/app 映射 | installer |
| `setup/ui.js` + `setup/index.html` + `setup/wizard.css` | 安装向导（welcome/dir/options/progress/report）+ 卸载确认界面 + legacy 清理；jsdom 可测 | 无 |
| `electron/log.cjs` | 按日轮转日志（游戏：%LOCALAPPDATA% 默认；setup：dir 覆盖到 %TEMP%） | 无 |

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

### 4.5 安装/卸载（v3 独立安装器 MinesweeperSetup）
- 分发：dist 仅产出**单个便携 exe** `MinesweeperSetup-<version>-win.exe`
  （electron-builder `portable` target，NSIS 压缩；每次运行解压到 %TEMP% 并退出自删）
- 双击语义：未安装 → 安装向导；已安装 → 卸载确认界面；`--uninstall` 静默卸载；
  `--install-dir <dir>` 静默安装（可附 `--no-desktop-shortcut`/`--no-startmenu-shortcut`）
- 安装 = 复制自身完整运行时（**排除** `resources/app.asar` 与 `resources/game-app/`，
  setup exe **重命名** `Minesweeper.exe`）+ 内嵌 `game-app` 文件**前缀映射**为
  `resources/app/`（Electron unpacked 应用目录）+ 写 `install-manifest.json`（安装后 rel）
  + 注册表卸载项（UninstallString=磁盘 setup exe `--uninstall`，经
  `PORTABLE_EXECUTABLE_FILE` 取真实路径；`InstallLocation`=目标目录；DisplayIcon=安装副本
  exe）+ 快捷方式（桌面/开始菜单按勾选，指向安装副本 exe）
- 卸载 = 读清单（重定位链：自身目录 → 注册表 `InstallLocation` → `UninstallString` 目录）
  → 扫描磁盘树比对 → 清单式删除 + 清单外文件跳过提示 + 删除失败归类继续 → 清理
  注册表/快捷方式 → 占用文件用临时 .bat 延迟清理
- **游戏剥离**：游戏程序无任何安装 UI/IPC/向导；仅打包态启动时自愈
  `InstallLocation`（自身目录有清单且注册表值不符 → reg.exe 更新），保持
  "移动目录后 setup 仍能卸载"的能力
- **零痕迹**：setup 的 userData/日志全部落 %TEMP%（便携解压目录退出自动删除）；
  不写自身注册表/AppData/快捷方式；删磁盘 exe 即无印记
- 决策（清单/比对/分类/映射/重定位）在 `core/installer.js` 纯逻辑可单测；副作用在
  `installer-runner.cjs` 薄胶水执行；错误全中文分类（见 detailed-design §8）

## 5. 依赖与工具
- 运行时：`electron`（唯一运行时依赖；注册表/快捷方式用系统自带 reg.exe / PowerShell）
- 开发：`vitest`（测试）、`electron-builder`（打包便携 exe，target=portable）
- 模块类型：ESM（`"type": "module"`）；Electron 主进程使用 CommonJS（.cjs）
- 打包流水线：`scripts/build-dist.cjs`（清理 → staging 剥离版游戏到 `.build/game-app/`
  → `electron-builder --config scripts/setup-builder.yml` → 产物校验）

## 6. 风险与备选
| 风险 | 应对 |
|---|---|
| 求解器对极限局面误判 | NSS+SNS 组合 + 重排上限兜底，不会产生错误棋盘 |
| 高密度下防猜测频繁重排慢 | 密度>50% 提前短路；重排上限兜底；高级模式加 deduce 总调用预算（400）封顶 |
| 高级模式最坏情况耗时 | 每轮区域重排/候选验证均为整盘推导；预算封顶（约 4~20s 最坏，多数布局首轮即成功）；v1 不做局部重推优化 |
| electron-builder 下载网络不稳定 | 打包作为独立任务，失败不阻塞功能交付；必要时换镜像 |
| localStorage 在渲染进程差异 | 用标准 Web Storage API，Vitest 用 stub 模拟 |
| 卸载误删/漏删 | 清单式删除 + 清单外文件保留提示 + 删除失败归类继续 + 卸载后汇总报告 |
| portable 解压 exe 与磁盘 exe 路径分离 | UninstallString/DisplayIcon 用 `process.env.PORTABLE_EXECUTABLE_FILE`（磁盘真实路径），E2E 断言兜底 |
| 移动安装目录后卸载定位 | 卸载重定位链含注册表 InstallLocation；游戏打包态启动自愈 InstallLocation；异常中文报错 + 日志 |
| 卸载重定位依赖注册表 | 移动目录且从未运行游戏 → setup 无法定位（限制如实文档化；游戏运行一次即自愈） |
| setup 运行时残留 | userData/日志重定向 %TEMP%；便携退出 RMDir 解压目录；异常退出仅留 %TEMP% 临时文件（可忽略） |
| CSP 限制美化手段 | 系统字体栈 + 纯 CSS（阴影/渐变/transition），零外部资源 |
