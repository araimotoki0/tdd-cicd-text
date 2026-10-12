// ページ内ナビゲーション
// - 見出し(h2)から目次を自動生成（PC: 右に固定 / スマホ: 上部に追従するバー）
// - 現在地のハイライト・読了チェック・読了率
// - ヘッダーの読了プログレスバー
// - スマホ用メニューボタン（#menuBtn）の開閉
document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('nav');
    var main = document.querySelector('.pt-20');

    // スマホ用メニューボタン
    var menuBtn = document.getElementById('menuBtn');
    var mobileMenu = document.getElementById('mobileMenu');
    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', function () {
            mobileMenu.classList.toggle('hidden');
        });
    }

    // 読了プログレスバー
    var bar = null;
    if (nav && !document.getElementById('readProgress')) {
        bar = document.createElement('div');
        bar.className = 'pnav-progress';
        bar.setAttribute('aria-hidden', 'true');
        nav.appendChild(bar);
    }

    // 目次（ページ独自の目次があるページでは作らない）
    var hasOwnToc = !!document.getElementById('toc');
    var heads = [];
    if (main && !hasOwnToc) {
        heads = Array.prototype.slice.call(main.querySelectorAll('h2')).filter(function (h) {
            var sec = h.closest('section');
            if (h.closest('footer')) return false;
            // グラデーション背景のヒーロー内の見出し（ページタイトル）は除外
            if (sec && /bg-gradient/.test(sec.className) && sec === main.querySelector('section')) return false;
            return h.textContent.trim() !== '';
        });
    }

    var links = [];
    var currentLabel = null;
    if (heads.length >= 3) {
        heads.forEach(function (h, i) {
            if (!h.id) h.id = 'sec-' + (i + 1);
        });

        function buildList() {
            var list = document.createElement('div');
            heads.forEach(function (h, i) {
                var a = document.createElement('a');
                a.href = '#' + h.id;
                a.className = 'pnav-link';
                a.dataset.target = h.id;
                var dot = document.createElement('span');
                dot.className = 'pnav-dot';
                dot.innerHTML = '<span class="pnav-num">' + (i + 1) + '</span>';
                var label = document.createElement('span');
                label.textContent = h.textContent.replace(/\s+/g, ' ').trim();
                a.appendChild(dot);
                a.appendChild(label);
                list.appendChild(a);
                links.push(a);
            });
            return list;
        }

        // PC: 右に固定の目次
        var aside = document.createElement('aside');
        aside.className = 'pnav-side';
        aside.setAttribute('aria-label', '目次');
        aside.innerHTML =
            '<div class="pnav-side-head"><p>📑 このページの目次</p><span class="pnav-badge"><span class="pnav-pct">0</span>%</span></div>' +
            '<div class="pnav-track"><div class="pnav-fill"></div></div>';
        aside.appendChild(buildList());
        document.body.appendChild(aside);
        document.body.classList.add('pnav-on');

        // スマホ・タブレット: 上部に追従する目次バー
        var mbar = document.createElement('div');
        mbar.className = 'pnav-bar';
        mbar.innerHTML =
            '<button type="button" class="pnav-toggle" aria-expanded="false">' +
            '<span class="pnav-bar-title">📑 目次</span><span class="pnav-sep">|</span>' +
            '<span class="pnav-current">このページの内容</span>' +
            '<span class="pnav-badge"><span class="pnav-pct">0</span>%</span>' +
            '<svg class="pnav-chev" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>' +
            '</button><div class="pnav-track pnav-track-thin"><div class="pnav-fill"></div></div>';
        var panel = document.createElement('nav');
        panel.className = 'pnav-panel';
        panel.hidden = true;
        panel.appendChild(buildList());
        mbar.appendChild(panel);
        var hero = main.querySelector('section');
        if (hero && hero.parentElement === main) hero.after(mbar); else main.prepend(mbar);

        var toggle = mbar.querySelector('.pnav-toggle');
        function setPanel(open) {
            panel.hidden = !open;
            toggle.setAttribute('aria-expanded', open);
            mbar.classList.toggle('is-open', open);
        }
        toggle.addEventListener('click', function () { setPanel(panel.hidden); });
        panel.addEventListener('click', function (e) { if (e.target.closest('a')) setPanel(false); });
        currentLabel = mbar.querySelector('.pnav-current');
    }

    var pcts = document.querySelectorAll('.pnav-pct');
    var fills = document.querySelectorAll('.pnav-fill');
    var ticking = false;

    function update() {
        ticking = false;
        var max = document.documentElement.scrollHeight - window.innerHeight;
        var pct = max > 0 ? Math.min(100, Math.round(window.scrollY / max * 100)) : 0;
        if (bar) bar.style.width = pct + '%';
        pcts.forEach(function (n) { n.textContent = pct; });
        fills.forEach(function (f) { f.style.width = pct + '%'; });
        if (!links.length) return;

        var line = window.innerWidth >= 1280 ? 120 : 160;
        var active = -1;
        heads.forEach(function (h, i) { if (h.getBoundingClientRect().top - line <= 0) active = i; });
        if (pct >= 99) active = heads.length - 1;
        links.forEach(function (a) {
            var i = heads.findIndex(function (h) { return h.id === a.dataset.target; });
            a.classList.toggle('is-active', i === active);
            a.classList.toggle('is-done', active >= 0 && i < active);
        });
        if (currentLabel) currentLabel.textContent = active >= 0 ? heads[active].textContent.replace(/\s+/g, ' ').trim() : 'このページの内容';

        // PC の目次で、現在地が見える位置までスクロール
        var side = document.querySelector('.pnav-side .pnav-link.is-active');
        if (side && window.innerWidth >= 1280) {
            var box = side.closest('.pnav-side');
            var r = side.getBoundingClientRect(), b = box.getBoundingClientRect();
            if (r.top < b.top + 80 || r.bottom > b.bottom - 40) box.scrollTop += r.top - b.top - b.height / 3;
        }
    }

    window.addEventListener('scroll', function () {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
});
