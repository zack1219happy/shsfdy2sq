const notifier = require('node-notifier');
const path = require('path');

// 从命令行读取要显示的内容，默认“你好”
const message = process.argv[2] || '任务已完成';

notifier.notify(
  {
    title: 'Claude Code',               // 通知标题
    message: message,           // 通知正文
    icon: path.join(__dirname, 'app/favicon.ico'), // 左侧图标
    sound: true,                // 播放提示音
    wait: false                  // 等待通知交互（可省略，作用不大）
  },
  function (err, response) {
    if (err) {
      console.error('发送失败:', err);
    } else {
      console.log('通知已发送');
    }
  }
);