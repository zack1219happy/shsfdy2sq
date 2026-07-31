/**
 * 系统通知工具 — 供 Claude Code 的 notify 流程调用。
 * 若 node-notifier 缺失，自动安装（--no-save，不写入 package.json）后再发送。
 */
const path = require('path');
const { execSync } = require('child_process');

const message = process.argv[2] || '任务已完成';

// 确保 node-notifier 可用；缺失时自动安装
let notifier;
try {
  notifier = require('node-notifier');
} catch {
  console.log('[notify] node-notifier 未安装，自动安装…');
  try {
    execSync(
      'npm install node-notifier --no-save --registry=https://registry.npmmirror.com',
      { stdio: 'pipe', cwd: __dirname, timeout: 120000 },
    );
    notifier = require('node-notifier');
  } catch (installErr) {
    console.error('[notify] 自动安装失败，降级为终端提示：', installErr.message);
    console.log('⚠️ ' + message);
    process.exit(0);
  }
}

notifier.notify(
  {
    title: 'Claude Code',               // 通知标题
    message: message,                   // 通知正文
    icon: path.join(__dirname, 'app/favicon.ico'), // 左侧图标
    sound: true,                        // 播放提示音
    wait: false,                        // 等待通知交互
  },
  function (err) {
    if (err) {
      console.error('发送失败:', err);
    } else {
      console.log('通知已发送');
    }
  },
);
