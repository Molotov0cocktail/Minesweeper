// @vitest-environment node
// 严格测试：安装/卸载纯逻辑模块（契约见 detailed-design §5c）。
// 注：本模块使用 node:path，路径断言按 win32 风格（项目目标平台）。
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import {
  MANIFEST_FILE,
  UNINSTALL_KEY,
  toManifestPath,
  buildManifest,
  parseManifest,
  classifyFsError,
  classifyOpError,
  planInstall,
  planUninstall,
  relocateManifestDir,
  suggestInstallDir,
  validateInstallDir,
  detectLegacy,
  buildUninstallCleanupScript,
  executeSteps,
  formatLogLine,
} from '../src/core/installer.js';

// ---------- 内存 fake fsOps ----------
function makeFs({ files = [], dirs = [], throwOn = {} } = {}) {
  const state = { files: new Set(files), dirs: new Set(dirs) };
  const errors = { ...throwOn };
  const mkErr = (code, msg) => Object.assign(new Error(msg), { code });
  return {
    state,
    errors,
    existsSync: vi.fn((p) => state.files.has(p)),
    mkdir: vi.fn(async (p) => {
      if (errors[p]) throw errors[p];
      state.dirs.add(p);
    }),
    copyFile: vi.fn(async (src, dst) => {
      if (errors[src]) throw errors[src];
      if (errors[dst]) throw errors[dst];
      if (!state.files.has(src)) throw mkErr('ENOENT', '源文件不存在');
      state.files.add(dst);
    }),
    unlink: vi.fn(async (p) => {
      if (errors[p]) throw errors[p];
      if (!state.files.has(p)) throw mkErr('ENOENT', '文件不存在');
      state.files.delete(p);
    }),
    rmdir: vi.fn(async (p) => {
      if (errors[p]) throw errors[p];
      if (!state.dirs.has(p)) throw mkErr('ENOENT', '目录不存在');
      state.dirs.delete(p);
    }),
  };
}

const BASE = 'C:\\App';

describe('toManifestPath：相对路径规范化与拒绝', () => {
  it('正常相对路径保留（统一反斜杠）', () => {
    expect(toManifestPath('Minesweeper.exe')).toBe('Minesweeper.exe');
    expect(toManifestPath('locales\\zh-CN.pak')).toBe('locales\\zh-CN.pak');
    expect(toManifestPath('locales/zh-CN.pak')).toBe('locales\\zh-CN.pak');
    expect(toManifestPath('a\\b\\c.txt')).toBe('a\\b\\c.txt');
  });
  it('空串 → null', () => {
    expect(toManifestPath('')).toBeNull();
  });
  it('绝对路径（盘符/UNC/根斜杠）→ null', () => {
    expect(toManifestPath('C:\\x.exe')).toBeNull();
    expect(toManifestPath('\\\\server\\share\\x.exe')).toBeNull();
    expect(toManifestPath('\\x.exe')).toBeNull();
  });
  it("含 '..' 段 → null（防穿越）", () => {
    expect(toManifestPath('..\\x.exe')).toBeNull();
    expect(toManifestPath('a\\..\\b.exe')).toBeNull();
    expect(toManifestPath('..')).toBeNull();
  });
  it("含 ':' → null", () => {
    expect(toManifestPath('a:b.exe')).toBeNull();
  });
});

