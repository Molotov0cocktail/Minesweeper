// src/renderer/main.js
// 装配层：创建 game、绑定画布鼠标交互、缩放手柄、窗口自适应、UI 与 game 事件联动。

import { createGame, STATE } from '../core/game.js';
import { MODES, validateCustom } from '../core/modes.js';
import { createLeaderboard, LEADERBOARD_MODES } from '../core/leaderboard.js';
import { CELL_REVEALED } from '../core/board.js';
import { drawBoard } from './render.js';
import { createUI, formatTime } from './ui.js';

const MIN_CELL = 16;
const MAX_CELL = 48;

const app = document.getElementById('app');
const canvas = document.getElementById('board-canvas');
const scaleHandle = document.getElementById('scale-handle');

const leaderboard = createLeaderboard();

let game = null;
let cellSize = 24;
let antiGuessSetting = true; // 用户设置的防猜测开关（跨对局保持）
let pendingScore = null; // 待提交的胜利成绩

// ---------- 缩放手柄拖拽状态 ----------
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartSize = MIN_CELL;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function render() {
  if (!game) return;
  const w = game.cols * cellSize;
  const h = game.rows * cellSize;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  drawBoard(canvas.getContext('2d'), game, cellSize, {});
  ui.setMineCount(game.getRemainingMines());
  ui.setTime(game.getElapsedMs());
  updateAntiGuessStatus();
}

function updateAntiGuessStatus() {
  if (!game) return;
  // READY 阶段防猜测尚未生效，按开关设置显示；对局开始后按实际生效与否显示
  const active = game.state === STATE.READY ? game.antiGuess : game.antiGuessActive;
  ui.setAntiGuessActive(active);
}

function newGame(config) {
  game = createGame(config);
  game.on('win', onWin);
  game.on('lose', onLose);
  game.on('warning', (warning) => ui.showBanner(warning));
  pendingScore = null;
  ui.setPauseOverlay(false);
  ui.hideBanner();
  render();
}

function onWin(payload) {
  render();
  // 自定义模式不计入排行榜（FR1.3 / FR7.1）
  if (!LEADERBOARD_MODES.includes(payload.mode)) {
    ui.showBanner(`恭喜胜利！用时 ${formatTime(payload.timeMs)}`);
    return;
  }
  if (leaderboard.isTopTen(payload.mode, payload.antiGuessActive, payload.timeMs)) {
    pendingScore = payload;
    ui.showNicknamePrompt(payload);
  } else {
    ui.showLeaderboard('未进入该榜单前 10 名，成绩未上榜');
  }
}

function onLose() {
  render();
}

const actions = {
  selectMode(mode) {
    const conf = MODES[mode];
    if (!conf) return;
    ui.setCustomError('');
    newGame({
      rows: conf.rows,
      cols: conf.cols,
      mines: conf.mines,
      antiGuess: antiGuessSetting,
      mode,
    });
  },
  applyCustom(rows, cols, mines) {
    const result = validateCustom(rows, cols, mines);
    if (!result.ok) {
      ui.setCustomError(result.error);
      return;
    }
    ui.setCustomError('');
    newGame({
      rows: result.rows,
      cols: result.cols,
      mines: result.mines,
      antiGuess: antiGuessSetting,
      mode: 'custom',
    });
  },
  toggleAntiGuess(checked) {
    antiGuessSetting = Boolean(checked);
    if (game) game.antiGuess = antiGuessSetting;
    updateAntiGuessStatus();
  },
  pause() {
    game.pause();
    ui.setPauseOverlay(game.state === STATE.PAUSED);
    render();
  },
  resume() {
    game.resume();
    ui.setPauseOverlay(false);
    render();
  },
  restart() {
    ui.hideBanner();
    game.restart();
    render();
  },
  submitNickname(nickname) {
    if (!pendingScore) return;
    const { mode, antiGuessActive, timeMs } = pendingScore;
    const result = leaderboard.addScore(mode, antiGuessActive, nickname, timeMs);
    leaderboard.setLastNickname(nickname);
    pendingScore = null;
    ui.showLeaderboard(result.added ? undefined : '未进入该榜单前 10 名，成绩未上榜');
  },
};

const ui = createUI(app, {
  leaderboard,
  getState: () => (game ? { mode: game.mode, antiGuessActive: game.antiGuessActive } : null),
  actions,
});

// ---------- 鼠标交互 ----------
function cellFromEvent(e) {
  if (!game) return null;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const col = Math.floor(x / cellSize);
  const row = Math.floor(y / cellSize);
  if (row < 0 || col < 0 || row >= game.rows || col >= game.cols) return null;
  return { row, col };
}

canvas.addEventListener('mousedown', (e) => {
  const pos = cellFromEvent(e);
  if (!pos || !game) return;
  const cell = game.board.cells[pos.row * game.cols + pos.col];
  if (e.button === 0) {
    // 左键：已翻开格 → chord，未翻开格 → 翻开
    if (cell.state === CELL_REVEALED) game.chordLeft(pos.row, pos.col);
    else game.reveal(pos.row, pos.col);
  } else if (e.button === 2) {
    // 右键：已翻开格 → 镜像 chord，未翻开格 → 循环标记
    if (cell.state === CELL_REVEALED) game.chordRight(pos.row, pos.col);
    else game.cycleMark(pos.row, pos.col);
  }
  render();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- 缩放手柄拖拽（cellSize ∈ [16,48] 连续变化） ----------
scaleHandle.addEventListener('mousedown', (e) => {
  dragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartSize = cellSize;
  e.preventDefault();
  e.stopPropagation();
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const adx = Math.abs(e.clientX - dragStartX);
  const ady = Math.abs(e.clientY - dragStartY);
  // 以主导方向轴的位移决定缩放量（右/下增大，左/上减小）
  const delta = adx >= ady ? e.clientX - dragStartX : e.clientY - dragStartY;
  cellSize = clamp(dragStartSize + Math.round(delta / 3), MIN_CELL, MAX_CELL);
  render();
});
window.addEventListener('mouseup', () => {
  dragging = false;
});

// ---------- 窗口自适应 ----------
function fitToWindow() {
  if (!game) return;
  const availW = window.innerWidth - 56; // 页面左右留白
  const availH = window.innerHeight - 220; // 标题 + 控件 + 底部留白
  cellSize = clamp(Math.floor(Math.min(availW / game.cols, availH / game.rows)), MIN_CELL, MAX_CELL);
  render();
}
window.addEventListener('resize', fitToWindow);

// ---------- 启动：默认初级 + 防猜测开启 ----------
newGame({
  rows: MODES.beginner.rows,
  cols: MODES.beginner.cols,
  mines: MODES.beginner.mines,
  antiGuess: true,
  mode: 'beginner',
});
fitToWindow();

// 计时 / 剩余雷数持续刷新
setInterval(render, 200);
