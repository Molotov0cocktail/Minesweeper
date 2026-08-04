// setup/ui.js
// 独立安装器 MinesweeperSetup 渲染层：安装向导（welcome/dir/options/progress/report）+
// 卸载确认视图 + 旧版残留清理提示。纯 DOM 层，可 jsdom 测试，零 Electron 依赖
// （startSetupApp 经可选链访问 window.minesweeperAPI?.installer）。
// 见 doc/detailed-design.md §6b（createSetupUI/startSetupApp 契约、DOM id 表）。

// 向导步骤顺序
const STEPS = ['welcome', 'dir', 'options', 'progress', 'report'];

// 报告条目按 code 分类：NOT_FOUND（已跳过）视为警告，其余视为错误
// （与 src/renderer/ui.js 的 classifyReport 语义一致；setup 不 import 游戏侧代码）
const WARN_CODES = new Set(['NOT_FOUND']);

function classifyReport(code) {
  return WARN_CODES.has(code) ? 'report-warn' : 'report-error';
}

/**
 * 创建安装器 UI。deps = { actions: { suggestDir, startInstall(opts), runUninstall,
 *   runCleanLegacy, exit } }（均为可选链调用）。
 * 向导流程自包含：welcome → dir（suggestDir 预填 + confirm 校验非空）→ options
 *   （两个 checkbox 默认勾选）→ progress（进度条）→ report（showReport 渲染）。
 * @returns {{
 *   showStatus(status),                       // { installed, installDir, appVersion, legacy }
 *   showStep(step, payload),                  // step: welcome|dir|options|progress|report
 *   setProgress({done, total, message}),      // 进度条填充宽度与文本
 *   showReport(result),                       // 渲染 li[data-code]（error/warn/ok 语义类）
 *   showUninstallConfirm({dir, appVersion}),  // 卸载确认视图
 *   showLegacyPrompt(legacy),                 // 旧版残留提示显隐
 *   showError(msg)                            // 环境错误提示条（无 preload 等）
 * }}
 */
