// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createUI } from '../src/renderer/ui.js';

function makeDeps() {
  return {
    leaderboard: {
      getScores: vi.fn((mode, antiGuess) => {
        if (mode === 'expert' && !antiGuess) return [{ nickname: '高手', timeMs: 9000, date: 'x' }];
        return [];
      }),
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

describe('createUI 渲染', () => {
  it('渲染全部控件', () => {
    const { host } = setup();
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
    expect($(host, '.ms-mode')).toBeTruthy();
    expect(host.querySelectorAll('.ms-mode').length).toBe(3);
    expect(host.querySelectorAll('.ms-mode[data-mode="expert"]')).toBeTruthy();
  });
});

describe('控件事件', () => {
  it('模式按钮触发 selectMode', () => {
    const { host, deps } = setup();
    $(host, '.ms-mode[data-mode="expert"]').click();
    expect(deps.actions.selectMode).toHaveBeenCalledWith('expert');
  });

  it('自定义应用解析数值并调用 applyCustom', () => {
    const { host, deps } = setup();
    $(host, '#custom-rows').value = '12';
    $(host, '#custom-cols').value = '20';
    $(host, '#custom-mines').value = '30';
    $(host, '#custom-apply').click();
    expect(deps.actions.applyCustom).toHaveBeenCalledWith(12, 20, 30);
  });

  it('防猜测开关触发 toggleAntiGuess', () => {
    const { host, deps } = setup();
    const toggle = $(host, '#anti-guess-toggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(deps.actions.toggleAntiGuess).toHaveBeenCalledWith(false);
  });

  it('暂停/继续/重开按钮', () => {
    const { host, deps } = setup();
    $(host, '#pause-btn').click();
    expect(deps.actions.pause).toHaveBeenCalled();
    $(host, '#resume-btn').click();
    expect(deps.actions.resume).toHaveBeenCalled();
    $(host, '#restart-btn').click();
    expect(deps.actions.restart).toHaveBeenCalled();
  });
});

describe('状态显示', () => {
  it('setMineCount 更新剩余雷数', () => {
    const { host, ui } = setup();
    ui.setMineCount(7);
    expect($(host, '#mine-count').textContent.trim()).toBe('7');
  });

  it('setTime 按 mm:ss 格式化', () => {
    const { host, ui } = setup();
    ui.setTime(65000);
    expect($(host, '#timer').textContent.trim()).toBe('01:05');
    ui.setTime(5000);
    expect($(host, '#timer').textContent.trim()).toBe('00:05');
  });

  it('setPauseOverlay 显示/隐藏遮罩', () => {
    const { host, ui } = setup();
    ui.setPauseOverlay(true);
    expect($(host, '#pause-overlay').classList.contains('hidden')).toBe(false);
    ui.setPauseOverlay(false);
    expect($(host, '#pause-overlay').classList.contains('hidden')).toBe(true);
  });

  it('setAntiGuessActive 更新状态文案', () => {
    const { host, ui } = setup();
    ui.setAntiGuessActive(true);
    expect($(host, '#antiguess-status').textContent).toContain('开');
    ui.setAntiGuessActive(false);
    expect($(host, '#antiguess-status').textContent).toContain('关');
  });
});

describe('横幅', () => {
  it('showBanner 显示文案，hideBanner 隐藏', () => {
    const { host, ui } = setup();
    ui.showBanner('防猜测已关闭');
    expect($(host, '#warning-banner').classList.contains('hidden')).toBe(false);
    expect($(host, '#warning-banner-text').textContent).toContain('防猜测已关闭');
    ui.hideBanner();
    expect($(host, '#warning-banner').classList.contains('hidden')).toBe(true);
  });

  it('横幅关闭按钮可手动隐藏', () => {
    const { host, ui } = setup();
    ui.showBanner('提示');
    $(host, '#warning-banner-close').click();
    expect($(host, '#warning-banner').classList.contains('hidden')).toBe(true);
  });
});

describe('昵称弹窗', () => {
  it('showNicknamePrompt 显示并提交昵称', () => {
    const { host, deps, ui } = setup();
    ui.showNicknamePrompt({ timeMs: 3000, mode: 'beginner', antiGuessActive: true });
    expect($(host, '#nickname-modal').classList.contains('hidden')).toBe(false);
    $(host, '#nickname-input').value = '小明';
    $(host, '#nickname-submit').click();
    expect(deps.actions.submitNickname).toHaveBeenCalledWith('小明');
  });

  it('取消隐藏弹窗且不提交', () => {
    const { host, deps, ui } = setup();
    ui.showNicknamePrompt({});
    $(host, '#nickname-cancel').click();
    expect($(host, '#nickname-modal').classList.contains('hidden')).toBe(true);
    expect(deps.actions.submitNickname).not.toHaveBeenCalled();
  });
});

describe('排行榜弹窗', () => {
  it('showLeaderboard 渲染榜单并按标签页切换', () => {
    const { host, deps, ui } = setup();
    ui.showLeaderboard();
    expect($(host, '#leaderboard-modal').classList.contains('hidden')).toBe(false);
    // 默认 active 组渲染
    expect(deps.leaderboard.getScores).toHaveBeenCalled();
    // 点击 expert+off 标签页
    const tab = host.querySelector('#leaderboard-tabs [data-mode="expert"][data-antiguess="off"]');
    expect(tab).toBeTruthy();
    tab.click();
    const body = $(host, '#leaderboard-body');
    expect(body.textContent).toContain('高手');
    expect(body.textContent).toContain('00:09');
  });

  it('关闭按钮隐藏弹窗', () => {
    const { host, ui } = setup();
    ui.showLeaderboard();
    $(host, '#leaderboard-close').click();
    expect($(host, '#leaderboard-modal').classList.contains('hidden')).toBe(true);
  });
});

describe('自定义错误', () => {
  it('setCustomError 显示/清空错误信息', () => {
    const { host, ui } = setup();
    ui.setCustomError('雷数超限');
    expect($(host, '#custom-error').textContent).toContain('雷数超限');
    ui.setCustomError('');
    expect($(host, '#custom-error').textContent).toBe('');
  });
});
