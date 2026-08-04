# 任务 T17：electron setup 主进程（setup.cjs + preload-setup.cjs + runner 适配 + IS_SETUP 分派）

## 目标
实现安装器主进程与双应用分派：main.cjs 顶部 IS_SETUP 检测 → require('./setup.cjs')；setup.cjs 提供窗口/CLI/IPC；installer-runner.cjs 适配打包态安装语义（运行时复制 + exe 重命名 + game-app 前缀映射 + InstallLocation 注册表值 + UninstallString 指向 setup 磁盘 exe）。

## 输入文档
- `doc/detailed-design.md` §7（main.cjs 分派、setup.cjs CLI 契约、preload 拆分、runner 打包态语义）
- `doc/proposal.md` FR10.2/FR10.3/FR10.5

## 待产出文件
- `electron/setup.cjs`（新建）
- `electron/preload-setup.cjs`（新建 = 现 preload.cjs 全文）
- `electron/installer-runner.cjs`（修改）
- `electron/main.cjs`（修改：仅加 IS_SETUP 分派，游戏侧剥离在 T18）

## 实现步骤
1. `main.cjs` 顶部（require 之后、一切逻辑之前）：
   `const isSetup = process.env.MINESWEEPER_SETUP === '1' || fs.existsSync(path.join(path.dirname(app.getAppPath()), 'game-app')); if (isSetup) { require('./setup.cjs'); return; }`
2. `setup.cjs`：
   - `app.setPath('userData', path.join(os.tmpdir(), 'MinesweeperSetup-userdata'))`；`createLogger({ dir: path.join(os.tmpdir(), 'MinesweeperSetup', 'logs') })`（零痕迹）
   - CLI 解析：`--uninstall`（静默卸载：不建窗口 → runner.uninstall() → 清理子进程 getAppMetrics → app.exit(0|1)）；`--install-dir <dir>`（静默安装，默认建两个快捷方式，`--no-desktop-shortcut`/`--no-startmenu-shortcut` 可关 → app.exit）；无参数 → GUI
   - GUI：`BrowserWindow({ width: 520, height: 480, autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: <preload-setup.cjs> } })` → loadFile `setup/index.html` → ready 后 getStatus() → installed ? 卸载视图 : 向导（状态推给渲染层）
   - IPC：`app:get-version` + `installer:get-status/suggest-dir/install/uninstall/clean-legacy`（senderFrame 校验 + install 入参校验从 v2 main.cjs 迁移；win32 绝对路径正则一致）+ `installer:progress` 事件
   - runner = createRunner({ logger, installerMod（动态 import ../src/core/installer.js）, getWindow }）；单实例锁
3. `installer-runner.cjs`：
   - 新增 `queryRegistryInstallLocation()`（reg.exe query InstallLocation，模式同 UninstallString）；`getStatus()` 的 relocateManifestDir 传入 registryInstallLocation
   - `install()` 打包形态：excludes = [MANIFEST_FILE, 'resources\\app.asar']；planInstall 传 `renames: { [path.basename(process.execPath)]: 'Minesweeper.exe' }` 与 `relPrefix: { src: 'resources\\game-app', dst: 'resources\\app' }`；`buildManifest.files = steps.map(s => s.rel)`；validateInstallDir selfDir = dirname(process.execPath)
   - 注册表：InstallLocation = 目标目录；UninstallString = `"<setup 磁盘 exe>" --uninstall`（`process.env.PORTABLE_EXECUTABLE_FILE || path.join(dirname(process.execPath), basename(process.execPath))`）；DisplayIcon = 安装副本 exe（Minesweeper.exe）
   - 快捷方式/工作目录指向安装副本 exe
   - 卸载流程不变（重定位链自动生效）；dev 形态（!isPackaged）保持 v2 白名单语义

## 测试与检查
- `node --check` 全部改动 .cjs（main.cjs/setup.cjs/preload-setup.cjs/installer-runner.cjs）
- 全量 `npm test` 全绿（本 wave 无新增单测；runner 副作用由 T20 E2E 覆盖）
- 不得改动游戏侧渲染/UI（T18 范围）；main.cjs 仅加分派分支，不删游戏侧现有代码（T18 删）

## 完成标准
- 4 个文件就绪；node --check 全过；npm test 全绿；无 console.log 调试残留
