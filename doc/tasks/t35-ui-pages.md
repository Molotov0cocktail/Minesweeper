# T35 简洁页面与全界面手柄

- 只改src/renderer/ui.js、styles/main.css（UI模块）。输入v1.5详细设计§4~7，tests/ui.pages.test.js只读。
- 默认棋盘不放教程/手柄提示，说明/键位单独页；焦点与作用域、绑定编辑、专注视图/HUD/退出、按需昵称键盘。
- 通过controller-ui.navigateControls转发普通控件导航（T36并行提供）；保留旧id/API并完善destroy。
- actions新增setGamepadBinding/resetGamepadBindings/setFocusView，均可选。UI单测deps缺action时本地按钮也应能切页/视图。
- 不改tests/其他任务/提交push；及时报告契约冲突。完成跑UI全部文件。
