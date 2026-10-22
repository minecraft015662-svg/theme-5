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
// --- Shadow Editor theme settings (logo, discord, colours, announcement, footer) ---
const THEME_DB = path.join(path.dirname(DB), 'theme.json');
const THEME_DEF = { logo: '', serverName: 'Shadow Panel', discordName: 'Join our Discord', discordLink: '', accent: '#8f7bff', accent2: '#6a8bff', announce: '', footer: 'Shadow Theme by Sarthak34' };
let theme = { ...THEME_DEF };
try { theme = { ...THEME_DEF, ...JSON.parse(fs.readFileSync(THEME_DB, 'utf8')) }; } catch (e) {}
const saveTheme = () => {
  fs.writeFileSync(THEME_DB, JSON.stringify(theme, null, 1));
  if (RU && RT) rcall(['SET', 'theme', JSON.stringify(theme)]).catch(() => {});
};
const ready = (RU && RT) ? Promise.all([
  rcall(['GET', 'licenses']).then(d => { if (d.result) lic = JSON.parse(d.result); }),
  rcall(['GET', 'theme']).then(d => { if (d.result) theme = { ...THEME_DEF, ...JSON.parse(d.result) }; }).catch(() => {})
]).catch(() => {}) : Promise.resolve();
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
const readBody = req => new Promise((ok, no) => { let d = ''; req.on('data', c => { d += c; if (d.length > 300000) { req.destroy(); no(new Error('big')); } }); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch (e) { no(e); } }); });
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
<style>
:root{--ink:#0d1020;--edge:#2a3160;--v:#8f7bff;--t:#e8eaff;--m:#9aa1c9;--card:rgba(27,33,66,.72)}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--ink);color:var(--t);min-height:100vh;
 background-image:radial-gradient(900px 500px at 8% -10%,rgba(143,123,255,.18),transparent 60%),radial-gradient(700px 500px at 100% 0%,rgba(255,126,182,.10),transparent 55%)}
