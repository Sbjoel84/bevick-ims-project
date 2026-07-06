import { useState, useMemo, useEffect, useRef } from 'react';
import useInventoryTransactions from '../hooks/useInventoryTransactions';
import LedgerFilterBar from './LedgerFilterBar';
import { fmtDateTime } from '../context/AppContext';
import { printReport } from '../utils/print';
import { exportLedgerToExcel, exportLedgerToCSV } from '../utils/excel';
import { fetchTransactions, fetchReportSummary } from '../lib/inventoryTransactionService';
import { getDateRange } from '../utils/dateRanges';

const BRANCHES = [{ id: 'DUB', label: 'Dubai Market' }, { id: 'KUB', label: 'Kubwa Office' }];
const CATEGORIES = ['Machinery', 'Spare Parts', 'Chemicals', 'Consumables', 'Others'];
const TRANSACTION_TYPES = ['Stock In', 'Stock Out', 'Adjustment', 'Transfer', 'Sale', 'Booking', 'Delete', 'Restore', 'Update'];
const REPORT_PRESETS = [
  { id: 'today', label: 'Daily Report' },
  { id: 'thisWeek', label: 'Weekly Report' },
  { id: 'thisMonth', label: 'Monthly Report' },
  { id: 'thisQuarter', label: 'Quarterly Report' },
  { id: 'thisYear', label: 'Yearly Report' },
  { id: 'custom', label: 'Custom Report' },
];

const STATUS_STYLES = {
  Normal: 'bg-blue-950 text-blue-400',
  'Low Stock': 'bg-amber-950 text-amber-400',
  'Out of Stock': 'bg-red-950 text-red-400',
  Completed: 'bg-gray-800 text-gray-300',
};

const TYPE_STYLES = {
  'Stock In': 'bg-green-950 text-green-400',
  'Stock Out': 'bg-red-950 text-red-400',
  Adjustment: 'bg-blue-950 text-blue-400',
  Transfer: 'bg-purple-950 text-purple-400',
  Sale: 'bg-cyan-950 text-cyan-400',
  Booking: 'bg-indigo-950 text-indigo-400',
  Delete: 'bg-red-950 text-red-400',
  Restore: 'bg-emerald-950 text-emerald-400',
  Update: 'bg-gray-800 text-gray-300',
};

const COLUMNS = [
  { key: 'transaction_number', label: 'Transaction No.' },
  { key: 'created_at', label: 'Date & Time', format: v => fmtDateTime(v) },
  { key: 'branch', label: 'Branch', format: v => v === 'DUB' ? 'Dubai Market' : v === 'KUB' ? 'Kubwa Office' : (v || '—') },
  { key: 'product_name', label: 'Product' },
  { key: 'category', label: 'Category' },
  { key: 'source', label: 'Source' },
  { key: 'transaction_type', label: 'Transaction Type' },
  { key: 'quantity_before', label: 'Qty Before', align: 'tr' },
  { key: 'quantity_changed', label: 'Qty Changed', align: 'tr', format: v => (v > 0 ? `+${v}` : v) },
  { key: 'quantity_after', label: 'Qty After', align: 'tr' },
  { key: 'performed_by', label: 'Performed By' },
  { key: 'remarks', label: 'Remarks', format: (v, row) => v || row.description || '—' },
  { key: 'status', label: 'Status' },
];

function SummaryCard({ label, value, accent }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 overflow-hidden min-w-0">
      <p className="text-gray-500 text-xs font-medium mb-1">{label}</p>
      <p className={`font-syne text-sm sm:text-xl font-bold ${accent || 'text-white'}`}>{value}</p>
    </div>
  );
}