describe('buildManifest / parseManifest', () => {
  const manifestData = {
    appName: 'Minesweeper',
    appVersion: '1.0.0',
    files: ['Minesweeper.exe', 'resources\\app.asar'],
    dirs: ['resources', 'locales'],
    shortcuts: [
      { type: 'desktop', path: 'C:\\Users\\u\\Desktop\\Minesweeper.lnk' },
      { type: 'startmenu', path: 'C:\\Users\\u\\Start Menu\\Minesweeper.lnk' },
    ],
  };

  it('往返一致（除 installedAt 为 ISO 时间字符串）', () => {
    const json = buildManifest(manifestData);
    const r = parseManifest(json, BASE);
    expect(r.ok).toBe(true);
    expect(r.manifest.appName).toBe('Minesweeper');
    expect(r.manifest.appVersion).toBe('1.0.0');
    expect(r.manifest.files).toEqual(manifestData.files);
    expect(r.manifest.directories).toEqual(manifestData.dirs);
    expect(r.manifest.shortcuts).toEqual(manifestData.shortcuts);
    expect(r.manifest.registry.key).toBe(UNINSTALL_KEY);
    expect(r.manifest.baseDir).toBe(path.resolve(BASE));
    expect(new Date(r.manifest.installedAt).toString()).not.toBe('Invalid Date');
  });

  it('损坏 JSON → {ok:false, error 中文}', () => {
    const r = parseManifest('{{{bad', BASE);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('JSON');
  });

  it('version !== 1 → 错误', () => {
    const json = JSON.stringify({ ...JSON.parse(buildManifest(manifestData)), version: 2 });
    const r = parseManifest(json, BASE);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('版本');
  });

  it('结构缺失（files 非数组）→ 错误', () => {
    const json = JSON.stringify({ version: 1, files: 'x' });
    const r = parseManifest(json, BASE);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('结构');
  });

  it('路径逃逸（..\\）→ 拒绝', () => {
    const json = JSON.stringify({ version: 1, files: ['..\\evil.exe'], directories: [], shortcuts: [] });
    const r = parseManifest(json, BASE);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('越界');
  });

  it('非法路径条目（绝对路径）→ 拒绝', () => {
    const json = JSON.stringify({ version: 1, files: ['C:\\evil.exe'], directories: [], shortcuts: [] });
    const r = parseManifest(json, BASE);
    expect(r.ok).toBe(false);
  });
});

describe('错误分类：classifyFsError 全表', () => {
  it('ENOENT → NOT_FOUND', () => {
    const r = classifyFsError(Object.assign(new Error('x'), { code: 'ENOENT' }), 'C:\\a.txt');
    expect(r.code).toBe('NOT_FOUND');
    expect(r.message).toBe('文件不存在，已跳过：C:\\a.txt');
  });
  it('EACCES/EPERM → PERMISSION', () => {
    for (const code of ['EACCES', 'EPERM']) {
      const r = classifyFsError(Object.assign(new Error('x'), { code }), 'C:\\a.txt');
      expect(r.code).toBe('PERMISSION');
      expect(r.message).toContain('权限不足');
      expect(r.message).toContain('C:\\a.txt');
    }
  });
  it('EBUSY/EMFILE/ENOTEMPTY → BUSY', () => {
    for (const code of ['EBUSY', 'EMFILE', 'ENOTEMPTY']) {
      const r = classifyFsError(Object.assign(new Error('x'), { code }), 'C:\\a.txt');
      expect(r.code).toBe('BUSY');
      expect(r.message).toContain('文件被占用');
    }
  });
  it('其他错误 → FS_ERROR', () => {
    const r = classifyFsError(Object.assign(new Error('weird'), { code: 'EIO' }), 'C:\\a.txt');
    expect(r.code).toBe('FS_ERROR');
  });
});

describe('错误分类：classifyOpError', () => {
  it('registry → REG_FAIL', () => {
    const r = classifyOpError('registry', new Error('reg 退出码 5'));
    expect(r.code).toBe('REG_FAIL');
    expect(r.message).toBe('注册表操作失败：reg 退出码 5');
  });
  it('shortcut → SHORTCUT_FAIL', () => {
    const r = classifyOpError('shortcut', new Error('com 失败'));
    expect(r.code).toBe('SHORTCUT_FAIL');
    expect(r.message).toContain('快捷方式操作失败');
  });
  it('copy + ENOSPC → 磁盘空间不足', () => {
    const r = classifyOpError('copy', Object.assign(new Error('no space'), { code: 'ENOSPC' }), { src: 'A', dst: 'B' });
    expect(r.code).toBe('COPY_FAIL');
    expect(r.message).toContain('磁盘空间不足');
    expect(r.message).toContain('A');
    expect(r.message).toContain('B');
  });
  it('copy 其他错误 → 含 src/dst', () => {
    const r = classifyOpError('copy', new Error('boom'), { src: 'A', dst: 'B' });
    expect(r.code).toBe('COPY_FAIL');
    expect(r.message).toBe('复制失败：A → B：boom');
  });
  it('manifest → MANIFEST_MISSING', () => {
    const r = classifyOpError('manifest', new Error('bad'), { path: 'C:\\m.json' });
    expect(r.code).toBe('MANIFEST_MISSING');
    expect(r.message).toContain('安装清单缺失或损坏');
  });
  it('未知 op → OP_ERROR', () => {
    const r = classifyOpError('unknown', new Error('x'));
    expect(r.code).toBe('OP_ERROR');
  });
});

