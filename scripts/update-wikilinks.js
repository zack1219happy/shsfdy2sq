/**
 * 将 [[中文名]] WikiLink 转换为 [[缩写]]
 * 例如 [[王梓]] → [[wz]]
 */
const fs = require('fs')
const path = require('path')

const registry = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'person-registry.json'), 'utf-8'),
)

// WikiLink 替换映射: 中文名 → initials
const linkMap = {}
for (const s of registry.students) linkMap[s.name] = s.initials
for (const t of registry.teachers) linkMap[t.name] = t.initials

let count = 0

function walk(dir) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) }
  catch { return }
  for (const e of entries) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      walk(full)
    } else if (e.name.endsWith('.md')) {
      let content = fs.readFileSync(full, 'utf-8')
      let changed = false
      for (const [name, initials] of Object.entries(linkMap)) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp('\\[\\[' + escaped + '\\]\\]', 'g')
        const before = content
        content = content.replace(regex, '[[' + initials + ']]')
        if (content !== before) changed = true
      }
      if (changed) {
        fs.writeFileSync(full, content, 'utf-8')
        console.log('  ✓ ' + path.relative(path.join(__dirname, '..', 'data', 'contents'), full))
        count++
      }
    }
  }
}

console.log('更新 WikiLink 引用...')
walk(path.join(__dirname, '..', 'data', 'contents'))
console.log('完成，修改了 ' + count + ' 个文件')
