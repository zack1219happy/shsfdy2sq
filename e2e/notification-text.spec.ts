import { test, expect } from '@playwright/test'
import {
  formatNotificationSummary,
  getModerationNotificationHref,
  getNotificationTarget,
} from '../src/lib/notification-text'

test.describe('通知摘要', () => {
  test('评论摘要包含发送人、目标标题和消息', () => {
    const summary = formatNotificationSummary({
      from_username: 'sample-user',
      page: 'forum/00000000-0000-0000-0000-000000000001',
      excerpt: '我也遇到了这个问题',
      type: 'forum_reply',
      target_title: '如何准备期末考试',
    })

    expect(summary).toBe('sample-user在帖子《如何准备期末考试》下回复了你：我也遇到了这个问题')
  })

  test('奖励摘要保留系统来源和原始消息', () => {
    const summary = formatNotificationSummary({
      from_username: null,
      page: 'forum/post?id=00000000-0000-0000-0000-000000000001',
      excerpt: '你的论坛帖子「如何准备期末考试」获得 30 积分奖励！',
      type: 'forum_own_post',
      target_title: '如何准备期末考试',
    })

    expect(summary).toBe('系统：你的论坛帖子「如何准备期末考试」获得 30 积分奖励！')
  })

  test('投币摘要保留已有的奖励人、标题和金额', () => {
    const summary = formatNotificationSummary({
      from_username: 'sample-user',
      page: 'plaza/summer-romance-ch1',
      excerpt: '示例用户给你的文章「夏日恋歌」投了 10 积分！',
      type: 'forum_own_post',
      target_title: '夏日恋歌',
    })

    expect(summary).toBe('示例用户给你的文章「夏日恋歌」投了 10 积分！')
  })

  test('旧通知页面格式会解析成可跳转的规范目标', () => {
    expect(getNotificationTarget('plaza/post?slug=hello-world')).toEqual({
      kind: 'plaza',
      key: 'hello-world',
      canonicalPage: 'plaza/hello-world',
    })
  })

  test('待审通知摘要说明提交内容', () => {
    const summary = formatNotificationSummary({
      from_username: '审核者',
      page: 'admin/revisions?id=00000000-0000-0000-0000-000000000001',
      excerpt: '校园介绍',
      type: 'wiki_revision_pending',
      target_title: null,
    })

    expect(summary).toBe('审核者提交了页面编辑待审核：校园介绍')

    expect(formatNotificationSummary({
      from_username: '审核者',
      page: 'admin/revisions?tab=requests&rid=00000000-0000-0000-0000-000000000004',
      excerpt: '校园地图',
      type: 'wiki_page_request_pending',
      target_title: null,
    })).toBe('审核者申请新建页面待审核：校园地图')

    expect(formatNotificationSummary({
      from_username: '审核者',
      page: 'user/shop?submission=00000000-0000-0000-0000-000000000005',
      excerpt: '新标签',
      type: 'tag_submission_pending',
      target_title: null,
    })).toBe('审核者申请创建标签：新标签')
  })

  test('新许愿通知展示编号且不依赖联系人信息', () => {
    const summary = formatNotificationSummary({
      from_username: null,
      page: 'wishes/00000000-0000-0000-0000-000000000002',
      excerpt: '新许愿待查看',
      type: 'wish_new',
      target_title: '许愿 #0004',
    })

    expect(summary).toBe('系统提交了新的许愿：许愿 #0004')
  })

  test('审核通知跳转到受支持的审核项，并拒绝其他地址', () => {
    const id = '00000000-0000-0000-0000-000000000003'

    expect(getModerationNotificationHref(
      'wiki_revision_pending',
      `admin/revisions?id=${id}`,
      '/shsfdy2sq',
      123,
    )).toBe(`/shsfdy2sq/admin/revisions?id=${id}&_=123`)
    expect(getModerationNotificationHref(
      'wiki_page_request_pending',
      `admin/revisions?tab=requests&rid=${id}`,
      '/shsfdy2sq',
      123,
    )).toBe(`/shsfdy2sq/admin/revisions?tab=requests&rid=${id}&_=123`)
    expect(getModerationNotificationHref(
      'tag_submission_pending',
      `user/shop?submission=${id}`,
      '/shsfdy2sq',
      123,
    )).toBe(`/shsfdy2sq/user/shop?submission=${id}&_=123`)
    expect(getModerationNotificationHref(
      'tag_submission_pending',
      'https://example.invalid/',
      '/shsfdy2sq',
      123,
    )).toBeUndefined()
  })
})
