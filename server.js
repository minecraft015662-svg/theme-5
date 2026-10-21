'use strict';
// Sarthak34 all-in-one: admin website + license API + install.sh + theme packages. No dependencies.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
// Load .env (and .env.local) without any dependency.
(function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    let s; try { s = fs.readFileSync(path.join(__dirname, f), 'utf8'); } catch (e) { continue; }
    for (const line of s.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      let v = m[2].trim();
      if ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'")) v = v.slice(1, -1);
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  }
})();

const PORT = +process.env.PORT || 3434, USER = process.env.ADMIN_USER || 'admin';
const PROD = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
let PASS = process.env.ADMIN_PASS;
let PUB = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');

if (!PASS || PASS.length < 8) {
  if (PROD) { console.error('Set ADMIN_PASS (min 8 chars)'); process.exit(1); }
  PASS = crypto.randomBytes(18).toString('base64url');
  console.warn('[dev] ADMIN_PASS not set \u2014 generated one for this run: ' + PASS);
}
if (!/^https?:\/\//.test(PUB)) {
  if (PROD) { console.error('Set PUBLIC_URL, e.g. https://license.example.com'); process.exit(1); }
  PUB = 'http://localhost:' + PORT;
  console.warn('[dev] PUBLIC_URL not set \u2014 using ' + PUB);
}
const ROOT = __dirname, DB = path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'licenses.json');
fs.mkdirSync(path.dirname(DB), { recursive: true });
let lic = []; try { lic = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (e) {}
const RU = process.env.UPSTASH_REDIS_REST_URL, RT = process.env.UPSTASH_REDIS_REST_TOKEN;
const rcall = cmd => fetch(RU, { method: 'POST', headers: { Authorization: 'Bearer ' + RT }, body: JSON.stringify(cmd) }).then(r => r.json());
const save = () => {
  fs.writeFileSync(DB + '.tmp', JSON.stringify(lic, null, 1)); fs.renameSync(DB + '.tmp', DB);
  if (RU && RT) rcall(['SET', 'licenses', JSON.stringify(lic)]).catch(() => {});
};
const ready = (RU && RT) ? rcall(['GET', 'licenses']).then(d => { if (d.result) lic = JSON.parse(d.result); }).catch(() => {}) : Promise.resolve();
const h = s => crypto.createHash('sha256').update(String(s)).digest();
const eq = (a, b) => crypto.timingSafeEqual(h(a), h(b));
const hits = new Map();
const limited = (k, max) => { const n = Date.now(), r = (hits.get(k) || []).filter(t => n - t < 60000); r.push(n); hits.set(k, r); return r.length > max; };
setInterval(() => hits.clear(), 600000).unref();
const isAdmin = req => {
  const a = req.headers.authorization || ''; if (!a.startsWith('Basic ')) return false;
  const [u, ...p] = Buffer.from(a.slice(6), 'base64').toString().split(':');
  return eq(u, USER) && eq(p.join(':'), PASS);
};
const send = (res, code, body, type = 'application/json', extra = {}) => {
  res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = req => new Promise((ok, no) => { let d = ''; req.on('data', c => { d += c; if (d.length > 10000) { req.destroy(); no(new Error('big')); } }); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch (e) { no(e); } }); });
const normDom = d => (String(d || '*').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[\/:].*$/, '')) || '*';

