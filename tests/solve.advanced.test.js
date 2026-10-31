// @vitest-environment node
// 严格测试：deduce 提取等价性 + 高级局部重排（确定性场景经契约预言机验证，契约见 detailed-design §3）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { neighborIndexes } from '../src/core/board.js';
import {
  deduce,
  isSolvable,
  generateAntiGuessAdvanced,
  MAX_REGION_ATTEMPTS,
  MAX_MOVES,
  MAX_MOVE_CANDIDATES,
  MAX_TOTAL_DEDUCE,
} from '../src/core/solve.js';

// 确定性初始布局：mock board.randomMineSet 返回测试指定的 L0（高级算法仅在初始布雷时调用它）
let mockL0 = new Set();
vi.mock('../src/core/board.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, randomMineSet: vi.fn(() => new Set(mockL0)) };
});

const ROWS = 5;
const COLS = 5;
const START = 12; // (2,2)
const SAFE = [START, ...neighborIndexes(ROWS, COLS, START)];
const sortArr = (s) => [...s].sort((a, b) => a - b);

beforeEach(() => {
  mockL0 = new Set();
});

describe('deduce：与 isSolvable 等价 + 精确状态', () => {
  it('可解布局：solved=true、unknown 空、clusters 空、smallest null', () => {
    const d = deduce(ROWS, COLS, new Set([1, 2, 3]), START);
    expect(d.solved).toBe(true);
    expect(d.unknown.size).toBe(0);
    expect(d.clusters).toEqual([]);
    expect(d.smallest).toBeNull();
    expect(isSolvable(ROWS, COLS, new Set([1, 2, 3]), START)).toBe(true);
  });

  it('L0={0,2,3}：solved=false，unknown=[0,1,3,4]，双簇 [[0,1],[3,4]]，最小簇 [0,1]（预言机精确值）', () => {
    const d = deduce(ROWS, COLS, new Set([0, 2, 3]), START);
    expect(d.solved).toBe(false);
    expect(sortArr(d.unknown)).toEqual([0, 1, 3, 4]);
    expect(d.clusters.map(sortArr)).toEqual([[0, 1], [3, 4]]);
    expect(sortArr(d.smallest)).toEqual([0, 1]);
    // 簇内迭代序 = idx 升序（确定性前提）
    expect([...d.smallest]).toEqual([0, 1]);
    expect(isSolvable(ROWS, COLS, new Set([0, 2, 3]), START)).toBe(false);
  });

  it('L0={1,4,19}：双向推理排除14，unknown=[0,1,3,4,9,19,24]，三簇 [[0,1],[19,24],[3,4,9]]', () => {
    const d = deduce(ROWS, COLS, new Set([1, 4, 19]), START);
    expect(sortArr(d.unknown)).toEqual([0, 1, 3, 4, 9, 19, 24]);
    expect(d.clusters.map(sortArr)).toEqual([[0, 1], [19, 24], [3, 4, 9]]);
    expect(sortArr(d.smallest)).toEqual([0, 1]);
  });

  it('结构不变式：簇互不相交、并集=unknown、按 size 升序（同 size 最小 idx 升序）、smallest=clusters[0]', () => {
    const d = deduce(ROWS, COLS, new Set([0, 3, 14, 23]), START);
    expect(d.solved).toBe(false);
    expect(sortArr(d.unknown)).toEqual([0, 1, 3, 4, 9, 14, 19, 24]);
    const union = new Set();
    for (const c of d.clusters) {
      for (const i of c) {
        expect(union.has(i)).toBe(false);
        union.add(i);
      }
    }
    expect(sortArr(union)).toEqual(sortArr(d.unknown));
    for (let i = 1; i < d.clusters.length; i++) {
      const a = sortArr(d.clusters[i - 1]);
      const b = sortArr(d.clusters[i]);
      expect(a.length).toBeLessThanOrEqual(b.length);
      if (a.length === b.length) expect(a[0]).toBeLessThanOrEqual(b[0]);
    }
    expect(sortArr(d.smallest)).toEqual(sortArr(d.clusters[0]));
  });

  it('2×2 对角两雷（经典需猜）：unknown=[0,2,3] 单簇', () => {
    const d = deduce(2, 2, new Set([0, 3]), 1);
    expect(d.solved).toBe(false);
    expect(sortArr(d.unknown)).toEqual([0, 2, 3]);
    expect(d.clusters.map(sortArr)).toEqual([[0, 2, 3]]);
  });
});

