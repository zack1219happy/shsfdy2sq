/* ============================================
   MarkdownEditor — 图片上传对话框
   ============================================ */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import FaIcon from '@/components/FaIcon'
import styles from '@/styles/markdown-editor.module.css'

/* ---------- 常量 ---------- */

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_DIMENSION = 3000            // 宽/高上限
const WEBP_QUALITY = 0.8
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/gif',
  'image/tiff',
  'image/avif',
])

/* ---------- Props ---------- */

interface Props {
  onFinish: (data: Record<string, string>) => void
  onClose: () => void
}

/* ---------- 工具函数 ---------- */

/**
 * 将图片文件转换为 WebP Blob，同时缩放至 MAX_DIMENSION 以内
 */
function convertToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      // 等比例缩放
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('浏览器不支持 Canvas'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('WebP 转换失败'))
        },
        'image/webp',
        WEBP_QUALITY,
      )
    }
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = URL.createObjectURL(file)
  })
}

/**
 * 从 ClipboardEvent 中提取图片文件
 */
function getImageFromClipboard(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items
  if (!items) return null
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type.startsWith('image/') && item.kind === 'file') {
      return item.getAsFile()
    }
  }
  return null
}

/* ---------- 主组件 ---------- */

export default function ImageUploadDialog({ onFinish, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [uploadedUrl, setUploadedUrl] = useState('')
  const [altText, setAltText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [manualUrl, setManualUrl] = useState('')

  // 实际的 URL（上传的或手动输入的）
  const effectiveUrl = uploadedUrl || manualUrl

  /* ---- 上传核心 ---- */

  const handleFile = useCallback(async (file: File) => {
    // 清理上次状态
    setError(null)
    setUploadedUrl('')
    setManualUrl('')

    // 格式校验
    if (!ALLOWED_TYPES.has(file.type)) {
      setError(`不支持的图片格式：${file.type}。支持 JPEG/PNG/WebP/BMP/GIF/TIFF/AVIF`)
      return
    }

    // 大小校验
    if (file.size > MAX_FILE_SIZE) {
      setError(`文件超过 5MB 限制（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）`)
      return
    }

    // 检查登录
    const session = getSession()
    if (!session?.userId) {
      setError('请先登录')
      return
    }

    setUploading(true)

    try {
      // 转 WebP
      const webpBlob = await convertToWebP(file)

      // 生成唯一文件名
      const ext = 'webp'
      const filename = `${crypto.randomUUID()}.${ext}`
      const filePath = `${session.userId}/${filename}`

      // 上传到 Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, webpBlob, {
          contentType: 'image/webp',
          cacheControl: '31536000',
          upsert: false,
        })

      if (uploadError) {
        // 检查是否是 RLS 策略未创建（SQL 还未在 Dashboard 执行）
        if (uploadError.message?.includes('violates row-level security') ||
            String(uploadError.statusCode) === '403' ||
            String(uploadError.statusCode) === '401') {
          throw new Error('上传权限未配置，请联系管理员执行 scripts/setup-storage.sql')
        }
        throw uploadError
      }

      // 获取公开 URL
      const { data: urlData } = supabase.storage
        .from('images')
        .getPublicUrl(filePath)

      setUploadedUrl(urlData.publicUrl)
    } catch (e: any) {
      setError(e?.message || '上传失败，请重试')
    } finally {
      setUploading(false)
    }
  }, [])

  /* ---- 文件选择 ---- */

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      // 重置 input 以便同一文件可再次选择
      e.target.value = ''
    },
    [handleFile],
  )

  /* ---- 拖拽上传 ---- */

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file?.type.startsWith('image/')) {
        handleFile(file)
      } else {
        setError('请拖入图片文件')
      }
    },
    [handleFile],
  )

  /* ---- 粘贴 ---- */

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const file = getImageFromClipboard(e)
      if (file) {
        e.preventDefault()
        handleFile(file)
      }
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [handleFile])

  /* ---- 确认插入 ---- */

  const handleConfirm = () => {
    if (!effectiveUrl.trim()) {
      setError('请上传图片或输入图片链接')
      return
    }
    onFinish({ url: effectiveUrl, alt: altText })
  }

  /* ---- 渲染 ---- */

  return (
    <div className={styles.uploadDialogBody}>
      {/* 上传区域 */}
      <div
        ref={dropRef}
        className={`${styles.uploadZone} ${dragOver ? styles.uploadZoneActive : ''} ${uploading ? styles.uploadZoneDisabled : ''}`}
        onClick={() => !uploading && fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        aria-label="点击或拖拽上传图片，或 Ctrl+V 粘贴"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/bmp,image/gif,image/tiff,image/avif"
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />

        {uploading ? (
          <div className={styles.uploadZoneContent}>
            <FaIcon name="spinner" className={styles.uploadSpinner} />
            <span>正在转换并上传…</span>
          </div>
        ) : effectiveUrl ? (
          <div className={styles.uploadZoneContent}>
            <img
              src={effectiveUrl}
              alt="预览"
              className={styles.uploadPreview}
            />
            <span className={styles.uploadSuccessHint}>✓ 上传成功</span>
          </div>
        ) : (
          <div className={styles.uploadZoneContent}>
            <FaIcon name="cloud-upload-alt" className={styles.uploadIcon} />
            <span className={styles.uploadZoneText}>点击选择图片</span>
            <span className={styles.uploadZoneSubtext}>
              或 Ctrl+V 粘贴 / 拖拽文件到此处
            </span>
            <span className={styles.uploadZoneSubtext}>
              支持 JPEG/PNG/WebP/BMP/GIF，≤5MB，自动转换为 WebP
            </span>
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className={styles.uploadError}>
          <FaIcon name="exclamation-circle" /> {error}
        </div>
      )}

      {/* 图片链接 */}
      <div className={styles.uploadField}>
        <label className={styles.uploadLabel}>图片链接</label>
        <input
          className={styles.uploadInput}
          type="text"
          placeholder="上传后自动填入，或手动输入外部链接"
          value={effectiveUrl}
          onChange={(e) => {
            setManualUrl(e.target.value)
            if (e.target.value !== uploadedUrl) {
              setUploadedUrl('') // 手动输入时清除上传结果
            }
          }}
        />
      </div>

      {/* 图片描述 */}
      <div className={styles.uploadField}>
        <label className={styles.uploadLabel}>图片描述</label>
        <input
          className={styles.uploadInput}
          type="text"
          placeholder="选填"
          value={altText}
          onChange={(e) => setAltText(e.target.value)}
          maxLength={200}
        />
      </div>

      {/* 操作按钮 */}
      <div className={styles.uploadActions}>
        <button
          className={`${styles.dialogBtn} ${styles.dialogBtnCancel}`}
          onClick={onClose}
          type="button"
        >
          取消
        </button>
        <button
          className={`${styles.dialogBtn} ${styles.dialogBtnConfirm}`}
          onClick={handleConfirm}
          disabled={!effectiveUrl.trim()}
          type="button"
        >
          确定
        </button>
      </div>
    </div>
  )
}
