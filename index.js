export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";

    ctx.waitUntil(handleRequest(env, { force }));

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Stock 监控</title>
<style>body{font-family:Arial;margin:40px}h1{color:#333}</style></head>
<body>
  <h1>Stock 监控运行中</h1>
  <p>后台定时检查补货情况，结合 KV 做持久化，避免重复通知。</p>
  <p>手动触发：<code>?force=1</code></p>
</body></html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleRequest(env, { force: false }));
  },
};

// ====== 监控目标配置（按需修改 / 增减） ======
const TARGETS = [
  {
    id: "hostdzire_32",
    name: "HostDZire 32刀",
    url: "https://hostdzire.com/billing/index.php?rp=/store/indian-cloudvps/in-cloudvps-5-nodeseek-special",
    outOfStockText: "out of stock",
    description: "HostDZire 32刀闪购补货了。",
  },
  {
    id: "dmit_special",
    name: "DMIT Special",
    url: "https://example.com/dmit-link",
    outOfStockText: "out of stock",
    description: "DMIT 补货了。",
  },
  {
    id: "bwg_la_kvm",
    name: "搬瓦工 LA KVM",
    url: "https://example.com/bwg-buy-link",
    outOfStockText: "out of stock",
    description: "搬瓦工补货了。",
  },
  {
    id: "colocrossing_e3",
    name: "Colocrossing E3-2124G",
    url: "https://portal.colocrossing.com/register/order/service/592",
    outOfStockText: "this service is not available",
    description: "Colocrossing E3-2124G 有货了。",
  },
];

// 简单的 fetch 超时封装
async function fetchWithTimeout(url, opts = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// Server 酱推送封装（Turbo 版）
async function sendServerChan(env, title, desp) {
  const SCKEY = env.SCKEY;
  if (!SCKEY) {
    console.error("SCKEY not configured");
    return;
  }
  const api = `https://sctapi.ftqq.com/${SCKEY}.send`;
  try {
    const r = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ title, desp }),
    });
    if (!r.ok) {
      console.error("Server 酱发送失败:", r.status);
    } else {
      console.log("Server 酱发送成功:", title);
    }
  } catch (err) {
    console.error("Server 酱发送异常:", err && err.message ? err.message : err);
  }
}

async function handleRequest(env, opts = {}) {
  const KV = env.STOCK_KV;
  const COOLDOWN_MIN = parseInt(env.COOLDOWN_MIN || "60", 10);

  if (!KV) {
    console.error("STOCK_KV not bound");
    return;
  }

  const now = Date.now();
  const cooldownMs = COOLDOWN_MIN * 60 * 1000;

  const inStockList = [];
  const errors = [];

  // 并行检查所有目标
  const checks = TARGETS.map(async (t) => {
    try {
      console.log(`[check] ${t.name} ${t.url}`);
      const res = await fetchWithTimeout(
        t.url,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            Accept: "text/html,application/xhtml+xml",
          },
        },
        10000
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const text = await res.text();
      const hasOutText = text
        .toLowerCase()
        .includes((t.outOfStockText || "").toLowerCase());
      const isInStock = !hasOutText;

      const key = `stock:${t.id}`;
      let kv = null;
      const kvRaw = await KV.get(key);
      if (kvRaw) {
        try {
          kv = JSON.parse(kvRaw);
        } catch (e) {
          console.error(`KV parse error for ${key}:`, e);
          kv = null;
        }
      }

      const prevStatus = kv && kv.status ? kv.status : "unknown";
      const lastNotified = kv && kv.lastNotified ? kv.lastNotified : 0;

      let needNotify = false;
      if (isInStock) {
        if (opts.force) {
          needNotify = true;
        } else if (prevStatus === "out" || prevStatus === "unknown") {
          needNotify = true;
        } else if (prevStatus === "in" && now - lastNotified > cooldownMs) {
          needNotify = true;
        }
      }

      const newKV = {
        status: isInStock ? "in" : "out",
        lastChecked: now,
        lastNotified: needNotify ? now : lastNotified,
      };
      await KV.put(key, JSON.stringify(newKV));

      if (isInStock && needNotify) {
        inStockList.push({
          id: t.id,
          name: t.name,
          message: `🎉 ${t.description}\n\n🔗 ${t.url}`,
        });
        console.log(`[notify queued] ${t.name}`);
      } else {
        console.log(
          `[no notify] ${t.name} isInStock=${isInStock} prev=${prevStatus} needNotify=${needNotify}`
        );
      }
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      console.error(`[error] ${t.name}:`, msg);
      errors.push({ name: t.name, error: msg });
    }
  });

  await Promise.allSettled(checks);

  // 合并补货通知
  if (inStockList.length > 0) {
    const combined = inStockList.map((i) => i.message).join("\n\n-----\n\n");
    await sendServerChan(env, "🎉 Stock 补货通知", combined);
  } else {
    console.log("本轮未发现刚补货目标");
  }

  // 合并错误通知（可按需增加冷却逻辑）
  if (errors.length > 0) {
    const desp =
      "监控过程中出现错误：\n\n" +
      errors.map((e) => `- ${e.name}: ${e.error}`).join("\n") +
      "\n\n请检查 Worker 环境或目标站点。";
    await sendServerChan(env, "⚠️ Stock 监控错误（合并）", desp);
  }

  console.log("监控完成");
}
