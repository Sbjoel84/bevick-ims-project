/**
 * realtime.js — Global Supabase Realtime handler
 *
 * Provides a single wildcard channel that listens to all table changes in the
 * public schema. When any row is inserted, updated, or deleted, the onChange
 * callback fires with the full Supabase payload (including payload.table so
 * callers can route to the correct refresh function).
 *
 * A module-level channel variable prevents duplicate subscriptions — calling
 * startRealtime() more than once is safe and idempotent.
 *
 * Usage:
 *   startRealtime((payload) => { ... })   // start listening
 *   stopRealtime()                         // remove channel (on unmount)
 */
import { supabase } from './supabase';

// Module-level reference — prevents duplicate subscriptions across hot-reloads
// and strict-mode double-invocations.
let channel = null;

/**
 * Start the global realtime subscription.
 * @param {(payload: object) => void} onChange  Called for every DB change event.
 */
export function startRealtime(onChange) {
  if (channel) {
    console.log('[realtime] Channel already active — skipping duplicate subscription.');
    return;
  }

  channel = supabase
    .channel('global-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: '*' },
      (payload) => {
        console.log(`[realtime] ${payload.eventType} on ${payload.table}`, payload);
        onChange(payload);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[realtime] global-realtime channel connected.');
      }
      if (status === 'CHANNEL_ERROR') {
        console.error('[realtime] Channel error — verify Supabase realtime is enabled for all tables.');
      }
      if (status === 'TIMED_OUT') {
        console.warn('[realtime] Channel timed out — will retry automatically.');
      }
    });
}

/**
 * Stop the global realtime subscription and release the channel.
 */
export function stopRealtime() {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
    console.log('[realtime] global-realtime channel removed.');
  }
}
