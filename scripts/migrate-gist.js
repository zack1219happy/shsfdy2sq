/**
 * 构建时 Gist 迁移脚本
 *
 * 职责：
 * 1. 拉取 Gist 数据
 * 2. 检查是否已加密（根据 meta.json 的 encrypted 字段）
 * 3. 未加密 → 用 GIST_MASTER_SECRET 加密所有数据文件
 * 4. 更新 meta.json
 * 5. 导出 NEXT_PUBLIC_GIST_KEY 供 Next.js 构建注入
 *
 * 用法：node scripts/migrate-gist.js
 * 需要环境变量：GIST_ID, GIST_TOKEN, GIST_MASTER_SECRET
 */

const crypto = require('crypto')

const GIST_ID = process.env.GIST_ID || process.env.NEXT_PUBLIC_GIST_ID
const TOKEN = process.env.GIST_TOKEN
const MASTER_SECRET = process.env.GIST_MASTER_SECRET

if (!GIST_ID || !TOKEN || !MASTER_SECRET) {
  console.error('缺少环境变量：需要 GIST_ID, GIST_TOKEN, GIST_MASTER_SECRET')
  process.exit(1)
}

// SHA-256 作为 AES-256 密钥
const KEY_HASH = crypto.createHash('sha256').update(MASTER_SECRET).digest('hex')
console.log(`[migrate] GIST_MASTER_SECRET → SHA-256: ${KEY_HASH.slice(0, 4)}…`)

// ---------- 工具函数 ----------

/** AES-256-GCM 加密：base64(iv + ciphertext + authTag) */
function encrypt(plaintext, keyHex) {
  const key = Buffer.from(keyHex, 'hex')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, encrypted, authTag]).toString('base64')
}

/** 检查字符串是否为 AES-GCM 密文（不以 { 或 [ 开头） */
function isEncrypted(str) {
  return !str.startsWith('{') && !str.startsWith('[')
}

// ---------- 主流程 ----------

async function run() {
  // 1. 拉取 Gist
  console.log('[migrate] 拉取 Gist…')
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GitHub API ${res.status}: ${err}`)
  }
  const gist = await res.json()
  const files = gist.files || {}

  // 2. 检查 meta.json 的加密状态
  const metaRaw = files['meta.json']?.content
  let meta = metaRaw ? JSON.parse(metaRaw) : {}
  const alreadyEncrypted = meta.encrypted === true

  if (alreadyEncrypted) {
    console.log('[migrate] 数据已加密，跳过迁移')
    return KEY_HASH
  }

  // 3. 加密所有数据文件
  console.log('[migrate] 数据未加密，开始加密…')
  const updatedFiles = {}

  for (const [name, file] of Object.entries(files)) {
    if (name === 'meta.json') continue // 不加密 meta
    if (!file.content) continue

    const content = file.content
    if (isEncrypted(content)) {
      console.log(`[migrate]   ${name} 已是密文，跳过`)
      updatedFiles[name] = { content }
      continue
    }

    const encrypted = encrypt(content, KEY_HASH)
    updatedFiles[name] = { content: encrypted }
    console.log(`[migrate]   ${name} 已加密 ✓`)
  }

  // 4. 更新 meta.json
  meta.encrypted = true
  meta.lastMigration = new Date().toISOString()
  meta.version = (meta.version || 0) + 1
  updatedFiles['meta.json'] = { content: JSON.stringify(meta, null, 2) }

  // 5. 写回 Gist
  console.log('[migrate] 写回 Gist…')
  const patchRes = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: updatedFiles }),
  })

  if (!patchRes.ok) {
    const err = await patchRes.text()
    throw new Error(`PATCH Gist 失败 (${patchRes.status}): ${err}`)
  }

  // 写入 GITHUB_ENV（CI 环境），让后续步骤可直接用
  if (process.env.GITHUB_ENV) {
    require('fs').appendFileSync(process.env.GITHUB_ENV, `NEXT_PUBLIC_GIST_KEY=${KEY_HASH}\n`)
    console.log('[migrate] 已写入 GITHUB_ENV')
  }

  console.log('[migrate] 迁移完成 ✅')
  return KEY_HASH
}

run().catch((e) => {
  console.error('[migrate] 失败:', e.message)
  process.exit(1)
})
