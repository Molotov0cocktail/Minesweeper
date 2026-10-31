// @vitest-environment node
// 严格测试：game 防猜测配置集成（标准/高级 + 回退），契约见 detailed-design §4
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 确定性：固定 randomMineSet 布局（5x5，雷在 (1,1),(3,1),(4,0)）——与 game.test.js 一致
vi.mock('../src/core/board.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, randomMineSet: vi.fn(() => new Set([6, 16, 20])) };
});
// 确定性：mock solve 的两个防猜测生成器
vi.mock('../src/core/solve.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, generateAntiGuess: vi.fn(), generateAntiGuessAdvanced: vi.fn() };
});

import { STATE, createGame } from '../src/core/game.js';
import { generateAntiGuess, generateAntiGuessAdvanced } from '../src/core/solve.js';

const CFG = { rows: 5, cols: 5, mines: 3, antiGuess: false, mode: 'custom' };
const FIRST_IDX = 2 * 5 + 2; // 首点 (2,2)

describe('防猜测配置字段与默认值', () => {
  it('旧 config（无新字段）→ advanced/20/20', () => {
    const game = createGame({ ...CFG, antiGuess: true });
    expect(game.antiGuessMethod).toBe('advanced');
    expect(game.maxAttempts).toBe(20);
    expect(game.maxRegionAttempts).toBe(20);
    expect(game.antiGuessStats).toBeNull();
  });

  it('config 可配置 method/attempts；restart 保留配置、重置 stats', () => {
    const game = createGame({ ...CFG, antiGuess: true, antiGuessMethod: 'advanced', maxAttempts: 5, maxRegionAttempts: 7 });
    expect(game.antiGuessMethod).toBe('advanced');
    expect(game.maxAttempts).toBe(5);
    expect(game.maxRegionAttempts).toBe(7);
    game.restart();
    expect(game.antiGuessMethod).toBe('advanced');
    expect(game.maxAttempts).toBe(5);
    expect(game.maxRegionAttempts).toBe(7);
  });
});

describe('标准模式回归（默认 method）', () => {
  beforeEach(() => {
    vi.mocked(generateAntiGuess).mockReset();
  });

  it('默认 standard：只调用 generateAntiGuess 并透传 {maxAttempts}，不调高级', () => {
    vi.mocked(generateAntiGuess).mockReturnValue({ ok: true, mineSet: new Set([0, 1, 2]), attempts: 1 });
    const game = createGame({ ...CFG, mines: 3, antiGuess: true, antiGuessMethod: 'standard', maxAttempts: 5 });
    game.reveal(2, 2);
    expect(vi.mocked(generateAntiGuessAdvanced)).not.toHaveBeenCalled();
    expect(vi.mocked(generateAntiGuess)).toHaveBeenCalledWith(5, 5, 3, FIRST_IDX, { maxAttempts: 5 });
    expect(game.antiGuessActive).toBe(true);
    expect(game.warning).toBeNull();
    expect(game.antiGuessStats).toBeNull();
  });

  it('retries 文案随 maxAttempts 动态化（"重排 5 次"）', () => {
    vi.mocked(generateAntiGuess).mockReturnValue({ ok: false, reason: 'retries', mineSet: new Set([0, 1, 2]), attempts: 5 });
    const game = createGame({ ...CFG, mines: 3, antiGuess: true, antiGuessMethod: 'standard', maxAttempts: 5 });
    let warning = null;
    game.on('warning', (w) => (warning = w));
    game.reveal(2, 2);
    expect(game.antiGuessActive).toBe(false);
    expect(game.warning).toBe('防猜测已关闭：重排 5 次仍无法保证无猜');
    expect(warning).toBe(game.warning);
  });
});

describe('高级模式三分支 + 回退', () => {
  beforeEach(() => {
    vi.mocked(generateAntiGuess).mockReset();
    vi.mocked(generateAntiGuessAdvanced).mockReset();
  });

  it('advanced ok → 生效、用高级 mineSet、antiGuessStats 记录、不透传标准', () => {
    const adv = { ok: true, mineSet: new Set([0, 1, 2]), attempts: 2, regionAttempts: 1, moves: 0, regions: 1 };
    vi.mocked(generateAntiGuessAdvanced).mockReturnValue(adv);
    const game = createGame({ ...CFG, mines: 3, antiGuess: true, antiGuessMethod: 'advanced', maxRegionAttempts: 7 });
    game.reveal(2, 2);
    expect(vi.mocked(generateAntiGuessAdvanced)).toHaveBeenCalledWith(5, 5, 3, FIRST_IDX, { maxRegionAttempts: 7 });
    expect(vi.mocked(generateAntiGuess)).not.toHaveBeenCalled();
    expect(game.antiGuessActive).toBe(true);
    expect(game.warning).toBeNull();
    expect(game.antiGuessStats).toEqual(adv);
    expect(game.board.cells[0].isMine).toBe(true);
  });

  it('advanced reason=density → 不回退标准，density 精确文案', () => {
    vi.mocked(generateAntiGuessAdvanced).mockReturnValue({
      ok: false, reason: 'density', mineSet: null, attempts: 0, regionAttempts: 0, moves: 0, regions: 0,
    });
    const game = createGame({ ...CFG, mines: 3, antiGuess: true, antiGuessMethod: 'advanced' });
    let warning = null;
    game.on('warning', (w) => (warning = w));
    game.reveal(2, 2);
    expect(vi.mocked(generateAntiGuess)).not.toHaveBeenCalled();
    expect(game.antiGuessActive).toBe(false);
    expect(game.warning).toBe('防猜测已关闭：雷密度过高，无法保证无猜');
    expect(warning).toBe(game.warning);
    expect(game.board.minesPlaced).toBe(true);
    expect(game.antiGuessStats.reason).toBe('density');
  });

  it('默认局部修复耗尽即关闭并保留末次布局，绝不整盘回退', () => {
    const result={ok:false,reason:'region',mineSet:new Set([0,1,2]),attempts:30,regionAttempts:29,moves:0,regions:1};
    generateAntiGuessAdvanced.mockReturnValue(result);
    generateAntiGuess.mockReturnValue({ok:true,mineSet:new Set([3,4,5]),attempts:2});
    const game=createGame({...CFG,antiGuess:true});let warning;
    game.on('warning',w=>{warning=w;});game.reveal(2,2);
    expect(generateAntiGuessAdvanced).toHaveBeenCalled();expect(generateAntiGuess).not.toHaveBeenCalled();
    expect(game.antiGuessActive).toBe(false);expect(game.warning).toBe('防猜测已关闭：局部修复预算耗尽，已切换普通开局');
    expect(warning).toBe(game.warning);expect(game.antiGuessStats).toEqual(result);
    expect(game.board.cells.filter(c=>c.isMine).map(c=>c.idx)).toEqual([0,1,2]);
  });

  it('restart 重置 antiGuessStats=null、保留配置', () => {
    vi.mocked(generateAntiGuessAdvanced).mockReturnValue({ ok: true, mineSet: new Set([0, 1, 2]), attempts: 1, regionAttempts: 0, moves: 0, regions: 0 });
    const game = createGame({ ...CFG, mines: 3, antiGuess: true, antiGuessMethod: 'advanced' });
    game.reveal(2, 2);
    expect(game.antiGuessStats).not.toBeNull();
    game.restart();
    expect(game.antiGuessStats).toBeNull();
    expect(game.antiGuessMethod).toBe('advanced');
  });
});
