// AI 先生の中継サーバー（Cloudflare Worker）― 任意・強化版
//
// ふつうは ai-config.json の apiKey だけで動く（ブラウザから Gemini を直接呼ぶ）。
// ただし、その方法では API キーがブラウザに渡る（ログインした受講者なら見える）。
// キーを完全に隠したいときは、この Worker を置き、ai-config.json の proxyUrl に Worker の URL を書く（apiKey は空でよい）。
//
// 置き方（Cloudflare のダッシュボードで約10分・無料枠で足りる）：
//   1. Workers & Pages → Create → Hello World で作り、このファイルの内容に置き換えて Deploy
//   2. Settings → Variables and Secrets：
//        GEMINI_API_KEY  … Gemini の API キー（Secret）
//        ALLOWED_ORIGIN  … https://csd.scrum.abi-agile.com （これ以外のサイトからは使えない）
//   3. GitHub の Secrets に AI_PROXY_URL = https://<worker 名>.<アカウント>.workers.dev を追加し、GEMINI_API_KEY を空にして push
export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        const cors = {
            'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
        };
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });
        if (env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) return new Response('forbidden', { status: 403, headers: cors });

        const model = (new URL(request.url).searchParams.get('model') || 'gemini-3-pro').replace(/[^a-z0-9.-]/gi, '');
        const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
            body: await request.text(),
        });
        const headers = new Headers(cors);
        headers.set('Content-Type', upstream.headers.get('Content-Type') || 'text/event-stream');
        return new Response(upstream.body, { status: upstream.status, headers });
    },
};
