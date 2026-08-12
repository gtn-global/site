/**
 * 海鑫汇 GTN · 表单 → 飞书多维表格 中转（Cloudflare Pages Functions）
 * 部署：放进仓库根目录 functions/ 文件夹，推送到 Cloudflare Pages 后自动生效。
 * 访问地址：https://gtn-global.pages.dev/feishu-proxy
 */

const FEISHU_BASE = 'https://open.feishu.cn/open-apis';

// 字段名 → 飞书 field_id 映射（已创建，无需重复 ensureField）
const FIELD_MAP = {
  name: 'fld3tTQNy8',
  company: 'fldtxRnIYU',
  industry: 'fldU0dgggA',
  stage: 'flds5Xu4Hc',
  contact_info: 'fldp9wYb2N',
  brief: 'fldxK7mZ3Q',
  submitted_at: 'fldvWn8R1T',
  source: 'fldqL4c6Xy',
};

const TABLE_ID = 'tblrGIjSqluaF5Gx';

function withTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}

async function getTenantToken(env) {
  const appId = (env.FEISHU_APP_ID || '').trim();
  const appSecret = (env.FEISHU_APP_SECRET || '').trim();
  const { signal, clear } = withTimeout(8000);
  try {
    const r = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      signal,
    });
    const j = await r.json();
    if (j.code !== 0) throw new Error('token fail: ' + JSON.stringify(j));
    return j.tenant_access_token;
  } finally {
    clear();
  }
}

function mapRecord(data) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const fields = {};
  fields[FIELD_MAP.name] = String(data.name || '').slice(0, 200);
  fields[FIELD_MAP.company] = String(data.company || '').slice(0, 200);
  fields[FIELD_MAP.industry] = String(data.industry || '').slice(0, 200);
  fields[FIELD_MAP.stage] = String(data.stage || '').slice(0, 100);
  fields[FIELD_MAP.contact_info] = String(data.contact_info || '').slice(0, 200);
  fields[FIELD_MAP.brief] = String(data.brief || '').slice(0, 2000);
  fields[FIELD_MAP.submitted_at] = now;
  fields[FIELD_MAP.source] = String(data.source || 'book-diagnostic').slice(0, 100);
  return fields;
}

async function writeRecord(token, appToken, fields) {
  const { signal, clear } = withTimeout(8000);
  try {
    const r = await fetch(
      `${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${TABLE_ID}/records`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
        signal,
      }
    );
    return r.json();
  } finally {
    clear();
  }
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
    const appToken = (env.FEISHU_BASE_APP_TOKEN || '').trim();
    const token = await getTenantToken(env);
    const fields = mapRecord(data);
    const res = await writeRecord(token, appToken, fields);
    if (res.code !== 0) {
      return new Response(JSON.stringify({ ok: false, error: res }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, record_id: res.data.record_id }), {
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

export async function onRequestGet(context) {
  const env = context.env;
  const steps = [];
  try {
    const token = await getTenantToken(env);
    steps.push('token OK');
    steps.push('table: ' + TABLE_ID);
    return new Response(JSON.stringify({ ok: true, steps }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, steps, error: String(e.message || e) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
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
