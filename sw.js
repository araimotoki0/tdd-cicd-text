/* CSD講座 Service Worker
   - ページ（HTML）：ネットワーク優先。つながらなければキャッシュ、なければオフライン用ページ
   - CSS / JS / 画像 / フォント：キャッシュを返しつつ裏で更新（stale-while-revalidate）。?v= を含めて完全一致
   - 動画：キャッシュしない（容量が大きく、途中からの読み込みがあるため）
   更新するときは VERSION を変える */
var VERSION = 'csd-2026-10-13f';
var CACHE = 'csd-' + VERSION;

var PAGES = [
  'index.html', 'handson-basic.html', 'handson-refactor.html', 'handson-assertions.html', 'handson-advanced.html', 'handson-database.html',
  'ai-coding-antigravity.html', 'mob-ai.html',
  'cicd-index.html', 'cicd-handson-basic.html', 'cicd-handson-quality.html', 'cicd-handson-deploy.html',
  'handson-setup-mac.html', 'handson-setup-windows.html', 'csd-preview.html', 'home.html', 'app.html', 'login.html', 'offline.html'
];
var ASSETS = ['styles.css', 'ui2.css', 'code-copy.js', 'global-menu.js', 'nav-highlight.js', 'scroll-to-top.js', 'page-nav.js', 'ui2.js',
  'manifest.json', 'img/qr-site.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // 1つ失敗しても全体を止めない
    return Promise.all(PAGES.concat(ASSETS).map(function (u) {
      return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('csd-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isVideo(url) { return /\.(mp4|webm|m4a|mp3)(\?|$)/.test(url.pathname); }
function isFont(url) { return /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname); }
function isCdn(url) { return /^(cdn\.tailwindcss\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)$/.test(url.hostname); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (isVideo(url)) return;
  if (url.pathname === '/auth' || url.pathname === '/login.html') return;

  // ページ：ネットワーク優先（3.5秒でキャッシュに切り替え）
  if (req.mode === 'navigate') {
    e.respondWith(new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; fromCache(req).then(resolve); } }, 3500);
      fetch(req).then(function (res) {
        clearTimeout(timer);
        if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(req, res.clone()); });
        if (!done) { done = true; resolve(res); }
      }).catch(function () {
        clearTimeout(timer);
        if (!done) { done = true; fromCache(req).then(resolve); }
      });
    }));
    return;
  }

  // 同じサイトの CSS/JS/画像、フォント、CDN：キャッシュを返しつつ裏で更新
  if (url.origin === location.origin || isFont(url) || isCdn(url)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      // ?v=... を含めて完全一致で探す（?v を無視すると、古い CSS/JS を返し続けてしまう）
      return c.match(req).then(function (hit) {
        var refresh = fetch(req).then(function (res) {
          if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
          return res;
        }).catch(function () { return hit; });
        return hit || refresh;
      });
    }));
  }
});

function fromCache(req) {
  return caches.open(CACHE).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || c.match('offline.html');
    });
  });
}
