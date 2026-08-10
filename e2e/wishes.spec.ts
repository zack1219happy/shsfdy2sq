import { test, expect } from '@playwright/test'

// ── 会话注入：模拟已登录用户（避免走真实密码登录）──
const ZYJ_SESSION = {
  userId: '1bbb8b69-c724-46b9-97b5-9616493383c9',
  username: 'zyj',
  studentId: '20272070',
  name: '周义畯',
  role: 'user',
  loginTime: new Date().toISOString(),
}

const ADMIN_SESSION = {
  userId: 'e7da1be9-29f3-41d6-a44a-e40b143c75f5',
  username: 'Irade-tqy',
  studentId: '20272061',
  name: '童麒宇',
  role: 'super_admin',
  loginTime: new Date().toISOString(),
}

async function loginAs(page, session) {
  await page.addInitScript((sess) => {
    window.localStorage.setItem('wiki_session', JSON.stringify(sess))
    window.dispatchEvent(new CustomEvent('user-session-changed'))
  }, session)
}

test.describe('#0031 标签投稿', () => {
  test('名称装扮页底部有投稿入口，打开 modal 后正常提交校验', async ({ page }) => {
    await loginAs(page, ZYJ_SESSION)
    await page.goto('/user/appearance')

    // 入口存在
    const btn = page.getByRole('button', { name: /没有想要的标签？投稿一个/ })
    await expect(btn).toBeVisible()
    await btn.click()

    // modal 出现
    await expect(page.getByRole('heading', { name: /投稿一个/ })).toBeVisible()

    // 空文字 → 提交拦截
    await page.getByPlaceholder('例如：常年睡不醒').fill('')
    await page.getByRole('button', { name: '提交审核' }).click()
    await expect(page.getByText('请输入标签文字')).toBeVisible()

    // 超 7 字 → 拒绝
    await page.getByPlaceholder('例如：常年睡不醒').fill('一二三四五六七八')
    await page.getByRole('button', { name: '提交审核' }).click()
    await expect(page.getByText('标签最多 7 个字')).toBeVisible()

    // 价格非正 → 拒绝
    await page.getByPlaceholder('例如：常年睡不醒').fill('测试标签')
    await page.getByPlaceholder('例如：200').fill('0')
    await page.getByRole('button', { name: '提交审核' }).click()
    await expect(page.getByText('请输入正整数价格')).toBeVisible()

    // 边界：恰好 7 个中文字符（中文算 1 个）→ 字数校验通过，但价格 0 → 报价格错误（证明未触发字数拦截）
    await page.getByPlaceholder('例如：常年睡不醒').fill('一二三四五六七')
    await page.getByPlaceholder('例如：200').fill('0')
    await page.getByRole('button', { name: '提交审核' }).click()
    await expect(page.getByText('请输入正整数价格')).toBeVisible()

    // 边界：8 个中文字符 → 拒绝（字数拦截）
    await page.getByPlaceholder('例如：常年睡不醒').fill('一二三四五六七八')
    await page.getByPlaceholder('例如：200').fill('50')
    await page.getByRole('button', { name: '提交审核' }).click()
    await expect(page.getByText('标签最多 7 个字')).toBeVisible()
  })

  test('对抗：未建立 Supabase auth 时提交被拒绝且给出清晰错误（不崩溃）', async ({ page }) => {
    await loginAs(page, ZYJ_SESSION)
    await page.goto('/user/appearance')
    await page.getByRole('button', { name: /没有想要的标签？投稿一个/ }).click()

    // 合法输入但无 Supabase auth session → 后端 RPC 拒绝
    await page.getByPlaceholder('例如：常年睡不醒').fill('e2e对抗测试')
    await page.getByPlaceholder('例如：200').fill('88')
    await page.getByRole('button', { name: '提交审核' }).click()

    // 不崩溃，显示未登录/权限错误
    await expect(page.getByText(/未登录|无权限|请先登录/)).toBeVisible()
  })
})

test.describe('#0035 bug2 论坛列表去点踩', () => {
  test('论坛置顶帖正常渲染且列表无点踩图标', async ({ page }) => {
    await loginAs(page, ZYJ_SESSION)
    await page.goto('/forum')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: '讨论区' })).toBeVisible()
    // 置顶帖区域存在（"N 个置顶"）
    await expect(page.getByText(/个置顶/)).toBeVisible()
    // 列表无点踩图标（也不应有点赞图标，只保留净分数字）
    const downIcons = await page.locator('svg[data-icon="thumbs-down"], .fa-thumbs-down').count()
    expect(downIcons).toBe(0)
  })
})

test.describe('#0035 bug1 渐变名字兜底', () => {
  test('个人主页名字正常渲染', async ({ page }) => {
    await loginAs(page, ZYJ_SESSION)
    await page.goto('/user/mypage?user=zyj')
    await page.waitForLoadState('networkidle')
    // 页面加载成功，渲染出用户名（UserName 组件显示 username=zyj）
    await expect(page.getByText('AC万岁！')).toBeVisible()
  })
})

test.describe('#0035 bug3 沙箱安全模式', () => {
  test('sandbox 代码块在安全模式正常显示源码（阅读原文）', async ({ page }) => {
    await loginAs(page, ZYJ_SESSION)
    await page.goto('/plaza/post?slug=' + encodeURIComponent('关于贪吃蛇-msg8iops'))
    await page.waitForLoadState('networkidle')

    // 安全模式 sandbox 代码块存在
    await expect(page.locator('.sandbox-box .code-block-wrapper pre code').first()).toBeVisible()
    // 代码块内容是 HTML 转义的源码（浏览器渲染成真实字符），应包含 DOCTYPE 而非乱码
    const codeText = await page.locator('.sandbox-box .code-block-wrapper pre code').first().innerText()
    expect(codeText).toContain('DOCTYPE')
  })
})

test.describe('#0036 洛谷折叠框', () => {
  test('编辑器工具栏有折叠框按钮', async ({ page }) => {
    await loginAs(page, ZYJ_SESSION)
    await page.goto('/forum/new')
    await page.waitForLoadState('networkidle')
    const collapseBtn = page.getByTitle('插入折叠框')
    await expect(collapseBtn).toBeVisible()
  })

  test('点击折叠框按钮弹出模板选择，选洛谷后插入洛谷模板', async ({ page }) => {
    await loginAs(page, ZYJ_SESSION)
    await page.goto('/forum/new')
    await page.waitForLoadState('networkidle')

    // 打开折叠框 dialog
    await page.getByTitle('插入折叠框').click()
    await expect(page.getByText('模板')).toBeVisible()

    // dialog 区域：含"标题"label 的输入框（定位 dialog 内）
    const dialog = page.locator('[role="dialog"]')
    // 选择洛谷
    await dialog.locator('select').first().selectOption('luogu')
    // 填标题（dialog 内最后一个 text input）
    await dialog.locator('input[type="text"]').last().fill('对抗测试')
    // 确认
    await dialog.getByRole('button', { name: /确定/ }).click()

    // 编辑器（CodeMirror）应包含洛谷模板
    const editorText = await page.locator('.cm-content').first().innerText()
    expect(editorText).toContain('::::info[对抗测试]')
    expect(editorText).toContain('内容')
    expect(editorText).toContain('::::')
  })
})

test.describe('#0031 管理端标签投稿审核', () => {
  test('admin 能看到标签投稿 tab', async ({ page }) => {
    await loginAs(page, ADMIN_SESSION)
    await page.goto('/admin/revisions')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: /标签投稿/ })).toBeVisible()
  })
})
