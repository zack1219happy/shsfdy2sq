/**
 * 一次性迁移脚本：Gist → Supabase
 *
 * 读取 Gist 中的加密数据，解密后写入 Supabase。
 *
 * 用法：node scripts/migrate-gist-to-supabase.js
 * 环境变量：
 *   GIST_TOKEN, GIST_MASTER_SECRET   ← 读取旧 Gist 用
 *   SUPABASE_ACCESS_TOKEN            ← Supabase Management API 令牌
 *   SUPABASE_PROJECT_REF             ← 项目 ref（可选，默认从 .env 取）
 */

const crypto = require('crypto')

const GIST_ID = process.env.GIST_ID || '53dc75eaaab1d798814aa60ac0790245'
const TOKEN = process.env.GIST_TOKEN
const MASTER_SECRET = process.env.GIST_MASTER_SECRET
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'iiiyoafpzfqxpaqheojg'

if (!TOKEN || !MASTER_SECRET || !ACCESS_TOKEN) {
  console.error('需要 GIST_TOKEN, GIST_MASTER_SECRET, SUPABASE_ACCESS_TOKEN')
  process.exit(1)
}

const KEY_HEX = crypto.createHash('sha256').update(MASTER_SECRET).digest('hex')

/** AES-256-GCM 解密 */
function decrypt(ciphertext) {
  const combined = Buffer.from(ciphertext, 'base64')
  const iv = combined.subarray(0, 12)
  const authTag = combined.subarray(-16)
  const data = combined.subarray(12, -16)
  const key = Buffer.from(KEY_HEX, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(data, null, 'utf8') + decipher.final('utf8')
}

/** 通过 Supabase Management API 执行 SQL */
async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`SQL 错误: ${err}`)
  }
  return res.json()
}

async function run() {
  // 1. 拉取 Gist
  console.log('📥 拉取 Gist…')
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const gist = await res.json()

  // 2. 解密 comments.json
  const commentsRaw = gist.files?.['comments.json']?.content
  if (!commentsRaw) {
    console.log('⚠️  comments.json 不存在或为空，跳过')
    return
  }

  console.log('🔓 解密 comments.json…')
  const commentsJson = decrypt(commentsRaw)
  const commentsData = JSON.parse(commentsJson)
  const allComments = Object.entries(commentsData).flatMap(([page, comments]) =>
    (comments || []).map(c => ({ ...c, page }))
  )

  if (allComments.length === 0) {
    console.log('📭 没有评论数据，跳过')
  } else {
    console.log(`📊 共 ${allComments.length} 条评论，写入 Supabase…`)

    // 逐条插入（每条单独 INSERT 避免冲突）
    for (const c of allComments) {
      const escapedPage = c.page.replace(/'/g, "''")
      const escapedAuthor = (c.author || '匿名').replace(/'/g, "''")
      const escapedContent = (c.content || '').replace(/'/g, "''")
      const parentId = c.parentId ? `'${c.parentId}'` : 'NULL'
      const date = c.date ? `'${c.date}'` : 'now()'
      const status = c.status || 'approved'

      const sql = `INSERT INTO comments (id, page, author, content, date, parent_id, status)
        VALUES ('${c.id}', '${escapedPage}', '${escapedAuthor}', '${escapedContent}', ${date}, ${parentId}, '${status}')
        ON CONFLICT (id) DO NOTHING;`

      await query(sql)
    }
    console.log(`✅ ${allComments.length} 条评论迁移完成`)
  }

  // 3. 尝试解密 pending.json（编辑建议，如果存在）
  const pendingRaw = gist.files?.['pending.json']?.content
  if (pendingRaw && !pendingRaw.startsWith('{') && !pendingRaw.startsWith('[')) {
    try {
      const pendingJson = decrypt(pendingRaw)
      const pendingData = JSON.parse(pendingJson)
      if (Array.isArray(pendingData) && pendingData.length > 0) {
        console.log(`📊 ${pendingData.length} 条待审核数据（需手动检查是否要迁移）`)
        console.log('   内容预览:', JSON.stringify(pendingData.slice(0, 2)).slice(0, 200))
      } else {
        console.log('📭 pending.json 无有效数据')
      }
    } catch {
      console.log('⚠️  pending.json 解密失败或为空')
    }
  } else {
    console.log('📭 pending.json 无数据')
  }

  console.log('\n🎉 迁移完成！你现在可以：')
  console.log('   1. 从 GitHub Secrets 中删除 GIST_TOKEN 等旧变量')
  console.log('   2. 添加 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY')
  console.log('   3. 删除 src/lib/gist-crypto.ts')
  console.log('   4. 删除 scripts/migrate-gist.js')
}

run().catch(e => {
  console.error('❌ 迁移失败:', e.message)
  process.exit(1)
})
