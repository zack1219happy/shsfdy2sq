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
| **元数据** | gray-matter (frontmatter) + `_meta.json` |
| **部署** | GitHub Actions → GitHub Pages |

## 架构

```
shsg8c1wiki/
├── .github/workflows/deploy.yml   # GitHub Actions → GitHub Pages 自动部署
├── next.config.js                  # EXPORT=true 时启用静态导出
├── scripts/
│   └── copy-static.js              # postbuild: 将运行时文件复制到 out/
├── data/                           # 内容源文件（单一数据源）
│   ├── wiki-data.json              # 导航树结构（id/title/type/path/icon/children）
│   ├── announcement.md             # 公告（客户端 fetch，构建时复制到 out/）
│   └── contents/                   # 页面内容按 category/article/ 组织
│       ├── home/index.md + _meta.json + _assets/
│       └── meme/{laowang,dingji,...}/index.md
├── src/
│   ├── app/
│   │   ├── layout.tsx              # 根布局：Sidebar + 内容区 + BottomBar
│   │   ├── page.tsx                # 首页（SSG）
│   │   ├── not-found.tsx           # 404
│   │   └── [...slug]/page.tsx      # 捕获全部路径的 SSG 页面
│   ├── components/
│   │   ├── Sidebar.tsx             # 客户端：树形导航 + 折叠/拖拽 + 公告
│   │   ├── Breadcrumb.tsx          # 服务端：面包屑导航
│   │   ├── TableOfContents.tsx     # 客户端：右侧目录 + IntersectionObserver
│   │   ├── AttributeBox.tsx        # 服务端：_meta.json 属性表
│   │   ├── BottomBar.tsx           # 客户端：底部栏 + 法律/隐私弹窗
│   │   └── Modal.tsx               # 客户端：通用弹窗（ESC 关闭）
│   ├── lib/
│   │   ├── navigation.ts           # wiki-data.json 加载/查找/面包屑
│   │   └── content.ts              # markdown-it 渲染管线 + KaTeX + 图片处理
│   ├── styles/                     # CSS Modules
│   └── types/
│       └── markdown-it-texmath.d.ts
└── eslint.config.mjs               # ESLint 9 扁平配置
```

### 路由映射

```
GitHub Pages URL                        Next.js 路径        内容文件
/shsg8c1wiki/                           /                   data/contents/home/index.md
/shsg8c1wiki/meme/                      /meme               data/contents/meme/index.md
/shsg8c1wiki/meme/laowang/             /meme/laowang        data/contents/meme/laowang/index.md
```

- `generateStaticParams()` 遍历 `wiki-data.json` 的所有节点生成静态路径
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

_meta.json 属性值
  → renderInlineLatex() 处理 $...$
  → convertMdLink() 处理 [text](url)
```

## 内容管理

### 添加新页面

1. 创建目录和文件：`data/contents/{category}/{page-name}/index.md`
2. 在 `data/wiki-data.json` 的 `sidebar` 中添加节点：

```json
{
  "id": "page-name",
  "title": "页面标题",
  "type": "page",
  "path": "contents/category/page-name/index.md",
  "icon": "fas fa-file-alt"
}
```

文件夹类型：`{"type": "folder", "children": [...]}`
可选：`path` 让文件夹自身也有内容页。

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
- 代码块：` ```python ` 自动高亮
- 内部链接：`[标题](/meme/laowang)`（原 `#/meme/laowang` 也会自动转换）

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
