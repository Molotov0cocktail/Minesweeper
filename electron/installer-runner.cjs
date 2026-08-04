// electron/installer-runner.cjs —— 安装/卸载真实副作用执行（薄胶水，无业务决策）。
// 全部决策/计划/错误分类在 src/core/installer.js（ESM，经 T8 测试覆盖）；本文件仅落地
// fs / reg.exe / PowerShell 快捷方式等副作用，转发进度事件（installer:progress）并逐条写日志。
// 路径全部运行时解析（process.execPath / app.getAppPath()），进程内不缓存安装目录绝对路径。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const { app } = require('electron');
const { enumSourceTree, scanTree, removeTree } = require('./fs-utils.cjs');

const REG_TIMEOUT_MS = 15000;

// ---------- 内部辅助 ----------

/** 同步执行外部命令（reg.exe / powershell），15s 超时，隐藏窗口 */
const runCmd = (file, args) =>
  spawnSync(file, args, { encoding: 'utf8', windowsHide: true, timeout: REG_TIMEOUT_MS });

/** 由 spawnSync 结果构造注册表/命令错误（message 为中文明细） */
const cmdError = (r) =>
  new Error(r.error ? r.error.message : `退出码 ${r.status}：${String(r.stderr || r.stdout || '').trim() || '无输出'}`);

/** executeSteps 注入的真实 fsOps（promises API，供 async 执行器调用） */
const fsOps = {
  existsSync: (p) => fs.existsSync(p),
  mkdir: (p, opts) => fs.promises.mkdir(p, opts),
  copyFile: (s, d) => fs.promises.copyFile(s, d),
  unlink: (p) => fs.promises.unlink(p),
  rmdir: (p) => fs.promises.rmdir(p),
};

/** 枚举非系统盘符（C..Z 中存在且非 SystemRoot 所在盘） */
function nonSystemDrives() {
  const sys = (process.env.SystemRoot || 'C:\\Windows').charAt(0).toUpperCase();
  const drives = [];
  for (let c = 67; c <= 90; c++) {
    const root = `${String.fromCharCode(c)}:\\`;
    try {
      if (fs.statSync(root).isDirectory()) drives.push(String.fromCharCode(c));
    } catch { /* 盘符不存在 */ }
  }
  return drives.filter((d) => d !== sys);
}

/**
 * createRunner({ logger, installerMod, getWindow }) -> { getStatus, suggestDir, install, uninstall, cleanLegacy }
 * installerMod: src/core/installer.js 模块命名空间（main.cjs 动态 import 后传入）。
 */
