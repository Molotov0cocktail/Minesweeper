// src/renderer/main.js
// 装配层：创建 game、绑定画布鼠标交互、缩放手柄、窗口自适应、UI 与 game 事件联动、
// v2（T12）：侧栏开合适配（fitToWindow 扣侧栏宽）、防猜测设置持久化（settings，依赖 T7）、
//           排行榜面板、安装/卸载向导 IPC 接线（依赖 T11，可选链降级）。

import { createGame, STATE } from '../core/game.js';
import { MODES, validateCustom } from '../core/modes.js';
import { createLeaderboard, LEADERBOARD_MODES } from '../core/leaderboard.js';
import { createSettings } from '../core/settings.js';
import { CELL_REVEALED } from '../core/board.js';
import { drawBoard } from './render.js';
import { createUI, formatTime } from './ui.js';

const MIN_CELL = 16;
const MAX_CELL = 48;
const SIDEBAR_WIDTH = 248; // 侧栏展开时棋盘可用宽扣减（详细设计 §6）

const app = document.getElementById('app');
const canvas = document.getElementById('board-canvas');
const scaleHandle = document.getElementById('scale-handle');

const leaderboard = createLeaderboard();
const settings = createSettings();

let game = null;
let cellSize = 24;
let pendingScore = null; // 待提交的胜利成绩
let installProgressUnsub = null; // 进度事件退订函数

// ---------- 缩放手柄拖拽状态 ----------
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartSize = MIN_CELL;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function isSidebarOpen() {
  return document.body.classList.contains('sidebar-open');
}

function settingsToUi(s) {
  return { method: s.antiGuessMethod, maxAttempts: s.maxAttempts, maxRegionAttempts: s.maxRegionAttempts };
}

