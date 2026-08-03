// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  CELL_HIDDEN,
  CELL_FLAGGED,
  CELL_QUESTIONED,
  CELL_REVEALED,
  createBoard,
  cellAt,
  indexAt,
  neighborIndexes,
  neighborsOf,
  randomMineSet,
  setMines,
  placeMines,
  reveal,
  chordLeft,
  chordRight,
  cycleMark,
  isWin,
  revealAllMines,
} from '../src/core/board.js';

// 构造指定雷位的棋盘（绕开随机布雷，用于确定性场景）
function boardWithMines(rows, cols, mineIndexes) {
  const board = createBoard(rows, cols, mineIndexes.length);
  setMines(board, new Set(mineIndexes));
  return board;
}

describe('createBoard', () => {
  it('创建 rows*cols 个格子，初始状态正确', () => {
    const b = createBoard(3, 4, 5);
    expect(b.cells.length).toBe(12);
    expect(b.rows).toBe(3);
    expect(b.cols).toBe(4);
    expect(b.mines).toBe(5);
    expect(b.revealedCount).toBe(0);
    expect(b.flagCount).toBe(0);
    expect(b.minesPlaced).toBe(false);
    for (const c of b.cells) {
      expect(c.isMine).toBe(false);
      expect(c.count).toBe(0);
      expect(c.state).toBe(CELL_HIDDEN);
      expect(c.idx).toBe(c.row * 4 + c.col);
    }
  });
});

describe('indexAt / cellAt', () => {
  it('行列转索引与回查', () => {
    expect(indexAt(5, 5, 0, 0)).toBe(0);
    expect(indexAt(5, 5, 4, 4)).toBe(24);
    expect(indexAt(5, 5, 2, 3)).toBe(13);
    expect(indexAt(5, 5, -1, 0)).toBe(-1);
    expect(indexAt(5, 5, 5, 0)).toBe(-1);
  });
  it('cellAt 越界返回 undefined', () => {
    const b = createBoard(3, 3, 1);
    expect(cellAt(b, 0, 0)).toBeDefined();
    expect(cellAt(b, 3, 0)).toBeUndefined();
  });
});

describe('neighborIndexes / neighborsOf', () => {
  it('中间格 8 邻居（升序、不含自身）', () => {
    // 4x4 中 (1,1)=5
    expect(neighborIndexes(4, 4, 5)).toEqual([0, 1, 2, 4, 6, 8, 9, 10]);
  });
  it('角格 3 邻居', () => {
    expect(neighborIndexes(4, 4, 0)).toEqual([1, 4, 5]);
  });
  it('边格 5 邻居', () => {
    expect(neighborIndexes(4, 4, 1)).toEqual([0, 2, 4, 5, 6]);
  });
  it('neighborsOf 返回 Cell 数组', () => {
    const b = createBoard(3, 3, 1);
    const ns = neighborsOf(b, 0, 0);
    expect(ns.map((c) => c.idx).sort()).toEqual([1, 3, 4]);
  });
});

describe('randomMineSet', () => {
  it('避开安全区且数量正确', () => {
    const safe = indexAt(9, 9, 4, 4);
    const s = randomMineSet(9, 9, 10, safe);
    expect(s.size).toBe(10);
    const safeArea = new Set([safe, ...neighborIndexes(9, 9, safe)]);
    for (const i of s) {
      expect(safeArea.has(i)).toBe(false);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(81);
    }
  });
  it('候选池不足时抛错', () => {
    // 2x2 任意格子安全区覆盖全部 4 格 → 候选池为空
    expect(() => randomMineSet(2, 2, 1, 0)).toThrow();
  });
  it('rng 注入时结果可复现', () => {
    const s1 = randomMineSet(9, 9, 10, 40, () => 0.5);
    const s2 = randomMineSet(9, 9, 10, 40, () => 0.5);
    expect([...s1].sort()).toEqual([...s2].sort());
    expect(s1.size).toBe(10);
  });
});

describe('setMines / placeMines', () => {
  it('setMines 落地指定雷位并计算 count', () => {
    const b = createBoard(3, 3, 2);
    setMines(b, new Set([0, 8]));
    expect(b.minesPlaced).toBe(true);
    expect(b.cells[0].isMine).toBe(true);
    expect(b.cells[8].isMine).toBe(true);
    // 中心格 count=2
    expect(b.cells[4].count).toBe(2);
    // 边格 count=1
    expect(b.cells[1].count).toBe(1);
    // count 一致性：任意格 count == 相邻雷数
    for (const c of b.cells) {
      const expected = neighborIndexes(3, 3, c.idx).filter((i) => b.cells[i].isMine).length;
      expect(c.count).toBe(expected);
    }
  });
  it('placeMines 首点 3×3 安全且雷数正确', () => {
    const b = createBoard(9, 9, 10);
    const safe = indexAt(9, 9, 4, 4);
    placeMines(b, safe);
    expect(b.minesPlaced).toBe(true);
    expect(b.cells[safe].isMine).toBe(false);
    for (const i of neighborIndexes(9, 9, safe)) expect(b.cells[i].isMine).toBe(false);
    expect(b.cells.filter((c) => c.isMine).length).toBe(10);
    // count 一致性抽查
    const c = b.cells[0];
    expect(c.count).toBe(neighborIndexes(9, 9, 0).filter((i) => b.cells[i].isMine).length);
  });
  it('角落首点也能布雷', () => {
    const b = createBoard(9, 9, 10);
    expect(() => placeMines(b, 0)).not.toThrow();
    expect(b.cells.filter((c) => c.isMine).length).toBe(10);
    expect(b.cells[0].isMine).toBe(false);
  });
});

