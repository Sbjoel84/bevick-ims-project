import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchTransactions,
  fetchTransactionSummaryCounts,
  subscribeToInventoryTransactions,
} from '../lib/inventoryTransactionService';

const PAGE_SIZE = 50;

const DEFAULT_FILTERS = {
  branch: 'all', category: 'all', transactionType: 'all', source: '', officer: '',
  search: '', start: null, end: null,
};

// Owns all server-side filter/pagination/summary state for the Inventory
// Transactions ledger. Never accumulates a full in-memory array — every
// filter/page change re-queries Supabase directly (this table is designed
// for 1,000,000+ rows). Realtime INSERTs just trigger a refetch of the
// current page + summary, they don't get appended locally.
export default function useInventoryTransactions() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    const queryFilters = {
      ...filters,
      start: filters.start ? filters.start.toISOString() : undefined,
      end: filters.end ? filters.end.toISOString() : undefined,
    };
    const [txResult, summaryResult] = await Promise.all([
      fetchTransactions({ filters: queryFilters, page, pageSize: PAGE_SIZE }),
      fetchTransactionSummaryCounts({ branch: filters.branch }),
    ]);
    if (id !== requestId.current) return; // stale response — a newer request superseded this one
    setRows(txResult.rows);
    setTotal(txResult.total);
    setSummary(summaryResult);
    setLoading(false);
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  // Refs so the realtime subscription (set up once) always calls the
  // latest load/page without needing to tear down and recreate the
  // channel on every filter/page change.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);

  useEffect(() => {
    const unsubscribe = subscribeToInventoryTransactions(() => {
      if (pageRef.current === 0) loadRef.current();
      else setPage(0);
    });
    return unsubscribe;
  }, []);

  function updateFilters(patch) {
    setFilters(f => ({ ...f, ...patch }));
    setPage(0);
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
    setPage(0);
  }

  return { filters, updateFilters, resetFilters, page, setPage, pageSize: PAGE_SIZE, rows, total, loading, summary, reload: load };
}
