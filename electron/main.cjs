// Electron 主进程（v3 双应用分派入口）：
// - 检测到独立安装器环境（resources 下存在内嵌游戏目录 game-app，或环境变量
//   MINESWEEPER_SETUP=1）→ 分派到 ./setup.cjs（MinesweeperSetup 安装器）后 return；
// - 否则为游戏主进程：窗口 + 固定通道 IPC（app:get-version，senderFrame 校验）
//   + 单实例锁 + 崩溃日志 + 打包态 InstallLocation 自愈（移动目录后注册表跟随）。
// 安装/卸载向导、installer IPC、--uninstall 已从游戏剥离（v3，见 doc/detailed-design.md §7）。
// 路径全部运行时从 process.execPath / app.getAppPath() 解析，进程内不缓存安装目录绝对路径。
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createLogger } = require('./log.cjs');

// ---------- IS_SETUP 分派（须在一切业务逻辑之前） ----------
// 打包形态：setup 的 resources/ 下存在内嵌游戏目录 game-app（extraResources）；
// 开发形态：环境变量 MINESWEEPER_SETUP=1（调试安装器 UI）。
const isSetup =
  process.env.MINESWEEPER_SETUP === '1' ||
  fs.existsSync(path.join(path.dirname(app.getAppPath()), 'game-app'));
if (isSetup) {
  require('./setup.cjs'); // 安装器自持 app 生命周期（CJS 顶层 return 合法）
  return;
}

const logger = createLogger();
logger.info('main', `进程启动：exe=${process.execPath}，appPath=${app.getAppPath()}，日志=${logger.getLogPath()}`);

// ---------- 鲁棒性：未捕获异常/拒绝 → 写日志不闪退 ----------
process.on('uncaughtException', (err) => {
  logger.error('main', `uncaughtException：${(err && err.stack) || String(err)}`);
});
process.on('unhandledRejection', (reason) => {
  logger.error('main', `unhandledRejection：${(reason && reason.stack) || String(reason)}`);
});

// ---------- 打包态 InstallLocation 自愈（v3） ----------
// 注册表卸载项键名与 src/core/installer.js 的 UNINSTALL_KEY 一致（游戏程序不打包该模块，内联）。
const UNINSTALL_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Minesweeper';

/** 若注册表 InstallLocation 与自身目录不符且自身目录存在安装清单 → 更新（移动目录后 setup 仍可定位卸载） */
function selfHealInstallLocation() {
  if (!app.isPackaged) return; // 仅打包形态（dev 态不触碰注册表）
  const ownDir = path.dirname(process.execPath);
  if (!fs.existsSync(path.join(ownDir, 'install-manifest.json'))) return; // 自身非安装副本
  const query = spawnSync('reg.exe', ['query', UNINSTALL_KEY, '/v', 'InstallLocation'],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (query.error || query.status !== 0) return; // 无卸载项 → 无需自愈
  const line = String(query.stdout || '').split(/\r?\n/).find((l) => /InstallLocation/.test(l));
  const value = line ? String(line).replace(/^.*REG_SZ\s*/, '').trim() : '';
  if (value === ownDir) return;
  logger.warn('main', `InstallLocation 与自身目录不符（${value || '空'} → ${ownDir}），尝试自愈`);
  const add = spawnSync('reg.exe', ['add', UNINSTALL_KEY, '/v', 'InstallLocation', '/t', 'REG_SZ', '/d', ownDir, '/f'],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (add.error || add.status !== 0) {
    logger.warn('main', 'InstallLocation 自愈失败（不影响运行）');
  } else {
    logger.info('main', `InstallLocation 已自愈：${ownDir}`);
  }
}

// ---------- 单实例锁 ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  logger.warn('main', '已有实例在运行，本实例退出');
  app.quit();
}

// ---------- 窗口 ----------
function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 480,
    minHeight: 360,
    icon: path.join(__dirname, '..', 'assets', 'minesweeper.png'),
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

// ---------- IPC：固定通道白名单（app:get-version 单通道，senderFrame 校验） ----------
const rejected = (reason) => ({ ok: false, errors: [{ code: 'BAD_ARG', message: `参数无效：${reason}` }] });

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
}

// ---------- 生命周期 ----------
app.whenReady().then(async () => {
  logger.info('main', 'app ready');
  selfHealInstallLocation(); // 打包态自愈（同步 reg.exe，正常路径毫秒级）

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
