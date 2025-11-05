// ナビゲーションの現在ページをハイライト
document.addEventListener('DOMContentLoaded', function() {
    // 現在のページのファイル名を取得
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    // デスクトップメニューのリンクをハイライト
    const navLinks = document.querySelectorAll('nav a[href]');
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage) {
            link.classList.add('nav-active');
        }
    });

    // モバイルメニューのリンクをハイライト
    const mobileLinks = document.querySelectorAll('#mobileMenu a[href]');
    mobileLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage) {
            link.classList.add('nav-active');
        }
    });
});
