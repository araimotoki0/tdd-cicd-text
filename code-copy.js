// コードブロックにコピーボタンを追加する機能

document.addEventListener('DOMContentLoaded', function() {
    // すべてのコードブロック（pre要素）を取得
    const codeBlocks = document.querySelectorAll('pre');

    codeBlocks.forEach((block) => {
        // コピーボタンを作成
        const button = document.createElement('button');
        button.className = 'copy-button';
        button.innerHTML = `
            <svg class="copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span class="copy-text">コピー</span>
        `;

        // コピーボタンのクリックイベント
        button.addEventListener('click', async function() {
            // コードテキストを取得（HTMLタグを除去）
            const code = block.textContent || block.innerText;

            try {
                // クリップボードにコピー
                await navigator.clipboard.writeText(code);

                // ボタンの表示を「コピーしました」に変更
                button.classList.add('copied');
                button.innerHTML = `
                    <svg class="copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span class="copy-text">コピー完了</span>
                `;

                // 2秒後に元に戻す
                setTimeout(() => {
                    button.classList.remove('copied');
                    button.innerHTML = `
                        <svg class="copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span class="copy-text">コピー</span>
                    `;
                }, 2000);
            } catch (err) {
                console.error('コピーに失敗しました:', err);
                button.innerHTML = `
                    <span class="copy-text">エラー</span>
                `;
                setTimeout(() => {
                    button.innerHTML = `
                        <svg class="copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span class="copy-text">コピー</span>
                    `;
                }, 2000);
            }
        });

        // preタグの親要素にrelativeポジションを追加
        const wrapper = block.parentElement;
        wrapper.style.position = 'relative';

        // ボタンを追加
        wrapper.appendChild(button);
    });
});
