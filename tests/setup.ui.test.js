// @vitest-environment jsdom
// 独立安装器 MinesweeperSetup 渲染层测试（setup/ui.js）。
// 覆盖：向导 5 步骤切换、卸载确认视图、进度条、报告分类渲染、
//       legacy 提示显隐、按钮 action 接线、startSetupApp 无 preload 不崩。
import { describe, it, expect, vi } from 'vitest';
import { createSetupUI, startSetupApp } from '../setup/ui.js';

// 测试辅助：新建挂载点与 deps（actions 全部 vi.fn）
function setup() {
  document.body.innerHTML = '<div id="setup-root"></div>';
  const host = document.getElementById('setup-root');
  const deps = {
    actions: {
      suggestDir: vi.fn(() => ''),
      startInstall: vi.fn(),
      runUninstall: vi.fn(),
      runCleanLegacy: vi.fn(),
      exit: vi.fn(),
    },
  };
  const ui = createSetupUI(host, deps);
  return { host, deps, ui };
}

const $ = (host, sel) => host.querySelector(sel);
// 冲洗微任务（welcome→dir 的 async 按钮处理器 await suggestDir 结果）
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createSetupUI 渲染', () => {
  it('渲染向导与卸载视图全部控件（默认 wizard 模式 + 快捷方式勾选）', () => {
    const { host } = setup();
    expect($(host, '#setup-mode').dataset.mode).toBe('wizard');
    expect($(host, '#setup-step').dataset.step).toBe('welcome');
    expect($(host, '#install-dir-input')).toBeTruthy();
    expect($(host, '#install-dir-suggest')).toBeTruthy();
    expect($(host, '#install-dir-error')).toBeTruthy();
    expect($(host, '#install-desktop-chk').checked).toBe(true);
    expect($(host, '#install-startmenu-chk').checked).toBe(true);
    expect($(host, '#install-progress-track')).toBeTruthy();
    expect($(host, '#install-progress-fill')).toBeTruthy();
    expect($(host, '#install-progress-text')).toBeTruthy();
    expect($(host, '#install-report')).toBeTruthy();
    expect($(host, '#install-next')).toBeTruthy();
    expect($(host, '#install-back')).toBeTruthy();
    expect($(host, '#install-confirm')).toBeTruthy();
    expect($(host, '#install-cancel')).toBeTruthy();
    expect($(host, '#install-close')).toBeTruthy();
    expect($(host, '#uninstall-dir')).toBeTruthy();
    expect($(host, '#uninstall-version')).toBeTruthy();
    expect($(host, '#uninstall-confirm-btn')).toBeTruthy();
    expect($(host, '#installer-legacy-clean')).toBeTruthy();
    // 页面 hidden 状态：仅当前步骤页可见（jsdom 无样式表，靠 hidden 类切换）
    expect($(host, '.ms-wiz-page[data-page="welcome"]').classList.contains('hidden')).toBe(false);
    expect($(host, '.ms-wiz-page[data-page="dir"]').classList.contains('hidden')).toBe(true);
  });
});

describe('向导步骤切换', () => {
  it('下一步/上一步切换 5 步骤，suggestDir 预填目录', async () => {
    const { host, deps, ui } = setup();
    deps.actions.suggestDir.mockReturnValue('D:\\Minesweeper');
    const step = $(host, '#setup-step');

    $(host, '#install-next').click(); // welcome → dir
    await flush();
    expect(step.dataset.step).toBe('dir');
    expect(deps.actions.suggestDir).toHaveBeenCalled();
    expect($(host, '#install-dir-input').value).toBe('D:\\Minesweeper');

    $(host, '#install-next').click(); // dir → options
    expect(step.dataset.step).toBe('options');
    expect($(host, '.ms-wiz-page[data-page="options"]').classList.contains('hidden')).toBe(false);

    $(host, '#install-confirm').click(); // options → progress
    expect(step.dataset.step).toBe('progress');
    expect($(host, '.ms-wiz-page[data-page="progress"]').classList.contains('hidden')).toBe(false);

    ui.showStep('report'); // 外部驱动 → report
    expect(step.dataset.step).toBe('report');
    expect($(host, '.ms-wiz-page[data-page="report"]').classList.contains('hidden')).toBe(false);

    // 上一步回退：report → options → dir → welcome（report 无返回按钮，经 API 回退验证）
    ui.showStep('options');
    $(host, '#install-back').click();
    expect(step.dataset.step).toBe('dir');
    $(host, '#install-back').click();
    expect(step.dataset.step).toBe('welcome');
  });

  it('目录为空时确认安装失败：显示中文错误并回到目录步骤', async () => {
    const { host, deps } = setup();
    deps.actions.suggestDir.mockReturnValue('');
    $(host, '#install-next').click(); // welcome → dir（空目录）
    await flush();
    $(host, '#install-next').click(); // dir → options
    $(host, '#install-confirm').click();
    expect($(host, '#setup-step').dataset.step).toBe('dir');
    expect($(host, '#install-dir-error').textContent).toContain('请填写安装目录');
    expect(deps.actions.startInstall).not.toHaveBeenCalled();
  });

  it('确认安装组装 opts 调用 startInstall 并进入进度步骤', async () => {
    const { host, deps } = setup();
    deps.actions.suggestDir.mockReturnValue('D:\\Minesweeper');
    $(host, '#install-next').click();
    await flush();
    $(host, '#install-desktop-chk').checked = false;
    $(host, '#install-next').click();
    $(host, '#install-confirm').click();
    expect(deps.actions.startInstall).toHaveBeenCalledWith({
      dir: 'D:\\Minesweeper',
      desktopShortcut: false,
      startMenuShortcut: true,
    });
    expect($(host, '#setup-step').dataset.step).toBe('progress');
  });

  it('建议目录按钮触发 suggestDir', () => {
    const { host, deps } = setup();
    $(host, '#install-dir-suggest').click();
    expect(deps.actions.suggestDir).toHaveBeenCalled();
  });

  it('取消/关闭按钮触发 exit', () => {
    const { host, deps, ui } = setup();
    $(host, '#install-cancel').click();
    expect(deps.actions.exit).toHaveBeenCalledTimes(1);
    ui.showStep('report');
    $(host, '#install-close').click();
    expect(deps.actions.exit).toHaveBeenCalledTimes(2);
  });
});

