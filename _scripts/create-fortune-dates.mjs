/**
 * 创建 fortune_dates 表、RPC 并导入当前数据
 *
 * 将 fortune.ts 中硬编码的考试日期和放假范围存入数据库，
 * 使管理员可在 Supabase 中直接修改而不需重新部署。
 *
 * 用法：
 *   node _scripts/create-fortune-dates.mjs
 */
import pg from 'pg'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const { Client } = pg

const client = new Client({
  host: 'db.iiiyoafpzfqxpaqheojg.supabase.co',
  database: 'postgres',
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  port: 5432,
  ssl: { rejectUnauthorized: false },
})

await client.connect()

// 创建表（如不存在）
await client.query(`
  CREATE TABLE IF NOT EXISTS fortune_dates (
    id SERIAL PRIMARY KEY,
    date_type TEXT NOT NULL CHECK (date_type IN ('exam', 'holiday')),
    start_date DATE NOT NULL,
    end_date DATE DEFAULT NULL,
    label TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );
`)

// 创建 RPC：获取所有考试/假日日期
await client.query(`
  CREATE OR REPLACE FUNCTION get_fortune_dates(p_type TEXT DEFAULT NULL)
  RETURNS TABLE(
    id INTEGER,
    date_type TEXT,
    start_date DATE,
    end_date DATE,
    label TEXT
  )
  LANGUAGE sql
  SECURITY DEFINER
  AS $$
    SELECT id, date_type, start_date, end_date, label
    FROM fortune_dates
    WHERE p_type IS NULL OR date_type = p_type
    ORDER BY start_date;
  $$;
`)

// 导入当前数据
const currentYear = new Date().getFullYear()

// 考试日
await client.query(
  `INSERT INTO fortune_dates (date_type, start_date, label)
   SELECT 'exam', $1::date, '摸底考'
   WHERE NOT EXISTS (
     SELECT 1 FROM fortune_dates WHERE date_type = 'exam' AND start_date = $1::date
   )`,
  [`${currentYear}-09-01`],
)

// 暑假
await client.query(
  `INSERT INTO fortune_dates (date_type, start_date, end_date, label)
   SELECT 'holiday', $1::date, $2::date, '暑假'
   WHERE NOT EXISTS (
     SELECT 1 FROM fortune_dates WHERE date_type = 'holiday' AND start_date = $1::date
   )`,
  [`${currentYear}-07-01`, `${currentYear}-08-31`],
)

console.log('fortune_dates 表已创建并导入数据')
console.log('RPC get_fortune_dates 已创建')
await client.end()
