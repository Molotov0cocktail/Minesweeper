# T22 game 首点守卫

- 目标：首点旗/问号不启动游戏，不触发随机布雷/防猜测。
- 输入：proposal FR12、详细设计增量§2、tests/game.safety.test.js（只读）。
- 只改 src/core/game.js；不得修改 tests、提交推送或其他任务文件。
- 步骤：布雷前检查合法索引及 hidden 状态；保留后续合法首点。
- 验证：npx vitest run tests/game.test.js tests/game.advanced.test.js tests/game.safety.test.js。
- 完成：测试全绿及 diff 审阅。依赖：T21 坐标守卫（可独立实施）。进度由主 agent 汇总。