describe('卸载确认视图', () => {
  it('showUninstallConfirm 显示目录/版本并切换到卸载模式', () => {
    const { host, ui } = setup();
    ui.showUninstallConfirm({ dir: 'D:\\Game\\Minesweeper', appVersion: '1.2.0' });
    expect($(host, '#setup-mode').dataset.mode).toBe('uninstall');
    expect($(host, '#uninstall-dir').textContent).toBe('D:\\Game\\Minesweeper');
    expect($(host, '#uninstall-version').textContent).toBe('1.2.0');
  });

  it('确认卸载按钮触发 runUninstall', () => {
    const { host, deps, ui } = setup();
    ui.showUninstallConfirm({ dir: 'D:\\Game', appVersion: '1.2.0' });
    $(host, '#uninstall-confirm-btn').click();
    expect(deps.actions.runUninstall).toHaveBeenCalled();
  });
});

describe('进度条', () => {
  it('setProgress 更新填充宽度与文本', () => {
    const { host, ui } = setup();
    ui.setProgress({ done: 1, total: 4, message: '复制文件…' });
    expect($(host, '#install-progress-fill').style.width).toBe('25%');
    expect($(host, '#install-progress-text').textContent).toContain('1/4');
    expect($(host, '#install-progress-text').textContent).toContain('复制文件…');
    ui.setProgress({ done: 0, total: 0 });
    expect($(host, '#install-progress-fill').style.width).toBe('0%');
    expect($(host, '#install-progress-text').textContent).toBe('0/0');
  });
});

describe('报告渲染', () => {
  it('showReport 按 code 分类渲染 error/warn 语义类', () => {
    const { host, ui } = setup();
    ui.showReport({
      ok: false,
      errors: [
        { code: 'PERMISSION', message: '权限不足，无法访问 C:\\x' },
        { code: 'BUSY', message: '文件被占用，无法删除' },
        { code: 'NOT_FOUND', message: '文件不存在，已跳过' },
      ],
    });
    const lis = $(host, '#install-report').querySelectorAll('li[data-code]');
    expect(lis.length).toBe(3);
    const byCode = {};
    lis.forEach((li) => {
      byCode[li.dataset.code] = li;
    });
    expect(byCode.PERMISSION.classList.contains('report-error')).toBe(true);
    expect(byCode.BUSY.classList.contains('report-error')).toBe(true);
    expect(byCode.NOT_FOUND.classList.contains('report-warn')).toBe(true);
    expect(byCode.PERMISSION.textContent).toContain('权限不足');
    expect($(host, '#install-report .ms-report-summary').textContent).toContain('未完成');
  });

  it('showReport 成功时渲染 ok 条目', () => {
    const { host, ui } = setup();
    ui.showReport({ ok: true, errors: [] });
    const ok = $(host, '#install-report li.report-ok');
    expect(ok).toBeTruthy();
    expect(ok.textContent).toContain('完成');
    expect($(host, '#install-report .ms-report-summary').textContent).toContain('全部成功');
  });
});

