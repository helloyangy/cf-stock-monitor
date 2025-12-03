# Host Stock Monitor

<div align="center">

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange?logo=cloudflare)](https://workers.cloudflare.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

一个基于 Cloudflare Workers 的主机商库存监控工具，通过 Server 酱自动推送补货通知到微信。

[功能特点](#功能特点) • [快速开始](#快速开始) • [配置说明](#配置说明) • [使用方法](#使用方法)

</div>

---

## 功能特点

- ⚡ **零成本运行** - 基于 Cloudflare Workers 免费额度（每天 100,000 次请求）
- 📱 **微信推送** - 通过 [Server 酱](https://sct.ftqq.com) 实时推送补货通知到微信
- 🔄 **自动定时检查** - 使用 Cron Triggers 定时监控（可自定义间隔）
- 🗃️ **持久化存储** - 基于 Workers KV 记录库存状态，避免重复通知
- ⏱️ **通知冷却机制** - 可配置冷却时间，防止频繁推送
- 🎯 **灵活配置** - 支持监控多个目标站点，自定义缺货关键词
- 🔍 **手动触发** - 支持通过 `?force=1` 参数手动触发检查（调试用）

## 实现原理

通过检测网页中是否包含**特定的缺货关键词**来判断库存状态：

- 当页面**不包含**缺货关键词 → 判定为**有货**
- 当页面**包含**缺货关键词 → 判定为**缺货**

### 示例

| 商家 | 缺货关键词 |
|------|-----------|
| BWG / DMIT / HostDZire | `out of stock` |
| Colocrossing | `this service is not available` |

> 💡 **添加新监控对象**：在浏览器中打开目标购买页面，查看缺货时显示的关键词，添加到 `TARGETS` 数组即可。

---

## 快速开始

### 1. 前置准备

- 一个 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)（免费）
- 获取 [Server 酱 SendKey](https://sct.ftqq.com/sendkey)（用于微信推送）

### 2. 部署到 Cloudflare Workers

#### 方法一：通过 Wrangler CLI（推荐）

安装 Wrangler
npm install -g wrangler

克隆项目
git clone https://github.com/helloyangy/host-stock-monitor.git
cd host-stock-monitor

登录 Cloudflare
wrangler login

创建 KV 命名空间
wrangler kv:namespace create STOCK_KV

部署 Worker
wrangler deploy

text

#### 方法二：通过 Cloudflare Dashboard

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → **Create application** → **Create Worker**
3. 复制 `index.js` 中的代码，粘贴到编辑器
4. 点击 **Deploy**

### 3. 配置环境变量

在 Cloudflare Dashboard 中进入你的 Worker：

**Settings** → **Variables** → **Environment Variables**

添加以下变量：

| 变量名 | 说明 | 必填 | 示例 |
|--------|------|------|------|
| `SCKEY` | Server 酱 SendKey | ✅ | `SCT123456Txxx` |
| `COOLDOWN_MIN` | 通知冷却时间（分钟） | ❌ | `60`（默认值） |

### 4. 绑定 KV 命名空间

**Settings** → **Bindings** → **KV Namespace Bindings**

- **Variable name**: `STOCK_KV`
- **KV namespace**: 选择之前创建的 KV 命名空间

### 5. 设置 Cron Trigger（定时任务）

**Settings** → **Triggers** → **Cron Triggers**

添加 Cron 表达式，例如：

*/5 * * * * # 每 5 分钟执行一次
*/10 * * * * # 每 10 分钟执行一次
0 * * * * # 每小时执行一次

text

---

## 配置说明

### 添加监控目标

编辑 `index.js` 中的 `TARGETS` 数组：

const TARGETS = [
{
id: "hostdzire_32", // 唯一标识符
name: "HostDZire 32刀", // 显示名称
url: "https://hostdzire.com/...", // 购买页面链接
outOfStockText: "out of stock", // 缺货关键词（不区分大小写）
description: "HostDZire 32刀闪购补货了。", // 通知文案
},
// 添加更多目标...
];

text

### 示例：常见主机商配置

// DMIT
{
id: "dmit_special",
name: "DMIT Special",
url: "https://www.dmit.io/cart.php?a=add&pid=XXX",
outOfStockText: "out of stock",
description: "DMIT Special 套餐补货了。",
}

// 搬瓦工
{
id: "bwg_la_kvm",
name: "搬瓦工 LA KVM",
url: "https://bandwagonhost.com/cart.php?a=add&pid=XXX",
outOfStockText: "out of stock",
description: "搬瓦工 LA KVM 补货了。",
}

// Colocrossing
{
id: "colocrossing_e3",
name: "Colocrossing E3-2124G",
url: "https://portal.colocrossing.com/register/order/service/592",
outOfStockText: "this service is not available",
description: "Colocrossing E3-2124G 有货了。",
}

text

---

## 使用方法

### 自动监控

部署并配置 Cron Trigger 后，Worker 会按设定时间自动检查库存：

- 检测到**从缺货 → 有货**时，自动推送微信通知
- 持续有货且超过冷却时间，可再次推送（可选）
- 多个目标同时补货时，合并为一条消息发送

### 手动触发

访问你的 Worker URL 并添加 `?force=1` 参数：

https://your-worker.your-subdomain.workers.dev/?force=1

text

此模式会**强制发送所有有货目标的通知**，用于调试或立即查看当前库存状态。

### 查看运行状态

直接访问 Worker URL（不带参数）：

https://your-worker.your-subdomain.workers.dev/

text

会显示一个简单的状态页面，确认 Worker 正在运行。

---

## 微信通知示例

当检测到补货时，你会在微信中收到如下通知：

🎉 Stock 补货通知

🎉 HostDZire 32刀闪购补货了。

🔗 https://hostdzire.com/billing/...

🎉 DMIT Special 补货了。

🔗 https://www.dmit.io/cart.php?...

text

---

## KV 数据结构

Worker 使用 KV 存储每个目标的状态：

**Key**: `stock:{id}`  
**Value** (JSON):

{
"status": "in", // 当前状态："in"（有货）或 "out"（缺货）
"lastChecked": 1701619200000, // 上次检查时间（毫秒时间戳）
"lastNotified": 1701619200000 // 上次通知时间（毫秒时间戳）
}

text

---

## 常见问题

### 1. 如何避免重复通知？

Worker 会记录每个目标的状态到 KV，只有在**状态变化**（缺货→有货）时才推送通知。同时支持配置冷却时间（`COOLDOWN_MIN`），避免短时间内重复推送。

### 2. 为什么没有收到通知？

检查以下几点：
- Server 酱 `SCKEY` 是否正确配置
- Server 酱是否已绑定微信（访问 [sct.ftqq.com](https://sct.ftqq.com) 确认）
- 查看 Worker 的 **Logs**（Dashboard → Workers → 你的 Worker → Logs）
- 目标网站的缺货关键词是否变化（手动访问检查）

### 3. 如何调整检查频率？

修改 Cron Trigger 的时间表达式：
- 每 5 分钟：`*/5 * * * *`
- 每 10 分钟：`*/10 * * * *`
- 每 30 分钟：`*/30 * * * *`

> ⚠️ 注意：过高的频率可能导致目标站点封禁 IP 或超出 Workers 免费额度。

### 4. 可以监控非主机类商品吗？

可以！只要目标网站在缺货时会显示固定的文本关键词，就可以监控。例如：
- 电商平台的限量商品
- 游戏服务器的名额
- 活动门票

---

## 技术栈

- [Cloudflare Workers](https://workers.cloudflare.com/) - 边缘计算平台
- [Workers KV](https://developers.cloudflare.com/kv/) - 键值存储
- [Server 酱](https://sct.ftqq.com) - 微信推送服务
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) - 定时任务

---

## 贡献

欢迎提交 Issue 和 Pull Request！

如果你发现了好用的主机商监控配置，欢迎分享到 Issues 中。

---

## 许可证

[MIT License](LICENSE)

---

## 致谢

- 感谢 [Server 酱](https://sct.ftqq.com) 提供的免费微信推送服务
- 感谢 Cloudflare 提供的优秀边缘计算平台

---

<div align="center">

**如果这个项目对你有帮助，请点个 ⭐ Star 支持一下！**

</div>