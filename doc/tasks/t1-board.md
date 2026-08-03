# 任务 T1：core/board.js 棋盘模型 + core/modes.js 模式

## 目标
实现棋盘数据模型：创建、首次点击后布雷（首点安全）、翻开/0 区洪泛、左右键 chord、三段标记循环、胜负判定。并实现模式预设与自定义参数校验。

## 输入文档
- `doc/proposal.md`（FR1、FR3）
- `doc/detailed-design.md` 第 1、2 节（接口契约）
- `tests/board.test.js`、`tests/modes.test.js`（已由主 agent 先行编写）

## 待产出文件
- `src/core/modes.js`
- `src/core/board.js`

## 实现步骤
1. 严格按 detailed-design 第 1 节实现 `modes.js` 全部导出与 `validateCustom`。
2. 严格按 detailed-design 第 2 节实现 `board.js` 全部导出。注意：
   - 一维索引 `idx = row*cols + col`
   - `neighborIndexes` 返回升序、最多 8 个
   - `randomMineSet` 用 Fisher–Yates，候选池排除 safeIdx 及其 8 邻居
   - `placeMines` 布雷后计算每格 count（相邻雷数）
   - `reveal` 0 区洪泛用 BFS/队列防重复、防越界
   - `chordLeft` 中洪泛复用同一翻逻辑；含雷则 exploded
   - `chordRight` 标旗需受 `flagCount + count <= mines` 约束，否则 blocked
   - `cycleMark` 受 flag 上限约束
   - `revealAllMines` 返回雷索引数组
3. 模块只导出 `export const ... / export function ...`（ESM），零副作用、零 DOM 依赖。

## 测试与检查
- `npx vitest run tests/board.test.js tests/modes.test.js` 必须全绿
- 不得修改 `tests/` 下测试文件；若认为契约有缺陷，报告阻塞而非改测试

## 完成标准（Definition of Done）
- 两个源文件存在且仅含设计契约中的导出
- 上述 vitest 命令全绿，汇报通过用例数
- 无 console.log / 调试残留
