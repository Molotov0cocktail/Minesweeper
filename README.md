# 扫雷 Minesweeper（Electron）

基于 Electron 的经典扫雷桌面程序，支持自定义棋盘、拖动缩放、防猜测模式、三种标准模式排行榜。

## 功能特性

- **三种标准模式**：初级 9×9 / 10 雷，中级 16×16 / 40 雷，高级 16×30 / 99 雷
- **自定义模式**：行/列 5~60，雷数 1 到 `min(⌊总数×0.8⌋, 总数−9)`
- **拖动缩放显示**：拖动棋盘右下角缩放手柄，格子大小在 16~48px 间连续缩放；窗口缩放时棋盘自动等比适配
- **经典交互**：
  - 左键点击未开格 → 翻开（首次点击必安全，并自动扩散空区）
  - 右键点击未开格 → 三段循环标记 旗 → 问号 → 无
  - 左键点击已开数字格 → 若数字 == 相邻旗数，翻开周围所有未标旗格子（chord）
  - 右键点击已开数字格 → 若数字 == 周围未翻开格数，把周围未翻开格全部标旗（镜像 chord）
- **防猜测模式**（默认开启）：首次点击后检测整局是否可无猜逻辑推导；若需猜测则整体重排雷布局（保持行列/雷数/首点安全），最多重排 20 次；当雷密度超过 50% 或重排 20 次仍不可解时自动关闭并横幅提醒
- **计时与暂停**：正向累加计时（非倒计时），暂停时遮罩屏幕、冻结计时
- **排行榜**：三种标准模式各分「防猜测开 / 关」两组，共 6 组；每组记录前十名昵称与用时（按用时升序）；胜利后输入昵称，成绩按"实际是否无猜"归组；数据存 localStorage；自定义模式不计入排行榜
- **中文界面**、经典 Windows 扫雷 3D 浮雕视觉风格

## 环境要求

- Node.js ≥ 18（开发机）
- Windows（打包目标为 win32/x64；源码理论可在 macOS/Linux 运行，未验证）

## 安装与运行

```bash
npm install        # 若 Electron 二进制下载失败：
                   # ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install --registry=https://registry.npmmirror.com

npm start          # 启动桌面程序
```

## 测试

```bash
npm test           # 运行全部 Vitest 单测（核心逻辑 + UI/DOM 层）
npm run test:watch # 监听模式
```

测试采用"测试先行"：所有行为契约先写成 `tests/`，再逐个实现。覆盖棋盘模型、可解性算法、
防猜测重排、游戏状态机/计时、排行榜存取、UI 控件与画布绘制。

## 打包

```bash
npm run dist       # electron-builder 生成 Windows 安装包（NSIS）到 dist/
```

> 中国大陆网络下需走镜像（Electron 与 NSIS 二进制均从 GitHub 下载，直连易超时）：
> ```bash
> export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
> export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
> npm run dist
> ```
> 本机未配置代码签名，构建已配置 `win.signAndEditExecutable: false`（跳过签名与资源编辑，
> 可避免 Windows 无符号链接权限导致的 winCodeSign 解压失败），产物为未签名安装包。
> 产出：`dist/Minesweeper Setup <版本>.exe`（NSIS 安装包）与 `dist/win-unpacked/Minesweeper.exe`（免安装）。

## 操作说明

| 操作 | 效果 |
|---|---|
| 左键 · 未开格 | 翻开（首点安全 + 空区扩散） |
| 左键 · 已开数字格 | chord：旗数==数字时翻开剩余未标旗邻居 |
| 右键 · 未开格 | 循环标记 旗→问号→无（旗数上限=总雷数） |
| 右键 · 已开数字格 | 镜像 chord：未翻开数==数字时批量标旗 |
| 拖动右下角手柄 | 缩放显示（格子 16~48px） |
| 窗口缩放 | 棋盘等比自适应 |
| 暂停 / 继续 | 暂停计时并遮罩屏幕 |
| 重新开始 | 按当前模式/防猜测开关重开一局 |
| 胜利 | 输入昵称 → 若进前十写入对应组排行榜 |

## 项目结构

```
├── electron/          # Electron 主进程
├── src/
│   ├── core/          # 纯 JS 核心逻辑（可独立单测）
│   │   ├── board.js       # 棋盘模型：布雷/翻开/chord/标记/胜负
│   │   ├── solve.js       # 可解性判定（NSS+SNS 子集推理）+ 防猜测重排
│   │   ├── game.js        # 游戏状态机 + 正向计时 + 暂停
│   │   ├── modes.js       # 模式预设 + 自定义参数校验
│   │   └── leaderboard.js # localStorage 排行榜（top-10 × 模式 × 防猜测）
│   └── renderer/      # 渲染与交互层
│       ├── render.js      # Canvas 经典 3D 风绘制
│       ├── ui.js          # DOM 控件/弹窗/横幅
│       └── main.js        # 事件装配/缩放/resize
├── styles/main.css    # 经典扫雷风格样式
├── tests/             # Vitest 测试（先行编写）
├── index.html
└── doc/               # 需求/设计/任务文档（vibe-coding 工作流产物）
```

## 设计取舍说明

- **可解性算法**：采用"前沿单格约束（NSS）+ 两集子集排除（SNS）"迭代推理。这是充分条件启发式——
  判为"可解"则必然可无猜解开；个别需更复杂推理的极限局面可能被判为"需猜测"而触发重排，
  不会产生错误棋盘。
- **防猜测关闭**：雷密度 >50% 或重排 20 次仍不可解时，该局按普通扫雷继续（保留首点安全），
  顶部横幅提醒。被强制关闭的对局成绩计入"防猜测关"榜单。

## 致谢

项目按文档驱动 vibe-coding 工作流开发：需求提案 → 高层/详细设计 → 任务拆分 →
subagent 分模块实现 → 测试驱动验证 → 集成与打包。详见 `doc/`。
