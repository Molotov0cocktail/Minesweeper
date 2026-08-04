# 任务 T12：renderer 侧栏 + 主页面板 + 安装向导 + 界面美化

## 目标
- 顶栏（汉堡/标题/状态/暂停重开/横幅）+ 左侧栏（等级/自定义/防猜测设置/排行榜按钮/安装卸载按钮）重构，`body.sidebar-open` 开合，展开时棋盘适配（fitToWindow 扣 248px）。
- 排行榜改主页面板（保留全部既有 id，class 由 overlay → ms-panel，隐藏语义不变）。
- 安装向导 DOM（步骤机 welcome/dir/options/progress/report）+ 报告 li[data-code] 渲染 + 进度条。
- 防猜测设置区联动（method 切换 disabled）+ settings 持久化接线（依赖 T7）+ IPC 接线（依赖 T11）。
- 整体美化（保持经典风：阴影/过渡/hover/active/focus 态/强调按钮），CSP 零外部资源。

## 输入文档
- `doc/proposal.md`（FR8.3、FR9、FR10、FR11）
- `doc/detailed-design.md` 第 6 节（DOM 契约表、ui.js API、main.js 装配）
- `tests/ui.test.js`（既有，**必须原样全绿**）、`tests/ui.sidebar.test.js`（已先行编写）

## 待产出文件
- `src/renderer/ui.js`、`src/renderer/main.js`、`styles/main.css`、`index.html`（如需微调）

## 实现步骤
1. ui.js：按 §6 DOM 契约表重构——既有 id 全部保留（ui.test.js 依赖），新增侧栏/设置/面板/向导控件；createUI 返回 API 扩展（setAntiGuessSettings/setInstallerLabel/showInstallerWizard/setInstallerProgress/showInstallerReport/getSidebarOpen）。
2. 排行榜面板：`#leaderboard-modal` 改 class `ms-panel hidden`（不再 overlay），6 tab 渲染逻辑保留。
3. main.js：侧栏开合 action（toggle body 类 + fitToWindow）；settings 持久化接线（启动 get() 回填 → 变更 update() → 作用于 newGame config）；IPC 接线（window.minesweeperAPI?.installer 可选链，无 preload 降级提示）；安装/卸载流程驱动（getStatus → 向导步骤 → install/uninstall + progress → report）。
4. main.css：侧栏/顶栏/面板/向导/进度条/报告条目样式 + 美化（hover/active/focus-visible、阴影、transition、ms-btn-primary/ms-btn-danger）；不破坏既有类。
5. 文案全部中文；无 console.log 调试残留。

## 测试与检查
- `npx vitest run tests/ui.test.js tests/ui.sidebar.test.js` 全绿
- `unset ELECTRON_RUN_AS_NODE && npx electron scripts/smoke.cjs` 冒烟通过（含截图核对侧栏/棋盘适配）
- 不得修改 `tests/` 下测试文件；契约问题报告阻塞而非改测试

## 完成标准
- 既有 ui.test.js **原样**全绿（id 回归验证）
- ui.sidebar.test.js 全绿；冒烟通过
- 无 console.log / 调试残留