function createRunner({ logger, installerMod, getWindow }) {
  const mod = installerMod;
  const {
    MANIFEST_FILE, UNINSTALL_KEY, buildManifest, parseManifest, planInstall, planUninstall,
    relocateManifestDir, suggestInstallDir, validateInstallDir, detectLegacy,
    classifyFsError, classifyOpError, executeSteps, buildUninstallCleanupScript,
  } = mod;
  const log = logger;

  // ---------- 路径解析（运行时，不缓存） ----------
  const desktopLnk = () => path.join(app.getPath('desktop'), 'Minesweeper.lnk');
  const startMenuLnk = () =>
    path.join(process.env.APPDATA || app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Minesweeper.lnk');

  // ---------- 进度事件（installer:progress） ----------
  const sendProgress = (payload) => {
    const win = getWindow && getWindow();
    if (win && !win.isDestroyed()) {
      try {
        win.webContents.send('installer:progress', payload);
      } catch { /* 窗口已销毁则忽略 */ }
    }
  };

  // ---------- 注册表 ----------
  /** 读取 UninstallString 值：{ ok, value }（键/值不存在或 reg 失败 → ok:false） */
  const queryRegistryUninstallString = () => {
    const r = runCmd('reg.exe', ['query', UNINSTALL_KEY, '/v', 'UninstallString']);
    if (r.error || r.status !== 0) return { ok: false, value: null };
    const line = String(r.stdout || '').split(/\r?\n/).find((l) => /UninstallString/.test(l));
    const value = line ? String(line).replace(/^.*REG_SZ\s*/, '').trim() : null;
    return { ok: !!value, value };
  };
  /** 卸载键是否存在（旧版残留检测用） */
  const regKeyExists = () => {
    const r = runCmd('reg.exe', ['query', UNINSTALL_KEY]);
    return !r.error && r.status === 0;
  };
  /** 写入注册表卸载项（reg.exe add /f，逐值覆盖；首个失败 → REG_FAIL 停止） */
  const writeRegistryUninstallEntry = ({ appVersion, installDir, estimatedSizeKB }) => {
    const values = [
      ['DisplayName', 'REG_SZ', '扫雷 Minesweeper'],
      ['DisplayVersion', 'REG_SZ', appVersion],
      ['DisplayIcon', 'REG_SZ', `"${process.execPath}"`],
      ['UninstallString', 'REG_SZ', `"${process.execPath}" --uninstall`],
      ['InstallLocation', 'REG_SZ', installDir],
      ['NoModify', 'REG_DWORD', '1'],
      ['NoRepair', 'REG_DWORD', '1'],
      ['EstimatedSize', 'REG_DWORD', String(estimatedSizeKB)],
    ];
    for (const [name, type, value] of values) {
      const r = runCmd('reg.exe', ['add', UNINSTALL_KEY, '/v', name, '/t', type, '/d', value, '/f']);
      if (r.error || r.status !== 0) return classifyOpError('registry', cmdError(r));
    }
    return null;
  };
  /** 删除注册表卸载键（reg.exe delete /f） */
  const deleteRegistryUninstallKey = () => {
    const r = runCmd('reg.exe', ['delete', UNINSTALL_KEY, '/f']);
    if (r.error || r.status !== 0) return classifyOpError('registry', cmdError(r));
    return null;
  };

  // ---------- 快捷方式（PowerShell WScript.Shell） ----------
  const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
  /** 创建 .lnk；失败 → SHORTCUT_FAIL 错误对象，成功 → null */
  const createShortcut = (lnkPath, { targetExe, arguments: args, workingDir, description, icon }) => {
    const ps1 = path.join(os.tmpdir(), `minesweeper-shortcut-${Date.now()}-${Math.floor(Math.random() * 10000)}.ps1`);
    const script = [
      `$s = (New-Object -ComObject WScript.Shell).CreateShortcut(${psQuote(lnkPath)})`,
      `$s.TargetPath = ${psQuote(targetExe)}`,
      args ? `$s.Arguments = ${psQuote(args)}` : null,
      `$s.WorkingDirectory = ${psQuote(workingDir)}`,
      `$s.Description = ${psQuote(description)}`,
      icon ? `$s.IconLocation = ${psQuote(icon)}` : null,
      '$s.Save()',
    ].filter(Boolean).join('\r\n');
    try {
      fs.writeFileSync(ps1, script, 'utf8');
    } catch (err) {
      return classifyOpError('shortcut', err);
    }
    const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
      { encoding: 'utf8', windowsHide: true, timeout: REG_TIMEOUT_MS });
    try {
      fs.unlinkSync(ps1);
    } catch { /* 临时脚本删除失败可忽略 */ }
    if (r.error || r.status !== 0) {
      return classifyOpError('shortcut', cmdError(r));
    }
    return null;
  };

  // ---------- 状态 ----------
  /** InstallStatus = { installed, installDir, appVersion, legacy }（见 detailed-design §7） */
  const getStatus = () => {
    const reg = queryRegistryUninstallString();
    const manifestDir = relocateManifestDir({
      execPathDir: path.dirname(process.execPath),
      registryUninstallString: reg.ok ? reg.value : null,
      existsSync: fs.existsSync,
    });
    const legacy = detectLegacy({
      localAppData: process.env.LOCALAPPDATA,
      registryExists: regKeyExists(),
      existsSync: fs.existsSync,
      shortcutCandidates: [desktopLnk(), startMenuLnk()],
    });
    return {
      installed: !!manifestDir,
      installDir: manifestDir,
      appVersion: app.getVersion(),
      legacy,
    };
  };

  /** 安装目录建议（非系统盘第一个 → '<盘>:\Minesweeper'，全无 → %USERPROFILE% 兜底） */
  const suggestDir = () => suggestInstallDir(nonSystemDrives());

  // ---------- 安装 ----------
  /** opts: { dir, desktopShortcut, startMenuShortcut }（主进程已 BAD_ARG 校验） */
  const install = async (opts) => {
    const targetDir = path.resolve(opts.dir);
    log.info('installer', `开始安装：目标目录 ${targetDir}`);
    const reportBase = { dir: targetDir, shortcuts: [], errors: [], legacyCleaned: false };

    // 校验安装目录（PATH_INVALID 三种分支的中文文案来自 installer.js）
    let isFile = false;
    try {
      isFile = fs.statSync(targetDir).isFile();
    } catch { /* 目录不存在 → 允许创建 */ }
    const v = validateInstallDir(targetDir, { selfDir: app.getAppPath(), isFile });
    if (!v.ok) {
      const e = { code: 'PATH_INVALID', message: v.error, path: targetDir };
      log.error('installer', `${e.code}：${e.message}`);
      return { ok: false, ...reportBase, errors: [e] };
    }

    // 枚举源树（镜像 build.files：index.html/styles/src/electron/package.json）
    const sourceDir = app.getAppPath();
    const files = enumSourceTree(sourceDir);
    log.info('installer', `源树枚举完成：${files.length} 个文件（源：${sourceDir}）`);
    if (files.length === 0) {
      const e = { code: 'OP_ERROR', message: '操作失败：源目录中没有可安装的文件', path: sourceDir };
      log.error('installer', `${e.code}：${e.message}`);
      return { ok: false, ...reportBase, errors: [e] };
    }

    // 安装计划（排除清单文件自身）
    const { steps, dirs } = planInstall({ sourceDir, targetDir, files, excludes: [MANIFEST_FILE] });
    log.info('installer', `安装计划：${steps.length} 个复制步骤`);

    // 执行复制（进度事件 phase:'copy'，每步落日志）
    let doneSteps = 0;
    const stepResult = await executeSteps(steps, fsOps, (step, res) => {
      doneSteps++;
      sendProgress({
        phase: 'copy', done: doneSteps, total: steps.length,
        message: res.ok ? `已复制：${step.rel}` : `复制失败：${step.rel}`,
      });
      if (res.ok) log.info('installer', `已复制：${step.rel}`);
      else log.error('installer', `${res.error.code}：${res.error.message}`);
    });
    const errors = [...stepResult.errors];
    if (stepResult.done > 0) {
      log.info('installer', `复制完成：成功 ${stepResult.done}，跳过 ${stepResult.skipped}，失败 ${stepResult.errors.length}`);
    }

    // 写入安装清单 install-manifest.json
    try {
      const relDirs = dirs.map((d) => path.relative(targetDir, d) || '.');
      const shortcuts = [];
      if (opts.desktopShortcut !== false) shortcuts.push({ type: 'desktop', path: desktopLnk() });
      if (opts.startMenuShortcut !== false) shortcuts.push({ type: 'startmenu', path: startMenuLnk() });
      const manifestJson = buildManifest({
        appName: 'Minesweeper', appVersion: app.getVersion(), files, dirs: relDirs, shortcuts,
      });
      const manifestPath = path.join(targetDir, MANIFEST_FILE);
      fs.writeFileSync(manifestPath, manifestJson, 'utf8');
      log.info('installer', `安装清单已写入：${manifestPath}`);
    } catch (err) {
      const e = { ...classifyOpError('manifest', err, { path: path.join(targetDir, MANIFEST_FILE) }), path: path.join(targetDir, MANIFEST_FILE) };
      errors.push(e);
      log.error('installer', `${e.code}：${e.message}`);
    }

    // 估算已安装体积（KB，注册表 EstimatedSize）
    let totalBytes = 0;
    for (const s of steps) {
      try {
        totalBytes += fs.statSync(s.dst).size;
      } catch { /* 复制失败的步骤不计 */ }
    }
    const estimatedSizeKB = Math.max(1, Math.round(totalBytes / 1024));

    // 注册表卸载项
    sendProgress({ phase: 'registry', done: 0, total: 0, message: '写入注册表卸载项' });
    const regErr = writeRegistryUninstallEntry({ appVersion: app.getVersion(), installDir: targetDir, estimatedSizeKB });
    if (regErr) {
      errors.push({ ...regErr, path: UNINSTALL_KEY });
      log.error('installer', `${regErr.code}：${regErr.message}`);
    } else {
      log.info('installer', `注册表卸载项已写入：${UNINSTALL_KEY}`);
    }

    // 快捷方式（PowerShell WScript.Shell；目标 = 当前 exe + 安装目录参数）
    const createdShortcuts = [];
    sendProgress({ phase: 'shortcut', done: 0, total: 0, message: '创建快捷方式' });
    const shortcutSpec = { targetExe: process.execPath, arguments: targetDir, workingDir: path.dirname(process.execPath), description: '扫雷 Minesweeper', icon: `${process.execPath},0` };
    if (opts.desktopShortcut !== false) {
      const lnk = desktopLnk();
      const e = createShortcut(lnk, shortcutSpec);
      if (e) {
        errors.push({ ...e, path: lnk });
        log.error('installer', `${e.code}：${e.message}`);
      } else {
        createdShortcuts.push(lnk);
        log.info('installer', `桌面快捷方式已创建：${lnk}`);
      }
    }
    if (opts.startMenuShortcut !== false) {
      const lnk = startMenuLnk();
      try {
        fs.mkdirSync(path.dirname(lnk), { recursive: true });
      } catch { /* 目录创建失败由快捷方式操作兜底报错 */ }
      const e = createShortcut(lnk, shortcutSpec);
      if (e) {
        errors.push({ ...e, path: lnk });
        log.error('installer', `${e.code}：${e.message}`);
      } else {
        createdShortcuts.push(lnk);
        log.info('installer', `开始菜单快捷方式已创建：${lnk}`);
      }
    }

    const ok = errors.length === 0;
    log.info('installer', `安装结束：${ok ? '成功' : '完成但有错误'}（复制成功 ${stepResult.done}/${steps.length}，快捷方式 ${createdShortcuts.length} 个）`);
    return { ok, ...reportBase, shortcuts: createdShortcuts, errors };
  };

  // ---------- 卸载 ----------
  /** 卸载流程：清单重定位 → parseManifest → 扫描 → planUninstall → executeSteps → 注册表/快捷方式 → 自删 bat */
  const uninstall = async () => {
    log.info('uninstall', '开始卸载');
    const errors = [];

    // 1. 清单重定位：execPath 目录 → 注册表 UninstallString → null
    const reg = queryRegistryUninstallString();
    if (!reg.ok) log.warn('uninstall', '注册表 UninstallString 查询失败（可能尚未安装过）');
    const manifestDir = relocateManifestDir({
      execPathDir: path.dirname(process.execPath),
      registryUninstallString: reg.ok ? reg.value : null,
      existsSync: fs.existsSync,
    });
    if (!manifestDir) {
      const e = { ...classifyOpError('manifest', new Error('未能在程序目录或注册表 UninstallString 指向的目录找到安装清单'), { path: MANIFEST_FILE }), path: MANIFEST_FILE };
      log.error('uninstall', `${e.code}：${e.message}`);
      return { ok: false, dir: null, shortcuts: [], errors: [e], legacyCleaned: false };
    }
    log.info('uninstall', `清单重定位：${manifestDir}`);

    // 2. 解析清单（缺失/损坏/越版本 → MANIFEST_MISSING，无法清单式卸载）
    let manifest;
    try {
      const json = fs.readFileSync(path.join(manifestDir, MANIFEST_FILE), 'utf8');
      const parsed = parseManifest(json, manifestDir);
      if (!parsed.ok) {
        const e = { code: 'MANIFEST_MISSING', message: parsed.error, path: path.join(manifestDir, MANIFEST_FILE) };
        log.error('uninstall', `${e.code}：${e.message}`);
        return { ok: false, dir: manifestDir, shortcuts: [], errors: [e], legacyCleaned: false };
      }
      manifest = parsed.manifest;
    } catch (err) {
      const e = { ...classifyOpError('manifest', err, { path: path.join(manifestDir, MANIFEST_FILE) }), path: path.join(manifestDir, MANIFEST_FILE) };
      log.error('uninstall', `${e.code}：${e.message}`);
      return { ok: false, dir: manifestDir, shortcuts: [], errors: [e], legacyCleaned: false };
    }
    log.info('uninstall', `清单解析成功：${manifest.files.length} 个文件，${manifest.directories.length} 个目录`);

    // 3-4. 扫描目标树 + 卸载计划
    const tree = scanTree(manifestDir);
    const plan = planUninstall({ manifest, tree });
    if (plan.skippedExtraneous.length > 0) {
      log.warn('uninstall', `清单外内容，保留不删：${plan.skippedExtraneous.map((s) => s.rel).join('，')}`);
    }
    if (plan.skippedMissing.length > 0) {
      log.warn('uninstall', `清单内缺失，跳过：${plan.skippedMissing.join('，')}`);
    }

    // 5. 执行删除（进度事件 phase:'cleanup'，每步落日志）
    let doneSteps = 0;
    const failed = [];
    const stepResult = await executeSteps(plan.toDelete, fsOps, (step, res) => {
      doneSteps++;
      sendProgress({
        phase: 'cleanup', done: doneSteps, total: plan.toDelete.length,
        message: res.ok ? `已删除：${step.rel}` : `删除失败：${step.rel}`,
      });
      if (res.ok) log.info('uninstall', `已删除：${step.rel}`);
      else {
        log.error('uninstall', `${res.error.code}：${res.error.message}`);
        failed.push(step);
      }
    });
    errors.push(...stepResult.errors);
    if (stepResult.done > 0) {
      log.info('uninstall', `删除完成：成功 ${stepResult.done}，跳过 ${stepResult.skipped}，失败 ${stepResult.errors.length}`);
    }

    // 6. 删除注册表卸载键
    sendProgress({ phase: 'registry', done: 0, total: 0, message: '删除注册表卸载项' });
    const regErr = deleteRegistryUninstallKey();
    if (regErr) {
      errors.push({ ...regErr, path: UNINSTALL_KEY });
      log.error('uninstall', `${regErr.code}：${regErr.message}`);
    } else {
      log.info('uninstall', `注册表卸载项已删除：${UNINSTALL_KEY}`);
    }

    // 7. 删除快捷方式（已知位置，存在才删）
    const deletedShortcuts = [];
    sendProgress({ phase: 'shortcut', done: 0, total: 0, message: '删除快捷方式' });
    for (const lnk of [desktopLnk(), startMenuLnk()]) {
      if (!fs.existsSync(lnk)) continue;
      try {
        fs.unlinkSync(lnk);
        deletedShortcuts.push(lnk);
        log.info('uninstall', `快捷方式已删除：${lnk}`);
      } catch (err) {
        const e = { ...classifyOpError('shortcut', err), path: lnk };
        errors.push(e);
        log.error('uninstall', `${e.code}：${e.message}`);
      }
    }

    // 8. 占用未删净（如自身 exe）→ 生成延迟清理 .bat 并分离启动
    let cleanupBat = null;
    if (failed.length > 0) {
      const files = failed.filter((s) => s.type === 'file').map((s) => s.abs);
      const dirs = failed.filter((s) => s.type === 'dir').map((s) => s.abs);
      try {
        cleanupBat = path.join(os.tmpdir(), `minesweeper-uninstall-${Date.now()}.bat`);
        fs.writeFileSync(cleanupBat, buildUninstallCleanupScript({ files, dirs }), 'utf8');
        spawn('cmd.exe', ['/c', 'start', '', 'cmd', '/c', cleanupBat],
          { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        log.warn('uninstall', `部分文件被占用，延迟清理脚本已生成：${cleanupBat}`);
        sendProgress({ phase: 'cleanup', done: plan.toDelete.length, total: plan.toDelete.length, message: `延迟清理脚本：${cleanupBat}` });
      } catch (err) {
        const e = { ...classifyOpError('uninstall-cleanup', err), path: cleanupBat };
        errors.push(e);
        log.error('uninstall', `${e.code}：${e.message}`);
      }
    }

    const ok = errors.length === 0;
    log.info('uninstall', `卸载结束：${ok ? '成功' : '完成但有错误'}（目录 ${manifestDir}，错误 ${errors.length} 项）`);
    return { ok, dir: manifestDir, shortcuts: deletedShortcuts, errors, legacyCleaned: false };
  };

  // ---------- 旧版残留清理 ----------
  const cleanLegacy = async () => {
    log.info('cleanup', '开始清理旧版残留');
    const errors = [];
    const deleted = { nsisDir: null, shortcuts: [], registry: false };
    const legacy = detectLegacy({
      localAppData: process.env.LOCALAPPDATA,
      registryExists: regKeyExists(),
      existsSync: fs.existsSync,
      shortcutCandidates: [desktopLnk(), startMenuLnk()],
    });

    if (legacy.oldNsisDir) {
      const failed = [];
      removeTree(legacy.oldNsisDir, (err, p) => failed.push({ err, p }));
      for (const f of failed) {
        const e = { ...classifyFsError(f.err, f.p), path: f.p };
        errors.push(e);
        log.error('cleanup', `${e.code}：${e.message}`);
      }
      if (failed.length === 0) {
        deleted.nsisDir = legacy.oldNsisDir;
        log.info('cleanup', `旧版目录已删除：${legacy.oldNsisDir}`);
      } else {
        log.warn('cleanup', `旧版目录删除不完整：${legacy.oldNsisDir}（${failed.length} 处失败）`);
      }
    }
    for (const lnk of legacy.oldShortcuts) {
      try {
        fs.unlinkSync(lnk);
        deleted.shortcuts.push(lnk);
        log.info('cleanup', `旧版快捷方式已删除：${lnk}`);
      } catch (err) {
        const e = { ...classifyOpError('shortcut', err), path: lnk };
        errors.push(e);
        log.error('cleanup', `${e.code}：${e.message}`);
      }
    }
    if (legacy.oldRegistry) {
      const e = deleteRegistryUninstallKey();
      if (e) {
        errors.push({ ...e, path: UNINSTALL_KEY });
        log.error('cleanup', `${e.code}：${e.message}`);
      } else {
        deleted.registry = true;
        log.info('cleanup', `旧版注册表卸载项已删除：${UNINSTALL_KEY}`);
      }
    }
    if (!legacy.oldNsisDir && legacy.oldShortcuts.length === 0 && !legacy.oldRegistry) {
      log.info('cleanup', '未发现旧版残留');
    }

    const ok = errors.length === 0;
    log.info('cleanup', `清理结束：${ok ? '成功' : '完成但有错误'}`);
    return { ok, deleted, errors };
  };

  return { getStatus, suggestDir, install, uninstall, cleanLegacy };
}

module.exports = { createRunner };
