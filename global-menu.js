// グローバルメニューの制御
document.addEventListener('DOMContentLoaded', function() {
    // メニューHTML生成
    const menuHTML = `
        <button class="global-menu-button" id="globalMenuButton" aria-label="メニューを開く">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
        </button>

        <div class="global-menu-overlay" id="globalMenuOverlay"></div>

        <nav class="global-menu" id="globalMenu">
            <div class="global-menu-header">
                <h2 class="global-menu-title">講座メニュー</h2>
                <button class="global-menu-close" id="globalMenuClose" aria-label="閉じる">×</button>
            </div>

            <div class="global-menu-content">
                <div class="global-menu-section">
                    <a href="handson-setup-windows.html" class="global-menu-item">Windows環境構築</a>
                    <a href="handson-setup-mac.html" class="global-menu-item">Mac環境構築</a>
                    <a href="ai-coding.html" class="global-menu-item">AI Coding</a>
                    <a href="mob-ai.html" class="global-menu-item">Mob AI</a>
                    <a href="replit-tdd.html" class="global-menu-item">Mob AI Replit</a>
                    <a href="index.html" class="global-menu-item">TDD講座</a>
                    <a href="cicd-index.html" class="global-menu-item">CI/CD講座</a>
                </div>
            </div>
        </nav>
    `;

    // body の先頭に追加
    document.body.insertAdjacentHTML('afterbegin', menuHTML);

    // 要素取得
    const menuButton = document.getElementById('globalMenuButton');
    const menu = document.getElementById('globalMenu');
    const overlay = document.getElementById('globalMenuOverlay');
    const closeButton = document.getElementById('globalMenuClose');

    // メニューを開く
    function openMenu() {
        menu.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // メニューを閉じる
    function closeMenu() {
        menu.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    // イベントリスナー
    menuButton.addEventListener('click', openMenu);
    closeButton.addEventListener('click', closeMenu);
    overlay.addEventListener('click', closeMenu);

    // ESCキーで閉じる
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && menu.classList.contains('active')) {
            closeMenu();
        }
    });

    // 現在のページをハイライト
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.global-menu-item').forEach(item => {
        const href = item.getAttribute('href');
        if (href === currentPage) {
            item.classList.add('active');
        }
    });
});
