import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.1'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function authorized(req: Request): boolean {
  const value = req.headers.get('authorization') ?? ''
  return value.replace(/^Bearer\s+/i, '').trim() === serviceRoleKey
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' || !authorized(req)) return json({ error: 'unauthorized' }, 401)

  const now = new Date()
  const [expiredResult, replacedResult] = await Promise.all([
    admin.from('file_slots')
      .select('id, storage_path, status')
      .eq('status', 'active')
      .not('expires_at', 'is', null)
      .lte('expires_at', now.toISOString())
      .limit(100),
    admin.from('file_slots')
      .select('id, storage_path, status')
      .eq('status', 'replaced')
      .is('deleted_at', null)
      .limit(100),
  ])

  const rows = [
    ...(expiredResult.data ?? []),
    ...(replacedResult.data ?? []),
  ]
  let deleted = 0
  for (const row of rows) {
    const { error: removeError } = await admin.storage.from('files').remove([row.storage_path])
    if (removeError) continue
    const update: Record<string, string> = { deleted_at: now.toISOString() }
    if (row.status === 'active') update.status = 'expired'
    const { error: updateError } = await admin.from('file_slots').update(update).eq('id', row.id)
    if (!updateError) deleted++
  }

  // Remove abandoned signed uploads that never reached register_file_slot.
  const cutoff = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  const { data: objects } = await admin.schema('storage').from('objects')
    .select('name, created_at')
    .eq('bucket_id', 'files')
    .lt('created_at', cutoff)
    .limit(100)
  let orphaned = 0
  for (const object of objects ?? []) {
    const { data: known } = await admin.from('file_slots')
      .select('id')
      .eq('storage_path', object.name)
      .maybeSingle()
    if (known) continue
    const { error } = await admin.storage.from('files').remove([object.name])
    if (!error) orphaned++
  }

  return json({ deleted, orphaned })
})
