// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 确定性：固定 randomMineSet 布局（5x5，雷在 (1,1),(3,1),(4,0)）
vi.mock('../src/core/board.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, randomMineSet: vi.fn(() => new Set([6, 16, 20])) };
});
// 确定性：mock solve.generateAntiGuess
vi.mock('../src/core/solve.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, generateAntiGuess: vi.fn() };
});

import {
  STATE,
  createGame,
} from '../src/core/game.js';
import { generateAntiGuess } from '../src/core/solve.js';
import {
  CELL_REVEALED,
  CELL_FLAGGED,
  CELL_HIDDEN,
  CELL_QUESTIONED,
  indexAt,
} from '../src/core/board.js';

function makeClock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

// 统一配置：5x5 / 3 雷 / 首点 (2,2)=12
const CFG = { rows: 5, cols: 5, mines: 3, antiGuess: false, mode: 'custom' };

describe('创建与状态机', () => {
  it('初始为 READY，棋盘未布雷，计时 0', () => {
    const game = createGame(CFG);
    expect(game.state).toBe(STATE.READY);
    expect(game.board.minesPlaced).toBe(false);
    expect(game.getElapsedMs()).toBe(0);
    expect(game.antiGuessActive).toBe(false);
  });

  it('首次点击 → reveal，随后计时开始', () => {
    const clock = makeClock();
    const game = createGame(CFG, { now: clock.now });
    expect(game.reveal(2, 2).type).toBe('reveal');
    expect(game.state).toBe(STATE.PLAYING);
    expect(game.board.minesPlaced).toBe(true);
    expect(game.board.cells[indexAt(5, 5, 2, 2)].state).toBe(CELL_REVEALED);
    clock.advance(5000);
    expect(game.getElapsedMs()).toBe(5000);
  });

  it('READY 状态可标旗、chord 无效', () => {
    const game = createGame(CFG);
    expect(game.chordLeft(2, 2).type).toBe('noop');
    expect(game.chordRight(2, 2).type).toBe('noop');
    const m = game.cycleMark(0, 0);
    expect(m.type).toBe('mark');
    expect(m.state).toBe(CELL_FLAGGED);
    expect(game.board.flagCount).toBe(1);
  });

  it('重复点击已翻开格 → noop', () => {
    const game = createGame(CFG);
    game.reveal(2, 2);
    expect(game.reveal(2, 2).type).toBe('noop');
  });

  it('restart 重置一切', () => {
    const clock = makeClock();
    const game = createGame(CFG, { now: clock.now });
    game.reveal(2, 2);
    clock.advance(1000);
    game.pause();
    game.restart();
    expect(game.state).toBe(STATE.READY);
    expect(game.board.minesPlaced).toBe(false);
    expect(game.getElapsedMs()).toBe(0);
    expect(game.warning).toBeNull();
  });
});

describe('计时与暂停', () => {
  it('暂停冻结计时，继续恢复累计', () => {
    const clock = makeClock();
    const game = createGame(CFG, { now: clock.now });
    game.reveal(2, 2);
    clock.advance(2000);
    game.pause();
    expect(game.state).toBe(STATE.PAUSED);
    expect(game.getElapsedMs()).toBe(2000);
    clock.advance(5000);
    expect(game.getElapsedMs()).toBe(2000);
    game.resume();
    expect(game.state).toBe(STATE.PLAYING);
    clock.advance(3000);
    expect(game.getElapsedMs()).toBe(5000);
  });

  it('暂停期间棋盘操作被忽略', () => {
    const game = createGame(CFG);
    game.reveal(2, 2);
    game.pause();
    const before = game.board.revealedCount;
    expect(game.reveal(0, 0).type).toBe('noop');
    expect(game.cycleMark(0, 0).type).toBe('noop');
    expect(game.chordLeft(2, 2).type).toBe('noop');
    expect(game.chordRight(2, 2).type).toBe('noop');
    expect(game.board.revealedCount).toBe(before);
  });
});

describe('胜负', () => {
  it('翻开全部非雷格 → win 事件与 payload', () => {
    const clock = makeClock();
    const game = createGame(CFG, { now: clock.now });
    let won = null;
    game.on('win', (p) => (won = p));
    game.reveal(2, 2);
    clock.advance(3000);
    for (const c of game.board.cells) {
      if (!c.isMine && c.state !== CELL_REVEALED) game.reveal(c.row, c.col);
    }
    expect(game.state).toBe(STATE.WON);
    expect(won.timeMs).toBe(3000);
    expect(won.mode).toBe('custom');
    expect(won.antiGuessActive).toBe(false);
    expect(won.rows).toBe(5);
    expect(won.cols).toBe(5);
    expect(won.mines).toBe(3);
    // 胜利后计时冻结
    const t = game.getElapsedMs();
    clock.advance(9999);
    expect(game.getElapsedMs()).toBe(t);
  });

  it('点到雷 → lose 事件，计时冻结', () => {
    const clock = makeClock();
    const game = createGame(CFG, { now: clock.now });
    let lost = null;
    game.on('lose', (p) => (lost = p));
    game.reveal(2, 2);
    clock.advance(1500);
    const mine = game.board.cells.find((c) => c.isMine);
    const r = game.reveal(mine.row, mine.col);
    expect(r.type).toBe('lose');
    expect(game.state).toBe(STATE.LOST);
    expect(lost.timeMs).toBe(1500);
    expect(game.board.cells[mine.idx].state).toBe(CELL_REVEALED);
    clock.advance(5000);
    expect(game.getElapsedMs()).toBe(1500);
  });

  it('终态忽略一切操作', () => {
    const game = createGame(CFG);
    game.reveal(2, 2);
    const mine = game.board.cells.find((c) => c.isMine);
    game.reveal(mine.row, mine.col);
    expect(game.state).toBe(STATE.LOST);
    expect(game.reveal(0, 0).type).toBe('noop');
    expect(game.chordLeft(2, 2).type).toBe('noop');
    expect(game.chordRight(2, 2).type).toBe('noop');
    expect(game.cycleMark(0, 0).type).toBe('noop');
  });
});

