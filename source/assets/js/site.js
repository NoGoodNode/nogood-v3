document.addEventListener('DOMContentLoaded', () => {
    const sections = [...document.querySelectorAll('.parallax')].map(section => ({
        section,
        img: section.querySelector('img'),
    })).filter(({ img }) => img);

    if (sections.length) {
        const strength = 0.06;

        function update() {
            const viewHeight = window.innerHeight;
            sections.forEach(({ section, img }) => {
                const rect = section.getBoundingClientRect();
                if (rect.bottom < 0 || rect.top > viewHeight) return;
                const centerOffset = rect.top + rect.height / 2 - viewHeight / 2;
                img.style.transform = `translateY(${-centerOffset * strength}px)`;
            });
        }

        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update, { passive: true });
        update();
    }

    // Fade in on viewport entry
    const fadeEls = document.querySelectorAll('.fade-in');
    if (fadeEls.length) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
        fadeEls.forEach(el => observer.observe(el));
    }

    // Rotate circular text on scroll
    const badgeTexts = document.querySelectorAll('.header-badge-text');
    if (badgeTexts.length) {
        window.addEventListener('scroll', () => {
            const deg = `rotate(${window.scrollY * 0.15}deg)`;
            badgeTexts.forEach(el => el.style.transform = deg);
        }, { passive: true });
    }

    // Masonry row-span
    const masonryGrid = document.querySelector('.masonry');
    if (masonryGrid) {
        const MOBILE_BREAKPOINT = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--breakpoint-small') || '768');
        const colPct = 100 / 3;

        function getCol(rel, colW) {
            if (rel < colW * 0.5) return 1;
            if (rel < colW * 1.5) return 2;
            return 3;
        }

        function setMasonrySpans() {
            masonryGrid.querySelectorAll('.masonry-ghost').forEach(g => g.remove());

            const items = masonryGrid.querySelectorAll('.masonry-item');

            if (window.innerWidth <= MOBILE_BREAKPOINT) {
                items.forEach(item => { item.style.gridRowEnd = ''; });
                return;
            }

            // Reset spans so heights are natural, then read all rects in one pass
            items.forEach(item => { item.style.gridRowEnd = ''; });

            const gridRect = masonryGrid.getBoundingClientRect();
            const colW = gridRect.width / 3;

            // Single read pass — collect all rects
            const rects = Array.from(items).map(item => item.getBoundingClientRect());

            // Set spans
            rects.forEach((rect, i) => {
                items[i].style.gridRowEnd = 'span ' + Math.ceil(rect.height);
            });

            // Re-read rects after spans are applied (positions have changed)
            const placed = Array.from(items).map(item => item.getBoundingClientRect());

            let maxBottom = 0;
            placed.forEach(r => { if (r.bottom > maxBottom) maxBottom = r.bottom; });

            masonryGrid.style.height = (maxBottom - gridRect.top) + 'px';

            const colBottoms = [gridRect.top, gridRect.top, gridRect.top];
            let lastCol = 1;

            placed.forEach((rect, i) => {
                const col = getCol(rect.left - gridRect.left, colW);
                if (rect.bottom > colBottoms[col - 1]) colBottoms[col - 1] = rect.bottom;
                if (Math.abs(rect.bottom - maxBottom) < 2) lastCol = col;
                items[i].classList.toggle('masonry-item--last-col',   Math.abs(rect.right  - gridRect.right) < 2);
                items[i].classList.toggle('masonry-item--bottom-row', Math.abs(rect.bottom - maxBottom) < 2);
            });

            const ghostCols = lastCol === 3 ? [1, 2] : lastCol === 2 ? [1] : [2];
            ghostCols.forEach(col => {
                const colBottom = colBottoms[col - 1];
                if (colBottom >= maxBottom) return;
                const ghost = document.createElement('div');
                ghost.className = 'masonry-ghost masonry-ghost--' + (col === 1 ? 'left' : 'middle');
                ghost.style.top = (colBottom - gridRect.top) + 'px';
                ghost.style.left = ((col - 1) * colPct) + '%';
                ghost.style.width = colPct + '%';
                masonryGrid.appendChild(ghost);
            });
        }

        let masonryRaf;
        function scheduleMasonrySpans() {
            cancelAnimationFrame(masonryRaf);
            masonryRaf = requestAnimationFrame(() => {
                document.documentElement.style.overflowAnchor = 'none';
                setMasonrySpans();
                requestAnimationFrame(() => {
                    document.documentElement.style.overflowAnchor = '';
                });
            });
        }
        setMasonrySpans();
        new ResizeObserver(scheduleMasonrySpans).observe(masonryGrid);
        masonryGrid.querySelectorAll('img').forEach(img => {
            if (!img.complete) img.addEventListener('load', scheduleMasonrySpans);
        });
        masonryGrid.querySelectorAll('video').forEach(video => {
            if (video.readyState < 1) video.addEventListener('loadedmetadata', scheduleMasonrySpans);
        });
    }

    // Gutter bg color — match html bg to section nearest the viewport center
    const bgSections = document.querySelectorAll('.section, footer');
    if (bgSections.length) {
        const html = document.documentElement;
        const primaryLight = getComputedStyle(html).getPropertyValue('--primary-light').trim();
        function updateHtmlBg() {
            const mid = window.innerHeight / 2;
            let best = null, bestDist = Infinity;
            bgSections.forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.bottom < 0 || r.top > window.innerHeight) return;
                const dist = Math.abs((r.top + r.height / 2) - mid);
                if (dist < bestDist) { bestDist = dist; best = el; }
            });
            if (best) {
                const bg = getComputedStyle(best).backgroundColor;
                html.style.backgroundColor = (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') ? primaryLight : bg;
            }
        }
        updateHtmlBg();
        window.addEventListener('scroll', updateHtmlBg, { passive: true });
    }

    // Portfolio carousel
    document.querySelectorAll('.portfolio-carousel').forEach(carousel => {
        if (window.innerWidth <= 768) return;

        const track = carousel.querySelector('.portfolio-carousel-track');
        const realCount = track.querySelectorAll('.portfolio-item:not([aria-hidden="true"])').length;
        let currentIndex = 0;
        let isAnimating = false;

        function getItemWidth() {
            const item = track.querySelector('.portfolio-item');
            const gap = parseFloat(getComputedStyle(track).gap) || 0;
            return item.getBoundingClientRect().width + gap;
        }

        function slideTo(index, animate = true) {
            if (animate && isAnimating) return;
            if (animate) isAnimating = true;
            track.style.transition = animate ? 'transform 0.6s ease' : 'none';
            track.style.transform = `translateX(-${index * getItemWidth()}px)`;
            if (!animate) void track.offsetHeight;
            currentIndex = index;
            if (animate) {
                setTimeout(() => {
                    if (currentIndex >= realCount) {
                        track.style.transition = 'none';
                        currentIndex = 0;
                        track.style.transform = 'translateX(0)';
                    }
                    isAnimating = false;
                }, 650);
            }
        }

        setInterval(() => {
            if (isAnimating) return;
            slideTo(currentIndex + 1);
        }, 3000);

    });
});

