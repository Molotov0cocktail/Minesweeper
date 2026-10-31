// src/renderer/ui.js
// DOM 层：在 host 内程序化生成全部控件，返回状态刷新 API（可 jsdom 测试，零依赖）。
// 界面文案全部中文、经典扫雷风。
// v3（T18）：顶栏（汉堡/标题/状态/暂停重开）+ 左侧栏（等级/自定义/防猜测设置/排行榜）
//          + 排行榜主页面板（安装/卸载已剥离至独立 MinesweeperSetup，见 doc/detailed-design.md §6）。
// 注：v2 新增 actions 一律可选链调用（actions.toggleSidebar?.() 等），
//     保证既有 ui.test.js 的 deps（无这些 action）下不抛错。

export const MODE_NAMES = { beginner: '初级', intermediate: '中级', expert: '高级' };
export const ANTI_NAMES = { on: '防猜测开', off: '防猜测关' };

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
 *   setGameStatus({state, mode, rows, cols, mines, revealedCount}), resetTransient(), destroy()
 * }}
 */
export function createUI(host, deps) {
  const actions = deps.actions || {};
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
        <p id="ag-settings-hint" class="ms-hint">标准：开局不满足可解性时整盘重排，直至无猜开局；高级：优先仅重排猜雷区域，重排预算更省。</p>
      </div>
    </div>
    <div class="ms-side-actions">
      <button type="button" id="leaderboard-open" class="ms-btn ms-btn-primary">排行榜</button>
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
  const help = document.createElement('footer');
  help.id = 'controls-help';
  help.className = 'ms-controls-help';
  help.innerHTML = `
    <p>左键翻开 · 右键标记 · 首点安全</p>
    <p><kbd>方向键</kbd> 移动 <kbd>Enter / 空格</kbd> 翻开 <kbd>F</kbd> 标记</p>
    <p><kbd>P</kbd> 暂停 / 继续 <kbd>F2</kbd> 重开 · 拖动右下角缩放</p>
    <details><summary>数字格与暂停说明</summary>
      <p>左键数字格：相邻旗数等于数字时，翻开周围未标旗格。右键数字格：未开格数等于数字时，批量标旗。键盘翻开与标记支持相同操作。</p>
      <p>按 Tab 聚焦棋盘后可使用方向键。切出窗口自动暂停，返回后手动继续。</p>
    </details>
  `;
  const boardWrap = host.querySelector('#board-wrap');
  main.appendChild(banner);
  main.appendChild(summary);
  if (boardWrap) main.appendChild(boardWrap);
  main.appendChild(help);

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
      <p class="modal-hint">休息一下。棋盘已遮盖，计时已冻结。</p>
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
      <p class="modal-hint">成绩进入该榜单前 10 名，请输入昵称：</p>
      <input id="nickname-input" type="text" maxlength="16" class="ms-input" placeholder="昵称" aria-label="排行榜昵称" autocomplete="off">
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

  let pauseReturnFocus = null;
  let nicknameReturnFocus = null;
  let destroyed = false;

  function visible(element) {
    return !element.classList.contains('hidden');
  }

  function restoreFocus(element) {
    function available(target) {
      if (!target?.isConnected || target.matches(':disabled')) return false;
      for (let node = target; node; node = node.parentElement) {
        if (node.inert || node.hidden || node.classList.contains('hidden')) return false;
      }
      return true;
    }
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
    if (!dialog) sidebar.inert = !getSidebarOpen();
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
  listen(sidebarToggle, 'click', () => {
    document.body.classList.toggle('sidebar-open');
    syncSidebar();
    actions.toggleSidebar?.();
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
    syncInert();
    nicknameInput.focus();
    nicknameInput.select();
  }
  function closeNickname() {
    nicknameModal.classList.add('hidden');
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

  listen(document, 'keydown', (event) => {
    const dialog = activeDialog();
    if (!dialog || event.isComposing) return;
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
      const controls = [...dialog.querySelectorAll('input, button')].filter(element => !element.disabled);
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

  // ---------- 状态刷新 API ----------
  function setMineCount(n) {
    mineCount.textContent = String(n);
  }
  function setTime(ms) {
    const text = formatTime(ms);
    if (timer.textContent !== text) timer.textContent = text;
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
    const states = { ready: '准备就绪 · 点击任意格开始', playing: '进行中', paused: '已暂停', won: '胜利！', lost: '踩到地雷，再试一局' };
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
    for (const button of host.querySelectorAll('.ms-mode')) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    }
  }

  function resetTransient() {
    const previousFocus = nicknameReturnFocus || pauseReturnFocus;
    pauseOverlay.classList.add('hidden');
    nicknameModal.classList.add('hidden');
    leaderboardModal.classList.add('hidden');
    nicknameReturnFocus = null;
    pauseReturnFocus = null;
    syncInert();
    restoreFocus(previousFocus);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const cleanup of cleanups.splice(0)) cleanup();
    for (const child of host.children) child.inert = false;
  }

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
    resetTransient,
    destroy,
  };
}
