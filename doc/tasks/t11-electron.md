# 任务 T11：Electron 主进程（preload/IPC/installer-runner/log + 鲁棒性 + --uninstall）

## 目标
- `electron/preload.cjs`：contextBridge 暴露 `window.minesweeperAPI`（app.getVersion + installer 6 方法 + onProgress）。
- `electron/main.cjs`：preload 挂载、固定通道 IPC handler（senderFrame 校验 + 入参校验）、`--uninstall` 静默入口、单实例锁 + second-instance 转发、uncaughtException/unhandledRejection 日志、路径全动态解析。
- `electron/installer-runner.cjs`：fs 枚举/复制/删除、reg.exe、PowerShell 快捷方式、卸载自删 .bat 延迟清理（薄胶水，无业务决策）。
- `electron/log.cjs`：按日轮转日志（%LOCALAPPDATA%\Minesweeper\logs\）。
- `scripts/smoke.cjs` 更新：断言 `window.minesweeperAPI` 存在、`#sidebar-toggle` 存在、body 初始类。

## 输入文档
- `doc/proposal.md`（FR10）
- `doc/detailed-design.md` 第 5c 节（installer 逻辑接口）、第 7 节（Electron 壳/IPC/runner/log）
- `src/core/installer.js`（依赖 T8 产出）

## 待产出文件
- `electron/main.cjs`、`electron/preload.cjs`、`electron/installer-runner.cjs`、`electron/log.cjs`、`scripts/smoke.cjs`
- 可新增 `electron/fs-utils.cjs` 等辅助（如需要）

## 实现步骤
1. preload 按 detailed-design §7 API 面（可选链守卫由渲染层做）。
2. main.cjs：`webPreferences.preload`；`app.requestSingleInstanceLock()`；argv 含 `--uninstall` → 不建窗口直接卸载流程；IPC 白名单 + senderFrame 校验 + dir 绝对路径/防穿越校验（BAD_ARG）。
3. installer-runner.cjs：枚举源树（安装用）、扫描目标树（卸载用）、executeSteps 落地（fsOps 真实实现）、reg.exe（15s 超时）/PowerShell 快捷方式、自删 .bat 分离启动；每步日志 + 进度事件 `installer:progress`。
4. log.cjs：createLogger（dir 默认 %LOCALAPPDATA%\Minesweeper\logs\），行格式用 installer.js 的 formatLogLine，按日轮转清理 7 天前。
5. 卸载重定位：execPath 目录 → 注册表 UninstallString → null（对应 relocateManifestDir）。
6. smoke.cjs 追加断言（保留现有 SMOKE_RESULT 结构）。

## 测试与检查
- `node --check` 通过全部 .cjs 文件
- `unset ELECTRON_RUN_AS_NODE && npx electron scripts/smoke.cjs` 冒烟正常（SMOKE_RESULT 含新断言、rendererGone/failLoad null、consoleLines 空）
- 手动冒烟：`npm start` 启动正常（安装/卸载 UI 联调在 T12）

## 完成标准
- node --check 全过；冒烟全过
- 主进程业务决策 0 处（全部在 core/installer.js，经 T8 测试覆盖）
- 无 console.log 调试残留（正式日志除外）
