// 创建 admin_wz 账号（直连 PostgreSQL）
// 运行：node _scripts/create-admin-wz.mjs

import pg from 'pg'

const { Client } = pg

const client = new Client({
  host: 'db.iiiyoafpzfqxpaqheojg.supabase.co',
  database: 'postgres',
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  port: 5432,
  ssl: { rejectUnauthorized: false },
})

const UUID = 'bb767c49-7273-4ada-8b1c-ecc666cfc2cb'
const PASSWORD = '88888888'
const USERNAME = 'admin_wz'
const NAME = '王梓'
const STUDENT_ID = 'admin_wz'
const SHA256 = '615ed7fb1504b0c724a296d7a69e6c7b2f9ea2c57c1d8206c5afdf392ebdfd25'

await client.connect()

// 1. 插入 wiki_users
console.log('插入 wiki_users...')
await client.query(`
  INSERT INTO wiki_users (id, name, username, student_id, password_hash, role, created_at, updated_at)
  VALUES ($1::uuid, $2, $3, $4, $5, 'user', now(), now())
  ON CONFLICT (username) DO NOTHING;
`, [UUID, NAME, USERNAME, STUDENT_ID, SHA256])
console.log('  done')

// 2. 同步到 auth.users
console.log('同步到 auth.users...')
await client.query(`
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, role, is_sso_user
  )
  VALUES (
    $1::uuid,
    '00000000-0000-0000-0000-000000000000',
    $2,
    crypt($3, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    $4::jsonb,
    now(),
    now(),
    'authenticated',
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    email              = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at         = EXCLUDED.updated_at;
`, [UUID, `${STUDENT_ID}@wiki.local`, PASSWORD, JSON.stringify({
  username: USERNAME, name: NAME, student_id: STUDENT_ID, role: 'user'
})])
console.log('  done')

// 3. 同步到 auth.identities
console.log('同步到 auth.identities...')
await client.query(`
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  )
  VALUES ($1::uuid, $1::uuid, $2::jsonb, 'email', $3,
    now(), now(), now()
  )
  ON CONFLICT DO NOTHING;
`, [UUID, JSON.stringify({sub: UUID, email: `${STUDENT_ID}@wiki.local`}), `${STUDENT_ID}@wiki.local`])
console.log('  done')

// 4. 更新 get_all_users RPC 排除 admin_wz
console.log('更新 get_all_users RPC...')
await client.query(`
  CREATE OR REPLACE FUNCTION public.get_all_users()
  RETURNS TABLE(id uuid, username text, name text, color text)
  LANGUAGE sql SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT id, username, name, color
    FROM wiki_users
    WHERE username IS DISTINCT FROM 'test'
      AND username IS DISTINCT FROM 'admin_wz'
    ORDER BY name;
  $$;

  GRANT EXECUTE ON FUNCTION public.get_all_users TO PUBLIC;
`)
console.log('  done')

await client.end()
console.log('\n✅ admin_wz 账号创建完成！')
console.log('   用户名: admin_wz')
console.log('   密码:   88888888')
console.log('   姓名:   王梓')
