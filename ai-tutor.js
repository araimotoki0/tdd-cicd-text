/* AI 先生（Miho先生）：講座ページの右下から、いま見ているページについて質問できるチャット
   - ページの本文をそのまま読み取って Gemini に渡す。ページを直せば、AI の知識もそのまま新しくなる
   - 設定（API キーなど）は ai-config.json。無ければ「準備中」と表示する（ai-config.example.json を参照）
   - 会話はページごとに sessionStorage に残る（タブを閉じると消える）
   - 使えるモデルは上から順に試す（無いモデルは飛ばす） */
(function () {
    'use strict';

    var CONFIG_URL = 'ai-config.json';
    var INDEX_URL = 'ai-site-index.json';
    var AVATAR = 'img/miho_face.webp';
    var TEACHER = 'Miho先生';
    var API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
    // 精度の高い順（2026-10-14 に実際に試して決めた）。無いモデルは自動で次へ。ai-config.json の model で先頭に割り込める
    var MODELS = ['gemini-4-argon', 'gemini-3.1-pro-preview', 'gemini-pro-latest', 'gemini-3.8-flash'];
    var MAX_PAGE_CHARS = 60000;
    var MAX_HISTORY = 20; // 送る履歴の上限（発言数）

    var CHIPS = [
        { label: '🚨 エラーが出ました', text: 'エラーが出ました。\n', send: false },
        { label: '❓ この手順は何をしていますか？', text: 'いま見ている手順は、何をしているのですか？', send: true },
        { label: '💡 ヒントだけください', text: 'いま見ているところを、答えではなくヒントだけ教えてください。', send: true },
        { label: '✍️ 書き方を教えてください', text: 'ここで使うコードの書き方（文法）を、短い例で教えてください。', send: true }
    ];

    /* ---------- Markdown（AI の返答を表示する） ---------- */

    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function inlineMarkdown(s, pageFiles) {
        // 先に HTML を無害化してから、`code` → **太字** → リンク の順で置き換える
        var codes = [];
        s = escapeHtml(s).replace(/`([^`\n]+)`/g, function (_, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
        s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|[a-z0-9-]+\.html(?:#[\w-]+)?)\)/g, function (_, t, href) {
            var ext = /^https?:/.test(href);
            return '<a href="' + href + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + t + '</a>';
        });
        if (pageFiles && pageFiles.length) {
            // 「handson-setup-mac.html」のようなページ名は、そのままリンクにする
            s = s.replace(/(^|[^\w/"'>=-])([a-z0-9-]+\.html)(?![\w"'])/g, function (m, pre, f) {
                return pageFiles.indexOf(f) >= 0 ? pre + '<a href="' + f + '">' + f + '</a>' : m;
            });
        }
        return s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return '<code>' + codes[+i] + '</code>'; });
    }

    function renderMarkdown(md, pageFiles) {
        var out = [];
        var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
        var i = 0, para = [], list = null;

        function flushPara() { if (para.length) { out.push('<p>' + inlineMarkdown(para.join('\n'), pageFiles).replace(/\n/g, '<br>') + '</p>'); para = []; } }
        function flushList() { if (list) { out.push('</' + list + '>'); list = null; } }

        while (i < lines.length) {
            var line = lines[i];
            var fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
            if (fence) {
                flushPara(); flushList();
                var lang = fence[1], code = [];
                i++;
                while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { code.push(lines[i]); i++; }
                i++;
                out.push('<div class="csd-tutor-code"><div class="csd-tutor-code-bar"><span>' + escapeHtml(lang || 'code') + '</span><button type="button" class="csd-tutor-copy">コピー</button></div><pre><code>' + escapeHtml(code.join('\n')) + '</code></pre></div>');
                continue;
            }
            var h = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
            if (h) { flushPara(); flushList(); var lv = Math.min(h[1].length + 2, 6); out.push('<h' + lv + '>' + inlineMarkdown(h[2], pageFiles) + '</h' + lv + '>'); i++; continue; }
            var ul = line.match(/^\s*[-*•]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
            if (ul || ol) {
                flushPara();
                var kind = ul ? 'ul' : 'ol';
                if (list !== kind) { flushList(); out.push('<' + kind + '>'); list = kind; }
                out.push('<li>' + inlineMarkdown((ul || ol)[1], pageFiles) + '</li>');
                i++; continue;
            }
            var q = line.match(/^\s*>\s?(.*)$/);
            if (q) { flushPara(); flushList(); out.push('<blockquote>' + inlineMarkdown(q[1], pageFiles) + '</blockquote>'); i++; continue; }
            if (!line.trim()) { flushPara(); flushList(); i++; continue; }
            if (list && /^\s{2,}\S/.test(line)) { out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, '<br>' + inlineMarkdown(line.trim(), pageFiles) + '</li>'); i++; continue; }
            flushList();
            para.push(line.trim());
            i++;
        }
        flushPara(); flushList();
        return out.join('\n');
    }

    /* ---------- ページの読み取り（AI に渡す教材） ---------- */

    var SKIP_SELECTOR = 'nav, footer, script, style, noscript, svg, video, audio, iframe, button, select, input, textarea, template, ' +
        '#mobileMenu, .global-menu, .global-menu-overlay, .global-menu-button, .pnav-side, .pnav-bar, .scroll-to-top-button, .copy-button, #csd-tutor, #csd-tutor-launch, [aria-hidden="true"]';
    var BLOCK_TAGS = /^(p|div|section|article|ul|ol|table|thead|tbody|details|summary|blockquote|dd|dt|dl|figure|figcaption|header|main|aside|form|label)$/;

    function extractPageText(root) {
        var out = [];
        function text(n) { return n.textContent.replace(/\s+/g, ' ').trim(); }
        function walk(node) {
            if (node.nodeType === 3) { var t = node.nodeValue.replace(/\s+/g, ' '); if (t.trim()) out.push(t); return; }
            if (node.nodeType !== 1) return;
            if (node.matches(SKIP_SELECTOR)) return;
            var tag = node.tagName.toLowerCase();
            if (tag === 'pre') {
                var c = node.cloneNode(true);
                Array.prototype.forEach.call(c.querySelectorAll('.copy-button, button'), function (b) { b.remove(); });
                out.push('\n```\n' + c.textContent.replace(/^\n+|\s+$/g, '') + '\n```\n');
                return;
            }
            if (/^h[1-6]$/.test(tag)) { out.push('\n\n' + '######'.slice(0, +tag[1]) + ' ' + text(node) + '\n'); return; }
            if (tag === 'tr') {
                out.push('\n| ' + Array.prototype.map.call(node.children, text).join(' | ') + ' |');
                return;
            }
            if (tag === 'br') { out.push('\n'); return; }
            if (tag === 'li') out.push('\n- ');
            var block = BLOCK_TAGS.test(tag);
            if (block) out.push('\n');
            for (var ch = node.firstChild; ch; ch = ch.nextSibling) walk(ch);
            if (block) out.push('\n');
        }
        walk(root);
        var s = out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        if (s.length > MAX_PAGE_CHARS) s = s.slice(0, MAX_PAGE_CHARS) + '\n…（長いので以下省略）';
        return s;
    }

    function currentHeading() {
        var hs = document.querySelectorAll('h2, h3');
        var y = window.innerHeight * 0.4, best = null;
        for (var k = 0; k < hs.length; k++) {
            var h = hs[k];
            if (h.closest('#csd-tutor, nav, footer, .pnav-side, .pnav-bar, .global-menu')) continue;
            if (h.getBoundingClientRect().top <= y) best = h;
        }
        return best ? best.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    function pageTitle() {
        // 「基礎編：Red-Greenサイクル体験 - TDD実践ハンズオン」→ 前半だけ（区切りは「 - 」）
        return (document.title || '').split(' - ')[0].trim() || document.title;
    }

    function buildSystemPrompt(siteIndex) {
        var index = (siteIndex || []).map(function (p) {
            return '- ' + p.file + '：' + p.title + (p.headings && p.headings.length ? '（' + p.headings.slice(0, 12).join(' / ') + '）' : '');
        }).join('\n');
        return [
            'あなたは「' + TEACHER + '」。アジャイル ビジネス インスティテュート（ABI）の CSD 講座で、TDD（テスト駆動開発）・CI/CD・AI コーディングのハンズオンを教える講師です。',
            '受講者（生徒）は、教材のページを読みながら手を動かしていて、わからないところをあなたに聞きます。人間の講師は Arai先生で、教室にいます。',
            '',
            '## 教材の技術',
            '- PHP 8 / Laravel / PHPUnit 12。テストは `php artisan test` か `./vendor/bin/phpunit`。コマンドは Docker のコンテナの中（`docker compose exec app bash`）で実行する',
            '- CI/CD は GitHub Actions。AI コーディングは Claude Code・Antigravity CLI など。チーム作業は Miro',
            '- 文法・書き方の質問（PHP、PHPUnit のアサーション、Laravel の artisan、Git、ターミナルのコマンド）には、短い例を添えて答える',
            '',
            '## 答え方',
            '1. 日本語。やさしく、短く。ですます調。初学者が多いので、専門用語には一言の説明を添える',
            '2. まず「いま生徒が見ているページ」の本文を根拠にする。手順の番号や見出し名を挙げる（例：「手順3『テストを実行して失敗させる』のところですね」）',
            '3. エラーの質問は、エラーメッセージの意味 → 原因 → 直し方、の順。情報が足りなければ推測で済ませず、「エラーメッセージをそのまま貼ってください」「`pwd` の結果を教えてください」のように聞き返す',
            '4. ページの課題（自分で書く練習）は、まずヒントと考え方を示す。ただし「答えを見せて」「コードを書いて」と頼まれたら、出し惜しみせずコードを示す',
            '5. TDD の流儀を守る：テストを先に書く、Red（失敗）を確認してから実装する、小さく進む、テストを書き換えて通すことはしない',
            '6. 教材に書いていないこと・わからないことは、正直に「教材には書いていません」と言う。そのうえで一般的な知識として答えるか、Arai先生に聞くようすすめる',
            '7. 講座と関係ない話題は、ひとこと答えて、やさしく教材に戻す',
            '8. Markdown で書く。コードは ``` で囲み、言語名（php、bash など）を付ける。長い文章より、箇条書きと短いコード',
            '9. 自分が AI であることは隠さない。「' + TEACHER + '（AI）」として振る舞う',
            '10. 別のページの内容を案内するときは、下の一覧にあるファイル名をそのまま書く（例：handson-setup-mac.html）。リンクになる',
            '',
            '## 講座のページ一覧',
            index || '（一覧なし）',
            '',
            '## いま生徒が見ているページ',
            'タイトル：' + pageTitle(),
            'ファイル：' + (location.pathname.split('/').pop() || 'index.html'),
            '本文（見出しは #、コードは ``` で囲んである）：',
            '',
            extractPageText(document.body)
        ].join('\n');
    }

    /* ---------- Gemini ---------- */

    function apiError(status, message) { var e = new Error(message || ('HTTP ' + status)); e.status = status; return e; }

    function modelCandidates(cfg) {
        var list = MODELS.slice();
        if (cfg.model) { list = [cfg.model].concat(list.filter(function (m) { return m !== cfg.model; })); }
        var known = null;
        try { known = sessionStorage.getItem('csdTutor:model'); } catch (e) { /* 使えないときは毎回試す */ }
        if (known && list.indexOf(known) > 0) list = [known].concat(list.filter(function (m) { return m !== known; }));
        return list;
    }

    function buildBody(systemText, history, cfg, model, withThinking) {
        var contents = history.slice(-MAX_HISTORY).map(function (m) {
            var t = m.text;
            if (m.role === 'user' && m.at) t = '（いま見ている箇所：「' + m.at + '」）\n' + t;
            return { role: m.role, parts: [{ text: t }] };
        });
        var body = {
            systemInstruction: { parts: [{ text: systemText }] },
            contents: contents,
            generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
        };
        if (withThinking && cfg.thinkingLevel && /^gemini-3/.test(model)) {
            body.generationConfig.thinkingConfig = { thinkingLevel: cfg.thinkingLevel };
        }
        return body;
    }

    // SSE を読みながら onText(差分) を呼ぶ。終わったら resolve
    function streamOnce(cfg, model, body, signal, onText) {
        var url, headers = { 'Content-Type': 'application/json' };
        if (cfg.proxyUrl) {
            url = cfg.proxyUrl + (cfg.proxyUrl.indexOf('?') >= 0 ? '&' : '?') + 'model=' + encodeURIComponent(model);
        } else {
            url = API_BASE + model + ':streamGenerateContent?alt=sse';
            headers['x-goog-api-key'] = cfg.apiKey;
        }
        return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: signal }).then(function (res) {
            if (!res.ok) {
                return res.text().then(function (t) {
                    var msg = '';
                    try { var j = JSON.parse(t); msg = (j.error && j.error.message) || (j[0] && j[0].error && j[0].error.message) || ''; } catch (e) { msg = t.slice(0, 200); }
                    throw apiError(res.status, msg);
                });
            }
            var reader = res.body.getReader(), dec = new TextDecoder(), buf = '', got = false;
            function handle(line) {
                if (line.indexOf('data:') !== 0) return;
                var json = line.slice(5).trim();
                if (!json || json === '[DONE]') return;
                var d; try { d = JSON.parse(json); } catch (e) { return; }
                if (d.error) throw apiError(d.error.code || 500, d.error.message);
                if (d.promptFeedback && d.promptFeedback.blockReason) throw apiError(451, 'blocked:' + d.promptFeedback.blockReason);
                var c = d.candidates && d.candidates[0];
                if (!c) return;
                var parts = (c.content && c.content.parts) || [];
                for (var k = 0; k < parts.length; k++) if (parts[k].text && !parts[k].thought) { got = true; onText(parts[k].text); }
                if (c.finishReason && c.finishReason !== 'STOP' && c.finishReason !== 'MAX_TOKENS' && !got) throw apiError(451, 'blocked:' + c.finishReason);
            }
            return (function pump() {
                return reader.read().then(function (r) {
                    if (r.done) { if (buf.trim()) handle(buf.trim()); return; }
                    buf += dec.decode(r.value, { stream: true });
                    var lines = buf.split(/\r?\n/); buf = lines.pop();
                    lines.forEach(function (l) { handle(l.trim()); });
                    return pump();
                });
            })();
        });
    }

    function isModelMissing(err) {
        return err.status === 404 || (err.status === 400 && /not found|not supported|unsupported model|does not exist/i.test(err.message || ''));
    }

    // 候補のモデルを順に試す。thinking の指定が通らなければ外して再試行
    function streamGenerate(cfg, systemText, history, signal, onText) {
        var models = modelCandidates(cfg);
        function tryAt(i, withThinking) {
            if (i >= models.length) return Promise.reject(apiError(404, 'no-model'));
            var model = models[i];
            return streamOnce(cfg, model, buildBody(systemText, history, cfg, model, withThinking), signal, onText).then(function () {
                try { sessionStorage.setItem('csdTutor:model', model); } catch (e) { /* 保存できなくてもよい */ }
                return model;
            }, function (err) {
                if (signal.aborted) throw err;
                if (withThinking && err.status === 400 && /thinking/i.test(err.message || '')) return tryAt(i, false);
                if (isModelMissing(err)) return tryAt(i + 1, true);
                throw err;
            });
        }
        return tryAt(0, true);
    }

    function friendlyError(err) {
        if (!err) return '';
        if (err.name === 'AbortError') return '';
        if (err.status === 404 && err.message === 'no-model') return '使えるモデルが見つかりませんでした。講師に伝えてください（ai-config.json の model）。';
        if (err.status === 400 && /api key/i.test(err.message || '')) return 'API キーが無効です。講師に伝えてください。';
        if (err.status === 403) return 'API キーに権限がありません（サイトの制限設定）。講師に伝えてください。';
        if (err.status === 429) return 'いま混み合っています。30秒ほど待って、もう一度送ってください。';
        if (err.status === 451) return 'この質問には答えられませんでした（安全フィルター）。言い方を変えてみてください。';
        if (err.status >= 500) return 'Gemini 側で一時的なエラーです。もう一度送ってください。';
        if (err.status) return 'エラーが起きました（' + err.status + '）。' + (err.message ? ' ' + String(err.message).slice(0, 160) : '');
        return 'ネットワークにつながっていません。接続を確かめて、もう一度送ってください。';
    }

    /* ---------- 画面 ---------- */

    var CSS = '\
#csd-tutor-launch{position:fixed;right:30px;bottom:92px;z-index:999;display:flex;align-items:center;gap:10px;height:52px;padding:0 18px 0 6px;border:0;border-radius:9999px;cursor:pointer;color:#fff;font:700 14px/1 "Noto Sans JP","Hiragino Sans",sans-serif;background:linear-gradient(135deg,var(--accent,#6366f1),var(--accent-2,#4338ca));box-shadow:0 8px 22px -6px rgba(67,56,202,.6);transition:transform .15s,box-shadow .15s}\
#csd-tutor-launch:hover{transform:translateY(-2px);box-shadow:0 12px 26px -6px rgba(67,56,202,.7)}\
#csd-tutor-launch img{width:40px;height:40px;border-radius:50%;object-fit:cover;background:#fff;border:2px solid rgba(255,255,255,.9)}\
#csd-tutor-launch .csd-tutor-badge{position:absolute;top:-6px;right:-4px;background:#f59e0b;color:#fff;font-size:10px;padding:2px 6px;border-radius:9999px}\
body.csd-tutor-open #csd-tutor-launch{display:none}\
#csd-tutor{position:fixed;right:24px;bottom:24px;z-index:1200;width:430px;max-width:calc(100vw - 48px);height:min(76vh,760px);display:none;flex-direction:column;background:#fff;color:#1d2433;border-radius:20px;box-shadow:0 2px 4px rgba(16,24,40,.05),0 24px 60px -12px rgba(16,24,40,.35);border:1px solid #e7e3da;overflow:hidden;font-family:"Noto Sans JP","Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif;font-size:14px;line-height:1.7}\
#csd-tutor.open{display:flex}\
@media (min-width:1280px){body.pnav-on #csd-tutor-launch{right:calc(18rem + 30px)}body.pnav-on #csd-tutor{right:calc(18rem + 24px)}}\
.csd-tutor-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(135deg,var(--accent,#6366f1),var(--accent-2,#4338ca));color:#fff}\
.csd-tutor-head img{width:40px;height:40px;border-radius:50%;object-fit:cover;background:#fff;border:2px solid rgba(255,255,255,.9);flex:none}\
.csd-tutor-head .t{flex:1;min-width:0}\
.csd-tutor-head .t b{display:block;font-size:15px}\
.csd-tutor-head .t small{display:block;font-size:11px;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.csd-tutor-head button{flex:none;border:0;background:rgba(255,255,255,.18);color:#fff;border-radius:9999px;cursor:pointer;font:inherit;font-size:12px;padding:6px 10px}\
.csd-tutor-head button:hover{background:rgba(255,255,255,.3)}\
.csd-tutor-head .x{width:32px;height:32px;padding:0;font-size:20px;line-height:1}\
.csd-tutor-log{flex:1;overflow-y:auto;padding:14px 14px 6px;background:#fbfaf7;scroll-behavior:smooth}\
.csd-tutor-msg{display:flex;gap:8px;margin-bottom:12px;align-items:flex-start}\
.csd-tutor-msg img{width:30px;height:30px;border-radius:50%;object-fit:cover;background:#fff;border:1px solid #e7e3da;flex:none;margin-top:2px}\
.csd-tutor-msg .b{max-width:85%;padding:10px 13px;border-radius:14px;overflow-wrap:anywhere}\
.csd-tutor-msg.ai .b{background:#fff;border:1px solid #e7e3da;border-top-left-radius:4px}\
.csd-tutor-msg.me{justify-content:flex-end}\
.csd-tutor-msg.me .b{background:var(--accent,#6366f1);color:#fff;border-top-right-radius:4px;white-space:pre-wrap}\
.csd-tutor-msg.err .b{background:#fff1f2;border:1px solid #fecdd3;color:#9f1239}\
.csd-tutor-msg .b p{margin:0 0 8px}.csd-tutor-msg .b p:last-child{margin-bottom:0}\
.csd-tutor-msg .b ul,.csd-tutor-msg .b ol{margin:4px 0 8px;padding-left:20px}.csd-tutor-msg .b li{margin:2px 0}\
.csd-tutor-msg .b h3,.csd-tutor-msg .b h4,.csd-tutor-msg .b h5,.csd-tutor-msg .b h6{font-size:14px;font-weight:700;margin:10px 0 4px;color:#312e81}\
.csd-tutor-msg .b blockquote{margin:6px 0;padding:4px 10px;border-left:3px solid #c7d2fe;color:#5b6475}\
.csd-tutor-msg .b code{font-family:"JetBrains Mono",Menlo,monospace;font-size:12.5px;background:#eef0ff;color:#3730a3;padding:1px 5px;border-radius:5px}\
.csd-tutor-msg .b a{color:#4338ca;text-decoration:underline}\
.csd-tutor-code{margin:8px 0;border-radius:10px;overflow:hidden;background:#0f172a;color:#e2e8f0}\
.csd-tutor-code-bar{display:flex;justify-content:space-between;align-items:center;padding:4px 10px;font-size:11px;color:#94a3b8;background:#1e293b}\
.csd-tutor-code-bar button{border:0;background:transparent;color:#cbd5e1;cursor:pointer;font:inherit;font-size:11px;padding:2px 6px;border-radius:4px}\
.csd-tutor-code-bar button:hover{background:#334155}\
.csd-tutor-code pre{margin:0;padding:10px 12px;overflow-x:auto;font-family:"JetBrains Mono",Menlo,monospace;font-size:12.5px;line-height:1.55;white-space:pre}\
.csd-tutor-code pre code{background:none;color:inherit;padding:0;font-size:inherit}\
.csd-tutor-typing{display:inline-block;width:8px;height:16px;background:#6366f1;border-radius:2px;animation:csdTutorBlink 1s steps(2) infinite;vertical-align:text-bottom}\
@keyframes csdTutorBlink{to{opacity:0}}\
.csd-tutor-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 8px;background:#fbfaf7}\
.csd-tutor-chips button{border:1px solid #c7d2fe;background:#fff;color:#3730a3;border-radius:9999px;padding:5px 11px;font:inherit;font-size:12px;cursor:pointer}\
.csd-tutor-chips button:hover{background:#eef0ff}\
.csd-tutor-form{display:flex;gap:8px;align-items:flex-end;padding:10px 12px;border-top:1px solid #e7e3da;background:#fff}\
.csd-tutor-form textarea{flex:1;resize:none;border:1px solid #d6d3cc;border-radius:12px;padding:9px 12px;font:inherit;font-size:14px;line-height:1.5;max-height:140px;min-height:42px;outline:none;background:#fff;color:#1d2433}\
.csd-tutor-form textarea:focus{border-color:var(--accent,#6366f1);box-shadow:0 0 0 3px rgba(99,102,241,.15)}\
.csd-tutor-form button{flex:none;height:42px;min-width:64px;padding:0 14px;border:0;border-radius:12px;background:var(--accent,#6366f1);color:#fff;font:inherit;font-weight:700;font-size:13px;cursor:pointer}\
.csd-tutor-form button:disabled{opacity:.5;cursor:default}\
.csd-tutor-form button.stop{background:#dc2626}\
.csd-tutor-note{padding:0 14px 10px;font-size:11px;color:#5b6475;background:#fff;line-height:1.5}\
.csd-tutor-at{font-size:11px;color:#5b6475;padding:0 14px 6px;background:#fbfaf7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
@media (max-width:640px){\
#csd-tutor-launch{right:16px;bottom:88px;height:56px;width:56px;padding:0;justify-content:center}\
#csd-tutor-launch span{display:none}\
#csd-tutor{right:0;bottom:0;left:0;top:0;width:auto;max-width:none;height:auto;border-radius:0;border:0}\
.csd-tutor-msg .b{max-width:92%}\
}\
@media (prefers-reduced-motion:reduce){#csd-tutor-launch{transition:none}.csd-tutor-log{scroll-behavior:auto}}';

    var state = { cfg: null, cfgError: '', index: [], pageFiles: [], systemText: '', history: [], busy: false, abort: null, el: {} };
    var storeKey = 'csdTutor:' + (typeof location !== 'undefined' ? location.pathname : '');

    function loadHistory() {
        try { var s = sessionStorage.getItem(storeKey); state.history = s ? JSON.parse(s) : []; } catch (e) { state.history = []; }
    }
    function saveHistory() {
        try { sessionStorage.setItem(storeKey, JSON.stringify(state.history.slice(-40))); } catch (e) { /* 保存できなくてもよい */ }
    }

    function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

    function mount() {
        var style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

        var launch = h('<button id="csd-tutor-launch" type="button" aria-label="' + TEACHER + '（AI）に質問する" aria-haspopup="dialog" aria-expanded="false">' +
            '<img src="' + AVATAR + '" alt=""><span>先生に聞く</span></button>');
        var panel = h('<section id="csd-tutor" role="dialog" aria-modal="false" aria-label="' + TEACHER + '（AI）に質問する">' +
            '<div class="csd-tutor-head"><img src="' + AVATAR + '" alt=""><div class="t"><b>' + TEACHER + '（AI）</b><small></small></div>' +
            '<button type="button" class="reset" title="会話を消して、はじめから">はじめから</button><button type="button" class="x" aria-label="閉じる">×</button></div>' +
            '<div class="csd-tutor-log" aria-live="polite"></div>' +
            '<div class="csd-tutor-at"></div>' +
            '<div class="csd-tutor-chips"></div>' +
            '<form class="csd-tutor-form"><textarea rows="1" placeholder="わからないところ・エラーの内容を書いてください" aria-label="質問"></textarea><button type="submit">送る</button></form>' +
            '<div class="csd-tutor-note">AI の回答です。間違うこともあります。質問は Google の AI（Gemini）に送られるので、個人情報は書かないでください。困ったら講師に聞いてください。</div>' +
            '</section>');
        document.body.appendChild(launch); document.body.appendChild(panel);

        var el = state.el;
        el.launch = launch; el.panel = panel;
        el.sub = panel.querySelector('.csd-tutor-head small');
        el.log = panel.querySelector('.csd-tutor-log');
        el.at = panel.querySelector('.csd-tutor-at');
        el.chips = panel.querySelector('.csd-tutor-chips');
        el.form = panel.querySelector('form');
        el.input = panel.querySelector('textarea');
        el.send = panel.querySelector('form button');
        el.sub.textContent = 'いま見ているページ：' + pageTitle();

        CHIPS.forEach(function (c) {
            var b = h('<button type="button">' + c.label + '</button>');
            b.addEventListener('click', function () {
                if (c.send) { send(c.text); } else { el.input.value = c.text; el.input.focus(); autosize(); }
            });
            el.chips.appendChild(b);
        });

        launch.addEventListener('click', open);
        panel.querySelector('.x').addEventListener('click', close);
        panel.querySelector('.reset').addEventListener('click', function () {
            if (state.busy) stop();
            state.history = []; saveHistory(); renderLog();
        });
        el.form.addEventListener('submit', function (e) { e.preventDefault(); if (state.busy) { stop(); return; } send(el.input.value); });
        el.input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!state.busy) send(el.input.value); }
        });
        el.input.addEventListener('input', autosize);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('open')) close(); });
        el.log.addEventListener('click', function (e) {
            var b = e.target.closest('.csd-tutor-copy'); if (!b) return;
            var code = b.closest('.csd-tutor-code').querySelector('code').textContent;
            navigator.clipboard.writeText(code).then(function () { b.textContent = 'コピーしました'; setTimeout(function () { b.textContent = 'コピー'; }, 1500); });
        });
        window.addEventListener('scroll', function () { if (panel.classList.contains('open')) updateAt(); }, { passive: true });
    }

    function autosize() {
        var t = state.el.input; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px';
    }

    function updateAt() {
        var a = currentHeading();
        state.el.at.textContent = a ? '📍 いま見ているあたり：' + a : '';
    }

    function open() {
        var el = state.el;
        el.panel.classList.add('open'); document.body.classList.add('csd-tutor-open'); el.launch.setAttribute('aria-expanded', 'true');
        updateAt();
        if (!state.cfg && !state.cfgError) loadConfig();
        renderLog();
        if (window.innerWidth > 640) el.input.focus();
    }

    function close() {
        var el = state.el;
        el.panel.classList.remove('open'); document.body.classList.remove('csd-tutor-open'); el.launch.setAttribute('aria-expanded', 'false');
        el.launch.focus();
    }

    function loadConfig() {
        var el = state.el;
        fetch(CONFIG_URL, { cache: 'no-store' }).then(function (r) {
            if (!r.ok) throw new Error('config ' + r.status);
            return r.json();
        }).then(function (cfg) {
            if (!cfg || (!cfg.apiKey && !cfg.proxyUrl)) throw new Error('config empty');
            state.cfg = cfg;
        }).catch(function () {
            state.cfgError = TEACHER + '（AI）はまだ準備中です（API キーが設定されていません）。講師に伝えてください。';
            renderLog();
        });
        fetch(INDEX_URL).then(function (r) { return r.ok ? r.json() : []; }).then(function (idx) {
            state.index = Array.isArray(idx) ? idx : [];
            state.pageFiles = state.index.map(function (p) { return p.file; });
            if (el.log.childElementCount) renderLog();
        }).catch(function () { state.index = []; });
    }

    function bubble(role, html) {
        var cls = role === 'user' ? 'me' : role === 'error' ? 'err' : 'ai';
        var m = h('<div class="csd-tutor-msg ' + cls + '">' + (cls === 'ai' ? '<img src="' + AVATAR + '" alt="">' : '') + '<div class="b"></div></div>');
        var b = m.querySelector('.b');
        if (role === 'user') b.textContent = html; else b.innerHTML = html;
        return m;
    }

    function welcomeHtml() {
        return renderMarkdown('こんにちは、' + TEACHER + '（AI）です 👋\n\nいま見ている「**' + pageTitle() + '**」について、わからないところを聞いてください。エラーメッセージをそのまま貼ってもらっても大丈夫です。', state.pageFiles);
    }

    function renderLog() {
        var el = state.el; el.log.innerHTML = '';
        el.log.appendChild(bubble('model', welcomeHtml()));
        if (state.cfgError) el.log.appendChild(bubble('error', escapeHtml(state.cfgError)));
        state.history.forEach(function (m) { el.log.appendChild(bubble(m.role, m.role === 'user' ? m.text : renderMarkdown(m.text, state.pageFiles))); });
        el.chips.style.display = state.history.length ? 'none' : '';
        el.log.scrollTop = el.log.scrollHeight;
    }

    function setBusy(on) {
        state.busy = on; var el = state.el;
        el.send.textContent = on ? '■ 停止' : '送る'; el.send.classList.toggle('stop', on);
        el.input.disabled = on;
    }

    function stop() { if (state.abort) state.abort.abort(); }

    function send(text) {
        text = (text || '').trim();
        if (!text || state.busy) return;
        var el = state.el;
        if (!state.cfg) {
            if (!state.cfgError) { state.cfgError = TEACHER + '（AI）の設定を読み込めませんでした。少し待ってから、もう一度送ってください。'; }
            renderLog(); return;
        }
        el.input.value = ''; autosize();
        state.history.push({ role: 'user', text: text, at: currentHeading() });
        saveHistory();
        el.chips.style.display = 'none';
        el.log.appendChild(bubble('user', text));

        var m = bubble('model', '<span class="csd-tutor-typing"></span>');
        var b = m.querySelector('.b');
        el.log.appendChild(m); el.log.scrollTop = el.log.scrollHeight;

        // ページ本文は会話の最初に1回だけ読む（その会話の間、同じ教材を見ている前提）
        if (!state.systemText) state.systemText = buildSystemPrompt(state.index);

        var acc = '', raf = 0;
        function paint() {
            raf = 0;
            var stick = el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 80;
            b.innerHTML = renderMarkdown(acc, state.pageFiles) + '<span class="csd-tutor-typing"></span>';
            if (stick) el.log.scrollTop = el.log.scrollHeight;
        }
        state.abort = new AbortController();
        setBusy(true);
        streamGenerate(state.cfg, state.systemText, state.history, state.abort.signal, function (delta) {
            acc += delta; if (!raf) raf = requestAnimationFrame(paint);
        }).then(function () {
            finish();
        }, function (err) {
            finish();
            var msg = friendlyError(err);
            if (msg) el.log.appendChild(bubble('error', escapeHtml(msg)));
            if (!acc) { m.remove(); if (err.name === 'AbortError') { state.history.pop(); saveHistory(); } }
            el.log.scrollTop = el.log.scrollHeight;
        });
        function finish() {
            if (raf) cancelAnimationFrame(raf);
            setBusy(false); state.abort = null;
            if (acc) {
                b.innerHTML = renderMarkdown(acc, state.pageFiles);
                state.history.push({ role: 'model', text: acc }); saveHistory();
            }
            el.log.scrollTop = el.log.scrollHeight;
            if (window.innerWidth > 640) el.input.focus();
        }
    }

    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        var init = function () { loadHistory(); mount(); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    }

    // テスト用（node --test）。ブラウザでは使わない
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { renderMarkdown: renderMarkdown, inlineMarkdown: inlineMarkdown, extractPageText: extractPageText, isModelMissing: isModelMissing, friendlyError: friendlyError, MODELS: MODELS };
    }
})();
