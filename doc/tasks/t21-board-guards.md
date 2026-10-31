# T21 board 坐标边界

- 目标：非法坐标安全返回，无幽灵邻居或棋盘修改。
- 输入：proposal FR12、详细设计 v1.3.0 §1、tests/board.safety.test.js（只读）。
- 只改 src/core/board.js；不得修改 tests、提交推送或其他任务文件。
- 步骤：统一整数范围校验；所有坐标入口复用；保持合法行为。
- 验证：npx vitest run tests/board.test.js tests/board.safety.test.js。
- 完成：先红后绿、真实汇报测试及 diff。依赖：无。progress 由主 agent 汇总避免并发写冲突。
