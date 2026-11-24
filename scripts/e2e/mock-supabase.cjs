'use strict';
// Local stand-in for the Supabase REST + Auth endpoints, backed by a real
// Postgres database that has the CORE migration applied. Every request runs
// as the Supabase "anon" or "authenticated" role with the caller's JWT claims,
// so row-level security, triggers and RPC functions are exercised for real.
// Test-only. Usage: PGURL=postgres://... node scripts/e2e/mock-supabase.cjs [port]
const http = require('node:http');
const { Pool } = require('pg');

const PORT = Number(process.argv[2] || 54321);
const pool = new Pool({ connectionString: process.env.PGURL });
const PASSWORD = process.env.TEST_PASSWORD || 'test-pass';
const IDENT = /^[a-z_][a-z0-9_]*$/;
const log = [];

function token(email) { return 'test.' + Buffer.from(JSON.stringify({ email, role: 'authenticated', exp: Date.now() + 3600e3 })).toString('base64url'); }
function claims(req) {
  const auth = String(req.headers.authorization || '');
  const m = auth.match(/^Bearer test\.(.+)$/);
  if (!m) return null;
  try { const c = JSON.parse(Buffer.from(m[1], 'base64url').toString()); return c.exp > Date.now() ? c : 'expired'; } catch { return null; }
}
function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }, headers || {}));
  res.end(body === undefined ? '' : JSON.stringify(body));
}
function readBody(req) { return new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(d ? JSON.parse(d) : null); } catch { r(null); } }); }); }

function buildWhere(params, args) {
  const where = [];
  for (const [k, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
    if (!IDENT.test(k)) throw Object.assign(new Error('bad column ' + k), { status: 400 });
    const dot = raw.indexOf('.'); const op = raw.slice(0, dot), val = raw.slice(dot + 1);
    const col = '"' + k + '"';
    if (op === 'eq') { args.push(val); where.push(`${col} = $${args.length}`); }
    else if (op === 'neq') { args.push(val); where.push(`${col} is distinct from $${args.length}`); }
    else if (['gte', 'lte', 'gt', 'lt'].includes(op)) { args.push(val); where.push(`${col} ${{ gte: '>=', lte: '<=', gt: '>', lt: '<' }[op]} $${args.length}`); }
    else if (op === 'in') { args.push(val.replace(/^\(|\)$/g, '').split(',').filter(Boolean)); where.push(`${col}::text = any($${args.length}::text[])`); }
    else if (op === 'is') { where.push(`${col} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`); }
    else if (op === 'like') { args.push(val.replace(/\*/g, '%')); where.push(`${col}::text like $${args.length}`); }
    else throw Object.assign(new Error('unsupported op ' + op), { status: 400 });
  }
  return where.length ? ' where ' + where.join(' and ') : '';
}

async function withRole(c, fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    if (c && c !== 'expired') {
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(c)]);
      await client.query('set local role authenticated');
    } else {
      await client.query('set local role anon');
    }
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) { await client.query('rollback').catch(() => {}); throw e; }
  finally { client.release(); }
}

