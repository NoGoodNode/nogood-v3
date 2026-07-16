const menu = document.getElementById("mobile-menu");
const menuVideo = menu.querySelector('.mobile-menu-book-promo video');

document.getElementById("mobile-menu-open").addEventListener("click", () => {
    menu.classList.add("is-open");
    if (menuVideo) {
        const source = menuVideo.querySelector('source[data-src]');
        if (source) {
            source.src = source.dataset.src;
            source.removeAttribute('data-src');
            menuVideo.load();
            menuVideo.play().catch(() => {});
        }
    }
});

document.getElementById("mobile-menu-close").addEventListener("click", () => {
    menu.classList.remove("is-open");
});
