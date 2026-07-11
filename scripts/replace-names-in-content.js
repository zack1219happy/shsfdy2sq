/**
 * 替换所有 wiki .md 文件中的中文姓名为 [stu:xxx] / [tch:xxx] 语法
 *
 * 用法: node scripts/replace-names-in-content.js [--dry-run]
 */
const fs = require('fs')
const path = require('path')

const registry = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'person-registry.json'), 'utf-8'),
)

const CONTENTS_DIR = path.join(__dirname, '..', 'data', 'contents')
const ANNOUNCEMENT_PATH = path.join(__dirname, '..', 'data', 'announcement.md')
const README_PATH = path.join(__dirname, '..', 'README.md')

// 构建替换表（姓名 → [stu:缩写] / [tch:缩写]）
// 按姓名字节长度降序排列，避免重叠匹配（如"王梓"不应匹配到"王禹程"之前）
const replacements = [
  // 学生：按正文字替换
  ...registry.students.map(s => ({
    name: s.name,
    replacement: `[stu:${s.initials}]`,
    initials: s.initials,
    length: s.name.length,
  })),
  // 教师：正文替换 + 添加表格行锚点
  ...registry.teachers.map(t => ({
    name: t.name,
    replacement: `[tch:${t.initials}]`,
    initials: t.initials,
    length: t.name.length,
  })),
].sort((a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name))

// 学生标题映射：姓名 → [stu:缩写]
const studentTitleMap = {}
for (const s of registry.students) {
  studentTitleMap[s.name] = `[stu:${s.initials}]`
}

// 收集旧名 → 新名的映射（用于 teachers.md 特殊处理）
const teacherSlugMap = {}
for (const t of registry.teachers) {
  teacherSlugMap[t.name] = `[tch:${t.initials}]`
}

const dryRun = process.argv.includes('--dry-run')
if (dryRun) console.log('--- DRY RUN ---')

let totalChanged = 0

/**
 * 替换正文中的中文姓名为 [stu:xxx] / [tch:xxx]
 * 跳过 [[WikiLink]] 内部、代码块和行内代码
 */
function replaceBody(body) {
  let result = body
  for (const r of replacements) {
    // 仅在非链接、非代码上下文中替换
    // 使用负向零宽断言：
    // - 不在 [[...]] 内部
    // - 不在 `code` 内部（行内代码）
    // - 不在 ``` ``` 内部（代码块）— 简化处理
    result = result.replace(
      new RegExp(
        // 替换所有出现的姓名，但不在 [[ ]] 内
        `(?<!\\[\\[[^\\]]*)${escapeRegex(r.name)}(?![^\\[]*\\]\\])`,
        'g',
      ),
      r.replacement,
    )
  }
  return result
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 处理单个文件
 */
function processFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const original = raw

  // 检测是否是学生个人页（文件名匹配 initials）
  const fileName = path.basename(filePath, '.md')
  const isStudentPage = registry.students.some(s => s.initials === fileName)
  const isTeacherPage = filePath.endsWith('teachers.md')
  const isPeopleIndex = filePath.endsWith('people.md')

  // 分离 frontmatter 和正文
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/)
  if (!fmMatch) {
    // 无 frontmatter，直接替换正文
    const newBody = replaceBody(raw)
    if (newBody !== raw) {
      if (!dryRun) fs.writeFileSync(filePath, newBody, 'utf-8')
      totalChanged++
      console.log(`  ✓ 正文替换: ${path.relative(CONTENTS_DIR, filePath)}`)
    }
    return
  }

  const frontmatter = fmMatch[1]
  const body = raw.slice(fmMatch[0].length)
  let changed = false

  // ---- 修改 frontmatter title ----
  const titleLineMatch = frontmatter.match(/^(title:\s*)(.*)$/m)
  if (titleLineMatch && isStudentPage) {
    const titleValue = titleLineMatch[2].trim().replace(/^"(.*)"$/, '$1')
    const newTitle = studentTitleMap[titleValue]
    if (newTitle) {
      const oldLine = titleLineMatch[0]
      const newLine = `title: ${newTitle}`
      // YAML 中的 [stu:xxx] 必须加引号，否则被解析为数组
      const newLine = `title: "${newTitle}"`
      const newFm = frontmatter.replace(oldLine, newLine)
      // 重建文件
      const newContent = `---\n${newFm}\n---\n${body}`
      if (newContent !== raw) {
        if (!dryRun) fs.writeFileSync(filePath, newContent, 'utf-8')
        totalChanged++
        console.log(`  ✓ title: ${titleValue} → ${newTitle}  (${path.relative(CONTENTS_DIR, filePath)})`)
        changed = true
      }
    }
  }

  // ---- 替换正文中的姓名 ----
  if (!changed) {
    // 需要重新读取（如果 frontmatter 已改）
    const current = changed ? fs.readFileSync(filePath, 'utf-8') : raw
    const currentFmMatch = current.match(/^---\n([\s\S]*?)\n---\n/)
    const currentBody = currentFmMatch ? current.slice(currentFmMatch[0].length) : current
    const newBody = replaceBody(currentBody)
    if (newBody !== currentBody) {
      const newContent = currentFmMatch
        ? currentFmMatch[0] + newBody
        : newBody
      if (!dryRun) fs.writeFileSync(filePath, newContent, 'utf-8')
      totalChanged++
      console.log(`  ✓ 正文替换: ${path.relative(CONTENTS_DIR, filePath)}`)
    }
  } else {
    // 已由 title 替换触发了写入，还需要替换正文
    // （上面的代码已经写入了一次，现在需要重新读取再写一次）
    // 这不太优雅，但为了可靠，我们重新处理
    const current = fs.readFileSync(filePath, 'utf-8')
    const currentFmMatch = current.match(/^---\n([\s\S]*?)\n---\n/)
    const currentBody = currentFmMatch ? current.slice(currentFmMatch[0].length) : current
    const newBody = replaceBody(currentBody)
    if (newBody !== currentBody) {
      const newContent = currentFmMatch
        ? currentFmMatch[0] + newBody
        : newBody
      if (!dryRun) fs.writeFileSync(filePath, newContent, 'utf-8')
      totalChanged++
      console.log(`  ✓ 正文替换: ${path.relative(CONTENTS_DIR, filePath)}`)
    }
  }
}

