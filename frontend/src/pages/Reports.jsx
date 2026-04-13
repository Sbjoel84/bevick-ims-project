import { useState, useMemo } from 'react';
import { useApp, formatCurrency, fmtDate } from '../context/AppContext';
import { printReport } from '../utils/print';

// ── Date Range Helpers ────────────────────────────────────────────────────────

const RANGES = [
  { id: 'today',  label: 'Daily' },
  { id: 'week',   label: 'Weekly' },
  { id: 'month',  label: 'Monthly' },
  { id: 'year',   label: 'Yearly' },
  { id: 'custom', label: 'Custom' },
];

function getRange(id, s, e) {
  const now = new Date();
  if (id === 'today') {
    const a = new Date(now); a.setHours(0, 0, 0, 0);
    const b = new Date(now); b.setHours(23, 59, 59, 999);
    return { start: a, end: b };
  }
  if (id === 'week') {
    const day = now.getDay();
    const a = new Date(now); a.setDate(now.getDate() - (day === 0 ? 6 : day - 1)); a.setHours(0, 0, 0, 0);
    const b = new Date(a); b.setDate(a.getDate() + 6); b.setHours(23, 59, 59, 999);
    return { start: a, end: b };
  }
  if (id === 'month') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end:   new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }
  if (id === 'year') {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end:   new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }
  return {
    start: s ? new Date(s + 'T00:00:00') : new Date(0),
    end:   e ? new Date(e + 'T23:59:59') : new Date(),
  };
}

function rangeLabel(id, s, e) {
  if (id === 'custom') return `${s || '…'} to ${e || '…'}`;
  return RANGES.find(r => r.id === id)?.label || id;
}

// ── Report Configs ────────────────────────────────────────────────────────────
// Each config: { id, label, dateKey, getData(state), columns, getSummary(rows, state) }