describe('planInstall', () => {
  it('steps 与 dirs 结构正确、排除清单文件', () => {
    const r = planInstall({
      sourceDir: 'D:\\dev\\app',
      targetDir: 'C:\\App',
      files: ['Minesweeper.exe', 'resources\\app.asar', MANIFEST_FILE],
      excludes: [MANIFEST_FILE],
    });
    expect(r.steps).toEqual([
      { type: 'copy', rel: 'Minesweeper.exe', src: 'D:\\dev\\app\\Minesweeper.exe', dst: 'C:\\App\\Minesweeper.exe' },
      { type: 'copy', rel: 'resources\\app.asar', src: 'D:\\dev\\app\\resources\\app.asar', dst: 'C:\\App\\resources\\app.asar' },
    ]);
    // dirs：目标根 → 子目录（自顶向下）
    expect(r.dirs[0]).toBe('C:\\App');
    expect(r.dirs).toContain('C:\\App\\resources');
  });
});

describe('planUninstall：清单式删除 + 保留外来文件', () => {
  const manifest = {
    baseDir: path.resolve(BASE),
    files: ['f1.exe', 'sub\\f2.dll'],
    directories: ['sub'],
  };

  it('全部存在 → 全部删除：文件在前、目录自底向上、根目录最后', () => {
    const r = planUninstall({
      manifest,
      tree: { files: ['C:\\App\\f1.exe', 'C:\\App\\sub\\f2.dll'], dirs: ['C:\\App\\sub', 'C:\\App'] },
    });
    expect(r.toDelete.map((t) => t.rel)).toEqual(['f1.exe', 'sub\\f2.dll', 'sub', '.']);
    expect(r.toDelete[0].type).toBe('file');
    expect(r.toDelete[2].type).toBe('dir');
    expect(r.toDelete[3].abs).toBe('C:\\App'); // 根目录最后删
    expect(r.skippedExtraneous).toEqual([]);
    expect(r.skippedMissing).toEqual([]);
  });

  it('清单内缺失 → skippedMissing（非错误）', () => {
    const r = planUninstall({
      manifest,
      tree: { files: ['C:\\App\\f1.exe'], dirs: ['C:\\App'] },
    });
    expect(r.toDelete.map((t) => t.rel)).toEqual(['f1.exe', '.']);
    expect(r.skippedMissing).toEqual(['sub\\f2.dll', 'sub']);
  });

  it('清单外文件 → skippedExtraneous 且不影响其余删除', () => {
    const r = planUninstall({
      manifest,
      tree: { files: ['C:\\App\\f1.exe', 'C:\\App\\sub\\f2.dll', 'C:\\App\\user.txt'], dirs: ['C:\\App\\sub', 'C:\\App'] },
    });
    expect(r.toDelete.map((t) => t.rel)).toEqual(['f1.exe', 'sub\\f2.dll', 'sub', '.']);
    expect(r.skippedExtraneous).toEqual([{ rel: 'user.txt', abs: 'C:\\App\\user.txt' }]);
  });

  it('清单内目录含清单外内容 → 该目录跳过不删（防误删）', () => {
    const r = planUninstall({
      manifest,
      tree: { files: ['C:\\App\\f1.exe', 'C:\\App\\sub\\f2.dll', 'C:\\App\\sub\\user.txt'], dirs: ['C:\\App\\sub', 'C:\\App'] },
    });
    expect(r.toDelete.map((t) => t.rel)).toEqual(['f1.exe', '.']);
    expect(r.skippedExtraneous.map((e) => e.rel)).toContain('sub');
    expect(r.skippedExtraneous.map((e) => e.rel)).toContain('sub\\user.txt');
  });
});

describe('relocateManifestDir：移动目录后重定位', () => {
  it('execPath 目录有清单 → 优先返回', () => {
    const existsSync = vi.fn((p) => p === path.join('D:\\Game', MANIFEST_FILE));
    const r = relocateManifestDir({ execPathDir: 'D:\\Game', registryUninstallString: '', existsSync });
    expect(r).toBe('D:\\Game');
  });
  it('execPath 无清单 → 从注册表 UninstallString 重定位', () => {
    const existsSync = vi.fn((p) => p === path.join('D:\\Old', MANIFEST_FILE));
    const r = relocateManifestDir({ execPathDir: 'C:\\New', registryUninstallString: '"D:\\Old\\Minesweeper.exe" --uninstall', existsSync });
    expect(r).toBe('D:\\Old');
  });
  it('未加引号的注册表路径也可解析', () => {
    const existsSync = vi.fn((p) => p === path.join('D:\\Old', MANIFEST_FILE));
    const r = relocateManifestDir({ execPathDir: 'C:\\New', registryUninstallString: 'D:\\Old\\Minesweeper.exe --uninstall', existsSync });
    expect(r).toBe('D:\\Old');
  });
  it('双失效 / 注册表垃圾 → null', () => {
    const existsSync = vi.fn(() => false);
    expect(relocateManifestDir({ execPathDir: 'C:\\New', registryUninstallString: 'garbage no path', existsSync })).toBeNull();
    expect(relocateManifestDir({ execPathDir: 'C:\\New', registryUninstallString: '', existsSync })).toBeNull();
  });
});

