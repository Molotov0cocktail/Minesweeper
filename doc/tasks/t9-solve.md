# 任务 T9：core/solve.js 重构 deduce + 高级局部重排模式

## 目标
1. 把 `isSolvable` 函数体逐行搬入 `deduce(rows,cols,mineSet,startIdx)`（返回 solved/unknown/clusters/smallest），`isSolvable` 变薄包装（行为恒等，**不得破坏现有 solve.test.js / solve.retries.test.js / game.test.js**）。
2. 新增 `generateAntiGuessAdvanced(rows,cols,mines,startIdx,opts={maxRegionAttempts,rng})`：歧义连通簇检测 → 区域重排 → 减雷移雷循环 → 失败返回 reason:'region'；新增常量 MAX_REGION_ATTEMPTS/MAX_MOVES/MAX_MOVE_CANDIDATES/MAX_TOTAL_DEDUCE。

## 输入文档
- `doc/proposal.md`（FR11）
- `doc/detailed-design.md` 第 3 节（deduce 契约、高级算法伪代码、语义裁定、边界清单）
- `tests/solve.test.js`、`tests/solve.retries.test.js`、`tests/solve.advanced.test.js`（测试已先行编写）

## 待产出文件
- `src/core/solve.js`（仅此文件）

## 实现步骤
1. **deduce 重构**：原 isSolvable 函数体逐行搬移（推导循环、规则 1/2/3 顺序完全一致），追加 unknown 收集（不动点未判定格）与 8-连通簇计算；clusters 按 size 升序、同 size 按簇内最小 idx 升序；isSolvable = `return deduce(...).solved`。
2. **generateAntiGuessAdvanced** 严格按详细设计伪代码：
   - density>0.5 → reason:'density'，mineSet:null，统计全 0
   - 初始 mineSet = randomMineSet（保持从 board.js 具名 import，测试 mock 依赖）
   - 外层循环：deduce → solved 即成功；否则取 smallest 簇；mR===0 → 失败；|poolR|<mR → 跳过重排直接减雷
   - 区域重排：簇外雷固定、poolR 内 Fisher–Yates 取 mR 个（rng 注入）、≤ maxRegionAttempts、预算内
   - 减雷移雷：随机取簇内一雷（rng）、候选=簇外非安全区非雷格洗牌取前 MAX_MOVE_CANDIDATES；
     接受条件 `(s2.unknown \ R) ⊆ outsideStuck`；s2.solved 直接成功；moves++ 回外层
   - 预算/上限：MAX_TOTAL_DEDUCE、MAX_MOVES 封顶 → reason:'region'，mineSet=<最后一次可用布局>
3. 统计字段 attempts/regionAttempts/moves/regions 全程单调非负。
4. 保持现有导出签名不变（isSolvable/generateAntiGuess/density/MAX_ATTEMPTS/MAX_DENSITY）。

## 测试与检查
- `npx vitest run tests/solve.test.js tests/solve.retries.test.js tests/solve.advanced.test.js` 全绿
- 不得修改 `tests/` 下测试文件；契约问题报告阻塞而非改测试

## 完成标准
- 现有 solve.test.js/solve.retries.test.js **原样**全绿（行为恒等验证）
- solve.advanced.test.js 全绿
- 无 console.log / 调试残留
