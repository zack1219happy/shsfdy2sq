---
title: Markdown 帮助
icon: fas fa-markdown
attributes:
  文件位置: "`data/contents/notice/markdown-helper.md`"
  渲染引擎: markdown-it + highlight.js + KaTeX
---

本 Wiki 使用 Markdown 编写，经过自定义渲染管线处理后呈现。以下介绍所有支持的语法和功能。

## 页面头部（Frontmatter）

每个 `.md` 文件顶部用 `---` 包裹的 YAML 元数据：

```yaml
---
title: 页面标题        # 必填 — 显示在浏览器标签、面包屑、侧边栏
icon: fas fa-user     # 可选 — Font Awesome 图标（侧边栏显示）
attributes:           # 可选 — 属性表（渲染为键值对表格）
  称号: 数学鬼才
  相关词条: "[老王传说](/meme/laowang)"
---
```

- **title**：页面标题，也是侧边栏导航的文字、以及 `[[页面标题]]` 匹配的依据。
- **icon**：Font Awesome 图标类名，显示在侧边栏文字左侧。
- **attributes**：属性表，呈现在页面正文上方。值支持 `$...$` LaTeX、`[text](url)` 链接、`**粗体**` 等行内 Markdown。

## 标题与目录

```
## 二级标题
### 三级标题
```

- 不推荐在文章中包含 **h1**。
- 只有 **h2**（`##`）和 **h3**（`###`）会出现在右侧目录（TOC）中。
- 标题自动生成 `id` 属性，支持锚点跳转（如 `page/#标题与目录`）。

## 文字格式

| 语法 | 效果 |
|------|------|
| `**粗体**` | **粗体** |
| `*斜体*` | *斜体* |
| `~~删除线~~` | ~~删除线~~ |
| `` `行内代码` `` | `行内代码` |

## 链接

### 普通链接

```markdown
[显示文字](https://example.com)
[[校园地图]]
[[用户协议]]
```

- 站内链接使用相对路径 `/[slug]`。可以用 `..` 返回上一级，如 `../people/wang-zi/#班级信息`。
- 文件夹导航页的位置视作在文件内部，否则视作本来的位置。（因为实际是 url 相对，注意 github pages 部署后有个 https://zack1219happy.github.io/shsfdy2sq/ 前缀）
- 外部链接直接写 URL。

### Wiki 链接（双链）

```markdown
[[龙门楼]]
[[wz|创始人大大]]
```

- `[[页面标题]]` — 根据标题自动匹配页面。如果匹配到当前页面自身，则跳转为 `#`（不刷新）。
- `[[页面标题|显示文字]]` — 在文章中让链接指定显示文字。
- 匹配规则：遍历所有页面的 `title`（来自 frontmatter），不分大小写精确匹配。
- 匹配到的链接自动添加 `.wiki-link` 类，显示 ↗ 后缀图标。

## 图片

```markdown
![图注文字](_assets/文件名.png)
```

- 图片放在**分类级别的 `_assets/`** 目录下。例如 `campus/map.md` 和 `campus.md` 共用 `data/contents/campus/_assets/`。允许不同分类各自拥有独立的 `_assets/` 目录，互不干扰。
- 图片命名最好有语义。
- 路径用相对路径引用（`_assets/xxx.png`），构建时自动修正为绝对路径。
- **alt 文字**（`![...]` 中的内容）会被渲染为 `<figcaption>` 图注。
- 图片点击会放大弹窗（浮层 + 模糊背景 + 缩放动画）。
- 图片悬停有轻微放大和阴影效果。

## 表格

```markdown
| 左列 | 右列 |
|------|------|
| 内容 | 内容 |
```

- 支持标准 GFM 表格。
- 建议第一行表头，第二行对齐线（`|------|------|`）。

## 代码块

````markdown
```python
def hello():
    print("Hello, World!")
```
````

- 支持 190+ 语言高亮（highlight.js）。
- 代码块有**语言标签**（右上角）和**复制按钮**（点击复制代码）。
- 未指定语言或不能识别时，显示为 `text`。
- 背景为深色（`#1e1e2e`），圆角边框，与正文区分明显。

## LaTeX 数学公式

### 行内公式

```markdown
勾股定理：$a^2 + b^2 = c^2$
温度 $120\degree\degree$
```

### 块级公式

```markdown
$$
\int_a^b f(x) \, dx = F(b) - F(a)
$$
```

- 使用 KaTeX 渲染（构建时完成，无客户端 JS 开销）。
- 行内公式用 `$...$`，块级公式用 `$$...$$`。
- 支持 KaTeX 全部语法。注意反斜杠在 Markdown 中需要转义（如 `\degree` → `\degree`）。

## Callout 折叠框

Callout 是扩展了 Obsidian 风格的提示框/折叠块：

```markdown
> [!note] 提示标题
> 这是提示内容

> [!warning]- 可折叠警告
> 默认折叠，点击展开

> [!success]+ 默认展开
> 一开始就展开

> [!bug] BUG 报告
> 始终可见
```

### 支持的四种类型

| 类型 | 左边框颜色 | 风格 |
|------|-----------|------|
| `[!note]` | 🔵 蓝色 | 信息提示 |
| `[!success]` | 🟢 绿色 | 成功/确认 |
| `[!warning]` | 🟠 橙色 | 警告/注意 |
| `[!bug]` | 🔴 红色 | 缺陷/问题 |

### 折叠行为

| 后缀 | 效果 |
|------|------|
| `[!note]` 无后缀 | `<div>` 始终展开 |
| `[!note]-` 减号 | `<details>` 默认折叠 |
| `[!note]+` 加号 | `<details open>` 默认展开 |

### 嵌套支持

Callout 内部可以放任意 Markdown 内容（段落、列表、代码、表格等）。

## 列表

```markdown
- 无序列表项 1
- 无序列表项 2

1. 有序列表项 1
2. 有序列表项 2
```

## 引用

```markdown
> 这是一段引用文字
> 可以跨多行
```

引用块显示为灰色左侧边框 + 浅灰背景。

## 水平线

```markdown
---
```

渲染为一条细灰色分隔线。

## HTML 支持

因为 markdown-it 启用了 `html: true`，所以可以直接嵌入 HTML 标签：

```html
<details>
<summary>自定义 HTML 折叠</summary>
自写 HTML 内容
</details>
```

但**建议优先使用 Callout 语法**（`[!note]-`）实现折叠效果，样式统一且简洁。

## 渲染管线说明

```
Markdown 源文件
  → gray-matter（提取 frontmatter）
  → markdown-it
    ├── highlight.js（代码高亮，自动识别语言）
    ├── KaTeX（$..$ / $$..$$ 构建时渲染）
    └── markdown-it-anchor（h2/h3 自动加 id）
  → fixImagePaths（相对路径 → 绝对路径）
  → replaceWikiLinks（[[标题]] → <a>）
  → addImageCaptions（alt → <figure><figcaption>）
```

所有渲染在 **构建时完成**，生成的纯 HTML 静态部署，用户浏览器无需额外 JS。