describe('suggestInstallDir / validateInstallDir', () => {
  it('suggestInstallDir：有 D 用 D、无 D 用其他盘、全无兜底 %USERPROFILE%', () => {
    expect(suggestInstallDir(['D', 'E'])).toBe('D:\\Minesweeper');
    expect(suggestInstallDir(['E'])).toBe('E:\\Minesweeper');
    expect(suggestInstallDir([])).toBe('%USERPROFILE%\\Minesweeper');
  });

  it('validateInstallDir：非绝对路径 → 错误', () => {
    expect(validateInstallDir('App', { selfDir: 'C:\\Game', isFile: false }).ok).toBe(false);
    expect(validateInstallDir('', { selfDir: 'C:\\Game', isFile: false }).ok).toBe(false);
    expect(validateInstallDir('C:\\App', { selfDir: 'C:\\Game', isFile: false }).ok).toBe(true);
  });
  it('validateInstallDir：自身目录 → 错误', () => {
    const r = validateInstallDir('C:\\Game', { selfDir: 'C:\\Game', isFile: false });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('自身');
  });
  it('validateInstallDir：已存在且是文件 → 错误', () => {
    const r = validateInstallDir('C:\\App', { selfDir: 'C:\\Game', isFile: true });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('不是目录');
  });
});

describe('detectLegacy：旧版残留检测', () => {
  it('旧 NSIS 目录存在 + 匹配快捷方式 + 注册表键 → 全量报告', () => {
    const existsSync = vi.fn((p) => p === path.join('C:\\Users\\u\\AppData\\Local\\Programs', 'minesweeper') || p === 'C:\\Users\\u\\Desktop\\扫雷 Minesweeper.lnk');
    const r = detectLegacy({
      localAppData: 'C:\\Users\\u\\AppData\\Local',
      registryExists: true,
      existsSync,
      shortcutCandidates: [
        'C:\\Users\\u\\Desktop\\扫雷 Minesweeper.lnk',
        'C:\\Users\\u\\Desktop\\notes.txt',
        'C:\\Users\\u\\Start\\other.lnk',
      ],
    });
    expect(r.oldNsisDir).toBe('C:\\Users\\u\\AppData\\Local\\Programs\\minesweeper');
    expect(r.oldShortcuts).toEqual(['C:\\Users\\u\\Desktop\\扫雷 Minesweeper.lnk']);
    expect(r.oldRegistry).toBe(true);
  });
  it('无残留 → 全空', () => {
    const r = detectLegacy({ localAppData: 'C:\\x', registryExists: false, existsSync: vi.fn(() => false), shortcutCandidates: [] });
    expect(r.oldNsisDir).toBeNull();
    expect(r.oldShortcuts).toEqual([]);
    expect(r.oldRegistry).toBe(false);
  });
});

describe('buildUninstallCleanupScript', () => {
  it('文件先、目录自底向上、最后自删 %~f0、路径引号包裹', () => {
    const script = buildUninstallCleanupScript({ files: ['C:\\App\\f1.exe', 'C:\\App\\sub\\f2.dll'], dirs: ['C:\\App\\sub', 'C:\\App'] });
    const lines = script.split('\n');
    expect(lines[0]).toBe('@echo off');
    expect(lines[1]).toBe('del /f /q "C:\\App\\f1.exe"');
    expect(lines[2]).toBe('del /f /q "C:\\App\\sub\\f2.dll"');
    expect(lines[3]).toBe('rmdir "C:\\App\\sub"'); // 深目录先
    expect(lines[4]).toBe('rmdir "C:\\App"');
    expect(lines[5]).toBe('del "%~f0"');
  });
});

