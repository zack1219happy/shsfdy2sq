/**
 * run_sql.mjs — 通过直连 PostgreSQL 执行 .sql 文件
 *
 * 用法：node _scripts/run_sql.mjs <sql文件路径>
 * 示例：node _scripts/run_sql.mjs _scripts/plaza-schema.sql
 *
 * 依赖 .env.local 中的 SUPABASE_DB_PASSWORD。
 * 整个文件作为单个 query 发送（支持 $$…$$ PL/pgSQL 函数体）。
 *
 * 注意：Management API (https://api.supabase.com/v1/projects/{ref}/database/query)
 * 不支持含 $$ 的函数体，函数迁移请用此脚本。
 */

import pg from 'pg'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const { Client } = pg

const file = process.argv[2]
if (!file) {
  console.error('用法: node _scripts/run_sql.mjs <sql文件路径>')
  process.exit(1)
}

const sql = readFileSync(resolve(file), 'utf8')
if (!sql.trim()) {
  console.error('SQL 文件为空')
  process.exit(1)
}

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
  console.log(`已连接 → ${file}`)

  await client.query(sql)
  console.log('✓ 执行完成')

  await client.end()
} catch (e) {
  console.error('✗ 执行失败:', e.message)
  await client.end()
  process.exit(1)
}
