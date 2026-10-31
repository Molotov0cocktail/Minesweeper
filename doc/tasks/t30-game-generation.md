# T30 Game异步生成状态

- 只改src/core/game.js；输入详细设计§6、tests/game.generation.test.js（只读）。
- opts.prepareBoard注入、GENERATING、晚到结果令牌、生成不计时、异常/无效安全回退；同步路径保留。
- 验证全部game测试；不改其他文件或commit/push。依赖T29结果协议。
