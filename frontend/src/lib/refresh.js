/**
 * refresh.js — Reusable Supabase table refresh functions
 *
 * All transactional tables are fetched newest-first with a hard row limit so
 * that growing datasets never cause slow refreshes or memory spikes.
 * Configuration/master tables (inventory, suppliers, users, permissions) are
 * always fetched in full because they are small and must be complete.
 *
 * Pass an optional `limit` override to any function that accepts one.
 */
import { supabase } from './supabase';

const extract = (rows) => (rows || []).map(r => r.data).filter(Boolean);

const REFRESH_LIMIT       = 500;
const AUDIT_REFRESH_LIMIT = 200;

// Reusable builder for ordered + limited transactional tables
const txSelect = (table, limit = REFRESH_LIMIT) =>
  supabase.from(table).select('data').order('id', { ascending: false }).limit(limit);

// ── Master / config tables — always full ─────────────────────────────────────

export const refreshInventory = async (setState) => {
  const { data, error } = await supabase.from('inventory').select('data');
  if (error) { console.error('[refresh] inventory:', error.message); return; }
  setState(extract(data));
};

export const refreshSuppliers = async (setState) => {
  const { data, error } = await supabase.from('suppliers').select('data');
  if (error) { console.error('[refresh] suppliers:', error.message); return; }
  setState(extract(data));
};

export const refreshAppUsers = async (setState) => {
  const { data, error } = await supabase.from('app_users').select('data');
  if (error) { console.error('[refresh] app_users:', error.message); return; }
  setState(extract(data));
};

export const refreshPendingUsers = async (setState) => {
  const { data, error } = await supabase.from('pending_users').select('data');
  if (error) { console.error('[refresh] pending_users:', error.message); return; }
  setState(extract(data));
};

export const refreshDeleteRequests = async (setState) => {
  const { data, error } = await supabase.from('delete_requests').select('data');
  if (error) { console.error('[refresh] delete_requests:', error.message); return; }
  setState(extract(data));
};

export const refreshPermissions = async (setState) => {
  const { data, error } = await supabase.from('permissions').select('role, pages');
  if (error) { console.error('[refresh] permissions:', error.message); return; }
  const perms = {};
  (data || []).forEach(p => { perms[p.role] = p.pages || []; });
  setState(perms);
};

export const refreshAppSettings = async (setState) => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('data')
    .eq('id', 'main')
    .maybeSingle();
  if (error) { console.error('[refresh] app_settings:', error.message); return; }
  setState(data?.data || {});
};

// ── Transactional tables — limited + ordered newest-first ────────────────────

export const refreshSales = async (setState, limit = REFRESH_LIMIT) => {
  const { data, error } = await txSelect('sales', limit);
  if (error) { console.error('[refresh] sales:', error.message); return; }
  setState(extract(data));
};

export const refreshCustomers = async (setState, limit = REFRESH_LIMIT) => {
  const { data, error } = await txSelect('customers', limit);
  if (error) { console.error('[refresh] customers:', error.message); return; }
  setState(extract(data));
};

export const refreshExpenses = async (setState, limit = REFRESH_LIMIT) => {
  const { data, error } = await txSelect('expenses', limit);
  if (error) { console.error('[refresh] expenses:', error.message); return; }
  setState(extract(data));
};

export const refreshBookings = async (setState, limit = REFRESH_LIMIT) => {
  const { data, error } = await txSelect('bookings', limit);
  if (error) { console.error('[refresh] bookings:', error.message); return; }
  setState(extract(data));
};

export const refreshPurchaseList = async (setState, limit = REFRESH_LIMIT) => {
  const { data, error } = await txSelect('purchase_list', limit);
  if (error) { console.error('[refresh] purchase_list:', error.message); return; }
  setState(extract(data));
};

export const refreshGoodsReceived = async (setState, limit = REFRESH_LIMIT) => {
  const { data, error } = await txSelect('goods_received', limit);
  if (error) { console.error('[refresh] goods_received:', error.message); return; }
  setState(extract(data));
};

export const refreshRecycleBin = async (setState, limit = REFRESH_LIMIT) => {
  const { data, error } = await txSelect('recycle_bin', limit);
  if (error) { console.error('[refresh] recycle_bin:', error.message); return; }
  setState(extract(data));
};

export const refreshCommissions = async (setState, limit = REFRESH_LIMIT) => {
  const { data, error } = await txSelect('commissions', limit);
  if (error) { console.error('[refresh] commissions:', error.message); return; }
  setState(extract(data));
};

// Audit log has its own, tighter limit — it grows fast and is append-only
export const refreshAuditLog = async (setState, limit = AUDIT_REFRESH_LIMIT) => {
  const { data, error } = await supabase
    .from('audit_log')
    .select('data')
    .order('id', { ascending: false })
    .limit(limit);
  if (error) { console.error('[refresh] audit_log:', error.message); return; }
  setState(extract(data));
};

export const refreshProfiles = async (setState) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('[refresh] profiles:', error.message); return; }
  setState(data || []);
};
