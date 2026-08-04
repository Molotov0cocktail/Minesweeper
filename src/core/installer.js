// 安装/卸载决策纯逻辑（零 fs/child_process 副作用，仅依赖 node:path 做字符串处理）。
// 真实文件系统/注册表/快捷方式副作用由主进程 electron/installer-runner.cjs 执行。
// 契约见 doc/detailed-design.md §5c。

import path from 'node:path';

// ---------- 常量 ----------

export const MANIFEST_FILE = 'install-manifest.json';
export const UNINSTALL_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Minesweeper';
export const LEGACY_NSIS_DIR_NAME = 'minesweeper'; // %LOCALAPPDATA%\Programs\minesweeper

// ---------- 内部辅助 ----------

// 已知文件系统错误码（classifyFsError 全表映射）
const FS_ERROR_CODES = new Set(['ENOENT', 'EACCES', 'EPERM', 'EBUSY', 'EMFILE', 'ENOTEMPTY']);

// win32 绝对路径判定（盘符 / UNC），跨平台一致，不用 path.isAbsolute
const WIN32_ABS_RE = /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/;

// 相对路径是否含 '..' 段（路径穿越）
const hasTraversal = (s) => typeof s === 'string' && s.split(/[\\/]/).includes('..');

/**
 * 规范化清单相对路径：'/' → '\'。
 * 空串、绝对路径（盘符/UNC/以 \ 开头）、含 '..' 段、含 ':' → null。
 */
export function toManifestPath(rel) {
  if (typeof rel !== 'string' || rel === '') return null;
  const norm = rel.replaceAll('/', '\\');
  if (norm.includes(':')) return null;
  if (norm.startsWith('\\') || WIN32_ABS_RE.test(norm)) return null;
  if (hasTraversal(norm)) return null;
  return norm;
}

/**
 * 构建安装清单 JSON 字符串（files/dirs 经 toManifestPath 规范化，非法条目剔除）。
 */
export function buildManifest({ appName, appVersion, files, dirs, shortcuts }) {
  const clean = (arr) => (Array.isArray(arr) ? arr.map(toManifestPath).filter((p) => p !== null) : []);
  return JSON.stringify({
    version: 1,
    appName,
    appVersion,
    installedAt: new Date().toISOString(),
    files: clean(files),
    directories: clean(dirs),
    shortcuts: Array.isArray(shortcuts) ? shortcuts : [],
    registry: { key: UNINSTALL_KEY },
  });
}

/**
 * 解析并校验安装清单。
 * @returns {{ ok: true, manifest }|{ ok: false, error: string }}
 */
export function parseManifest(json, baseDir) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: '清单文件不是有效的 JSON' };
  }
  if (data === null || typeof data !== 'object') {
    return { ok: false, error: '清单文件不是有效的 JSON' };
  }
  if (data.version !== 1) {
    return { ok: false, error: `清单版本不受支持：${data.version}` };
  }
  if (!Array.isArray(data.files) || !Array.isArray(data.directories)) {
    return { ok: false, error: '清单结构不完整' };
  }
  const resolvedBase = path.resolve(baseDir);
  const prefix = resolvedBase + path.sep;
  for (const entry of [...data.files, ...data.directories]) {
    if (hasTraversal(entry)) return { ok: false, error: `清单包含越界路径：${entry}` };
    const norm = toManifestPath(entry);
    if (norm === null) return { ok: false, error: `清单包含非法路径：${entry}` };
    const abs = path.resolve(resolvedBase, norm);
    if (abs !== resolvedBase && !abs.startsWith(prefix)) {
      return { ok: false, error: `清单包含越界路径：${entry}` };
    }
  }
  return { ok: true, manifest: { ...data, baseDir: resolvedBase } };
}

/**
 * 文件系统错误分类（中文全表）。
 */
export function classifyFsError(err, pathStr) {
  const code = err && err.code;
  if (code === 'ENOENT') return { code: 'NOT_FOUND', message: `文件不存在，已跳过：${pathStr}` };
  if (code === 'EACCES' || code === 'EPERM') {
    return { code: 'PERMISSION', message: `权限不足，无法访问 ${pathStr}（可尝试以管理员身份运行）` };
  }
  if (code === 'EBUSY' || code === 'EMFILE' || code === 'ENOTEMPTY') {
    return { code: 'BUSY', message: `文件被占用，无法删除 ${pathStr}（请先关闭正在使用该文件的程序）` };
  }
  return { code: 'FS_ERROR', message: `文件系统错误：${pathStr}（${code ?? 'unknown'}）` };
}

/**
 * 操作级错误分类（op: registry/shortcut/copy/manifest/其他）。
 */
