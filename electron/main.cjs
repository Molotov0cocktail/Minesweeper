// Electron 主进程：创建窗口、加载 index.html
// 无自定义 IPC 需求（详见 detailed-design.md 第 7 节）
const { app, BrowserWindow } = require('electron');
const path = require('path');

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
    },
  });

  // index.html 位于项目根目录
  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  // macOS：点击 Dock 图标且无窗口时重建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 非 macOS：全部窗口关闭后退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
