/**
 * run_sql.mjs — 通过直连 PostgreSQL 执行 SQL
 *
 * 用法：
 *   node scripts/run_sql.mjs path/to/file.sql    # 执行 .sql 文件
 *   node scripts/run_sql.mjs "SELECT * FROM ..."  # 执行内联 SQL
 *
 * 依赖 .env.local 中的 SUPABASE_DB_PASSWORD。
 * 整个内容作为单个 query 发送（支持 $$…$$ PL/pgSQL 函数体）。
 *
 * 注意：Management API (https://api.supabase.com/v1/projects/{ref}/database/query)
 * 不支持含 $$ 的函数体，函数迁移请用此脚本。
 * SUPABASE_AUTH_TOKEN 不是 JWT，不能用于 rest/v1/rpc 调用。
 */

import pg from 'pg'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const { Client } = pg

const __dirname = resolve(fileURLToPath(new URL('.', import.meta.url)))

// 加载 .env.local（注意密码含 # 时会截断，见下方 fallback）
config({ path: resolve(__dirname, '..', '.env.local') })

const arg = process.argv[2]
if (!arg) {
  console.error('用法: node scripts/run_sql.mjs <sql文件路径 | "SQL 语句">')
  process.exit(1)
}

// 以 .sql 结尾 → 当作文件读取；否则当作内联 SQL
const sql = arg.endsWith('.sql')
  ? readFileSync(resolve(arg), 'utf8')
  : arg

if (!sql.trim()) {
  console.error('SQL 为空')
  process.exit(1)
}

// 优先用连接池（有 IPv4），回退直接连接
const poolerHost = 'aws-0-us-west-1.pooler.supabase.com'
const directHost = 'db.iiiyoafpzfqxpaqheojg.supabase.co'

// dotenv 会把密码中 # 后的部分当作注释，从文件直接读取确保完整
function readPassword() {
  try {
    const envPath = resolve(__dirname, '..', '.env.local')
    const content = readFileSync(envPath, 'utf8')
    const m = content.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)
    return m ? m[1].trim() : process.env.SUPABASE_DB_PASSWORD
  } catch {
    return process.env.SUPABASE_DB_PASSWORD
  }
}

function makeClient(host, user, port) {
  return new Client({
    host,
    database: 'postgres',
    user,
    password: readPassword(),
    port,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  })
}

async function main() {
  // 先试连接池
  const poolerClient = makeClient(poolerHost, `postgres.iiiyoafpzfqxpaqheojg`, 6543)
  try {
    await poolerClient.connect()
    console.log(`已连接（连接池）→ ${arg}`)
    await poolerClient.query(sql)
    console.log('✓ 执行完成')
    await poolerClient.end()
    return
  } catch (e) {
    console.warn('⚠ 连接池失败:', e.message)
    await poolerClient.end().catch(() => {})
  }

  // 回退直连
  const directClient = makeClient(directHost, 'postgres', 5432)
  try {
    await directClient.connect()
    console.log(`已连接（直连）→ ${arg}`)
    await directClient.query(sql)
    console.log('✓ 执行完成')
    await directClient.end()
  } catch (e) {
    console.error('✗ 执行失败:', e.message)
    await directClient.end().catch(() => {})
    process.exit(1)
  }
}

main()
