# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**上中初二 Wiki** — 班级知识库，基于 **Next.js 16 (App Router, Turbopack)**，静态导出（`output: 'export'`）部署于 **GitHub Pages**。

核心目标：GitHub Pages 可部署、可维护性高、代码可读性强。

## 技术栈

| 层次 | 选型 |
|------|------|
| **框架** | Next.js 16 (App Router, Turbopack) |
| **语言** | TypeScript (strict) |
| **样式** | CSS Modules + 全局 CSS |
| **Markdown** | markdown-it + markdown-it-anchor |
| **公式** | markdown-it-texmath + KaTeX（构建时渲染） |
| **代码高亮** | highlight.js（markdown-it highlight 回调） |
| **元数据** | gray-matter (frontmatter) |
| **部署** | GitHub Actions → GitHub Pages |

// 架构

```
shsg8c1wiki/
├── .github/workflows/deploy.yml   # GitHub Actions → GitHub Pages 自动部署
├── next.config.js                  # EXPORT=true 时启用静态导出
├── scripts/
│   ├── copy-static.js              # postbuild: 将 data/ 复制到 out/data/
│   └── copy-data-dev.js            # predev: 将 data/ 复制到 public/data/
├── data/                           # 内容源文件（单一数据源）
│   ├── announcement.md             # 公告（客户端 fetch）
│   └── contents/                   # 页面内容，按分类直接放 .md 文件
│       ├── home.md                 # 首页
│       ├── campus.md               # 校园分类页
│       ├── campus/dormitory.md     # 具体页面
│       ├── campus/gym.md
│       └── people/                 # 人物分类，每人一个 .md 文件
│           ├── chen-wenyi.md
│           └── ...
├── src/
│   ├── app/
│   │   ├── layout.tsx              # 根布局：Sidebar + 内容区
│   │   ├── page.tsx                # 首页（SSG）
│   │   ├── not-found.tsx           # 404
│   │   └── [...slug]/page.tsx      # 捕获全部路径的 SSG 页面
│   ├── components/
│   │   ├── Sidebar.tsx             # 客户端：树形导航 + 折叠 + 公告
│   │   ├── Breadcrumb.tsx          # 服务端：面包屑导航
│   │   ├── TableOfContents.tsx     # 客户端：右侧目录 + IntersectionObserver
│   │   ├── AttributeBox.tsx        # 服务端：frontmatter 属性表
│   │   ├── ImageModal.tsx          # 客户端：点击图片放大查看
│   │   ├── PageShell.tsx           # 页面骨架
│   │   └── WikiContent.tsx         # 统一 Markdown/LaTeX 渲染
│   ├── lib/
│   │   ├── navigation.ts           # 文件系统扫描自动生成导航树
│   │   └── content.ts              # markdown-it 渲染管线 + KaTeX + 图片处理
│   ├── styles/                     # CSS Modules
│   └── types/
│       └── markdown-it-texmath.d.ts
└── eslint.config.mjs               # ESLint 9 扁平配置
```

### 路由映射

```
GitHub Pages URL                        Next.js 路径        内容文件
/shsg8c1wiki/                           /                   data/contents/home.md
/shsg8c1wiki/people/                    /people             data/contents/people.md
/shsg8c1wiki/people/laowang            /people/laowang     data/contents/people/chen-wenyi.md
```

- `navigation.ts` 扫描 `data/contents/` 下所有 `.md` 文件自动生成路由
- `[...slug]/page.tsx` 中 `params` 是 Promise，需要 `await`

### 渲染管线

```
Markdown 源文件
  → gray-matter（提取 frontmatter）
  → markdown-it
    ├── highlight.js（自动识别语言，构建时高亮）
    ├── markdown-it-texmath + KaTeX（$..$ / $$..$$ 构建时渲染）
    └── markdown-it-anchor（h2/h3 自动加 id）
  → fixImagePaths（相对路径 → /{basePath}/data/contents/{slug}/）
  → addImageCaptions（alt 文字 → <figure><figcaption>）

_meta.json 属性值（已弃用，改用 frontmatter）
  → renderInlineLatex() 处理 $...$
  → convertMdLink() 处理 [text](url)
```

## 内容管理

### 添加新页面

直接在 `data/contents/` 下创建 `.md` 文件，添加 frontmatter：

```markdown
---
title: 页面标题
icon: fas fa-file-alt
---

正文内容...
```

导航树由 `navigation.ts` 自动扫描 `data/contents/` 下所有 `.md` 文件生成，不需要手动注册。

### 属性表（_meta.json）

```json
{
  "称号": "数学鬼才",
  "相关词条": "[老王传说](/meme/laowang)、[作业风暴](/meme/homework-storm)",
  "公式": "$E = mc^2$"
}
```

- 支持 LaTeX 行内公式 `$...$`（构建时 KaTeX 渲染）
- 支持 Markdown 链接 `[text](url)`（自动转 `<a>`）
- 支持数组（渲染为顿号分隔）

### 图片

放在 `_assets/` 目录下，Markdown 中用相对路径引用。构建时自动修正路径。

### Markdown 特性

- LaTeX: `$E = mc^2$`（行内）、`$$\int_a^b$$`（块级）
- 代码块：` ```python ` 自动高亮 + 复制按钮
- 内部链接：`[标题](/people/chen-wenyi)` 或 `[[标题]]` Wiki 链接

## 构建与部署

```bash
npm run dev                    # 本地开发（http://localhost:3000）
npm run build                  # 生产构建验证
npm run export                 # 完整静态导出 + 复制运行时文件
EXPORT=true npx next build     # 也可手动触发导出模式

# 模拟生产（basePath）
NEXT_PUBLIC_BASE_PATH=/shsg8c1wiki EXPORT=true npx next build && node scripts/copy-static.js

# 在本地预览静态导出
npx serve out -l 3000
```

**注意**：`next.config.js` 中 `output: 'export'` 仅在 `EXPORT=true` 时启用，避免 dev server 报非页面路由的错误。

GitHub Actions 自动部署流程（推 main 触发）：
1. `npm ci` → `npm run export`（设 `NEXT_PUBLIC_BASE_PATH=/shsg8c1wiki`）
2. `copy-static.js` 复制 `data/announcement.md` + 图片到 `out/data/`
3. `actions/upload-pages-artifact` → `actions/deploy-pages`

## 常见问题

- **dev server 下公告不显示**：正常。`data/announcement.md` 仅在构建时复制到 `out/`，dev 模式下不可用。生产部署后正常。
- **图片在 dev 下 404**：图片路径在构建时修正，dev 下仅从 `data/` 提供，确保 `data/contents/*/_assets/*` 存在即可。
