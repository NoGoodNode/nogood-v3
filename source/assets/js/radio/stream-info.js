import { createRadioNostr } from './nostr.js';
import { NOGOOD_NOSTR_RELAYS } from '/assets/js/nostr/config.js';

export const RADIO_NADDR = 'naddr1qqjr2vehvyenvdtr94nrzetr956rgctr94skvvfs95eryep3x3snwve389nxyqgwwaehxw309ahx7uewd3hkctczyr85tf46zd366lkjzws83ecs6fq3ttnjrjd500g7haz936h0knp22qcyqqq8vecjrlda8';

export function bindStreamInfo(subscribe, { description, viewers, uptime }) {
  let starts = null;
  let uptimeInterval = null;

  function updateUptime() {
    if (!uptime || !starts) return;
    const secs = Math.floor(Date.now() / 1000) - starts;
    if (secs < 0) {
      uptime.style.display = 'none';
      return;
    }

    const months = Math.floor(secs / (30 * 24 * 3600));
    const days = Math.floor(secs / 86400);
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;
    let label;
    if (months >= 1) label = `uptime ${months} month${months > 1 ? 's' : ''}`;
    else if (days >= 1) label = `uptime ${days} day${days > 1 ? 's' : ''}`;
    else if (hours >= 1) label = `uptime ${hours}h ${String(minutes).padStart(2, '0')}m`;
    else label = `uptime ${minutes}m ${String(seconds).padStart(2, '0')}s`;
    uptime.textContent = label;
    uptime.style.display = 'inline';
  }

  const unsubscribe = subscribe((info) => {
    if (description) description.textContent = info.summary;
    if (viewers) {
      if (info.viewers !== null && info.viewers > 0) {
        viewers.textContent = `${info.viewers} listening`;
        viewers.style.display = 'inline';
      } else {
        viewers.style.display = 'none';
      }
    }
    if (uptime) {
      starts = info.starts;
      if (starts) {
        updateUptime();
        if (!uptimeInterval) uptimeInterval = setInterval(updateUptime, 1000);
      } else {
        uptime.style.display = 'none';
      }
    }
  });

  return () => {
    unsubscribe?.();
    clearInterval(uptimeInterval);
  };
}

export function initStandaloneStreamInfo(elements) {
  const radioNostr = createRadioNostr({ naddr: RADIO_NADDR, relays: NOGOOD_NOSTR_RELAYS });
  const unbind = bindStreamInfo((handler) => radioNostr.subscribeStreamInfo(handler), elements);
  return () => {
    unbind();
    radioNostr.close();
  };
}