.layout{display:flex;min-height:100vh}
.side{width:232px;flex:0 0 232px;background:rgba(16,20,42,.85);border-right:1px solid var(--edge);backdrop-filter:blur(10px);padding:18px 14px;position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:16px;padding:6px 8px 16px}
.brand .dot{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,var(--v),#6a8bff)}
.nav{display:flex;flex-direction:column;gap:4px}
.nav a{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;color:var(--m);text-decoration:none;font-size:14px;font-weight:600}
.nav a:hover{background:rgba(143,123,255,.12);color:var(--t)}
.nav a.on{background:rgba(143,123,255,.20);color:#fff;box-shadow:inset 2px 0 0 var(--v)}
.main{flex:1;padding:26px 30px;max-width:1120px}
h1{margin:0 0 2px;font-size:22px}
.sub{color:var(--m);margin:0 0 18px;font-size:14px}
.card{background:var(--card);border:1px solid var(--edge);border-radius:16px;padding:18px 20px;margin:16px 0;backdrop-filter:blur(10px)}
.card h2{font-size:15px;margin:0 0 10px}
label{display:block;font-size:12px;color:var(--m);margin:10px 0 5px}
input[type=text],input[type=email],input[type=number],input[type=url],select{width:100%;padding:10px;border-radius:9px;border:1px solid var(--edge);background:#10142a;color:var(--t);font:inherit;font-size:14px}
input:focus,select:focus{outline:none;border-color:var(--v);box-shadow:0 0 0 3px rgba(143,123,255,.25)}
input[type=color]{width:100%;height:40px;padding:3px;border:1px solid var(--edge);border-radius:9px;background:#10142a}
input[type=file]{font-size:12px;color:var(--m)}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.btn{background:linear-gradient(135deg,var(--v),#6a8bff);color:#0d1020;border:0;border-radius:9px;padding:10px 16px;font:inherit;font-weight:700;cursor:pointer}
.btn.ghost{background:transparent;color:var(--t);border:1px solid var(--edge);font-weight:600}
.btn.sm{padding:5px 10px;font-size:12px;margin-top:0}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--edge)}
.bad{color:#ff7eb6}.ok{color:#5ce1a6}
code,.out{font-family:ui-monospace,SFMono-monospace,monospace;font-size:12px;word-break:break-all}
.out{display:block;background:#0a0d1c;border:1px solid var(--edge);border-radius:9px;padding:11px;margin-top:6px}
.hide{display:none}
.edit{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}
@media(max-width:880px){.edit{grid-template-columns:1fr}.side{display:none}}
.prev{background:#0d1020;border:1px solid var(--edge);border-radius:14px;overflow:hidden}
.prev .ann{padding:7px;text-align:center;font-size:12px;font-weight:700;color:#0d1020;display:none}
.prev .pnav{display:flex;align-items:center;gap:14px;padding:10px 14px;background:rgba(20,24,48,.75);border-bottom:1px solid var(--edge)}
.prev .pnav .lg{height:22px;width:auto;border-radius:5px}
.prev .pnav .nm{font-weight:800;font-size:14px}
.prev .pnav a{padding:0;font-size:12px;color:var(--v);text-decoration:none;margin-left:auto}
.prev .body{padding:16px 14px}
.prev .box{background:rgba(27,33,66,.7);border:1px solid var(--edge);border-radius:12px;padding:14px}
.prev .box h4{margin:0 0 6px;font-size:14px}
.prev .box p{margin:0 0 10px;color:var(--m);font-size:12px}
.prev .cta{display:inline-block;border-radius:8px;padding:8px 14px;color:#0d1020;font-weight:700;font-size:12px}
.prev .ft{padding:10px;text-align:center;font-size:11px;color:var(--m);border-top:1px solid var(--edge)}
.pill{display:inline-block;font-size:11px;padding:3px 9px;border-radius:99px;background:rgba(143,123,255,.18);color:var(--v);font-weight:700}
</style></head><body><div class="layout">
<aside class="side"><div class="brand"><span class="dot"></span> Sarthak34</div>
<nav class="nav" id="nav">
<a data-s="lic" class="on" href="#">Licenses</a>
<a data-s="ed" href="#">Shadow Editor</a>
<a data-s="ins" href="#">Install</a>
</nav></aside>
<main class="main">

<div id="s-lic" class="sec"><h1>Licenses</h1><p class="sub">Create, check and revoke licenses for your customers.</p>
<div class="card"><h2>Create license</h2><div class="row">
<div><label>Customer email</label><input id="email" type="email"></div>
<div><label>Panel domain (* = any)</label><input id="domain" value="*"></div>
<div><label>Plan</label><select id="plan"><option>standard</option><option>pro</option></select></div>
<div><label>Valid days (0 = lifetime)</label><input id="days" type="number" min="0" value="0"></div>
</div><button class="btn" id="mk">Create license</button> <span id="err" class="bad"></span><span class="out" id="new" hidden></span></div>
<div class="card"><h2>All licenses</h2><div style="overflow-x:auto"><table><thead><tr><th>Key</th><th>Email</th><th>Domain</th><th>Plan</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody id="log"></tbody></table></div></div>
</div>

<div id="s-ed" class="sec hide"><h1>Shadow Editor</h1><p class="sub">Changes go live on every installed panel instantly. <span class="pill">Live sync</span></p>
<div class="edit"><div>
<div class="card"><h2>Branding</h2>
<label>Logo image URL</label><input id="logo" type="url" placeholder="https://.../logo.png">
<label>or upload a logo (small images)</label><input id="logof" type="file" accept="image/*">
<label>Server / panel name</label><input id="serverName" type="text" placeholder="Shadow Panel"></div>
<div class="card"><h2>Discord</h2>
<label>Discord link text</label><input id="discordName" type="text" placeholder="Join our Discord">
<label>Discord invite link</label><input id="discordLink" type="url" placeholder="https://discord.gg/abc"></div>
<div class="card"><h2>Colours</h2><div class="row">
<div><label>Accent</label><input id="accent" type="color" value="#8f7bff"></div>
<div><label>Accent 2</label><input id="accent2" type="color" value="#6a8bff"></div></div></div>
<div class="card"><h2>Text</h2>
<label>Announcement bar (blank = hidden)</label><input id="announce" type="text" placeholder="Shadow Theme v2 is live">
<label>Footer credit</label><input id="footer" type="text" placeholder="Shadow Theme by Sarthak34"></div>
<button class="btn" id="save">Save changes</button> <span id="serr" class="bad"></span><span id="sok" class="ok"></span>
</div>
<div><div class="card"><h2>Live preview</h2>
<div class="prev"><div class="ann" id="pv-ann"></div>
<div class="pnav"><img class="lg" id="pv-logo" hidden alt=""><span class="nm" id="pv-name">Shadow Panel</span><a id="pv-dc" href="#">Join our Discord</a></div>
<div class="body"><div class="box"><h4>Your servers</h4><p>Manage your servers, allocations and backups.</p><span class="cta" id="pv-cta">Create server</span></div></div>
<div class="ft" id="pv-ft">Shadow Theme by Sarthak34</div></div>
<p class="sub" style="margin:12px 0 0">Preview updates as you type. Save to push to all panels.</p></div></div>
</div></div>

<div id="s-ins" class="sec hide"><h1>Install</h1><p class="sub">Give customers this command.</p>
<div class="card"><h2>Install command</h2><code class="out" id="cmd"></code>
<p class="sub" style="margin-top:12px">Then run <code>sarthak34</code> for the menu. Keep <b>theme-sync</b> enabled so Shadow Editor settings apply live.</p></div>
</div>

</main></div>
<script>
var $=function(i){return document.getElementById(i)};
$('cmd').textContent='curl -sSL '+location.origin+'/install.sh | sudo bash';
function api(u,o){return fetch(u,o).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'Request failed');return d})})}
function post(u,b){return api(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)})}

// sidebar nav
var links=document.querySelectorAll('.nav a');
for(var i=0;i<links.length;i++){(function(a){a.onclick=function(e){e.preventDefault();
 for(var j=0;j<links.length;j++)links[j].classList.remove('on');a.classList.add('on');
 var secs=document.querySelectorAll('.sec');for(var k=0;k<secs.length;k++)secs[k].classList.add('hide');
 $('s-'+a.getAttribute('data-s')).classList.remove('hide');}})(links[i])}

// licenses
function draw(){api('/api/admin/licenses').then(function(rows){var tb=$('log');tb.textContent='';
 if(!rows.length){tb.innerHTML='<tr><td colspan="7">No licenses yet.</td></tr>';return}
 rows.forEach(function(r){var tr=document.createElement('tr');
  var st=r.revoked?'revoked':(r.expires&&r.expires*1000<Date.now()?'expired':'active');
  [r.key,r.email,r.domain,r.plan,r.expires?new Date(r.expires*1000).toLocaleDateString():'lifetime',st].forEach(function(v){var td=document.createElement('td');td.textContent=v;tr.appendChild(td)});
  var td=document.createElement('td');
  var c=document.createElement('button');c.className='btn ghost sm';c.textContent='Copy';c.onclick=function(){navigator.clipboard.writeText(r.key)};
  var b=document.createElement('button');b.className='btn ghost sm';b.textContent=r.revoked?'Restore':'Revoke';
  b.onclick=function(){post('/api/admin/revoke',{key:r.key,revoked:!r.revoked}).then(draw)};
  td.appendChild(c);td.appendChild(b);tr.appendChild(td);tb.appendChild(tr)})}).catch(function(){})}
$('mk').onclick=function(){$('err').textContent='';
 post('/api/admin/licenses',{email:$('email').value,domain:$('domain').value,plan:$('plan').value,days:parseInt($('days').value||'0',10)})
 .then(function(r){$('new').textContent=r.key;$('new').hidden=false;draw()}).catch(function(e){$('err').textContent=' '+e.message})};
draw();

// ---- Shadow Editor ----
var embed='';
function currentLogo(){return embed||($('logo').value||'')}
function preview(){
 var a=$('accent').value||'#8f7bff', a2=$('accent2').value||'#6a8bff', grad='linear-gradient(135deg,'+a+','+a2+')';
 var ann=$('pv-ann'), an=$('announce').value;
 if(an){ann.style.display='block';ann.textContent=an;ann.style.backgroundImage=grad}else{ann.style.display='none'}
 var lg=currentLogo(), img=$('pv-logo');
 if(lg){img.src=lg;img.hidden=false;img.onerror=function(){img.hidden=true}}else{img.hidden=true;img.removeAttribute('src')}
 $('pv-name').textContent=$('serverName').value||'Shadow Panel';
 var dc=$('pv-dc');dc.textContent=$('discordName').value||'Join our Discord';if($('discordLink').value)dc.href=$('discordLink').value;
 var cta=$('pv-cta');cta.style.backgroundImage=grad;
 document.documentElement.style.setProperty('--v',a);
 $('pv-ft').textContent=$('footer').value||'';
}
var F=['serverName','discordName','discordLink','accent','accent2','announce','footer'];
F.forEach(function(id){$(id).addEventListener('input',preview)});
$('logo').addEventListener('input',function(){embed='';preview()});
$('logof').addEventListener('change',function(){var f=this.files&&this.files[0];if(!f)return;
 if(f.size>280000){$('serr').textContent=' Logo too big to embed - use an image URL instead.';return}
 $('serr').textContent='';var rd=new FileReader();rd.onload=function(){embed=rd.result;preview()};rd.readAsDataURL(f)});
$('save').onclick=function(){$('serr').textContent='';$('sok').textContent='';
 post('/api/admin/theme',{logo:currentLogo(),serverName:$('serverName').value,discordName:$('discordName').value,
  discordLink:$('discordLink').value,accent:$('accent').value,accent2:$('accent2').value,
  announce:$('announce').value,footer:$('footer').value})
 .then(function(){$('sok').textContent=' Saved - live on all panels.'})
 .catch(function(e){$('serr').textContent=' '+e.message})};

// load current settings into the editor
api('/api/admin/theme').then(function(t){
 if(t.logo&&t.logo.indexOf('data:')===0){embed=t.logo;$('logo').value=''}else{$('logo').value=t.logo||''}
 $('serverName').value=t.serverName||'';$('discordName').value=t.discordName||'';
 $('discordLink').value=t.discordLink||'';$('accent').value=t.accent||'#8f7bff';
 $('accent2').value=t.accent2||'#6a8bff';$('announce').value=t.announce||'';$('footer').value=t.footer||'';
 preview()}).catch(function(){preview()});
</script></body></html>
`;

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
    // public: panels fetch this to live-apply the Shadow Editor settings
    if (req.method === 'GET' && p === '/api/theme-config')
      return send(res, 200, theme, 'application/json', { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
    // everything below is admin only
    if (limited('a' + ip, 60) ) return send(res, 429, { error: 'too many requests' });
    if (!isAdmin(req)) return send(res, 401, { error: 'login required' }, 'application/json', { 'WWW-Authenticate': 'Basic realm="Sarthak34 admin"' });
    if (req.method === 'GET' && p === '/') return send(res, 200, PAGE, 'text/html', { 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; script-src 'unsafe-inline'; style-src 'unsafe-inline'" });
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
    if (req.method === 'GET' && p === '/api/admin/theme') return send(res, 200, theme);
    if (req.method === 'POST' && p === '/api/admin/theme') {
      const b = await readBody(req);
      const str = v => (typeof v === 'string' ? v.trim().slice(0, 400) : null);
      const hex = v => /^#[0-9a-f]{6}$/i.test(v) ? v : null;
      let v;
      if ((v = str(b.serverName)) !== null && v) theme.serverName = v;
      if ((v = str(b.discordName)) !== null) theme.discordName = v;
      if ((v = str(b.discordLink)) !== null) theme.discordLink = /^https?:\/\//i.test(v) ? v : '';
      if ((v = str(b.announce)) !== null) theme.announce = v;
      if ((v = str(b.footer)) !== null) theme.footer = v;
      if (typeof b.logo === 'string') {
        const lg = b.logo.trim();
        if (lg === '') theme.logo = '';                      // explicit clear
        else if (/^https?:\/\//i.test(lg)) theme.logo = lg.slice(0, 2000);
        else if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,/i.test(lg)) theme.logo = lg.slice(0, 300000);
        // any other value is invalid -> ignore it and keep the previous logo
      }
      if ((v = str(b.accent)) !== null && hex(v)) theme.accent = v;
      if ((v = str(b.accent2)) !== null && hex(v)) theme.accent2 = v;
      saveTheme(); return send(res, 200, theme);
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 400, { error: 'bad request' }); }
});
ready.then(() => server.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log('Sarthak34 running on port ' + PORT + ' (put HTTPS in front: ' + PUB + ')')));
