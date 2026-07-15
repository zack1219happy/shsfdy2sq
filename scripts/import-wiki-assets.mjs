/**
 * import-wiki-assets.mjs
 *
 * 扫描 data/wiki/ 下所有 _assets/ 目录中的 .webp 文件，
 * base64 编码后导入 wiki_assets 表。
 *
 * 用法: node scripts/import-wiki-assets.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })

const SUPPORTED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )

  const wikiDir = join(__dirname, '..', 'data', 'wiki')
  if (!existsSync(wikiDir)) { console.log('data/wiki/ not found'); return }

  let total = 0
  let skipped = 0

  // 先收集所有待导入文件，避免 async/await 与目录遍历交叉
  const jobs = []
  function collect(dir, prefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '_assets') {
          const slug = prefix.replace(/\\/g, '/')
          for (const file of readdirSync(fullPath)) {
            const ext = extname(file).toLowerCase()
            if (!SUPPORTED.has(ext)) continue
            const filePath = join(fullPath, file)
            // 优先使用 .webp 版本
            if (['.png', '.jpg', '.jpeg'].includes(ext)) {
              const webpName = basename(file, ext) + '.webp'
              if (existsSync(join(fullPath, webpName))) { skipped++; continue }
            }
            jobs.push({ slug, file, filePath, ext })
          }
        } else {
          collect(fullPath, prefix ? `${prefix}/${entry.name}` : entry.name)
        }
      }
    }
  }

  console.log('Scanning _assets/ directories...')
  collect(wikiDir, '')

  for (const { slug, file, filePath, ext } of jobs) {
    const data = readFileSync(filePath)
    const base64 = data.toString('base64')
    const mimeType = ext === '.webp' ? 'image/webp'
      : ext === '.png' ? 'image/png'
      : ext === '.gif' ? 'image/gif'
      : 'image/jpeg'

    const { error } = await supabase.rpc('import_wiki_asset', {
      p_slug: slug,
      p_filename: file,
      p_mime_type: mimeType,
      p_data: base64,
      p_size: data.length,
    })

    if (error) {
      console.error(`  ❌ ${slug}/${file}: ${error.message}`)
    } else {
      console.log(`  ✅ ${slug}/${file} (${data.length} bytes)`)
      total++
    }
  }

  console.log(`\nDone: ${total} imported, ${skipped} skipped (webp preferred)`)
}

main().catch(e => { console.error(e); process.exit(1) })