function makeReportConfigs(state) {
  const { sales, customers, expenses, inventory, bookings, purchaseList, goodsReceived, suppliers, currency, branch, thr } = state;

  const branchLabel = v => v === 'DUB' ? 'Dubai Market' : v === 'KUB' ? 'Kubwa Office' : v || '—';

  return [
    // ── Sales ──────────────────────────────────────────────────────────────────
    {
      id: 'sales',
      label: 'Sales',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
        </svg>
      ),
      dateKey: 'date',
      getData: () => sales.filter(s => branch ? s.branch === branch : true),
      columns: [
        { key: 'id',        label: 'Sale ID' },
        { key: 'date',      label: 'Date',        format: v => fmtDate(v) },
        { key: 'customer',  label: 'Customer',    format: v => v || 'Walk-in' },
        { key: 'branch',    label: 'Branch',      format: branchLabel },
        { key: 'payment',   label: 'Payment' },
        { key: 'totalCost', label: 'Actual Cost', align: 'tr', format: v => v != null ? formatCurrency(v, currency) : '—' },
        { key: 'subtotal',  label: 'Revenue',     align: 'tr', format: v => formatCurrency(v || 0, currency) },
        { key: 'profit',    label: 'Profit',      align: 'tr', format: v => v != null ? formatCurrency(v, currency) : '—' },
        { key: 'vat',       label: 'VAT',         align: 'tr', format: v => formatCurrency(v || 0, currency) },
        { key: 'total',     label: 'Total',       align: 'tr', format: v => formatCurrency(v || 0, currency) },
      ],
      getSummary: rows => {
        const totalRev    = rows.reduce((s, x) => s + (x.total     || 0), 0);
        const totalVat    = rows.reduce((s, x) => s + (x.vat       || 0), 0);
        const totalSub    = rows.reduce((s, x) => s + (x.subtotal  || 0), 0);
        const totalCost   = rows.reduce((s, x) => s + (x.totalCost || 0), 0);
        const totalProfit = rows.reduce((s, x) => s + (x.profit    || 0), 0);
        return [
          { label: 'Number of Sales',      value: rows.length },
          { label: 'Total Actual Cost',    value: formatCurrency(totalCost, currency) },
          { label: 'Total VAT Collected',  value: formatCurrency(totalVat, currency) },
          { label: 'Net Revenue (ex-VAT)', value: formatCurrency(totalSub, currency) },
          { label: 'Total Gross Profit',   value: formatCurrency(totalProfit, currency) },
          { label: 'Total Revenue',        value: formatCurrency(totalRev, currency), bold: true },
        ];
      },
    },

    // ── Customers ──────────────────────────────────────────────────────────────
    {
      id: 'customers',
      label: 'Customers',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
      ),
      dateKey: 'createdAt',
      getData: () => customers.filter(c => branch ? (!c.branch || c.branch === branch) : true),
      columns: [
        { key: 'name',      label: 'Name' },
        { key: 'phone',     label: 'Phone',   format: v => v || '—' },
        { key: 'email',     label: 'Email',   format: v => v || '—' },
        { key: 'address',   label: 'Address', format: v => v || '—' },
        { key: 'createdAt', label: 'Added',   format: v => v ? fmtDate(v) : '—' },
      ],
      getSummary: rows => {
        const totalPurchases = rows.reduce((sum, c) => {
          return sum + sales.filter(s => s.customerId === c.id || s.customer === c.name).reduce((s, x) => s + (x.total || 0), 0);
        }, 0);
        return [
          { label: 'Total Customers',    value: rows.length },
          { label: 'Total Purchases',    value: formatCurrency(totalPurchases, currency), bold: true },
        ];
      },
    },

    // ── Expenses ───────────────────────────────────────────────────────────────
    {
      id: 'expenses',
      label: 'Expenses',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/>
        </svg>
      ),
      dateKey: 'date',
      getData: () => expenses.filter(e => branch ? e.branch === branch : true),
      columns: [
        { key: 'date',     label: 'Date',     format: v => fmtDate(v) },
        { key: 'desc',     label: 'Description' },
        { key: 'category', label: 'Category' },
        { key: 'branch',   label: 'Branch',   format: branchLabel },
        { key: 'amount',   label: 'Amount',   align: 'tr', format: v => formatCurrency(v || 0, currency) },
      ],
      getSummary: rows => {
        const total = rows.reduce((s, e) => s + (e.amount || 0), 0);
        const CATS = ['Operations', 'Logistics', 'Salaries', 'Utilities', 'Maintenance', 'Marketing', 'Office', 'Other'];
        const byCat = CATS
          .map(cat => ({ label: cat, value: formatCurrency(rows.filter(e => e.category === cat).reduce((s, e) => s + (e.amount || 0), 0), currency) }))
          .filter(x => rows.some(e => e.category === x.label));
        return [...byCat, { label: 'Total Expenses', value: formatCurrency(total, currency), bold: true }];
      },
    },

    // ── Inventory ──────────────────────────────────────────────────────────────
    {
      id: 'inventory',
      label: 'Inventory',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
        </svg>
      ),
      dateKey: null, // snapshot
      getData: () => inventory.filter(i => branch ? i.branch === branch : true),
      columns: [
        { key: 'name',     label: 'Item Name' },
        { key: 'category', label: 'Category' },
        { key: 'branch',   label: 'Branch',      format: branchLabel },
        { key: 'qty',      label: 'Qty',          align: 'tc' },
        { key: 'unit',     label: 'Unit',         align: 'tc' },
        { key: 'price',    label: 'Unit Price',   align: 'tr', format: v => formatCurrency(v || 0, currency) },
        { key: 'qty',      label: 'Total Value',  align: 'tr', format: (v, row) => formatCurrency((v || 0) * (row.price || 0), currency) },
        { key: 'qty',      label: 'Status',       align: 'tc', format: (v, row) => v === 0 ? 'Out of Stock' : v <= (row.minQty || thr) ? 'Low Stock' : 'In Stock' },
      ],
      getSummary: rows => {
        const totalVal = rows.reduce((s, i) => s + (i.qty || 0) * (i.price || 0), 0);
        const lowCount = rows.filter(i => i.qty > 0 && i.qty <= (i.minQty || thr)).length;
        const outCount = rows.filter(i => i.qty === 0).length;
        return [
          { label: 'Total Items',      value: rows.length },
          { label: 'Low Stock Items',  value: lowCount },
          { label: 'Out of Stock',     value: outCount },
          { label: 'Total Stock Value', value: formatCurrency(totalVal, currency), bold: true },
        ];
      },
    },

    // ── Booked Items ───────────────────────────────────────────────────────────
    {
      id: 'booked',
      label: 'Booked Items',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
        </svg>
      ),
      dateKey: 'date',
      getData: () => bookings.filter(b => branch ? (!b.branch || b.branch === branch) : true),
      columns: [
        { key: 'id',       label: 'Booking ID' },
        { key: 'date',     label: 'Date',       format: v => v ? fmtDate(v) : '—' },
        { key: 'customer', label: 'Customer',   format: v => v || '—' },
        { key: 'branch',   label: 'Branch',     format: branchLabel },
        { key: 'status',   label: 'Status',     format: v => v ? v.charAt(0).toUpperCase() + v.slice(1) : '—' },
        { key: 'items',    label: 'Items',      align: 'tc', format: v => Array.isArray(v) ? v.length : 0 },
        { key: 'total',    label: 'Total',      align: 'tr', format: v => formatCurrency(v || 0, currency) },
      ],
      getSummary: rows => {
        const totalVal = rows.reduce((s, b) => s + (b.total || 0), 0);
        return [
          { label: 'Total Bookings', value: rows.length },
          { label: 'Pending',        value: rows.filter(b => b.status === 'pending').length },
          { label: 'Confirmed',      value: rows.filter(b => b.status === 'confirmed').length },
          { label: 'Delivered',      value: rows.filter(b => b.status === 'delivered').length },
          { label: 'Cancelled',      value: rows.filter(b => b.status === 'cancelled').length },
          { label: 'Total Value',    value: formatCurrency(totalVal, currency), bold: true },
        ];
      },
    },

    // ── Purchase List ──────────────────────────────────────────────────────────
    {
      id: 'purchase',
      label: 'Purchase List',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
        </svg>
      ),
      dateKey: 'date',
      getData: () => purchaseList.filter(p => branch ? (!p.branch || p.branch === branch) : true),
      columns: [
        { key: 'date',          label: 'Date',     format: v => v ? fmtDate(v) : '—' },
        { key: 'name',          label: 'Item' },
        { key: 'qty',           label: 'Qty',      align: 'tc' },
        { key: 'unit',          label: 'Unit',     align: 'tc' },
        { key: 'supplier',      label: 'Supplier', format: v => v || '—' },
        { key: 'priority',      label: 'Priority', format: v => v ? v.charAt(0).toUpperCase() + v.slice(1) : '—' },
        { key: 'status',        label: 'Status',   format: v => v ? v.charAt(0).toUpperCase() + v.slice(1) : '—' },
        { key: 'estimatedCost', label: 'Est. Cost', align: 'tr', format: v => v ? formatCurrency(v, currency) : '—' },
      ],
      getSummary: rows => {
        const total = rows.filter(p => p.status !== 'cancelled').reduce((s, p) => s + (p.estimatedCost || 0), 0);
        return [
          { label: 'Total Requests', value: rows.length },
          { label: 'Pending',        value: rows.filter(p => p.status === 'pending').length },
          { label: 'Ordered',        value: rows.filter(p => p.status === 'ordered').length },
          { label: 'Received',       value: rows.filter(p => p.status === 'received').length },
          { label: 'Est. Total Cost',value: formatCurrency(total, currency), bold: true },
        ];
      },
    },

    // ── Goods Received ─────────────────────────────────────────────────────────
    {
      id: 'goods',
      label: 'Goods Received',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>
        </svg>
      ),
      dateKey: 'date',
      getData: () => goodsReceived.filter(g => branch ? g.branch === branch : true),
      columns: [
        { key: 'id',         label: 'GRN #' },
        { key: 'date',       label: 'Date',       format: v => v ? fmtDate(v) : '—' },
        { key: 'supplier',   label: 'Supplier',   format: v => v || '—' },
        { key: 'branch',     label: 'Branch',     format: branchLabel },
        { key: 'invoiceNo',  label: 'Invoice #',  format: v => v || '—' },
        { key: 'items',      label: 'Items',      align: 'tc', format: v => Array.isArray(v) ? v.length : 0 },
        { key: 'totalCost',  label: 'Total Cost', align: 'tr', format: v => formatCurrency(v || 0, currency) },
        { key: 'receivedBy', label: 'Received By', format: v => v || '—' },
      ],
      getSummary: rows => {
        const total = rows.reduce((s, g) => s + (g.totalCost || 0), 0);
        return [
          { label: 'Total GRNs',           value: rows.length },
          { label: 'Total Value Received', value: formatCurrency(total, currency), bold: true },
        ];
      },
    },

    // ── Suppliers ──────────────────────────────────────────────────────────────
    {
      id: 'suppliers',
      label: 'Suppliers',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
        </svg>
      ),
      dateKey: null, // snapshot
      getData: () => suppliers,
      columns: [
        { key: 'name',     label: 'Name' },
        { key: 'contact',  label: 'Contact',  format: v => v || '—' },
        { key: 'phone',    label: 'Phone',    format: v => v || '—' },
        { key: 'email',    label: 'Email',    format: v => v || '—' },
        { key: 'category', label: 'Category' },
        { key: 'status',   label: 'Status',   format: v => v ? v.charAt(0).toUpperCase() + v.slice(1) : '—' },
      ],
      getSummary: rows => [
        { label: 'Total Suppliers', value: rows.length },
        { label: 'Active',          value: rows.filter(s => s.status === 'active').length },
        { label: 'Inactive',        value: rows.filter(s => s.status !== 'active').length },
      ],
    },
  ];
}

// ── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCards({ summaryRows }) {
  if (!summaryRows || summaryRows.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {summaryRows.map(s => (
        <div key={s.label} className={`bg-gray-900 border rounded-xl px-4 py-3 ${s.bold ? 'border-blue-500/50' : 'border-gray-800'}`}>
          <p className="text-gray-500 text-xs mb-1 truncate">{s.label}</p>
          <p className={`font-syne font-bold text-base truncate ${s.bold ? 'text-blue-400' : 'text-white'}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main Reports Page ─────────────────────────────────────────────────────────

export default function Reports() {
  const { state } = useApp();
  const { bname, permissions, user } = state;

  const allConfigs = useMemo(() => makeReportConfigs(state), [state]);

  // Only show tabs for pages the user has permission to access
  const allowed = user?.customPages || permissions[user?.role] || [];
  const configs = allConfigs.filter(c => allowed.includes(c.id));

  const [activeTab, setActiveTab]   = useState(configs[0]?.id || 'sales');
  const [range, setRange]           = useState('month');
  const [customS, setCustomS]       = useState('');
  const [customE, setCustomE]       = useState('');

  const config = configs.find(c => c.id === activeTab) || configs[0];

  const allRows = config ? config.getData() : [];
  const { start, end } = getRange(range, customS, customE);

  const rows = config?.dateKey
    ? allRows.filter(item => { const d = new Date(item[config.dateKey]); return d >= start && d <= end; })
    : allRows;

  const summary = config ? config.getSummary(rows) : [];
  const label   = rangeLabel(range, customS, customE);

  function handlePrint() {
    if (!config || rows.length === 0) return;
    printReport({
      title:       `${config.label} Report`,
      subtitle:    bname,
      columns:     config.columns,
      rows,
      summaryRows: summary,
      dateRange:   config.dateKey ? label : null,
      state,
    });
  }

  if (configs.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <p className="text-gray-500">No reports available for your role.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">

      {/* Page Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Reports</h1>
          <p className="text-gray-500 text-sm mt-0.5">{bname} · Generate and print reports for any module</p>
        </div>
        <button
          onClick={handlePrint}
          disabled={rows.length === 0}
          className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
          </svg>
          Print Report ({rows.length})
        </button>
      </div>

      {/* Tab Navbar */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <div className="flex min-w-max border-b border-gray-800">
            {configs.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveTab(c.id)}
                className={`
                  flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px
                  ${activeTab === c.id
                    ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'}
                `}
              >
                {c.icon}
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 space-y-5">

          {/* Date Range Selector */}
          {config?.dateKey && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-gray-500 text-xs font-medium shrink-0">Period:</span>
              <div className="flex gap-2 flex-wrap">
                {RANGES.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setRange(r.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      range === r.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {range === 'custom' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="date"
                    value={customS}
                    onChange={e => setCustomS(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-gray-600 text-xs">to</span>
                  <input
                    type="date"
                    value={customE}
                    onChange={e => setCustomE(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              <span className="text-gray-600 text-xs ml-auto shrink-0">
                {rows.length} record(s)
                {config?.dateKey ? ` · ${label}` : ' · Current snapshot'}
              </span>
            </div>
          )}

          {!config?.dateKey && (
            <p className="text-gray-600 text-xs">
              Showing current snapshot · {rows.length} record(s)
            </p>
          )}

          {/* Summary Cards */}
          <SummaryCards summaryRows={summary} />

          {/* Data Table */}
          <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-950 z-10">
                  <tr className="border-b border-gray-800">
                    {config?.columns.map((c, i) => (
                      <th
                        key={`${c.key}-${i}`}
                        className={`text-gray-500 font-medium px-4 py-3 whitespace-nowrap ${
                          c.align === 'tr' ? 'text-right' : c.align === 'tc' ? 'text-center' : 'text-left'
                        }`}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={config?.columns.length || 1}
                        className="text-center text-gray-600 py-16"
                      >
                        {config?.dateKey
                          ? `No ${config.label.toLowerCase()} records in this period`
                          : `No ${config?.label.toLowerCase()} records found`}
                      </td>
                    </tr>
                  ) : rows.map((row, i) => (
                    <tr
                      key={row.id || i}
                      className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30 transition-colors"
                    >
                      {config.columns.map((c, ci) => {
                        const raw = row[c.key];
                        const val = c.format ? c.format(raw, row) : (raw ?? '—');
                        return (
                          <td
                            key={`${c.key}-${ci}`}
                            className={`px-4 py-2.5 text-gray-300 ${
                              c.align === 'tr' ? 'text-right font-mono' : c.align === 'tc' ? 'text-center' : ''
                            }`}
                          >
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
