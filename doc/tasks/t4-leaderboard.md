# 任务 T4：core/leaderboard.js 排行榜

## 目标
实现基于 localStorage 的排行榜：按 (模式 × 防猜测实际开关) 分组、top-10 存取、排序、昵称记忆。

## 输入文档
- `doc/proposal.md`（FR7）
- `doc/detailed-design.md` 第 5 节（接口契约）
- `tests/leaderboard.test.js`（已由主 agent 先行编写）

## 待产出文件
- `src/core/leaderboard.js`

## 实现步骤
1. 导出 `LEADERBOARD_KEY`、`TOP_N=10`、`LEADERBOARD_MODES`。
2. `createLeaderboard(storage = globalThis.localStorage)`：
   - 读取 JSON；损坏/非法 → 空对象并继续
   - `getScores(mode, antiGuess)`：按 timeMs 升序，至多 10 条
   - `isTopTen(mode, antiGuess, timeMs)`：组内不足 10 条或时间不劣于第 10 名 → true
   - `addScore`：插入、排序、截断 10、持久化；返回 `{ added, rank }`（相等时间后写排后）
   - `getLastNickname`/`setLastNickname`（截断 16 字符）
   - `clear()`
3. storage 异常（getItem/setItem 抛错）→ 内存降级，不崩溃。
4. 纯 ESM、零 DOM 依赖（localStorage 由调用方注入）。

## 测试与检查
- `npx vitest run tests/leaderboard.test.js` 必须全绿
- 不得修改 `tests/` 测试文件

## 完成标准
- 文件存在且导出符合契约
- vitest 全绿；汇报：排序/截断/损坏修复/降级/同名时间排序断言