describe('防猜测三分支（mock solve）', () => {
  beforeEach(() => {
    vi.mocked(generateAntiGuess).mockReset();
  });

  it('可解 → antiGuessActive=true，无 warning', () => {
    vi.mocked(generateAntiGuess).mockReturnValue({ ok: true, mineSet: new Set([0, 1, 2]), attempts: 3 });
    const game = createGame({ ...CFG, mines: 3, antiGuess: true });
    let warning = null;
    game.on('warning', (w) => (warning = w));
    game.reveal(2, 2);
    expect(game.antiGuessActive).toBe(true);
    expect(game.warning).toBeNull();
    expect(warning).toBeNull();
    expect(game.board.cells[0].isMine).toBe(true);
    expect(game.board.cells[1].isMine).toBe(true);
    expect(game.board.cells[2].isMine).toBe(true);
  });

  it('密度超限 → antiGuessActive=false，warning 精确文案，回退普通布雷', () => {
    vi.mocked(generateAntiGuess).mockReturnValue({ ok: false, reason: 'density', mineSet: null, attempts: 0 });
    const game = createGame({ ...CFG, antiGuess: true });
    let warning = null;
    game.on('warning', (w) => (warning = w));
    game.reveal(2, 2);
    expect(game.antiGuessActive).toBe(false);
    expect(game.warning).toBe('防猜测已关闭：雷密度过高，无法保证无猜');
    expect(warning).toBe(game.warning);
    expect(game.board.minesPlaced).toBe(true);
    expect(game.board.cells.filter((c) => c.isMine).length).toBe(3);
    expect(game.board.cells[indexAt(5, 5, 2, 2)].isMine).toBe(false);
  });

  it('重排 20 次失败 → antiGuessActive=false，warning 精确文案，使用返回 mineSet', () => {
    vi.mocked(generateAntiGuess).mockReturnValue({ ok: false, reason: 'retries', mineSet: new Set([0, 1, 2]), attempts: 20 });
    const game = createGame({ ...CFG, mines: 3, antiGuess: true });
    let warning = null;
    game.on('warning', (w) => (warning = w));
    game.reveal(2, 2);
    expect(game.antiGuessActive).toBe(false);
    expect(game.warning).toBe('防猜测已关闭：重排 20 次仍无法保证无猜');
    expect(warning).toBe(game.warning);
    expect(game.board.cells[0].isMine).toBe(true);
    expect(game.board.cells[1].isMine).toBe(true);
    expect(game.board.cells[2].isMine).toBe(true);
  });

  it('防猜测关闭 → antiGuessActive=false，warning=null，不调用 solve', () => {
    const game = createGame(CFG);
    let warning = null;
    game.on('warning', (w) => (warning = w));
    game.reveal(2, 2);
    expect(game.antiGuessActive).toBe(false);
    expect(game.warning).toBeNull();
    expect(warning).toBeNull();
    expect(vi.mocked(generateAntiGuess)).not.toHaveBeenCalled();
  });
});

describe('chord 透传与雷数显示', () => {
  it('chordLeft 在数字格无旗时 noop', () => {
    const game = createGame(CFG);
    game.reveal(2, 2);
    // (2,2) count>0 但无旗 → noop
    expect(game.chordLeft(2, 2).type).toBe('noop');
  });

  it('getRemainingMines = max(0, mines - flagCount)，旗满 blocked', () => {
    const game = createGame(CFG);
    expect(game.getRemainingMines()).toBe(3);
    game.cycleMark(0, 0);
    game.cycleMark(0, 1);
    game.cycleMark(0, 2);
    expect(game.getRemainingMines()).toBe(0);
    const r = game.cycleMark(1, 1);
    expect(r.blocked).toBe(true);
    expect(game.board.cells[indexAt(5, 5, 1, 1)].state).toBe(CELL_HIDDEN);
    game.cycleMark(0, 2); // 旗→问号 释放
    expect(game.getRemainingMines()).toBe(1);
    expect(game.board.cells[indexAt(5, 5, 0, 2)].state).toBe(CELL_QUESTIONED);
  });
});
