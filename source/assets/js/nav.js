const menu = document.getElementById("mobile-menu");

document.getElementById("mobile-menu-open").addEventListener("click", () => {
    menu.style.width = "100%";
});

document.getElementById("mobile-menu-close").addEventListener("click", () => {
    menu.style.width = "0%";
});
