# 任务进度 progress.md

> 全流程唯一进度源。主 agent 负责维护；subagent 完成一个任务后更新。
> 状态：⬜ 未开始 / 🟨 进行中 / ✅ 完成 / ❌ 阻塞

## 依赖图（v1 + v2）
```
v1:  T6 ───────────┐
     T1 ──▶ T2 ──▶ T3 ──▶ T5
     T4 ─────────────────▶ T5
v2:  T0b 文档链+测试（主 agent）
     Wave A（并行）: T7 settings ──▶ ┐
                     T8 installer ──▶ ├─▶ T12 renderer（依赖 T7+T10+T11）
                     T9 solve 重构 ──▶│
     Wave B（并行）: T10 game（依赖 T9）┘
                     T11 electron 壳（依赖 T8）──▶ T12
     Wave D: T13 打包 + 全量验证 + README + AGENTS.md
```

## 任务清单

| 任务 | 内容 | 依赖 | 状态 | 测试命令 | 备注 |
|---|---|---|---|---|---|
| T1 | core/board.js 棋盘模型 | 无 | ✅ | `npx vitest run tests/board.test.js tests/modes.test.js` | v1 Wave A |
| T4 | core/leaderboard.js 排行榜 | 无 | ✅ | `npx vitest run tests/leaderboard.test.js` | v1 Wave A |
| T6 | electron 壳 + package.json + index.html + css | 无 | ✅ | vitest 可启动 / node --check | v1 Wave A |
| T2 | core/solve.js 可解性+防猜测 | T1 | ✅ | `npx vitest run tests/solve.test.js tests/solve.retries.test.js` | v1 Wave B |
| T3 | core/game.js 状态机+计时 | T1+T2 | ✅ | `npx vitest run tests/game.test.js` | v1 Wave B |
| T5 | renderer（render/ui/main） | T1-T3+T6 | ✅ | `npx vitest run tests/ui.test.js tests/render.test.js` | v1 Wave C |
| T0 | tests/ 全套测试（主 agent 先写） | 无 | ✅ | `npm test` | v1 先行完成 |
| T0b | **v2 文档链 + 5 个严格测试文件** | 无 | 🟨 | `npm test`（旧 111 全绿；新测试预期红=未实现） | v2 先行 |
| T7 | core/settings.js 设置持久化 | 无 | ✅ | `npx vitest run tests/settings.test.js` | v2 Wave A，14/14 |
| T8 | core/installer.js 安装/卸载纯逻辑 | 无 | ✅ | `npx vitest run tests/installer.test.js` | v2 Wave A，43/43（含主 agent 修正测试假数据 1 处） |
| T9 | solve.js 重构 deduce + 高级局部重排 | T1+T2 | ✅ | `npx vitest run tests/solve.test.js tests/solve.retries.test.js tests/solve.advanced.test.js` | v2 Wave A，24/24（主 agent 补候选循环预算检查） |
| T10 | core/game.js 防猜测配置集成+回退 | T9 | ⬜ | `npx vitest run tests/game.test.js tests/game.advanced.test.js` | v2 Wave B |
| T11 | electron 主进程（preload/IPC/runner/log + 冒烟更新） | T8 | ⬜ | node --check + 冒烟 | v2 Wave B |
| T12 | renderer 侧栏+面板+安装向导+美化 | T7+T10+T11 | ⬜ | `npx vitest run tests/ui.test.js tests/ui.sidebar.test.js` + 冒烟 | v2 Wave C |
| T13 | 打包 dir/zip + 全量验证 + README + AGENTS.md | 全部 | ✅ | `npm test` 205/205 + 冒烟 + `npm run dist` + E2E 20/20 | v2 Wave D |

