// Electron 主进程：窗口 + preload 挂载 + 固定通道 IPC（senderFrame 校验 + 入参校验）
// + 单实例锁（second-instance --uninstall 转发）+ --uninstall 静默卸载
// + uncaughtException/unhandledRejection 写日志不闪退（鲁棒性）。
// 路径全部运行时从 process.execPath / app.getAppPath() 解析，进程内不缓存安装目录绝对路径。
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createLogger } = require('./log.cjs');
const { createRunner } = require('./installer-runner.cjs');

const logger = createLogger();
logger.info('main', `进程启动：exe=${process.execPath}，appPath=${app.getAppPath()}，日志=${logger.getLogPath()}`);

const IS_UNINSTALL = process.argv.includes('--uninstall');

// ---------- 鲁棒性：未捕获异常/拒绝 → 写日志不闪退 ----------
process.on('uncaughtException', (err) => {
  logger.error('main', `uncaughtException：${(err && err.stack) || String(err)}`);
});
process.on('unhandledRejection', (reason) => {
  logger.error('main', `unhandledRejection：${(reason && reason.stack) || String(reason)}`);
});

// ---------- 单实例锁 ----------
let runner = null; // installer-runner 实例（whenReady 后创建）
let uninstallTriggered = false;

/** --uninstall 静默卸载（本实例 argv 或 second-instance 转发）；完成后退出 */
function triggerSilentUninstall() {
  if (uninstallTriggered) return;
  uninstallTriggered = true;
  logger.info('main', '收到 --uninstall 请求，开始静默卸载');
  (async () => {
    if (!runner) {
      logger.error('main', '卸载执行器未就绪，静默卸载终止');
      return;
    }
    const report = await runner.uninstall();
    logger.info('main', `静默卸载结果：${JSON.stringify(report)}`);
  })().then(() => app.quit()).catch((err) => {
    logger.error('main', `静默卸载异常：${(err && err.stack) || String(err)}`);
    app.quit();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  logger.warn('main', '已有实例在运行，本实例退出');
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    logger.info('main', `second-instance：argv=${JSON.stringify(argv)}`);
    if (argv.includes('--uninstall')) triggerSilentUninstall();
  });
}

// ---------- 窗口 ----------
function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 480,
    minHeight: 360,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // index.html 位于项目根目录
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  return win;
}

// ---------- IPC：固定通道白名单（仅下面 6 个 invoke 通道 + installer:progress 推送事件）
// 每个 handler 校验 event.senderFrame === win.webContents.mainFrame；install(opts) 另有入参校验 ----------
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

function registerIpc(win) {
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
    logger.info('main', `installer:install 入参校验通过：dir=${opts.dir}`);
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

// ---------- 生命周期 ----------
app.whenReady().then(async () => {
  logger.info('main', 'app ready');
  try {
    // src/core/installer.js 为 ESM（package.json "type":"module"），.cjs 侧动态 import 加载
    const installerMod = await import('../src/core/installer.js');
    runner = createRunner({
      logger,
      installerMod,
      getWindow: () => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) || null,
    });
    logger.info('main', '安装执行器已就绪');
  } catch (err) {
    logger.error('main', `installer 模块加载失败：${(err && err.stack) || String(err)}`);
  }

  // --uninstall 入口（控制面板 UninstallString 调用）：不创建窗口，静默卸载后退出
  if (IS_UNINSTALL) {
    triggerSilentUninstall();
    return;
  }

  const win = createWindow();
  registerIpc(win);

  // macOS：点击 Dock 图标且无窗口时重建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 非 macOS：全部窗口关闭后退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