function verify(b) {
  const l = lic.find(x => x.key === String(b.license || '').trim());
  if (!l) return { ok: false, reason: 'invalid license' };
  if (l.revoked) return { ok: false, reason: 'license was revoked' };
  if (l.email !== String(b.email || '').trim().toLowerCase()) return { ok: false, reason: 'email does not match this license' };
  const dom = normDom(b.domain);
  if (l.domain !== '*' && l.domain !== dom) return { ok: false, reason: 'this license is for ' + l.domain + ', but this panel is ' + dom };
  if (l.expires && l.expires * 1000 < Date.now()) return { ok: false, reason: 'license expired' };
  return { ok: true, plan: l.plan };
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sarthak34 admin</title>
<style>:root{--ink:#0d1020;--edge:#2a3160;--v:#8f7bff;--r:#ff7eb6;--t:#e8eaff;--m:#9aa1c9}*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:var(--ink);color:var(--t);background-image:radial-gradient(800px 460px at 10% -10%,rgba(143,123,255,.22),transparent 60%)}
main{max-width:980px;margin:0 auto;padding:26px 16px}h1{margin:0 0 4px}h2{font-size:17px;margin:0 0 10px}p{color:var(--m)}.card{background:rgba(27,33,66,.75);border:1px solid var(--edge);border-radius:12px;padding:18px;margin:16px 0}
label{display:block;font-size:13px;color:var(--m);margin:8px 0 4px}input,select{width:100%;padding:10px;border-radius:8px;border:1px solid var(--edge);background:#10142a;color:var(--t);font:inherit}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}button{background:var(--v);color:#10102a;border:0;border-radius:8px;padding:9px 14px;font:inherit;font-weight:700;cursor:pointer;margin-top:12px}
button.g{background:transparent;color:var(--t);border:1px solid var(--edge);padding:4px 9px;font-size:12px;margin:0 4px 0 0}code,.out{font-family:ui-monospace,monospace;font-size:12px;word-break:break-all}.out{display:block;background:#10142a;border:1px solid var(--edge);border-radius:8px;padding:10px;margin-top:8px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--edge)}.wrap{overflow-x:auto}.bad{color:var(--r)}</style></head><body><main>
<h1>Sarthak34 admin</h1><p>Create, check and revoke licenses. Customers install with the command below.</p>
<div class="card"><h2>Install command for customers</h2><code class="out" id="cmd"></code></div>
<div class="card"><h2>Create license</h2><div class="row">
<div><label>Customer email</label><input id="email" type="email"></div>
<div><label>Panel domain (or * for any)</label><input id="domain" value="*"></div>
<div><label>Plan</label><select id="plan"><option>standard</option><option>pro</option></select></div>
<div><label>Valid days (0 = lifetime)</label><input id="days" type="number" min="0" value="0"></div></div>
<button id="mk">Create license</button> <span id="err" class="bad"></span><span class="out" id="new" hidden></span></div>
<div class="card wrap"><h2>All licenses</h2><table><thead><tr><th>Key</th><th>Email</th><th>Domain</th><th>Plan</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody id="log"></tbody></table></div></main>
<script>
const $=i=>document.getElementById(i);$('cmd').textContent='curl -sSL '+location.origin+'/install.sh | sudo bash';
const api=async(u,o)=>{const r=await fetch(u,o);const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed');return d};
const post=(u,b)=>api(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
async function draw(){const rows=await api('/api/admin/licenses');const tb=$('log');tb.textContent='';
 if(!rows.length){tb.innerHTML='<tr><td colspan="7">No licenses yet.</td></tr>';return}
 rows.forEach(r=>{const tr=document.createElement('tr');
  const st=r.revoked?'revoked':(r.expires&&r.expires*1000<Date.now()?'expired':'active');
  [r.key,r.email,r.domain,r.plan,r.expires?new Date(r.expires*1000).toLocaleDateString():'lifetime',st].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td)});
  const td=document.createElement('td');
  const c=document.createElement('button');c.className='g';c.textContent='Copy';c.onclick=()=>navigator.clipboard.writeText(r.key);
  const b=document.createElement('button');b.className='g';b.textContent=r.revoked?'Restore':'Revoke';b.onclick=async()=>{await post('/api/admin/revoke',{key:r.key,revoked:!r.revoked});draw()};
  td.append(c,b);tr.appendChild(td);tb.appendChild(tr)})}
$('mk').onclick=async()=>{$('err').textContent='';try{
 const r=await post('/api/admin/licenses',{email:$('email').value,domain:$('domain').value,plan:$('plan').value,days:parseInt($('days').value||'0',10)});
 $('new').textContent=r.key;$('new').hidden=false;draw()}catch(e){$('err').textContent=' '+e.message}};
draw();
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const ip = process.env.TRUST_PROXY ? (String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress) : req.socket.remoteAddress, u = new URL(req.url, 'http://x'), p = u.pathname;
  try {
    if (req.method === 'POST' && p === '/api/verify') {
      if (limited('v' + ip, 30)) return send(res, 429, { ok: false, reason: 'too many attempts, wait a minute' });
      return send(res, 200, verify(await readBody(req)));
    }
    if (req.method === 'GET' && p === '/install.sh') {
      return send(res, 200, fs.readFileSync(path.join(ROOT, 'install.sh'), 'utf8').split('__SERVER__').join(PUB), 'text/plain');
    }
    if (req.method === 'GET' && p.startsWith('/packages/')) {
      const f = path.normalize(path.join(ROOT, p));
      if (!f.startsWith(path.join(ROOT, 'packages') + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return send(res, 404, { error: 'not found' });
      const t = { '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' }[path.extname(f)] || 'text/plain';
      return send(res, 200, fs.readFileSync(f), t);
    }
    // everything below is admin only
    if (limited('a' + ip, 60) ) return send(res, 429, { error: 'too many requests' });
    if (!isAdmin(req)) return send(res, 401, { error: 'login required' }, 'application/json', { 'WWW-Authenticate': 'Basic realm="Sarthak34 admin"' });
    if (req.method === 'GET' && p === '/') return send(res, 200, PAGE, 'text/html', { 'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'" });
    if (req.method === 'GET' && p === '/api/admin/licenses') return send(res, 200, lic.slice().reverse());
    if (req.method === 'POST' && p === '/api/admin/licenses') {
      const b = await readBody(req), email = String(b.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Enter a valid email' });
      const days = Math.max(0, parseInt(b.days, 10) || 0), now = Math.floor(Date.now() / 1000);
      const k = crypto.randomBytes(12).toString('hex').toUpperCase().match(/.{6}/g).join('-');
      const l = { key: 'S34-' + k, email, domain: normDom(b.domain), plan: b.plan === 'pro' ? 'pro' : 'standard', expires: days ? now + days * 86400 : 0, created: now, revoked: false };
      lic.push(l); save(); return send(res, 200, l);
    }
    if (req.method === 'POST' && p === '/api/admin/revoke') {
      const b = await readBody(req), l = lic.find(x => x.key === b.key);
      if (!l) return send(res, 404, { error: 'license not found' });
      l.revoked = !!b.revoked; save(); return send(res, 200, l);
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 400, { error: 'bad request' }); }
});
ready.then(() => server.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log('Sarthak34 running on port ' + PORT + ' (put HTTPS in front: ' + PUB + ')')));
