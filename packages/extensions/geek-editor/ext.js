// Geek Editor — in-panel theme editor (Arix-style).
// Set the background from an image link, colours, logo, name, Discord and announcement,
// with a live preview. Saved to localStorage (this browser) and applied instantly.
(function () {
  var KEY = 'geek-editor-v1';
  var DEF = { bg: '', accent: '#8f7bff', accent2: '#6a8bff', logo: '', serverName: '',
              discordName: 'Join our Discord', discordLink: '', announce: '' };
  var cfg = DEF;
  try { cfg = Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { cfg = Object.assign({}, DEF); }

  var SWATCHES = ['#8f7bff', '#ff5fa2', '#4aa8ff', '#39d98a', '#ffb547'];
  var BG_PRESETS = [
    { u: '', label: 'none' },
    { u: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600&q=60', c: '#1a2340' },
    { u: 'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1600&q=60', c: '#2a1836' },
    { u: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1600&q=60', c: '#16303f' },
    { u: 'https://images.unsplash.com/photo-1502134249126-9f3755a50d78?w=1600&q=60', c: '#3a1d2e' }
  ];

  function esc(u) { return String(u || '').replace(/["\\]/g, '\\$&'); }

  function apply(c) {
    var r = document.documentElement;
    if (c.accent) r.style.setProperty('--ma-violet', c.accent);
    if (c.accent2) r.style.setProperty('--ma-rose', c.accent2);
    // background image behind all content
    if (c.bg) document.body.style.setProperty('--ma-bg-url', 'url("' + esc(c.bg) + '")');
    else document.body.style.removeProperty('--ma-bg-url');

    var nav = document.getElementById('NavigationBar') || document.querySelector('header,nav');
    // logo
    if (c.logo && nav) {
      var img = nav.querySelector('img');
      if (img) { if (img.getAttribute('src') !== c.logo) img.src = c.logo; img.style.height = '30px'; img.style.width = 'auto'; }
    }
    // name
    if (c.serverName) {
      if (document.title !== c.serverName) document.title = c.serverName;
      var brand = nav && nav.querySelector('a[href="/"], .navbar-brand a, a.brand');
      if (brand && !brand.querySelector('img') && brand.textContent !== c.serverName) brand.textContent = c.serverName;
    }
    // discord
    if (c.discordName || c.discordLink) {
      var as = document.querySelectorAll('a[href*="discord" i]');
      for (var i = 0; i < as.length; i++) {
        if (c.discordName && as[i].textContent !== c.discordName) as[i].textContent = c.discordName;
        if (c.discordLink) as[i].setAttribute('href', c.discordLink);
      }
    }
    // announcement bar
    var bar = document.querySelector('.geek-announce');
    if (!c.announce) { if (bar) bar.remove(); }
    else {
      if (!bar) {
        bar = document.createElement('div'); bar.className = 'geek-announce';
        bar.style.cssText = 'position:sticky;top:0;z-index:99999;padding:7px 14px;text-align:center;font-size:13px;font-weight:700;color:#0b0d1c';
        document.body.prepend(bar);
      }
      var grad = 'linear-gradient(135deg,' + (c.accent || '#8f7bff') + ',' + (c.accent2 || '#6a8bff') + ')';
      if (bar.style.backgroundImage !== grad) bar.style.backgroundImage = grad;
      if (bar.textContent !== c.announce) bar.textContent = c.announce;
    }
  }

  // ---- overlay editor ----
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function buildEditor() {
    if (document.getElementById('geek-overlay')) return;
    var ov = el('div'); ov.id = 'geek-overlay';
    var sh = el('div'); sh.className = 'geek-shell';

    // LEFT: controls
    var left = el('div'); left.className = 'geek-left';
    var head = el('div'); head.className = 'geek-head';
    var h3 = el('h3', null, 'Geek Editor'); head.appendChild(h3);
    var x = el('button', 'geek-x', 'Close'); x.onclick = close; head.appendChild(x);
    left.appendChild(head);

    left.appendChild(el('div', 'geek-sec', 'Background'));
    var bgurl = el('input'); bgurl.type = 'url'; bgurl.placeholder = 'Paste an image link…'; bgurl.value = cfg.bg;
    left.appendChild(bgurl);
    bgurl.oninput = function () {
      cfg.bg = bgurl.value.trim();
      var kids = bgrow.children; for (var i = 0; i < kids.length; i++) kids[i].classList.remove('on');
      refresh();
    };
    var bgrow = el('div', 'geek-bgrow');
    BG_PRESETS.forEach(function (p) {
      var t = el('div', 'geek-bgt' + (p.u ? '' : ' none'));
      if (p.u) { t.style.backgroundImage = 'url("' + p.u + '")'; } else { t.textContent = '∅'; }
      if ((cfg.bg || '') === p.u) t.classList.add('on');
      t.onclick = function () { cfg.bg = p.u; bgurl.value = p.u; mark(bgrow, t); refresh(); };
      bgrow.appendChild(t);
    });
    left.appendChild(bgrow);

    left.appendChild(el('div', 'geek-sec', 'Accent colour'));
    var sw = el('div', 'geek-swatches');
    SWATCHES.forEach(function (col) {
      var s = el('div', 'geek-sw'); s.style.background = col;
      if (col.toLowerCase() === (cfg.accent || '').toLowerCase()) s.classList.add('on');
      s.onclick = function () { cfg.accent = col; mark(sw, s); refresh(); };
      sw.appendChild(s);
    });
    left.appendChild(sw);
    var cRow = el('div', 'geek-row');
    var c1 = el('input'); c1.type = 'color'; c1.value = cfg.accent; c1.oninput = function () { cfg.accent = c1.value; refresh(); };
    var c2 = el('input'); c2.type = 'color'; c2.value = cfg.accent2; c2.oninput = function () { cfg.accent2 = c2.value; refresh(); };
    cRow.appendChild(wrap('Accent', c1)); cRow.appendChild(wrap('Accent 2', c2));
    left.appendChild(cRow);

    left.appendChild(el('div', 'geek-sec', 'Branding'));
    var lg = el('input'); lg.type = 'url'; lg.placeholder = 'Logo image link'; lg.value = cfg.logo;
    lg.oninput = function () { cfg.logo = lg.value.trim(); refresh(); };
    left.appendChild(wrap('Panel logo', lg));
    var nm = el('input'); nm.type = 'text'; nm.placeholder = 'Panel name'; nm.value = cfg.serverName;
    nm.oninput = function () { cfg.serverName = nm.value; refresh(); };
    left.appendChild(wrap('Panel name', nm));

    left.appendChild(el('div', 'geek-sec', 'Discord'));
    var dn = el('input'); dn.type = 'text'; dn.placeholder = 'Join our Discord'; dn.value = cfg.discordName;
    dn.oninput = function () { cfg.discordName = dn.value; refresh(); };
    left.appendChild(wrap('Discord link text', dn));
    var dl = el('input'); dl.type = 'url'; dl.placeholder = 'https://discord.gg/…'; dl.value = cfg.discordLink;
    dl.oninput = function () { cfg.discordLink = dl.value.trim(); refresh(); };
    left.appendChild(wrap('Discord invite link', dl));

    left.appendChild(el('div', 'geek-sec', 'Announcement'));
    var an = el('input'); an.type = 'text'; an.placeholder = 'Blank = hidden'; an.value = cfg.announce;
    an.oninput = function () { cfg.announce = an.value; refresh(); };
    left.appendChild(wrap('Announcement bar', an));

    var act = el('div', 'geek-actions');
    var save = el('button', 'geek-save', 'Save Changes');
    var msg = el('span', 'geek-msg');
    save.onclick = function () {
      try { localStorage.setItem(KEY, JSON.stringify(cfg)); msg.textContent = 'Saved — live on this panel.'; }
      catch (e) { msg.textContent = 'Could not save (storage blocked).'; }
      setTimeout(function () { msg.textContent = ''; }, 2500);
    };
    var reset = el('button', 'geek-reset', 'Reset');
    reset.onclick = function () { cfg = Object.assign({}, DEF); try { localStorage.removeItem(KEY); } catch (e) {} close(); apply(cfg); };
    act.appendChild(save); act.appendChild(reset); act.appendChild(msg);
    left.appendChild(act);

    // RIGHT: live preview
    var right = el('div'); right.className = 'geek-right';
    right.appendChild(el('div', 'geek-sec', 'Live preview'));
    var pv = el('div', 'geek-prev');
    var pbar = el('div', 'pbar', '');
    var pnav = el('div', 'pnav');
    var pimg = el('img'); pimg.hidden = true; pnav.appendChild(pimg);
    var pnm = el('span', 'nm', 'Panel'); pnav.appendChild(pnm);
    var pdc = el('a', null, 'Discord'); pdc.href = '#'; pnav.appendChild(pdc);
    var pbody = el('div', 'pbody');
    var pbox = el('div', 'pbox'); pbox.appendChild(el('h4', null, 'Your servers'));
    pbox.appendChild(el('p', null, 'Manage your servers and backups.'));
    var pcta = el('span', 'pcta', 'Create server'); pbox.appendChild(pcta);
    pbody.appendChild(pbox);
    var pft = el('div', 'pft', '');
    pv.appendChild(pbar); pv.appendChild(pnav); pv.appendChild(pbody); pv.appendChild(pft);
    right.appendChild(pv);
    var hint = el('div', 'geek-sec', 'Preview updates as you type. Save to keep it.');

    function refresh() {
      var grad = 'linear-gradient(135deg,' + cfg.accent + ',' + cfg.accent2 + ')';
      if (cfg.announce) { pbar.style.display = 'block'; pbar.textContent = cfg.announce; pbar.style.backgroundImage = grad; }
      else pbar.style.display = 'none';
      if (cfg.logo) { pimg.src = cfg.logo; pimg.hidden = false; pimg.onerror = function () { pimg.hidden = true; }; } else { pimg.hidden = true; }
      pnm.textContent = cfg.serverName || 'Panel';
      pdc.textContent = cfg.discordName || 'Discord'; if (cfg.discordLink) pdc.href = cfg.discordLink;
      pcta.style.backgroundImage = grad;
      pft.textContent = cfg.serverName ? '' : '';
      // live-apply to the real page behind the overlay
      apply(cfg);
    }
    left._refresh = refresh;

    function mark(row, on) { var kids = row.children; for (var i = 0; i < kids.length; i++) kids[i].classList.remove('on'); on.classList.add('on'); }
    function wrap(label, input) { var w = el('div'); var l = el('label', null, label); w.appendChild(l); w.appendChild(input); return w; }

    sh.appendChild(left); sh.appendChild(right); ov.appendChild(sh);
    ov.onclick = function (e) { if (e.target === ov) close(); };
    document.body.appendChild(ov);
    ov._refresh = refresh;
    refresh();
  }

  function open() { buildEditor(); var ov = document.getElementById('geek-overlay'); ov.classList.add('on'); if (ov._refresh) ov._refresh(); }
  function close() { var ov = document.getElementById('geek-overlay'); if (ov) ov.classList.remove('on'); }

  function mount() {
    apply(cfg); // apply saved settings first
    // floating trigger
    if (!document.querySelector('.geek-fab')) {
      var fab = el('button', 'geek-fab', '⚙'); fab.title = 'Geek Editor'; fab.setAttribute('aria-label', 'Open Geek Editor');
      fab.onclick = open; document.body.appendChild(fab);
    }
    // avatar dropdown entry (best-effort; FAB always works)
    try {
      var items = document.querySelectorAll('a, button, [role="menuitem"]');
      for (var i = 0; i < items.length; i++) {
        if (/log\s*out|logout/i.test(items[i].textContent || '')) {
          var logout = items[i];
          var host = logout.closest('[role="menu"]') || logout.parentElement;
          if (host && host !== document.body && !host.querySelector('.geek-menu-item')) {
            var mi = el('div', 'geek-menu-item', 'Geek Editor'); mi.onclick = open;
            host.insertBefore(mi, logout);
          }
          break;
        }
      }
    } catch (e) {}
    // re-apply on SPA re-renders (throttled) so the look survives route changes
    var pending = false;
    try {
      new MutationObserver(function () {
        if (pending) return; pending = true;
        setTimeout(function () { pending = false; apply(cfg); }, 300);
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
