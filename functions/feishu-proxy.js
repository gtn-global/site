/**
 * 海鑫汇 GTN · 表单 → 飞书多维表格 中转（Cloudflare Pages Functions）
 * 部署：放进仓库根目录 functions/ 文件夹，推送到 Cloudflare Pages 后自动生效。
 * 访问地址：https://gtn-global.pages.dev/feishu-proxy  （或绑定 eu.org 后 https://你的域名/feishu-proxy）
 *
 * 凭据硬编码（无需 Variables 面板）：
 *   APP_ID / APP_SECRET / BASE_TOKEN
 * 飞书应用需开启 bitable 权限并发布。
 */

const FEISHU_BASE = 'https://open.feishu.cn/open-apis';

async function getTenantToken(env) {
  const r = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error('token fail: ' + JSON.stringify(j));
  return j.tenant_access_token;
}

async function getFirstTable(token, appToken) {
  const r = await fetch(`${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const j = await r.json();
  if (j.code !== 0 || !j.data.items.length) throw new Error('no table: ' + JSON.stringify(j));
  return j.data.items[0].table_id;
}

async function ensureField(token, appToken, tableId, fieldName, type = 1) {
  const listR = await fetch(
    `${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const listJ = await listR.json();
  const exists = (listJ.data || []).find((f) => f.field_name === fieldName);
  if (exists) return;
  await fetch(`${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_name: fieldName, type }),
  });
}

function mapRecord(data) {
  const now = new Date().toISOString();
  return {
    name: String(data.name || '').slice(0, 200),
    company: String(data.company || '').slice(0, 200),
    industry: String(data.industry || '').slice(0, 200),
    stage: String(data.stage || '').slice(0, 100),
    contact_info: String(data.contact_info || '').slice(0, 200),
    brief: String(data.brief || '').slice(0, 2000),
    submitted_at: now,
    source: String(data.source || 'book-diagnostic').slice(0, 100),
  };
}

async function writeRecord(token, appToken, tableId, record) {
  const r = await fetch(
    `${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: record }),
    }
  );
  return r.json();
}

export async function onRequestPost(context) {
  const env = context.env;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  let data;
  try {
    data = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'bad json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  try {
    const token = await getTenantToken(env);
    const appToken = env.FEISHU_BASE_APP_TOKEN;
    const tableId = await getFirstTable(token, appToken);
    const record = mapRecord(data);
    for (const key of Object.keys(record)) {
      await ensureField(token, appToken, tableId, key, 1);
    }
    const res = await writeRecord(token, appToken, tableId, record);
    if (res.code !== 0) {
      return new Response(JSON.stringify({ ok: false, error: res }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
