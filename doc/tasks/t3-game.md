# 任务 T3：core/game.js 游戏状态机 + 计时

## 目标
实现游戏生命周期状态机（READY/PLAYING/PAUSED/WON/LOST）、正向累加计时、防猜测开关调度、胜负事件。

## 输入文档
- `doc/proposal.md`（FR3-FR6）
- `doc/detailed-design.md` 第 4 节（接口契约）
- `tests/game.test.js`（已由主 agent 先行编写）

## 待产出文件
- `src/core/game.js`（依赖 `board.js`、`solve.js`）

## 实现步骤
1. 导出 `STATE` 常量与 `createGame(config, opts={})`。
2. 首次 reveal 流程（含防猜测三分支，warning 文案）：
   - density 超限 → `warning='防猜测已关闭：雷密度过高（>50%），无法保证无猜'`
   - 重排 20 次失败 → `warning='防猜测已关闭：重排 20 次仍无法保证无猜'`
3. 计时：`startAt` 基点 + 累加值；pause/resume/getElapsedMs 按契约实现；胜利/失败固化 `finalTimeMs`。
4. 事件：`on('win'|'lose'|'warning')`；payload 含 `antiGuessActive`（实际是否无猜）。
5. `getRemainingMines()` = `max(0, mines - flagCount)`。
6. 终态忽略一切操作；paused 忽略棋盘操作。
7. 纯 ESM、零副作用；假时钟注入可用。

## 测试与检查
- `npx vitest run tests/game.test.js` 必须全绿
- 不得修改 `tests/` 测试文件

## 完成标准
- 文件存在且导出符合契约
- vitest 全绿；汇报：状态机全路径、首点安全、防猜测三分支、计时/暂停断言、胜负事件 payload
