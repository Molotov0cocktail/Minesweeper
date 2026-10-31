// src/renderer/render.js
// 经典 Windows 扫雷 3D 浮雕风绘制（纯 Canvas 2D，无事件，零 DOM 依赖）
// 未开=凸起、翻开=凹下、旗、问号、雷、经典数字配色；支持失败/胜利高亮。

import {
  CELL_HIDDEN,
  CELL_FLAGGED,
  CELL_QUESTIONED,
  CELL_REVEALED,
} from '../core/board.js';
import { drawMineGlyph } from './mine-glyph.js';

const COLORS = {
  face: '#c0c0c0', // 经典灰
  faceLight: '#ffffff', // 高光
  faceDark: '#808080', // 深灰边
  faceBlack: '#000000', // 最暗阴影
  mine: '#26384d',
  flag: '#ff0000',
  pole: '#000000',
  question: '#0000ff',
  highlight: '#c94e43', // 失败警戒底
  number: [
    null,
    '#0000ff', // 1 蓝
    '#008000', // 2 绿
    '#ff0000', // 3 红
    '#000080', // 4 深蓝
    '#800000', // 5 深红
    '#008080', // 6 青
    '#000000', // 7 黑
    '#808080', // 8 灰
  ],
};

/**
 * 绘制单个格子（经典 3D 浮雕风）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x 左上角 x
 * @param {number} y 左上角 y
 * @param {number} size 边长（px）
 * @param {{ idx:number,row:number,col:number,isMine:boolean,count:number,state:string }} cell
 * @param {string} gameState 'ready' | 'playing' | 'paused' | 'won' | 'lost'
 * @param {{ colors?:object, bevel?:number }} [opts]
 */
export function drawCell(ctx, x, y, size, cell, gameState, opts = {}) {
  const colors = { ...COLORS, ...(opts.colors || {}) };
  const bevel = typeof opts.bevel === 'number' ? opts.bevel : 0.1;
  const s = size;

  // 格体底色
  ctx.fillStyle = colors.face;
  ctx.fillRect(x, y, s, s);

  switch (cell.state) {
    case CELL_HIDDEN:
      drawRaised(ctx, x, y, s, colors, bevel);
      // 胜利时未翻开的雷自动补旗（经典结算表现）
      if (gameState === 'won' && cell.isMine) drawFlag(ctx, x, y, s, colors);
      return;
    case CELL_FLAGGED:
      drawRaised(ctx, x, y, s, colors, bevel);
      drawFlag(ctx, x, y, s, colors);
      return;
    case CELL_QUESTIONED:
      drawRaised(ctx, x, y, s, colors, bevel);
      drawQuestion(ctx, x, y, s, colors);
      return;
    case CELL_REVEALED: {
      drawSunken(ctx, x, y, s, colors, bevel);
      if (cell.isMine) {
        drawMineGlyph(ctx, x, y, s, {
          color: colors.mine,
          lost: gameState === 'lost',
          danger: colors.highlight,
        });
        return;
      }
      if (cell.count > 0) {
        ctx.fillStyle = colors.number[cell.count] || colors.number[1];
        ctx.font = `${Math.round(s * 0.55)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(cell.count), x + s / 2, y + s / 2 + Math.ceil(s * 0.02));
      }
    }
  }
}

/**
 * 整盘绘制：按 col*size,row*size 逐个定位绘制所有格子。
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ board:object, rows?:number, cols?:number, state:string }} game
 * @param {number} cellSize
 * @param {{ colors?:object, bevel?:number }} [opts]
 */
export function drawBoard(ctx, game, cellSize, opts = {}) {
  const board = game.board;
  for (const cell of board.cells) {
    drawCell(ctx, cell.col * cellSize, cell.row * cellSize, cellSize, cell, game.state, opts);
  }
}

/* ---------- 内部绘制原语 ---------- */

function drawRaised(ctx, x, y, s, colors, bevel) {
  const t = Math.max(1, Math.round(s * bevel));
  ctx.fillStyle = colors.faceLight;
  ctx.fillRect(x, y, s - t, t); // 上边亮
  ctx.fillRect(x, y, t, s - t); // 左边亮
  ctx.fillStyle = colors.faceDark;
  ctx.fillRect(x + t, y + s - t, s - t, t); // 下边暗
  ctx.fillRect(x + s - t, y + t, t, s - t); // 右边暗
  ctx.fillStyle = colors.faceBlack;
  ctx.fillRect(x + t, y + s - t, t, t); // 右下角最暗
}

function drawSunken(ctx, x, y, s, colors, bevel) {
  const t = Math.max(1, Math.round(s * bevel));
  ctx.fillStyle = colors.faceDark;
  ctx.fillRect(x, y, s - t, t); // 上边暗
  ctx.fillRect(x, y, t, s - t); // 左边暗
  ctx.fillStyle = colors.faceLight;
  ctx.fillRect(x + t, y + s - t, s - t, t); // 下边亮
  ctx.fillRect(x + s - t, y + t, t, s - t); // 右边亮
}

function drawFlag(ctx, x, y, s, colors) {
  const poleX = x + s * 0.6;
  const poleTop = y + s * 0.2;
  const poleBottom = y + s * 0.78;
  ctx.strokeStyle = colors.pole;
  ctx.lineWidth = Math.max(1, Math.round(s * 0.06));
  ctx.beginPath();
  ctx.moveTo(poleX, poleBottom);
  ctx.lineTo(poleX, poleTop);
  ctx.stroke();
  // 旗面（红三角）
  ctx.beginPath();
  ctx.moveTo(poleX, poleTop);
  ctx.lineTo(poleX + s * 0.22, poleTop + s * 0.08);
  ctx.lineTo(poleX, poleTop + s * 0.18);
  ctx.fillStyle = colors.flag;
  ctx.fill(); // fill 自动闭合路径
  // 底座
  ctx.fillStyle = colors.pole;
  ctx.fillRect(x + s * 0.36, y + s * 0.72, s * 0.28, s * 0.06);
}

function drawQuestion(ctx, x, y, s, colors) {
  ctx.fillStyle = colors.question;
  ctx.font = `bold ${Math.round(s * 0.5)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', x + s / 2, y + s / 2 + Math.ceil(s * 0.02));
}
