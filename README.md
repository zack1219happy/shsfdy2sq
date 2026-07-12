# 🏫 上中二旦社区

班级 Wiki，基于 Next.js 16 静态导出，部署于 GitHub Pages。

这是一个超有梗超有活力的 Wiki！

zack1219happy（[stu:wz]）是我们的创始人大大！

从零到一搭起这个 Wiki 的框架，一个人默默写了整整一学期，没有他的坚持就不会有这个站。HTML、CSS、JavaScript 一把梭，所有东西都是他（用 DeepSeek）亲手敲出来的，代码力拉满。而且他不光技术好，还特别有耐心，把每个页面都调得细致又好看（谁知道跟没有多模态的 AI 交流前端有多费劲）。最关键的是，他永远欢迎大家一起参与，真正把 Wiki 做成了属于全班的知识库。感谢创始人大大，你是我们的超人 🦸‍♂️！！！

**在线访问：** https://zack1219happy.github.io/shsfdy2sq/

---

## 📖 目录

- [我能做什么？](#-我能做什么)
- [方式一：在 GitHub 网页上编辑（推荐新手）](#-方式一在-github-网页上编辑推荐新手)
  - [编辑现有页面](#编辑现有页面)
  - [创建新页面](#创建新页面)
  - [上传图片](#上传图片)
- [方式二：在本地编辑（推荐熟悉 Git 的人）](#-方式二在本地编辑推荐熟悉-git-的人)
- [Markdown 速查](#-markdown-速查)
- [Frontmatter 规则](#-frontmatter-规则)
- [注意事项](#-注意事项)

---

## 🤔 我能做什么？

| 你想做的事 | 难度 | 在哪里做 |
|-----------|------|---------|
| 修改正文错别字 / 补充内容 | ⭐ | GitHub 网页直接改 |
| 创建新页面（如某位同学的个人页） | ⭐⭐ | GitHub 网页新建文件 |
| 上传图片 | ⭐⭐ | GitHub 网页上传 |
| 批量修改 / 添加大量内容 | ⭐⭐⭐ | 本地 Git 操作 |

---

## 🌐 方式一：在 GitHub 网页上编辑（推荐新手）

> ⚠️ **先登录 GitHub。** 点击右上角的 Sign in（登录）/Sign up（注册新账号）。
>
> 你需要有一个邮箱。国内的就可以：163, 126, qq……

### 编辑现有页面

**第 1 步：找到文件**

1. 打开 https://github.com/zack1219happy/shsfdy2sq
2. 点击 `data` 文件夹 → `contents` 文件夹
3. 找到你要修改的 `.md` 文件（例如 `campus/dormitory.md`）

**第 2 步：进入编辑模式**

1. 点击文件右侧的 ✏️ **铅笔图标**（写着 "Edit this file"）
2. 页面变成编辑模式，可以看到文件源码

**第 3 步：修改内容**

- 正文用 Markdown 语法（见下方速查）
- 文件最顶上的 `---` 之间的内容是 **frontmatter**，不要随意删改

**第 4 步：提交修改**

1. 往下翻到 **Commit changes** 区域
2. 第一行写标题，例如 `fix: 修正宿舍楼描述`
3. 下面可以写详细说明（可选）
4. 选择 **"Create a new branch for this commit and start a pull request"**
5. 点击绿色的 **Propose changes** 按钮

**第 5 步：创建 Pull Request**

1. 页面跳转到 Pull Request 创建页
2. 检查一下左边的 `base: main`，右边的 `compare:` 是你刚才新建的分支
3. 确认 Changes 里显示了你改的内容
4. 点击绿色的 **Create pull request** 按钮
5. 等待管理员审核合并

---

### 创建新页面

**第 1 步：进入目标目录**

1. 打开 https://github.com/zack1219happy/shsfdy2sq/tree/main/data/contents
2. 点进你要添加页面的分类目录（如 `people`、`campus`、`daily`）

**第 2 步：新建文件**

1. 点击右上角的 **Add file** → **Create new file**
2. 在文件名输入框里写 `xxx.md`（例如 `zhang-san.md`）
   - 文件名用英文小写、短横线连接（如 `computer-lab.md`）
   - 不要用中文文件名

**第 3 步：写内容**

复制以下模板，粘贴到编辑区：

```markdown
---
title: 页面标题
icon: fas fa-file-alt
---

正文内容...
```

具体要求见下方 [Frontmatter 规则](#-frontmatter-规则)。

**第 4 步：提交**

同上，Commit → Create a new branch → Propose changes → Create pull request。

---

### 上传图片

**第 1 步：进入 _assets 目录**

1. 打开你要放图片的分类目录（如 `campus`）
2. 点进 `_assets` 文件夹（如果没有，在 `campus` 目录下新建 `_assets/` 文件夹）

**第 2 步：上传**

1. 点击 **Add file** → **Upload files**
2. 把图片拖进去，或者点 "choose your files" 选择
3. 在页面的 "Commit changes" 栏里写个说明
4. 选择 **"Create a new branch"**
5. 点击绿色的 **Propose changes**

**第 3 步：在页面中引用**

```markdown
![图片描述](_assets/文件名.png)
```

图片和 `.md` 文件在同一目录层级时用这个路径。如果图片在子目录的 `_assets` 里，路径要对应好，例如：

```markdown
![宿舍布局](_assets/宿舍布局.png)
```

> ⚠️ 图片文件名会出现在 URL 中，建议用中文或英文命名都可以，但不要太长。

---

## 💻 方式二：在本地编辑（推荐熟悉 Git 的人）

### 环境要求

- Node.js 22+
- Git
- npm

### 第一步：克隆仓库

```bash
git clone https://github.com/zack1219happy/shsfdy2sq.git
cd shsfdy2sq
```

### 第二步：创建新分支

```bash
git checkout -b my-edit-branch
```

### 第三步：修改内容

所有内容文件在 `data/contents/` 目录下：

```
data/contents/
├── home.md              # 首页
├── campus.md            # 校园分类页
├── campus/map.md        # 校园地图
├── campus/dormitory.md  # 宿舍
├── campus/gym.md        # 体育馆
├── campus/_assets/      # 校园相关的图片
├── people/              # 人物
├── daily/               # 日常
└── notice/              # 通告
```

### 第四步：本地预览

```bash
npm install
npm run dev
```

打开 http://localhost:3000/shsfdy2sq/ 查看效果。

### 第五步：提交并推送

```bash
git add .
git commit -m "feat: 添加 xxx 页面"
git push origin my-edit-branch
```

### 第六步：创建 Pull Request

推送后终端会显示一个链接，点进去创建 PR。或者：

1. 打开 https://github.com/zack1219happy/shsfdy2sq
2. 点 **Pull requests** 标签 → 绿色的 **New pull request**
3. 选 `base: main` ← `compare: my-edit-branch`
4. 点 **Create pull request**

---

## 📝 Markdown 速查

```markdown
# 一级标题
## 二级标题
### 三级标题

**加粗**   *斜体*

- 无序列表项
- 另一项

1. 有序列表
2. 第二项

[链接文字](https://example.com)
[内部链接](/campus/dormitory)   ← 链接到本站其他页面

![图片描述](_assets/文件名.png)

> 引用

`行内代码`

​```python      ← 代码块（带语言名，自动高亮）
print("hello")
​```

| 表格 | 列2 |
|------|-----|
| 内容 | 内容 |

$E = mc^2$          ← 行内 LaTeX 公式
$$\int_a^b$$        ← 块级 LaTeX 公式

> [!note] 标题    ← 折叠提示框
> 内容...

> [!warning]
> 警告内容...

[!note] / [!warning] / [!success] / [!bug] 四种类型
```

---

## 🔖 Frontmatter 规则

每个 `.md` 文件顶部都有一个 `---` 包围的区域，叫 frontmatter：

```markdown
---
title: 页面标题          # 必填。显示在导航栏和浏览器标签上
icon: fas fa-file-alt    # 可选。Font Awesome 图标类名
---

正文内容...
```

**图标参考（以下都可以用）：**

| 用途 | 图标类名 |
|------|---------|
| 首页 | `fas fa-home` |
| 人物 | `fas fa-user` |
| 校园 | `fas fa-school` |
| 日常 | `fas fa-calendar-day` |
| 通告 | `fas fa-bullhorn` |
| 通用 | `fas fa-file-alt` |
| 图片 | `fas fa-image` |
| 链接 | `fas fa-link` |

> 更多图标见 [Font Awesome 免费图标列表](https://fontawesome.com/search?m=free)

---

## ⚠️ 注意事项

1. **Pull Request 审核制**：所有修改都需要通过 Pull Request 合并，不要直接推 `main`
2. **文件名规范**：用英文小写 + 短横线（如 `computer-lab.md`），不要用中文文件名
3. **路径区分大小写**：GitHub 和 Linux 区分大小写，`Campus` 和 `campus` 不同
4. **内部链接**：链接本站页面用 `/分类/页面名`（如 `/people/chen-wenyi`），不加 `.md`
5. **敏感内容**：这里的内容对全校公开，注意保护隐私
6. **构建验证**：PR 合并前 GitHub Actions 会自动检查能不能编译通过，黄灯 ❌ 表示有错误不能合并
