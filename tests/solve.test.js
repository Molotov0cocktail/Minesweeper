// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isSolvable, generateAntiGuess, density, MAX_ATTEMPTS, MAX_DENSITY } from '../src/core/solve.js';
import { neighborIndexes } from '../src/core/board.js';

// 位置列表 [[row,col],...] → 索引集合
function ms(rows, cols, positions) {
  return new Set(positions.map(([r, c]) => r * cols + c));
}

describe('isSolvable：空区洪泛直接可解', () => {
  it('无雷棋盘立即全解', () => {
    expect(isSolvable(3, 3, new Set(), 4)).toBe(true);
  });
  it('两角雷 + 中点击 → 洪泛全翻', () => {
    const mines = ms(4, 4, [[0, 3], [3, 0]]);
    expect(isSolvable(4, 4, mines, 5)).toBe(true);
  });
});

describe('isSolvable：需逻辑推导', () => {
  it('需 SNS 子集推理的可解局面', () => {
    // 3x3，雷 (0,0)、(0,2)，起点 (2,1)：洪泛后需子集排除才能定位剩余两雷
    const mines = ms(3, 3, [[0, 0], [0, 2]]);
    expect(isSolvable(3, 3, mines, 7)).toBe(true);
  });
});

describe('isSolvable：需猜测的局面', () => {
  it('2×2 对角两雷 → 无法定位 → 不可解', () => {
    const mines = ms(2, 2, [[0, 0], [1, 1]]);
    expect(isSolvable(2, 2, mines, 1)).toBe(false);
  });
  it('3x3 单雷从中心 → 8 选 1 → 不可解', () => {
    const mines = ms(3, 3, [[0, 0]]);
    expect(isSolvable(3, 3, mines, 4)).toBe(false);
  });
});

describe('density 与常量', () => {
  it('密度计算正确', () => {
    expect(density(9, 9, 10)).toBeCloseTo(10 / 81, 10);
    expect(MAX_DENSITY).toBe(0.5);
    expect(MAX_ATTEMPTS).toBe(20);
  });
});

describe('generateAntiGuess', () => {
  it('雷密度超过 0.5 → 立即 reason=density，不尝试重排', () => {
    const r = generateAntiGuess(9, 9, 50, 40);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('density');
    expect(r.mineSet).toBeNull();
    expect(r.attempts).toBe(0);
  });

  it('结构不变式：attempts 在 [1,20]、雷数正确、ok 时必可解', () => {
    const r = generateAntiGuess(9, 9, 10, 40);
    expect(r.attempts).toBeGreaterThanOrEqual(1);
    expect(r.attempts).toBeLessThanOrEqual(20);
    expect(r.mineSet.size).toBe(10);
    if (r.ok) {
      expect(isSolvable(9, 9, r.mineSet, 40)).toBe(true);
    }
  });

  it('注入 rng 时结果可复现', () => {
    const r1 = generateAntiGuess(9, 9, 10, 40, { rng: () => 0.5 });
    const r2 = generateAntiGuess(9, 9, 10, 40, { rng: () => 0.5 });
    expect(r1.attempts).toBe(r2.attempts);
    expect([...r1.mineSet].sort()).toEqual([...r2.mineSet].sort());
  });

  it('安全区约束生效：首点及其邻域无雷', () => {
    const r = generateAntiGuess(9, 9, 10, 40);
    const safeArea = new Set([40, ...neighborIndexes(9, 9, 40)]);
    for (const i of r.mineSet) expect(safeArea.has(i)).toBe(false);
  });
});
