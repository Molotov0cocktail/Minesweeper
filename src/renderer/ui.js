// src/renderer/ui.js
// DOM 层：在 host 内程序化生成全部控件，返回状态刷新 API（可 jsdom 测试，零依赖）。
// 界面文案全部中文、经典扫雷风。
// v3（T18）：顶栏（汉堡/标题/状态/暂停重开）+ 左侧栏（等级/自定义/防猜测设置/排行榜）
//          + 排行榜主页面板（安装/卸载已剥离至独立 MinesweeperSetup，见 doc/detailed-design.md §6）。
// 注：v2 新增 actions 一律可选链调用（actions.toggleSidebar?.() 等），
//     保证既有 ui.test.js 的 deps（无这些 action）下不抛错。

import { DEFAULT_GAMEPAD_BINDINGS, isValidGamepadBindings, rebindGamepad } from '../core/gamepad.js';
import { navigateControls } from './controller-ui.js';

export const MODE_NAMES = { beginner: '初级', intermediate: '中级', expert: '高级' };
export const ANTI_NAMES = { on: '防猜测开', off: '防猜测关' };
const BINDING_NAMES = { reveal: '翻开 / 确认', mark: '标记 / 返回', menu: '菜单', pause: '暂停 / 继续', restart: '长按重开', focus: '专注视图', help: '操作说明' };
const BUTTON_NAMES = ['A / 叉', 'B / 圆', 'X / 方块', 'Y / 三角', 'LB', 'RB', 'LT', 'RT', 'Back / Select', 'Start', 'L3', 'R3'];

