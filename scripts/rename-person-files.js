/**
 * 将 data/wiki/people/ 下的学生页从全拼音重命名为缩写
 * 例如: wang-zi.md → wz.md
 */
const fs = require('fs')
const path = require('path')

const peopleDir = path.join(__dirname, '..', 'data', 'wiki', 'people')
const registryPath = path.join(__dirname, '..', 'data', 'person-registry.json')

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'))

// 建立 oldSlug 尾段 → initials 映射
const renameMap = {}
for (const student of registry.students) {
  const oldName = student.oldSlug.split('/').pop()
  renameMap[oldName] = student.initials
}

console.log('重命名映射:', renameMap)
console.log('---')

const files = fs.readdirSync(peopleDir)
let renamed = 0

for (const file of files) {
  if (!file.endsWith('.md')) continue
  const basename = file.replace(/\.md$/, '')
  const newBasename = renameMap[basename]
  if (!newBasename) {
    console.log(`⏭ 跳过: ${file}（不在重命名映射中）`)
    continue
  }
  const newFile = newBasename + '.md'
  if (file === newFile) {
    console.log(`⏭ 已是最新: ${file}`)
    continue
  }
  const oldPath = path.join(peopleDir, file)
  const newPath = path.join(peopleDir, newFile)
  if (fs.existsSync(newPath)) {
    console.error(`⚠ 目标已存在: ${newFile}，跳过 ${file}`)
    continue
  }
  fs.renameSync(oldPath, newPath)
  console.log(`✓ ${file} → ${newFile}`)
  renamed++
}

console.log(`---\n完成，重命名了 ${renamed} 个文件`)