## 运行日志
- 2026-08-03 需求确认完成（4 轮提问，12 项决策）。
- 2026-08-03 proposal / high-level-design / detailed-design 已提交。
- 2026-08-03 git 初始化并 push 到 gitee 成功。
- 2026-08-03 T0 测试套件已编写并提交（8 个测试文件，约 130 用例）。
- 2026-08-03 T6 Electron 壳 + 依赖安装完成（Electron 33.4.11，经 npmmirror 镜像）。
- 2026-08-03 T4 core/leaderboard.js 已实现并通过（13/13）。
- 2026-08-03 T1 core/modes.js + core/board.js 已实现并通过（48/48）。
- 2026-08-03 主 agent 审阅修复 chordRight 旗数重复计数缺陷，补 2 条测试，共 61/61 绿。
- 2026-08-03 T2 core/solve.js 可解性算法（NSS+SNS）与防猜测重排完成（12/12 绿）。
- 2026-08-03 T3 core/game.js 状态机+计时+防猜测调度完成（16/16 绿）。
- 2026-08-03 T5 renderer 渲染/UI/装配完成，全量 `npm test` 111/111 绿。
- 2026-08-03 README 已编写提交。
- 2026-08-03 electron 冒烟：页面加载成功、无渲染崩溃、无 JS 错误、画布与 UI 正常（CSP 警告已修复）。
- 2026-08-03 `npm run dist` 打包成功：`dist/Minesweeper Setup 1.0.0.exe`（NSIS，78MB）+ `dist/win-unpacked/Minesweeper.exe`。
- 2026-08-03 打包备注：需 ELECTRON_MIRROR / ELECTRON_BUILDER_BINARIES_MIRROR 镜像；signAndEditExecutable=false 避开 winCodeSign 符号链接权限问题。
- 2026-08-03 全部任务完成，待最终推送。
- 2026-08-04 **v2 需求确认完成**（2 轮提问，8 项决策）：应用内安装/卸载管理器、D:\Minesweeper 默认路径、清单式删除、不复现崩溃走鲁棒性防御、歧义连通簇、回退标准、侧栏划分、主页面板+美化。
- 2026-08-04 v2 文档链更新：proposal（FR9/FR10/FR11 + 决策记录）、high-level-design、detailed-design（§3 deduce/高级算法、§4 game v2、§5b settings、§5c installer、§6 侧栏 DOM、§7 IPC）、任务文件 t7~t13。
- 2026-08-04 T0b 编写 5 个严格测试文件（settings/solve.advanced/game.advanced/installer/ui.sidebar），旧 111 用例保持全绿基线。
- 2026-08-04 Wave A 完成：T7 settings.js（14/14）、T8 installer.js（43/43）、T9 solve.js deduce+高级模式（24/24）。
  主 agent 审阅：修正 installer.test.js 假数据缺源文件 1 处（T8 报告阻塞）；solve.js 补候选循环预算检查（契约偏差）。
- 2026-08-04 Wave B 完成：T10 game.js 防猜测配置集成+回退（game 16/16 原样 + advanced 9/9）、T11 electron 主进程
  （preload/IPC/installer-runner/log/--uninstall/冒烟，node --check 6/6，冒烟 hasAPI=true）。
- 2026-08-04 Wave C 完成：T12 renderer 侧栏+主页面板+安装向导+美化（ui 16/16 原样 + sidebar 15/15），全量 204/204 绿。
- 2026-08-04 Wave D（T13）完成：
  - 打包改绿色版 `build.win.target=["dir","zip"]`（win-unpacked + zip，无 NSIS）
  - 主 agent 集成审查修复 3 处真实缺陷：
    1) 打包安装源：原实现只复制 asar 内源码 → 改为打包形态复制**完整运行时目录**（exe/dll/resources/locales），
       快捷方式/注册表指向安装副本（fs-utils enumSourceTree 增加 fullTree/excludes 模式）
    2) Electron asar 补丁 fs 无法复制以 `.asar` 结尾的源文件（app.asar 报 ENOENT "not found in ..."）→
       runner/fs-utils 改用 `original-fs`（未补丁原生 fs）
    3) 卸载残留 install-manifest.json（清单不列出自身 → 被当清单外保留 → 根目录永不空）→
       planUninstall 将清单自身纳入删除且不报清单外（新增 1 测试，全量 205/205 绿）
  - 静默卸载退出优化：--uninstall 完成后清理子进程（getAppMetrics）+ app.exit(0)，
    避免 GPU/utility 子进程锁住安装目录导致延迟清理慢（实测目录删除从 ~100s 降到 ~29s）
  - **端到端验收 20/20 通过**（scripts/installer-e2e.cjs，CDP 驱动打包版真实安装/移动/卸载）：
    安装完整运行时+注册表+快捷方式 ✓ / 移动目录后运行+静默卸载 ✓ / 延迟清理删除 ✓ /
    外来文件保留+根目录 BUSY 具体原因 ✓ / 旧残留检测 ✓
  - README、AGENTS.md 已按 v2 收尾更新（结构/接口速查/命令/测试约定）
