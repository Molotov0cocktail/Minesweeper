// 冒烟诊断脚本（开发用）：加载页面、收集控制台/崩溃事件、截图、检查画布与 DOM，然后退出。
// 运行：ELECTRON_RUN_AS_NODE= npx electron scripts/smoke.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  const consoleLines = [];
  let rendererGone = null;
  let failLoad = null;

  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) consoleLines.push(`[error] ${message}`);
    else if (level === 1) consoleLines.push(`[warn] ${message}`);
  });
  win.webContents.on('render-process-gone', (_e, details) => { rendererGone = details.reason; });
  win.webContents.on('did-fail-load', (_e, code, desc) => { failLoad = `${code} ${desc}`; });

  try {
    await win.loadFile(path.join(__dirname, '..', 'index.html'));
    await new Promise((r) => setTimeout(r, 3000));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, '..', 'smoke-screenshot.png'), img.toPNG());
    const cells = await win.webContents.executeJavaScript(`(() => {
      const c = document.getElementById('board-canvas');
      return {
        canvasExists: !!c,
        canvasW: c ? c.width : -1,
        canvasH: c ? c.height : -1,
        appChildren: document.getElementById('app') ? document.getElementById('app').children.length : -1,
        modeButtons: document.querySelectorAll('.ms-mode').length,
        title: document.title,
      };
    })()`);
    console.log('SMOKE_RESULT ' + JSON.stringify({ consoleLines, rendererGone, failLoad, cells }));
  } catch (err) {
    console.log('SMOKE_ERROR ' + err && err.stack);
  }
  app.quit();
});

app.on('window-all-closed', () => app.quit());
