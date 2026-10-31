# T27 手柄输入

- 输入：proposal FR16、详细设计v1.4 §1/2、tests/gamepad.test.js与gamepad.poller.test.js（主agent先红，只读）。
- 两个顺序子任务：纯模块src/core/gamepad.js；轮询模块src/renderer/gamepad.js。每次只做对应模块。
- 实现边沿/死区/重复/中立解锁/断连/API降级，stop清理。不得改测试/其他任务/提交push。
- 验证npx vitest run tests/gamepad.test.js tests/gamepad.poller.test.js；报告真实结果。依赖无。
