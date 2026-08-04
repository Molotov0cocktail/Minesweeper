# 任务 T18：游戏剥离安装功能 + 打包态 InstallLocation 自愈

## 目标
把安装/卸载管理从游戏程序**彻底剥离**：删除全部安装 UI/IPC/向导/runner 接线；游戏 preload 只留 app.getVersion；styles 迁移向导样式；新增打包态自愈（移动目录后更新注册表 InstallLocation）；同步删减测试与冒烟断言。

## 输入文档
- `doc/proposal.md` FR9.1/FR10.8
- `doc/detailed-design.md` §6（删除契约清单）、§7（main.cjs 游戏侧）

## 待产出文件（全部为删除/修改，无新增）
- `src/renderer/ui.js`：删 WARN_CODES/classifyReport（23-28）、JSDoc 安装行、#installer-open 按钮（105）、向导 DOM（178-223）、installer 控件引用（252-269）、事件绑定（310）、showInstallerWizard/hideInstallerWizard/setInstallerLabel/setInstallerProgress/showInstallerReport（438-538）、返回键（582-585）；同步头注释
- `src/renderer/main.js`：删 installProgressUnsub（28）、installerAPI/subscribeProgress/unsubscribeProgress/wizardStep/openInstallerFlow/runInstallFlow/runUninstallFlow/runCleanLegacyFlow/suggestInstallDir（114-250）、actions 8 键（321-360）；同步头注释
- `electron/preload.cjs`：只留 `app: { getVersion }`
- `electron/main.cjs`：删 installer-runner 引入/创建、IS_UNINSTALL、triggerSilentUninstall、validateInstallOpts、installer IPC 5 handler、second-instance 转发（保留单实例锁 + crash 日志 + app:get-version）；**新增打包态自愈**：
  ```js
  // 仅 app.isPackaged：reg.exe query UNINSTALL_KEY /v InstallLocation → 值 ≠ dirname(process.execPath)
  // 且自身目录存在 install-manifest.json → reg.exe add 更新；失败仅 log.warn
  // UNINSTALL_KEY 内联硬编码（HKCU\...\Uninstall\Minesweeper，来源 src/core/installer.js，游戏不打包该模块）
  ```
- `styles/main.css`：删 593-718（.ms-wizard 等，已迁移至 setup/wizard.css；共享类保留）
- `tests/ui.sidebar.test.js`：删 makeDeps 4 个 installer action（26-29）与"安装/卸载入口与向导"describe（156-210）；文件头注释同步
- `scripts/smoke.cjs`：44 行深断言——`typeof window.minesweeperAPI?.app?.getVersion === 'function'`（hasGetVersion）、`!window.minesweeperAPI?.installer`（noInstallerApi）、`!document.getElementById('installer-open')`（noInstallerOpenBtn）；输出结构保持

## 实现步骤
1. 按上表逐文件删除（精确行号以实际文件为准；删除后检查引用完整性——ui.js 返回对象、main.js actions、main.cjs IPC 注册）。
2. 自愈函数在 whenReady 后调用（游戏分支）；用 spawnSync reg.exe，超时 15s；失败 log.warn 不阻断。
3. smoke.cjs 断言更新后立即跑冒烟验证（开发态：noInstallerApi=true）。

## 测试与检查
- `npx vitest run tests/ui.test.js tests/ui.sidebar.test.js` 全绿
- 全量 `npm test` 全绿（约 205 - 5 = 200 用例 + 后续 wave 新增）
- `unset ELECTRON_RUN_AS_NODE && npx electron scripts/smoke.cjs`：SMOKE_RESULT 中 hasGetVersion=true、noInstallerApi=true、noInstallerOpenBtn=true
- `node --check` 改动 .cjs

## 完成标准
- 游戏程序无任何 installer 面（grep installer/wizard/install-dir 于 src/renderer + electron/preload.cjs + styles/main.css 无命中——main.cjs 中自愈/注释除外）
- 全量测试 + 冒烟绿；无 console.log 调试残留
