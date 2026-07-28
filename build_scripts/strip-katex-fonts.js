/**
 * 导出后清理：删除 KaTeX 多余的 .woff / .ttf 字体文件，
 * 并从 CSS 中移除对应的引用，只保留 .woff2。
 *
 * 用法: node scripts/strip-katex-fonts.js
 * 在 next build 完成后、copy-static.js 之前运行。
 */

const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '..', 'out')

function main() {
  if (!fs.existsSync(OUT)) {
    console.log('out/ 不存在，跳过 KaTeX 字体清理')
    return
  }

  // 1. 找到 katex CSS 文件（Next.js 16 把 CSS 放在 _next/static/chunks/ 下）
  const cssDir = path.join(OUT, '_next', 'static', 'chunks')
  if (!fs.existsSync(cssDir)) {
    console.log('chunks 目录不存在，跳过')
    return
  }

  const cssFiles = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'))
  let stripped = 0

  for (const cssFile of cssFiles) {
    const cssPath = path.join(cssDir, cssFile)
    let content = fs.readFileSync(cssPath, 'utf8')

    // 只在包含 KaTeX font-face 时处理
    if (!content.includes('KaTeX_')) continue

    // 2. 删除 .woff 和 .ttf 的 @font-face 引用（兼容有/无空格两种格式）
    const newContent = content.replace(
      /,url\([^)]+\.woff\)\s*format\("woff"\),url\([^)]+\.ttf\)\s*format\("truetype"\)/g,
      '',
    )

    fs.writeFileSync(cssPath, newContent)
    stripped++
    console.log(`  ✔ 清除字体格式引用: ${cssFile}`)
  }

  // 3. 删除多余的字体文件（保留 .woff2 即可）
  const mediaDir = path.join(OUT, '_next', 'static', 'media')
  if (!fs.existsSync(mediaDir)) {
    console.log('media 目录不存在，跳过')
    return
  }

  let deleted = 0
  let kept = 0

  for (const f of fs.readdirSync(mediaDir)) {
    const ext = path.extname(f).toLowerCase()
    // 只处理 KaTeX 字体
    if (!f.startsWith('KaTeX_')) continue

    if (ext === '.woff' || ext === '.ttf') {
      fs.unlinkSync(path.join(mediaDir, f))
      deleted++
    } else if (ext === '.woff2') {
      kept++
    }
  }

  // 用 dir 命令再删除一次（防止有只删了 .woff 但 .ttf 还在的情况）
  const mediaFiles = fs.readdirSync(mediaDir)
  for (const f of mediaFiles) {
    const ext = path.extname(f).toLowerCase()
    if (f.startsWith('KaTeX_') && (ext === '.woff' || ext === '.ttf')) {
      fs.unlinkSync(path.join(mediaDir, f))
      deleted++
    }
  }

  console.log(`  ✔ 删除字体文件: ${deleted} 个`)
  console.log(`  ✔ 保留 woff2: ${kept} 个`)
}

main()
