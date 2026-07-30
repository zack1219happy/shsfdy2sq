// ============================================
// Electron 主进程 — 内嵌 HTTP 服务器加载静态导出
// ============================================
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const net = require('net');

const PORT = 3456;
const STATIC_DIR = path.join(__dirname, '..', 'out');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
};

// -------------------------------------------------
// 简单静态文件服务器（无需额外依赖）
// -------------------------------------------------
function createServer() {
  return http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];

    // basePath 兼容：如果路径以 /shsfdy2sq 开头，去掉前缀
    // （CI 构建会写入 basePath，本地构建没有）
    if (urlPath.startsWith('/shsfdy2sq')) {
      urlPath = urlPath.replace('/shsfdy2sq', '') || '/';
    }

    let filePath = path.join(STATIC_DIR, urlPath);

    // 如果路径是目录，尝试内部的 index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    // 文件不存在 → 404
    if (!fs.existsSync(filePath)) {
      filePath = path.join(STATIC_DIR, '404', 'index.html');
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
}

// -------------------------------------------------
// 端口探测：从 startPort 开始找可用端口
// -------------------------------------------------
function findFreePort(startPort, maxAttempts = 10) {
  return new Promise((resolve, reject) => {
    function tryPort(port, attempt) {
      if (attempt >= maxAttempts) {
        return reject(new Error(`无法找到可用端口（尝试 ${startPort}～${startPort + maxAttempts - 1}）`));
      }
      const server = net.createServer();
      server.on('error', () => tryPort(port + 1, attempt + 1));
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(port));
      });
    }
    tryPort(startPort, 0);
  });
}

// -------------------------------------------------
// 创建窗口
// -------------------------------------------------
function createWindow(port) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 400,
    minHeight: 300,
    title: '二旦社区',
    icon: path.join(STATIC_DIR, 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(`http://localhost:${port}`);

  win.on('closed', () => { /* no-op */ });
}

// -------------------------------------------------
// IPC：外部链接 → 系统默认浏览器打开
// -------------------------------------------------
ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('https:') || url.startsWith('http:'))) {
    await shell.openExternal(url);
  }
});

// -------------------------------------------------
// 启动
// -------------------------------------------------
app.whenReady().then(async () => {
  // 移除默认菜单栏（File / Edit / View / Window / Help）
  Menu.setApplicationMenu(null);

  try {
    const port = await findFreePort(PORT);
    const server = createServer();
    server.listen(port, () => {
      createWindow(port);
    });
  } catch (err) {
    console.error(err.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