describe('executeSteps（注入 fake fsOps）', () => {
  it('复制成功序列：mkdir 父目录 → copyFile，done 计数，onStep 回调', async () => {
    const fs = makeFs({ files: ['D:\\src\\a.exe'], dirs: [] });
    const onStep = vi.fn();
    const r = await executeSteps([
      { type: 'copy', src: 'D:\\src\\a.exe', dst: 'C:\\App\\a.exe', rel: 'a.exe' },
      { type: 'copy', src: 'D:\\src\\sub\\b.dll', dst: 'C:\\App\\sub\\b.dll', rel: 'sub\\b.dll' },
    ], fs, onStep);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.done).toBe(2);
    expect(r.skipped).toBe(0);
    expect(fs.state.files.has('C:\\App\\a.exe')).toBe(true);
    expect(fs.state.files.has('C:\\App\\sub\\b.dll')).toBe(true);
    expect(fs.mkdir).toHaveBeenCalledWith('C:\\App', { recursive: true });
    expect(fs.mkdir).toHaveBeenCalledWith('C:\\App\\sub', { recursive: true });
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onStep.mock.calls[0][1].ok).toBe(true);
  });

  it('复制源缺失 → NOT_FOUND 记录且继续后续步骤（失败不中断）', async () => {
    const fs = makeFs({ files: ['D:\\src\\b.dll'] });
    const r = await executeSteps([
      { type: 'copy', src: 'D:\\src\\a.exe', dst: 'C:\\App\\a.exe', rel: 'a.exe' },
      { type: 'copy', src: 'D:\\src\\b.dll', dst: 'C:\\App\\b.dll', rel: 'b.dll' },
    ], fs);
    expect(r.ok).toBe(false);
    expect(r.errors[0].code).toBe('NOT_FOUND');
    expect(r.errors[0].message).toContain('D:\\src\\a.exe');
    expect(r.done).toBe(1); // 第二个成功
    expect(fs.state.files.has('C:\\App\\b.dll')).toBe(true);
  });

  it('复制权限错误 → PERMISSION 记录继续', async () => {
    const fs = makeFs({ files: ['D:\\src\\a.exe'], throwOn: { 'C:\\App\\a.exe': Object.assign(new Error('denied'), { code: 'EACCES' }) } });
    const r = await executeSteps([{ type: 'copy', src: 'D:\\src\\a.exe', dst: 'C:\\App\\a.exe', rel: 'a.exe' }], fs);
    expect(r.ok).toBe(false);
    expect(r.errors[0].code).toBe('PERMISSION');
  });

  it('删除：NOT_FOUND 视为已删（skipped 不进 errors）', async () => {
    const fs = makeFs({ files: ['C:\\App\\a.exe'], dirs: ['C:\\App'] });
    const r = await executeSteps([
      { type: 'file', rel: 'a.exe', abs: 'C:\\App\\a.exe' },
      { type: 'file', rel: 'gone.txt', abs: 'C:\\App\\gone.txt' },
      { type: 'dir', rel: '.', abs: 'C:\\App' },
    ], fs);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.done).toBe(2);
    expect(r.skipped).toBe(1);
    expect(fs.state.files.has('C:\\App\\a.exe')).toBe(false);
    expect(fs.state.dirs.has('C:\\App')).toBe(false);
  });

  it('删除被占用 → BUSY 收集且继续删其余', async () => {
    const fs = makeFs({ files: ['C:\\App\\a.exe', 'C:\\App\\b.dll'], dirs: [] });
    fs.errors['C:\\App\\a.exe'] = Object.assign(new Error('busy'), { code: 'EBUSY' });
    const r = await executeSteps([
      { type: 'file', rel: 'a.exe', abs: 'C:\\App\\a.exe' },
      { type: 'file', rel: 'b.dll', abs: 'C:\\App\\b.dll' },
    ], fs);
    expect(r.ok).toBe(false);
    expect(r.errors[0].code).toBe('BUSY');
    expect(r.done).toBe(1);
    expect(fs.state.files.has('C:\\App\\b.dll')).toBe(false);
  });
});

describe('formatLogLine', () => {
  it('精确格式 [ts] [LEVEL] [module] message', () => {
    expect(formatLogLine('INFO', 'installer', '安装完成', '2026-08-04 10:00:00.000'))
      .toBe('[2026-08-04 10:00:00.000] [INFO] [installer] 安装完成');
    expect(formatLogLine('ERROR', 'main', '崩溃', '2026-08-04 11:00:00.000'))
      .toBe('[2026-08-04 11:00:00.000] [ERROR] [main] 崩溃');
  });
});
