import { test, expect } from '@playwright/test'
import { formatNotificationSummary, getNotificationTarget } from '../src/lib/notification-text'

test.describe('通知摘要', () => {
  test('评论摘要包含发送人、目标标题和消息', () => {
    const summary = formatNotificationSummary({
      from_username: 'sample-user',
      page: 'forum/00000000-0000-0000-0000-000000000001',
      excerpt: '我也遇到了这个问题',
      type: 'forum_reply',
      target_title: '如何准备期末考试',
    })

    expect(summary).toBe('示例用户在帖子《如何准备期末考试》下回复了你：我也遇到了这个问题')
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
})
