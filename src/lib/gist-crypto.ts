/**
 * Gist 加解密（浏览器端 Web Crypto API）
 *
 * 密钥派生：SHA-256(GIST_MASTER_SECRET) → 32 bytes → AES-256-GCM
 * 密文格式：base64( iv(12) + ciphertext + auth_tag(16) )
 */

const KEY_HEX = process.env.NEXT_PUBLIC_GIST_KEY!
if (!KEY_HEX || KEY_HEX.length !== 64) {
  throw new Error('NEXT_PUBLIC_GIST_KEY 未设置或格式错误（需 64 hex 字符）')
}

async function getKey(): Promise<CryptoKey> {
  const keyData = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    keyData[i] = parseInt(KEY_HEX.slice(i * 2, i * 2 + 2), 16)
  }
  return crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** 加密明文，返回 base64 密文 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  const combined = new Uint8Array(12 + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), 12)
  return btoa(String.fromCharCode(...combined))
}

/** 解密 base64 密文，返回明文 */
export async function decrypt(ciphertext: string): Promise<string> {
  const key = await getKey()
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const data = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(decrypted)
}
