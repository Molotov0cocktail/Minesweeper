# T24 排行榜数据完整性

- 目标：部分损坏记录不崩溃、非法成绩不入榜、防止调用方改写缓存、同分资格准确。
- 输入：proposal FR12、详细设计增量§3、tests/leaderboard.safety.test.js（只读）。
- 只改 src/core/leaderboard.js；不改测试，不提交推送。
- 保持存储键与合法数据兼容；清洗边界、模式白名单、时间校验、昵称规范化、返回记录独立拷贝。
- 验证：npx vitest run tests/leaderboard.test.js tests/leaderboard.safety.test.js。
- 完成：测试全绿及 diff。依赖无，主 agent 汇总进度。
