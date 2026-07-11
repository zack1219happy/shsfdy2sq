/* ============================================
   MarkdownEditor — 对话框表单
   ============================================ */

'use client'

import { useState, useEffect } from 'react'
import type { DialogField } from './types'
import styles from '@/styles/markdown-editor.module.css'

interface DialogFormProps {
  fields: DialogField[]
  onData: (data: Record<string, string>) => void
}

export default function DialogForm({ fields, onData }: DialogFormProps) {
  const [data, setData] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const f of fields) {
      initial[f.name] = f.defaultValue ?? ''
    }
    return initial
  })

  useEffect(() => {
    onData(data)
  }, [data, onData])

  const set = (name: string, value: string) => {
    setData((prev) => ({ ...prev, [name]: value }))
  }

  return (
    <div className={styles.form}>
      {fields.map((field) => (
        <div key={field.name} className={styles.field}>
          <label className={styles.label}>{field.label}</label>

          {field.type === 'text' && (
            <input
              className={styles.input}
              type="text"
              value={data[field.name] ?? ''}
              onChange={(e) => set(field.name, e.target.value)}
              placeholder={field.placeholder ?? ''}
            />
          )}

          {field.type === 'select' && field.options && (
            <select
              className={styles.select}
              value={data[field.name] ?? ''}
              onChange={(e) => set(field.name, e.target.value)}
            >
              {field.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          {field.type === 'code' && (
            <textarea
              className={styles.textarea}
              value={data[field.name] ?? ''}
              onChange={(e) => set(field.name, e.target.value)}
              rows={8}
            />
          )}
        </div>
      ))}
    </div>
  )
}
