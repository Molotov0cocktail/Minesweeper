# 任务 T2：core/solve.js 可解性检测 + 防猜测重排

## 目标
实现无猜可解性判定算法（NSS 单格 + SNS 2-集子集推理）与防猜测重排生成器。

## 输入文档
- `doc/proposal.md`（FR6）
- `doc/detailed-design.md` 第 3 节（接口契约 + 算法规则）
- `tests/solve.test.js`（已由主 agent 先行编写）

## 待产出文件
- `src/core/solve.js`（依赖 `board.js` 的 `neighborIndexes`、`randomMineSet`）

## 实现步骤
1. 导出常量 `MAX_ATTEMPTS=20`、`MAX_DENSITY=0.5`、`density(rows,cols,mines)`。
2. `isSolvable(rows, cols, mineSet, startIdx)`：
   - 状态：`revealed[]`、`flagged[]`、`unknown`（默认）
   - 从 startIdx 洪泛翻开（count===0 扩散）
   - 迭代前沿推理直至不动点：
     - 规则1 翻：`need===0 && cand 非空` → 翻开 cand
     - 规则2 标雷：`need===cand.size` → 标雷
     - 规则3 子集排除：`cand_A ⊆ cand_B && need_A===need_B` → 翻开 `cand_B\cand_A`；
       `cand_A ⊆ cand_B && need_B-need_A===cand_B.size-cand_A.size` → 标雷 `cand_B\cand_A`
   - 返回 `revealed 数 === rows*cols − mineSet.size`
   - 实现建议：cand 用 Set；子集规则对前沿格两两比较（前沿数量有限，性能足够）
3. `generateAntiGuess(rows, cols, mines, startIdx, opts={})`：
   - `opts.rng` 注入到 `randomMineSet` 调用链；默认 Math.random
   - density 短路；重排至多 20 次；返回契约见 detailed-design
4. 纯 ESM、零副作用。

## 测试与检查
- `npx vitest run tests/solve.test.js` 必须全绿
- 不得修改 `tests/` 测试文件

## 完成标准
- 文件存在且导出符合契约
- vitest 全绿，汇报通过用例数与关键断言（含"可解布局返回 true / 需猜布局返回 false / density 短路 / rng 确定性 / 重排成功"）