/** 毫秒 → "MM:SS"；超过 1 小时显示 "h:MM:SS"。 */
export function formatTime(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * 创建 UI。deps = { leaderboard, getState?, actions }。
 * actions（v2 新增均为可选链调用）：selectMode, applyCustom, toggleAntiGuess, pause, resume,
 *   restart, submitNickname, toggleSidebar, setAntiGuessMethod, setMaxAttempts,
 *   setMaxRegionAttempts, openLeaderboard
 * @returns {{
 *   setMineCount(n), setTime(ms), setPauseOverlay(visible), setAntiGuessActive(active),
 *   showBanner(msg), hideBanner(), showNicknamePrompt(info), showLeaderboard(hint?), setCustomError(msg),
 *   setAntiGuessSettings({method, maxAttempts, maxRegionAttempts}), getSidebarOpen(),
 *   setGameStatus({state, mode, rows, cols, mines, revealedCount}), setControllerStatus(status),
 *   handleController(action), hasControllerContext(), showHelp(), showControls(), closePage(),
 *   setGamepadBindings(map), setBoardSize(size), setFocusView(value), getFocusView(), resetTransient(), destroy()
 * }}
 */
export function createUI(host, deps) {
  const actions = deps.actions || {};
  const hadFocusView = document.body.classList.contains('focus-view');
  const cleanups = [];
  function listen(target, type, handler) {
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  }

  // ---------- 顶栏 ----------
  const topbar = document.createElement('header');
  topbar.className = 'ms-topbar';
  topbar.innerHTML = `
    <button type="button" id="sidebar-toggle" class="ms-hamburger bevel-raised" aria-label="菜单" aria-controls="sidebar" aria-expanded="false" title="菜单">
      <span class="ms-hamburger-line"></span>
    </button>
    <div class="ms-topbar-title">扫雷 Minesweeper</div>
    <div class="ms-topbar-status">
      <span class="ms-status">剩余雷数：<b id="mine-count">0</b></span>
      <span class="ms-status">时间：<b id="timer">00:00</b></span>
    </div>
    <div class="ms-topbar-actions">
      <button type="button" id="focus-toggle" title="专注视图（F10）" aria-pressed="false">专注</button>
      <button type="button" id="pause-btn" title="暂停 / 继续（P）">暂停</button>
      <button type="button" id="restart-btn" title="重新开始（F2）">重新开始</button>
    </div>
  `;

  // ---------- 左侧栏 ----------
  const sidebar = document.createElement('aside');
  sidebar.id = 'sidebar';
  sidebar.setAttribute('aria-label', '游戏设置');
  sidebar.innerHTML = `
    <div class="ms-side-section">
      <h3 class="ms-side-title">等级</h3>
      <div class="ms-mode-group">
        <button type="button" class="ms-mode bevel-raised" data-mode="beginner" aria-pressed="false">初级 <span>9 × 9 · 10 雷</span></button>
        <button type="button" class="ms-mode bevel-raised" data-mode="intermediate" aria-pressed="false">中级 <span>16 × 16 · 40 雷</span></button>
        <button type="button" class="ms-mode bevel-raised" data-mode="expert" aria-pressed="false">高级 <span>16 × 30 · 99 雷</span></button>
      </div>
    </div>
    <div class="ms-side-section">
      <h3 class="ms-side-title">自定义</h3>
      <div class="ms-custom-group">
        <label class="ms-field">行 <input id="custom-rows" type="number" min="5" max="60" value="9"></label>
        <label class="ms-field">列 <input id="custom-cols" type="number" min="5" max="60" value="9"></label>
        <label class="ms-field">雷 <input id="custom-mines" type="number" min="1" value="10"></label>
        <button type="button" id="custom-apply" class="ms-btn">自定义</button>
        <span id="custom-error" class="ms-error"></span>
      </div>
    </div>
    <div class="ms-side-section">
      <h3 class="ms-side-title">显示</h3>
      <label class="ms-field">格子大小
        <select id="board-size">
          <option value="0">自动适配</option>
          ${Array.from({ length: 33 }, (_, index) => index + 16).map(size => `<option value="${size}">${size} 像素</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="ms-side-section">
      <h3 class="ms-side-title">防猜测</h3>
      <label class="ms-toggle"><input id="anti-guess-toggle" type="checkbox" checked> 开启防猜测</label>
      <span id="antiguess-status" class="ms-antiguess">防猜测：开启</span>
      <div class="ms-ag-settings">
        <label class="ms-field">实现方式
          <select id="ag-method">
            <option value="standard">标准（整盘重排）</option>
            <option value="advanced">高级（局部重排）</option>
          </select>
        </label>
        <label class="ms-field">最大重置轮数 <input id="ag-max-attempts" type="number" min="1" max="200" value="20"></label>
        <label class="ms-field">区域重排次数 <input id="ag-region-attempts" type="number" min="1" max="200" value="20" disabled></label>
      </div>
    </div>
    <div class="ms-side-actions">
      <button type="button" id="leaderboard-open" class="ms-btn ms-btn-primary">排行榜</button>
      <button type="button" id="help-open" class="ms-btn">操作说明</button>
      <button type="button" id="controls-open" class="ms-btn">手柄与键位</button>
    </div>
  `;

  // ---------- 主区域（横幅 + 棋盘容器） ----------
  const banner = document.createElement('div');
  banner.id = 'warning-banner';
  banner.className = 'banner hidden';
  banner.innerHTML = `
    <span id="warning-banner-text"></span>
    <button type="button" id="warning-banner-close" class="banner-close" aria-label="关闭提示">×</button>
  `;
  const main = document.createElement('main');
  main.className = 'ms-main';
  const summary = document.createElement('section');
  summary.className = 'ms-game-summary';
  summary.setAttribute('aria-label', '当前对局');
  summary.innerHTML = `
    <div class="ms-game-heading">
      <div id="game-meta" class="ms-game-meta"></div>
      <span id="game-status" class="ms-game-status" role="status" aria-live="polite"></span>
    </div>
    <div class="ms-progress-heading"><span>安全格进度</span><span id="game-progress-text">0 / 0</span></div>
    <progress id="game-progress" max="1" value="0" aria-label="已翻开的安全格"></progress>
  `;
  const focusHud = document.createElement('div');
  focusHud.id = 'focus-hud';
  focusHud.className = 'ms-focus-hud hidden';
  focusHud.innerHTML = `
    <span>剩余雷数 <b id="focus-mine-count">0</b></span>
    <span>时间 <b id="focus-timer">00:00</b></span>
    <button type="button" id="focus-exit" title="退出专注（F10 / Escape）">退出专注</button>
  `;
  const helpPage = document.createElement('section');
  helpPage.id = 'help-page';
  helpPage.className = 'ms-page hidden';
  helpPage.setAttribute('aria-labelledby', 'help-title');
  helpPage.innerHTML = `
    <div class="ms-page-header"><h1 id="help-title">操作说明</h1><button type="button" id="help-back">返回棋盘</button></div>
    <div id="controls-help" class="ms-controls-help">
      <h2>鼠标与键盘</h2>
      <p>左键翻开，右键依次标记旗、问号、取消。首点及周围格子必定安全。</p>
      <p><kbd>方向键</kbd> 移动 <kbd>Enter / 空格</kbd> 翻开 <kbd>F</kbd> 标记</p>
      <p><kbd>P</kbd> 暂停 / 继续 <kbd>F2</kbd> 重开 <kbd>F10</kbd> 专注 <kbd>F1</kbd> 说明</p>
      <p>按 Tab 聚焦棋盘后可使用方向键。拖动右下角缩放，切出窗口自动暂停。</p>
      <h2>数字格</h2>
      <p>相邻旗数等于数字时，左键翻开周围未标旗格。未开格数等于数字时，右键批量标旗。键盘和手柄的翻开、标记也支持这些操作。</p>
      <h2>手柄</h2>
      <p>十字键 / 左摇杆移动。棋盘内标记雷，菜单内同一按键返回；长按重开需保持 800 毫秒。昵称弹窗按方向键打开屏幕键盘。</p>
      <dl class="ms-help-bindings">${Object.entries(BINDING_NAMES).map(([action, label]) => `<div><dt>${label}</dt><dd id="help-binding-${action}"></dd></div>`).join('')}</dl>
      <button type="button" id="help-controls-open">修改手柄键位</button>
      <h2>防猜测</h2>
      <p id="ag-settings-hint" class="ms-hint">标准：开局不满足可解性时整盘重排，直至无猜开局；高级：优先仅重排猜雷区域，失败时回退标准。雷密度过高、次数耗尽或生成失败时，会关闭防猜测并提示。</p>
    </div>
  `;
  const controlsPage = document.createElement('section');
  controlsPage.id = 'controls-page';
  controlsPage.className = 'ms-page hidden';
  controlsPage.setAttribute('aria-labelledby', 'controls-title');
  controlsPage.innerHTML = `
    <div class="ms-page-header"><h1 id="controls-title">手柄与键位</h1><button type="button" id="controls-back">返回棋盘</button></div>
    <p id="controller-status" role="status" aria-live="polite">手柄未连接</p>
    <div class="ms-bindings">${Object.entries(BINDING_NAMES).map(([action, label]) => `<label class="ms-binding-field">${label}<select id="binding-${action}">${BUTTON_NAMES.map((name, index) => `<option value="${index}">${name}</option>`).join('')}</select></label>`).join('')}</div>
    <p class="ms-hint">方向始终使用十字键 / 左摇杆。按键重复时会交换原有绑定；改键后松开所有按键，再继续操作。</p>
    <button type="button" id="bindings-reset">恢复默认键位</button>
  `;
  const boardWrap = host.querySelector('#board-wrap');
  main.appendChild(banner);
  main.appendChild(focusHud);
  main.appendChild(summary);
  if (boardWrap) main.appendChild(boardWrap);
  main.appendChild(helpPage);
  main.appendChild(controlsPage);

  host.appendChild(topbar);
  host.appendChild(sidebar);
  host.appendChild(main);

  // 标题已并入顶栏，移除 index.html 中的旧标题区
  const legacyTitle = host.querySelector('.app-title');
  if (legacyTitle) legacyTitle.remove();

  // ---------- 暂停遮罩 ----------
  const pauseOverlay = document.createElement('div');
  pauseOverlay.id = 'pause-overlay';
  pauseOverlay.className = 'overlay hidden';
  pauseOverlay.setAttribute('role', 'dialog');
  pauseOverlay.setAttribute('aria-modal', 'true');
  pauseOverlay.setAttribute('aria-labelledby', 'pause-title');
  pauseOverlay.innerHTML = `
    <div class="modal">
      <h2 id="pause-title" class="modal-title">已暂停</h2>
      <div class="modal-actions">
        <button type="button" id="resume-btn">继续</button>
      </div>
    </div>
  `;
  host.appendChild(pauseOverlay);

  // ---------- 昵称弹窗 ----------
  const nicknameModal = document.createElement('div');
  nicknameModal.id = 'nickname-modal';
  nicknameModal.className = 'overlay hidden';
  nicknameModal.setAttribute('role', 'dialog');
  nicknameModal.setAttribute('aria-modal', 'true');
  nicknameModal.setAttribute('aria-labelledby', 'nickname-title');
  nicknameModal.innerHTML = `
    <div class="modal">
      <h2 id="nickname-title" class="modal-title">恭喜胜利！</h2>
      <input id="nickname-input" type="text" maxlength="16" class="ms-input" placeholder="昵称" aria-label="排行榜昵称" autocomplete="off">
      <div id="nickname-keyboard" class="ms-nickname-keyboard hidden" data-controller-grid="10" aria-label="昵称屏幕键盘">
        ${[...'abcdefghijklmnopqrstuvwxyz0123456789'].map(key => `<button type="button" data-key="${key}">${key.toUpperCase()}</button>`).join('')}
        <button type="button" data-key="space">空格</button>
        <button type="button" data-key="backspace">退格</button>
        <button type="button" data-key="clear">清空</button>
        <button type="button" data-key="player">玩家</button>
      </div>
      <div class="modal-actions">
        <button type="button" id="nickname-submit">提交</button>
        <button type="button" id="nickname-cancel">取消</button>
      </div>
    </div>
  `;
  host.appendChild(nicknameModal);

  // ---------- 排行榜主页面板（不再是全屏遮罩） ----------
  const leaderboardModal = document.createElement('div');
  leaderboardModal.id = 'leaderboard-modal';
  leaderboardModal.className = 'ms-panel hidden';
  leaderboardModal.innerHTML = `
    <div class="ms-panel-header">
      <h2 class="ms-panel-title">排行榜</h2>
      <button type="button" id="leaderboard-close" class="ms-panel-close" aria-label="关闭">×</button>
    </div>
    <div id="leaderboard-hint" class="ms-lb-hint hidden"></div>
    <div id="leaderboard-tabs" class="ms-lb-tabs"></div>
    <div id="leaderboard-body" class="ms-lb-body"></div>
  `;
  host.appendChild(leaderboardModal);

  // ---------- 控件引用 ----------
  const sidebarToggle = host.querySelector('#sidebar-toggle');
  const mineCount = host.querySelector('#mine-count');
  const timer = host.querySelector('#timer');
  const customRows = host.querySelector('#custom-rows');
  const customCols = host.querySelector('#custom-cols');
  const customMines = host.querySelector('#custom-mines');
  const customApply = host.querySelector('#custom-apply');
  const customError = host.querySelector('#custom-error');
  const toggle = host.querySelector('#anti-guess-toggle');
  const antiGuessStatus = host.querySelector('#antiguess-status');
  const agMethod = host.querySelector('#ag-method');
  const agMaxAttempts = host.querySelector('#ag-max-attempts');
  const agRegionAttempts = host.querySelector('#ag-region-attempts');
  const pauseBtn = host.querySelector('#pause-btn');
  const resumeBtn = host.querySelector('#resume-btn');
  const restartBtn = host.querySelector('#restart-btn');
  const bannerText = host.querySelector('#warning-banner-text');
  const bannerClose = host.querySelector('#warning-banner-close');
  const nicknameInput = host.querySelector('#nickname-input');
  const nicknameSubmit = host.querySelector('#nickname-submit');
  const nicknameCancel = host.querySelector('#nickname-cancel');
  const leaderboardTabs = host.querySelector('#leaderboard-tabs');
  const leaderboardBody = host.querySelector('#leaderboard-body');
  const leaderboardHint = host.querySelector('#leaderboard-hint');
  const leaderboardClose = host.querySelector('#leaderboard-close');
  const leaderboardOpen = host.querySelector('#leaderboard-open');
  const gameMeta = host.querySelector('#game-meta');
  const gameStatus = host.querySelector('#game-status');
  const gameProgress = host.querySelector('#game-progress');
  const progressText = host.querySelector('#game-progress-text');
  const focusToggle = host.querySelector('#focus-toggle');
  const focusExit = host.querySelector('#focus-exit');
  const focusMineCount = host.querySelector('#focus-mine-count');
  const focusTimer = host.querySelector('#focus-timer');
  const nicknameKeyboard = host.querySelector('#nickname-keyboard');

  let pauseReturnFocus = null;
  let nicknameReturnFocus = null;
  let destroyed = false;
  let page = null;
  let focusView = false;
  let bindings = { ...DEFAULT_GAMEPAD_BINDINGS };
  let controllerStatus = { connected: false, supported: false, id: '' };

  function visible(element) {
    return !element.classList.contains('hidden');
  }

  function available(target) {
    if (!target?.isConnected || target.matches(':disabled')) return false;
    for (let node = target; node; node = node.parentElement) {
      if (node.inert || node.hidden || node.classList.contains('hidden')) return false;
    }
    return true;
  }

  function restoreFocus(element) {
    if (available(element)) element.focus?.();
    if (!available(element) || document.activeElement !== element) {
      const canvas = host.querySelector('#board-canvas');
      if (available(canvas)) canvas.focus();
    }
  }

  function activeDialog() {
    return visible(nicknameModal) ? nicknameModal : visible(pauseOverlay) ? pauseOverlay : null;
  }

  // 模态开启时阻止背景控件被 Tab/辅助技术继续操作；关闭侧栏同样不可聚焦。
  function syncInert() {
    const dialog = activeDialog();
    for (const child of host.children) child.inert = Boolean(dialog && child !== dialog);
    if (!dialog) {
      sidebar.inert = !getSidebarOpen() || focusView;
      topbar.inert = focusView;
    }
  }

  function syncSidebar() {
    sidebarToggle.setAttribute('aria-expanded', String(getSidebarOpen()));
    syncInert();
  }
  syncSidebar();

  // 顶栏窄窗口时换行，侧栏始终从实际顶栏下方开始。
  function updateTopbarHeight() {
    const height = topbar.getBoundingClientRect().height;
    if (height > 0) host.style.setProperty('--topbar-height', `${height}px`);
  }
  updateTopbarHeight();
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(updateTopbarHeight);
    observer.observe(topbar);
    cleanups.push(() => observer.disconnect());
  }

  // ---------- 事件绑定：顶栏 ----------
  function layoutChanged() {
    host.dispatchEvent(new Event('ui-layout-change'));
  }

  function setSidebar(open, focusFirst = false) {
    if (open && focusView) changeFocusView(false);
    if (open && page) closePage();
    document.body.classList.toggle('sidebar-open', open);
    syncSidebar();
    actions.toggleSidebar?.();
    if (focusFirst && open) sidebar.querySelector('button:not(:disabled)')?.focus();
    if (!open) restoreFocus(host.querySelector('#board-canvas'));
  }
  listen(sidebarToggle, 'click', () => {
    setSidebar(!getSidebarOpen());
  });

  listen(focusToggle, 'click', () => changeFocusView(!focusView));
  listen(focusExit, 'click', () => changeFocusView(false));
  listen(host, 'pointerdown', () => { delete host.dataset.controllerActive; });
  listen(host.querySelector('#help-open'), 'click', showHelp);
  listen(host.querySelector('#controls-open'), 'click', showControls);
  listen(host.querySelector('#help-controls-open'), 'click', showControls);
  listen(host.querySelector('#help-back'), 'click', closePage);
  listen(host.querySelector('#controls-back'), 'click', closePage);
  listen(host.querySelector('#board-size'), 'change', (event) => {
    actions.setBoardSize?.(Number(event.target.value));
  });

  for (const action of Object.keys(BINDING_NAMES)) {
    listen(host.querySelector(`#binding-${action}`), 'change', (event) => {
      const button = Number(event.target.value);
      setGamepadBindings(rebindGamepad(bindings, action, button));
      actions.setGamepadBinding?.(action, button);
    });
  }
  listen(host.querySelector('#bindings-reset'), 'click', () => {
    setGamepadBindings(DEFAULT_GAMEPAD_BINDINGS);
    actions.resetGamepadBindings?.();
  });

  listen(pauseBtn, 'click', () => actions.pause?.());
  listen(resumeBtn, 'click', () => actions.resume?.());
  listen(restartBtn, 'click', () => actions.restart?.());

  // ---------- 事件绑定：侧栏 ----------
  host.querySelectorAll('.ms-mode').forEach((btn) => {
    listen(btn, 'click', () => actions.selectMode?.(btn.dataset.mode));
  });

  listen(customApply, 'click', () => {
    actions.applyCustom?.(Number(customRows.value), Number(customCols.value), Number(customMines.value));
  });

  listen(toggle, 'change', () => {
    actions.toggleAntiGuess?.(toggle.checked);
  });

  // 防猜测设置联动：method 切换 → action + 本地区 disabled 联动
  function updateAgRegionDisabled() {
    agRegionAttempts.disabled = agMethod.value !== 'advanced';
  }
  listen(agMethod, 'change', () => {
    updateAgRegionDisabled();
    actions.setAntiGuessMethod?.(agMethod.value);
  });
  listen(agMaxAttempts, 'change', () => {
    actions.setMaxAttempts?.(Number(agMaxAttempts.value));
  });
  listen(agRegionAttempts, 'change', () => {
    actions.setMaxRegionAttempts?.(Number(agRegionAttempts.value));
  });

  listen(leaderboardOpen, 'click', () => actions.openLeaderboard?.());

  // ---------- 事件绑定：横幅 ----------
  function showBanner(msg) {
    bannerText.textContent = msg;
    banner.classList.remove('hidden');
  }
  function hideBanner() {
    banner.classList.add('hidden');
  }
  listen(bannerClose, 'click', hideBanner);

  // ---------- 昵称弹窗 ----------
  function showNicknamePrompt() {
    if (!visible(nicknameModal)) nicknameReturnFocus = document.activeElement;
    if (deps.leaderboard && typeof deps.leaderboard.getLastNickname === 'function') {
      nicknameInput.value = deps.leaderboard.getLastNickname();
    }
    nicknameModal.classList.remove('hidden');
    nicknameKeyboard.classList.add('hidden');
    syncInert();
    nicknameInput.focus();
    nicknameInput.select();
  }
  function closeNickname() {
    nicknameModal.classList.add('hidden');
    nicknameKeyboard.classList.add('hidden');
    syncInert();
    if (activeDialog()) resumeBtn.focus();
    else restoreFocus(nicknameReturnFocus);
    nicknameReturnFocus = null;
  }
  function submitNickname() {
    if (!visible(nicknameModal)) return;
    const name = nicknameInput.value.trim();
    closeNickname();
    actions.submitNickname?.(name || '玩家');
  }
  listen(nicknameSubmit, 'click', submitNickname);
  listen(nicknameCancel, 'click', closeNickname);

  for (const button of nicknameKeyboard.querySelectorAll('[data-key]')) {
    listen(button, 'click', () => {
      const key = button.dataset.key;
      let start = nicknameInput.selectionStart ?? nicknameInput.value.length;
      let end = nicknameInput.selectionEnd ?? start;
      let inserted = key === 'space' ? ' ' : key === 'player' ? '玩家' : key;
      if (key === 'clear') { start = 0; end = nicknameInput.value.length; inserted = ''; }
      if (key === 'backspace') { if (start === end) start = Math.max(0, start - 1); inserted = ''; }
      const before = nicknameInput.value.slice(0, start);
      const after = nicknameInput.value.slice(end);
      inserted = inserted.slice(0, Math.max(0, 16 - before.length - after.length));
      nicknameInput.value = before + inserted + after;
      nicknameInput.setSelectionRange(start + inserted.length, start + inserted.length);
      nicknameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  listen(document, 'keydown', (event) => {
    const dialog = activeDialog();
    if (event.isComposing) return;
    if (!dialog) {
      if (event.key === 'Escape' && (hasControllerContext() || focusView)) {
        event.preventDefault();
        event.stopPropagation();
        handleController('cancel');
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (dialog === nicknameModal) closeNickname();
      else actions.resume?.();
    } else if (event.key === 'Enter' && dialog === nicknameModal && event.target === nicknameInput) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) submitNickname();
    } else if (event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('input, button')].filter(available);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first?.focus();
      }
    }
  });

  // ---------- 排行榜面板 ----------
  let current = { mode: 'beginner', ag: 'on' };

  function renderLeaderboard(mode, ag) {
    const scores = deps.leaderboard.getScores(mode, ag === 'on');
    leaderboardBody.textContent = '';

    for (const tab of leaderboardTabs.querySelectorAll('.ms-lb-tab')) {
      tab.classList.toggle('active', tab.dataset.mode === mode && tab.dataset.antiguess === ag);
    }

    const title = document.createElement('div');
    title.className = 'ms-lb-title';
    title.textContent = `${MODE_NAMES[mode]} · ${ANTI_NAMES[ag]}`;
    leaderboardBody.appendChild(title);

    if (!scores || scores.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'ms-lb-empty';
      empty.textContent = '暂无记录';
      leaderboardBody.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'ms-lb-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['名次', '昵称', '用时'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    scores.forEach((entry, i) => {
      const tr = document.createElement('tr');
      const rankTd = document.createElement('td');
      rankTd.textContent = String(i + 1);
      const nickTd = document.createElement('td');
      nickTd.textContent = entry.nickname;
      const timeTd = document.createElement('td');
      timeTd.textContent = formatTime(entry.timeMs);
      tr.append(rankTd, nickTd, timeTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    leaderboardBody.appendChild(table);
  }

  function buildTabs() {
    for (const mode of Object.keys(MODE_NAMES)) {
      for (const ag of ['on', 'off']) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'ms-lb-tab';
        tab.dataset.mode = mode;
        tab.dataset.antiguess = ag;
        tab.textContent = `${MODE_NAMES[mode]}·${ANTI_NAMES[ag]}`;
        listen(tab, 'click', () => {
          current = { mode, ag };
          renderLeaderboard(mode, ag);
        });
        leaderboardTabs.appendChild(tab);
      }
    }
  }
  buildTabs();

  function showLeaderboard(hint) {
    if (page) closePage();
    if (deps.getState) {
      const snap = deps.getState();
      if (snap && MODE_NAMES[snap.mode]) {
        current = { mode: snap.mode, ag: snap.antiGuessActive ? 'on' : 'off' };
      }
    }
    if (hint) {
      leaderboardHint.textContent = hint;
      leaderboardHint.classList.remove('hidden');
    } else {
      leaderboardHint.textContent = '';
      leaderboardHint.classList.add('hidden');
    }
    renderLeaderboard(current.mode, current.ag);
    leaderboardModal.classList.remove('hidden');
  }
  listen(leaderboardClose, 'click', () => {
    leaderboardModal.classList.add('hidden');
    restoreFocus(host.querySelector('#board-canvas'));
  });
  // 点击面板外区域隐藏面板
  listen(document, 'click', (e) => {
    if (leaderboardModal.classList.contains('hidden')) return;
    // 打开面板的按钮点击会冒泡到这里：忽略它，否则面板会在同一次事件分发内被立即关闭
    if (leaderboardOpen.contains(e.target)) return;
    if (!leaderboardModal.contains(e.target)) {
      leaderboardModal.classList.add('hidden');
    }
  });

  // ---------- 防猜测设置回填 ----------
  function setAntiGuessSettings({ method, maxAttempts, maxRegionAttempts } = {}) {
    if (method) agMethod.value = method;
    if (maxAttempts !== undefined && maxAttempts !== null) agMaxAttempts.value = String(maxAttempts);
    if (maxRegionAttempts !== undefined && maxRegionAttempts !== null) {
      agRegionAttempts.value = String(maxRegionAttempts);
    }
    updateAgRegionDisabled();
  }

  function getSidebarOpen() {
    return document.body.classList.contains('sidebar-open');
  }

  // 专页沿用现有棋盘节点；切页不会重置棋盘、计时或后台生成。
  function showPage(target) {
    if (activeDialog()) return;
    if (focusView) changeFocusView(false);
    if (getSidebarOpen()) setSidebar(false);
    leaderboardModal.classList.add('hidden');
    page = target;
    helpPage.classList.toggle('hidden', target !== helpPage);
    controlsPage.classList.toggle('hidden', target !== controlsPage);
    summary.classList.add('hidden');
    boardWrap?.classList.add('hidden');
    main.scrollTop = 0;
    syncInert();
    target.querySelector('button, select')?.focus();
    layoutChanged();
  }

  function showHelp() { showPage(helpPage); }
  function showControls() { showPage(controlsPage); }

  function closePage() {
    page = null;
    helpPage.classList.add('hidden');
    controlsPage.classList.add('hidden');
    summary.classList.remove('hidden');
    boardWrap?.classList.remove('hidden');
    syncInert();
    restoreFocus(host.querySelector('#board-canvas'));
    layoutChanged();
  }

  function setFocusView(value) {
    const next = Boolean(value);
    if (next && page) closePage();
    if (next && getSidebarOpen()) setSidebar(false);
    focusView = next;
    document.body.classList.toggle('focus-view', focusView);
    focusToggle.setAttribute('aria-pressed', String(focusView));
    focusHud.classList.toggle('hidden', !focusView);
    syncInert();
    restoreFocus(host.querySelector('#board-canvas'));
    layoutChanged();
  }

  function changeFocusView(value) {
    setFocusView(value);
    actions.setFocusView?.(focusView);
  }

  function getFocusView() { return focusView; }

  function controllerScope() {
    return activeDialog() || page || (visible(leaderboardModal) ? leaderboardModal : null) ||
      (getSidebarOpen() ? sidebar : null);
  }

  function hasControllerContext() { return Boolean(controllerScope()); }

  function handleController(action) {
    if (destroyed) return false;
    host.dataset.controllerActive = 'true';
    const scope = controllerScope();
    if (scope === nicknameModal) {
      nicknameKeyboard.classList.remove('hidden');
      if (action === 'mark' || action === 'cancel') closeNickname();
      else if (action === 'reveal' && document.activeElement === nicknameInput) submitNickname();
      else navigateControls(scope, action);
      // 包括菜单/专注/重开在内的输入均停留在模态，不传给棋盘。
      return true;
    }
    if (scope === pauseOverlay) {
      if (['reveal', 'mark', 'cancel', 'pause'].includes(action)) actions.resume?.();
      else navigateControls(scope, action);
      return true;
    }
    if (action === 'help') { showHelp(); return true; }
    if (action === 'focus') { changeFocusView(!focusView); return true; }
    if (action === 'menu') {
      leaderboardModal.classList.add('hidden');
      setSidebar(!getSidebarOpen(), true);
      return true;
    }
    if (scope) {
      if (action === 'mark' || action === 'cancel') {
        if (page) closePage();
        else if (scope === leaderboardModal) {
          leaderboardModal.classList.add('hidden');
          restoreFocus(host.querySelector('#board-canvas'));
        } else setSidebar(false);
      } else navigateControls(scope, action);
      return true;
    }
    if (action === 'cancel' && focusView) { changeFocusView(false); return true; }
    return false;
  }

  function setGamepadBindings(map) {
    if (!isValidGamepadBindings(map)) return;
    bindings = { ...map };
    for (const action of Object.keys(BINDING_NAMES)) {
      host.querySelector(`#binding-${action}`).value = String(bindings[action]);
      host.querySelector(`#help-binding-${action}`).textContent = BUTTON_NAMES[bindings[action]];
    }
    setControllerStatus(controllerStatus);
  }

  function setBoardSize(size) {
    if (size === 0 || (Number.isInteger(size) && size >= 16 && size <= 48)) {
      host.querySelector('#board-size').value = String(size);
    }
  }

  // ---------- 状态刷新 API ----------
  function setMineCount(n) {
    mineCount.textContent = String(n);
    focusMineCount.textContent = String(n);
  }
  function setTime(ms) {
    const text = formatTime(ms);
    if (timer.textContent !== text) timer.textContent = text;
    if (focusTimer.textContent !== text) focusTimer.textContent = text;
  }
  function setPauseOverlay(visible) {
    const wasVisible = !pauseOverlay.classList.contains('hidden');
    if (visible && !wasVisible) pauseReturnFocus = document.activeElement;
    pauseOverlay.classList.toggle('hidden', !visible);
    syncInert();
    if (visible && !wasVisible && activeDialog() === pauseOverlay) resumeBtn.focus();
    if (!visible && wasVisible) {
      if (!activeDialog()) restoreFocus(pauseReturnFocus);
      pauseReturnFocus = null;
    }
  }
  function setAntiGuessActive(active) {
    antiGuessStatus.textContent = active ? '防猜测：开启' : '防猜测：关闭';
  }
  function setCustomError(msg) {
    customError.textContent = msg;
  }

  function setGameStatus({ state, mode, rows, cols, mines, revealedCount }) {
    const states = { ready: '准备就绪', generating: '正在生成…', playing: '进行中', paused: '已暂停', won: '胜利！', lost: '踩到地雷，再试一局' };
    gameMeta.textContent = `${MODE_NAMES[mode] || '自定义'} · ${rows} × ${cols} · ${mines} 雷`;
    const status = states[state] || '';
    if (gameStatus.textContent !== status) gameStatus.textContent = status;
    gameStatus.dataset.state = state;
    const safeCells = Math.max(1, rows * cols - mines);
    const revealed = Math.max(0, Math.min(safeCells, revealedCount));
    gameProgress.max = safeCells;
    gameProgress.value = revealed;
    progressText.textContent = `${revealed} / ${safeCells}`;
    pauseBtn.disabled = state !== 'playing';
    host.querySelector('#board-canvas')?.setAttribute('aria-busy', String(state === 'generating'));
    for (const button of host.querySelectorAll('.ms-mode')) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    }
  }

  function setControllerStatus({ connected = false, supported = false, id = '' } = {}) {
    controllerStatus = { connected, supported, id };
    const element = host.querySelector('#controller-status');
    const text = !connected ? '手柄未连接 · 连接后按一下按键识别'
      : supported ? `手柄已连接：${id} · ${BUTTON_NAMES[bindings.reveal]} 确认 / ${BUTTON_NAMES[bindings.mark]} 返回 / ${BUTTON_NAMES[bindings.menu]} 菜单`
        : `手柄已连接：${id} · 暂不支持此按键映射`;
    if (element.textContent !== text) element.textContent = text;
  }

  function resetTransient() {
    const previousFocus = nicknameReturnFocus || pauseReturnFocus;
    pauseOverlay.classList.add('hidden');
    nicknameModal.classList.add('hidden');
    nicknameKeyboard.classList.add('hidden');
    leaderboardModal.classList.add('hidden');
    nicknameReturnFocus = null;
    pauseReturnFocus = null;
    if (page) closePage();
    syncInert();
    if (previousFocus) restoreFocus(previousFocus);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const cleanup of cleanups.splice(0)) cleanup();
    for (const child of host.children) child.inert = false;
    delete host.dataset.controllerActive;
    document.body.classList.toggle('focus-view', hadFocusView);
  }

  setGamepadBindings(DEFAULT_GAMEPAD_BINDINGS);

  return {
    setMineCount,
    setTime,
    setPauseOverlay,
    setAntiGuessActive,
    showBanner,
    hideBanner,
    showNicknamePrompt,
    showLeaderboard,
    setCustomError,
    setAntiGuessSettings,
    getSidebarOpen,
    setGameStatus,
    setControllerStatus,
    handleController,
    hasControllerContext,
    showHelp,
    showControls,
    closePage,
    setGamepadBindings,
    setBoardSize,
    setFocusView,
    getFocusView,
    resetTransient,
    destroy,
  };
}
