// Playwright 不像 Next 那样自动读 .env.local。
// 渲染管线里的 supabase 客户端在模块加载时就要读环境变量，
// 所以测试文件第一行先引入这个副作用模块。
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })
