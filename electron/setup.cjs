// electron/setup.cjs —— MinesweeperSetup 独立安装器主进程
// （由 main.cjs 顶部 IS_SETUP 分派 require 后接管 app 生命周期；CJS 顶层 return 语义，
// 本文件自持窗口/CLI/IPC/runner，见 doc/detailed-design.md §7）。
// 零痕迹：userData 与日志全部重定向 %TEMP%（便携解压目录退出自动删除）——删磁盘 exe 无印记。
// CLI：--uninstall（静默卸载，控制面板 UninstallString 入口）；
//      --install-dir <dir>（静默安装，默认建桌面+开始菜单快捷方式，
//        --no-desktop-shortcut / --no-startmenu-shortcut 可关）；
//      无参数 → GUI 安装向导/卸载确认窗口。

const { app, BrowserWindow, ipcMain } = require('electron');
const os = require('os');
const path = require('path');
const { createLogger } = require('./log.cjs');
const { createRunner } = require('./installer-runner.cjs');

// ---------- 零痕迹：userData / 日志全部落 %TEMP% ----------
app.setPath('userData', path.join(os.tmpdir(), 'MinesweeperSetup-userdata'));
const logger = createLogger({ dir: path.join(os.tmpdir(), 'MinesweeperSetup', 'logs') });
logger.info('setup', `安装器启动：exe=${process.execPath}，userData=${app.getPath('userData')}，日志=${logger.getLogPath()}`);

// ---------- 鲁棒性：未捕获异常/拒绝 → 写日志不闪退 ----------
process.on('uncaughtException', (err) => {
  logger.error('setup', `uncaughtException：${(err && err.stack) || String(err)}`);
});
process.on('unhandledRejection', (reason) => {
  logger.error('setup', `unhandledRejection：${(reason && reason.stack) || String(reason)}`);
});

