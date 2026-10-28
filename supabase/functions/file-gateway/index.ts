import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.1'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const MAX_FILE_SIZE = 200 * 1024 * 1024
const EXPIRING_FILE_THRESHOLD = 20 * 1024 * 1024
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function bearer(req: Request): string | null {
  const value = req.headers.get('authorization') ?? ''
  return value.replace(/^Bearer\s+/i, '').trim() || null
}

async function requireUser(req: Request) {
  const token = bearer(req)
  if (!token) return null
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data, error } = await client.auth.getUser(token)
  return error || !data.user ? null : data.user
}

function cleanName(name: unknown): string {
  const value = typeof name === 'string' ? name.trim() : ''
  const withoutPath = value.replace(/[\\/]/g, '_').replace(/[\u0000-\u001f]/g, '_')
  return withoutPath.slice(0, 255) || 'file'
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function prepare(req: Request): Promise<Response> {
  const user = await requireUser(req)
  if (!user) return json({ error: '请先登录' }, 401)
  const body = await req.json().catch(() => ({})) as { originalName?: unknown; mimeType?: unknown }
  const originalName = cleanName(body.originalName)
  const fileId = crypto.randomUUID()
  const storagePath = `${user.id}/${fileId}/${originalName}`
  const { data, error } = await admin.storage.from('files').createSignedUploadUrl(storagePath)
  if (error || !data?.token) return json({ error: error?.message ?? '无法创建上传授权' }, 500)
  return json({ fileId, storagePath, token: data.token })
}

async function finalize(req: Request): Promise<Response> {
  const user = await requireUser(req)
  if (!user) return json({ error: '请先登录' }, 401)
  const body = await req.json().catch(() => ({})) as {
    fileId?: unknown
    storagePath?: unknown
    originalName?: unknown
    mimeType?: unknown
  }
  if (!isUuid(body.fileId) || typeof body.storagePath !== 'string') {
    return json({ error: '上传参数无效' }, 400)
  }
  const originalName = cleanName(body.originalName)
  const storagePath = body.storagePath
  if (!storagePath.startsWith(`${user.id}/${body.fileId}/`)) {
    return json({ error: '文件路径无效' }, 403)
  }

  const { data: object, error: objectError } = await admin
    .schema('storage')
    .from('objects')
    .select('metadata')
    .eq('bucket_id', 'files')
    .eq('name', storagePath)
    .maybeSingle()

  if (objectError || !object) return json({ error: '找不到已上传文件' }, 400)
  const metadata = (object.metadata ?? {}) as Record<string, unknown>
  const actualSize = Number(metadata.size ?? metadata.contentLength ?? 0)
  if (!Number.isSafeInteger(actualSize) || actualSize < 1 || actualSize > MAX_FILE_SIZE) {
    await admin.storage.from('files').remove([storagePath])
    return json({ error: '文件大小无效或超过 200MB' }, 400)
  }

  const mimeType = typeof metadata.mimetype === 'string'
    ? metadata.mimetype
    : (typeof body.mimeType === 'string' && body.mimeType ? body.mimeType : 'application/octet-stream')

  const { data: registered, error: registerError } = await admin.rpc('register_file_slot', {
    p_user_id: user.id,
    p_file_id: body.fileId,
    p_storage_path: storagePath,
    p_original_name: originalName,
    p_mime_type: mimeType,
    p_size_bytes: actualSize,
  })
  const row = (registered ?? [])[0] as {
    share_token: string
    old_file_id: string | null
    old_storage_path: string | null
    expires_at: string | null
  } | undefined
  if (registerError || !row) {
    await admin.storage.from('files').remove([storagePath])
    return json({ error: registerError?.message ?? '文件登记失败' }, 500)
  }

  if (row.old_storage_path) {
    const { error: removeError } = await admin.storage.from('files').remove([row.old_storage_path])
    if (!removeError && row.old_file_id) {
      await admin.from('file_slots').update({ deleted_at: new Date().toISOString() }).eq('id', row.old_file_id)
    }
  }

  return json({
    fileId: body.fileId,
    shareToken: row.share_token,
    url: `${supabaseUrl.replace(/\/$/, '')}/functions/v1/file-gateway/download/${row.share_token}`,
    expiresAt: row.expires_at,
  })
}

async function download(req: Request, token: string): Promise<Response> {
  if (!isUuid(token)) return new Response('Not found', { status: 404, headers: corsHeaders })
  const { data: row, error } = await admin
    .from('file_slots')
    .select('storage_path, status, expires_at')
    .eq('share_token', token)
    .maybeSingle()
  if (error || !row) return new Response('Not found', { status: 404, headers: corsHeaders })
  const expired = row.status !== 'active' || (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())
  if (expired) {
    if (row.status === 'active') {
      await admin.from('file_slots').update({ status: 'expired' }).eq('share_token', token)
    }
    return new Response('File expired', { status: 410, headers: corsHeaders })
  }

  const { data: signed, error: signedError } = await admin.storage
    .from('files')
    .createSignedUrl(row.storage_path, 60)
  if (signedError || !signed?.signedUrl) return new Response('File unavailable', { status: 404, headers: corsHeaders })
  return Response.redirect(signed.signedUrl, 302)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const url = new URL(req.url)
    const parts = url.pathname.split('/').filter(Boolean)
    if (req.method === 'GET' && parts.at(-2) === 'download') {
      return await download(req, parts.at(-1) ?? '')
    }
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
    const body = await req.clone().json().catch(() => ({})) as { action?: string }
    if (body.action === 'prepare') return await prepare(req)
    if (body.action === 'finalize') return await finalize(req)
    return json({ error: 'unknown action' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'internal error' }, 500)
  }
})