// Node status + nav status indicators
(function () {
    const footerTag  = document.getElementById('node-footer-status');
    const navNode    = document.getElementById('nav-status-node');
    const navBtc     = document.getElementById('nav-status-btc');
    const navRadio   = document.getElementById('nav-status-radio');

    let nodeOfflineCount = 0;
    const NODE_OFFLINE_THRESHOLD = 10;

    async function fetchNode() {
        let online = false;
        try {
            const res = await fetch('https://btcpay.hello-5b9.workers.dev/health', {
                method: 'GET',
                cache: 'no-store',
                signal: AbortSignal.timeout(5000)
            });
            const data = await res.json();
            online = res.ok && data.synchronized === true;
        } catch {}
        return online;
    }

    async function fetchRadio() {
        let live = false;
        try {
            const resp = await fetch('https://lastfm-api.hello-5b9.workers.dev/', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
            if (resp.ok) {
                const tracks = await resp.json();
                live = tracks.some(t => !t.playedAt);
            }
        } catch {}
        return live;
    }

    function applyNode(online, force = false) {
        if (online) {
            nodeOfflineCount = 0;
        } else {
            nodeOfflineCount++;
            if (!force && nodeOfflineCount < NODE_OFFLINE_THRESHOLD) return;
        }
        if (footerTag) {
            footerTag.className = 'node-tag pixel-font uppercase node-tag-footer ' + (online ? 'node-tag-online' : 'node-tag-offline');
            footerTag.textContent = online ? 'nogoodnode online' : 'nogoodnode offline';
            footerTag.style.visibility = 'visible';
            footerTag.style.display = 'inline';
        }
        if (navNode) {
            navNode.querySelector('.nav-status-dot').className = 'nav-status-dot ' + (online ? 'online' : 'offline');
            navNode.querySelector('.nav-status-label').textContent = 'NOGOODNODE';
            navNode.querySelector('.nav-status-value').textContent = online ? 'online' : 'offline';
        }
        if (navBtc) {
            navBtc.querySelector('.nav-status-dot').className = 'nav-status-dot ' + (online ? 'online' : 'offline');
            navBtc.querySelector('.nav-status-label').textContent = 'BTC PAYMENTS';
            navBtc.querySelector('.nav-status-value').textContent = online ? 'enabled' : 'disabled';
        }
    }

    function applyRadio(live) {
        if (navRadio) {
            navRadio.querySelector('.nav-status-dot').className = 'nav-status-dot ' + (live ? 'online' : 'offline');
            navRadio.querySelector('.nav-status-label').textContent = 'NOGOOD RADIO';
            navRadio.querySelector('.nav-status-value').textContent = live ? 'online' : 'offline';
        }
        const homeStatus = document.getElementById('home-radio-status');
        if (homeStatus) {
            homeStatus.className = 'tag pixel-font uppercase ' + (live ? 'tag-available' : 'tag-unavailable');
            homeStatus.textContent = live ? 'Online' : 'Offline';
        }
    }

    function revealItems() {
        [navNode, navBtc, navRadio].forEach(el => {
            if (!el) return;
            el.style.display = 'table-row';
        });
    }

    async function initialLoad() {
        const [online, live] = await Promise.all([fetchNode(), fetchRadio()]);
        applyNode(online, true);
        applyRadio(live);
        revealItems();
    }

    async function refresh() {
        if (document.hidden) return;
        const [online, live] = await Promise.all([fetchNode(), fetchRadio()]);
        applyNode(online);
        applyRadio(live);
    }

    initialLoad();
    setInterval(refresh, 120000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refresh();
    });
})();
