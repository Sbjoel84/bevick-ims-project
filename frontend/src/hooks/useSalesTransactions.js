import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchTransactions,
  fetchTransactionSummaryCounts,
  subscribeToSalesTransactions,
} from '../lib/salesTransactionService';

const PAGE_SIZE = 50;

const DEFAULT_FILTERS = {
  branch: 'all', transactionType: 'all', officer: '',
  search: '', start: null, end: null,
};

// Parallel structure to useInventoryTransactions.js — see that file for the
// rationale (server-side pagination only, scoped realtime refetch, no
// unbounded in-memory array).
export default function useSalesTransactions() {
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
    if (id !== requestId.current) return;
    setRows(txResult.rows);
    setTotal(txResult.total);
    setSummary(summaryResult);
    setLoading(false);
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);

  useEffect(() => {
    const unsubscribe = subscribeToSalesTransactions(() => {
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
