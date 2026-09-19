/**
 * tombstones.js — remembers ids the user deleted so stale data can't bring them back.
 *
 * Every state refresh, realtime event and initial load overwrites local state from
 * Supabase. If any of those was fetched before a delete landed (or the delete is
 * still queued for retry), it would re-add the deleted row. Filtering incoming rows
 * through this registry makes a delete permanent from the user's point of view.
 * Entries are cleared when the same id is written again (e.g. restore from bin).
 */
const KEY = 'bevick_tombstones';
const TTL_MS = 3 * 24 * 60 * 60 * 1000;

// State key → Supabase table, for the collections that can contain deletable rows.
export const TABLE_BY_STATE_KEY = {
  inventory: 'inventory', sales: 'sales', customers: 'customers', expenses: 'expenses',
  bookings: 'bookings', purchaseList: 'purchase_list', goodsReceived: 'goods_received',
  suppliers: 'suppliers', recycleBin: 'recycle_bin', users: 'app_users',
  pendingUsers: 'pending_users', deleteRequests: 'delete_requests', commissions: 'commissions',
};

function load() {
  try {
    const all = JSON.parse(localStorage.getItem(KEY)) || {};
    const cutoff = Date.now() - TTL_MS;
    for (const k of Object.keys(all)) if (all[k] < cutoff) delete all[k];
    return all;
  } catch {
    return {};
  }
}

function save(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* best effort */ }
}

export function markDeleted(table, ids) {
  const all = load();
  const now = Date.now();
  for (const id of ids) all[`${table}:${id}`] = now;
  save(all);
}

export function clearDeleted(table, ids) {
  const all = load();
  let changed = false;
  for (const id of ids) {
    if (`${table}:${id}` in all) { delete all[`${table}:${id}`]; changed = true; }
  }
  if (changed) save(all);
}

export function isDeleted(table, id) {
  return `${table}:${id}` in load();
}

export function filterDeleted(table, rows) {
  if (!Array.isArray(rows) || !table) return rows;
  const all = load();
  if (!Object.keys(all).length) return rows;
  return rows.filter(r => r == null || !(`${table}:${r.id}` in all));
}
