/**
 * salesTransactionService.js — the single write/read surface for the
 * `sales_transactions` ledger table. Parallel structure to
 * inventoryTransactionService.js — see that file's header for the
 * centralized-logging and scale rationale, which applies identically here.
 */
import { supabase } from './supabase';

const TABLE = 'sales_transactions';

function sanitizeSearchTerm(term) {
  return String(term || '').replace(/[,()%]/g, ' ').trim();
}

export async function logTransaction(entry) {
  try {
    const row = {
      transaction_type: entry.transactionType,
      sale_id: entry.saleId ?? null,
      customer_name: entry.customerName ?? null,
      branch: entry.branch ?? null,
      amount_before: entry.amountBefore ?? 0,
      amount_changed: entry.amountChanged ?? 0,
      amount_after: entry.amountAfter ?? 0,
      payment_method: entry.paymentMethod ?? null,
      items_count: entry.itemsCount ?? null,
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
    console.error('[salesTransactionService] logTransaction failed:', err?.message || err);
  }
}

export async function logTransactions(entries) {
  await Promise.all((entries || []).map(logTransaction));
}

// filters: { branch, transactionType, officer, search, start, end }
export async function fetchTransactions({ filters = {}, page = 0, pageSize = 50, sortBy = 'created_at', sortDir = 'desc' } = {}) {
  let query = supabase.from(TABLE).select('*', { count: 'exact' });

  if (filters.branch && filters.branch !== 'all') query = query.eq('branch', filters.branch);
  if (filters.transactionType && filters.transactionType !== 'all') query = query.eq('transaction_type', filters.transactionType);
  const officerTerm = sanitizeSearchTerm(filters.officer);
  if (officerTerm) query = query.ilike('performed_by', `%${officerTerm}%`);
  if (filters.start) query = query.gte('created_at', filters.start);
  if (filters.end) query = query.lte('created_at', filters.end);

  const q = sanitizeSearchTerm(filters.search);
  if (q) {
    query = query.or(
      `transaction_number.ilike.%${q}%,customer_name.ilike.%${q}%,performed_by.ilike.%${q}%,reference_number.ilike.%${q}%,sale_id.ilike.%${q}%`
    );
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;
  query = query.order(sortBy, { ascending: sortDir === 'asc' }).range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error('[salesTransactionService] fetchTransactions failed:', error.message);
    return { rows: [], total: 0 };
  }
  return { rows: data || [], total: count || 0 };
}

export async function fetchTransactionSummaryCounts({ branch } = {}) {
  const { data, error } = await supabase.rpc('sales_txn_dashboard_counts', { p_branch: branch && branch !== 'all' ? branch : null });
  if (error) {
    console.error('[salesTransactionService] fetchTransactionSummaryCounts failed:', error.message);
    return null;
  }
  return data;
}

export async function fetchReportSummary({ start, end, branch } = {}) {
  const { data, error } = await supabase.rpc('sales_txn_report_summary', {
    p_start: start, p_end: end, p_branch: branch && branch !== 'all' ? branch : null,
  });
  if (error) {
    console.error('[salesTransactionService] fetchReportSummary failed:', error.message);
    return null;
  }
  return data;
}

export function subscribeToSalesTransactions(onInsert) {
  const channel = supabase
    .channel('realtime:sales_transactions_ledger')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE }, payload => {
      onInsert(payload.new);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}
