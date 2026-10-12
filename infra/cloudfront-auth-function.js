// CloudFront Function（viewer-request / cloudfront-js-2.0）
// Basic 認証の代わりに、ログインページ ＋ Cookie でログイン状態を持つ仕組み。
// iPhone のホーム画面アプリ（PWA）は Basic 認証のダイアログを出せないため、
// 一度ログインページでユーザー名とパスワードを入れたら Cookie を発行し、以後はそのまま通す。
//
// 使い方：
//   1. 下の USER / PASSWORD に講座のユーザー名とパスワード、TOKEN に推測されにくい長い文字列（40文字くらい）を入れる
//      ※ このファイルには書かず、CloudFront のコンソール上で入れること（Git に残さないため）
//   2. CloudFront の既存の Basic 認証 Function を、この内容で置き換えて Publish する
//   3. リポジトリの /login.html がデプロイされていること（push すれば自動）
var USER = 'ここにユーザー名';
var PASSWORD = 'ここにパスワード';
var TOKEN = 'ここにランダムな長い文字列';
var COOKIE = 'csd_auth';
var ONE_YEAR = 60 * 60 * 24 * 365;

// ログイン前でも取りに行ける必要があるもの（アプリのアイコン・マニフェスト・SW・ログインページ）
var OPEN = /^\/(login\.html|offline\.html|manifest\.json|sw\.js|favicon\.ico|icons\/.*|img\/qr-site\.(svg|png))$/;

function dec(v) { try { return decodeURIComponent(v); } catch (e) { return v; } }

function handler(event) {
    var req = event.request;
    var uri = req.uri;
    var cookies = req.cookies || {};
    var qs = req.querystring || {};

    // 1) 認証：/auth?u=...&pw=...&next=/home.html
    if (uri === '/auth') {
        var u = qs.u ? dec(qs.u.value) : '';
        var pw = qs.pw ? dec(qs.pw.value) : '';
        var next = qs.next ? dec(qs.next.value) : '/home.html';
        if (!/^\/[A-Za-z0-9_\-\/.?=&%]*$/.test(next)) next = '/home.html';
        if (u === USER && pw === PASSWORD) {
            return {
                statusCode: 302, statusDescription: 'Found',
                headers: { location: { value: next } },
                cookies: { csd_auth: { value: TOKEN, attributes: 'Path=/; Max-Age=' + ONE_YEAR + '; Secure; HttpOnly; SameSite=Lax' } }
            };
        }
        return { statusCode: 302, statusDescription: 'Found', headers: { location: { value: '/login.html?e=1&next=' + encodeURIComponent(next) } } };
    }

    // 2) 認証なしで通すもの
    if (OPEN.test(uri)) return req;

    // 3) Cookie があれば通す
    if (cookies[COOKIE] && cookies[COOKIE].value === TOKEN) return req;

    // 4) それ以外：ページならログインへ、ファイルなら 403
    if (uri === '/' || /\.html$/.test(uri) || uri.indexOf('.') === -1) {
        var target = uri === '/' ? '/home.html' : uri;
        if (qs.source) target += '?source=' + qs.source.value;
        return { statusCode: 302, statusDescription: 'Found', headers: { location: { value: '/login.html?next=' + encodeURIComponent(target) } } };
    }
    return { statusCode: 403, statusDescription: 'Forbidden' };
}
