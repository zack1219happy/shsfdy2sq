/* ============================================
   表情图片 — 体积/尺寸限制、指纹、上传
   --------------------------------------------
   规则：单图 ≤2MB、边长 ≤512px；GIF/动图原样保留不转换。
   指纹取「最终入库字节」的 SHA-256，管理员按指纹禁用。
   ============================================ */
'use client'

import { Sha256 } from '@aws-crypto/sha256-browser'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

const MAX_FILE_SIZE = 2 * 1024 * 1024
const MAX_DIMENSION = 512
const WEBP_QUALITY = 0.9

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
])

function createUploadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export interface PreparedEmojiImage {
  blob: Blob
  hash: string
  width: number
  height: number
  ext: string
  /** 是否为原样保留的动图 */
  animated: boolean
}

/** 计算 SHA-256（十六进制小写） */
export async function sha256Hex(blob: Blob): Promise<string> {
  const hash = new Sha256()
  hash.update(new Uint8Array(await blob.arrayBuffer()))
  const digest = await hash.digest()
  return Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片读取失败'))
    img.src = URL.createObjectURL(file)
  })
}

/**
 * 准备表情图：GIF 原样，其它统一转 WebP 并压到 512px 以内。
 */
export async function prepareEmojiFile(file: File): Promise<PreparedEmojiImage> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('不支持的图片格式，支持 PNG / JPEG / WebP / GIF / BMP / AVIF')
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`图片超过 2MB 限制（当前 ${(file.size / 1024 / 1024).toFixed(2)}MB）`)
  }

  const animated = file.type === 'image/gif'
  if (animated) {
    const hash = await sha256Hex(file)
    return { blob: file, hash, width: 0, height: 0, ext: 'gif', animated: true }
  }

  const img = await loadImage(file)
  let { naturalWidth: width, naturalHeight: height } = img
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) { reject(new Error('浏览器不支持 Canvas')); return }
    ctx.drawImage(img, 0, 0, width, height)
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片转换失败'))), 'image/webp', WEBP_QUALITY)
  })

  if (blob.size > MAX_FILE_SIZE) {
    throw new Error('图片压缩后仍超过 2MB，请换一张小一点的图')
  }

  const hash = await sha256Hex(blob)
  return { blob, hash, width, height, ext: 'webp', animated: false }
}

/** 上传到 images 桶的 emoji 子目录，返回公开地址 */
export async function uploadEmojiImage(blob: Blob, ext: string): Promise<string> {
  const session = getSession()
  if (!session?.userId) throw new Error('请先登录')

  const filename = `${createUploadId()}.${ext}`
  const path = `${session.userId}/emoji/${filename}`
  const contentType = ext === 'gif' ? 'image/gif' : 'image/webp'

  const { error } = await supabase.storage
    .from('images')
    .upload(path, blob, { contentType, cacheControl: '31536000', upsert: false })
  if (error) throw new Error(error.message)

  const { data } = supabase.storage.from('images').getPublicUrl(path)
  return data.publicUrl
}
