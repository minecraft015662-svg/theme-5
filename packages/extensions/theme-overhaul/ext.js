// theme-overhaul: hides leftover stock Pterodactyl branding (the copyright line).
// React-safe: it only sets style.display on small footer text nodes and never uses
// a MutationObserver (observers that re-mutate React's DOM can blank the panel).
// It runs once shortly after load plus a couple of retries, then stops.
(function () {
  function scrub() {
    var nodes = document.querySelectorAll('footer, p, span, small, div');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.children.length > 0) continue;           // leaf text nodes only
      var t = (el.textContent || '').trim();
      if (t && t.length < 140 && /pterodactyl/i.test(t)) el.style.setProperty('display', 'none', 'important');
    }
  }
  function start() {
    scrub();
    setTimeout(scrub, 800);    // catch late-rendered footer text
    setTimeout(scrub, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
