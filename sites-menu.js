(function () {
  var sites = [
    { n: 'Brand AI Agent', d: '쇼핑 큐레이션', u: 'https://brandaihub.com/' },
    { n: 'Brand AI Sports', d: '스포츠', u: 'https://sports.brandaihub.com/' },
    { n: 'Brand AI Edu', d: '교육', u: 'https://edu.brandaihub.com/' },
    { n: 'Brand AI Digital', d: '디지털', u: 'https://digital.brandaihub.com/' }
  ];
  if (location.pathname.indexOf('/admin') === 0) return;

  var css =
    '.bx-wrap{position:relative;display:inline-block;margin:0 12px 0 0;vertical-align:middle;font:inherit}' +
    '.bx-fixed{position:fixed;top:12px;right:12px;z-index:9999;margin:0}' +
    '.bx-btn{background:none;color:inherit;font:inherit;font-size:13px;cursor:pointer;' +
    'border:1px solid rgba(128,128,128,.4);border-radius:999px;padding:7px 15px;font-weight:600}' +
    '.bx-btn:hover{background:rgba(128,128,128,.12)}' +
    '.bx-menu{display:none;position:absolute;right:0;top:calc(100% + 8px);min-width:210px;max-width:calc(100vw - 24px);' +
    'background:Canvas;color:CanvasText;border:1px solid rgba(128,128,128,.3);' +
    'border-radius:12px;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:9999}' +
    '.bx-open .bx-menu{display:block}' +
    '.bx-menu a{display:block;padding:10px 12px;border-radius:8px;color:inherit;' +
    'text-decoration:none;font-size:14px}' +
    '.bx-menu a:hover{background:rgba(128,128,128,.14)}' +
    '.bx-menu small{display:block;opacity:.6;font-size:12px;margin-top:2px}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  var wrap = document.createElement('div');
  wrap.className = 'bx-wrap';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bx-btn';
  btn.setAttribute('aria-expanded', 'false');
  btn.textContent = 'Brand AI ▾';
  var menu = document.createElement('div');
  menu.className = 'bx-menu';

  sites.forEach(function (s) {
    if (new URL(s.u).hostname === location.hostname) return;
    var a = document.createElement('a');
    a.href = s.u;
    a.innerHTML = s.n + '<small>' + s.d + '</small>';
    menu.appendChild(a);
  });

  function setOpen(o) {
    wrap.classList.toggle('bx-open', o);
    btn.setAttribute('aria-expanded', o ? 'true' : 'false');
  }
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    setOpen(!wrap.classList.contains('bx-open'));
  });
  document.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });

  wrap.appendChild(btn);
  wrap.appendChild(menu);

  var admin = document.querySelector('a[href="/admin"], a[href="/admin/"]');
  var bar = document.querySelector('.gnb-top');
  if (admin && admin.parentNode) { admin.parentNode.insertBefore(wrap, admin); }
  else if (bar) { wrap.style.margin = '0'; bar.appendChild(wrap); }
  else { wrap.classList.add('bx-fixed'); document.body.appendChild(wrap); }
})();