async function handleRest(req, res, url) {
  const c = claims(req);
  if (c === 'expired') return send(res, 401, { message: 'JWT expired' });
  const path = url.pathname.replace(/^\/rest\/v1\//, '');
  const body = ['POST', 'PATCH'].includes(req.method) ? await readBody(req) : null;
  const params = [...url.searchParams.entries()];
  const prefer = String(req.headers.prefer || '');
  try {
    if (path.startsWith('rpc/')) {
      const fn = path.slice(4); if (!IDENT.test(fn)) return send(res, 404, { message: 'no function' });
      const keys = Object.keys(body || {}).filter(k => IDENT.test(k)); const args = keys.map(k => { const v = body[k]; return v !== null && typeof v === 'object' && !Array.isArray(v) || (Array.isArray(v) && v.some(x => typeof x === 'object')) ? JSON.stringify(v) : v; });
      const sql = `select public."${fn}"(${keys.map((k, i) => `"${k}" => $${i + 1}`).join(', ')}) as r`;
      const r = await withRole(c, cl => cl.query(sql, args));
      return send(res, 200, r.rows[0].r);
    }
    if (!IDENT.test(path)) return send(res, 404, { message: 'not found' });
    const exists = await pool.query("select 1 from pg_tables where schemaname='public' and tablename=$1", [path]);
    if (!exists.rowCount) { return send(res, req.method === 'GET' ? 200 : 201, []); } // legacy tables not part of this test
    const args = [];
    if (req.method === 'GET') {
      const select = url.searchParams.get('select') || '*';
      const cols = select === '*' ? '*' : select.split(',').filter(x => IDENT.test(x)).map(x => '"' + x + '"').join(',') || '*';
      let sql = `select ${cols} from public."${path}"` + buildWhere(params, args);
      const order = url.searchParams.get('order');
      if (order) sql += ' order by ' + order.split(',').map(o => { const [col, dir] = o.split('.'); if (!IDENT.test(col)) throw new Error('bad order'); return `"${col}" ${dir === 'desc' ? 'desc' : 'asc'}`; }).join(',');
      const limit = Number(url.searchParams.get('limit')); if (limit) sql += ' limit ' + Math.min(limit, 10000);
      const offset = Number(url.searchParams.get('offset')); if (offset) sql += ' offset ' + offset;
      const r = await withRole(c, cl => cl.query(sql, args));
      return send(res, 200, r.rows);
    }
    if (req.method === 'PATCH') {
      const keys = Object.keys(body || {}).filter(k => IDENT.test(k));
      const sets = keys.map(k => { const v = body[k]; args.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v); return `"${k}" = $${args.length}`; });
      const sql = `update public."${path}" set ${sets.join(', ')}` + buildWhere(params, args) + ' returning *';
      const r = await withRole(c, cl => cl.query(sql, args));
      return send(res, 200, /return=representation/.test(prefer) ? r.rows : undefined);
    }
    if (req.method === 'POST') {
      const rows = Array.isArray(body) ? body : [body];
      const out = await withRole(c, async cl => {
        const ret = [];
        for (const row of rows) {
          const keys = Object.keys(row).filter(k => IDENT.test(k)); const a = keys.map(k => { const v = row[k]; return v !== null && typeof v === 'object' ? JSON.stringify(v) : v; });
          const oc = url.searchParams.get('on_conflict');
          const upsert = oc && /merge-duplicates/.test(prefer) ? ` on conflict (${oc.split(',').filter(x => IDENT.test(x)).map(x => '"' + x + '"').join(',')}) do update set ${keys.map(k => '"' + k + '" = excluded."' + k + '"').join(', ')}` : '';
          const r = await cl.query(`insert into public."${path}" (${keys.map(k => '"' + k + '"').join(',')}) values (${keys.map((_, i) => '$' + (i + 1)).join(',')})${upsert} returning *`, a);
          ret.push(...r.rows);
        }
        return ret;
      });
      return send(res, 201, /return=representation/.test(prefer) ? out : undefined);
    }
    if (req.method === 'DELETE') return send(res, 405, { message: 'not supported in test' });
    return send(res, 405, { message: 'method' });
  } catch (e) {
    const status = e.status || (/permission denied|row-level security/.test(e.message) ? 403 : 400);
    log.push({ path, method: req.method, error: e.message });
    return send(res, status, { message: e.message, code: e.code });
  }
}

async function handleAuth(req, res, url) {
  const body = await readBody(req);
  if (url.pathname.endsWith('/token')) {
    const gt = url.searchParams.get('grant_type');
    if (gt === 'password') {
      const email = String(body && body.email || '').toLowerCase();
      if (!email || body.password !== PASSWORD) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      return send(res, 200, { access_token: token(email), refresh_token: 'r.' + Buffer.from(email).toString('base64url'), expires_in: Number(process.env.TOKEN_TTL || 3600), user: { email } });
    }
    if (gt === 'refresh_token') {
      const m = String(body && body.refresh_token || '').match(/^r\.(.+)$/); if (!m) return send(res, 400, { error: 'invalid_grant' });
      const email = Buffer.from(m[1], 'base64url').toString();
      return send(res, 200, { access_token: token(email), refresh_token: body.refresh_token, expires_in: 3600, user: { email } });
    }
  }
  if (url.pathname.endsWith('/logout')) return send(res, 204);
  return send(res, 404, {});
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__log') return send(res, 200, log);
  if (url.pathname.startsWith('/rest/v1/')) return handleRest(req, res, url);
  if (url.pathname.startsWith('/auth/v1/')) return handleAuth(req, res, url);
  send(res, 404, {});
}).listen(PORT, () => console.log('mock supabase on ' + PORT));
