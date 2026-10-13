// AI 先生（ai-tutor.js）が「別のページにあります」と案内するための索引を作る。
// 各ページの <title> と h2 / h3 を抜き出して ai-site-index.json に書く。
// ページの見出しを変えたら、リポジトリの直下で  node tools/build-ai-site-index.mjs  を実行する。
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 講座のページ（メニューの並び）。login / offline / 動画ページは索引に入れない
const PAGES = [
    'home.html',
    'handson-setup-windows.html', 'handson-setup-mac.html',
    'ai-coding-antigravity.html',
    'index.html', 'handson-basic.html', 'handson-refactor.html', 'handson-assertions.html', 'handson-advanced.html', 'handson-database.html',
    'mob-ai.html',
    'cicd-index.html', 'cicd-handson-basic.html', 'cicd-handson-quality.html', 'cicd-handson-deploy.html',
    'csd-preview.html', 'app.html',
];

function clean(html) {
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const index = PAGES.map((file) => {
    const html = readFileSync(resolve(root, file), 'utf8');
    // 「基礎編：Red-Greenサイクル体験 - TDD実践ハンズオン」→ 前半だけ（区切りは「 - 」。Red-Green の「-」は区切らない）
    const title = clean((html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1]).split(' - ')[0].trim();
    const headings = [];
    const re = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/g;
    let m;
    while ((m = re.exec(html))) {
        const text = clean(m[2]);
        if (text && !headings.includes(text)) headings.push(text);
    }
    return { file, title, headings };
});

writeFileSync(resolve(root, 'ai-site-index.json'), JSON.stringify(index, null, 1) + '\n');
console.log(`ai-site-index.json: ${index.length} pages, ${index.reduce((n, p) => n + p.headings.length, 0)} headings`);
