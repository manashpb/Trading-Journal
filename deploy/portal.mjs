import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const { JOURNAL_USER: user, JOURNAL_PASSWORD: password, PORTAL_ORIGIN: origin } = process.env;
if (!user || !password || !origin || new URL(origin).origin !== origin) throw new Error('Set JOURNAL_USER, JOURNAL_PASSWORD and PORTAL_ORIGIN (origin only, no trailing slash)');
const sessions = new Map(), attempts = new Map();
const digest = value => createHash('sha256').update(value).digest();
const equal = (a, b) => timingSafeEqual(digest(a), digest(b));
const token = () => randomBytes(32).toString('hex');
const cookie = value => `trading_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${origin.startsWith('https:') ? '; Secure' : ''}`;
const page = (body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trading workspace</title><style>body{background:#0f172a;color:#e2e8f0;font:17px system-ui;margin:0;display:grid;min-height:100vh;place-items:center}main{padding:36px;background:#1e293b;border-radius:18px;width:min(420px,80vw)}label,input,button,a{display:block;box-sizing:border-box;width:100%;margin:14px 0}input,button,a{padding:14px;border-radius:8px;border:0}button,a{background:#38bdf8;color:#082f49;font-weight:bold;text-decoration:none;cursor:pointer}h1{font-size:28px}p{color:#cbd5e1}</style><main>${body}</main></html>`;
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of sessions) if (value.expires < now) sessions.delete(key);
  for (const [key, value] of attempts) if (value.expires < now) attempts.delete(key);
}, 60000).unref();

export const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
  const id = /(?:^|;\s*)trading_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  const session = sessions.get(id);
  const valid = session && session.expires > Date.now();
  const send = (status, text) => { res.writeHead(status); res.end(text); };
  const redirect = where => { res.writeHead(303, { Location: where }); res.end(); };
  if (req.url === '/verify' && req.method === 'GET') {
    if (valid && session.authenticated) res.setHeader('X-Journal-Authorization', 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64'));
    return send(valid && session.authenticated ? 204 : 401, '');
  }
  if (req.method === 'POST' && (req.url === '/login' || req.url === '/logout')) {
    if (req.headers.origin !== origin) return send(403, 'Invalid request origin');
    let body = '';
    try { for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4096) return send(413, 'Request too large'); } }
    catch { return send(400, 'Invalid request'); }
    const form = new URLSearchParams(body);
    if (!valid || !equal(form.get('csrf') || '', session.csrf)) return send(403, 'Session expired. Reload the login page.');
    if (req.url === '/logout') { sessions.delete(id); res.setHeader('Set-Cookie', cookie('') + '; Max-Age=0'); return redirect('/login'); }
    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
    let limit = attempts.get(ip);
    if (!limit || limit.expires < Date.now()) { limit = { count: 0, expires: Date.now() + 900000 }; attempts.set(ip, limit); }
    if (++limit.count > 10) return send(429, 'Too many login attempts. Try again in 15 minutes.');
    if (!(equal(form.get('username') || '', user) & equal(form.get('password') || '', password))) return send(401, page('<h1>Sign-in failed</h1><p>Incorrect username or password.</p><a href="/login">Try again</a>'));
    sessions.delete(id);
    const next = token();
    sessions.set(next, { authenticated: true, csrf: token(), expires: Date.now() + 43200000 });
    res.setHeader('Set-Cookie', cookie(next));
    return redirect('/');
  }
  if (req.method !== 'GET') return send(405, 'Method not allowed');
  if (req.url !== '/' && req.url !== '/login') return send(404, 'Not found');
  if (valid && session.authenticated) return send(200, page(`<h1>Trading workspace</h1><p>Choose an application.</p><a href="/journal/">Trading Journal</a><a href="/fnoanalyzer/">FNO Analyzer</a><form method="post" action="/logout"><input type="hidden" name="csrf" value="${session.csrf}"><button>Sign out</button></form>`));
  if (sessions.size > 10000) return send(503, 'Please try again later');
  const next = token(), csrf = token();
  sessions.set(next, { authenticated: false, csrf, expires: Date.now() + 900000 });
  res.setHeader('Set-Cookie', cookie(next));
  send(200, page(`<h1>Trading workspace</h1><p>Sign in to access your applications.</p><form method="post" action="/login"><input type="hidden" name="csrf" value="${csrf}"><label>Username<input name="username" autocomplete="username" required maxlength="200"></label><label>Password<input type="password" name="password" autocomplete="current-password" required maxlength="1000"></label><button>Sign in</button></form>`));
});
server.listen(Number(process.env.PORTAL_PORT || 5001), '127.0.0.1');
