// @vitest-environment jsdom
// 严格测试：左侧侧栏 + 防猜测设置区 + 主页面板 DOM 契约（见 detailed-design §6）。
// v3：安装/卸载入口与向导已剥离（独立 MinesweeperSetup），本文件不再断言 installer DOM。
import { describe, it, expect, vi } from 'vitest';
import { createUI } from '../src/renderer/ui.js';

function makeDeps() {
  return {
    leaderboard: {
      getScores: vi.fn(() => []),
      isTopTen: vi.fn(() => true),
    },
    actions: {
      selectMode: vi.fn(),
      applyCustom: vi.fn(),
      toggleAntiGuess: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      restart: vi.fn(),
      submitNickname: vi.fn(),
      // v2 新增
      toggleSidebar: vi.fn(),
      setAntiGuessMethod: vi.fn(),
      setMaxAttempts: vi.fn(),
      setMaxRegionAttempts: vi.fn(),
      openLeaderboard: vi.fn(),
    },
  };
}

function setup() {
  document.body.innerHTML = '<div id="app"></div>';
  const host = document.getElementById('app');
  const deps = makeDeps();
  const ui = createUI(host, deps);
  return { host, deps, ui };
}

const $ = (host, sel) => host.querySelector(sel);

describe('侧栏与既有 DOM 契约回归', () => {
  it('渲染：汉堡 + 侧栏 + 既有 id 全量存在（ui.test.js 回归清单）', () => {
    const { host } = setup();
    expect($(host, '#sidebar-toggle')).toBeTruthy();
    expect($(host, '#sidebar')).toBeTruthy();
    // 既有契约 id 全部保留
    expect($(host, '#mine-count')).toBeTruthy();
    expect($(host, '#timer')).toBeTruthy();
    expect($(host, '#custom-rows')).toBeTruthy();
    expect($(host, '#custom-cols')).toBeTruthy();
    expect($(host, '#custom-mines')).toBeTruthy();
    expect($(host, '#custom-apply')).toBeTruthy();
    expect($(host, '#anti-guess-toggle')).toBeTruthy();
    expect($(host, '#pause-btn')).toBeTruthy();
    expect($(host, '#resume-btn')).toBeTruthy();
    expect($(host, '#restart-btn')).toBeTruthy();
    expect($(host, '#warning-banner')).toBeTruthy();
    expect($(host, '#pause-overlay')).toBeTruthy();
    expect($(host, '#nickname-modal')).toBeTruthy();
    expect($(host, '#leaderboard-modal')).toBeTruthy();
    expect(host.querySelectorAll('.ms-mode').length).toBe(3);
  });

  it('侧栏默认收起：body 无 sidebar-open', () => {
    const { ui } = setup();
    expect(document.body.classList.contains('sidebar-open')).toBe(false);
    expect(ui.getSidebarOpen()).toBe(false);
  });

  it('汉堡点击 → body.sidebar-open 切换 + toggleSidebar 调用', () => {
    const { host, deps, ui } = setup();
    $(host, '#sidebar-toggle').click();
    expect(document.body.classList.contains('sidebar-open')).toBe(true);
    expect(ui.getSidebarOpen()).toBe(true);
    expect(deps.actions.toggleSidebar).toHaveBeenCalledTimes(1);
    $(host, '#sidebar-toggle').click();
    expect(document.body.classList.contains('sidebar-open')).toBe(false);
    expect(ui.getSidebarOpen()).toBe(false);
  });
});

