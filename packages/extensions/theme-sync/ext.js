// theme-sync: pulls Shadow Editor settings from your license server and applies them live.
// window.__S34_SERVER is written by install.sh (the PUBLIC_URL of your license server).
(function () {
  var S = (window.__S34_SERVER || '').replace(/\/+$/, '');
  if (!S || !window.fetch) return;
  var cfg = null, obs = null;

  function style() {
    var s = document.getElementById('s34-sync-style');
    if (!s) { s = document.createElement('style'); s.id = 's34-sync-style'; document.head.appendChild(s); }
    return s;
  }

  function apply(t) {
    if (!t) return;
    var a = t.accent || '#8f7bff', a2 = t.accent2 || '#6a8bff', grad = 'linear-gradient(135deg,' + a + ',' + a2 + ')';

    // colours live on :root, so they survive React re-renders
    document.documentElement.style.setProperty('--ma-violet', a);
    document.documentElement.style.setProperty('--ma-rose', a2);
    style().textContent =
      'button[type="submit"],[class*="Button___Styled"]{background-image:' + grad + '!important}';

    // announcement bar (editor-driven)
    var bar = document.querySelector('.s34-announce');
    if (!t.announce) { if (bar) bar.remove(); }
    else {
      if (!bar) {
        bar = document.createElement('div'); bar.className = 's34-announce';
        bar.style.cssText = 'position:sticky;top:0;z-index:99999;padding:7px 14px;text-align:center;font-size:13px;font-weight:600;color:#0d1020';
        document.body.prepend(bar);
      }
      if (bar.style.backgroundImage !== grad) bar.style.backgroundImage = grad;
      if (bar.textContent !== t.announce) bar.textContent = t.announce;
    }

    // logo in the top nav
    if (t.logo) {
      var nav = document.getElementById('NavigationBar') || document.querySelector('header,nav');
      if (nav) {
        var img = nav.querySelector('img');
        if (img) {
          if (img.getAttribute('src') !== t.logo) img.src = t.logo;
          img.style.height = '26px'; img.style.width = 'auto';
        } else {
          img = document.createElement('img'); img.src = t.logo;
          img.alt = t.serverName || 'logo';
          img.style.cssText = 'height:26px;width:auto;vertical-align:middle;border-radius:6px';
          nav.insertBefore(img, nav.firstChild);
        }
      }
    }

    // server / brand name
    if (t.serverName) {
      if (document.title !== t.serverName) document.title = t.serverName;
      var brand = document.querySelector('#NavigationBar a[href="/"],#NavigationBar .navbar-brand a,#NavigationBar a.brand');
      if (brand) {
        if (brand.querySelector('img')) brand.title = t.serverName;
        else if (brand.textContent !== t.serverName) brand.textContent = t.serverName;
      }
    }

    // Discord: rename the label and point every discord link at the invite
    if (t.discordName || t.discordLink) {
      var as = document.querySelectorAll('a[href*="discord" i]');
      for (var i = 0; i < as.length; i++) {
        if (t.discordName && as[i].textContent !== t.discordName) as[i].textContent = t.discordName;
        if (t.discordLink) as[i].setAttribute('href', t.discordLink);
      }
    }

    // footer / credit line
    if (t.footer) {
      var f = document.querySelector('footer,[class*="footer" i]');
      if (f) {
        var s = f.querySelector('span,small,p');
        if (s && s.textContent.length < 90 && s.textContent !== t.footer) s.textContent = t.footer;
      }
    }
  }

  function watch() {
    if (obs || !document.body) return;
    var pending = false;
    obs = new MutationObserver(function () {
      if (pending || !cfg) return;
      pending = true;
      setTimeout(function () { pending = false; if (cfg) apply(cfg); }, 250);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function sync() {
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
    fetch(S + '/api/theme-config', ctl ? { signal: ctl.signal } : undefined)
      .then(function (r) { return r.json(); })
      .then(function (j) { clearTimeout(to); cfg = j; apply(j); watch(); })
      .catch(function () { clearTimeout(to); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
  setInterval(sync, 60000); // pick up editor changes without a manual reload
})();
