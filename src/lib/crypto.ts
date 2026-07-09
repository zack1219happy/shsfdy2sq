/**
 * 密码哈希工具 — 使用 Web Crypto API (SHA-256)
 *
 * 在浏览器环境中可用，Node.js 16+ 也已支持 SubtleCrypto。
 * 注意：crypto.subtle 在 HTTP 环境下不可用，需 HTTPS 或 localhost。
 */

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
