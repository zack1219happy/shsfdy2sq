import pg from 'pg'
import { readFileSync } from 'fs'

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
await client.query(`
  CREATE OR REPLACE FUNCTION get_user_liked_posts(p_user_id uuid)
  RETURNS TABLE(post_id uuid) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT fv.post_id
    FROM forum_votes fv
    WHERE fv.user_id = p_user_id
      AND fv.vote_type = 'up'
    ORDER BY fv.created_at DESC
  $$;
`)
console.log('RPC created successfully')
await client.end()
