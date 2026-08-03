// @vitest-environment node
// 重排耗尽路径：mock randomMineSet 恒返回一个不可解布局，验证 20 次后 reason='retries'
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/core/board.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, randomMineSet: vi.fn(() => new Set([0])) };
});

import { generateAntiGuess } from '../src/core/solve.js';
import { isSolvable } from '../src/core/solve.js';

describe('generateAntiGuess 重排耗尽', () => {
  it('randomMineSet 恒返回不可解布局 → 重排 20 次后 reason=retries', () => {
    const r = generateAntiGuess(3, 3, 1, 4);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('retries');
    expect(r.attempts).toBe(20);
    expect(r.mineSet).toEqual(new Set([0]));
    expect(isSolvable(3, 3, r.mineSet, 4)).toBe(false);
  });

  it('maxAttempts 可自定义且每次尝试都走 randomMineSet', () => {
    const r = generateAntiGuess(3, 3, 1, 4, { maxAttempts: 3 });
    expect(r.attempts).toBe(3);
    expect(r.reason).toBe('retries');
  });
});
