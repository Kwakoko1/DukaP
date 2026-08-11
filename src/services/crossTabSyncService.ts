/**
 * DukaPOS Enterprise Cross-Tab BroadcastChannel Signaling Engine
 * Provides < 5ms instant cross-tab state alignment and mutation broadcasts.
 */

export interface MutationBroadcastEvent {
  type: 'MUTATION_SIGNAL' | 'TOMBSTONE_SIGNAL' | 'SYNC_STATE_SIGNAL';
  entity: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload?: any;
  senderTabId: string;
  timestamp: number;
}

const CHANNEL_NAME = 'dukapos_cross_tab_sync';
const CURRENT_TAB_ID = Math.random().toString(36).substring(2, 9);

let broadcastChannel: BroadcastChannel | null = null;
const listeners = new Set<(event: MutationBroadcastEvent) => void>();

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
      broadcastChannel.onmessage = (msgEvent: MessageEvent<MutationBroadcastEvent>) => {
        const data = msgEvent.data;
        if (!data || data.senderTabId === CURRENT_TAB_ID) return;

        // Auto-register tombstone if tombstone signal received
        if (data.type === 'TOMBSTONE_SIGNAL' && data.payload?.id) {
          try {
            const raw = localStorage.getItem('dukapos_deleted_receipt_numbers') || '[]';
            const set = new Set(JSON.parse(raw));
            set.add(data.payload.id);
            if (data.payload.receipt_number) set.add(data.payload.receipt_number);
            localStorage.setItem('dukapos_deleted_receipt_numbers', JSON.stringify(Array.from(set)));
          } catch (e) {}
        }

        // Notify active subscribers
        listeners.forEach(fn => {
          try {
            fn(data);
          } catch (err) {
            console.warn('[CrossTabSync] Listener error:', err);
          }
        });
      };
    } catch (e) {
      console.warn('[CrossTabSync] BroadcastChannel unsupported or restricted:', e);
    }
  }
  return broadcastChannel;
}

/**
 * Broadcast a local database mutation to all other open tabs in real-time.
 */
export function broadcastMutation(entity: string, action: 'CREATE' | 'UPDATE' | 'DELETE', payload?: any) {
  const ch = getChannel();
  const event: MutationBroadcastEvent = {
    type: action === 'DELETE' ? 'TOMBSTONE_SIGNAL' : 'MUTATION_SIGNAL',
    entity,
    action,
    payload,
    senderTabId: CURRENT_TAB_ID,
    timestamp: Date.now(),
  };

  if (ch) {
    try {
      ch.postMessage(event);
    } catch (e) {
      console.warn('[CrossTabSync] Failed to post message:', e);
    }
  }
}

/**
 * Subscribe to cross-tab mutation signals.
 */
export function subscribeToCrossTabSync(callback: (event: MutationBroadcastEvent) => void): () => void {
  getChannel();
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function getCurrentTabId(): string {
  return CURRENT_TAB_ID;
}
