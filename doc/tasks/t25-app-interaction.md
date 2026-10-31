# T25 装配与画布体验

- 目标：键盘可玩、失焦暂停、重开复位、高分屏与事件重绘、换难度适配。
- 输入：proposal FR13/15、详细设计增量§5/6、tests/main.test.js（只读）。
- 只改 src/renderer/main.js（需要时 index.html 增加画布可访问性默认属性）；不改测试，不提交推送。
- 按契约导出 startApp，清理监听和定时器；棋盘焦点标记可用 DOM 覆盖层 #board-focus（样式由 T23 提供）。
- 保留防猜测配置/排行榜接线及鼠标 chord；输入框/模态不被快捷键劫持；像素缩放须处理 canvas 边框。
- 验证：npx vitest run tests/main.test.js，全量/真实 Electron 冒烟由主 agent完成。
- 完成：用例全绿，无重复监听/定时器。依赖 T23 API，可先实施。