export function classifyOpError(op, err, ctx = {}) {
  const msg = (err && err.message) || String(err);
  switch (op) {
    case 'registry':
      return { code: 'REG_FAIL', message: `注册表操作失败：${msg}` };
    case 'shortcut':
      return { code: 'SHORTCUT_FAIL', message: `快捷方式操作失败：${msg}` };
    case 'copy': {
      const detail = err && err.code === 'ENOSPC' ? '磁盘空间不足' : msg;
      return { code: 'COPY_FAIL', message: `复制失败：${ctx.src} → ${ctx.dst}：${detail}` };
    }
    case 'manifest':
      return { code: 'MANIFEST_MISSING', message: `安装清单缺失或损坏：${ctx.path}（无法清单式卸载）` };
    default:
      return { code: 'OP_ERROR', message: `操作失败：${msg}` };
  }
}

/**
 * 安装计划：生成 copy 步骤（自顶向下需创建的目录）。
 * v3 扩展：映射优先级 renames 精确命中 > relPrefix 前缀命中 > 原样；
 * step.rel = 安装后 rel；dirs 按映射后的 dst 生成；excludes 判断用源 rel。
 * 缺省 renames/relPrefix → 与 v2 行为逐字节一致（向后兼容）。
 */
export function planInstall({ sourceDir, targetDir, files, excludes = [], renames = {}, relPrefix = null }) {
  const excluded = new Set(excludes);
  const steps = [];
  const dirs = [targetDir];
  const seenDirs = new Set([targetDir]);
  for (const rel of files) {
    if (excluded.has(rel)) continue;
    const norm = toManifestPath(rel);
    if (norm === null) continue;
    // 映射优先级：renames 精确命中 > relPrefix 前缀命中 > 原样
    let installed = norm;
    if (Object.prototype.hasOwnProperty.call(renames, norm)) {
      installed = renames[norm];
    } else if (
      relPrefix &&
      typeof relPrefix.src === 'string' &&
      typeof relPrefix.dst === 'string' &&
      norm.startsWith(relPrefix.src + '\\')
    ) {
      installed = relPrefix.dst + norm.slice(relPrefix.src.length);
    }
    const src = path.join(sourceDir, norm);
    const dst = path.join(targetDir, installed);
    steps.push({ type: 'copy', rel: installed, src, dst });
    const chain = [];
    let cur = path.dirname(dst);
    while (cur !== targetDir && !seenDirs.has(cur)) {
      chain.push(cur);
      seenDirs.add(cur);
      cur = path.dirname(cur);
    }
    for (let i = chain.length - 1; i >= 0; i--) dirs.push(chain[i]);
  }
  return { steps, dirs };
}

/**
 * 卸载计划：清单式删除 + 保留外来内容。
 * tree = { files: string[], dirs: string[] }（磁盘实际扫描，绝对路径，含安装根目录）。
 */
