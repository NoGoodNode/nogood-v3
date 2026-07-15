import Hls from '/assets/js/vendor/hls.js';

const RECONNECT_BASE = 5000;
const RECONNECT_MAX = 60000;

const ICON_PLAY     = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2l10 6-10 6z"/></svg>`;
const ICON_PAUSE    = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg>`;
const ICON_MUTED    = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 5v6h3l5 4V1L5 5H2z"/><path d="m11 5 4 4m0-4-4 4" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
const ICON_UNMUTED  = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 5v6h3l5 4V1L5 5H2z"/><path d="M11.5 5.5a4 4 0 0 1 0 5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
const ICON_FS       = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>`;
const ICON_FS_EXIT  = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/></svg>`;

export function initStream(hlsUrl, fallbackImage) {
  const video = document.getElementById('stream-video');
  const fallback = document.getElementById('stream-fallback');
  const playOverlay = document.getElementById('stream-play-overlay');
  const unmuteOverlay = document.getElementById('unmute-overlay');
  const liveDots = document.querySelectorAll('.nav-live-dot');
  const offlineEl = document.getElementById('stream-offline');
  const playerEl = document.querySelector('.player');

  let hls = null;
  let reconnectDelay = RECONNECT_BASE;
  let reconnectTimer = null;

  function showFallback() {
    fallback.classList.add('is-visible');
    liveDots.forEach((dot) => { dot.hidden = true; });
    if (offlineEl) offlineEl.style.display = 'inline-block';
    if (playerEl) playerEl.classList.add('is-offline');
  }

  function hideFallback() {
    fallback.classList.remove('is-visible');
    liveDots.forEach((dot) => { dot.hidden = false; });
    if (offlineEl) offlineEl.style.display = 'none';
    if (playerEl) playerEl.classList.remove('is-offline');
    reconnectDelay = RECONNECT_BASE;
  }

  function attemptReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (hls) {
        hls.loadSource(hlsUrl);
      } else {
        video.src = hlsUrl;
        video.load();
      }
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX);
    }, reconnectDelay);
  }

  function setupControls() {
    const playBtn = document.getElementById('player-play-pause');
    const muteBtn = document.getElementById('player-mute');
    const fsBtn   = document.getElementById('player-fullscreen');
    if (!playBtn || !muteBtn || !fsBtn) return;

    function updatePlayBtn() {
      playBtn.innerHTML = video.paused ? ICON_PLAY : ICON_PAUSE;
      playBtn.setAttribute('aria-label', video.paused ? 'Play' : 'Pause');
    }
    function updateMuteBtn() {
      muteBtn.innerHTML = video.muted ? ICON_MUTED : ICON_UNMUTED;
      muteBtn.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
    }
    function updateFsBtn() {
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      fsBtn.innerHTML = isFs ? ICON_FS_EXIT : ICON_FS;
      fsBtn.setAttribute('aria-label', isFs ? 'Exit fullscreen' : 'Fullscreen');
    }

    updatePlayBtn();
    updateMuteBtn();
    updateFsBtn();

    playBtn.addEventListener('click', () => {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    });
    muteBtn.addEventListener('click', () => { video.muted = !video.muted; });
    fsBtn.addEventListener('click', () => {
      const playerEl = document.querySelector('.player');
      if (!(document.fullscreenElement || document.webkitFullscreenElement)) {
        (playerEl.requestFullscreen || playerEl.webkitRequestFullscreen).call(playerEl).catch(() => {});
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      }
    });

    video.addEventListener('play', updatePlayBtn);
    video.addEventListener('pause', updatePlayBtn);
    video.addEventListener('volumechange', updateMuteBtn);
    document.addEventListener('fullscreenchange', updateFsBtn);
    document.addEventListener('webkitfullscreenchange', updateFsBtn);
  }

  video.addEventListener('playing', () => {
    hideFallback();
    if (playOverlay) playOverlay.hidden = true;
  });

  if (playOverlay) {
    playOverlay.addEventListener('click', () => {
      video.play().catch(() => {});
    });
  }

  setupControls();

  function setupUnmute() {
    function unmute() {
      video.muted = false;
      video.play().catch(() => {});
      unmuteOverlay.classList.add('is-hidden');
    }

    unmuteOverlay.addEventListener('click', unmute);
    unmuteOverlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        unmute();
      }
    });
  }

  if (Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
    });

    hls.loadSource(hlsUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (hls.audioTracks.length > 0) hls.audioTrack = 0;
      video.play().catch(() => {});
      hideFallback();
      buildQualitySelector(hls);
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            showFallback();
            if (navigator.onLine) {
              attemptReconnect();
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            showFallback();
            attemptReconnect();
            break;
        }
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari native HLS
    video.src = hlsUrl;
    video.addEventListener('loadedmetadata', () => {
      video.play().catch(() => {});
      hideFallback();
    });
    video.addEventListener('error', () => {
      showFallback();
      attemptReconnect();
    });
  } else {
    showFallback();
  }

  // Listen for online/offline
  window.addEventListener('online', () => {
    reconnectDelay = RECONNECT_BASE;
    if (hls) {
      hls.loadSource(hlsUrl);
    } else {
      video.src = hlsUrl;
      video.load();
    }
  });

  window.addEventListener('offline', () => {
    clearTimeout(reconnectTimer);
  });

  if (unmuteOverlay) setupUnmute();

  function buildQualitySelector(hlsInstance) {
    const container = document.getElementById('quality-selector');
    const toggle = document.getElementById('quality-toggle');
    const menu = document.getElementById('quality-menu');
    const label = document.getElementById('quality-label');

    const levels = hlsInstance.levels;
    if (!levels || levels.length <= 1) return;

    container.hidden = false;

    const autoBtn = document.createElement('button');
    autoBtn.className = 'player__quality-option player__quality-option--active pixel-font uppercase';
    autoBtn.textContent = 'Auto';
    autoBtn.dataset.level = '-1';
    menu.appendChild(autoBtn);

    levels.forEach((level, i) => {
      const btn = document.createElement('button');
      btn.className = 'player__quality-option pixel-font uppercase';
      btn.textContent = level.height + 'p';
      btn.dataset.level = i.toString();
      menu.appendChild(btn);
    });

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('is-open');
    });

    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('.player__quality-option');
      if (!btn) return;

      const levelIndex = parseInt(btn.dataset.level, 10);
      hlsInstance.currentLevel = levelIndex;

      label.textContent = levelIndex === -1 ? 'Auto' : levels[levelIndex].height + 'p';

      menu.querySelectorAll('.player__quality-option').forEach((b) =>
        b.classList.remove('player__quality-option--active')
      );
      btn.classList.add('player__quality-option--active');
      menu.classList.remove('is-open');
    });

    document.addEventListener('click', () => {
      menu.classList.remove('is-open');
    });

    container.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  return { video, hls };
}