describe('reveal', () => {
  it('翻开非雷格，返回本次翻开索引', () => {
    const b = boardWithMines(3, 3, [0, 8]);
    const r = reveal(b, 1, 1); // (1,1)=4, count=2
    expect(r.exploded).toBe(false);
    expect(r.revealed).toEqual([4]);
    expect(b.cells[4].state).toBe(CELL_REVEALED);
    expect(b.revealedCount).toBe(1);
  });
  it('重复翻开已翻开格为 no-op', () => {
    const b = boardWithMines(3, 3, [0, 8]);
    reveal(b, 1, 1);
    const before = b.revealedCount;
    const r = reveal(b, 1, 1);
    expect(r.revealed).toEqual([]);
    expect(b.revealedCount).toBe(before);
  });
  it('旗/问号格不会被翻开', () => {
    const b = boardWithMines(3, 3, [0, 8]);
    b.cells[1].state = CELL_FLAGGED;
    b.cells[2].state = CELL_QUESTIONED;
    expect(reveal(b, 0, 1).revealed).toEqual([]);
    expect(reveal(b, 0, 2).revealed).toEqual([]);
    expect(b.cells[1].state).toBe(CELL_FLAGGED);
    expect(b.cells[2].state).toBe(CELL_QUESTIONED);
  });
  it('点到雷爆炸', () => {
    const b = boardWithMines(3, 3, [0, 8]);
    const r = reveal(b, 0, 0);
    expect(r.exploded).toBe(true);
    expect(r.revealed).toContain(0);
    expect(b.cells[0].state).toBe(CELL_REVEALED);
  });
  it('0 区洪泛扩散且不翻开雷', () => {
    // 5x5 单雷 (0,4)；点击 (2,2) 应洪泛大区域
    const mine = indexAt(5, 5, 0, 4);
    const b = boardWithMines(5, 5, [mine]);
    const r = reveal(b, 2, 2);
    expect(r.exploded).toBe(false);
    expect(b.cells[indexAt(5, 5, 2, 2)].state).toBe(CELL_REVEALED);
    expect(b.revealedCount).toBeGreaterThan(1);
    expect(b.cells[mine].state).not.toBe(CELL_REVEALED);
    // 所有已翻开非雷格 count 一致
    for (const c of b.cells) {
      if (c.state === CELL_REVEALED && !c.isMine) {
        expect(c.count).toBe(neighborIndexes(5, 5, c.idx).filter((i) => b.cells[i].isMine).length);
      }
    }
  });
  it('未布雷时 reveal 为空操作', () => {
    const b = createBoard(3, 3, 1);
    expect(reveal(b, 1, 1)).toEqual({ revealed: [], exploded: false });
  });
});

describe('chordLeft（左键 chord：数字==相邻旗数 → 翻开剩余）', () => {
  it('未翻开格无效', () => {
    const b = boardWithMines(3, 3, [0]);
    expect(chordLeft(b, 1, 1).revealed).toEqual([]);
  });
  it('旗数不等于数字时不触发', () => {
    const b = boardWithMines(3, 3, [0, 8]);
    reveal(b, 1, 1); // count=2，无旗 → 2≠0
    const r = chordLeft(b, 1, 1);
    expect(r.revealed).toEqual([]);
    expect(r.exploded).toBe(false);
  });
  it('旗数==数字时翻开剩余未标旗邻居', () => {
    const b = boardWithMines(3, 3, [0, 8]);
    reveal(b, 1, 1);
    cycleMark(b, 0, 0); // 旗 (0,0)
    cycleMark(b, 2, 2); // 旗 (2,2) → 2 面旗 == 数字 2
    const r = chordLeft(b, 1, 1);
    expect(r.exploded).toBe(false);
    expect(r.revealed.length).toBeGreaterThan(0);
    // 翻开的是除两雷外的邻居
    for (const i of r.revealed) {
      expect(b.cells[i].isMine).toBe(false);
      expect(b.cells[i].state).toBe(CELL_REVEALED);
    }
    // 标旗的雷未被翻开
    expect(b.cells[0].state).toBe(CELL_FLAGGED);
    expect(b.cells[8].state).toBe(CELL_FLAGGED);
  });
  it('旗标错位时 chord 爆炸', () => {
    const b = boardWithMines(3, 3, [0, 8]);
    reveal(b, 1, 1); // count=2
    cycleMark(b, 0, 2); // 错旗：非雷 (0,2)
    cycleMark(b, 2, 2); // 正确旗：雷 (2,2) → 2 面旗
    const r = chordLeft(b, 1, 1);
    expect(r.exploded).toBe(true);
    expect(r.revealed).toContain(0); // 雷 (0,0) 被翻开
  });
  it('count=0 的已翻开格 chord 无效', () => {
    const b = boardWithMines(5, 5, [4]);
    reveal(b, 2, 2); // 洪泛区中 (2,2) count=0
    expect(chordLeft(b, 2, 2).revealed).toEqual([]);
  });
});