describe('防猜测设置区：统一局部修复', () => {
  it('移除实现方式和整盘预算，只保留可编辑局部预算与说明', () => {
    const {host}=setup();
    expect($(host,'#ag-method')).toBeNull();expect($(host,'#ag-max-attempts')).toBeNull();
    expect($(host,'#ag-region-attempts').disabled).toBe(false);
    expect($(host,'#ag-settings-hint').textContent).toContain('局部');
    expect($(host,'#ag-settings-hint').textContent).not.toContain('回退标准');
  });
  it('局部预算输入透传，回填不再受旧method影响', () => {
    const {host,deps,ui}=setup();const region=$(host,'#ag-region-attempts');
    region.value='7';region.dispatchEvent(new Event('change'));
    expect(deps.actions.setMaxRegionAttempts).toHaveBeenCalledWith(7);
    ui.setAntiGuessSettings({method:'standard',maxAttempts:33,maxRegionAttempts:9});
    expect(region.value).toBe('9');expect(region.disabled).toBe(false);
    expect(deps.actions.setAntiGuessMethod).not.toHaveBeenCalled();
  });
});

describe('排行榜主页面板', () => {
  it('#leaderboard-open 点击 → 面板展示且保持可见（真实 openLeaderboard 接线）', () => {
    const { host, deps, ui } = setup();
    deps.actions.openLeaderboard.mockImplementation(() => ui.showLeaderboard()); // 与 main.js 真实接线一致
    const panel = $(host, '#leaderboard-modal');
    $(host, '#leaderboard-open').click();
    expect(deps.actions.openLeaderboard).toHaveBeenCalledTimes(1);
    // 回归（v2 Wave C 引入的 bug）：完整点击流（含冒泡到 document）结束后面板必须仍然可见，
    // 不得被"点击面板外隐藏"监听器在同一事件分发内闪关
    expect(panel.classList.contains('hidden')).toBe(false);
  });

  it('面板展开后点击面板外区域 → 隐藏', () => {
    const { host, ui } = setup();
    const panel = $(host, '#leaderboard-modal');
    ui.showLeaderboard();
    expect(panel.classList.contains('hidden')).toBe(false);
    $(host, '#sidebar-toggle').click(); // 面板外的元素 → 应隐藏
    expect(panel.classList.contains('hidden')).toBe(true);
  });

  it('面板已展开时再次点击 #leaderboard-open → 面板保持可见（非开关切换）', () => {
    const { host, deps, ui } = setup();
    deps.actions.openLeaderboard.mockImplementation(() => ui.showLeaderboard());
    const panel = $(host, '#leaderboard-modal');
    $(host, '#leaderboard-open').click();
    expect(panel.classList.contains('hidden')).toBe(false);
    $(host, '#leaderboard-open').click();
    expect(panel.classList.contains('hidden')).toBe(false);
  });

  it('面板类：含 ms-panel 不含 overlay（不再是全屏遮罩），hidden 切换语义保留', () => {
    const { host, ui } = setup();
    const panel = $(host, '#leaderboard-modal');
    expect(panel.classList.contains('ms-panel')).toBe(true);
    expect(panel.classList.contains('overlay')).toBe(false);
    expect(panel.classList.contains('hidden')).toBe(true);
    ui.showLeaderboard();
    expect(panel.classList.contains('hidden')).toBe(false);
    $(host, '#leaderboard-close').click();
    expect(panel.classList.contains('hidden')).toBe(true);
  });

  it('showLeaderboard 渲染 6 组标签页', () => {
    const { host, ui } = setup();
    ui.showLeaderboard();
    expect(host.querySelectorAll('#leaderboard-tabs .ms-lb-tab').length).toBe(6);
  });
});

describe('v3 剥离回归：无安装面', () => {
  it('侧栏无 #installer-open 按钮，DOM 无 #installer-modal/#installer-step', () => {
    const { host } = setup();
    expect($(host, '#installer-open')).toBeNull();
    expect($(host, '#installer-modal')).toBeNull();
    expect($(host, '#installer-step')).toBeNull();
  });

  it('返回 API 无安装方法（setInstallerLabel/showInstallerWizard 等不存在）', () => {
    const { ui } = setup();
    expect(typeof ui.setInstallerLabel).toBe('undefined');
    expect(typeof ui.showInstallerWizard).toBe('undefined');
    expect(typeof ui.setInstallerProgress).toBe('undefined');
    expect(typeof ui.showInstallerReport).toBe('undefined');
  });
});
