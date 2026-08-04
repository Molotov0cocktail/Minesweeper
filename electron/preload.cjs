// electron/preload.cjs —— contextBridge 暴露最小 API 面（游戏侧，v3 起仅版本查询）。
// 安装/卸载 API 已剥离至独立安装器（electron/preload-setup.cjs，MinesweeperSetup）。
// 渲染层一律 window.minesweeperAPI?.app 可选链守卫（无 preload 环境不崩）。

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('minesweeperAPI', {
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
  },
});
