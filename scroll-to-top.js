// 上に戻るボタンの制御
document.addEventListener('DOMContentLoaded', function() {
    // ボタンHTML生成
    const buttonHTML = `
        <button id="scrollToTopButton" class="scroll-to-top-button" aria-label="上に戻る">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="24" height="24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path>
            </svg>
        </button>
    `;

    // bodyに追加
    document.body.insertAdjacentHTML('beforeend', buttonHTML);

    const scrollButton = document.getElementById('scrollToTopButton');

    // スクロール位置に応じてボタンの表示/非表示
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            scrollButton.classList.add('visible');
        } else {
            scrollButton.classList.remove('visible');
        }
    });

    // ボタンクリックでトップにスクロール
    scrollButton.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
});