describe('generateAntiGuessAdvanced：density 短路', () => {
  it('密度 > 0.5 → reason=density、mineSet=null、全统计 0、零尝试', () => {
    const r = generateAntiGuessAdvanced(ROWS, COLS, 13, START, { maxRegionAttempts: 3, rng: () => 0.5 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('density');
    expect(r.mineSet).toBeNull();
    expect(r.attempts).toBe(0);
    expect(r.regionAttempts).toBe(0);
    expect(r.moves).toBe(0);
    expect(r.regions).toBe(0);
  });
});

describe('generateAntiGuessAdvanced：区域重排成功路径（S1）', () => {
  it('L0={0,2,3}、rng=0.25 → 首次区域重排即可解：moves=0、regionAttempts=1、区域外雷固定', () => {
    mockL0 = new Set([0, 2, 3]);
    const r = generateAntiGuessAdvanced(ROWS, COLS, 3, START, { maxRegionAttempts: 3, rng: () => 0.25 });
    expect(r.ok).toBe(true);
    expect(r.moves).toBe(0);
    expect(r.regionAttempts).toBe(1);
    expect(r.regions).toBe(1);
    expect(r.attempts).toBe(2);
    // 结果 [1,2,3]：区域外雷 {2,3} 与 L0 完全一致（区域外雷固定断言）
    expect(sortArr(r.mineSet)).toEqual([1, 2, 3]);
    expect(isSolvable(ROWS, COLS, r.mineSet, START)).toBe(true);
    // 结构不变式：雷数正确、首点安全区无雷
    expect(r.mineSet.size).toBe(3);
    for (const i of SAFE) expect(r.mineSet.has(i)).toBe(false);
  });
});

describe('generateAntiGuessAdvanced：减雷移雷路径（S2）', () => {
  it('L0={1,4,19}、rng=0.5 → 区域重排耗尽后经移雷成功：ok、moves≥1、结果可解、统计单调', () => {
    mockL0 = new Set([1, 4, 19]);
    const r = generateAntiGuessAdvanced(ROWS, COLS, 3, START, { maxRegionAttempts: 3, rng: () => 0.5 });
    expect(r.ok).toBe(true);
    expect(r.moves).toBeGreaterThanOrEqual(1);
    expect(r.regionAttempts).toBeGreaterThanOrEqual(3); // 首轮 3 次区域重排全部未解
    expect(isSolvable(ROWS, COLS, r.mineSet, START)).toBe(true);
    expect(r.mineSet.size).toBe(3);
    for (const i of SAFE) expect(r.mineSet.has(i)).toBe(false);
    expect(r.attempts).toBeGreaterThan(0);
    expect(r.regions).toBeGreaterThanOrEqual(1);
  });
});

describe('generateAntiGuessAdvanced：移雷接受 + 重排联动（S4）', () => {
  it('L0={0,3,14,23}、rng=0.5 → 候选被接受后新一轮区域重排解决（预言机精确值：moves=1/attempts=7/regionAttempts=4/regions=2）', () => {
    mockL0 = new Set([0, 3, 14, 23]);
    const r = generateAntiGuessAdvanced(ROWS, COLS, 4, START, { maxRegionAttempts: 3, rng: () => 0.5 });
    expect(r.ok).toBe(true);
    expect(r.moves).toBe(1);
    expect(r.attempts).toBe(7);
    expect(r.regionAttempts).toBe(4);
    expect(r.regions).toBe(2);
    expect(sortArr(r.mineSet)).toEqual([2, 3, 4, 23]);
    expect(isSolvable(ROWS, COLS, r.mineSet, START)).toBe(true);
    for (const i of SAFE) expect(r.mineSet.has(i)).toBe(false);
  });
});

describe('generateAntiGuessAdvanced：失败与预算', () => {
  it('重排耗尽且候选无解 → 预算封顶失败：reason=region、attempts≥400、moves=0、布局保持 L0', () => {
    mockL0 = new Set([0, 3, 14, 23]);
    const r = generateAntiGuessAdvanced(ROWS, COLS, 4, START, { maxRegionAttempts: 1000, rng: () => 0.5 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('region');
    expect(r.attempts).toBeGreaterThanOrEqual(MAX_TOTAL_DEDUCE);
    expect(r.moves).toBe(0);
    expect(sortArr(r.mineSet)).toEqual([0, 3, 14, 23]); // 最后一次可用布局未变
    expect(isSolvable(ROWS, COLS, r.mineSet, START)).toBe(false);
  });

  it('同 rng 序列结果可复现', () => {
    mockL0 = new Set([1, 4, 19]);
    const r1 = generateAntiGuessAdvanced(ROWS, COLS, 3, START, { maxRegionAttempts: 3, rng: () => 0.5 });
    const r2 = generateAntiGuessAdvanced(ROWS, COLS, 3, START, { maxRegionAttempts: 3, rng: () => 0.5 });
    expect(r1.ok).toBe(r2.ok);
    expect(sortArr(r1.mineSet)).toEqual(sortArr(r2.mineSet));
    expect(r1.attempts).toBe(r2.attempts);
    expect(r1.regionAttempts).toBe(r2.regionAttempts);
    expect(r1.moves).toBe(r2.moves);
    expect(r1.regions).toBe(r2.regions);
  });

  it('常量导出：MAX_REGION_ATTEMPTS=20 / MAX_MOVES=20 / MAX_MOVE_CANDIDATES=100 / MAX_TOTAL_DEDUCE=400', () => {
    expect(MAX_REGION_ATTEMPTS).toBe(20);
    expect(MAX_MOVES).toBe(20);
    expect(MAX_MOVE_CANDIDATES).toBe(100);
    expect(MAX_TOTAL_DEDUCE).toBe(400);
  });
});
