# T23 UI 状态与焦点

- 目标：状态/规格/进度、键盘说明、菜单与难度语义、可用弹窗焦点；经典风格排版改善。
- 输入：proposal FR14、详细设计增量§4、tests/ui.experience.test.js（只读）。
- 只改 src/renderer/ui.js、styles/main.css（同一 UI 模块）；不得改测试或提交推送。
- 新增 setGameStatus/resetTransient/destroy；保留所有既有 id/API；document 监听必须能销毁。
- 样式需修复侧栏顶端内容被顶栏遮住及 .hidden 被后续 display 覆盖的问题；布局小窗口可滚动，焦点可见，尊重 prefers-reduced-motion。
- 验证：npx vitest run tests/ui.test.js tests/ui.sidebar.test.js tests/ui.experience.test.js。
- 完成：测试全绿、说明样式选择；依赖无，主 agent 汇总进度。