describe('chordRight（右键 chord：数字==未翻开邻居数 → 全部标旗）', () => {
  it('未翻开格无效', () => {
    const b = boardWithMines(3, 3, [0]);
    expect(chordRight(b, 1, 1).flagged).toEqual([]);
  });
  it('数字不等于未翻开邻居数时不触发', () => {
    const b = boardWithMines(3, 3, [0, 8]);
    reveal(b, 1, 1); // count=2，未翻开邻居 8 → 不触发
    const r = chordRight(b, 1, 1);
    expect(r.flagged).toEqual([]);
  });
  it('数字==未翻开邻居数时全部标旗', () => {
    // 3x3 单雷 (0,0)；把 (1,1) 其余邻居翻开，仅剩 (0,0) 未翻开
    const b = boardWithMines(3, 3, [0]);
    reveal(b, 1, 1); // (1,1) count=1
    for (const i of [1, 2, 3, 5, 6, 7, 8]) b.cells[i].state = CELL_REVEALED;
    // 此时 (1,1) 未翻开邻居 = {0}，count=1 → 触发
    const r = chordRight(b, 1, 1);
    expect(r.flagged).toEqual([0]);
    expect(b.cells[0].state).toBe(CELL_FLAGGED);
    expect(b.flagCount).toBe(1);
  });
  it('旗数超上限时 blocked，不标旗', () => {
    const b = boardWithMines(3, 3, [0, 8]);
    reveal(b, 1, 1); // count=2
    for (const i of [1, 2, 3, 5, 6, 7]) b.cells[i].state = CELL_REVEALED;
    cycleMark(b, 2, 2); // 旗 (2,2)，flagCount=1
    // 未翻开邻居 = {0, 8}（0 隐藏、8 旗）→ 2 == count，但 flagCount+2=3 > mines=2
    const r = chordRight(b, 1, 1);
    expect(r.blocked).toBe(true);
    expect(r.flagged).toEqual([]);
    expect(b.cells[0].state).toBe(CELL_HIDDEN);
    expect(b.flagCount).toBe(1);
  });
});

describe('cycleMark（旗→问号→无 循环）', () => {
  it('三段循环', () => {
    const b = createBoard(9, 9, 10);
    expect(cycleMark(b, 0, 0).state).toBe(CELL_FLAGGED);
    expect(cycleMark(b, 0, 0).state).toBe(CELL_QUESTIONED);
    expect(cycleMark(b, 0, 0).state).toBe(CELL_HIDDEN);
  });
  it('维护 flagCount', () => {
    const b = createBoard(9, 9, 10);
    cycleMark(b, 1, 1);
    expect(b.flagCount).toBe(1);
    cycleMark(b, 1, 1); // 旗→问号
    expect(b.flagCount).toBe(0);
    cycleMark(b, 1, 1); // 问号→无
    expect(b.flagCount).toBe(0);
  });
  it('旗数满时无法新增标旗（blocked）', () => {
    const b = createBoard(9, 9, 1);
    b.flagCount = 1;
    b.cells[0].state = CELL_FLAGGED;
    const r = cycleMark(b, 0, 1);
    expect(r.blocked).toBe(true);
    expect(b.cells[indexAt(9, 9, 0, 1)].state).toBe(CELL_HIDDEN);
  });
  it('已翻开格不操作', () => {
    const b = boardWithMines(3, 3, [0]);
    reveal(b, 1, 1);
    const r = cycleMark(b, 1, 1);
    expect(r.state).toBe(CELL_REVEALED);
    expect(r.blocked).toBe(false);
  });
});

describe('胜负判定', () => {
  it('翻开全部非雷格即胜利', () => {
    const b = boardWithMines(3, 3, [0]);
    for (const c of b.cells) {
      if (c.idx !== 0) {
        c.state = CELL_REVEALED;
        b.revealedCount += 1;
      }
    }
    expect(isWin(b)).toBe(true);
  });
  it('未全翻不胜利', () => {
    const b = boardWithMines(3, 3, [0]);
    reveal(b, 1, 1);
    expect(isWin(b)).toBe(false);
  });
  it('revealAllMines 翻开全部雷并返回索引', () => {
    const b = boardWithMines(3, 3, [0, 8]);
    const mines = revealAllMines(b);
    expect(mines.sort()).toEqual([0, 8]);
    for (const m of mines) expect(b.cells[m].state).toBe(CELL_REVEALED);
  });
});
