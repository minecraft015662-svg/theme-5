(function () {
  var COLORS = ['#8f7bff', '#ff7eb6', '#4cc9f0', '#3ddc97', '#ffb454'];
  var KEY = 's34-accent';
  function apply(c) { document.documentElement.style.setProperty('--ma-violet', c); }
  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function mount() {
    if (document.getElementById('s34-accent')) return;
    var cur = saved() || COLORS[0]; apply(cur);
    var box = document.createElement('div'); box.id = 's34-accent';
    COLORS.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.style.backgroundColor = c;
      b.setAttribute('aria-label', 'Accent ' + c); b.setAttribute('aria-pressed', c === cur ? 'true' : 'false');
      b.onclick = function () {
        apply(c); try { localStorage.setItem(KEY, c); } catch (e) {}
        box.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
      };
      box.appendChild(b);
    });
    document.body.appendChild(box);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
