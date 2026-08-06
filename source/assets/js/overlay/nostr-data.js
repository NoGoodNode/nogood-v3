import { createOverlayState } from '/assets/js/overlay/state.js';
import {
  initNostr,
  subscribeStreamInfo,
  subscribeZaps,
  subscribeChat,
  subscribeRaids,
  subscribeNotifications,
  fetchProfile,
  queryNostr,
  getStreamATag,
} from '/assets/js/radio/nostr.js';

/**
 * Connect an overlay to its live-stream and NoGood-account Nostr data.
 *
 * Every browser page has its own connection. Nostr relays remain the shared
 * source of truth; this module only provides explicit, reusable subscriptions.
 */
export function createOverlayData({ naddr, relays, profilePubkey }) {
  const connection = initNostr(naddr, relays, profilePubkey);
  if (!connection) throw new Error('Could not connect overlay to Nostr');

  const state = createOverlayState({
    accountPubkey: profilePubkey,
    streamATag: connection.streamATag,
  });

  return {
    state,

    // Stream-specific data: tied to this overlay's naddr/a-tag.
    subscribeStreamInfo,
    subscribeStreamChat: subscribeChat,
    subscribeStreamRaids: subscribeRaids,
    subscribeStreamZaps(onZap, onReady) {
      return subscribeZaps((zap, isHistorical) => {
        if (zap.isStreamZap) onZap(zap, isHistorical);
      }, onReady);
    },

    // Account-specific data: tied to the NoGood profile public key.
    subscribeProfileZaps(onZap, onReady) {
      return subscribeZaps((zap, isHistorical) => {
        if (!zap.isStreamZap) onZap(zap, isHistorical);
      }, onReady);
    },
    subscribeAccountNotifications: subscribeNotifications,

    // Transitional combined feed. Both current overlays intentionally use this
    // for their zap visuals, which include stream and profile zaps.
    subscribeCombinedZaps: subscribeZaps,

    fetchProfile,
    queryNostr,
    getStreamATag,
  };
}
