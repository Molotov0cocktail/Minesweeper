// electron/preload.cjs —— contextBridge 暴露最小 API 面（见 doc/detailed-design.md §7）。
// 通道名固定（无动态 channel）：app:get-version / installer:get-status / installer:suggest-dir /
// installer:install / installer:uninstall / installer:clean-legacy / installer:progress 事件。
// 渲染层一律 window.minesweeperAPI?.installer 可选链守卫（无 preload 环境不崩）。

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('minesweeperAPI', {
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
  },
  installer: {
    getStatus: () => ipcRenderer.invoke('installer:get-status'),
    suggestDir: () => ipcRenderer.invoke('installer:suggest-dir'),
    install: (opts) => ipcRenderer.invoke('installer:install', opts), // {dir, desktopShortcut, startMenuShortcut}
    uninstall: () => ipcRenderer.invoke('installer:uninstall'),
    cleanLegacy: () => ipcRenderer.invoke('installer:clean-legacy'),
    onProgress: (cb) => {
      const handler = (_event, payload) => {
        try {
          cb(payload);
        } catch { /* 回调抛错不影响主进程 */ }
      };
      ipcRenderer.on('installer:progress', handler);
      return () => ipcRenderer.removeListener('installer:progress', handler);
    },
  },
});
