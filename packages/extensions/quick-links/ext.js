(function () {
  var LINKS = [ // edit me
    { t: 'Discord', u: 'https://discord.gg/yourinvite' },
    { t: 'Billing', u: 'https://billing.example.com' },
    { t: 'Support', u: 'https://example.com/support' }
  ];
  function mount() {
    if (document.getElementById('s34-links')) return;
    var box = document.createElement('div'); box.id = 's34-links';
    LINKS.forEach(function (l) {
      var a = document.createElement('a'); a.href = l.u; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = l.t; box.appendChild(a);
    });
    document.body.appendChild(box);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
