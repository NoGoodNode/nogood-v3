document.addEventListener('click', e => {
    const btn = e.target.closest('.embed-play');
    if (!btn) return;
    const facade = btn.closest('.embed-facade');
    if (!facade) return;
    let src = facade.dataset.src;
    if (src.includes('youtube.com') || src.includes('youtu.be')) {
        src += (src.includes('?') ? '&' : '?') + 'autoplay=1';
    }
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.className = 'embed-iframe';
    iframe.title = 'Embedded content';
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox');
    facade.replaceWith(iframe);
});
