// ============================================
// Electron 主进程 — 内嵌 HTTP 服务器加载静态导出
// ============================================
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

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

    // trailingSlash：指向 index.html
    if (urlPath.endsWith('/')) {
      urlPath += 'index.html';
    }

    let filePath = path.join(STATIC_DIR, urlPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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
// 创建窗口
// -------------------------------------------------
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: '二旦班知识库',
    icon: path.join(STATIC_DIR, 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(`http://localhost:${PORT}`);

  win.on('closed', () => { /* no-op */ });
}

// -------------------------------------------------
// 启动
// -------------------------------------------------
app.whenReady().then(() => {
  // 移除默认菜单栏（File / Edit / View / Window / Help）
  Menu.setApplicationMenu(null);

  const server = createServer();
  server.listen(PORT, () => {
    createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
