import './_env'
import { test, expect } from '@playwright/test'
import { resolveEmoji } from '../src/lib/emoji/resolve'
import { extractExistingMentions } from '../src/lib/md-plugins/mention'
import { checkNameError } from '../src/components/EmojiDialogHost'
import { stripEmojiSyntax, renderMarkdown } from '../src/lib/markdown'
import { formatNotificationSummary, getNotificationTarget } from '../src/lib/notification-text'
import { insideCode } from '../src/components/MarkdownEditor/completions'
import { EMPTY_LIBRARY, type EmojiItem, type EmojiLibrary } from '../src/lib/emoji/types'

/* ---------- 测试夹具：两个用户各自独立的库 ---------- */

const A_ITEMS: EmojiItem = {
  id: 'a1', name: '赞', url: 'https://x/a.png', hash: 'hash-a',
  pack: 'A包', pack_id: 'pa', pack_source_name: 'A包', source_user_id: 'userA', banned: false,
}
const A_LOOSE: EmojiItem = {
  id: 'a2', name: '耶', url: 'https://x/a2.png', hash: 'hash-a2',
  pack: null, pack_id: null, pack_source_name: null, source_user_id: 'userA', banned: false,
}
const LIB_A: EmojiLibrary = {
  emojis: [A_LOOSE],
  packs: [{
    id: 'pa', name: 'A包', source_name: 'A包', source_user_id: 'userA',
    subscription_id: null, subscribed: false, emojis: [A_ITEMS], subscribers: 0,
    created_at: '2026-01-01T00:00:00Z',
  }],
}
// B 自己也有一个叫「赞」的表情，与 A 的同名不同图
const LIB_B: EmojiLibrary = {
  emojis: [{
    id: 'b1', name: '赞', url: 'https://x/b.png', hash: 'hash-b',
    pack: null, pack_id: null, pack_source_name: null, source_user_id: 'userB', banned: false,
  }],
  packs: [],
}

test.describe('表情解析 — 按内容作者身份，同名各解各的', () => {
  test('单名只在散表情里找', () => {
    expect(resolveEmoji(LIB_A, '耶', null)?.url).toBe('https://x/a2.png')
    expect(resolveEmoji(LIB_A, '赞', null)).toBeNull()
  })

  test('两段式在包里找', () => {
    expect(resolveEmoji(LIB_A, '赞', 'A包')?.url).toBe('https://x/a.png')
    expect(resolveEmoji(LIB_A, '赞', '不存在')).toBeNull()
  })

  test('同名表情在不同人的库里解成不同图', () => {
    expect(resolveEmoji(LIB_A, '赞', 'A包')?.url).toBe('https://x/a.png')
    expect(resolveEmoji(LIB_B, '赞', null)?.url).toBe('https://x/b.png')
  })

  test('库未就绪（null）一律不解析', () => {
    expect(resolveEmoji(null, '赞', 'A包')).toBeNull()
  })

  test('禁用标记随库数据带出，供渲染成占位符', () => {
    const banned = { ...A_ITEMS, banned: true }
    const lib: EmojiLibrary = { ...EMPTY_LIBRARY, packs: [{ ...LIB_A.packs[0], emojis: [banned] }] }
    expect(resolveEmoji(lib, '赞', 'A包')?.banned).toBe(true)
  })
})

test.describe('@ 提及解析 — 与数据库端同一套规则', () => {
  const known = new Set(['Irade-tqy', 'cxy'])

  test('用户名白名单决定渲染与否', () => {
    expect(extractExistingMentions('你好 @cxy 和 @nobody', known)).toEqual(['cxy'])
  })

  test('邮箱、代码里的 @ 不算提及', () => {
    expect(extractExistingMentions('联系 a@cxy.com 别 @', known)).toEqual([])
    expect(extractExistingMentions('`行内 @cxy` 和 @cxy', known)).toEqual(['cxy'])
    expect(extractExistingMentions('```js\nconst a = "@cxy"\n```\n@cxy', known)).toEqual(['cxy'])
  })

  test('同一条内容里重复 @ 只算一次，且按出现顺序', () => {
    expect(extractExistingMentions('@cxy 再 @cxy，还有 @Irade-tqy', known)).toEqual(['cxy', 'Irade-tqy'])
  })

  test('标识符中间的 @ 不算', () => {
    expect(extractExistingMentions('user@cxy', known)).toEqual([])
  })
})

test.describe('编辑器补全的代码上下文', () => {
  test('围栏与行内代码里不弹补全', () => {
    const doc = '普通文字\n\n```js\nconst a = 1\n```\n\n行内 `code` 结束'
    expect(insideCode(doc, doc.indexOf('const a'))).toBe(true)
    expect(insideCode(doc, doc.indexOf('普通文字'))).toBe(false)
    expect(insideCode('行内 `ab` 之后', 8)).toBe(false)
    expect(insideCode('行内 `ab', 5)).toBe(true)
  })
})

test.describe('表情 / 表情包命名规则', () => {
  test('空、首尾空格、超长、半角标点一律拒绝', () => {
    expect(checkNameError('')).toBeTruthy()
    expect(checkNameError(' 赞')).toBeTruthy()
    expect(checkNameError('x'.repeat(21))).toBeTruthy()
    for (const bad of ['a:b', 'a(b', 'a)b', 'a{b', 'a}b']) {
      expect(checkNameError(bad), bad).toBeTruthy()
    }
    expect(checkNameError('tqy大佬')).toBe('')
  })

  test('撞了自己的名字拒绝入库', () => {
    expect(checkNameError('赞', ['赞'])).toContain('已经在你的表情库里')
    expect(checkNameError('赞', ['耶'])).toBe('')
  })
})

test.describe('摘要与旧内容兼容', () => {
  test('通知摘要纯文字：花括号剥掉只留名字', () => {
    expect(stripEmojiSyntax('看这个 {tqy大佬:膜拜童王} 还有 {赞}')).toBe('看这个 膜拜童王 还有 赞')
  })

  test('没有作者身份时表情语法原样保留（wiki / 公告）', () => {
    expect(renderMarkdown('正文 {赞}', { highlight: false, texmath: false }).includes('{赞}')).toBe(true)
  })
})

test.describe('提及 / 表情包通知文案与跳转', () => {
  test('首次提及与编辑后提及文案区分', () => {
    expect(formatNotificationSummary({
      from_username: 'sample-user', page: 'plaza/my-slug', excerpt: '正文片段',
      type: 'mention', target_title: '我的文章',
    })).toBe('sample-user在文章《我的文章》里提到了你：正文片段')

    expect(formatNotificationSummary({
      from_username: 'sample-user', page: 'forum/00000000-0000-0000-0000-000000000001', excerpt: '正文',
      type: 'mention_edit', target_title: '帖子标题',
    })).toBe('sample-user编辑了帖子《帖子标题》，再次提到了你：正文')
  })

  test('公告 / 私信 / 表情包通知都能定位到目标', () => {
    expect(getNotificationTarget('agreement/community-guidelines')?.kind).toBe('agreement')
    expect(getNotificationTarget('dm/00000000-0000-0000-0000-000000000009')?.kind).toBe('dm')
    expect(getNotificationTarget('emoji')?.kind).toBe('emoji')
  })

  test('摘要纯文字进通知', () => {
    expect(formatNotificationSummary({
      from_username: null, page: 'emoji', excerpt: '你订阅的表情包《tqy大佬》已被删除',
      type: 'emoji_pack_deleted', target_title: null,
    })).toBe('你订阅的表情包《tqy大佬》已被删除')
  })
})
