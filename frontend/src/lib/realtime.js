/**
 * realtime.js — Global Supabase Realtime handler
 *
 * Single wildcard channel for all public schema changes.
 * Automatically reconnects on CHANNEL_ERROR / TIMED_OUT with
 * exponential backoff (1s → 2s → 4s … up to 60s, max 8 attempts).
 * A module-level channel ref prevents duplicate subscriptions.
 */
import { supabase } from './supabase';

let channel           = null;
let _onChange         = null;
let _reconnectTimer   = null;
let _reconnectAttempts = 0;

const MAX_RECONNECT_ATTEMPTS = 8;
const BASE_RECONNECT_DELAY_MS = 1000;

function scheduleReconnect() {
  if (_reconnectTimer) return; // already pending
  if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[realtime] Max reconnect attempts reached — manual page refresh required.');
    return;
  }

  const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** _reconnectAttempts, 60_000);
  _reconnectAttempts++;
  console.log(`[realtime] Reconnecting in ${delay}ms (attempt ${_reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
    if (_onChange) startRealtime(_onChange);
  }, delay);
}

/**
 * Start the global realtime subscription.
 * Safe to call multiple times — idempotent if already connected.
 * @param {(payload: object) => void} onChange  Called for every DB change event.
 */
export function startRealtime(onChange) {
  if (channel) {
    console.log('[realtime] Channel already active — skipping duplicate subscription.');
    return;
  }

  _onChange = onChange;

  channel = supabase
    .channel('global-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: '*' },
      (payload) => {
        // Reset backoff on any successful message
        _reconnectAttempts = 0;
        onChange(payload);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        _reconnectAttempts = 0;
        console.log('[realtime] Connected — live updates active.');
      }
      if (status === 'CHANNEL_ERROR') {
        console.error('[realtime] Channel error — scheduling reconnect.');
        scheduleReconnect();
      }
      if (status === 'TIMED_OUT') {
        console.warn('[realtime] Channel timed out — scheduling reconnect.');
        scheduleReconnect();
      }
    });
}

/**
 * Stop the subscription and cancel any pending reconnect.
 */
export function stopRealtime() {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
    console.log('[realtime] Channel stopped.');
  }
  _onChange          = null;
  _reconnectAttempts = 0;
}
