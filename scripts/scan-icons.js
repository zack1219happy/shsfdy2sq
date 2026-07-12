/**
 * 构建时扫描 data/**\/*.md 中的 frontmatter icon 值，
 * 自动补全 src/lib/fa-icons.ts 的注册表（只添加不删除）。
 *
 * 用法：node scripts/scan-icons.js
 */

const fs = require('fs')
const path = require('path')

const CONTENTS_DIR = path.join(process.cwd(), 'data', 'wiki')
const AGREEMENT_DIR = path.join(process.cwd(), 'data', 'agreement')
const ICONS_FILE = path.join(process.cwd(), 'src', 'lib', 'fa-icons.ts')

// ---------- 工具 ----------

function cleanIconName(raw) {
  return raw
    .replace(/^fa[srb]?\s+/i, '')
    .replace(/^fa-/, '')
    .trim()
    .toLowerCase()
}

function toExportName(name) {
  return (
    'fa' +
    name
      .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      .replace(/^./, (s) => s.toUpperCase())
  )
}

function findIconPackage(exportName) {
  const solidFile = path.join(
    process.cwd(), 'node_modules', '@fortawesome', 'free-solid-svg-icons', `${exportName}.js`,
  )
  const brandsFile = path.join(
    process.cwd(), 'node_modules', '@fortawesome', 'free-brands-svg-icons', `${exportName}.js`,
  )
  if (fs.existsSync(solidFile)) return 'solid'
  if (fs.existsSync(brandsFile)) return 'brands'
  return null
}

// ---------- 扫描所有 .md 文件 ----------

function scanIconNames() {
  const names = new Set()
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!entry.name.endsWith('.md')) continue
      const m = fs.readFileSync(full, 'utf-8').match(/^---[\s\S]*?^icon:\s*(.+)$/m)
      if (m) {
        const clean = cleanIconName(m[1])
        if (clean) names.add(clean)
      }
    }
  }
  walk(CONTENTS_DIR)
  if (fs.existsSync(AGREEMENT_DIR)) walk(AGREEMENT_DIR)
  return [...names].sort()
}

// ---------- 读取当前已注册的图标 ----------

function readRegistered(content) {
  const set = new Set()
  // 匹配 register(faXxx) 和 register(faXxx) 以及 import { faXxx }
  const r = /register\(fa([A-Z][a-zA-Z0-9]*)\)/g
  let m
  while ((m = r.exec(content)) !== null) {
    const name = m[1]
      .replace(/^fa/, '')
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '')
    set.add(name)
  }
  return set
}

// ---------- 替换两个标记区间 ----------

const scanned = scanIconNames()
let content = fs.readFileSync(ICONS_FILE, 'utf-8')

const registered = readRegistered(content)
const missing = scanned.filter((name) => !registered.has(name))

if (missing.length === 0) {
  console.log('[scan-icons] 无新图标，无需更新')
  process.exit(0)
}

console.log(`[scan-icons] 发现 ${missing.length} 个未注册图标：`)

const newImports = []
const newRegisters = []

for (const name of missing) {
  const exportName = toExportName(name)
  const pkg = findIconPackage(exportName)

  if (!pkg) {
    console.warn(`  ⚠ 找不到 ${name}（solid / brands 中均不存在），跳过`)
    continue
  }

  const importPath =
    pkg === 'brands' ? '@fortawesome/free-brands-svg-icons' : '@fortawesome/free-solid-svg-icons'

  newImports.push(`import { ${exportName} } from '${importPath}'`)
  newRegisters.push(`register(${exportName})`)

  // 如果 CSS 类名不等于 iconName，需额外注册别名
  try {
    const mod = require(importPath)
    if (mod[exportName] && mod[exportName].iconName !== name) {
      newRegisters.push(`cssAlias(${exportName}, '${name}')`)
      console.log(`  ✅ ${name} → ${exportName} (${pkg}, +别名 ${name})`)
    } else {
      console.log(`  ✅ ${name} → ${exportName} (${pkg})`)
    }
  } catch {
    console.log(`  ✅ ${name} → ${exportName} (${pkg})`)
  }
}

if (newImports.length === 0) {
  console.log('[scan-icons] 没有可注册的图标')
  process.exit(0)
}

// 替换 AUTO-IMPORTS 区间
const IMPORTS_MARKER = '// >>> AUTO-IMPORTS >>>'
const IMPORTS_END = '// <<< AUTO-IMPORTS <<<'
content = content.replace(
  new RegExp(`${IMPORTS_MARKER}\\s*\\n[\\s\\S]*?\\n${IMPORTS_END}`),
  `${IMPORTS_MARKER}\n${newImports.join('\n')}\n${IMPORTS_END}`,
)

// 替换 AUTO-REGISTERS 区间
const REGS_MARKER = '// >>> AUTO-REGISTERS >>>'
const REGS_END = '// <<< AUTO-REGISTERS <<<'
content = content.replace(
  new RegExp(`${REGS_MARKER}\\s*\\n[\\s\\S]*?\\n${REGS_END}`),
  `${REGS_MARKER}\n${newRegisters.join('\n')}\n${REGS_END}`,
)

fs.writeFileSync(ICONS_FILE, content, 'utf-8')
console.log(`\n[scan-icons] ✅ ${ICONS_FILE} 已更新，新增 ${newImports.length} 个图标`)
