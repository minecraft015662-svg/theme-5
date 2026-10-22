// theme-overhaul: scrubs leftover stock Pterodactyl branding (copyright line,
// "Pterodactyl Software" credits) so the panel reads as a fully custom theme.
// Defensive + throttled so it stays cheap on the React SPA.
(function () {
  function scrub() {
    var nodes = document.querySelectorAll('footer, p, span, div, a');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.children.length > 3) continue;              // only leaf-ish text nodes
      var t = (el.textContent || '').trim();
      if (t && t.length < 140 && /pterodactyl/i.test(t)) {
        el.style.setProperty('display', 'none', 'important');
      }
    }
  }
  var pending = false;
  function queue() { if (pending) return; pending = true; setTimeout(function () { pending = false; scrub(); }, 400); }
  function start() {
    scrub();
    try { new MutationObserver(queue).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
