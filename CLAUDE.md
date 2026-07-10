# shsg8c1wiki — CLAUDE.md

## 项目概况
上海中学 2027 届 8 班 wiki，Next.js 16.2 SSG + Supabase。静态导出部署到 GitHub Pages。

## 关键路径
- `NEXT_PUBLIC_BASE_PATH` 在 CI 中设为 `/shsg8c1wiki`
- **所有图片路径、链接（尤其是`<a href>`）都必须加上 `process.env.NEXT_PUBLIC_BASE_PATH || ''` 前缀**，否则 GitHub Pages 上 404
- 示例：`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/logo.png`
- 示例：`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/${page}/#comment-${id}`

## 构建
- `next.config.js` 中 `output: 'export'` 由 `EXPORT=true` 环境变量控制
- CI 工作流：`.github/workflows/deploy.yml`
