const { contextBridge } = require('electron');

// 暴露少量 API 给渲染进程，标识当前运行在 Electron 环境
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
});