export function planUninstall({ manifest, tree }) {
  const base = path.resolve(manifest.baseDir);
  const mFiles = Array.isArray(manifest.files) ? manifest.files : [];
  const mDirs = Array.isArray(manifest.directories) ? manifest.directories : [];
  const mFileSet = new Set(mFiles);
  const mDirSet = new Set(mDirs);
  const diskFiles = Array.isArray(tree.files) ? tree.files : [];
  const diskDirs = Array.isArray(tree.dirs) ? tree.dirs : [];
  const diskFileSet = new Set(diskFiles);
  const diskDirSet = new Set(diskDirs);

  const relOf = (abs) => {
    const r = path.relative(base, abs);
    return r === '' ? '.' : r;
  };
  const diskFileRels = new Map(diskFiles.map((f) => [f, relOf(f)]));
  const diskDirRels = new Map(diskDirs.map((d) => [d, relOf(d)]));

  // 每个磁盘条目最近的磁盘目录祖先（不含自身；无则视为安装根目录）
  const parentDirOf = (abs) => {
    let cur = path.dirname(abs);
    while (cur !== base && cur !== path.dirname(cur)) {
      if (diskDirSet.has(cur)) return cur;
      cur = path.dirname(cur);
    }
    return base;
  };

  const childFilesByDir = new Map();
  for (const f of diskFiles) {
    const p = parentDirOf(f);
    if (!childFilesByDir.has(p)) childFilesByDir.set(p, []);
    childFilesByDir.get(p).push(f);
  }
  const childDirsByDir = new Map();
  for (const d of diskDirs) {
    if (d === base) continue;
    const p = parentDirOf(d);
    if (!childDirsByDir.has(p)) childDirsByDir.set(p, []);
    childDirsByDir.get(p).push(d);
  }

  const depthOf = (abs) => abs.split(path.sep).length;
  const nonRootDirs = diskDirs.filter((d) => d !== base);
  const sortedDirs = [...nonRootDirs].sort((a, b) => depthOf(b) - depthOf(a));

  // 可删除目录：在清单内且仅含清单内内容（自底向上判定）
  const deletableDirs = new Set();
  const skippedExtraneous = [];
  for (const d of sortedDirs) {
    const rel = diskDirRels.get(d);
    const childFilesOk = (childFilesByDir.get(d) || []).every((f) => mFileSet.has(diskFileRels.get(f)));
    const childDirsOk = (childDirsByDir.get(d) || []).every((cd) => mDirSet.has(diskDirRels.get(cd)) && deletableDirs.has(cd));
    if (mDirSet.has(rel) && childFilesOk && childDirsOk) {
      deletableDirs.add(d);
    } else {
      skippedExtraneous.push({ rel, abs: d });
    }
  }

  // 清单外文件（清单内但所在目录被跳过的文件不单独报告，随目录保留）
  for (const f of diskFiles) {
    const rel = diskFileRels.get(f);
    if (rel === MANIFEST_FILE) continue; // 清单自身由下方统一处理，不算清单外
    if (!mFileSet.has(rel)) skippedExtraneous.push({ rel, abs: f });
  }

  const toDelete = [];
  // 文件：清单序在前；仅当所在目录可删（或直属安装根）才删除
  for (const rel of mFiles) {
    const abs = path.join(base, rel);
    if (!diskFileSet.has(abs)) continue;
    const parent = parentDirOf(abs);
    if (parent === base || deletableDirs.has(parent)) {
      toDelete.push({ type: 'file', rel, abs });
    }
  }
  // 清单文件本身也纳入删除（清单不列出自身；否则残留使根目录永远非空、无法卸载干净）
  const manifestAbs = path.join(base, MANIFEST_FILE);
  if (diskFileSet.has(manifestAbs)) {
    toDelete.push({ type: 'file', rel: MANIFEST_FILE, abs: manifestAbs });
  }
  // 目录：自底向上（深→浅）
  const deletableList = [...deletableDirs].sort((a, b) => depthOf(b) - depthOf(a));
  for (const d of deletableList) {
    toDelete.push({ type: 'dir', rel: diskDirRels.get(d), abs: d });
  }
  // 安装根目录（rel='.'）最后
  if (diskDirSet.has(base)) toDelete.push({ type: 'dir', rel: '.', abs: base });
  // 清单内缺失（非错误）：文件在前（清单序）、目录在后
  const skippedMissing = [];
  for (const rel of mFiles) {
    if (!diskFileSet.has(path.join(base, rel))) skippedMissing.push(rel);
  }
  for (const rel of mDirs) {
    if (!diskDirSet.has(path.join(base, rel))) skippedMissing.push(rel);
  }

  return { toDelete, skippedExtraneous, skippedMissing };
}

/**
 * 从注册表 UninstallString 解析 exe 路径：去引号 → 取首个 token。
 */
function parseRegistryExePath(s) {
  if (typeof s !== 'string') return null;
  const unquoted = s.replaceAll('"', '');
  const first = unquoted.trim().split(/\s+/)[0];
  return first || null;
}

/**
 * 清单重定位优先级链（v3）：execPath 目录优先 → 注册表 InstallLocation（去引号 trim 后
 * 原样目录）→ 解析注册表 UninstallString exe 的 dirname；全失效 → null。
 * registryInstallLocation 缺省 → 与 v2 行为一致（向后兼容）。
 */
export function relocateManifestDir({ execPathDir, registryInstallLocation, registryUninstallString, existsSync }) {
  if (execPathDir && existsSync(path.join(execPathDir, MANIFEST_FILE))) return execPathDir;
  if (typeof registryInstallLocation === 'string') {
    const loc = registryInstallLocation.replaceAll('"', '').trim();
    if (loc && existsSync(path.join(loc, MANIFEST_FILE))) return loc;
  }
  const exe = parseRegistryExePath(registryUninstallString);
  if (exe) {
    const dir = path.dirname(exe);
    if (existsSync(path.join(dir, MANIFEST_FILE))) return dir;
  }
  return null;
}

/**
 * 安装目录建议：非系统盘第一个 → '<盘>:\Minesweeper'；全无 → %USERPROFILE%\Minesweeper。
 */
export function suggestInstallDir(drives) {
  if (Array.isArray(drives) && drives.length > 0 && drives[0]) {
    return `${drives[0]}:\\Minesweeper`;
  }
  return '%USERPROFILE%\\Minesweeper';
}

/**
 * 安装目录校验（win32 正则判定绝对路径，跨平台一致）。
 */