// 输入框数值 → [1,200] 整数（与 settings 校验一致）
function clampAttempts(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? clamp(v, 1, 200) : 1;
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
  // 防猜测相关配置始终取最新持久化设置（settings），作用于当前与后续对局
  const s = settings.get();
  game = createGame({
    rows: config.rows,
    cols: config.cols,
    mines: config.mines,
    mode: config.mode,
    antiGuess: s.antiGuess,
    antiGuessMethod: s.antiGuessMethod,
    maxAttempts: s.maxAttempts,
    maxRegionAttempts: s.maxRegionAttempts,
  });
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

// ---------- 安装 / 卸载 IPC 辅助 ----------
function installerAPI() {
  return (window.minesweeperAPI && window.minesweeperAPI.installer) || null;
}

function subscribeProgress() {
  unsubscribeProgress();
  const api = installerAPI();
  if (!api || typeof api.onProgress !== 'function') return;
  installProgressUnsub = api.onProgress((p) => {
    if (p && typeof p.done === 'number' && typeof p.total === 'number') {
      ui.setInstallerProgress({ done: p.done, total: p.total, message: p.message || '' });
    }
  });
}

function unsubscribeProgress() {
  if (installProgressUnsub) {
    installProgressUnsub();
    installProgressUnsub = null;
  }
}

function wizardStep() {
  const el = document.getElementById('installer-step');
  return el ? el.dataset.step : null;
}

function openInstallerFlow() {
  const api = installerAPI();
  if (!api) {
    // 无 preload 环境（浏览器直接打开）：优雅降级提示
    ui.showBanner('当前环境不支持安装功能');
    return;
  }
  Promise.resolve(api.getStatus())
    .then((status) => {
      if (status && status.installed) {
        // 已安装 → 文案切换为“卸载”，二次确认后执行卸载
        ui.setInstallerLabel('卸载');
        const dir = status.installDir || '';
        if (window.confirm(`游戏已安装到 ${dir}，确定卸载吗？`)) {
          runUninstallFlow();
        }
      } else {
        ui.setInstallerLabel('安装到本机');
        ui.showInstallerWizard('welcome', { legacy: status && status.legacy });
      }
    })
    .catch(() => ui.showBanner('当前环境不支持安装功能'));
}

function runInstallFlow(opts) {
  const api = installerAPI();
  if (!api) {
    ui.showBanner('当前环境不支持安装功能');
    return;
  }
  const dir = (opts && opts.dir ? String(opts.dir) : '').trim();
  if (!dir) {
    ui.showInstallerWizard('dir', { error: '请填写安装目录' });
    return;
  }
  ui.showInstallerWizard('progress', {});
  subscribeProgress();
  Promise.resolve(
    api.install({
      dir,
      desktopShortcut: Boolean(opts && opts.desktopShortcut),
      startMenuShortcut: Boolean(opts && opts.startMenuShortcut),
    }),
  )
    .then((result) => {
      ui.showInstallerWizard('report', {});
      ui.showInstallerReport(result || { ok: false, errors: [] });
      if (result && result.ok) ui.setInstallerLabel('卸载');
    })
    .catch((err) => {
      ui.showInstallerWizard('report', {});
      ui.showInstallerReport({
        ok: false,
        errors: [{ code: 'IPC_FAIL', message: String((err && err.message) || err) }],
      });
    })
    .then(unsubscribeProgress);
}

function runUninstallFlow() {
  const api = installerAPI();
  if (!api) return;
  ui.showInstallerWizard('progress', {});
  subscribeProgress();
  Promise.resolve(api.uninstall())
    .then((result) => {
      ui.showInstallerWizard('report', {});
      ui.showInstallerReport(result || { ok: false, errors: [] });
      if (result && result.ok) ui.setInstallerLabel('安装到本机');
    })
    .catch((err) => {
      ui.showInstallerWizard('report', {});
      ui.showInstallerReport({
        ok: false,
        errors: [{ code: 'IPC_FAIL', message: String((err && err.message) || err) }],
      });
    })
    .then(unsubscribeProgress);
}

function runCleanLegacyFlow() {
  const api = installerAPI();
  if (!api) return;
  ui.showInstallerWizard('progress', {});
  subscribeProgress();
  Promise.resolve(api.cleanLegacy())
    .then((result) => {
      ui.showInstallerWizard('report', {});
      ui.showInstallerReport(result || { ok: false, errors: [] });
    })
    .catch((err) => {
      ui.showInstallerWizard('report', {});
      ui.showInstallerReport({
        ok: false,
        errors: [{ code: 'IPC_FAIL', message: String((err && err.message) || err) }],
      });
    })
    .then(unsubscribeProgress);
}

function suggestInstallDir() {
  const api = installerAPI();
  if (!api || typeof api.suggestDir !== 'function') return;
  Promise.resolve(api.suggestDir())
    .then((dir) => {
      if (typeof dir === 'string' && dir) ui.showInstallerWizard('dir', { dir });
    })
    .catch(() => {});
}

// ---------- 装配 actions ----------
const actions = {
  selectMode(mode) {
    const conf = MODES[mode];
    if (!conf) return;
    ui.setCustomError('');
    newGame({ rows: conf.rows, cols: conf.cols, mines: conf.mines, mode });
  },
  applyCustom(rows, cols, mines) {
    const result = validateCustom(rows, cols, mines);
    if (!result.ok) {
      ui.setCustomError(result.error);
      return;
    }
    ui.setCustomError('');
    newGame({ rows: result.rows, cols: result.cols, mines: result.mines, mode: 'custom' });
  },
  toggleAntiGuess(checked) {
    const s = settings.update({ antiGuess: Boolean(checked) });
    if (game) game.antiGuess = s.antiGuess;
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
  // ---------- v2：侧栏 / 防猜测设置 ----------
  toggleSidebar() {
    // body.sidebar-open 由 ui.js 切换；此处做棋盘适配
    fitToWindow();
  },
  setAntiGuessMethod(method) {
    const s = settings.update({ antiGuessMethod: method });
    ui.setAntiGuessSettings(settingsToUi(s));
    if (game) game.antiGuessMethod = s.antiGuessMethod;
  },
  setMaxAttempts(n) {
    const s = settings.update({ maxAttempts: clampAttempts(n) });
    ui.setAntiGuessSettings(settingsToUi(s));
    if (game) game.maxAttempts = s.maxAttempts;
  },
  setMaxRegionAttempts(n) {
    const s = settings.update({ maxRegionAttempts: clampAttempts(n) });
    ui.setAntiGuessSettings(settingsToUi(s));
    if (game) game.maxRegionAttempts = s.maxRegionAttempts;
  },
  // ---------- v2：排行榜面板 ----------
  openLeaderboard() {
    ui.showLeaderboard();
  },
  // ---------- v2：安装 / 卸载 ----------
  openInstaller() {
    openInstallerFlow();
  },
  wizardNext() {
    const step = wizardStep();
    if (step === 'welcome') {
      const api = installerAPI();
      if (api && typeof api.suggestDir === 'function') {
        Promise.resolve(api.suggestDir())
          .then((dir) => ui.showInstallerWizard('dir', { dir: typeof dir === 'string' ? dir : '' }))
          .catch(() => ui.showInstallerWizard('dir', {}));
      } else {
        ui.showInstallerWizard('dir', {});
      }
    } else if (step === 'dir') {
      ui.showInstallerWizard('options', {});
    }
  },
  wizardBack() {
    const step = wizardStep();
    if (step === 'dir') ui.showInstallerWizard('welcome', {});
    else if (step === 'options') ui.showInstallerWizard('dir', {});
  },
  wizardCancel() {
    // 向导隐藏由 ui.js 负责（cancel/close 按钮）；此处清理进度订阅等
    unsubscribeProgress();
  },
  suggestDir() {
    suggestInstallDir();
  },
  runInstall(opts) {
    runInstallFlow(opts);
  },
  runUninstall() {
    runUninstallFlow();
  },
  runCleanLegacy() {
    runCleanLegacyFlow();
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
  // 侧栏展开时可用宽再扣 248px
  const sidebarPad = isSidebarOpen() ? SIDEBAR_WIDTH : 0;
  const availW = window.innerWidth - 56 - sidebarPad; // 页面左右留白
  const availH = window.innerHeight - 220; // 标题 + 控件 + 底部留白
  cellSize = clamp(Math.floor(Math.min(availW / game.cols, availH / game.rows)), MIN_CELL, MAX_CELL);
  render();
}
window.addEventListener('resize', fitToWindow);

// ---------- 启动：设置回填 + 默认初级对局 ----------
const initialSettings = settings.get();
ui.setAntiGuessSettings(settingsToUi(initialSettings));
const agToggleEl = document.getElementById('anti-guess-toggle');
if (agToggleEl) agToggleEl.checked = initialSettings.antiGuess;

newGame({
  rows: MODES.beginner.rows,
  cols: MODES.beginner.cols,
  mines: MODES.beginner.mines,
  mode: 'beginner',
});
fitToWindow();

// 计时 / 剩余雷数持续刷新
setInterval(render, 200);
