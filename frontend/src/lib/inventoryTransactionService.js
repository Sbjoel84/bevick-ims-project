/**
 * inventoryTransactionService.js — the single write/read surface for the
 * `inventory_transactions` ledger table.
 *
 * `logTransaction`/`logTransactions` are called from exactly one place —
 * sync.js's central dispatch choke point — so every inventory-affecting
 * action across the whole app logs here without any page needing to
 * remember to call anything. Insert failures are swallowed (logged to
 * console) so a ledger hiccup never surfaces as a false "save failed"
 * toast for what was really a successful primary write.
 *
 * Reads are always server-side filtered/paginated — this table is
 * designed for 1,000,000+ rows, so nothing here ever fetches "all".
 */
import { supabase } from './supabase';

const TABLE = 'inventory_transactions';

// Strips characters that have special meaning in PostgREST's .or() filter
// syntax (comma separates conditions, parentheses group them) so free-text
// search input can't distort the intended filter structure.
function sanitizeSearchTerm(term) {
  return String(term || '').replace(/[,()%]/g, ' ').trim();
}

export async function logTransaction(entry) {
  try {
    const row = {
      transaction_type: entry.transactionType,
      product_id: entry.productId ?? null,
      product_name: entry.productName ?? null,
      category: entry.category ?? null,
      source: entry.source ?? null,
      branch: entry.branch ?? null,
      quantity_before: entry.quantityBefore ?? 0,
      quantity_changed: entry.quantityChanged ?? 0,
      quantity_after: entry.quantityAfter ?? 0,
      performed_by: entry.performedBy ?? null,
      performed_by_id: entry.performedById ?? null,
      user_role: entry.userRole ?? null,
      reference_number: entry.referenceNumber ?? null,
      description: entry.description ?? null,
      remarks: entry.remarks ?? null,
      status: entry.status || 'Completed',
    };
    const { error } = await supabase.from(TABLE).insert(row);
    if (error) throw error;
  } catch (err) {
    console.error('[inventoryTransactionService] logTransaction failed:', err?.message || err);
  }
}

export async function logTransactions(entries) {
  await Promise.all((entries || []).map(logTransaction));
}

// filters: { branch, category, transactionType, source, officer, search, start, end }
export async function fetchTransactions({ filters = {}, page = 0, pageSize = 50, sortBy = 'created_at', sortDir = 'desc' } = {}) {
  let query = supabase.from(TABLE).select('*', { count: 'exact' });

  if (filters.branch && filters.branch !== 'all') query = query.eq('branch', filters.branch);
  if (filters.category && filters.category !== 'all') query = query.eq('category', filters.category);
  if (filters.transactionType && filters.transactionType !== 'all') query = query.eq('transaction_type', filters.transactionType);
  const sourceTerm = sanitizeSearchTerm(filters.source);
  if (sourceTerm) query = query.ilike('source', `%${sourceTerm}%`);
  const officerTerm = sanitizeSearchTerm(filters.officer);
  if (officerTerm) query = query.ilike('performed_by', `%${officerTerm}%`);
  if (filters.start) query = query.gte('created_at', filters.start);
  if (filters.end) query = query.lte('created_at', filters.end);

  const q = sanitizeSearchTerm(filters.search);
  if (q) {
    query = query.or(
      `transaction_number.ilike.%${q}%,product_name.ilike.%${q}%,performed_by.ilike.%${q}%,reference_number.ilike.%${q}%,branch.ilike.%${q}%`
    );
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;
  query = query.order(sortBy, { ascending: sortDir === 'asc' }).range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error('[inventoryTransactionService] fetchTransactions failed:', error.message);
    return { rows: [], total: 0 };
  }
  return { rows: data || [], total: count || 0 };
}

export async function fetchTransactionSummaryCounts({ branch } = {}) {
  const { data, error } = await supabase.rpc('inventory_txn_dashboard_counts', { p_branch: branch && branch !== 'all' ? branch : null });
  if (error) {
    console.error('[inventoryTransactionService] fetchTransactionSummaryCounts failed:', error.message);
    return null;
  }
  return data;
}

export async function fetchReportSummary({ start, end, branch } = {}) {
  const { data, error } = await supabase.rpc('inventory_txn_report_summary', {
    p_start: start, p_end: end, p_branch: branch && branch !== 'all' ? branch : null,
  });
  if (error) {
    console.error('[inventoryTransactionService] fetchReportSummary failed:', error.message);
    return null;
  }
  return data;
}

// Scoped realtime subscription — triggers a refetch on INSERT, does not
// accumulate rows in memory (unlike the app-wide 'realtime:all-tables'
// channel, which would defeat the 1M-row scale goal for this table).
export function subscribeToInventoryTransactions(onInsert) {
  const channel = supabase
    .channel('realtime:inventory_transactions_ledger')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE }, payload => {
      onInsert(payload.new);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}
