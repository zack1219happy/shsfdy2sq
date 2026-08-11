import { test, expect, type Page } from '@playwright/test'

// ── 真实测试账户（通过 UI 登录表单建立真实 Supabase auth session，RPC 的 auth.uid() 生效）──
const TEST_USER = { username: 'test', pwd: '123456' }
const ADMIN_USER = { username: 'Irade-tqy', pwd: 'Tong20111030' }

/** 通过 UI 登录表单真实登录 */
async function loginAs(page: Page, { username, pwd }: { username: string; pwd: string }) {
  await page.goto('/')
  await page.locator('#auth-name').fill(username)
  await page.locator('#auth-cred').fill(pwd)
  await page.getByRole('button', { name: /登\s*录/ }).click()
  // 等待登录完成：登录表单消失（AuthGate 渲染出会话内容）
  await expect(page.locator('#auth-name')).toBeHidden({ timeout: 20000 })
}

test.describe('#0031 标签投稿（积分商城内投稿 + 审核）', () => {
  test('商城页底部有投稿入口，打开 modal 后正常提交校验', async ({ page }) => {
    await loginAs(page, TEST_USER)
    await page.goto('/user/shop')
    await page.waitForLoadState('networkidle')

    // 入口在积分商城底部
    const btn = page.getByRole('button', { name: /没有想要的标签？投稿一个/ })
    await expect(btn).toBeVisible()
    await btn.click()
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

    // 边界：恰好 7 个中文字符（中文算 1）→ 字数校验通过，但价格 0 → 报价格错误（证明未触发字数拦截）
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

  test('普通用户看不到待审核投稿（商城内无同意/驳回按钮）', async ({ page }) => {
    await loginAs(page, TEST_USER)
    await page.goto('/user/shop')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: /驳回/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /同意/ })).toHaveCount(0)
    // 商城底部仍有投稿入口
    await expect(page.getByRole('button', { name: /没有想要的标签？投稿一个/ })).toBeVisible()
  })

  test('完整流程：普通用户投稿 → 管理员在商城内看到待审核卡片并驳回清理', async ({ page }) => {
    const tagText = 'e2e验证' + (Date.now() % 100000)

    // ── test 提交投稿 ──
    await loginAs(page, TEST_USER)
    await page.goto('/user/shop')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /没有想要的标签？投稿一个/ }).click()
    await page.getByPlaceholder('例如：常年睡不醒').fill(tagText)
    await page.getByPlaceholder('例如：200').fill('66')
    await page.getByRole('button', { name: '提交审核' }).click()
    await expect(page.getByText(/投稿成功/)).toBeVisible()
    await page.getByRole('button', { name: '完成' }).click()

    // ── 管理员登录商城，看到该待审核商品卡片（样式同普通商品，按钮为同意/驳回）──
    await loginAs(page, ADMIN_USER)
    await page.goto('/user/shop')
    await page.waitForLoadState('networkidle')
    const card = page.locator('[data-pending-sub]', { hasText: tagText })
    await expect(card).toBeVisible()
    await expect(card.getByRole('button', { name: '驳回' })).toBeVisible()
    await expect(card.getByRole('button', { name: '同意' })).toBeVisible()
    // 卡片价格显示
    await expect(card.getByText('66')).toBeVisible()

    // 驳回 → 卡片从商城消失（清理测试数据）
    await card.getByRole('button', { name: '驳回' }).click()
    await expect(card).toHaveCount(0)
  })
})

test.describe('#0035 bug2 论坛列表去点踩', () => {
  test('论坛置顶帖正常渲染且列表无点踩图标', async ({ page }) => {
    await loginAs(page, TEST_USER)
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
    await loginAs(page, TEST_USER)
    await page.goto('/user/mypage?user=zyj')
    await page.waitForLoadState('networkidle')
    // 页面加载成功，渲染出用户名
    await expect(page.getByText('AC万岁！')).toBeVisible()
  })
})

test.describe('#0035 bug3 沙箱安全模式', () => {
  test('sandbox 代码块在安全模式正常显示源码（阅读原文）', async ({ page }) => {
    await loginAs(page, TEST_USER)
    await page.goto('/plaza/post?slug=' + encodeURIComponent('关于贪吃蛇-msg8iops'))
    await page.waitForLoadState('networkidle')

    // 安全模式 sandbox 代码块存在
    await expect(page.locator('.sandbox-box .code-block-wrapper pre code').first()).toBeVisible()
    // 原文里的 &lt; &gt; 等实体应被解码成真实字符（< >），而非显示字面的 &lt;
    const codeText = await page.locator('.sandbox-box .code-block-wrapper pre code').first().innerText()
    expect(codeText).toContain('DOCTYPE')
    expect(codeText).not.toContain('&lt;')
  })
})

test.describe('#0036 洛谷折叠框', () => {
  test('编辑器工具栏有折叠框按钮', async ({ page }) => {
    await loginAs(page, TEST_USER)
    await page.goto('/forum/new')
    await page.waitForLoadState('networkidle')
    const collapseBtn = page.getByTitle('插入折叠框')
    await expect(collapseBtn).toBeVisible()
  })

  test('点击折叠框按钮弹出模板选择，选洛谷后插入洛谷模板', async ({ page }) => {
    await loginAs(page, TEST_USER)
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
