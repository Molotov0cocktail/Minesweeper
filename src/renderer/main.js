// 游戏装配：事件驱动绘制、键盘与鼠标、设置、缩放、排行榜。
// Electron 安装接口已独立；本模块不依赖主进程，DOM 根节点存在时才自动启动。
import { createGame, STATE } from '../core/game.js';
import { MODES, validateCustom } from '../core/modes.js';
import { createLeaderboard, LEADERBOARD_MODES } from '../core/leaderboard.js';
import { createSettings } from '../core/settings.js';
import { DEFAULT_GAMEPAD_BINDINGS, rebindGamepad } from '../core/gamepad.js';
import { CELL_REVEALED, CELL_FLAGGED, CELL_QUESTIONED } from '../core/board.js';
import { drawBoard } from './render.js';
import { createUI, formatTime } from './ui.js';
import { startGamepad } from './gamepad.js';
import { createGenerationClient } from './generation-client.js';

const MIN_CELL = 16;
const SIDEBAR_WIDTH = 248;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** 启动一个游戏界面；destroy 清理计时器、监听器并恢复原来的棋盘容器。 */
export function startApp({
  host = globalThis.document?.getElementById('app'),
  storage = globalThis.localStorage,
  generationClient,
  gamepadFactory = startGamepad,
} = {}) {
  const canvas = host?.querySelector('#board-canvas');
  const boardWrap = host?.querySelector('#board-wrap');
  const scaleHandle = host?.querySelector('#scale-handle');
  if (!canvas || !boardWrap || !scaleHandle) return { destroy() {} };

  const originalChildren = [...host.childNodes];
  const leaderboard = createLeaderboard(storage);
  const settings = createSettings(storage);
  const client = generationClient === undefined
    ? (typeof globalThis.Worker === 'function' ? createGenerationClient() : null)
    : generationClient;
  const prepareBoard = typeof client?.prepare === 'function' ? client.prepare.bind(client) : undefined;
  const cleanups = [];
  let destroyed = false;
  let game = null;
  let cellSize = 24;
  let preferredCellSize = null;
  let pendingScore = null;
  let selection = { row: 0, col: 0 };
  let drag = null;
  let background = false;
  let focused = true;

  function listen(target, type, handler) {
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  }

  function settingsToUi(s) {
    return { maxRegionAttempts: s.maxRegionAttempts };
  }

  function clampAttempts(value) {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? clamp(number, 1, 200) : 1;
  }

  const focusMarker = document.createElement('div');
  focusMarker.id = 'board-focus';
  focusMarker.className = 'hidden';
  focusMarker.setAttribute('aria-hidden', 'true');
  boardWrap.appendChild(focusMarker);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'group');
  canvas.removeAttribute('aria-describedby');
  // 显式使用内容盒，边框不压缩逻辑格子，也不计入指针坐标。
  canvas.style.boxSizing = 'content-box';

  function updateSelection() {
    if (!game || destroyed) return;
    selection.row = clamp(selection.row, 0, game.rows - 1);
    selection.col = clamp(selection.col, 0, game.cols - 1);
    const cell = game.board.cells[selection.row * game.cols + selection.col];
    let description = '未翻开';
    if (cell.state === CELL_FLAGGED) description = '已标旗';
    else if (cell.state === CELL_QUESTIONED) description = '问号';
    else if (cell.state === CELL_REVEALED) description = cell.isMine ? '地雷' : cell.count ? `周围 ${cell.count} 个雷` : '空格';
    canvas.setAttribute('aria-label', game.state === STATE.PAUSED
      ? '扫雷棋盘，已暂停'
      : `扫雷棋盘，第 ${selection.row + 1} 行，第 ${selection.col + 1} 列，${description}`);
    const style = getComputedStyle(canvas);
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    focusMarker.style.left = `${canvas.offsetLeft + borderLeft + selection.col * cellSize}px`;
    focusMarker.style.top = `${canvas.offsetTop + borderTop + selection.row * cellSize}px`;
    focusMarker.style.width = `${cellSize}px`;
    focusMarker.style.height = `${cellSize}px`;
    focusMarker.classList.toggle('hidden', document.activeElement !== canvas || game.state === STATE.PAUSED);
  }

  function updateAntiGuessStatus() {
    const active = game.state === STATE.READY ? game.antiGuess : game.antiGuessActive;
    ui.setAntiGuessActive(active);
  }

  function updateGameStatus() {
    ui.setGameStatus({
      state: game.state,
      mode: game.mode,
      rows: game.rows,
      cols: game.cols,
      mines: game.mines,
      revealedCount: game.board.cells.filter(cell => cell.state === CELL_REVEALED && !cell.isMine).length,
    });
  }

  function render() {
    if (!game || destroyed) return;
    const width = game.cols * cellSize;
    const height = game.rows * cellSize;
    const dpr = Math.max(1, Number(window.devicePixelRatio) || 1);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
      drawBoard(ctx, game, cellSize, {});
    }
    ui.setMineCount(game.getRemainingMines());
    ui.setTime(game.getElapsedMs());
    ui.setBoardSize(preferredCellSize ?? 0);
    updateGameStatus();
    updateAntiGuessStatus();
    updateSelection();
  }

  function fitToWindow() {
    if (!game || destroyed) return;
    // 规格和状态会影响换行高度：先回填，再测量真实剩余空间。
    updateGameStatus();
    if (preferredCellSize !== null) {
      cellSize = preferredCellSize;
      render();
      return;
    }
    const sidebar = document.body.classList.contains('sidebar-open') ? SIDEBAR_WIDTH : 0;
    let availableWidth = window.innerWidth - 56 - sidebar;
    let availableHeight = window.innerHeight - 220;
    const mainArea = host.querySelector('.ms-main');
    const mainStyle = getComputedStyle(mainArea);
    const wrapStyle = getComputedStyle(boardWrap);
    const canvasStyle = getComputedStyle(canvas);
    const pixels = (style, property) => parseFloat(style[property]) || 0;
    const horizontalExtras = style => pixels(style, 'paddingLeft') + pixels(style, 'paddingRight')
      + pixels(style, 'borderLeftWidth') + pixels(style, 'borderRightWidth');
    const verticalExtras = style => pixels(style, 'paddingTop') + pixels(style, 'paddingBottom')
      + pixels(style, 'borderTopWidth') + pixels(style, 'borderBottomWidth');
    if (mainArea.clientWidth > 0) {
      availableWidth = mainArea.clientWidth - pixels(mainStyle, 'paddingLeft') - pixels(mainStyle, 'paddingRight')
        - horizontalExtras(wrapStyle) - horizontalExtras(canvasStyle);
    }
    if (mainArea.clientHeight > 0) {
      const blocks = [...mainArea.children].filter(element => !element.hidden && !element.classList.contains('hidden')
        && getComputedStyle(element).display !== 'none');
      const otherHeight = blocks.filter(element => element !== boardWrap).reduce((height, element) => {
        const style = getComputedStyle(element);
        return height + element.offsetHeight + pixels(style, 'marginTop') + pixels(style, 'marginBottom');
      }, 0);
      const gaps = Math.max(0, blocks.length - 1) * pixels(mainStyle, 'rowGap');
      availableHeight = mainArea.clientHeight - pixels(mainStyle, 'paddingTop') - pixels(mainStyle, 'paddingBottom')
        - otherHeight - gaps - verticalExtras(wrapStyle) - verticalExtras(canvasStyle);
    }
    // 极小窗口仍保留可辨识的格子；主区域可滚动到全部棋盘与提示。
    cellSize = Math.max(MIN_CELL, Math.floor(Math.min(availableWidth / game.cols, availableHeight / game.rows)));
    render();
  }

  function newGame(config) {
    // 先让旧对局失效，再拒绝旧 Worker 请求，防止取消被当作普通生成失败回退。
    game?.cancelGeneration?.();
    client?.cancel();
    const currentSettings = settings.get();
    game = createGame({ ...config, ...currentSettings }, prepareBoard ? { prepareBoard } : {});
    const currentGame = game;
    game.on('win', onWin);
    game.on('lose', render);
    game.on('warning', warning => { if (!destroyed) ui.showBanner(warning); });
    game.on('generated', () => {
      if (destroyed || game !== currentGame) return;
      if ((background || document.hidden) && game.state === STATE.PLAYING) actions.pause();
      fitToWindow();
    });
    pendingScore = null;
    selection = { row: 0, col: 0 };
    drag = null;
    preferredCellSize = null;
    ui.resetTransient();
    ui.hideBanner();
    fitToWindow();
  }

  function onWin(payload) {
    if (destroyed) return;
    render();
    if (!LEADERBOARD_MODES.includes(payload.mode)) {
      ui.showBanner(`恭喜胜利！用时 ${formatTime(payload.timeMs)}`);
    } else if (leaderboard.isTopTen(payload.mode, payload.antiGuessActive, payload.timeMs)) {
      pendingScore = payload;
      ui.showNicknamePrompt(payload);
    } else {
      ui.showLeaderboard('未进入该榜单前 10 名，成绩未上榜');
    }
  }

  const actions = {
    selectMode(mode) {
      const conf = MODES[mode];
      if (!conf) return;
      ui.setCustomError('');
      newGame({ rows: conf.rows, cols: conf.cols, mines: conf.mines, mode });
    },
    applyCustom(rows, cols, mines) {
      const result = validateCustom(rows, cols, mines);
      if (!result.ok) { ui.setCustomError(result.error); return; }
      ui.setCustomError('');
      newGame({ rows: result.rows, cols: result.cols, mines: result.mines, mode: 'custom' });
    },
    toggleAntiGuess(checked) {
      const value = settings.update({ antiGuess: Boolean(checked) });
      game.antiGuess = value.antiGuess;
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
      newGame({ rows: game.rows, cols: game.cols, mines: game.mines, mode: game.mode });
    },
    submitNickname(nickname) {
      if (!pendingScore) return;
      const { mode, antiGuessActive, timeMs } = pendingScore;
      const result = leaderboard.addScore(mode, antiGuessActive, nickname, timeMs);
      leaderboard.setLastNickname(nickname);
      pendingScore = null;
      ui.showLeaderboard(result.added ? undefined : '未进入该榜单前 10 名，成绩未上榜');
    },
    toggleSidebar: fitToWindow,
    setMaxRegionAttempts(number) {
      const value = settings.update({ maxRegionAttempts: clampAttempts(number) });
      ui.setAntiGuessSettings(settingsToUi(value));
      game.maxRegionAttempts = value.maxRegionAttempts;
    },
    setGamepadBinding(action, button) {
      const next = rebindGamepad(settings.get().gamepadBindings, action, button);
      const value = settings.update({ gamepadBindings: next });
      ui.setGamepadBindings(value.gamepadBindings);
    },
    resetGamepadBindings() {
      const value = settings.update({ gamepadBindings: DEFAULT_GAMEPAD_BINDINGS });
      ui.setGamepadBindings(value.gamepadBindings);
    },
    setFocusView(enabled) {
      const value = settings.update({ focusView: Boolean(enabled) });
      ui.setFocusView(value.focusView);
      fitToWindow();
    },
    setBoardSize(value) {
      if (!Number.isSafeInteger(value) || (value !== 0 && value < MIN_CELL)) return;
      preferredCellSize = value === 0 ? null : value;
      fitToWindow();
    },
    openLeaderboard() { ui.showLeaderboard(); },
  };

  const ui = createUI(host, {
    leaderboard,
    getState: () => game ? { mode: game.mode, antiGuessActive: game.state === STATE.READY ? game.antiGuess : game.antiGuessActive } : null,
    actions,
  });

  function visible(id) {
    const element = host.querySelector(`#${id}`);
    return element && !element.classList.contains('hidden');
  }

  function hasModal() { return visible('pause-overlay') || visible('nickname-modal'); }

  function isTextInput(target) {
    return !!target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
  }

  function moveSelection(rowDelta, colDelta) {
    selection.row = clamp(selection.row + rowDelta, 0, game.rows - 1);
    selection.col = clamp(selection.col + colDelta, 0, game.cols - 1);
    updateSelection();
    focusMarker.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  function controllerEnabled() {
    if (destroyed || background || document.hidden) return false;
    // 菜单、页面和模态内的输入交给 UI 编辑；范围外的输入框不接管。
    return ui.hasControllerContext() || !isTextInput(document.activeElement);
  }

  function handleController(action) {
    if (!controllerEnabled()) return;
    if (ui.handleController(action)) return;
    const directions = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
    if (directions[action]) {
      canvas.focus({ preventScroll: true });
      moveSelection(...directions[action]);
    } else if (action === 'reveal' || action === 'mark') {
      canvas.focus({ preventScroll: true });
      operateCell(selection, action === 'mark');
    } else if (action === 'pause') actions.pause();
    else if (action === 'restart') {
      actions.restart();
      canvas.focus({ preventScroll: true });
    }
  }

  function operateCell(pos, mark) {
    const cell = game.board.cells[pos.row * game.cols + pos.col];
    if (mark) {
      if (cell.state === CELL_REVEALED) game.chordRight(pos.row, pos.col);
      else game.cycleMark(pos.row, pos.col);
    } else if (cell.state === CELL_REVEALED) game.chordLeft(pos.row, pos.col);
    else game.reveal(pos.row, pos.col);
    render();
  }

  function cellFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const style = getComputedStyle(canvas);
    const left = parseFloat(style.borderLeftWidth) || 0;
    const right = parseFloat(style.borderRightWidth) || 0;
    const top = parseFloat(style.borderTopWidth) || 0;
    const bottom = parseFloat(style.borderBottomWidth) || 0;
    const width = rect.width - left - right;
    const height = rect.height - top - bottom;
    const x = event.clientX - rect.left - left;
    const y = event.clientY - rect.top - top;
    if (!(width > 0 && height > 0) || x < 0 || y < 0 || x >= width || y >= height) return null;
    return { row: Math.floor(y / height * game.rows), col: Math.floor(x / width * game.cols) };
  }

  listen(canvas, 'mousedown', event => {
    if (hasModal() || (event.button !== 0 && event.button !== 2)) return;
    const pos = cellFromEvent(event);
    if (!pos) return;
    event.preventDefault();
    selection = pos;
    canvas.focus({ preventScroll: true });
    operateCell(pos, event.button === 2);
  });
  listen(canvas, 'contextmenu', event => event.preventDefault());
  listen(canvas, 'focus', updateSelection);
  listen(canvas, 'blur', updateSelection);

  listen(document, 'keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key === 'f1' || key === 'f10' || key === 'escape') {
      if (event.repeat) return;
      const action = key === 'f1' ? 'help' : key === 'f10' ? 'focus' : 'cancel';
      if (ui.handleController(action)) event.preventDefault();
      return;
    }
    if (isTextInput(event.target)) return;
    if (hasModal()) {
      // 暂停遮罩仅允许 P 继续；昵称弹窗等其他情形不接管游戏快捷键。
      if (key === 'p' && !event.repeat && game.state === STATE.PAUSED && !visible('nickname-modal')) {
        event.preventDefault(); actions.resume();
      }
      return;
    }
    if (key === 'f2' || key === 'p') {
      event.preventDefault();
      if (event.repeat) return;
      if (key === 'f2') actions.restart();
      else if (game.state === STATE.PAUSED) actions.resume();
      else actions.pause();
      return;
    }
    if (document.activeElement !== canvas) return;
    const arrows = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };
    if (arrows[key]) {
      event.preventDefault();
      moveSelection(...arrows[key]);
    } else if (key === 'enter' || key === ' ' || key === 'f') {
      event.preventDefault();
      if (!event.repeat) operateCell(selection, key === 'f');
    }
  });

  listen(scaleHandle, 'mousedown', event => {
    if (event.button !== 0 || hasModal()) return;
    drag = { x: event.clientX, y: event.clientY, size: cellSize };
    event.preventDefault();
    event.stopPropagation();
  });
  listen(window, 'mousemove', event => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
    const nextSize = Math.max(MIN_CELL, drag.size + Math.round(delta / 3));
    if (!Number.isSafeInteger(nextSize)) return;
    preferredCellSize = nextSize;
    cellSize = preferredCellSize;
    render();
  });
  listen(window, 'mouseup', () => { drag = null; });
  listen(window, 'resize', fitToWindow);
  listen(host, 'ui-layout-change', fitToWindow);
  for (const details of host.querySelectorAll('#controls-help details')) listen(details, 'toggle', fitToWindow);

  function pauseInBackground() {
    background = true;
    drag = null;
    if (game.state === STATE.PLAYING) actions.pause();
  }
  listen(window, 'blur', () => { focused = false; pauseInBackground(); });
  listen(window, 'focus', () => { focused = true; background = Boolean(document.hidden); });
  listen(document, 'visibilitychange', () => {
    if (document.hidden) pauseInBackground();
    else background = !focused;
  });

  const initialSettings = settings.get();
  ui.setAntiGuessSettings(settingsToUi(initialSettings));
  ui.setGamepadBindings(initialSettings.gamepadBindings);
  ui.setFocusView(initialSettings.focusView);
  host.querySelector('#anti-guess-toggle').checked = initialSettings.antiGuess;
  newGame({ rows: MODES.beginner.rows, cols: MODES.beginner.cols, mines: MODES.beginner.mines, mode: 'beginner' });
  // 时钟只刷新文本；棋盘由操作、缩放、resize 等事件驱动重画。
  const timer = setInterval(() => {
    if (!destroyed) ui.setTime(game.getElapsedMs());
  }, 200);
  const stopGamepad = gamepadFactory({
    onAction: handleController,
    onStatus(status) { if (!destroyed) ui.setControllerStatus(status); },
    isEnabled: controllerEnabled,
    getBindings: () => settings.get().gamepadBindings,
  });

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      game?.cancelGeneration?.();
      client?.cancel();
      client?.destroy();
      stopGamepad?.();
      clearInterval(timer);
      for (const cleanup of cleanups) cleanup();
      ui.destroy();
      focusMarker.remove();
      host.replaceChildren(...originalChildren);
      document.body.classList.remove('sidebar-open', 'focus-view');
    },
  };
}

if (globalThis.document?.getElementById('app')) startApp();
