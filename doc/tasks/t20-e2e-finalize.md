# 任务 T20：E2E 四阶段重写 + 文档收尾 + 全量验收

## 目标
重写端到端验收脚本以覆盖 v3 新分发流程（portable setup exe），完成 README/AGENTS/progress 收尾与全量验证。

## 输入文档
- `doc/detailed-design.md` §8（验收标准）
- `doc/proposal.md` §6（成功标准）

## 待产出文件
- `scripts/installer-e2e.cjs`（重写，仍"用后即删，不入库"？——改为常驻脚本，沿用 T13 惯例入库）
- `README.md`、`AGENTS.md`、`doc/tasks/progress.md`（收尾）

## 实现步骤
1. `scripts/installer-e2e.cjs` 四阶段：
   - APP = `<root>/dist/MinesweeperSetup-<version>-win.exe`（版本从 package.json 读）
   - **A 静默安装**：spawn(APP, ['--install-dir', TEST_DIR]) 等待退出（≤60s）→ 校验：`TEST_DIR/Minesweeper.exe`、`resources/app/package.json` + `resources/app/index.html` 存在、`resources/app.asar` 不存在；manifest files 含 `Minesweeper.exe` 与 `resources\app\*`、不含 `MinesweeperSetup.exe`/`resources\app.asar`/`resources\game-app\*`；注册表 UninstallString 以 `"<APP>" --uninstall` 结尾、InstallLocation === TEST_DIR；桌面/开始菜单快捷方式存在且指向 `TEST_DIR/Minesweeper.exe`
   - **B 运行安装副本 + 移动 + 自愈 + 静默卸载**：CDP 启动 `TEST_DIR/Minesweeper.exe` → 冒烟断言（#sidebar-toggle 存在、app.getVersion 为函数、installer 面不存在、canvas>0、无 console 错误）→ kill → rename TEST_DIR→MOVED_DIR → 短启 MOVED_DIR/Minesweeper.exe 触发自愈 → kill → reg 断言 InstallLocation === MOVED_DIR → spawn(APP, ['--uninstall']) 静默 → 校验注册表键删除、MOVED_DIR 删除（被锁则轮询延迟 bat ≤90s）、快捷方式删除
   - **C 再安装 + 外来文件 + GUI 卸载**：--install-dir 再装 → 写 user-notes.txt → spawn(APP, ['--remote-debugging-port'])（已安装 → 卸载确认视图）→ CDP 断言视图 → 点击卸载确认 → 校验外来文件保留、清单内文件删除、注册表/快捷方式删除
   - **D 清理**：rm TEST_DIR/MOVED_DIR、taskkill 兜底、汇总通过/失败数（失败非 0 退出）
2. README.md：分发章节改单文件安装器（双击语义/卸载/自愈/零痕迹/命令行）；操作说明表删侧栏安装入口；项目结构加 setup/、scripts/setup-builder.yml、.build/；命令改 `npm run dist`
3. AGENTS.md：§1 概览（安装器独立化）；§4 结构；§5 接口速查（installer.js 新签名、setup.cjs CLI、createSetupUI、preload 面）；§6 命令；§7 测试约定（setup.ui.test.js）；§8 弱点评估刷新（8.3 卸载自锁缓解、8.7 E2E 覆盖增强、8.9 便携未签名保留）
4. progress.md：任务状态 + 运行日志续写每 wave 一行

## 测试与检查
- `node scripts/installer-e2e.cjs` 四阶段全过（目标 20/20）
- 全量 `npm test` 全绿；开发态冒烟绿
- 手动验收：双击 setup 装/卸；删 setup exe 后查 %TEMP%/%LOCALAPPDATA%/注册表无印记
- 清理 D:\MinesweeperE2E*、smoke-screenshot.png、.build/；git status --short 复查

## 完成标准
- E2E 四阶段通过；README/AGENTS/progress 与实现一致；全量测试+冒烟绿；git 提交推送
