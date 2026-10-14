// Renders a marketing-plan deck from window.__PLAN__ (public page) or from
// messages posted by the dashboard editor (preview). All text goes in through
// textContent; the only markup set from strings is the fixed icon set below.
(function () {
  var ICONS = {
    handshake: '<path d="M2 7.5 5.5 6l4.3 1.3-2.6 2.6a1.5 1.5 0 0 0 2.1 2.1l2.4-2.4 1.3.7 4.5 4.5a1.3 1.3 0 0 1-1.8 1.8l-.4-.4-1 1a1.3 1.3 0 0 1-1.8 0l-.7-.7-.9.9a1.3 1.3 0 0 1-1.8 0l-.7-.7-.6.6a1.3 1.3 0 0 1-1.9-.1L2 12V7.5zm20 0V12l-2.5 2.6-5.3-5.3-1.9 1a.5.5 0 0 1-.7-.7l2.9-2.9L18.5 6 22 7.5z"/>',
    megaphone: '<path d="M3 10v4a2 2 0 0 0 2 2h1l2 5h3l-1.6-5H11l7 3V5l-7 3H5a2 2 0 0 0-2 2zm17.5 1a2.5 2.5 0 0 1 0 2v-2z"/><path d="M20 9.5v5a2.5 2.5 0 0 0 0-5z"/>',
    community: '<path d="M12 2.5 20.2 7v10L12 21.5 3.8 17V7L12 2.5zm0 2.3L5.8 8.2v7.6L12 19.2l6.2-3.4V8.2L12 4.8zM12 8a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm-4 9c.4-2 2-3 4-3s3.6 1 4 3H8z"/><circle cx="12" cy="4" r="1.6"/><circle cx="19.4" cy="8.3" r="1.6"/><circle cx="19.4" cy="15.7" r="1.6"/><circle cx="12" cy="20" r="1.6"/><circle cx="4.6" cy="15.7" r="1.6"/><circle cx="4.6" cy="8.3" r="1.6"/>',
    camera: '<path d="M9 4h6l1.5 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5L9 4zm3 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>',
    trophy: '<path d="M7 3h10v2h3v3a4 4 0 0 1-3.3 3.9A5 5 0 0 1 13 15.9V18h3v2H8v-2h3v-2.1a5 5 0 0 1-3.7-4A4 4 0 0 1 4 8V5h3V3zm-1 4v1a2 2 0 0 0 1 1.7V7H6zm12 0h-1v2.7A2 2 0 0 0 18 8V7z"/>',
    star: '<path d="m12 2.5 2.9 6.2 6.6.8-4.9 4.6 1.3 6.7L12 17.5l-5.9 3.3 1.3-6.7L2.5 9.5l6.6-.8L12 2.5z"/>',
    chart: '<path d="M3 20h18v2H3zM4 13h3v6H4zm5-4h3v10H9zm5-4h3v14h-3zm5 2h3v12h-3z"/>',
    mic: '<path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm-7 10h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h3v2H8v-2h3v-2.1A7 7 0 0 1 5 12z"/>',
    heart: '<path d="M12 21s-7.5-4.6-9.5-9.3C1.2 8.5 3.2 5 6.7 5c2 0 3.5 1 4.3 2.4h2C13.8 6 15.3 5 17.3 5c3.5 0 5.5 3.5 4.2 6.7C19.5 16.4 12 21 12 21z"/>',
    globe: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 9h-3a15 15 0 0 0-1.1-5.2A8 8 0 0 1 18.9 11zM12 4c.9 1 2 3.2 2.3 7H9.7C10 7.2 11.1 5 12 4zM9.2 5.8A15 15 0 0 0 8.1 11h-3a8 8 0 0 1 4.1-5.2zM5.1 13h3c.1 2 .5 3.8 1.1 5.2A8 8 0 0 1 5.1 13zM12 20c-.9-1-2-3.2-2.3-7h4.6c-.3 3.8-1.4 6-2.3 7zm2.8-1.8c.6-1.4 1-3.2 1.1-5.2h3a8 8 0 0 1-4.1 5.2z"/>',
    calendar: '<path d="M7 2h2v2h6V2h2v2h3a1 1 0 0 1 1 1v15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1h3V2zm12 8H5v10h14V10z"/>',
    dollar: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15.5V19h-2v-1.5c-1.8-.2-3-1.3-3.1-3h2c.1.8.8 1.3 2 1.3 1.1 0 1.8-.5 1.8-1.2 0-.6-.4-1-1.9-1.4C9.6 12.6 8 11.9 8 10c0-1.5 1.2-2.6 3-2.9V5.5h2V7c1.7.3 2.8 1.4 2.9 3h-2c-.1-.8-.7-1.3-1.8-1.3-1 0-1.6.5-1.6 1.1 0 .6.5.9 2 1.3 2.3.6 3.6 1.3 3.6 3.2 0 1.6-1.2 2.8-3.1 3.2z"/>',
    shirt: '<path d="M8 3 4 5.5 2 10l3.2 1.6V21h13.6v-9.4L22 10l-2-4.5L16 3a4 4 0 0 1-8 0z"/>',
    phone: '<path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 3v13h10V5H7zm3 15h4v1h-4z"/>'
  };
  var root = document.getElementById('deck');
  var preview = !!window.__PREVIEW__;
  if (preview) document.body.classList.add('preview');

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function anim(n, d) { n.classList.add('a'); n.style.setProperty('--d', String(d || 0)); return n; }
  function photo(src, pos, cls) { var i = el('img', cls || 'ph'); i.alt = ''; i.decoding = 'async'; var tall = function () { if (i.naturalHeight > i.naturalWidth) i.classList.add('tall'); }; i.onload = tall; if (src) i.src = src; if (i.complete) tall(); i.style.setProperty('--pos', pos || '50% 50%'); return i; }
  function logo() { var w = el('div', 'logo'); var i = el('img'); i.alt = 'Milk & Honey'; i.src = '/plans/mh-logo.png'; w.appendChild(i); return w; }
  function icon(key, image) { var w = el('div', 'ic'); if (image) { var i = el('img'); i.alt = ''; i.src = image; w.appendChild(i); return w; } w.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[key] || ICONS.star) + '</svg>'; return w; }
  function twoLine(s) { s = String(s || ''); return s.indexOf('\n') >= 0 ? s : s.replace(' ', '\n'); }

  function cover(s) {
    var f = el('div', 'frame cover');
    if (s.photo) f.appendChild(photo(s.photo, s.photoPos));
    f.appendChild(el('div', 'fade'));
    var t = el('div', 'txt');
    t.appendChild(anim(el('div', 'name u pre', twoLine(s.name)), 0));
    if (s.subtitle) t.appendChild(anim(el('div', 'sub u', s.subtitle), 1));
    if (s.showLogo !== false) t.appendChild(anim(logo(), 2));
    f.appendChild(t);
    return f;
  }
  function focus(s) {
    var f = el('div', 'frame focus');
    f.appendChild(el('div', 'gridbg'));
    var band = el('div', 'band'); if (s.photo) band.appendChild(photo(s.photo, s.photoPos)); f.appendChild(band);
    f.appendChild(anim(el('div', 'title u pre', s.title), 0));
    var items = el('div', 'items'); var list = (s.items || []).filter(function (it) { return it && it.label; });
    items.style.setProperty('--n', String(Math.max(1, list.length)));
    list.forEach(function (it, i) { var d = anim(el('div', 'item'), i + 1); d.appendChild(icon(it.icon, it.image)); d.appendChild(el('div', 'lbl u pre', twoLine(it.label))); items.appendChild(d); });
    f.appendChild(items);
    return f;
  }
  function section(s) {
    var band = s.layout === 'band';
    var f = el('div', 'frame section' + (band ? ' band' : ''));
    if (s.photo) { if (band) { var bd = el('div', 'band'); bd.appendChild(photo(s.photo, s.photoPos)); f.appendChild(bd); } else f.appendChild(photo(s.photo, s.photoPos)); }
    var b = el('div', 'body');
    var head = band ? el('div', 'col-l') : b;
    var main = band ? el('div', 'col-r') : b;
    head.appendChild(anim(el('div', 'title u pre', s.title), 0));
    var k = 1;
    if (s.intro) head.appendChild(anim(el('p', 'intro', s.intro), k++));
    if (band) { b.appendChild(head); b.appendChild(main); }
    (s.groups || []).forEach(function (g) {
      if (!g || (!g.heading && !(g.bullets || []).length)) return;
      var d = anim(el('div', 'grp'), k++);
      if (g.heading) d.appendChild(el('div', 'hd u', g.heading));
      var ul = el('ul'); (g.bullets || []).forEach(function (t) { if (t) ul.appendChild(el('li', null, t)); }); d.appendChild(ul);
      main.appendChild(d);
    });
    var logos = (s.logos || []).filter(function (l) { return l && l.url; });
    if (logos.length) { var row = anim(el('div', 'logos' + (logos.length >= 5 ? ' n5' : '')), k); logos.forEach(function (l) { var i = el('img', l.white ? 'wh' : ''); i.alt = l.name || ''; var sq = function () { if (i.naturalWidth && i.naturalWidth / i.naturalHeight < 1.4) i.classList.add('sq'); }; i.onload = sq; i.src = l.url; if (i.complete) sq(); row.appendChild(i); }); b.appendChild(row); }
    f.appendChild(b);
    return f;
  }
  // Logo wall: networks and shows. With a photo it sits beside the text; without, the wall spans the slide.
  function media(s) {
    var f = el('div', 'frame media' + (s.photo ? ' has-ph' : ''));
    if (s.photo) f.appendChild(photo(s.photo, s.photoPos));
    var b = el('div', 'body');
    b.appendChild(anim(el('div', 'title u pre', s.title), 0));
    if (s.heading || s.text) { var g = anim(el('div', 'grp'), 1); if (s.heading) g.appendChild(el('div', 'hd u', s.heading)); if (s.text) g.appendChild(el('p', 'txt', s.text)); b.appendChild(g); }
    var wall = anim(el('div', 'wall'), 2); var list = (s.logos || []).filter(function (l) { return l && (l.url || l.name); });
    list.forEach(function (l) { var c = el('div', 'cell'); if (l.url) { var i = el('img'); i.alt = l.name || ''; i.src = l.url; c.appendChild(i); } else c.appendChild(el('span', 'wm u', l.name)); wall.appendChild(c); });
    b.appendChild(wall);
    f.appendChild(b);
    return f;
  }
  function logoImg(l) { var i = el('img', l.white ? 'wh' : ''); i.alt = l.name || ''; var sq = function () { if (i.naturalWidth && i.naturalWidth / i.naturalHeight < 1.4) i.classList.add('sq'); }; i.onload = sq; i.src = l.url; if (i.complete) sq(); return i; }
  function columns(s) {
    var f = el('div', 'frame section cols' + (s.photo ? ' has-ph' : ''));
    f.appendChild(el('div', 'gridbg'));
    if (s.photo) f.appendChild(photo(s.photo, s.photoPos));
    var b = el('div', 'body');
    var head = el('div', 'head');
    head.appendChild(anim(el('div', 'title u pre', s.title), 0));
    if (s.intro) head.appendChild(anim(el('p', 'intro', s.intro), 1));
    b.appendChild(head);
    var grid = el('div', 'colgrid'); var k = 2;
    (s.groups || []).forEach(function (g) {
      if (!g || (!g.heading && !(g.bullets || []).length)) return;
      var c = anim(el('div', 'col'), k++);
      var gl = (g.logos || []).filter(function (l) { return l && l.url; });
      if (gl.length) { var row = el('div', 'glogos'); gl.forEach(function (l) { row.appendChild(logoImg(l)); }); c.appendChild(row); }
      if (g.heading) c.appendChild(el('div', 'hd u', g.heading));
      (g.bullets || []).forEach(function (t) { if (t) c.appendChild(el('p', 'txt', t)); });
      grid.appendChild(c);
    });
    grid.style.setProperty('--n', String(Math.max(1, grid.children.length)));
    b.appendChild(grid);
    var bottom = (s.logos || []).filter(function (l) { return l && l.url; });
    if (bottom.length) { var lrow = anim(el('div', 'logos' + (bottom.length >= 5 ? ' n5' : '')), k); bottom.forEach(function (l) { lrow.appendChild(logoImg(l)); }); b.appendChild(lrow); }
    f.appendChild(b);
    return f;
  }
  function closing(s) {
    var f = el('div', 'frame closing');
    f.appendChild(el('div', 'gridbg'));
    if (s.photo) { f.appendChild(photo(s.photo, s.photoPos)); f.appendChild(el('div', 'dim')); }
    var w = el('div', 'wrap');
    if (s.showLogo !== false) w.appendChild(anim(logo(), 0));
    w.appendChild(anim(el('div', 'title u pre', s.title), 1));
    if (s.text) w.appendChild(anim(el('p', 'txt', s.text), 2));
    f.appendChild(w);
    return f;
  }
  var BUILD = { cover: cover, focus: focus, section: function (s) { return s.layout === 'columns' ? columns(s) : section(s); }, media: media, closing: closing };

  var nav = null, cur = 0, slides = [];
  function go(i) { if (i < 0 || i >= slides.length) return; slides[i].scrollIntoView({ behavior: preview ? 'auto' : 'smooth', block: 'start' }); }
  function setCount() { if (!nav) return; nav.n.textContent = (cur + 1) + ' / ' + slides.length; nav.prev.disabled = cur === 0; nav.next.disabled = cur >= slides.length - 1; }
  function ensureNav() {
    if (nav || preview) return;
    var w = el('div', 'nav');
    var n = el('span', 'n');
    var prev = el('button'); prev.setAttribute('aria-label', 'Previous slide'); prev.innerHTML = '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>';
    var next = el('button'); next.setAttribute('aria-label', 'Next slide'); next.innerHTML = '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>';
    prev.onclick = function () { go(cur - 1); }; next.onclick = function () { go(cur + 1); };
    w.appendChild(n); w.appendChild(prev); w.appendChild(next); document.body.appendChild(w);
    nav = { n: n, prev: prev, next: next };
    document.addEventListener('keydown', function (e) {
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].indexOf(e.key) >= 0) { e.preventDefault(); go(cur + 1); }
      else if (['ArrowUp', 'ArrowLeft', 'PageUp'].indexOf(e.key) >= 0) { e.preventDefault(); go(cur - 1); }
    });
  }
  var io = null;
  function watch() {
    if (io) io.disconnect();
    if (!('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && en.intersectionRatio >= 0.35) en.target.classList.add('in');
        if (en.isIntersecting && en.intersectionRatio >= 0.5) { cur = slides.indexOf(en.target); setCount(); }
      });
    }, { threshold: [0.35, 0.5] });
    slides.forEach(function (s) { io.observe(s); });
  }

  function render(deck) {
    while (root.firstChild) root.removeChild(root.firstChild);
    slides = [];
    (deck && deck.slides || []).forEach(function (s) {
      var build = s && BUILD[s.type]; if (!build) return;
      var sec = el('section', 'slide' + (preview ? ' in' : '')); sec.appendChild(build(s)); root.appendChild(sec); slides.push(sec);
    });
    ensureNav(); watch(); cur = 0; setCount();
  }
  function renderGone() {
    while (root.firstChild) root.removeChild(root.firstChild);
    var g = el('div', 'gone'); g.appendChild(logo()); g.appendChild(el('p', null, 'This plan is no longer available')); root.appendChild(g);
  }

  if (preview) {
    window.addEventListener('message', function (e) {
      if (e.origin !== window.location.origin || !e.data || e.data.type !== 'plan') return;
      render(e.data.deck);
      if (typeof e.data.index === 'number') go(e.data.index);
    });
    if (window.parent !== window) window.parent.postMessage({ type: 'plan-ready' }, window.location.origin);
  } else {
    var data = window.__PLAN__;
    if (!data || data.gone || !data.deck) renderGone(); else render(data.deck);
  }
})();
