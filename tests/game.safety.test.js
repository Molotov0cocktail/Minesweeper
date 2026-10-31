import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../src/core/board.js', async original => ({ ...await original(), randomMineSet: vi.fn(() => new Set([24])) }));
vi.mock('../src/core/solve.js', () => ({ generateAntiGuess: vi.fn(() => ({ ok: true, mineSet: new Set([24]), attempts: 1 })), generateAntiGuessAdvanced: vi.fn(() => ({ ok: true, mineSet: new Set([24]), attempts: 1 })) }));
import { createGame } from '../src/core/game.js';
import { randomMineSet } from '../src/core/board.js';
import { generateAntiGuess, generateAntiGuessAdvanced } from '../src/core/solve.js';
beforeEach(() => vi.clearAllMocks());
describe('首点状态守卫', () => {
  for (const method of ['off', 'standard', 'advanced']) {
    it.each([1, 2])(`${method} 首点标记 %s 次后点击不得布雷或计时`, marks => {
      let now = 0;
      const g = createGame({ rows: 5, cols: 5, mines: 1, mode: 'custom', antiGuess: method !== 'off', antiGuessMethod: method }, { now: () => now });
      for (let i = 0; i < marks; i++) g.cycleMark(0, 0);
      const board = structuredClone(g.board);
      expect(g.reveal(0, 0)).toEqual({ type: 'noop' });
      now = 5000;
      expect(g.state).toBe('ready');
      expect(g.getElapsedMs()).toBe(0);
      expect(g.board).toEqual(board);
      expect(randomMineSet).not.toHaveBeenCalled();
      expect(generateAntiGuess).not.toHaveBeenCalled();
      expect(generateAntiGuessAdvanced).not.toHaveBeenCalled();
      while (g.board.cells[0].state !== 'hidden') g.cycleMark(0, 0);
      expect(g.reveal(0, 0).type).toBe('win');
      expect(g.board.minesPlaced).toBe(true);
    });
  }
});
