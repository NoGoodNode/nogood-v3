const ENDPOINT = 'https://lastfm-api.hello-5b9.workers.dev/';
const REFRESH_MS = 10000;

function renderTrack(track) {
  const artistDiv = document.createElement('div');
  artistDiv.className = 'tracklist__artist';

  if (!track.playedAt) {
    const bars = document.createElement('span');
    bars.className = 'soundbars';
    bars.setAttribute('aria-label', 'Now playing');
    bars.innerHTML = '<span></span><span></span><span></span>';
    artistDiv.appendChild(bars);
  }

  artistDiv.appendChild(document.createTextNode(track.artist));

  const titleDiv = document.createElement('div');
  titleDiv.className = 'tracklist__title';
  titleDiv.textContent = track.name;

  const borderDiv = document.createElement('div');
  borderDiv.className = 'row-border';

  const fragment = document.createDocumentFragment();
  fragment.appendChild(artistDiv);
  fragment.appendChild(titleDiv);
  fragment.appendChild(borderDiv);
  return fragment;
}

async function updateList() {
  const container = document.getElementById('lastfm-list');
  if (!container) return;

  try {
    const resp = await fetch(ENDPOINT, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const tracks = await resp.json();

    container.innerHTML = '';
    tracks.forEach((track) => container.appendChild(renderTrack(track)));
  } catch (err) {
    console.error('Could not refresh Last.fm list:', err);
  }
}

export function initLastFm() {
  updateList();
  setInterval(updateList, REFRESH_MS);
}

async function updateNowPlaying(el) {
  try {
    const resp = await fetch(ENDPOINT, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const tracks = await resp.json();
    const track = tracks.find(t => !t.playedAt);
    el.innerHTML = '';
    if (!track) return;
    const bars = document.createElement('span');
    bars.className = 'soundbars';
    bars.setAttribute('aria-label', 'Now playing');
    bars.innerHTML = '<span></span><span></span><span></span>';
    const text = document.createTextNode(`${track.artist} — ${track.name}`);
    el.appendChild(bars);
    el.appendChild(text);
  } catch {}
}

export function initNowPlaying(id) {
  const el = document.getElementById(id);
  if (!el) return;
  updateNowPlaying(el);
  setInterval(() => updateNowPlaying(el), REFRESH_MS);
}
