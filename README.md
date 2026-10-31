# 扫雷 Minesweeper（Electron）

当前版本 **1.3.0**。本次升级修复开局标记误启动、暂停重开遮罩、换难度尺寸不适配和损坏榜单崩溃；增加键盘玩法、失焦自动暂停、对局进度与高分屏清晰绘制，并取消计时器对整盘的重复重画。

[下载 Windows 安装器](https://gitee.com/Molotov0coaktail/minesweeper/releases/download/v1.3.0/MinesweeperSetup-1.3.0-win.exe)（70.9 MB）。2026-10-31 已发布；312 项测试、普通与2倍缩放冒烟、32项真实安装/卸载验收通过，公开附件已下载校验一致。

键盘：先用 Tab 或鼠标聚焦棋盘，方向键移动，Enter / 空格翻开（数字格 chord），F 标记（数字格镜像 chord）；P 暂停/继续，F2 重开。输入框和昵称弹窗内保留正常输入。切出窗口会暂停，返回后手动继续。

界面保留经典灰色浮雕棋盘，新增难度与规格、状态、已翻安全格进度、操作说明；昵称弹窗支持 Enter 提交、Escape 取消和焦点限制。设置和历史成绩沿用原存储键。

基于 Electron 的经典扫雷桌面程序，支持自定义棋盘、拖动缩放、可配置防猜测模式（标准/高级）、
三种标准模式排行榜。安装/卸载由**独立便携安装器 MinesweeperSetup** 负责（游戏程序本体已剥离安装功能）。

## 功能特性

- **三种标准模式**：初级 9×9 / 10 雷，中级 16×16 / 40 雷，高级 16×30 / 99 雷
- **自定义模式**：行/列 5~60，雷数 1 到 `min(⌊总数×0.8⌋, 总数−9)`
- **左侧侧栏**：左上角汉堡按钮展开/收起；侧栏含等级选择、自定义行列雷数、防猜测设置、
  排行榜入口；展开时棋盘自动缩放适配
- **拖动缩放显示**：拖动棋盘右下角缩放手柄，格子大小在 16~48px 间连续缩放；窗口缩放时棋盘自动等比适配
- **经典交互**：
  - 左键点击未开格 → 翻开（首次点击必安全，并自动扩散空区）
  - 右键点击未开格 → 三段循环标记 旗 → 问号 → 无
  - 左键点击已开数字格 → 若数字 == 相邻旗数，翻开周围所有未标旗格子（chord）
  - 右键点击已开数字格 → 若数字 == 周围未翻开格数，把周围未翻开格全部标旗（镜像 chord）
- **防猜测模式**（默认开启，设置持久化）：首次点击后检测整局是否可无猜逻辑推导；若需猜测：
  - **标准方式（整盘重排）**：整体重排雷布局（保持行列/雷数/首点安全），最多重排「最大重置轮数」次（默认 20，可调 1~200）
  - **高级方式（局部重排）**：只处理"猜测区域"——检测最小歧义连通簇 → 簇外雷不动、簇内重排
    （次数可调）→ 仍不可解则簇内减 1 雷移至正常区域（候选位置验证不引起新猜测）→ 循环；
    高级失败自动回退标准方式
  - 当雷密度超过 50% 或重排耗尽仍不可解时自动关闭并横幅提醒（显示具体原因）
- **计时与暂停**：正向累加计时（非倒计时），暂停时遮罩屏幕、冻结计时
- **排行榜**：三种标准模式各分「防猜测开 / 关」两组，共 6 组；每组记录前十名昵称与用时（按用时升序）；
  侧栏「排行榜」按钮在主页展示榜单；胜利后输入昵称，成绩按"实际是否无猜"归组；数据存 localStorage；
  自定义模式不计入排行榜
- **独立便携安装器 MinesweeperSetup**（v1.3.0，单文件 exe，游戏程序不含任何安装代码）：
  - 双击未安装 → 安装向导：选择安装地址（默认 `D:\Minesweeper`，无 D 盘回退其他盘）、
    勾选桌面/开始菜单快捷方式 → 确认后复制完整运行时（setup exe 重命名为 `Minesweeper.exe`，
    内嵌游戏文件映射为 `resources/app/`）+ 写卸载注册表项 + 创建快捷方式
  - 双击已安装 → **卸载确认**：清单式删除——只删安装清单内文件与自建目录，
    清单外文件（用户后放入）保留并提示；删除失败报具体中文原因并继续；结束后汇总报告
  - **零痕迹**：setup 自身不写注册表/AppData/快捷方式，userData 与日志全部落在 %TEMP%
    （便携解压目录退出自动删除）——删除 setup exe 即无任何印记
  - **移动安装目录不崩溃**：游戏运行时路径动态解析；启动时自愈注册表 `InstallLocation`，
    移动目录后 setup 仍能定位卸载；日志写入 `%LOCALAPPDATA%\Minesweeper\logs\`（按日轮转）
  - 卸载入口：setup 双击（卸载确认）+ Windows 控制面板"卸载程序"
    （注册表 UninstallString 指向 setup exe `--uninstall` 静默执行）
  - 旧版残留（旧 NSIS 安装目录/快捷方式/注册表项）自动检测、可一键清理
- **中文界面**、经典 Windows 扫雷 3D 浮雕视觉风格（侧栏/面板/安装向导经美化升级）

## 环境要求

- Node.js ≥ 18（开发机）
- Windows（打包目标为 win32/x64；源码理论可在 macOS/Linux 运行，未验证）

## 安装与运行

```bash
npm install        # 若 Electron 二进制下载失败：
                   # ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install --registry=https://registry.npmmirror.com

npm start          # 启动桌面程序（开发态；本机若预设 ELECTRON_RUN_AS_NODE=1 需先 unset）
```

## 测试

```bash
npm test           # 运行全部 Vitest 单测（核心逻辑 + UI/DOM 层）
npm run test:watch # 监听模式
# 集成冒烟：unset ELECTRON_RUN_AS_NODE && npx electron scripts/smoke.cjs
```

测试采用"测试先行"：所有行为契约先写成 `tests/`，再逐个实现。覆盖棋盘模型、可解性算法、
防猜测重排（标准/高级）、游戏状态机/计时、排行榜存取、设置持久化、安装清单/卸载计划/错误分类、
setup 安装向导 UI、游戏 UI 控件与画布绘制（现有 312 用例，含装配与冒烟失败门禁）。

## 打包（独立便携安装器）

```bash
npm run dist       # 生成 dist/MinesweeperSetup-<版本>-win.exe（唯一产物，便携单文件）
```

> 中国大陆网络下需走镜像（Electron 与 electron-builder 二进制均从 GitHub 下载，直连易超时）：
> ```bash
> export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
> export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
> npm run dist
> ```
> 本机未配置代码签名，构建已配置 `win.signAndEditExecutable: false`。
> 流水线（`scripts/build-dist.cjs`）：清理 dist/.build → staging 剥离版游戏文件
> （`src/core/installer.js` 与 setup 侧 electron 文件不进游戏包，自动校验）→
> electron-builder portable（NSIS 压缩，约 70MB）→ 清理辅助产物、校验 dist 唯一产物。
> **使用方式**：把 `MinesweeperSetup-1.3.0-win.exe` 发给用户，双击即用——
> 未安装走安装向导；已安装显示卸载确认。setup 自身不留任何印记（删掉 exe 即清理完毕）。

## 安装与卸载入口

| 操作 | 效果 |
|---|---|
| 双击 `MinesweeperSetup-*.exe`（未安装） | 安装向导：选择安装地址、快捷方式选项 → 安装 → 报告 |
| 双击 `MinesweeperSetup-*.exe`（已安装） | 卸载确认界面（显示目录/版本）→ 清单式卸载 → 报告 |
| 控制面板「卸载程序」 | 静默卸载（setup exe `--uninstall`） |

## 操作说明

| 操作 | 效果 |
|---|---|
| 左上角 ☰ | 展开/收起左侧侧栏（等级/自定义/防猜测/排行榜） |
| 左键 · 未开格 | 翻开（首点安全 + 空区扩散） |
| 左键 · 已开数字格 | chord：旗数==数字时翻开剩余未标旗邻居 |
| 右键 · 未开格 | 循环标记 旗→问号→无（旗数上限=总雷数） |
| 右键 · 已开数字格 | 镜像 chord：未翻开数==数字时批量标旗 |
| 拖动右下角手柄 | 缩放显示（格子 16~48px） |
| 窗口缩放 | 棋盘等比自适应 |
| 暂停 / 继续 | 暂停计时并遮罩屏幕 |
| 重新开始 | 按当前模式/防猜测设置重开一局 |
| 胜利 | 输入昵称 → 若进前十写入对应组排行榜 |

## 项目结构

```
├── electron/          # Electron 主进程（双应用分派）
│   ├── main.cjs           # IS_SETUP 分派；游戏侧：窗口/IPC(app:get-version)/单实例锁/
│   │                      #   崩溃日志 + 打包态 InstallLocation 自愈
│   ├── setup.cjs          # 安装器主进程：窗口 + CLI（--uninstall/--install-dir/--no-*-shortcut）
│   │                      #   + installer IPC 6 通道；userData/日志重定向 %TEMP%（零痕迹）
│   ├── preload.cjs        # 游戏侧 API（仅 app.getVersion）
│   ├── preload-setup.cjs  # 安装器侧 API（app.getVersion + installer 6 方法 + 进度）
│   ├── installer-runner.cjs # 安装/卸载真实副作用执行（fs/注册表/快捷方式，薄胶水）
│   ├── fs-utils.cjs       # 源树枚举/目标树扫描/递归删除
│   └── log.cjs            # 按日轮转日志（dir 可覆盖：游戏 %LOCALAPPDATA%，setup %TEMP%）
├── setup/              # 安装器渲染层
│   ├── index.html         # 安装向导/卸载确认页面（CSP 同游戏）
│   ├── ui.js              # createSetupUI/startSetupApp（向导 5 步 + 卸载确认 + legacy 清理）
│   └── wizard.css         # 向导样式（自 styles/main.css 迁移）
├── src/
│   ├── core/          # 纯 JS 核心逻辑（可独立单测）
│   │   ├── board.js       # 棋盘模型：布雷/翻开/chord/标记/胜负
│   │   ├── solve.js       # 可解性判定（deduce）+ 防猜测重排（标准/高级局部重排）
│   │   ├── game.js        # 游戏状态机 + 正向计时 + 暂停 + 防猜测调度/回退
│   │   ├── modes.js       # 模式预设 + 自定义参数校验
│   │   ├── leaderboard.js # localStorage 排行榜（top-10 × 模式 × 防猜测）
│   │   ├── settings.js    # 防猜测设置持久化（损坏/越界自动回退默认）
│   │   └── installer.js   # 安装清单/卸载计划/错误分类/路径重定位/映射（纯逻辑零副作用，
│   │                      #   仅安装器打包，游戏不含）
│   └── renderer/      # 渲染与交互层（无任何安装相关代码）
│       ├── render.js      # Canvas 经典 3D 风绘制
│       ├── ui.js          # 顶栏/侧栏/主页面板/弹窗/横幅
│       └── main.js        # 事件装配/缩放/resize/设置持久化接线
├── styles/main.css    # 经典扫雷风格样式（侧栏/面板美化）
├── scripts/
│   ├── smoke.cjs          # 冒烟诊断（含深断言：无 installer 面）
│   ├── build-dist.cjs     # 打包流水线（清理→staging→portable→校验）
│   ├── setup-builder.yml  # 安装器构建配置（electron-builder portable）
│   └── installer-e2e.cjs  # 端到端验收（静默安装/冒烟副本/移动自愈/卸载/GUI 卸载）
├── tests/             # Vitest 测试（先行编写，含 setup.ui.test.js）
├── index.html
└── doc/               # 需求/设计/任务文档（vibe-coding 工作流产物）
```

## 设计取舍说明

- **可解性算法**：采用"前沿单格约束（NSS）+ 两集子集排除（SNS）"迭代推理。这是充分条件启发式——
  判为"可解"则必然可无猜解开；个别需更复杂推理的极限局面可能被判为"需猜测"而触发重排，
  不会产生错误棋盘。`deduce` 同时暴露不动点状态（未知格/连通簇），供高级局部重排使用。
- **高级防猜测**：只调整猜测区域的雷（簇外雷固定），避免整盘重排；每次减雷移至正常区域时
  验证不引入新猜测；全局 deduce 预算封顶保证最坏情况耗时可控；失败自动回退标准方式。
- **防猜测关闭**：雷密度 >50% 或重排耗尽仍不可解时，该局按普通扫雷继续（保留首点安全），
  横幅提醒具体原因。被强制关闭的对局成绩计入"防猜测关"榜单。
- **独立安装器**：安装 = 复制 setup 自身完整运行时（排除自身 app.asar；setup exe 重命名
  `Minesweeper.exe`）+ 内嵌游戏目录映射为 `resources/app/` + 写安装清单（安装后相对路径）+
  注册表卸载项（UninstallString 指向 setup 磁盘 exe `--uninstall`、InstallLocation）+ 快捷方式；
  卸载 = 清单式删除（只删清单内文件，外来文件保留并提示；失败分类报错继续）+ 占用文件
  延迟清理脚本重试删除；重定位链 = 自身目录 → 注册表 InstallLocation → UninstallString 目录；
  游戏启动自愈 InstallLocation（移动目录后仍可卸载）；setup 零痕迹（userData/日志全在
  %TEMP%，便携解压目录退出自动删除）。

## 致谢

项目按文档驱动 vibe-coding 工作流开发：需求提案 → 高层/详细设计 → 任务拆分 →
subagent 分模块实现 → 测试驱动验证 → 集成与打包。详见 `doc/`。
