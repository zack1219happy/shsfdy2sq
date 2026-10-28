'use client'

import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export const MAX_FILE_SIZE = 200 * 1024 * 1024
export const EXPIRING_FILE_THRESHOLD = 20 * 1024 * 1024

export interface FileSlot {
  id: string
  share_token: string
  original_name: string
  mime_type: string
  size_bytes: number
  status: 'active' | 'replaced' | 'expired'
  uploaded_at: string
  expires_at: string | null
}

interface PrepareResponse {
  fileId: string
  storagePath: string
  token: string
}

interface FinalizeResponse {
  fileId: string
  shareToken: string
  url: string
  expiresAt: string | null
}

const gatewayUrl = (path: string) => {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) throw new Error('缺少 Supabase URL')
  return `${base.replace(/\/$/, '')}/functions/v1/file-gateway${path}`
}

export function getFileDownloadUrl(shareToken: string): string {
  return gatewayUrl(`/download/${encodeURIComponent(shareToken)}`)
}

export async function getMyFileSlot(): Promise<FileSlot | null> {
  const { data, error } = await supabase.rpc('get_my_file_slot')
  if (error) throw new Error('获取文件槽状态失败：' + error.message)
  return ((data ?? []) as FileSlot[])[0] ?? null
}

export async function uploadUserFile(file: File): Promise<FinalizeResponse> {
  if (!getSession()) throw new Error('请先登录')
  if (file.size < 1) throw new Error('文件不能为空')
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`文件超过 200MB 限制（当前 ${formatBytes(file.size)}）`)
  }

  const { data: prepared, error: prepareError } = await supabase.functions.invoke<PrepareResponse>(
    'file-gateway',
    {
      body: {
        action: 'prepare',
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
      },
    },
  )
  if (prepareError || !prepared) {
    throw new Error(prepareError?.message || '准备上传失败')
  }

  const { error: uploadError } = await supabase.storage
    .from('files')
    .uploadToSignedUrl(prepared.storagePath, prepared.token, file)
  if (uploadError) throw new Error('文件上传失败：' + uploadError.message)

  const { data: finalized, error: finalizeError } = await supabase.functions.invoke<FinalizeResponse>(
    'file-gateway',
    {
      body: {
        action: 'finalize',
        fileId: prepared.fileId,
        storagePath: prepared.storagePath,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
      },
    },
  )
  if (finalizeError || !finalized) {
    throw new Error(finalizeError?.message || '完成文件登记失败')
  }
  return finalized
}

export async function getFileLinkStatuses(tokens: string[]): Promise<Map<string, { status: string; expires_at: string | null }>> {
  const unique = [...new Set(tokens)].slice(0, 100)
  if (unique.length === 0) return new Map()
  const { data, error } = await supabase.rpc('get_file_link_statuses', {
    p_share_tokens: unique,
  })
  if (error) return new Map()
  return new Map(
    ((data ?? []) as Array<{ share_token: string; status: string; expires_at: string | null }>).map((row) => [
      row.share_token,
      { status: row.status, expires_at: row.expires_at },
    ]),
  )
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return '长期保存'
  return `将于 ${new Date(expiresAt).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })} 过期`
}
