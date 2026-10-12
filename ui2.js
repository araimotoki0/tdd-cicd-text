// CSD 講座 UI v2：章ラベル・前へ／次へ・講座メニュー（サイドペイン）・キーボード操作
(function () {
    var CHAPTERS = [
        { id: 'setup', name: '環境構築', sub: 'Mac / Windows', color: '#64748b',
          pages: [['handson-setup-mac.html', 'Mac'], ['handson-setup-windows.html', 'Windows']] },
        { id: 'ai', name: 'AI Coding', sub: 'Antigravity CLI', color: '#7c3aed',
          pages: [['ai-coding-antigravity.html', 'AI Coding入門']] },
        { id: 'tdd', name: 'TDD', sub: 'テスト駆動開発', color: '#059669',
          pages: [['index.html', '理論編'], ['handson-basic.html', '基礎：Red-Green'], ['handson-refactor.html', '改善：Refactor'],
                  ['handson-assertions.html', '検証：Assertions'], ['handson-advanced.html', '応用：Todo機能'], ['handson-database.html', '実践：DB版Todo']] },
        { id: 'mobai', name: 'MobAI', sub: 'AI とグループ作業', color: '#d97706',
          pages: [['mob-ai.html', 'MobAI']] },
        { id: 'cicd', name: 'CI/CD', sub: '自動テスト・デプロイ', color: '#0284c7',
          pages: [['cicd-index.html', '理論編'], ['cicd-handson-basic.html', '基礎：自動テスト'], ['cicd-handson-quality.html', '応用：品質チェック'],
                  ['cicd-handson-deploy.html', '実践：自動デプロイ']] }
    ];
    var EXTRAS = {
        'ai-coding.html': { chapter: 'ai', label: '【旧】Gemini CLI版' },
        'mob-ai-cyberdojo.html': { chapter: 'mobai', label: '【旧】Cyber-Dojo版' },
        'replit-tdd.html': { chapter: 'extra', home: 'mobai', label: 'Replit で TDD 練習' },
        'csd-preview.html': { chapter: 'extra', home: 'ai', label: 'チラ見せ説明会（2026/01/22）' }
    };
    // 前へ・次へでたどる順番（環境構築は各自の準備なので含めない）
    var LINEAR = [];
    CHAPTERS.forEach(function (c) {
        if (c.id === 'setup') return;
        c.pages.forEach(function (p) { LINEAR.push({ file: p[0], label: p[1], chapter: c }); });
    });

    var file = location.pathname.split('/').pop() || 'index.html';
    var chapter = null, pageLabel = '', chapterNo = 0;
    CHAPTERS.forEach(function (c, i) {
        c.pages.forEach(function (p) { if (p[0] === file) { chapter = c; pageLabel = p[1]; chapterNo = i + 1; } });
    });
    var extra = EXTRAS[file];


    function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    document.addEventListener('DOMContentLoaded', function () {
        var body = document.body;
        // 目次の見出しを簡潔に・スキップリンク
        var th = document.querySelector('.pnav-side-head p, #toc .flex > p'); if (th) th.textContent = '目次';
        var tb = document.querySelector('.pnav-bar-title, #tocBar .text-indigo-700'); if (tb) tb.textContent = '目次';
        var m0 = document.querySelector('.pt-20'); if (m0) { m0.id = m0.id || 'ui2-main'; document.body.insertBefore(el('<a class="ui2-skip" href="#' + m0.id + '">本文へ移動</a>'), document.body.firstChild); }
        body.classList.add('ui2');
        body.dataset.chapter = chapter ? chapter.id : (extra ? extra.chapter : 'extra');

        var main = document.querySelector('.pt-20');
        var hero = main && main.querySelector(':scope > section');
        if (hero && /bg-gradient/.test(hero.className)) {
            hero.classList.add('ui2-hero');
            // 章のラベル（ヒーローの上）
            if (!document.getElementById('toc') && !hero.querySelector('.ui2-eyebrow')) {
                var box = hero.querySelector('.container') || hero;
                var label = chapter ? '<b>' + chapterNo + '</b>' + esc(chapter.name) + '　·　' + esc(pageLabel)
                                    : '<b>＋</b>' + esc(extra ? extra.label : '');
                box.insertBefore(el('<span class="ui2-eyebrow">' + label + '</span>'), box.firstChild);
            }
        }

        // 前へ・次へ・完了
        var footer = document.querySelector('footer');
        var idx = LINEAR.map(function (p) { return p.file; }).indexOf(file);
        if (footer && (idx >= 0 || extra)) {
            var prev = idx > 0 ? LINEAR[idx - 1] : null;
            var next = idx >= 0 && idx < LINEAR.length - 1 ? LINEAR[idx + 1] : null;
            if (extra && !next) {
                var home = CHAPTERS.filter(function (c) { return c.id === (extra.home || extra.chapter); })[0];
                if (home) next = { file: home.pages[0][0], label: home.pages[0][1], chapter: home };
            }
            function card(p, kind) {
                if (!p) return '<span class="empty"></span>';
                var cap = kind === 'next' ? '次へ →' : '← 前へ';
                return '<a class="' + kind + '" href="' + p.file + '"><small>' + cap + '　' + esc(p.chapter.name) + '</small><b>' + esc(p.label) + '</b></a>';
            }
            var nav = el('<section class="ui2-next"><div class="ui2-next-in">' +
                '<div class="ui2-pn">' + card(prev, 'prev') + (idx === LINEAR.length - 1 ? '<div class="next finish"><small>ゴール</small><b>🎉 全講座おつかれさまでした！</b></div>' : card(next, 'next')) + '</div>' +
                '<p class="ui2-keys"><kbd>←</kbd> <kbd>→</kbd> キーでも移動できます</p></div></section>');
            footer.before(nav);
            document.addEventListener('keydown', function (e) {
                if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
                if (document.body.classList.contains('ui2-open')) return;
                var t = e.target;
                if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|VIDEO)$/.test(t.tagName))) return;
                if (e.key === 'ArrowRight' && next) location.href = next.file;
                if (e.key === 'ArrowLeft' && prev) location.href = prev.file;
            });
        }

        // ヘッダーのボタン ＋ 左から開くサイドペイン（講座の単位だけ）
        var bar = document.querySelector('body > nav .container > .flex');
        var title = bar && bar.firstElementChild;
        if (bar && title) {
            // ボタンは HTML に書いてある（ちらつかないように）。なければ作る
            var btn2 = document.querySelector('.ui2-menu-btn');
            if (!btn2) {
                var brand = el('<div class="ui2-brand"></div>');
                btn2 = el('<button type="button" class="ui2-menu-btn" aria-label="講座メニューを開く" aria-expanded="false" aria-controls="ui2Drawer">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h10"/></svg>' +
                    '<span class="lbl">コース</span></button>');
                bar.insertBefore(brand, title);
                brand.appendChild(btn2);
                brand.appendChild(title);
            }

            var items = [
                ['handson-setup-mac.html', '環境構築（Mac）', '#55607a', 'setup', '1', '講義の前に'],
                ['handson-setup-windows.html', '環境構築（Windows）', '#55607a', 'setup', '1', '講義の前に'],
                ['ai-coding-antigravity.html', 'AI Coding', '#5b5bd6', 'ai', '2', 'Antigravity CLI・ハーネス'],
                ['index.html', 'TDD', '#2f8f6b', 'tdd', '3', 'テスト駆動開発'],
                ['mob-ai.html', 'MobAI', '#b7791f', 'mobai', '4', 'AI とグループ作業'],
                ['cicd-index.html', 'CI/CD', '#2b6cb0', 'cicd', '5', '自動テスト・デプロイ']
            ];
            var curCh = chapter ? chapter.id : (extra ? extra.chapter : '');
            var list = items.map(function (it, i) {
                var isCur = it[3] === 'setup' ? file === it[0] : it[3] === curCh;
                return '<a class="ui2-item' + (isCur ? ' is-current' : '') + '" style="--c:' + it[2] + '" href="' + it[0] + '">' +
                    '<span class="no">' + it[4] + '</span><span class="nm"><b>' + esc(it[1]) + '</b><small>' + esc(it[5]) + '</small></span>' +
                    (isCur ? '<span class="here">いまここ</span>' : '') + '</a>';
            }).join('');
            var drawer = el('<aside class="ui2-drawer" id="ui2Drawer" aria-label="講座メニュー" aria-hidden="true">' +
                '<div class="ui2-dh"><div><small>CSD COURSE</small><b>講座メニュー</b></div>' +
                '<button type="button" class="ui2-close" aria-label="閉じる"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
                '<div class="ui2-dbody">' + list +
                '<div class="ui2-extra"><a class="' + (file === 'csd-preview.html' ? 'is-current' : '') + '" href="csd-preview.html">チラ見せ説明会（2026/01/22）</a></div>' +
                '</div><div class="ui2-dfoot"><kbd>Esc</kbd> で閉じる</div></aside>');
            var scrim = el('<div class="ui2-scrim"></div>');
            document.body.appendChild(scrim);
            document.body.appendChild(drawer);
            var setOpen = function (open) {
                document.body.classList.toggle('ui2-open', open);
                btn2.setAttribute('aria-expanded', open);
                drawer.setAttribute('aria-hidden', !open);
                if (open) drawer.querySelector('.ui2-close').focus(); else btn2.focus();
            };
            btn2.addEventListener('click', function () { setOpen(true); });
            scrim.addEventListener('click', function () { setOpen(false); });
            drawer.querySelector('.ui2-close').addEventListener('click', function () { setOpen(false); });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && document.body.classList.contains('ui2-open')) setOpen(false);
            });
            drawer.querySelectorAll('.ui2-item, .ui2-extra').forEach(function (n, i) { n.style.transitionDelay = (0.06 + i * 0.035) + 's'; });
        }
    });
})();
