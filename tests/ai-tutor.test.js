// AI 先生（ai-tutor.js）の、ブラウザに依存しない部分のテスト
// 実行：node --test tests/ai-tutor.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const t = require('../ai-tutor.js');

test('Markdown：見出し・箇条書き・太字・インラインコード', () => {
    const html = t.renderMarkdown('### 直し方\n- `php artisan test` を実行\n- **Red** を確認\n\n1. 一つ目\n2. 二つ目');
    assert.match(html, /<h5>直し方<\/h5>/);
    assert.match(html, /<ul>\n<li><code>php artisan test<\/code> を実行<\/li>\n<li><strong>Red<\/strong> を確認<\/li>\n<\/ul>/);
    assert.match(html, /<ol>\n<li>一つ目<\/li>\n<li>二つ目<\/li>\n<\/ol>/);
});

test('Markdown：コードブロックは言語名とコピーボタン付き。中身は HTML として解釈されない', () => {
    const html = t.renderMarkdown('```php\n$this->assertEquals(5, $calc->add(2, 3));\n<b>x</b>\n```');
    assert.match(html, /<div class="csd-tutor-code"><div class="csd-tutor-code-bar"><span>php<\/span><button type="button" class="csd-tutor-copy">コピー<\/button><\/div><pre><code>/);
    assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
    assert.match(html, /\$this-&gt;assertEquals\(5, \$calc-&gt;add\(2, 3\)\);/);
    assert.doesNotMatch(html, /<b>x<\/b>/);
});

test('Markdown：HTML はそのまま出さない（XSS 対策）', () => {
    const html = t.renderMarkdown('<img src=x onerror=alert(1)> と **<script>alert(1)</script>**');
    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, /<script/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('Markdown：リンクは http(s) か講座のページだけ。外部は別タブ', () => {
    const html = t.renderMarkdown('[公式](https://laravel.com/docs) と [環境構築](handson-setup-mac.html#step-1) と [危険](javascript:alert(1))');
    assert.match(html, /<a href="https:\/\/laravel.com\/docs" target="_blank" rel="noopener">公式<\/a>/);
    assert.match(html, /<a href="handson-setup-mac.html#step-1">環境構築<\/a>/);
    assert.doesNotMatch(html, /href="javascript:/);
});

test('Markdown：講座のページ名はリンクになる。一覧にない名前はならない', () => {
    const pages = ['handson-setup-mac.html', 'index.html'];
    const html = t.renderMarkdown('環境構築は handson-setup-mac.html を見てください。evil.html は違います。', pages);
    assert.match(html, /<a href="handson-setup-mac.html">handson-setup-mac.html<\/a>/);
    assert.doesNotMatch(html, /<a href="evil.html"/);
});

test('Markdown：コードブロックが閉じていない途中（ストリーミング中）でも落ちない', () => {
    const html = t.renderMarkdown('まずこれ：\n```bash\ndocker compose exec app bash');
    assert.match(html, /<p>まずこれ：<\/p>/);
    assert.match(html, /<code>docker compose exec app bash<\/code>/);
});

test('モデルの切り替え：404 や「見つからない」400 は次のモデルへ。それ以外は止める', () => {
    assert.equal(t.isModelMissing({ status: 404, message: '' }), true);
    assert.equal(t.isModelMissing({ status: 400, message: 'models/gemini-x is not found for API version v1beta' }), true);
    assert.equal(t.isModelMissing({ status: 400, message: 'API key not valid. Please pass a valid API key.' }), false);
    assert.equal(t.isModelMissing({ status: 429, message: 'quota' }), false);
});

test('エラー文：生徒に伝わる日本語になる', () => {
    assert.match(t.friendlyError({ status: 400, message: 'API key not valid.' }), /API キーが無効/);
    assert.match(t.friendlyError({ status: 429 }), /混み合って/);
    assert.match(t.friendlyError({ status: 404, message: 'no-model' }), /モデルが見つかりません/);
    assert.match(t.friendlyError(new TypeError('Failed to fetch')), /ネットワーク/);
    assert.equal(t.friendlyError({ name: 'AbortError' }), '');
});

test('モデル候補：精度の高いものから順に並び、Flash は最後の保険', () => {
    assert.equal(t.MODELS[0], 'gemini-4-argon');
    assert.equal(t.MODELS[t.MODELS.length - 1], 'gemini-3.8-flash');
    assert.ok(t.MODELS.indexOf('gemini-3.1-pro-preview') < t.MODELS.indexOf('gemini-pro-latest'));
});
