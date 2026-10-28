'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import FaIcon from '@/components/FaIcon'
import {
  EXPIRING_FILE_THRESHOLD,
  formatBytes,
  formatExpiry,
  getMyFileSlot,
  type FileSlot,
  uploadUserFile,
} from '@/lib/api/files'
import styles from '@/styles/markdown-editor.module.css'

interface Props {
  onFinish: (data: Record<string, string>) => void
  onClose: () => void
}

interface UploadedFile {
  name: string
  url: string
  size: number
  expiresAt: string | null
}

export default function FileUploadDialog({ onFinish, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [loadingSlot, setLoadingSlot] = useState(true)
  const [slot, setSlot] = useState<FileSlot | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshSlot = useCallback(async () => {
    setLoadingSlot(true)
    try {
      setSlot(await getMyFileSlot())
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取文件槽状态失败')
    } finally {
      setLoadingSlot(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getMyFileSlot()
      .then((next) => { if (!cancelled) setSlot(next) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '获取文件槽状态失败') })
      .finally(() => { if (!cancelled) setLoadingSlot(false) })
    return () => { cancelled = true }
  }, [])

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setUploaded(null)
    if (file.size > 200 * 1024 * 1024) {
      setError(`文件超过 200MB 限制（当前 ${formatBytes(file.size)}）`)
      return
    }
    setUploading(true)
    try {
      const result = await uploadUserFile(file)
      setUploaded({
        name: file.name,
        url: result.url,
        size: file.size,
        expiresAt: result.expiresAt,
      })
      await refreshSlot()
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败，请重试')
    } finally {
      setUploading(false)
    }
  }, [refreshSlot])

  const handleConfirm = () => {
    if (!uploaded) return
    onFinish({ url: uploaded.url, name: uploaded.name })
  }

  return (
    <div className={styles.uploadDialogBody}>
      <div className={styles.fileSlotState}>
        <strong>文件槽状态</strong>
        {loadingSlot ? (
          <span className={styles.fileSlotMuted}>正在读取…</span>
        ) : slot ? (
          <span>
            已占用：<b>{slot.original_name}</b>（{formatBytes(slot.size_bytes)}，{formatExpiry(slot.expires_at)}）
          </span>
        ) : (
          <span className={styles.fileSlotMuted}>空闲</span>
        )}
        {slot && <small>上传新文件会替换当前文件</small>}
      </div>

      <div
        className={`${styles.uploadZone} ${dragOver ? styles.uploadZoneActive : ''} ${uploading ? styles.uploadZoneDisabled : ''}`}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false) }}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const file = e.dataTransfer.files?.[0]
          if (file) void handleFile(file)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        aria-label="点击或拖拽上传文件"
      >
        <input
          ref={inputRef}
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
          style={{ display: 'none' }}
        />
        <div className={styles.uploadZoneContent}>
          {uploading ? (
            <>
              <FaIcon name="spinner" className={styles.uploadSpinner} />
              <span>正在上传并校验…</span>
            </>
          ) : uploaded ? (
            <>
              <FaIcon name="check" className={styles.uploadSuccessIcon} />
              <span className={styles.uploadZoneText}>{uploaded.name}</span>
              <span className={styles.uploadZoneSubtext}>{formatBytes(uploaded.size)}，{formatExpiry(uploaded.expiresAt)}</span>
            </>
          ) : (
            <>
              <FaIcon name="upload" className={styles.uploadIcon} />
              <span className={styles.uploadZoneText}>点击选择文件</span>
              <span className={styles.uploadZoneSubtext}>或拖拽文件到此处</span>
              <span className={styles.uploadZoneSubtext}>最大 200MB；超过 20MB 的文件 30 分钟后过期</span>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className={styles.uploadError}>
          <FaIcon name="exclamation-circle" /> {error}
        </div>
      )}

      <div className={styles.uploadActions}>
        <button className={`${styles.dialogBtn} ${styles.dialogBtnCancel}`} onClick={onClose} type="button">
          取消
        </button>
        <button
          className={`${styles.dialogBtn} ${styles.dialogBtnConfirm}`}
          onClick={handleConfirm}
          disabled={!uploaded || uploading}
          type="button"
        >
          插入链接
        </button>
      </div>
    </div>
  )
}

export { EXPIRING_FILE_THRESHOLD }
