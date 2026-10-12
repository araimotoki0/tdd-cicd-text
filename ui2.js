// CSD 講座 UI v2：講座の地図・前へ／次へ・完了チェック・講座メニュー・キーボード操作
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

    var KEY = 'csd-done-v1';
    function loadDone() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
    function saveDone(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
    var done = loadDone();
    function isDone(f) { return done.indexOf(f) >= 0; }

    function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    document.addEventListener('DOMContentLoaded', function () {
        var body = document.body;
        body.classList.add('ui2');
        body.dataset.chapter = chapter ? chapter.id : (extra ? extra.chapter : 'extra');

        var main = document.querySelector('.pt-20');
        var hero = main && main.querySelector(':scope > section');
        if (hero && /bg-gradient/.test(hero.className)) {
            hero.classList.add('ui2-hero');
            // 章のラベル（ヒーローの上）
            if (!document.getElementById('toc')) {
                var box = hero.querySelector('.container') || hero;
                var label = chapter ? '<b>' + chapterNo + '</b>' + esc(chapter.name) + '　·　' + esc(pageLabel)
                                    : '<b>＋</b>' + esc(extra ? extra.label : '');
                box.insertBefore(el('<span class="ui2-eyebrow">' + label + '</span>'), box.firstChild);
            }
        }

        // 講座の地図
        if (hero && (chapter || extra)) {
            var cur = chapter ? chapter.id : extra.chapter;
            var steps = CHAPTERS.map(function (c, i) {
                var allDone = c.pages.every(function (p) { return isDone(p[0]); });
                var cls = 'ui2-step' + (c.id === cur ? ' is-current' : '') + (allDone ? ' is-done' : '');
                return '<a class="' + cls + '" style="--c:' + c.color + '" href="' + c.pages[0][0] + '">' +
                       '<span class="n">' + (i + 1) + '</span><span class="t"><b>' + esc(c.name) + '</b><small>' + esc(c.sub) + '</small></span></a>';
            }).join('');
            var curCh = CHAPTERS.filter(function (c) { return c.id === cur; })[0];
            var sub = '';
            if (curCh && curCh.pages.length > 1) {
                sub = '<div class="ui2-sub">' + curCh.pages.map(function (p) {
                    var cls = (p[0] === file ? 'is-current' : '') + (isDone(p[0]) ? ' is-done' : '');
                    return '<a class="' + cls + '" href="' + p[0] + '">' + esc(p[1]) + '</a>';
                }).join('') + '</div>';
            }
            var total = LINEAR.length, cnt = LINEAR.filter(function (p) { return isDone(p.file); }).length;
            var map = el('<nav class="ui2-map" aria-label="講座の地図"><div class="ui2-map-in">' +
                '<div class="ui2-map-head"><span>講座の地図</span><span class="ui2-done-count">完了 ' + cnt + ' / ' + total + '</span></div>' +
                '<div class="ui2-steps">' + steps + '</div>' + sub + '</div></nav>');
            hero.after(map);
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
            var complete = idx >= 0 ? '<div class="ui2-complete"><button type="button" aria-pressed="' + isDone(file) + '"><span class="box">✓</span><span class="lbl"></span></button></div>' : '';
            var nav = el('<section class="ui2-next"><div class="ui2-next-in">' + complete +
                '<div class="ui2-pn">' + card(prev, 'prev') + (idx === LINEAR.length - 1 ? '<div class="next finish"><small>ゴール</small><b>🎉 全講座おつかれさまでした！</b></div>' : card(next, 'next')) + '</div>' +
                '<p class="ui2-keys"><kbd>←</kbd> <kbd>→</kbd> キーでも移動できます</p></div></section>');
            footer.before(nav);
            var btn = nav.querySelector('.ui2-complete button');
            if (btn) {
                var lbl = btn.querySelector('.lbl');
                var paint = function () { lbl.textContent = isDone(file) ? 'このページは完了しました' : 'このページを完了にする'; btn.setAttribute('aria-pressed', isDone(file)); };
                paint();
                btn.addEventListener('click', function () {
                    done = isDone(file) ? done.filter(function (f) { return f !== file; }) : done.concat([file]);
                    saveDone(done); paint();
                    document.querySelectorAll('.ui2-sub a, .ui2-menu-group a').forEach(function (a) {
                        if (a.getAttribute('href') === file) a.classList.toggle('is-done', isDone(file));
                    });
                });
            }
            document.addEventListener('keydown', function (e) {
                if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
                var t = e.target;
                if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|VIDEO)$/.test(t.tagName))) return;
                if (e.key === 'ArrowRight' && next) location.href = next.file;
                if (e.key === 'ArrowLeft' && prev) location.href = prev.file;
            });
        }

        // 講座メニュー（左上）を章ごとに
        var content = document.querySelector('#globalMenu .global-menu-content');
        if (content) {
            var groups = CHAPTERS.map(function (c, i) {
                var links = c.pages.map(function (p) {
                    var cls = (p[0] === file ? 'is-current' : '');
                    return '<a class="' + cls + '" href="' + p[0] + '"><span>' + esc(p[1]) + '</span>' + (isDone(p[0]) ? '<span class="ok">✓</span>' : '') + '</a>';
                }).join('');
                return '<div class="ui2-menu-group" style="--c:' + c.color + '"><p><i></i>' + (i + 1) + '. ' + esc(c.name) + '</p>' + links + '</div>';
            }).join('');
            var others = Object.keys(EXTRAS).map(function (f) {
                return '<a class="old' + (f === file ? ' is-current' : '') + '" href="' + f + '"><span>' + esc(EXTRAS[f].label) + '</span></a>';
            }).join('');
            content.innerHTML = groups + '<div class="ui2-menu-group" style="--c:#94a3b8"><p><i></i>そのほか</p>' + others + '</div>';
        }
    });
})();
