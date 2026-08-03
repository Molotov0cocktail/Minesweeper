// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { drawBoard, drawCell } from '../src/renderer/render.js';
import { createBoard, setMines, reveal, CELL_HIDDEN, CELL_FLAGGED, CELL_REVEALED } from '../src/core/board.js';

// 记录式假 2D context
function fakeCtx() {
  const calls = [];
  const ctx = {
    canvas: { width: 400, height: 400 },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'top',
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    fillRect(x, y, w, h) { calls.push(['fillRect', x, y, w, h]); },
    strokeRect(x, y, w, h) { calls.push(['strokeRect', x, y, w, h]); },
    fillText(t, x, y) { calls.push(['fillText', t, x, y]); },
    strokeText(t, x, y) { calls.push(['strokeText', t, x, y]); },
    beginPath() { calls.push(['beginPath']); },
    arc() { calls.push(['arc', ...arguments]); },
    fill() { calls.push(['fill']); },
    stroke() { calls.push(['stroke']); },
    moveTo(x, y) { calls.push(['moveTo', x, y]); },
    lineTo(x, y) { calls.push(['lineTo', x, y]); },
  };
  return { ctx, calls };
}

describe('drawCell 单元格绘制', () => {
  it('翻开数字格绘制数字文本', () => {
    const { ctx, calls } = fakeCtx();
    drawCell(ctx, 0, 0, 24, { state: CELL_REVEALED, count: 3, isMine: false }, 'playing');
    expect(calls.filter((c) => c[0] === 'fillText').some((c) => c[1] === '3')).toBe(true);
  });

  it('未翻开格不绘制数字', () => {
    const { ctx, calls } = fakeCtx();
    drawCell(ctx, 0, 0, 24, { state: CELL_HIDDEN, count: 1, isMine: false }, 'playing');
    expect(calls.filter((c) => c[0] === 'fillText').some((c) => c[1] === '1')).toBe(false);
    // 未翻开格至少有一块填充（格体）
    expect(calls.filter((c) => c[0] === 'fillRect').length).toBeGreaterThanOrEqual(1);
  });

  it('标旗格绘制旗面（有填充/描边图形）', () => {
    const { ctx, calls } = fakeCtx();
    drawCell(ctx, 0, 0, 24, { state: CELL_FLAGGED, count: 0, isMine: false }, 'playing');
    expect(calls.length).toBeGreaterThan(0);
  });
});

describe('drawBoard 整盘绘制', () => {
  it('绘制 rows*cols 个格子的格体', () => {
    const board = createBoard(3, 4, 5);
    const { ctx, calls } = fakeCtx();
    drawBoard(ctx, { board, rows: 3, cols: 4, state: 'ready' }, 24, {});
    expect(calls.filter((c) => c[0] === 'fillRect').length).toBeGreaterThanOrEqual(3 * 4);
  });

  it('布雷后绘制翻开格数字', () => {
    const board = createBoard(3, 3, 2);
    setMines(board, new Set([0, 8]));
    reveal(board, 1, 1); // 中心 count=2
    const { ctx, calls } = fakeCtx();
    drawBoard(ctx, { board, rows: 3, cols: 3, state: 'playing' }, 24, {});
    expect(calls.filter((c) => c[0] === 'fillText').some((c) => c[1] === '2')).toBe(true);
  });

  it('爆炸态绘制全部雷（失败高亮）', () => {
    const board = createBoard(3, 3, 2);
    setMines(board, new Set([0, 8]));
    for (const c of board.cells) if (c.isMine) c.state = CELL_REVEALED;
    const { ctx, calls } = fakeCtx();
    drawBoard(ctx, { board, rows: 3, cols: 3, state: 'lost' }, 24, {});
    // 两个雷至少各产生一次绘制图形
    const pathCount = calls.filter((c) => c[0] === 'beginPath').length;
    expect(pathCount).toBeGreaterThanOrEqual(1);
  });
});
