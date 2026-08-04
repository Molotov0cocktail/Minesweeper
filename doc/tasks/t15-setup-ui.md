# 任务 T15：setup 程序 UI（setup/ui.js + wizard.css + index.html）

## 目标
实现独立安装器 MinesweeperSetup 的渲染层：安装向导（welcome/dir/options/progress/report）+ 卸载确认界面 + 旧版残留清理提示。纯 DOM 层，jsdom 可测，零 Electron 依赖。

## 输入文档
- `doc/proposal.md` FR10.2（双击语义）
- `doc/detailed-design.md` §6b（createSetupUI/startSetupApp 契约、DOM id 表、wizard.css 迁移边界）

## 待产出文件
- `tests/setup.ui.test.js`（**先行**，`// @vitest-environment jsdom`）
- `setup/ui.js`（ESM，导出 createSetupUI + startSetupApp）
- `setup/index.html`（CSP 同游戏；link ../styles/main.css + ./wizard.css；`<div id="setup-root">`；script module 调 startSetupApp()）
- `setup/wizard.css`（从 styles/main.css 593-718 迁移 .ms-wizard/.ms-wiz-page/#installer-step[data-step] 规则改 #setup-step 前缀、.ms-progress-*、.ms-report 族、.report-*、.ms-legacy-clean + setup 页面基础布局；共享类 .overlay/.modal/.ms-input/.ms-btn/.hidden 不迁移）

## 实现步骤
1. 严格按 detailed-design §6b 的 DOM id 表生成控件（复用 v2 向导 id：#install-dir-input/-suggest/-error、#install-desktop-chk/-startmenu-chk、#install-progress-track/fill/text、#install-report、#install-next/back/confirm/cancel/close、#installer-legacy-clean）。
2. `createSetupUI(host, deps)`：deps.actions = { suggestDir, startInstall(opts), runUninstall, runCleanLegacy, exit }；返回 { showStatus, showStep(step,payload), setProgress({done,total,message}), showReport(result), showUninstallConfirm({dir,appVersion}), showLegacyPrompt(legacy) }。
3. 视图切换：`#setup-mode[data-mode=wizard|uninstall]`；向导步骤 `#setup-step[data-step]` + hidden 切换。
4. 报告渲染：li[data-code] 按 code 加 error/warn/ok 语义类（复用 v2 classifyReport 的语义：PERMISSION/BUSY/NOT_FOUND 等）。
5. `startSetupApp()`：内置 window.minesweeperAPI?.installer 可选链接线（getStatus → installed ? 卸载视图 : 向导；suggestDir 预填；install/uninstall 进度订阅；无 preload 时操作显示中文错误提示不崩）。
6. 全部文案中文。

## 测试与检查
- `npx vitest run tests/setup.ui.test.js` 必须全绿（约 12 用例：5 步骤切换/卸载视图/进度条/报告分类/legacy 显隐/按钮接线/无 preload 不崩）
- 不得修改 `tests/` 下其他测试文件
- 不影响游戏侧（不 import src/renderer/*）

## 完成标准
- 4 个文件产出；vitest 全绿汇报用例数；无 console.log 调试残留
