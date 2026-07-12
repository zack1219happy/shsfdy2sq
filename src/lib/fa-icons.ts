/**
 * Font Awesome 图标注册表
 * 只导入实际用到的图标，Tree-shaking 自动剔除未使用的
 */
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faArrowDown,
  faArrowUp,
  faBars,
  faBell,
  faBook,
  faBullhorn,
  faBuilding,
  faCalendarAlt,
  faCheck,
  faChevronLeft,
  faChevronRight,
  faComments,
  faCopy,
  faDice,
  faEye,
  faFileLines,
  faFolder,
  faFolderOpen,
  faGavel,
  faHome,
  faKey,
  faMapMarkedAlt,
  faPen,
  faPlus,
  faReply,
  faSchool,
  faSearch,
  faSignOutAlt,
  faSpinner,
  faStar,
  faSyncAlt,
  faThumbsDown,
  faThumbsUp,
  faTimes,
  faUser,
  faUsers,
} from '@fortawesome/free-solid-svg-icons'
import { faMarkdown } from '@fortawesome/free-brands-svg-icons'

// >>> AUTO-IMPORTS >>>（由 scripts/scan-icons.js 自动管理，请勿手动修改）
// <<< AUTO-IMPORTS <<<

/** 所有已注册的图标，key = 去掉前缀后的图标名（如 "user"） */
const registry = new Map<string, IconDefinition>()

function register(def: IconDefinition) {
  registry.set(def.iconName, def)
}

/**
 * 为图标注册 CSS 类名别名
 * FA v6+ 重命名了一批图标（如 faSyncAlt → iconName: "rotate"），
 * 但 CSS 类名仍兼容旧名 "fa-sync-alt"，需要额外注册一次。
 */
function cssAlias(def: IconDefinition, cssName: string) {
  registry.set(cssName, def)
}

register(faArrowDown)
register(faArrowUp)
register(faBars)
register(faBell)
register(faBook)
register(faBullhorn)
register(faBuilding)
register(faCalendarAlt)
cssAlias(faCalendarAlt, 'calendar-alt')
register(faCheck)
register(faChevronLeft)
register(faChevronRight)
register(faComments)
register(faCopy)
register(faDice)
register(faEye)
register(faFileLines)
register(faFolder)
register(faFolderOpen)
register(faGavel)
register(faHome)
cssAlias(faHome, 'home')
register(faKey)
register(faMapMarkedAlt)
cssAlias(faMapMarkedAlt, 'map-marked-alt')
register(faMarkdown)
register(faPen)
register(faPlus)
register(faReply)
register(faSchool)
register(faSearch)
cssAlias(faSearch, 'search')
register(faSignOutAlt)
cssAlias(faSignOutAlt, 'sign-out-alt')
register(faSpinner)
register(faStar)
register(faSyncAlt)
cssAlias(faSyncAlt, 'sync-alt')
register(faThumbsDown)
register(faThumbsUp)
register(faTimes)
cssAlias(faTimes, 'times')
register(faUser)
register(faUsers)

// >>> AUTO-REGISTERS >>>（由 scripts/scan-icons.js 自动管理，请勿手动修改）
// <<< AUTO-REGISTERS <<<

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
