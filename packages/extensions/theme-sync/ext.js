// theme-sync: applies your license-server theme settings to the panel using only
// SAFE techniques. It sets CSS custom properties, a background-image layer and an
// announcement bar that THIS script owns, and makes a couple of safe attribute
// tweaks. It never removes, inserts or rewrites the nodes React renders (that
// desyncs React's tree and can blank the whole panel), and it uses no
// MutationObserver (observers re-triggering each other is what crashed the app).
(function () {
  var S = (window.__S34_SERVER || '').replace(/\/+$/, '');
  if (!S || !window.fetch) return;
  var cfg = null;

  function apply(t) {
    if (!t || !document.body) return;
    var a = t.accent || '#8f7bff', a2 = t.accent2 || '#6a8bff';

    // colours + background (pure CSS custom properties — React never touches these)
    document.documentElement.style.setProperty('--ma-violet', a);
    document.documentElement.style.setProperty('--ma-rose', a2);
    if (t.bg) document.body.style.setProperty('--ma-bg-url', 'url("' + String(t.bg).replace(/["\\]/g, '\\$&') + '")');
    else document.body.style.removeProperty('--ma-bg-url');

    // announcement bar — an element THIS script owns (React never renders it, so
    // adding/removing it is safe). Idempotent: only writes when the value differs.
    var bar = document.getElementById('s34-announce');
    if (!t.announce) { if (bar) bar.remove(); }
    else {
      if (!bar) {
        bar = document.createElement('div'); bar.id = 's34-announce';
        bar.style.cssText = 'position:sticky;top:0;z-index:99999;padding:7px 14px;text-align:center;font-size:13px;font-weight:700;color:#0b0d1c';
        document.body.prepend(bar);
      }
      bar.style.backgroundImage = 'linear-gradient(135deg,' + a + ',' + a2 + ')';
      if (bar.textContent !== t.announce) bar.textContent = t.announce;
    }

    // safe attribute tweaks only (setting an attribute React declared is fine — React
    // just overwrites it on its next render; it never throws). Never touch text nodes.
    if (t.logo) {
      var img = document.querySelector('#NavigationBar img, #logo img, header img, nav img');
      if (img && img.getAttribute('src') !== t.logo) img.setAttribute('src', t.logo);
    }
    if (t.discordLink) {
      var as = document.querySelectorAll('a[href*="discord"]');
      for (var i = 0; i < as.length; i++) if (as[i].getAttribute('href') !== t.discordLink) as[i].setAttribute('href', t.discordLink);
    }
  }

  function sync() {
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
    fetch(S + '/api/theme-config', ctl ? { signal: ctl.signal } : undefined)
      .then(function (r) { return r.json(); })
      .then(function (j) { clearTimeout(to); cfg = j; apply(j); })
      .catch(function () { clearTimeout(to); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else sync();
  setInterval(function () { if (cfg) apply(cfg); }, 15000); // re-assert on a timer, NOT an observer
})();