// ---------- CLI 解析 ----------
/** --name <值> 或 --name=<值>；缺失 → null */
function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const pref = `${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : null;
}
const IS_UNINSTALL = process.argv.includes('--uninstall');
const SILENT_INSTALL_DIR = argValue('--install-dir');
const NO_DESKTOP = process.argv.includes('--no-desktop-shortcut');
const NO_STARTMENU = process.argv.includes('--no-startmenu-shortcut');

// ---------- 单实例锁（防双开向导；second-instance 聚焦已有窗口） ----------
let runner = null;
let win = null;
let silentDone = false; // 静默路径完成标记（防止 window-all-closed 干扰退出）

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  logger.warn('setup', '已有安装器实例在运行，本实例退出');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// ---------- IPC：固定通道白名单（与 v2 游戏侧一致的校验，迁入本文件） ----------
// 每个 handler 校验 event.senderFrame === win.webContents.mainFrame；install(opts) 另有入参校验。
// win32 绝对路径判定（盘符 / UNC），与 src/core/installer.js 判定一致
const WIN32_ABS_RE = /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/;

const rejected = (reason) => ({ ok: false, errors: [{ code: 'BAD_ARG', message: `参数无效：${reason}` }] });

/** install(opts) 入参校验：dir 绝对路径 + resolve 后 startsWith(允许根) 防穿越；shortcut 必须 boolean */
function validateInstallOpts(opts) {
  if (opts === null || typeof opts !== 'object') return rejected('opts 必须为对象');
  const dir = typeof opts.dir === 'string' ? opts.dir.trim() : '';
  if (dir === '' || !WIN32_ABS_RE.test(dir)) return rejected('安装目录必须为绝对路径');
  const abs = path.resolve(dir);
  const root = /^[A-Za-z]:/.test(abs) ? abs.slice(0, 3) : abs.split(path.sep).slice(0, 4).join(path.sep);
  if (!abs.startsWith(root)) return rejected('安装目录超出允许范围');
  if (opts.desktopShortcut !== undefined && typeof opts.desktopShortcut !== 'boolean') {
    return rejected('desktopShortcut 必须为布尔值');
  }
  if (opts.startMenuShortcut !== undefined && typeof opts.startMenuShortcut !== 'boolean') {
    return rejected('startMenuShortcut 必须为布尔值');
  }
  return { ok: true };
}

function registerIpc() {
  const isTrusted = (event) => {
    const w = (win && !win.isDestroyed()) ? win
      : BrowserWindow.getAllWindows().find((x) => !x.isDestroyed()) || null;
    return !!(w && event.senderFrame && event.senderFrame === w.webContents.mainFrame);
  };
  const guard = (event) => (isTrusted(event) ? null : rejected('调用来源不受信任'));

  ipcMain.handle('app:get-version', (event) => {
    const g = guard(event);
    if (g) return g;
    return app.getVersion();
  });

  ipcMain.handle('installer:get-status', (event) => {
    const g = guard(event);
    if (g) return g;
    if (!runner) return rejected('安装模块未加载');
    return runner.getStatus();
  });

  ipcMain.handle('installer:suggest-dir', (event) => {
    const g = guard(event);
    if (g) return g;
    if (!runner) return rejected('安装模块未加载');
    return runner.suggestDir();
  });

  ipcMain.handle('installer:install', (event, opts) => {
    const g = guard(event);
    if (g) return g;
    if (!runner) return rejected('安装模块未加载');
    const v = validateInstallOpts(opts);
    if (!v.ok) return v;
    logger.info('setup', `installer:install 入参校验通过：dir=${opts.dir}`);
    return runner.install(opts);
  });

  ipcMain.handle('installer:uninstall', (event) => {
    const g = guard(event);
    if (g) return g;
    if (!runner) return rejected('安装模块未加载');
    return runner.uninstall();
  });

  ipcMain.handle('installer:clean-legacy', (event) => {
    const g = guard(event);
    if (g) return g;
    if (!runner) return rejected('安装模块未加载');
    return runner.cleanLegacy();
  });
}

// ---------- 静默路径（--uninstall / --install-dir） ----------
/** 静默卸载完成后退出（清理子进程防锁目录，同 v2） */
async function runSilentUninstall() {
  logger.info('setup', '收到 --uninstall 请求，开始静默卸载');
  if (!runner) {
    logger.error('setup', '卸载执行器未就绪，静默卸载终止');
    app.exit(1);
    return;
  }
  try {
    const report = await runner.uninstall();
    logger.info('setup', `静默卸载结果：${JSON.stringify(report)}`);
    // 清理残留子进程：退出后 GPU/utility 等子进程仍可能锁住安装目录
    try {
      for (const m of app.getAppMetrics()) {
        if (m.pid && m.pid !== process.pid) {
          try {
            process.kill(m.pid);
          } catch { /* 子进程已退出 */ }
        }
      }
    } catch (err) {
      logger.warn('setup', `清理子进程失败：${(err && err.stack) || String(err)}`);
    }
    app.exit(report && report.ok ? 0 : 1);
  } catch (err) {
    logger.error('setup', `静默卸载异常：${(err && err.stack) || String(err)}`);
    app.exit(1);
  }
}

/** 静默安装（--install-dir <dir>；快捷方式按 CLI 开关） */
async function runSilentInstall(dir) {
  logger.info('setup', `收到 --install-dir 请求，开始静默安装：${dir}`);
  if (!runner) {
    logger.error('setup', '安装执行器未就绪，静默安装终止');
    app.exit(1);
    return;
  }
  try {
    const report = await runner.install({
      dir,
      desktopShortcut: !NO_DESKTOP,
      startMenuShortcut: !NO_STARTMENU,
    });
    logger.info('setup', `静默安装结果：ok=${report && report.ok}，errors=${JSON.stringify(report && report.errors)}`);
    app.exit(report && report.ok ? 0 : 1);
  } catch (err) {
    logger.error('setup', `静默安装异常：${(err && err.stack) || String(err)}`);
    app.exit(1);
  }
}

// ---------- GUI 窗口 ----------
function createWindow() {
  win = new BrowserWindow({
    width: 520,
    height: 480,
    icon: path.join(__dirname, '..', 'assets', 'minesweeper.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload-setup.cjs'),
    },
  });
  win.loadFile(path.join(__dirname, '..', 'setup', 'index.html'));
  return win;
}

// ---------- 生命周期 ----------
app.whenReady().then(async () => {
  logger.info('setup', 'app ready');
  try {
    // src/core/installer.js 为 ESM（package.json "type":"module"），.cjs 侧动态 import 加载
    const installerMod = await import('../src/core/installer.js');
    runner = createRunner({
      logger,
      installerMod,
      getWindow: () => (win && !win.isDestroyed() ? win : null),
    });
    logger.info('setup', '安装执行器已就绪');
  } catch (err) {
    logger.error('setup', `installer 模块加载失败：${(err && err.stack) || String(err)}`);
  }

  // 静默路径不创建窗口
  if (IS_UNINSTALL) {
    silentDone = true;
    await runSilentUninstall();
    return;
  }
  if (SILENT_INSTALL_DIR) {
    silentDone = true;
    await runSilentInstall(SILENT_INSTALL_DIR);
    return;
  }

  createWindow();
  registerIpc();
});

app.on('window-all-closed', () => {
  if (!silentDone && process.platform !== 'darwin') app.quit();
});
