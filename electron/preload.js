const { contextBridge, ipcRenderer } = require('electron');

// 暴露少量 API 给渲染进程，标识当前运行在 Electron 环境
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  /** 在系统默认浏览器中打开 URL（外部链接） */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