describe('旧版残留提示', () => {
  it('showLegacyPrompt 显隐提示区并接线清理按钮', () => {
    const { host, deps, ui } = setup();
    const area = $(host, '#installer-legacy-clean');
    expect(area.classList.contains('hidden')).toBe(true);
    ui.showLegacyPrompt({
      oldNsisDir: 'C:\\OldMS',
      oldShortcuts: ['a.lnk', 'b.lnk'],
      oldRegistry: true,
    });
    expect(area.classList.contains('hidden')).toBe(false);
    expect($(host, '#installer-legacy-clean-text').textContent).toContain('旧版目录 C:\\OldMS');
    expect($(host, '#installer-legacy-clean-text').textContent).toContain('旧版快捷方式 2 个');
    $(host, '#installer-legacy-clean-btn').click();
    expect(deps.actions.runCleanLegacy).toHaveBeenCalled();
    ui.showLegacyPrompt(null);
    expect(area.classList.contains('hidden')).toBe(true);
  });

  it('无残留数据时不显示提示区', () => {
    const { host, ui } = setup();
    ui.showLegacyPrompt({ oldShortcuts: [] });
    expect($(host, '#installer-legacy-clean').classList.contains('hidden')).toBe(true);
  });
});

describe('startSetupApp', () => {
  it('无 preload 时不崩并显示中文错误提示', async () => {
    document.body.innerHTML = '<div id="setup-root"></div>';
    delete window.minesweeperAPI;
    await startSetupApp();
    const err = document.querySelector('#setup-error');
    expect(err).toBeTruthy();
    expect(err.textContent).toContain('当前环境不支持安装功能');
    // 任何操作都不抛异常
    expect(() => document.querySelector('#install-dir-suggest').click()).not.toThrow();
    expect(() => document.querySelector('#install-next').click()).not.toThrow();
    await flush();
    expect(() => document.querySelector('#install-confirm').click()).not.toThrow();
    expect(() => document.querySelector('#uninstall-confirm-btn').click()).not.toThrow();
  });

  it('已安装状态 → 卸载确认视图（目录/版本）', async () => {
    document.body.innerHTML = '<div id="setup-root"></div>';
    window.minesweeperAPI = {
      installer: {
        getStatus: vi.fn().mockResolvedValue({
          installed: true,
          installDir: 'D:\\Game',
          appVersion: '1.2.0',
          legacy: null,
        }),
      },
    };
    await startSetupApp();
    expect(document.querySelector('#setup-mode').dataset.mode).toBe('uninstall');
    expect(document.querySelector('#uninstall-dir').textContent).toBe('D:\\Game');
    expect(document.querySelector('#uninstall-version').textContent).toBe('1.2.0');
  });

  it('未安装状态 → 安装向导 + legacy 提示', async () => {
    document.body.innerHTML = '<div id="setup-root"></div>';
    window.minesweeperAPI = {
      installer: {
        getStatus: vi.fn().mockResolvedValue({
          installed: false,
          installDir: null,
          appVersion: '1.2.0',
          legacy: { oldNsisDir: 'C:\\OldMS', oldShortcuts: [], oldRegistry: false },
        }),
      },
    };
    await startSetupApp();
    expect(document.querySelector('#setup-mode').dataset.mode).toBe('wizard');
    expect(document.querySelector('#setup-step').dataset.step).toBe('welcome');
    expect(document.querySelector('#installer-legacy-clean').classList.contains('hidden')).toBe(false);
  });

  it('安装流程接线：suggestDir 预填 → install → 进度订阅 → 报告', async () => {
    document.body.innerHTML = '<div id="setup-root"></div>';
    let progressCb = null;
    window.minesweeperAPI = {
      installer: {
        getStatus: vi.fn().mockResolvedValue({
          installed: false,
          installDir: null,
          appVersion: '1.2.0',
          legacy: null,
        }),
        suggestDir: vi.fn().mockResolvedValue('D:\\Minesweeper'),
        install: vi.fn().mockResolvedValue({ ok: true, errors: [] }),
        onProgress: vi.fn((cb) => {
          progressCb = cb;
          return () => {
            progressCb = null;
          };
        }),
      },
    };
    await startSetupApp();
    // 向导 → 下一步（suggestDir 预填）→ 确认安装
    document.querySelector('#install-next').click();
    await flush();
    expect(document.querySelector('#install-dir-input').value).toBe('D:\\Minesweeper');
    document.querySelector('#install-next').click();
    document.querySelector('#install-confirm').click();
    expect(window.minesweeperAPI.installer.install).toHaveBeenCalledWith({
      dir: 'D:\\Minesweeper',
      desktopShortcut: true,
      startMenuShortcut: true,
    });
    expect(document.querySelector('#setup-step').dataset.step).toBe('progress');
    // 进度事件 → 进度条
    progressCb({ phase: 'copy', done: 2, total: 4, message: '复制文件…' });
    expect(document.querySelector('#install-progress-fill').style.width).toBe('50%');
    // install 完成后 → report
    await flush();
    expect(document.querySelector('#setup-step').dataset.step).toBe('report');
    expect(document.querySelector('#install-report .ms-report-summary').textContent).toContain('全部成功');
  });
});