export function createSetupUI(host, deps) {
  const actions = deps.actions || {};

  // ---------- 根容器：向导 / 卸载确认 两种视图 ----------
  const mode = document.createElement('div');
  mode.id = 'setup-mode';
  mode.dataset.mode = 'wizard';
  mode.innerHTML = `
    <div id="setup-wizard" class="modal ms-wizard">
      <h2 class="modal-title">安装向导</h2>
      <div id="setup-error" class="ms-setup-error hidden"></div>
      <div id="setup-step" data-step="welcome">
        <div class="ms-wiz-page" data-page="welcome">
          <p>欢迎使用扫雷 Minesweeper 安装器！本向导将把游戏安装到你的电脑，并创建桌面 / 开始菜单快捷方式。</p>
        </div>
        <div class="ms-wiz-page" data-page="dir">
          <label class="ms-field">安装目录
            <input id="install-dir-input" type="text" class="ms-input" placeholder="例如 D:\\Minesweeper">
          </label>
          <button type="button" id="install-dir-suggest" class="ms-btn">建议目录</button>
          <span id="install-dir-error" class="ms-error"></span>
        </div>
        <div class="ms-wiz-page" data-page="options">
          <label class="ms-check"><input id="install-desktop-chk" type="checkbox" checked> 创建桌面快捷方式</label>
          <label class="ms-check"><input id="install-startmenu-chk" type="checkbox" checked> 创建开始菜单快捷方式</label>
        </div>
        <div class="ms-wiz-page" data-page="progress">
          <div id="install-progress-track" class="ms-progress-track">
            <div id="install-progress-fill" class="ms-progress-fill" style="width: 0%"></div>
          </div>
          <p id="install-progress-text" class="ms-hint ms-progress-text">准备中…</p>
        </div>
        <div class="ms-wiz-page" data-page="report">
          <ul id="install-report" class="ms-report"></ul>
        </div>
        <div class="modal-actions">
          <button type="button" id="install-back">上一步</button>
          <button type="button" id="install-next">下一步</button>
          <button type="button" id="install-confirm">开始安装</button>
          <button type="button" id="install-cancel">取消</button>
          <button type="button" id="install-close">关闭</button>
        </div>
      </div>
      <div id="installer-legacy-clean" class="ms-legacy-clean hidden">
        <span id="installer-legacy-clean-text" class="ms-legacy-clean-text"></span>
        <button type="button" id="installer-legacy-clean-btn">立即清理</button>
      </div>
    </div>
    <div id="setup-uninstall" class="modal ms-wizard">
      <h2 class="modal-title">卸载确认</h2>
      <p class="modal-hint">检测到扫雷 Minesweeper 已安装，确认要卸载吗？</p>
      <div class="ms-uninstall-info">
        <p>安装目录：<span id="uninstall-dir"></span></p>
        <p>版本：<span id="uninstall-version"></span></p>
      </div>
      <div class="modal-actions">
        <button type="button" id="uninstall-confirm-btn">确认卸载</button>
        <button type="button" id="uninstall-cancel">取消</button>
      </div>
    </div>
  `;
  host.appendChild(mode);

  // ---------- 控件引用 ----------
  const modeEl = host.querySelector('#setup-mode');
  const stepEl = host.querySelector('#setup-step');
  const setupError = host.querySelector('#setup-error');
  const dirInput = host.querySelector('#install-dir-input');
  const dirError = host.querySelector('#install-dir-error');
  const desktopChk = host.querySelector('#install-desktop-chk');
  const startmenuChk = host.querySelector('#install-startmenu-chk');
  const progressFill = host.querySelector('#install-progress-fill');
  const progressText = host.querySelector('#install-progress-text');
  const reportEl = host.querySelector('#install-report');
  const legacyClean = host.querySelector('#installer-legacy-clean');
  const legacyCleanText = host.querySelector('#installer-legacy-clean-text');
  const uninstallDir = host.querySelector('#uninstall-dir');
  const uninstallVersion = host.querySelector('#uninstall-version');

  // ---------- 步骤切换 ----------
  function goStep(step, payload = {}) {
    if (!STEPS.includes(step)) return;
    modeEl.dataset.mode = 'wizard';
    stepEl.dataset.step = step;
    // 同步各页面 hidden 状态（CSS 按 data-step 显隐为兜底；jsdom 无样式表时靠此状态）
    for (const page of stepEl.querySelectorAll('.ms-wiz-page')) {
      page.classList.toggle('hidden', page.dataset.page !== step);
    }
    if (step === 'dir') {
      if (payload.dir) dirInput.value = payload.dir;
      dirError.textContent = payload.error ? payload.error : '';
    }
  }

  // ---------- 事件绑定：向导按钮 ----------
  // welcome → dir：先取建议目录（可能异步），再进入目录页预填
  host.querySelector('#install-next').addEventListener('click', async () => {
    if (stepEl.dataset.step === 'welcome') {
      let dir = '';
      if (typeof actions.suggestDir === 'function') {
        try {
          const result = await actions.suggestDir();
          if (typeof result === 'string') dir = result;
        } catch {
          // 建议目录失败不阻断：进入目录页由用户手填
        }
      }
      goStep('dir', { dir });
    } else if (stepEl.dataset.step === 'dir') {
      goStep('options');
    }
  });

  host.querySelector('#install-back').addEventListener('click', () => {
    if (stepEl.dataset.step === 'dir') goStep('welcome');
    else if (stepEl.dataset.step === 'options') goStep('dir');
  });

  // confirm：校验安装目录非空，否则回目录页显示中文错误
  host.querySelector('#install-confirm').addEventListener('click', () => {
    const dir = dirInput.value.trim();
    if (!dir) {
      goStep('dir', { error: '请填写安装目录' });
      return;
    }
    actions.startInstall?.({
      dir,
      desktopShortcut: desktopChk.checked,
      startMenuShortcut: startmenuChk.checked,
    });
    goStep('progress');
  });

  host.querySelector('#install-cancel').addEventListener('click', () => actions.exit?.());
  host.querySelector('#install-close').addEventListener('click', () => actions.exit?.());
  host.querySelector('#install-dir-suggest').addEventListener('click', () => actions.suggestDir?.());

  // ---------- 事件绑定：legacy 清理 ----------
  host.querySelector('#installer-legacy-clean-btn').addEventListener('click', () => {
    actions.runCleanLegacy?.();
  });

  // ---------- 事件绑定：卸载视图 ----------
  host.querySelector('#uninstall-confirm-btn').addEventListener('click', () => {
    actions.runUninstall?.();
  });
  host.querySelector('#uninstall-cancel').addEventListener('click', () => actions.exit?.());

  // 初始化当前步骤（同步页面 hidden 状态，与 data-step 一致）
  goStep('welcome');

  // ---------- 状态刷新 API ----------
  // 旧版残留提示：存在 oldNsisDir / oldShortcuts / oldRegistry 任一即显示
  function showLegacyPrompt(legacy) {
    const hasLegacy =
      (legacy && legacy.oldNsisDir) ||
      (Array.isArray(legacy && legacy.oldShortcuts) && legacy.oldShortcuts.length > 0) ||
      (legacy && legacy.oldRegistry);
    if (!hasLegacy) {
      legacyClean.classList.add('hidden');
      return;
    }
    const parts = [];
    if (legacy.oldNsisDir) parts.push(`旧版目录 ${legacy.oldNsisDir}`);
    if (Array.isArray(legacy.oldShortcuts) && legacy.oldShortcuts.length > 0) {
      parts.push(`旧版快捷方式 ${legacy.oldShortcuts.length} 个`);
    }
    if (legacy.oldRegistry) parts.push('旧版注册表项');
    legacyCleanText.textContent = `检测到旧版残留：${parts.join('，')}。安装前可先清理。`;
    legacyClean.classList.remove('hidden');
  }

  function showUninstallConfirm({ dir, appVersion } = {}) {
    modeEl.dataset.mode = 'uninstall';
    uninstallDir.textContent = dir || '';
    uninstallVersion.textContent = appVersion || '';
  }

  // 初始状态路由：installed ? 卸载确认视图 : 安装向导（welcome + legacy 提示）
  function showStatus(status = {}) {
    setupError.classList.add('hidden');
    if (status.installed) {
      showUninstallConfirm({ dir: status.installDir, appVersion: status.appVersion });
    } else {
      goStep('welcome');
      showLegacyPrompt(status.legacy);
    }
  }

  function setProgress({ done, total, message } = {}) {
    const d = Number(done) || 0;
    const t = Number(total) || 0;
    const pct = t > 0 ? Math.round((d / t) * 100) : 0;
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${d}/${t}${message ? ' ' + message : ''}`;
  }

  function showReport(result = {}) {
    reportEl.textContent = '';
    const errors = Array.isArray(result.errors) ? result.errors : [];
    const skipped = Array.isArray(result.skippedExtraneous) ? result.skippedExtraneous : [];

    const summary = document.createElement('p');
    summary.className = 'ms-report-summary';
    if (result.ok) {
      summary.textContent = '操作完成，全部成功。';
    } else {
      summary.textContent = `操作未完成：共 ${errors.length} 个错误${
        skipped.length ? `，${skipped.length} 项清单外内容保留不删` : ''
      }。`;
    }
    reportEl.appendChild(summary);

    for (const err of errors) {
      const li = document.createElement('li');
      li.dataset.code = (err && err.code) || 'ERROR';
      li.className = classifyReport(err && err.code);
      li.textContent = (err && err.message) || '未知错误';
      if (err && err.path) li.textContent += `（${err.path}）`;
      reportEl.appendChild(li);
    }
    for (const item of skipped) {
      const li = document.createElement('li');
      li.className = 'report-warn';
      const rel = typeof item === 'string' ? item : (item && item.rel) || '';
      li.textContent = `清单外内容保留不删：${rel}`;
      reportEl.appendChild(li);
    }
    if (result.ok && errors.length === 0 && skipped.length === 0) {
      const li = document.createElement('li');
      li.className = 'report-ok';
      li.textContent = '完成';
      reportEl.appendChild(li);
    }
  }

  // 环境错误提示（无 preload 等场景）
  function showError(msg) {
    setupError.textContent = msg;
    setupError.classList.remove('hidden');
  }

  return {
    showStatus,
    showStep: goStep,
    setProgress,
    showReport,
    showUninstallConfirm,
    showLegacyPrompt,
    showError,
  };
}

/**
 * 启动安装器应用：链接 window.minesweeperAPI?.installer（可选链守卫）。
 * getStatus → installed ? 卸载确认视图 : 安装向导（legacy 提示）；
 * suggestDir 预填、startInstall 组装 opts、进度订阅 onProgress → setProgress；
 * runUninstall / runCleanLegacy 走同一进度→报告流程；exit 关闭窗口。
 * 无 preload 时任何操作在页面上显示中文错误提示（"当前环境不支持安装功能"），不抛异常。
 */
export async function startSetupApp() {
  const root = document.getElementById('setup-root');
  if (!root) return;
  const api = window.minesweeperAPI?.installer || null;

  let ui;
  const noApi = () => ui.showError('当前环境不支持安装功能');

  // ---------- 进度订阅（installer:progress → setProgress） ----------
  let progressUnsub = null;
  function subscribeProgress() {
    unsubscribeProgress();
    if (!api || typeof api.onProgress !== 'function') return;
    progressUnsub = api.onProgress((p) => {
      if (p && typeof p.done === 'number' && typeof p.total === 'number') {
        ui.setProgress({ done: p.done, total: p.total, message: p.message || '' });
      }
    });
  }
  function unsubscribeProgress() {
    if (progressUnsub) {
      progressUnsub();
      progressUnsub = null;
    }
  }

  // 安装 / 卸载 / 清理共用流程：进度步骤 → 订阅进度 → 结果报告
  function runFlow(executor, message) {
    subscribeProgress();
    ui.setProgress({ done: 0, total: 1, message });
    ui.showStep('progress');
    Promise.resolve(executor())
      .then((result) => {
        ui.showStep('report');
        ui.showReport(result || { ok: false, errors: [] });
      })
      .catch((err) => {
        ui.showStep('report');
        ui.showReport({
          ok: false,
          errors: [{ code: 'IPC_FAIL', message: String((err && err.message) || err) }],
        });
      })
      .then(unsubscribeProgress);
  }

  // ---------- actions 接线 ----------
  const actions = {
    suggestDir: async () => {
      if (!api || typeof api.suggestDir !== 'function') {
        noApi();
        return '';
      }
      try {
        const dir = await api.suggestDir();
        return typeof dir === 'string' ? dir : '';
      } catch {
        noApi();
        return '';
      }
    },
    startInstall: (opts) => {
      if (!api || typeof api.install !== 'function') {
        noApi();
        return;
      }
      runFlow(() => api.install(opts), '正在安装…');
    },
    runUninstall: () => {
      if (!api || typeof api.uninstall !== 'function') {
        noApi();
        return;
      }
      runFlow(() => api.uninstall(), '正在卸载…');
    },
    runCleanLegacy: () => {
      if (!api || typeof api.cleanLegacy !== 'function') {
        noApi();
        return;
      }
      runFlow(() => api.cleanLegacy(), '正在清理…');
    },
    exit: () => {
      // 关闭窗口（Electron 渲染层 window.close() 可关；浏览器环境静默忽略）
      try {
        window.close();
      } catch {
        /* 忽略 */
      }
    },
  };

  ui = createSetupUI(root, { actions });

  // ---------- 初始状态路由 ----------
  if (!api) {
    ui.showError('当前环境不支持安装功能');
    return;
  }
  try {
    const status = await api.getStatus();
    ui.showStatus(status || { installed: false });
  } catch {
    ui.showError('当前环境不支持安装功能');
  }
}

// module script 默认 defer，DOM 已就绪；jsdom 测试无 #setup-root 时不自动启动
if (typeof document !== 'undefined' && document.getElementById('setup-root')) {
  startSetupApp();
}
