/** @type {import('next').NextConfig} */
const nextConfig = {
  // 只在 EXPORT=true 时启用静态导出（避免 dev server 报非页面路由的错）
  ...(process.env.EXPORT === 'true' ? { output: 'export' } : {}),
  images: { unoptimized: true },
  trailingSlash: true,
  // basePath 由 GitHub Actions 传入 NEXT_PUBLIC_BASE_PATH 环境变量
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH
    ? `${process.env.NEXT_PUBLIC_BASE_PATH}/`
    : undefined,
}

module.exports = nextConfig
