/**
 * 海鑫汇 GTN · 表单 → 飞书多维表格 中转（Cloudflare Pages Functions）
 * 部署：放进仓库根目录 functions/ 文件夹，推送到 Cloudflare Pages 后自动生效。
 * 访问地址：https://gatewaytonew.com/feishu-proxy
 *
 * 环境变量（Cloudflare Pages → Settings → Environment variables）：
 *   FEISHU_APP_ID        飞书应用 App ID
 *   FEISHU_APP_SECRET    飞书应用 App Secret
 *   FEISHU_BASE_APP_TOKEN 多维表格 app_token（base 链接里 base/ 之后那段）
 */

const FEISHU_BASE = 'https://open.feishu.cn';
const APP_TOKEN = 'RhGzbMLULaYG5TsmDGfcWN7snVg'; // gobeyond.feishu.cn/base/... 的 app_token
const TABLE_ID = 'tblrGIjSqluaF5Gx';             // 预约记录表 table_id

function withTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}

async function getTenantToken(env) {
  const { signal, clear } = withTimeout(8000);
  try {
    const r = await fetch(`${FEISHU_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }),
      signal,
    });
    const text = await r.text();
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('token not json: ' + text.slice(0, 200)); }
    if (j.code !== 0) throw new Error('token failed: ' + JSON.stringify(j));
    return j.tenant_access_token;
  } finally {
    clear();
  }
}

async function listFields(token) {
  const { signal, clear } = withTimeout(8000);
  try {
    const r = await fetch(
      `${FEISHU_BASE}/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/fields`,
      { headers: { Authorization: 'Bearer ' + token }, signal }
    );
    return await r.json();
  } finally {
    clear();
  }
}

async function writeRecord(token, fields) {
  const { signal, clear } = withTimeout(8000);
  try {
    const r = await fetch(
      `${FEISHU_BASE}/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
        signal,
      }
    );
    const text = await r.text();
    try { return JSON.parse(text); } catch (e) { throw new Error('write not json: ' + text.slice(0, 200)); }
  } finally {
    clear();
  }
}

// 表单字段(name/company/industry/stage/contact/brief) → 飞书表字段
// 飞书表真实列名：name/company/industry/stage/contact_info/brief/submitted_at/source
function mapRecord(d) {
  return {
    name: d.name || '',
    company: d.company || '',
    industry: d.industry || '',
    stage: d.stage || '',
    contact_info: d.contact || '',
    brief: d.brief || '',
    submitted_at: new Date().toISOString(),
    source: d.source || '官网首页',
  };
}

export async function onRequestPost(context) {
  const env = context.env;
  try {
    const token = await getTenantToken(env);
    let body;
    try {
      body = await context.request.json();
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: 'body not json' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const fields = mapRecord(body);
    const res = await writeRecord(token, fields);
    if (res.code !== 0) {
      return new Response(JSON.stringify({ ok: false, feishu: res }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, record_id: res.data?.record?.record_id }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e.message || e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

// GET：返回该表字段清单，便于核对列名
export async function onRequestGet(context) {
  const env = context.env;
  try {
    const token = await getTenantToken(env);
    const res = await listFields(token);
    return new Response(JSON.stringify({ ok: true, fields: res.data?.items?.map(f => f.field_name) || res }, null, 2), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e.message || e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
