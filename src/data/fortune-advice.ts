/**
 * 运势抽卡 — 宜/忌池
 *
 * 按领域分组，每张卡随机抽 2 宜 + 2 忌
 * 每条 advice 包含一句话 + 一行具体解释
 */
export type FortuneDomain = 'exam' | 'school' | 'weekend' | 'holiday'

export const domainLabels: Record<FortuneDomain, string> = {
  exam: '📝 考试日',
  school: '🏫 在校',
  weekend: '🌿 周末',
  holiday: '☀️ 放假',
}

export interface AdviceItem {
  type: '宜' | '忌'
  text: string
  detail: string
}

export const advicePool: Record<FortuneDomain, AdviceItem[]> = {
  // ═══════════════════ 考试日 ═══════════════════
  exam: [
    // — wiki 相关 —
    { type: '宜', text: '想想周爽都熬过来了', detail: '跟周爽相比，统考其实也没那么可怕' },
    { type: '忌', text: '考场上想起 wiki 上的八卦', detail: '集中注意力，考完再去看罗森八卦不迟' },
    // — 原有 —
    { type: '宜', text: '先易后难，稳扎稳打', detail: '简单题全拿分，难题能写多少写多少' },
    { type: '宜', text: '做完检查三遍', detail: '第一遍查漏做，第二遍查计算，第三遍查涂卡' },
    { type: '宜', text: '写满不留白', detail: '大题写了就有分，空着老师想给都给不了' },
    { type: '宜', text: '相信第一感觉', detail: '除非确定错了，否则别改选择题答案' },
    { type: '宜', text: '深呼吸再动笔', detail: '先花 30 秒平静下来，思路会更清晰' },
    { type: '宜', text: '合理分配时间', detail: '小题快做，大题多花时间，别倒置了' },
    { type: '宜', text: '认真审题三遍', detail: '题目问什么你答什么，别答非所问' },
    { type: '宜', text: '带齐文具证件', detail: '2B 铅笔、黑色水笔、直尺、圆规、准考证' },
    { type: '宜', text: '考一科忘一科', detail: '考完不对答案，全力准备下一门' },
    { type: '宜', text: '字迹工整清晰', detail: '阅卷老师看着舒服，多给你一分是一分' },
    { type: '宜', text: '先做有把握的题', detail: '拿稳能拿的分，建立信心再攻坚' },
    { type: '宜', text: '选择题做完就涂卡', detail: '不要等到最后，时间不够就来不及了' },
    { type: '宜', text: '留时间检查计算', detail: '数学物理算错了比不会做更可惜' },
    { type: '宜', text: '作文列提纲再写', detail: '花 3 分钟列提纲，文章结构清晰多了' },
    { type: '宜', text: '英语听力前先浏览题目', detail: '提前知道要听什么，正确率翻倍' },
    { type: '宜', text: '早起半小时再翻翻笔记', detail: '考前瞬时记忆真的很管用' },
    { type: '宜', text: '吃个鸡蛋再去考场', detail: '蛋白质顶饿，不会考到一半肚子叫' },
    { type: '宜', text: '带一瓶水', detail: '紧张的时候喝一小口，压压惊' },
    { type: '宜', text: '在草稿纸上写清楚步骤', detail: '检查时一眼就能看出哪里算错了' },
    { type: '宜', text: '考完不对答案', detail: '对了影响心态，不对憋得难受，何必呢' },
    { type: '忌', text: '在一道题上死磕', detail: '卡了五分钟还没思路就先跳过去' },
    { type: '忌', text: '提前交卷', detail: '剩下的时间足够查出三个错误' },
    { type: '忌', text: '偷瞄别人的卷子', detail: '被发现了可是要记过的' },
    { type: '忌', text: '考后对答案影响心态', detail: '下一场还没考呢，别自乱阵脚' },
    { type: '忌', text: '昨晚熬夜复习', detail: '睡眠不足会让你的大脑短路' },
    { type: '忌', text: '喝太多水中途上厕所', detail: '考场上去厕所既浪费时间又打断思路' },
    { type: '忌', text: '忘写名字考号', detail: '考了满分没写名字也是零分' },
    { type: '忌', text: '涂卡涂错行', detail: '选择题全对但涂串行了，哭都没地方哭' },
    { type: '忌', text: '考场上传纸条', detail: '监控拍得一清二楚，别冒险' },
    { type: '忌', text: '考完一科就翻书', detail: '都考完了还看什么，赶紧准备下一科' },
  ],

  // ═══════════════════ 在校 ═══════════════════
  school: [
    // — wiki 相关 —
    { type: '宜', text: '去罗森买个晚饭', detail: '罗森开到 19:00，是晚休时间唯一的选择' },
    { type: '宜', text: '周四好好考周爽', detail: '每周四 16:00–17:00 数学周爽，做完记得检查' },
    { type: '宜', text: '游泳课穿好泳衣下水', detail: '全班都游就你在岸边站着，多尴尬' },
    { type: '宜', text: '去食堂抢羊肉串', detail: '羊肉串和炸鸡翅一出炉就会被疯抢，跑快点' },
    { type: '宜', text: '逛逛 wiki 了解校园', detail: '上中校园挺大的，从龙门楼到西区都值得探索' },
    { type: '宜', text: '编辑 wiki 丰富知识库', detail: '班级百科靠大家一起维护，把你了解的内容写上去' },
    { type: '忌', text: '晚自习发呆浪费时间', detail: '19:00–21:15 两节晚自习，一晃就到就寝时间了' },
    { type: '忌', text: '罗森微波炉加热过度', detail: '参考 zmz 的前车之鉴，包装烧到碳化可不是闹着玩的' },
    { type: '忌', text: '错过食堂饭点', detail: '食堂 17:00–18:00 有饭，去晚了就只能吃罗森了' },
    { type: '忌', text: '早操迟到', detail: '6:25 早操，迟到了在全班注目下跑进队伍的感觉并不好' },
    // — 原有 —
    { type: '宜', text: '认真记笔记', detail: '好记性不如烂笔头，期末复习全靠它' },
    { type: '宜', text: '举手回答问题', detail: '答错了老师也会帮你纠正，不亏' },
    { type: '宜', text: '帮同学讲题', detail: '讲一遍比自己学十遍都有效' },
    { type: '宜', text: '去办公室问老师', detail: '老师其实很喜欢主动问问题的学生' },
    { type: '宜', text: '整理错题本', detail: '错过的题不再错，就是最大的提分' },
    { type: '宜', text: '课间去走廊走走', detail: '站起来活动一下，下节课更有精神' },
    { type: '宜', text: '午饭多吃点', detail: '下午的课全靠这顿撑着' },
    { type: '宜', text: '体育课认真热身', detail: '跑完八百米腿不酸，全靠热身到位' },
    { type: '宜', text: '主动打扫教室', detail: '干净的环境让大家都舒服' },
    { type: '宜', text: '和同学一起讨论', detail: '一个人想不通的问题，讨论一下就通了' },
    { type: '宜', text: '预习明天的课', detail: '提前看过一遍，上课像在复习' },
    { type: '宜', text: '上课与老师互动', detail: '跟着老师的节奏走，不容易走神' },
    { type: '宜', text: '及时订正作业', detail: '发下来就改，别等到要考试了才看' },
    { type: '宜', text: '午休闭目养神', detail: '哪怕睡不着，闭眼休息也比刷手机好' },
    { type: '宜', text: '下课和同学聊聊天', detail: '社交也是校园生活的重要部分' },
    { type: '宜', text: '在龙门楼天台吹吹风', detail: '视野开阔，心情也会变好' },
    { type: '宜', text: '去图书馆看书', detail: '安静的环境最适合专注学习' },
    { type: '宜', text: '放学去操场跑两圈', detail: '出点汗，一天的疲惫都消了' },
    { type: '宜', text: '给植物角的盆栽浇水', detail: '绿色植物能缓解眼疲劳' },
    { type: '宜', text: '整理书包准备回家', detail: '第二天早上不会手忙脚乱' },
    { type: '忌', text: '上课打瞌睡', detail: '被老师点名回答问题时一脸懵' },
    { type: '忌', text: '抄作业', detail: '抄完了也不是你的，考试照样不会' },
    { type: '忌', text: '传纸条', detail: '都 2026 年了，还用这么古老的方式' },
    { type: '忌', text: '上课偷偷吃零食', detail: '咀嚼声在安静的教室里格外明显' },
    { type: '忌', text: '课间趴桌睡觉', detail: '下节课会更困，不如站起来走走' },
    { type: '忌', text: '在走廊追逐打闹', detail: '撞到老师或者扣分都不好' },
    { type: '忌', text: '忘带作业被老师点名', detail: '全班目光聚焦的感觉并不好受' },
    { type: '忌', text: '上课走神想中午吃什么', detail: '想着想着黑板上已经写满了' },
    { type: '忌', text: '自习课和同桌聊天', detail: '你以为很小声，其实全班都听得见' },
    { type: '忌', text: '把手机带到学校', detail: '万一被收了，还要找班主任求情' },
  ],

  // ═══════════════════ 周末 ═══════════════════
  weekend: [
    // — wiki 相关 —
    { type: '宜', text: '翻翻 wiki 的校园地图', detail: '平时上课三点一线，周末在 wiki 上探索一下整个校园' },
    { type: '宜', text: '提前复习下周周爽内容', detail: '数学拓展和不等式，提前看看下周不至于抓瞎' },
    { type: '忌', text: '周日忘记返校时间', detail: '住宿生周日晚要回学校，别玩过头了' },
    { type: '忌', text: '周末不预习下周新课', detail: '数学拓展课的内容越来越难，不预习上课像听天书' },
    // — 原有 —
    { type: '宜', text: '把作业在周六写完', detail: '周日一整天都是你的，随便玩' },
    { type: '宜', text: '睡个懒觉', detail: '平时六点起，周末睡到八点不过分' },
    { type: '宜', text: '出去走走', detail: '哪怕只是在小区里转转，也比宅着强' },
    { type: '宜', text: '看一部好电影', detail: '好的电影能让你思考很久' },
    { type: '宜', text: '整理房间', detail: '干净的书桌让学习效率翻倍' },
    { type: '宜', text: '复习本周内容', detail: '趁还没忘光，巩固一下' },
    { type: '宜', text: '吃一顿好的', detail: '犒劳自己辛苦了一周' },
    { type: '宜', text: '陪陪家人', detail: '爸妈其实很想跟你聊聊天' },
    { type: '宜', text: '和朋友约出去玩', detail: '劳逸结合才是长久之道' },
    { type: '宜', text: '逛逛书店', detail: '说不定就遇到一本有意思的书' },
    { type: '宜', text: '做做运动', detail: '打打球跑跑步，出出汗' },
    { type: '宜', text: '学做一道菜', detail: '技多不压身，还能在爸妈面前露一手' },
    { type: '宜', text: '给下周做计划', detail: '有计划的周一不会手忙脚乱' },
    { type: '宜', text: '整理书包和文具', detail: '该补的文具补上，该带的书带齐' },
    { type: '宜', text: '写写日记', detail: '记录下这一周的有趣瞬间' },
    { type: '忌', text: '作业拖到周日晚上', detail: '周日晚上的补作业体验并不愉快' },
    { type: '忌', text: '一觉睡到下午', detail: '醒来半天没了，还头晕脑胀' },
    { type: '忌', text: '整天刷手机', detail: '放下手机你会发现一天可以做很多事' },
    { type: '忌', text: '熬夜打游戏', detail: '周日熬夜周一上课必困' },
    { type: '忌', text: '整天不出门', detail: '不见阳光人会变抑郁的' },
    { type: '忌', text: '暴饮暴食', detail: '吃撑了难受的是你自己' },
    { type: '忌', text: '和父母吵架', detail: '周末吵架毁掉整个周末' },
    { type: '忌', text: '忘了周日有补习班', detail: '被老师打电话来催的感觉很尴尬' },
    { type: '忌', text: '周六熬夜周日补觉', detail: '生物钟乱了周一早起更痛苦' },
    { type: '忌', text: '作业写了等于没写', detail: '敷衍了事还不如不写，反正老师看得出来' },
  ],

  // ═══════════════════ 放假 ═══════════════════
  holiday: [
    // — wiki 相关 —
    { type: '宜', text: '写一篇校园回忆录', detail: '把在龙门楼和食堂的趣事记下来，可以发到 wiki 上' },
    { type: '宜', text: '在 wiki 上看看同学近况', detail: '放假了也别忘了同学们，wiki 上还有大家的动态' },
    { type: '忌', text: '开学前不看 wiki 通知', detail: '开学考、返校时间都在 wiki 上，别错过了' },
    { type: '忌', text: '假期不碰书开学考懵了', detail: '开学考不会因为放了假就不考，周爽的恐惧还在' },
    // — 原有 —
    { type: '宜', text: '制定假期计划', detail: '把想做的事列出来，假期才不会虚度' },
    { type: '宜', text: '读一本好书', detail: '终于有大块时间可以静下心来读书了' },
    { type: '宜', text: '学一项新技能', detail: '编程、乐器、摄影，趁假期入门' },
    { type: '宜', text: '和同学约出去玩', detail: '平时没时间，假期总该聚聚' },
    { type: '宜', text: '出门旅游', detail: '换个环境，换个心情' },
    { type: '宜', text: '预习下学期内容', detail: '开学后你会发现比别人轻松很多' },
    { type: '宜', text: '发展兴趣爱好', detail: '画画、写作、手工，总有一个适合你' },
    { type: '宜', text: '多陪陪家人', detail: '以后学业越来越忙，陪伴的时间越来越少' },
    { type: '宜', text: '每天运动一小时', detail: '别等开学发现体育成绩不及格' },
    { type: '宜', text: '看几部经典电影', detail: '豆瓣 Top 250 先挑几部看' },
    { type: '宜', text: '早睡早起', detail: '假期保持规律作息，开学不会太痛苦' },
    { type: '宜', text: '写旅行日记', detail: '记录下来的回忆比照片更珍贵' },
    { type: '宜', text: '学英语看美剧', detail: '边看边学，一举两得' },
    { type: '宜', text: '练习硬笔书法', detail: '字写好了，卷面分也跟着涨' },
    { type: '宜', text: '整理旧照片', detail: '翻翻相册，回忆一下过去的自己' },
    { type: '忌', text: '作业堆到最后一周', detail: '最后一周通宵补作业的体验堪比渡劫' },
    { type: '忌', text: '日夜颠倒', detail: '白天睡觉晚上打游戏，开学倒时差' },
    { type: '忌', text: '沉迷游戏', detail: '一个假期过去段位上了，成绩下了' },
    { type: '忌', text: '整个假期没怎么出门', detail: '开学发现脸色白了一个色号' },
    { type: '忌', text: '假期结束作业还没动', detail: '开学前一天创造奇迹的不是你' },
    { type: '忌', text: '开学前一天通宵补作业', detail: '通宵补完的作业质量还不如不交' },
    { type: '忌', text: '忘了还有开学考', detail: '假期玩太嗨，开学考直接懵' },
    { type: '忌', text: '什么都没干就开学了', detail: '开学同学问假期干了啥，你只能沉默' },
    { type: '忌', text: '每天睡到中午', detail: '醒来半天没了，洗漱一下该吃午饭了' },
    { type: '忌', text: '一个暑假没碰书包', detail: '开学发现书包里还有上学期的卷子' },
  ],
}

export function pickAdvice(
  domain: FortuneDomain,
  type: '宜' | '忌',
  n: number,
  rand: () => number = Math.random,
): AdviceItem[] {
  const pool = advicePool[domain].filter((a) => a.type === type)
  const copy = [...pool]
  const result: AdviceItem[] = []
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rand() * copy.length)
    result.push(copy[idx])
    copy.splice(idx, 1)
  }
  return result
}
