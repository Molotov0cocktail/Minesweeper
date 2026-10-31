import { describe, it, expect } from 'vitest';
import { createBoard, indexAt, cellAt, neighborIndexes, neighborsOf, setMines, reveal, chordLeft, chordRight, cycleMark } from '../src/core/board.js';

describe('坐标必须为范围内整数', () => {
  it.each([NaN, Infinity, -Infinity, 0.5, '1', null, undefined, -1, 5])('拒绝非法行列 %s，所有操作无副作用', (value) => {
    const board = setMines(createBoard(5, 5, 1), new Set([24]));
    const snapshot = structuredClone(board);
    for (const [row, col] of [[value, 0], [0, value]]) {
      expect(indexAt(5, 5, row, col)).toBe(-1);
      expect(cellAt(board, row, col)).toBeUndefined();
      expect(neighborsOf(board, row, col)).toEqual([]);
      expect(reveal(board, row, col)).toEqual({ revealed: [], exploded: false });
      expect(chordLeft(board, row, col)).toEqual({ revealed: [], exploded: false });
      expect(chordRight(board, row, col)).toEqual({ flagged: [] });
      expect(cycleMark(board, row, col)).toEqual({ state: undefined, blocked: false });
    }
    expect(board).toEqual(snapshot);
  });
  it.each([-1, 25, NaN, Infinity, 1.5, '1', null, undefined])('非法索引没有幽灵邻居 %s', idx => {
    expect(neighborIndexes(5, 5, idx)).toEqual([]);
  });
  it.each([[0, 5], [5, 0], [2.5, 5], [5, NaN], ['5', 5]])('非法尺寸安全返回 %s/%s', (rows, cols) => {
    expect(indexAt(rows, cols, 0, 0)).toBe(-1);
    expect(neighborIndexes(rows, cols, 0)).toEqual([]);
  });
});
