/**
 * 将 data/contents/ 下所有 PNG/JPG 转为 WebP（原地生成 .webp 副本）。
 * 保留原始文件作为 fallback。
 *
 * 用法: node scripts/convert-images-webp.js
 * 在 export 或 dev 前运行一次。
 */

const fs = require('fs')
const path = require('path')

// ---- 配置 ----
const ROOTS = [path.join(__dirname, '..', 'data', 'contents')]
const QUALITY = 80 // WebP quality 0-100

// ---- 扩展 ----
const EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])

async function main() {
  let sharp
  try {
    sharp = require('sharp')
  } catch {
    console.error('缺少 sharp，请先运行: npm install sharp --save-dev')
    process.exit(1)
  }

  let converted = 0
  let skipped = 0

  for (const root of ROOTS) {
    if (!fs.existsSync(root)) continue

    const entries = fs.readdirSync(root, { withFileTypes: true, recursive: true })

    for (const entry of entries) {
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!EXTENSIONS.has(ext)) continue

      const srcPath = path.join(entry.parentPath, entry.name)
      const webpPath = path.join(entry.parentPath, path.basename(entry.name, ext) + '.webp')

      // 如果 WebP 已存在且比源文件新，跳过
      if (fs.existsSync(webpPath)) {
        const srcStat = fs.statSync(srcPath)
        const webpStat = fs.statSync(webpPath)
        if (webpStat.mtimeMs >= srcStat.mtimeMs) {
          skipped++
          continue
        }
      }

      try {
        await sharp(srcPath)
          .webp({ quality: QUALITY })
          .toFile(webpPath)
        console.log(`  ✔ ${path.relative(root, srcPath)} → .webp`)
        converted++
      } catch (err) {
        console.error(`  ✘ ${path.relative(root, srcPath)}: ${err.message}`)
      }
    }
  }

  console.log(`\n完成: ${converted} 张转换, ${skipped} 张已最新`)
}

main()
