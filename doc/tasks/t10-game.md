# 任务 T10：core/game.js 防猜测配置集成（标准/高级 + 回退）

## 目标
- createGame config 新增 `antiGuessMethod('standard'|'advanced', 默认 standard)`、`maxAttempts(默认 20)`、`maxRegionAttempts(默认 20)`；game 新增同名字段与 `antiGuessStats`。
- `#firstReveal` 高级分支：advanced ok → 生效；reason:'density' → 不回退；reason:'region' → 回退标准 generateAntiGuess（透传 maxAttempts）。
- retries warning 文案数字动态化（默认 20 时与旧精确字符串逐字符相同）。

## 输入文档
- `doc/detailed-design.md` 第 4 节（game 契约 v2、关键流程、边界清单）
- `tests/game.test.js`（既有，**必须原样全绿**）、`tests/game.advanced.test.js`（已先行编写）

## 待产出文件
- `src/core/game.js`（仅此文件）

## 实现步骤
1. config 新字段默认值（旧 config 零迁移）；restart 保留配置字段、重置 antiGuessStats=null。
2. 必须保持从 solve.js 具名 import `generateAntiGuess`、新增具名 import `generateAntiGuessAdvanced`（测试 vi.mock 依赖）。
3. `#firstReveal` 高级分支严格按详细设计关键流程第 1 节；标准分支透传 `{ maxAttempts: this.maxAttempts }`。
4. warning 文案：density 文案不变；retries 文案 `防猜测已关闭：重排 ${this.maxAttempts} 次仍无法保证无猜`。
5. 不改变其它行为（状态机/计时/事件/payload 结构）。

## 测试与检查
- `npx vitest run tests/game.test.js tests/game.advanced.test.js` 全绿
- 不得修改 `tests/` 下测试文件；契约问题报告阻塞而非改测试

## 完成标准
- 既有 game.test.js **原样**全绿（默认值回归验证）
- game.advanced.test.js 全绿
- 无 console.log / 调试残留