export default function InventoryTransactionsLedger({ state }) {
  const { filters, updateFilters, resetFilters, page, setPage, pageSize, rows, total, loading, summary } = useInventoryTransactions();
  const [detail, setDetail] = useState(null);
  const [reportPanelOpen, setReportPanelOpen] = useState(false);
  const [reportPreset, setReportPreset] = useState('thisMonth');
  const [reportCustomStart, setReportCustomStart] = useState('');
  const [reportCustomEnd, setReportCustomEnd] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportPreview, setReportPreview] = useState(null);
  const [reportPreviewLoading, setReportPreviewLoading] = useState(false);
  const previewRequestId = useRef(0);

  const lowStockCount = useMemo(() => {
    return (state.inventory || []).filter(i => {
      const t = i.qty || 0;
      return t > 0 && t <= (i.minQty || state.thr);
    }).length;
  }, [state.inventory, state.thr]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function buildReportPayload() {
    const { start, end, label } = getDateRange(reportPreset, reportCustomStart, reportCustomEnd);
    const [reportSummary, txResult] = await Promise.all([
      fetchReportSummary({ start: start.toISOString(), end: end.toISOString(), branch: filters.branch }),
      fetchTransactions({ filters: { ...filters, start: start.toISOString(), end: end.toISOString() }, page: 0, pageSize: 2000 }),
    ]);
    const branchRows = (reportSummary?.branch_summary || []).map(b => ({
      label: `Branch: ${b.branch === 'DUB' ? 'Dubai Market' : b.branch === 'KUB' ? 'Kubwa Office' : (b.branch || 'Unassigned')}`,
      value: `${b.count} txn · +${b.stock_in} / -${b.stock_out}`,
    }));
    const summaryRows = [
      { label: 'Total Transactions', value: reportSummary?.total_transactions ?? 0 },
      { label: 'Total Stock In', value: reportSummary?.total_stock_in ?? 0 },
      { label: 'Total Stock Out', value: reportSummary?.total_stock_out ?? 0 },
      { label: 'Net Inventory Movement', value: reportSummary?.net_movement ?? 0 },
      { label: 'Most Active Product', value: reportSummary?.most_active_product || '—' },
      { label: 'Most Active Officer', value: reportSummary?.most_active_officer || '—' },
      ...branchRows,
    ];
    return { rows: txResult.rows, summaryRows, dateRangeLabel: label };
  }

  // Live preview — refetches automatically whenever the report period (or
  // the underlying ledger filters) changes, so picking Daily/Weekly/Monthly/
  // etc. immediately shows matching data instead of only fetching at
  // Print/Export time.
  useEffect(() => {
    if (!reportPanelOpen) return;
    if (reportPreset === 'custom' && (!reportCustomStart || !reportCustomEnd)) {
      setReportPreview(null);
      return;
    }
    const id = ++previewRequestId.current;
    setReportPreviewLoading(true);
    buildReportPayload().then(result => {
      if (id !== previewRequestId.current) return;
      setReportPreview(result);
      setReportPreviewLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportPanelOpen, reportPreset, reportCustomStart, reportCustomEnd, filters]);

  async function handlePrintReport() {
    setReportBusy(true);
    try {
      const { rows: reportRows, summaryRows, dateRangeLabel } = reportPreview || await buildReportPayload();
      printReport({
        title: 'Inventory Transaction Ledger', subtitle: state.bname || 'All Branches',
        columns: COLUMNS, rows: reportRows, summaryRows, dateRange: dateRangeLabel, state,
        generatedBy: state.user?.name, signatureLines: ['Prepared By', 'Verified By', 'Approved By'],
      });
    } finally {
      setReportBusy(false);
    }
  }

  async function handleExport(kind) {
    setReportBusy(true);
    try {
      const { rows: reportRows, summaryRows, dateRangeLabel } = reportPreview || await buildReportPayload();
      if (kind === 'excel') {
        exportLedgerToExcel({
          rows: reportRows, columns: COLUMNS, bizName: state.bizName, bizRC: state.bizRC,
          title: 'Inventory Transaction Ledger', dateRangeLabel, generatedBy: state.user?.name,
          summaryRows, fileNamePrefix: 'Inventory-Transactions',
        });
      } else {
        exportLedgerToCSV({ rows: reportRows, columns: COLUMNS, fileNamePrefix: 'Inventory-Transactions' });
      }
    } finally {
      setReportBusy(false);
    }
  }

  function printSingleRow(row) {
    printReport({
      title: 'Transaction Detail', subtitle: row.transaction_number,
      columns: COLUMNS, rows: [row], summaryRows: null, dateRange: null, state,
      generatedBy: state.user?.name, signatureLines: ['Prepared By', 'Verified By'],
    });
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <SummaryCard label="Today's Transactions" value={summary?.today_count ?? '—'} />
        <SummaryCard label="Weekly Transactions" value={summary?.week_count ?? '—'} />
        <SummaryCard label="Monthly Transactions" value={summary?.month_count ?? '—'} />
        <SummaryCard label="Month Stock In" value={summary?.month_stock_in ?? '—'} accent="text-green-400" />
        <SummaryCard label="Month Stock Out" value={summary?.month_stock_out ?? '—'} accent="text-red-400" />
        <SummaryCard label="Inventory Adjustments" value={summary?.month_adjustments ?? '—'} accent="text-blue-400" />
        <SummaryCard label="Branch Transfers" value={summary?.month_transfers ?? '—'} accent="text-purple-400" />
        <SummaryCard label="Low Stock Items" value={lowStockCount} accent={lowStockCount > 0 ? 'text-amber-400' : 'text-white'} />
      </div>

      <LedgerFilterBar
        filters={filters}
        onChange={updateFilters}
        onReset={resetFilters}
        branches={BRANCHES}
        categories={CATEGORIES}
        transactionTypes={TRANSACTION_TYPES}
        fields={{ category: true, source: true }}
      />

      {/* Report / Export toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setReportPanelOpen(o => !o)}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          Generate Report
        </button>
        {reportPanelOpen && (
          <div className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <select value={reportPreset} onChange={e => setReportPreset(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {REPORT_PRESETS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            {reportPreset === 'custom' && (
              <>
                <input type="date" value={reportCustomStart} onChange={e => setReportCustomStart(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="date" value={reportCustomEnd} onChange={e => setReportCustomEnd(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </>
            )}
            <button disabled={reportBusy || reportPreviewLoading} onClick={handlePrintReport} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
              Print
            </button>
            <button disabled={reportBusy || reportPreviewLoading} onClick={() => handleExport('excel')} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
              Export Excel
            </button>
            <button disabled={reportBusy || reportPreviewLoading} onClick={() => handleExport('csv')} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
              Export CSV
            </button>

            {/* Live preview — updates automatically as the period/filters change */}
            <div className="w-full">
              {reportPreviewLoading ? (
                <p className="text-gray-500 text-xs">Fetching {REPORT_PRESETS.find(r => r.id === reportPreset)?.label.toLowerCase()}…</p>
              ) : reportPreview ? (
                <div className="space-y-2">
                  <p className="text-gray-400 text-xs">
                    <span className="text-white font-semibold">{reportPreview.rows.length.toLocaleString()}</span> transaction{reportPreview.rows.length !== 1 ? 's' : ''} found · {reportPreview.dateRangeLabel}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {reportPreview.summaryRows.slice(0, 6).map(s => (
                      <div key={s.label} className="bg-gray-800 rounded-lg px-3 py-1.5 text-xs">
                        <span className="text-gray-500">{s.label}:</span> <span className="text-white font-medium">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-xs">Select a custom date range to preview.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {COLUMNS.map(c => (
                  <th key={c.key} className={`text-gray-500 font-medium px-3 py-3 whitespace-nowrap ${c.align === 'tr' ? 'text-right' : 'text-left'}`}>{c.label}</th>
                ))}
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={COLUMNS.length + 1} className="text-center text-gray-600 py-12">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={COLUMNS.length + 1} className="text-center text-gray-600 py-12">No transactions found</td></tr>
              ) : rows.map(row => (
                <tr key={row.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-gray-400 text-xs whitespace-nowrap">{row.transaction_number}</td>
                  <td className="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap">{fmtDateTime(row.created_at)}</td>
                  <td className="px-3 py-2.5 text-gray-300 whitespace-nowrap">{row.branch === 'DUB' ? 'Dubai Market' : row.branch === 'KUB' ? 'Kubwa Office' : (row.branch || '—')}</td>
                  <td className="px-3 py-2.5 text-white font-medium whitespace-nowrap">{row.product_name || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{row.category || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{row.source || '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${TYPE_STYLES[row.transaction_type] || 'bg-gray-800 text-gray-300'}`}>{row.transaction_type}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-400">{row.quantity_before}</td>
                  <td className={`px-3 py-2.5 text-right font-mono font-semibold ${row.quantity_changed > 0 ? 'text-green-400' : row.quantity_changed < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                    {row.quantity_changed > 0 ? `+${row.quantity_changed}` : row.quantity_changed}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-white">{row.quantity_after}</td>
                  <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{row.performed_by || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs max-w-[180px] truncate" title={row.remarks || row.description}>{row.remarks || row.description || '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${STATUS_STYLES[row.status] || 'bg-gray-800 text-gray-300'}`}>{row.status}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => setDetail(row)} title="View" className="text-gray-500 hover:text-white transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      </button>
                      <button onClick={() => printSingleRow(row)} title="Print" className="text-gray-500 hover:text-blue-400 transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">← Prev</button>
          <span className="text-gray-500 text-xs">Page {page + 1} of {totalPages} · {total.toLocaleString()} total</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next →</button>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-syne font-semibold text-white">{detail.transaction_number}</h2>
              <button onClick={() => setDetail(null)} className="text-gray-500 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4 text-sm">
              {COLUMNS.map(c => (
                <div key={c.key} className={c.key === 'remarks' ? 'col-span-2' : ''}>
                  <p className="text-gray-500 text-xs mb-1">{c.label}</p>
                  <p className="text-white">{c.format ? c.format(detail[c.key], detail) : (detail[c.key] ?? '—')}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