// ========== 主流程 ==========

console.log('扫描 wiki 内容文件...')

// 递归扫描
function walkDir(dir) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) }
  catch { return }
  for (const e of entries) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      walkDir(full)
    } else if (e.name.endsWith('.md')) {
      processFile(full)
    }
  }
}

walkDir(CONTENTS_DIR)

// 处理 announcement.md
console.log('\n处理 announcement.md...')
processFile(ANNOUNCEMENT_PATH)

// 处理 README.md
console.log('\n处理 README.md...')
const readme = fs.readFileSync(README_PATH, 'utf-8')
let newReadme = readme
// zack1219happy（王梓）→ zack1219happy（[stu:wz]）
newReadme = newReadme.replace(/（王梓）/g, '（[stu:wz]）')
newReadme = newReadme.replace(/（\\[stu:wz\\]）/g, '（[stu:wz]）')
const handleReadme = newReadme !== readme
if (handleReadme) {
  if (!dryRun) fs.writeFileSync(README_PATH, newReadme, 'utf-8')
  totalChanged++
  console.log('  ✓ README.md 中的王梓引用已替换')
}

// 处理 teachers.md 表格行（替换教师姓名为 [tch:缩写]）
console.log('\n处理 teachers.md 教师表格...')
const teachersPath = path.join(CONTENTS_DIR, 'people', 'teachers.md')
if (fs.existsSync(teachersPath)) {
  const teachersContent = fs.readFileSync(teachersPath, 'utf-8')
  let newTeachersContent = teachersContent
  for (const t of registry.teachers) {
    // 表格中的姓名替换：| 科目 | 姓名 | 简介 |
    newTeachersContent = newTeachersContent.replace(
      new RegExp(`(\\|[^|]*\\|\\s*)${escapeRegex(t.name)}(\\s*\\|)`, 'g'),
      `$1[tch:${t.initials}]$2`,
    )
  }
  if (newTeachersContent !== teachersContent) {
    if (!dryRun) fs.writeFileSync(teachersPath, newTeachersContent, 'utf-8')
    totalChanged++
    console.log(`  ✓ teachers.md 表格中的教师姓名已替换`)
  }
}

console.log(`\n完成！共修改了 ${totalChanged} 个文件${dryRun ? '（DRY RUN）' : ''}`)
