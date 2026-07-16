/**
 * adjust-points.mjs — 给指定用户加减分
 *
 * 用法: node scripts/adjust-points.mjs <用户名> <分差> <理由>
 *       正数加分，负数减分
 *
 * 示例: node scripts/adjust-points.mjs test 20 测试加分
 *       node scripts/adjust-points.mjs test -5 违规扣分
 *
 * 依赖 .env.local 中的 SUPABASE_DB_PASSWORD。
 * 首次运行会自动将 'admin_adjust' 加入 points_transactions 的 reason 约束。
 */

import pg from 'pg'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// 加载 .env.local
const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  const val = trimmed.slice(eqIdx + 1).trim()
  if (!process.env[key]) {
    process.env[key] = val
  }
}

const { Client } = pg

// ─── 参数 ───────────────────────────────────────────────
const username = process.argv[2]
const amount = parseInt(process.argv[3], 10)
const reason = process.argv[4] || 'admin_adjust'

if (!username || isNaN(amount)) {
  console.error('用法: node scripts/adjust-points.mjs <用户名> <分差> <理由>')
  console.error('  正数加分，负数减分')
  process.exit(1)
}

// ─── 数据库连接 ──────────────────────────────────────────
const client = new Client({
  host: 'db.iiiyoafpzfqxpaqheojg.supabase.co',
  database: 'postgres',
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  port: 5432,
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  console.log('已连接数据库')

  // ─── 1. 确保 reason 约束包含 admin_adjust ────────────────
  const { rows: constraints } = await client.query(`
    SELECT conname, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class cls ON con.conrelid = cls.oid
    WHERE cls.relname = 'points_transactions'
      AND con.contype = 'c'
      AND con.conname = 'points_transactions_reason_check'
  `)

  if (constraints.length > 0 && !constraints[0].def.includes('admin_adjust')) {
    await client.query(`
      ALTER TABLE points_transactions
      DROP CONSTRAINT points_transactions_reason_check;
    `)
    await client.query(`
      ALTER TABLE points_transactions
      ADD CONSTRAINT points_transactions_reason_check
      CHECK (reason = ANY (ARRAY[
        'checkin', 'comment', 'forum_comment', 'forum_post', 'plaza_article',
        'wish_done', 'purchase', 'wish_payment', 'admin_adjust'
      ]));
    `)
    console.log('✓ reason 约束已更新，添加了 admin_adjust')
  } else {
    console.log('✓ reason 约束已包含 admin_adjust，跳过')
  }

  // ─── 2. 查找用户 ─────────────────────────────────────────
  const { rows: users } = await client.query(
    'SELECT id, name, username, total_points FROM wiki_users WHERE username = $1',
    [username]
  )

  if (users.length === 0) {
    console.error(`✗ 用户 "${username}" 不存在`)
    process.exit(1)
  }

  const user = users[0]
  const oldPoints = user.total_points || 0
  const newPoints = oldPoints + amount

  console.log(`用户: ${user.name} (@${user.username})`)
  console.log(`当前积分: ${oldPoints}`)
  console.log(`调整: ${amount > 0 ? '+' : ''}${amount}`)
  console.log(`调整后积分: ${newPoints}`)
  console.log(`理由: ${reason}`)

  // ─── 3. 写入流水并更新积分（事务）─────────────────────────
  await client.query('BEGIN')

  try {
    await client.query(
      `INSERT INTO points_transactions (user_id, amount, reason)
       VALUES ($1, $2, $3)`,
      [user.id, amount, 'admin_adjust']
    )
    console.log('✓ 流水已记录')

    await client.query(
      'UPDATE wiki_users SET total_points = total_points + $1, updated_at = now() WHERE id = $2',
      [amount, user.id]
    )
    console.log('✓ 积分已更新')

    await client.query('COMMIT')
    console.log(`\n✅ ${user.name} (@${username}) 的积分: ${oldPoints} → ${newPoints}（${reason}）`)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  }

  await client.end()
} catch (e) {
  console.error('✗ 执行失败:', e.message)
  try { await client.end() } catch (_) {}
  process.exit(1)
}
