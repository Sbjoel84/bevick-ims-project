/**
 * refresh.js — Reusable Supabase table refresh functions
 *
 * Each function fetches fresh data from its table and calls setState with the result.
 * Pass any setter: a React setState hook, or a dispatch-based wrapper from AppContext.
 * Errors are logged and never thrown — safe to call from useEffect.
 *
 * Standard tables use { id, data } row format — data is extracted automatically.
 * Special tables (permissions, app_settings, audit_log) use their own schemas.
 */
import { supabase } from './supabase';

// Helper: extract the .data field from standard { id, data } rows
const extract = (rows) => (rows || []).map(r => r.data).filter(Boolean);

export const refreshInventory = async (setState) => {
  const { data, error } = await supabase.from('inventory').select('data');
  if (error) { console.error('[refresh] inventory:', error.message); return; }
  setState(extract(data));
};

export const refreshSales = async (setState) => {
  const { data, error } = await supabase.from('sales').select('data');
  if (error) { console.error('[refresh] sales:', error.message); return; }
  setState(extract(data));
};

export const refreshCustomers = async (setState) => {
  const { data, error } = await supabase.from('customers').select('data');
  if (error) { console.error('[refresh] customers:', error.message); return; }
  setState(extract(data));
};

export const refreshExpenses = async (setState) => {
  const { data, error } = await supabase.from('expenses').select('data');
  if (error) { console.error('[refresh] expenses:', error.message); return; }
  setState(extract(data));
};

export const refreshBookings = async (setState) => {
  const { data, error } = await supabase.from('bookings').select('data');
  if (error) { console.error('[refresh] bookings:', error.message); return; }
  setState(extract(data));
};

export const refreshPurchaseList = async (setState) => {
  const { data, error } = await supabase.from('purchase_list').select('data');
  if (error) { console.error('[refresh] purchase_list:', error.message); return; }
  setState(extract(data));
};

export const refreshGoodsReceived = async (setState) => {
  const { data, error } = await supabase.from('goods_received').select('data');
  if (error) { console.error('[refresh] goods_received:', error.message); return; }
  setState(extract(data));
};

export const refreshSuppliers = async (setState) => {
  const { data, error } = await supabase.from('suppliers').select('data');
  if (error) { console.error('[refresh] suppliers:', error.message); return; }
  setState(extract(data));
};

export const refreshRecycleBin = async (setState) => {
  const { data, error } = await supabase.from('recycle_bin').select('data');
  if (error) { console.error('[refresh] recycle_bin:', error.message); return; }
  setState(extract(data));
};

export const refreshAuditLog = async (setState) => {
  const { data, error } = await supabase
    .from('audit_log')
    .select('data')
    .order('id', { ascending: false })
    .limit(200);
  if (error) { console.error('[refresh] audit_log:', error.message); return; }
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

// permissions uses { role, pages } schema — no data wrapper
export const refreshPermissions = async (setState) => {
  const { data, error } = await supabase.from('permissions').select('role, pages');
  if (error) { console.error('[refresh] permissions:', error.message); return; }
  const perms = {};
  (data || []).forEach(p => { perms[p.role] = p.pages || []; });
  setState(perms);
};

export const refreshProfiles = async (setState) => {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) { console.error('[refresh] profiles:', error.message); return; }
  setState(data || []);
};

// app_settings has a single row { id: 'main', data: { ...settings } }
export const refreshAppSettings = async (setState) => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('data')
    .eq('id', 'main')
    .maybeSingle();
  if (error) { console.error('[refresh] app_settings:', error.message); return; }
  setState(data?.data || {});
};
