// predev: 将 data/ 复制到 public/data/，使 dev server 可访问。
// 确保 dev 模式下 announcement.md、内容图片等静态资源可用。

const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'data')
const DEST = path.join(__dirname, '..', 'public', 'data')

if (!fs.existsSync(SRC)) process.exit(0)

/** 需排除的图片扩展名（WebP 代替） */
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif'])

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  let count = 0
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name)
    const d = path.join(dest, e.name)
    if (e.isDirectory()) {
      count += copyDir(s, d)
    } else {
      // 如果有 .webp 版本，跳过原始图片
      if (IMAGE_EXTS.has(path.extname(e.name).toLowerCase())) {
        const webpName = path.basename(e.name, path.extname(e.name)) + '.webp'
        if (fs.existsSync(path.join(src, webpName))) continue
      }
      fs.copyFileSync(s, d)
      count++
    }
  }
  return count
}

console.log('Copying data/ to public/data/ ...')
const n = copyDir(SRC, DEST)
console.log(`  Copied ${n} files`)