export function validateInstallDir(dir, { selfDir, isFile }) {
  if (typeof dir !== 'string' || dir === '' || !WIN32_ABS_RE.test(dir)) {
    return { ok: false, error: `路径无效：${dir}（必须为绝对路径）` };
  }
  if (dir === selfDir) {
    return { ok: false, error: `不能安装到程序自身所在目录（${selfDir}）` };
  }
  if (isFile) {
    return { ok: false, error: `目标路径已存在且不是目录，请更换安装位置：${dir}` };
  }
  return { ok: true };
}

/**
 * 旧版（NSIS）残留检测。
 */
export function detectLegacy({ localAppData, registryExists, existsSync, shortcutCandidates }) {
  const oldNsisDir = localAppData ? path.join(localAppData, 'Programs', LEGACY_NSIS_DIR_NAME) : null;
  const nsisExists = oldNsisDir ? existsSync(oldNsisDir) : false;
  const oldShortcuts = (Array.isArray(shortcutCandidates) ? shortcutCandidates : []).filter((p) => {
    const name = path.basename(p);
    return /(Minesweeper|扫雷)/i.test(name) && /\.lnk$/i.test(name) && existsSync(p);
  });
  return {
    oldNsisDir: nsisExists ? oldNsisDir : null,
    oldShortcuts,
    oldRegistry: !!registryExists,
  };
}

/**
 * 生成卸载清理 .bat 脚本：文件先、目录自底向上、带重试循环（应用退出后文件解锁才能删净）、
 * 最后自删；路径一律双引号包裹。
 * 结构：@echo off → 初始等待 → tries 计数 → :retry → 全部 del/rmdir → 若仍有残留 goto retry
 * （60 次上限约 5 分钟，防死循环）→ :done → del "%~f0"
 */
export function buildUninstallCleanupScript({ files, dirs }) {
  const depthOf = (p) => p.split(path.sep).length;
  const sortedDirs = [...(dirs || [])].sort((a, b) => depthOf(b) - depthOf(a));
  const lines = [
    '@echo off',
    'ping 127.0.0.1 -n 2 > nul', // 初始等待：给应用退出留窗口
    'set tries=0',
    ':retry',
    'set /a tries+=1',
    'if %tries% gtr 60 goto done',
  ];
  for (const f of files || []) lines.push(`del /f /q "${f}"`);
  for (const d of sortedDirs) lines.push(`rmdir "${d}"`);
  for (const f of files || []) lines.push(`if exist "${f}" goto retry`);
  for (const d of sortedDirs) lines.push(`if exist "${d}" goto retry`);
  lines.push(':done', 'del "%~f0"');
  return lines.join('\n');
}

/**
 * 注入式步骤执行器（异步）。单步失败归类记录并继续；删除 NOT_FOUND 视为已删。
 * fsOps: { existsSync, mkdir, copyFile, unlink, rmdir }
 * @returns Promise<{ ok, errors:[{code,message,path}], done, skipped }>
 */
export async function executeSteps(steps, fsOps, onStep) {
  const errors = [];
  let done = 0;
  let skipped = 0;
  const report = (step, ok, error) => {
    if (onStep) onStep(step, ok ? { ok: true } : { ok: false, error });
  };
  for (const step of steps) {
    if (step.type === 'copy') {
      const { src, dst } = step;
      try {
        await fsOps.mkdir(path.dirname(dst), { recursive: true });
      } catch (err) {
        const e = { ...classifyOpError('copy', err, { src, dst }), path: dst };
        errors.push(e);
        report(step, false, e);
        continue;
      }
      if (!fsOps.existsSync(src)) {
        const e = { ...classifyFsError(Object.assign(new Error('源文件不存在'), { code: 'ENOENT' }), src), path: src };
        errors.push(e);
        skipped++;
        report(step, false, e);
        continue;
      }
      try {
        await fsOps.copyFile(src, dst);
        done++;
        report(step, true);
      } catch (err) {
        const e = FS_ERROR_CODES.has(err && err.code)
          ? { ...classifyFsError(err, dst), path: dst }
          : { ...classifyOpError('copy', err, { src, dst }), path: dst };
        errors.push(e);
        report(step, false, e);
      }
    } else if (step.type === 'file' || step.type === 'dir') {
      const op = step.type === 'file' ? fsOps.unlink : fsOps.rmdir;
      try {
        await op(step.abs);
        done++;
        report(step, true);
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          skipped++;
          report(step, true);
        } else {
          const e = { ...classifyFsError(err, step.abs), path: step.abs };
          errors.push(e);
          report(step, false, e);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors, done, skipped };
}

/**
 * 日志行格式化：'[<ts>] [<LEVEL>] [<module>] <message>'
 */
export function formatLogLine(level, module, message, ts) {
  return `[${ts}] [${level}] [${module}] ${message}`;
}
