'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import FaIcon from '@/components/FaIcon'
import { fetchPlazaCategories } from '@/lib/gist-api'
import type { PlazaCategory, PlazaCategoryTreeNode } from '@/types/plaza'
import { buildCategoryTree } from '@/types/plaza'
import styles from '@/styles/forum.module.css'

/* ==============================================================
   CategoryPickerModal — 分类选择模态框

   功能：
   - 从数据库加载分类树
   - 顶部搜索框过滤（匹配分类名）
   - 树形浏览：文件夹可展开/折叠，叶子节点可选中
   - 点击遮罩或关闭按钮退出，选中项由 onConfirm 回调返回
   ============================================================== */

interface CategoryPickerModalProps {
  /** 外部传入的完整分类扁平列表（由调用方一次性加载，避免重复请求） */
  categories: PlazaCategory[]
  /** 当前已选中的分类名（可以是顶级或子级） */
  selectedName: string | null
  /** 用户确认选择，传递分类 ID 和名称 */
  onConfirm: (id: string, name: string) => void
  /** 关闭 */
  onClose: () => void
}

export default function CategoryPickerModal({
  categories,
  selectedName,
  onConfirm,
  onClose,
}: CategoryPickerModalProps) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [localSelected, setLocalSelected] = useState<string | null>(selectedName)

  // 初始展开所有有子节点的分支（方便浏览）
  useEffect(() => {
    const ids = new Set<string>()
    for (const cat of categories) {
      if (cat.parent_id === null && categories.some((c) => c.parent_id === cat.id)) {
        ids.add(cat.id)
      }
    }
    setExpanded(ids)
  }, [categories])

  // 根据搜索过滤，构建可见树
  const visibleTree = useMemo(() => {
    const fullTree = buildCategoryTree(categories)
    if (!search.trim()) return fullTree

    const q = search.toLowerCase()

    // 递归过滤：节点名匹配 或 有子孙匹配则保留
    function filterTree(nodes: PlazaCategoryTreeNode[]): PlazaCategoryTreeNode[] {
      const result: PlazaCategoryTreeNode[] = []
      for (const node of nodes) {
        const nameMatch = node.name.toLowerCase().includes(q)
        const filteredChildren = node.children.length > 0 ? filterTree(node.children) : []
        if (nameMatch || filteredChildren.length > 0) {
          result.push({ ...node, children: filteredChildren })
        }
      }
      return result
    }

    return filterTree(fullTree)
  }, [categories, search])

  // 搜索后自动展开所有可见分支
  useEffect(() => {
    if (!search.trim()) return
    const ids = new Set<string>()
    function collect(nodes: PlazaCategoryTreeNode[]) {
      for (const n of nodes) {
        if (n.children.length > 0) {
          ids.add(n.id)
          collect(n.children)
        }
      }
    }
    collect(visibleTree)
    setExpanded(ids)
  }, [search, visibleTree])

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelect = useCallback((name: string) => {
    setLocalSelected(name)
  }, [])

  const handleConfirm = useCallback(() => {
    if (localSelected) {
      const cat = categories.find((c) => c.name === localSelected)
      if (cat) onConfirm(cat.id, localSelected)
    }
    onClose()
  }, [localSelected, categories, onConfirm, onClose])

  // 判断一个节点是否叶子（无子节点）
  const isLeaf = useCallback(
    (node: PlazaCategoryTreeNode) => {
      return !categories.some((c) => c.parent_id === node.id)
    },
    [categories],
  )

  return (
    <div className={styles.catPickerOverlay} onClick={onClose}>
      <div className={styles.catPickerModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.catPickerHeader}>
          <h3>选择分类</h3>
          <button type="button" className={styles.catPickerClose} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.catPickerSearch}>
          <input
            type="text"
            placeholder="搜索分类…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.catPickerBody}>
          {visibleTree.length === 0 ? (
            <p className={styles.catPickerEmpty}>无匹配分类</p>
          ) : (
            visibleTree.map((node) => (
              <CategoryNode
                key={node.id}
                node={node}
                depth={0}
                expanded={expanded}
                selectedName={localSelected}
                isLeaf={isLeaf}
                onToggle={toggleExpand}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>

        {/* footer */}
        <div className={styles.visibilityModalFooter}>
          <span className={styles.visibilityModalHint}>
            {localSelected ? `已选: ${localSelected}` : '请选择一个分类'}
          </span>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleConfirm}
            disabled={!localSelected}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

/* ==============================================================
   CategoryNode — 递归渲染树节点
   ============================================================== */

function CategoryNode({
  node,
  depth,
  expanded,
  selectedName,
  isLeaf,
  onToggle,
  onSelect,
}: {
  node: PlazaCategoryTreeNode
  depth: number
  expanded: Set<string>
  selectedName: string | null
  isLeaf: (node: PlazaCategoryTreeNode) => boolean
  onToggle: (id: string) => void
  onSelect: (name: string) => void
}) {
  const leaf = isLeaf(node)
  const open = expanded.has(node.id)
  const selected = selectedName === node.name

  return (
    <>
      <div
        className={`${styles.catNode} ${selected ? styles.catNodeSelected : ''}`}
        style={{ paddingLeft: depth * 16 + 10 }}
        onClick={() => {
          if (leaf) {
            onSelect(node.name)
          } else {
            onToggle(node.id)
          }
        }}
      >
        {/* chevron */}
        <span
          className={`${styles.catNodeChevron} ${open && !leaf ? styles.catNodeChevronOpen : ''}`}
          style={{ visibility: leaf ? 'hidden' : 'visible' }}
        >
          <FaIcon name="chevron-right" />
        </span>

        {/* icon */}
        <span className={styles.catNodeIcon}>
          <FaIcon name={leaf ? 'file-lines' : open ? 'folder-open' : 'folder'} />
        </span>

        {/* name */}
        <span className={styles.catNodeName}>{node.name}</span>

        {/* check mark */}
        {selected && (
          <span className={styles.catNodeCheck}>
            <FaIcon name="check" />
          </span>
        )}
      </div>

      {/* children */}
      {open && !leaf && node.children.length > 0 && (
        <div className={styles.catChildren}>
          {node.children.map((child) => (
            <CategoryNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedName={selectedName}
              isLeaf={isLeaf}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </>
  )
}
