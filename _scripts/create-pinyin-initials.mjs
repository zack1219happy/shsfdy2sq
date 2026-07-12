/**
 * 创建 pinyin_initials 表、RPC 并导入当前数据
 *
 * 从 person-registry.ts 中提取所有 name→initials 映射存入数据库，
 * 使管理员可在 Supabase 中直接修改首字母而不需重新部署。
 *
 * 用法：
 *   node _scripts/create-pinyin-initials.mjs
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
  CREATE TABLE IF NOT EXISTS pinyin_initials (
    name TEXT PRIMARY KEY,
    initials TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
  );
`)

// 创建 RPC：获取单个 initials
await client.query(`
  CREATE OR REPLACE FUNCTION get_pinyin_initials(p_name TEXT)
  RETURNS TEXT
  LANGUAGE sql
  SECURITY DEFINER
  AS $$
    SELECT initials FROM pinyin_initials WHERE name = p_name;
  $$;
`)

// 创建 RPC：获取所有 initials（加载到客户端缓存用）
await client.query(`
  CREATE OR REPLACE FUNCTION get_all_pinyin_initials()
  RETURNS TABLE(name TEXT, initials TEXT)
  LANGUAGE sql
  SECURITY DEFINER
  AS $$
    SELECT name, initials FROM pinyin_initials ORDER BY name;
  $$;
`)

// 从 person-registry.ts 读取当前数据并导入
const registryPath = join(__dirname, '..', 'src', 'data', 'person-registry.ts')
const tsContent = readFileSync(registryPath, 'utf-8')

// 手动剥离 TypeScript 语法，留下纯 JS
const clean = tsContent
  .split('\n')
  .filter(l => !l.trim().startsWith('import '))            // 移除 import 行
  .map(l => l
    .replace(/\s*:\s*PersonRegistry(?=\s*=)/g, '')        // : PersonRegistry
    .replace(/\s*:\s*PersonEntry\[\]/g, '')                // : PersonEntry[]
    .replace(/\s*:\s*TeacherEntry\[\]/g, '')               // : TeacherEntry[]
    .replace(/\s*:\s*Record<string,\s*string>/g, '')       // : Record<string, string>
    .replace(/\s*:\s*string;/g, ';')                       // : string;
  )
  .join('\n')

// 通过花括号计数找到匹配的闭合 }
const objStart = clean.indexOf('export const registry = ')
if (objStart === -1) throw new Error('无法找到 registry 声明')
const braceStart = clean.indexOf('{', objStart)
let depth = 0
let objEnd = braceStart
for (let i = braceStart; i < clean.length; i++) {
  if (clean[i] === '{') depth++
  else if (clean[i] === '}') {
    depth--
    if (depth === 0) { objEnd = i + 1; break }
  }
}
const jsonStr = clean.slice(braceStart, objEnd)
const registry = eval('(' + jsonStr + ')')

// 收集所有 name → initials
const rows = []
for (const s of registry.students) rows.push({ name: s.name, initials: s.initials })
for (const t of registry.teachers) rows.push({ name: t.name, initials: t.initials })

console.log(`共 ${rows.length} 条记录`)

// 分批 upsert（每批 50 条）
const BATCH = 50
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH)
  const values = batch.map((r, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(', ')
  const params = batch.flatMap(r => [r.name, r.initials])
  await client.query(
    `INSERT INTO pinyin_initials (name, initials) VALUES ${values}
     ON CONFLICT (name) DO UPDATE SET initials = EXCLUDED.initials, updated_at = now()`,
    params,
  )
}

console.log('pinyin_initials 表已创建并导入数据')
console.log('RPC get_pinyin_initials / get_all_pinyin_initials 已创建')
await client.end()
