/**
 * Font Awesome 图标注册表
 * 只导入实际用到的图标，Tree-shaking 自动剔除未使用的
 */
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faArrowDown,
  faArrowUp,
  faBars,
  faBullhorn,
  faBuilding,
  faCalendarAlt,
  faCheck,
  faChevronLeft,
  faChevronRight,
  faCopy,
  faEye,
  faFileLines,
  faFolder,
  faFolderOpen,
  faGavel,
  faHome,
  faMapMarkedAlt,
  faPen,
  faSpinner,
  faSyncAlt,
  faTimes,
  faUser,
  faUsers,
} from '@fortawesome/free-solid-svg-icons'
import { faMarkdown } from '@fortawesome/free-brands-svg-icons'

/** 所有已注册的图标，key = 去掉前缀后的图标名（如 "user"） */
const registry = new Map<string, IconDefinition>()

function register(def: IconDefinition) {
  // def.iconName 已经是 camelCase 格式，如 "arrow-up" → "arrow-up"
  registry.set(def.iconName, def)
}

register(faArrowDown)
register(faArrowUp)
register(faBars)
register(faBullhorn)
register(faBuilding)
register(faCalendarAlt)
register(faCheck)
register(faChevronLeft)
register(faChevronRight)
register(faCopy)
register(faEye)
register(faFileLines)
register(faFolder)
register(faFolderOpen)
register(faGavel)
register(faHome)
register(faMapMarkedAlt)
register(faMarkdown)
register(faPen)
register(faSpinner)
register(faSyncAlt)
register(faTimes)
register(faUser)
register(faUsers)

/**
 * 将 CSS 类名字符串解析为 IconDefinition
 *
 * 接受格式：
 *   "fas fa-user"
 *   "user"
 *   "fa-home"
 */
export function resolveIcon(name: string): IconDefinition | undefined {
  // 去掉 "fas" "far" "fab" "fa-" 前缀
  const clean = name
    .replace(/^fa[srb]?\s+/i, '')
    .replace(/^fa-/, '')
    .trim()

  return registry.get(clean)
}
