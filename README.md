# 闹钟 · 节假日与农历提醒（PWA）

参照提供的 6 张 App 截图设计实现的前端原型：**纯 HTML / CSS / JavaScript，零依赖**。
一次部署，安卓和 iOS 都能「添加到主屏幕」，像 App 一样全屏打开，并支持离线启动。

## 功能

- **5 个底部 Tab**：首页、日程、＋ 添加闹钟、提醒、我的，界面风格与参考图一致（浅灰背景、白色圆角卡片、蓝色主色）。
- **首页**：按「今天 / 明天 / 一周内 / 一个月内 / 以后」分组展示闹钟，显示倒计时、跳过、开关；点击卡片可编辑；支持搜索与静音。
- **日程**：月历视图，显示公历、农历、周末与节假日；可给日期标记「加班 / 休假 / 删除」；查看某天闹钟。
- **添加闹钟**：可滚动时间滚轮，公历 / 农历 / 弹性三种模式（农历模式下日期列显示农历日期，保存后按农历月日计算每年/每月响铃），名称、铃声、提前提醒、稍后提醒、备注、起始年份、跳转 App、重复规则。
- **6 种闹钟类型**（与截图一致）：
  - 普通闹钟：类似系统闹钟，支持按周重复、节假日与加班/休假适配、跳过。
  - 轮班闹钟：按「做4休2」之类的倒班周期，只设一个闹钟。
  - 定时闹钟：指定日期响一次，适合抢购、换证。
  - 特殊周期闹钟：每 N 天 / 周 / 月 / 年响一次，适合吃药、大小周。
  - 年度闹钟：每年同一天响，适合生日、节日、纪念日。
  - 月度闹钟：每月同一天响，适合还信用卡、房贷。
- **提醒页**：报时、喝水吃药等快捷开关。
- **我的页**：登录/专业版入口（预留）、使用帮助、添加到桌面引导、测试通知等。
- **本地存储**：所有闹钟数据保存在浏览器 `localStorage`，无需后端。

## 目录结构

```
holiday-alarm-pwa/
├── index.html              # 全部页面结构
├── css/style.css           # 样式（移动端优先，桌面居中预览）
├── js/app.js               # 闹钟计算、交互、存储、通知
├── js/calendar.js          # 农历（Intl API）与节假日数据
├── manifest.webmanifest    # PWA 安装清单
├── sw.js                   # 离线缓存 Service Worker
├── icons/                  # 桌面图标（192/512/apple-touch）
└── tools/gen_icons.py      # 图标生成脚本（可选）
```

## 本地运行

PWA 需要通过 HTTP 访问（不能用 `file://` 直接打开）：

```bash
cd holiday-alarm-pwa
python -m http.server 8000
```

浏览器打开 `http://localhost:8000`。修改 `js/calendar.js` 中的 `fixed` 字典即可增删节假日。

## 上传到 GitHub

```bash
cd holiday-alarm-pwa
git init
git add .
git commit -m "feat: 节假日闹钟 PWA 首版"
git branch -M main
git remote add origin https://github.com/<你的用户名>/holiday-alarm-pwa.git
git push -u origin main
```

先在 GitHub 网页上创建一个空仓库 `holiday-alarm-pwa`（不要勾选初始化 README）。

## 部署为在线链接（GitHub Pages）

1. 仓库页面 → **Settings** → **Pages**。
2. **Build and deployment** → Source 选 **Deploy from a branch**，Branch 选 `main`、目录选 `/ (root)` → Save。
3. 等待几十秒后得到地址：`https://<你的用户名>.github.io/holiday-alarm-pwa/`。
4. 用手机浏览器打开这个地址，即可按下面步骤添加到桌面。

> 也可以用 Netlify / Vercel 直接拖入文件夹部署，效果相同。

## 添加到手机桌面

### 安卓（Chrome / Edge）

1. 用 Chrome 或 Edge 打开上面的在线地址。
2. 点右上角 **⋮** 菜单。
3. 选择 **「添加到主屏幕」** 或 **「安装应用」**。
4. 确认后，桌面会出现「闹钟」图标，点击即全屏打开，可离线使用。

### iPhone / iPad（必须用 Safari）

1. 用 **Safari** 打开在线地址（微信/QQ 内置浏览器不支持安装）。
2. 点底部中间的 **分享按钮**（方框 + 向上箭头）。
3. 下滑选择 **「添加到主屏幕」**。
4. 右上角点 **「添加」**，桌面出现图标即可全屏打开。

> 应用内「我的 → 添加到桌面」也有同样的图文引导；安卓 Chrome 还会出现「一键安装」入口。

## 已知限制（重要）

- 这是 Web App：**页面完全关闭后，浏览器无法像原生 App 那样在后台精确定时响铃**。重要闹钟请保持页面在后台运行，或用手机系统自带闹钟兜底。
- 通知权限需要用户授权；iOS 需 **16.4+** 且必须先「添加到主屏幕」才支持 Web 通知。
- 农历由浏览器内置 `Intl Chinese Calendar` 提供（现代 Chrome / Safari 均支持）；内置节假日是演示数据，可在 `js/calendar.js` 中自行维护完整数据或接入节假日 API。
- 数据只存在当前设备浏览器中，清除浏览器数据会丢失；登录/云同步/订阅为界面预留，未接后端。
- 如果需要真正的后台闹钟、应用商店上架，可在此代码基础上用 **Capacitor** 打包成原生 App（安卓 APK / iOS IPA），再接入本地通知插件。

## License

MIT
