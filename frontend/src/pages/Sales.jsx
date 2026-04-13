import { useState } from 'react';
import { useApp, formatCurrency, fmtDate, fmtDateTime, genId } from '../context/AppContext';
import { printReceipt } from '../utils/print';
import ReportModal from '../components/ReportModal';
import DeleteRequestModal from '../components/DeleteRequestModal';

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'POS', 'Cheque', 'Credit'];
const BRANCHES = [{ id: 'DUB', label: 'Dubai Market' }, { id: 'KUB', label: 'Kubwa Office' }];

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="font-syne font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function Sales() {
  const { state, dispatch } = useApp();
  const { sales, inventory, currency, vat, branch, bname, user } = state;

  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [filterPayment, setFilterPayment] = useState('all');
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteReq, setDeleteReq] = useState(null);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'Cash', date: new Date().toISOString().split('T')[0], note: '' });

  // Always derive the live sale from state so payment additions reflect instantly
  const currentSelected = selected ? (sales.find(s => s.id === selected.id) || selected) : null;

  const salesColumns = [
    { key: 'id',        label: 'Sale ID' },
    { key: 'date',      label: 'Date',       format: v => fmtDate(v) },
    { key: 'customer',  label: 'Customer' },
    { key: 'branch',    label: 'Branch',     format: v => v === 'DUB' ? 'Dubai Market' : 'Kubwa Office' },
    { key: 'payment',   label: 'Payment' },
    { key: 'totalCost', label: 'Actual Cost', align: 'tr', format: v => v != null ? formatCurrency(v, currency) : '—' },
    { key: 'subtotal',  label: 'Sales Revenue', align: 'tr', format: v => formatCurrency(v || 0, currency) },
    { key: 'vat',       label: 'VAT',        align: 'tr', format: v => formatCurrency(v || 0, currency) },
    { key: 'profit',    label: 'Gross Profit', align: 'tr', format: v => v != null ? formatCurrency(v, currency) : '—' },
    { key: 'total',     label: 'Total',      align: 'tr', format: v => formatCurrency(v || 0, currency) },
  ];

  function getSalesSummary(data) {
    const totalRev    = data.reduce((s, x) => s + (x.total    || 0), 0);
    const totalVat    = data.reduce((s, x) => s + (x.vat      || 0), 0);
    const totalSub    = data.reduce((s, x) => s + (x.subtotal || 0), 0);
    const totalCost   = data.reduce((s, x) => s + (x.totalCost || 0), 0);
    const totalProfit = data.reduce((s, x) => s + (x.profit   || 0), 0);
    return [
      { label: 'Number of Sales',        value: data.length },
      { label: 'Total Actual Cost',      value: formatCurrency(totalCost, currency) },
      { label: 'Total VAT Collected',    value: formatCurrency(totalVat, currency) },
      { label: 'Net Revenue (ex-VAT)',   value: formatCurrency(totalSub, currency) },
      { label: 'Total Gross Profit',     value: formatCurrency(totalProfit, currency) },
      { label: 'Total Revenue',          value: formatCurrency(totalRev, currency), bold: true },
    ];
  }

  const [form, setForm] = useState({
    customer: '',
    branch: branch || 'DUB',
    payment: 'Cash',
    note: '',
    items: [],
    applyVat: false,
    amountPaid: '',
  });

  // Item picker state
  const [pickerItemId, setPickerItemId] = useState('');
  const [pickerQty, setPickerQty] = useState(1);
  const [pickerPrice, setPickerPrice] = useState('');
  const [pickerCostPrice, setPickerCostPrice] = useState('');
  const [pickerManualName, setPickerManualName] = useState('');

  const filteredSales = sales
    .filter(s => branch ? s.branch === branch : true)
    .filter(s => {
      const q = search.toLowerCase();
      return !q || s.customer?.toLowerCase().includes(q) || s.id?.toLowerCase().includes(q);
    })
    .filter(s => filterPayment === 'all' || s.payment === filterPayment);

  // All items for the selected branch that aren't already added
  const availableItems = inventory.filter(i =>
    (form.branch ? i.branch === form.branch : true) && i.qty > 0
  );

  const pickerSelected = availableItems.find(i => i.id === pickerItemId);

  // When user picks an item from dropdown, pre-fill the price
  function onPickerItemChange(id) {
    setPickerItemId(id);
    if (id === '__manual__') {
      setPickerPrice('');
      setPickerCostPrice('');
      setPickerQty(1);
      return;
    }
    const item = availableItems.find(i => i.id === id);
    setPickerPrice(item ? item.price : '');
    setPickerCostPrice('');
    setPickerManualName('');
    setPickerQty(1);
  }

  function handleAddItem() {
    const qty       = parseInt(pickerQty) || 1;
    const price     = parseFloat(pickerPrice) || 0;
    const costPrice = parseFloat(pickerCostPrice) || 0;

    // ── Manual / custom item ───────────────────────────────────────────────
    if (pickerItemId === '__manual__') {
      const name = pickerManualName.trim();
      if (!name) return;
      setForm(f => ({
        ...f,
        items: [
          ...f.items,
          { id: `CUST_${Date.now()}`, name, price, costPrice, qty, unit: '', _custom: true },
        ],
      }));
      setPickerItemId('');
      setPickerManualName('');
      setPickerQty(1);
      setPickerPrice('');
      setPickerCostPrice('');
      return;
    }

    // ── Inventory item ────────────────────────────────────────────────────
    if (!pickerItemId || !pickerSelected) return;
    const salePrice = parseFloat(pickerPrice) || pickerSelected.price;
    const existing  = form.items.find(i => i.id === pickerItemId);
    if (existing) {
      setForm(f => ({
        ...f,
        items: f.items.map(i =>
          i.id === pickerItemId ? { ...i, qty: i.qty + qty } : i
        ),
      }));
    } else {
      setForm(f => ({
        ...f,
        items: [
          ...f.items,
          { id: pickerSelected.id, name: pickerSelected.name, price: salePrice, costPrice, qty, unit: pickerSelected.unit },
        ],
      }));
    }
    setPickerItemId('');
    setPickerQty(1);
    setPickerPrice('');
    setPickerCostPrice('');
  }

  function removeItem(id) {
    setForm(f => ({ ...f, items: f.items.filter(i => i.id !== id) }));
  }

  function updateItemQty(id, qty) {
    const n = parseInt(qty);
    if (n < 1) return;
    setForm(f => ({ ...f, items: f.items.map(i => i.id === id ? { ...i, qty: n } : i) }));
  }

  function updateItemPrice(id, price) {
    const n = parseFloat(price);
    if (isNaN(n)) return;
    setForm(f => ({ ...f, items: f.items.map(i => i.id === id ? { ...i, price: n } : i) }));
  }

  function updateItemCostPrice(id, costPrice) {
    const n = parseFloat(costPrice);
    setForm(f => ({ ...f, items: f.items.map(i => i.id === id ? { ...i, costPrice: isNaN(n) ? 0 : n } : i) }));
  }

  const subtotal     = form.items.reduce((s, i) => s + i.price * i.qty, 0);
  const totalCostAmt = form.items.reduce((s, i) => s + (i.costPrice || 0) * i.qty, 0);
  const grossProfit  = subtotal - totalCostAmt;
  const vatAmount    = form.applyVat ? subtotal * vat : 0;
  const total        = subtotal + vatAmount;

  function submitSale() {
    if (form.items.length === 0) return;
    const initialAmt = parseFloat(form.amountPaid);
    const paidNow = isNaN(initialAmt) ? total : Math.min(Math.max(initialAmt, 0), total);
    const initialPayment = {
      id: genId('PAY'),
      amount: paidNow,
      method: form.payment,
      date: new Date().toISOString(),
      note: isNaN(initialAmt) || initialAmt >= total ? 'Full payment' : 'Initial payment',
    };
    const sale = {
      id: genId('S'),
      customer: form.customer || 'Walk-in',
      branch: form.branch,
      payment: form.payment,
      note: form.note,
      items: form.items,
      subtotal,
      totalCost: totalCostAmt,
      profit: grossProfit,
      vat: vatAmount,
      total,
      amountPaid: paidNow,
      payments: [initialPayment],
      date: new Date().toISOString(),
      createdBy: user?.name,
    };
    dispatch({ type: 'ADD_SALE', payload: sale });
    setForm({ customer: '', branch: branch || 'DUB', payment: 'Cash', note: '', items: [], applyVat: false, amountPaid: '' });
    setPickerItemId(''); setPickerQty(1); setPickerPrice(''); setPickerCostPrice(''); setPickerManualName('');
    // Open receipt view automatically
    setSelected(sale);
    setModal('view');
  }

  function submitPayment() {
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0 || !currentSelected) return;
    const payment = {
      id: genId('PAY'),
      amount,
      method: payForm.method,
      date: payForm.date ? new Date(payForm.date + 'T12:00:00').toISOString() : new Date().toISOString(),
      note: payForm.note,
    };
    dispatch({ type: 'ADD_PAYMENT', payload: { saleId: currentSelected.id, payment } });
    setPayForm({ amount: '', method: 'Cash', date: new Date().toISOString().split('T')[0], note: '' });
    setShowPayForm(false);
  }

  function openView(sale) {
    setSelected(sale);
    setShowPayForm(false);
    setPayForm({ amount: '', method: 'Cash', date: new Date().toISOString().split('T')[0], note: '' });
    setModal('view');
  }

  function deleteSale(id) {
    if (user?.role === 'super_admin') {
      if (window.confirm('Delete this sale? It will be moved to the recycle bin.')) {
        dispatch({ type: 'DELETE_SALE', payload: id });
        if (modal === 'view') setModal(null);
      }
    } else {
      const sale = sales.find(s => s.id === id);
      setDeleteReq({ type: 'sale', targetId: id, label: `Sale #${id}${sale?.customer ? ` — ${sale.customer}` : ''}` });
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Sales</h1>
          <p className="text-gray-500 text-sm mt-0.5">{bname}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
            </svg>
            Report
          </button>
          <button
            onClick={() => {
              setForm({ customer: '', branch: branch || 'DUB', payment: 'Cash', note: '', items: [], applyVat: false, amountPaid: '' });
              setPickerItemId(''); setPickerQty(1); setPickerPrice(''); setPickerCostPrice(''); setPickerManualName('');
              setShowPayForm(false);
              setModal('new');
            }}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Sale
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by customer or ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        <select
          value={filterPayment}
          onChange={e => setFilterPayment(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Payments</option>
          {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 font-medium px-5 py-3">Sale ID</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Customer</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Date</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Payment</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Items</th>
                <th className="text-right text-amber-600 font-medium px-5 py-3">Actual Cost</th>
                <th className="text-right text-gray-500 font-medium px-5 py-3">Revenue</th>
                <th className="text-right text-green-600 font-medium px-5 py-3">Profit</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-gray-600 py-12">No sales found</td></tr>
              ) : filteredSales.map(s => (
                <tr key={s.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-gray-400 text-xs">{s.id}</td>
                  <td className="px-5 py-3.5 text-white font-medium">{s.customer}</td>
                  <td className="px-5 py-3.5 text-gray-400">{fmtDate(s.date)}</td>
                  <td className="px-5 py-3.5">
                    <span className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-lg">{s.payment}</span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-400">{s.items?.length || 0}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-amber-400 text-sm">
                    {s.totalCost != null ? formatCurrency(s.totalCost, currency) : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-blue-400 font-medium">{formatCurrency(s.total, currency)}</td>
                  <td className={`px-5 py-3.5 text-right font-mono font-semibold text-sm ${s.profit != null ? (s.profit >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                    {s.profit != null ? formatCurrency(s.profit, currency) : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openView(s)} className="text-gray-500 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      </button>
                      <button onClick={() => deleteSale(s.id)} className="text-gray-500 hover:text-red-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── New Sale Modal ── */}
      {modal === 'new' && (
        <Modal title="Record New Sale" onClose={() => setModal(null)}>
          <div className="space-y-4">

            {/* Customer + Branch */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Customer Name</label>
                <input
                  type="text"
                  placeholder="Walk-in or name…"
                  value={form.customer}
                  onChange={e => setForm(f => ({ ...f, customer: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Branch</label>
                <select
                  value={form.branch}
                  onChange={e => {
                    setForm(f => ({ ...f, branch: e.target.value, items: [] }));
                    setPickerItemId(''); setPickerQty(1); setPickerPrice('');
                  }}
                  disabled={!!branch}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
            </div>

            {/* Payment */}
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Payment Method</label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, payment: m }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${form.payment === m ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Item Picker ── */}
            <div className="bg-gray-800 rounded-xl p-4 space-y-3">
              <p className="text-gray-400 text-xs font-medium">Add Items to Sale</p>

              {/* Row: dropdown + qty + price + button */}
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <label className="text-gray-500 text-xs block mb-1">Select Item</label>
                  <select
                    value={pickerItemId}
                    onChange={e => onPickerItemChange(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Choose an item —</option>
                    {availableItems.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name}  ({item.qty} {item.unit} in stock)
                      </option>
                    ))}
                    <option disabled>──────────────</option>
                    <option value="__manual__">✏️  Enter item manually…</option>
                  </select>
                </div>
                <div className="w-20">
                  <label className="text-gray-500 text-xs block mb-1">Qty</label>
                  <input
                    type="number"
                    min={1}
                    value={pickerQty}
                    onChange={e => setPickerQty(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="w-28">
                  <label className="text-gray-500 text-xs block mb-1">Actual Cost (₦)</label>
                  <input
                    type="number"
                    min={0}
                    value={pickerCostPrice}
                    onChange={e => setPickerCostPrice(e.target.value)}
                    placeholder="0"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="w-28">
                  <label className="text-gray-500 text-xs block mb-1">Sale Price (₦)</label>
                  <input
                    type="number"
                    min={0}
                    value={pickerPrice}
                    onChange={e => setPickerPrice(e.target.value)}
                    placeholder={pickerSelected ? pickerSelected.price : '0'}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  disabled={
                    !pickerItemId ||
                    (pickerItemId === '__manual__' && !pickerManualName.trim())
                  }
                  className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Item
                </button>
              </div>

              {/* Manual item name input — full-width row directly below the picker */}
              {pickerItemId === '__manual__' && (
                <div>
                  <label className="text-purple-400 text-xs font-medium block mb-1">Item Name <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    placeholder="Type the item name…"
                    value={pickerManualName}
                    onChange={e => setPickerManualName(e.target.value)}
                    autoFocus
                    className="w-full bg-gray-700 border border-purple-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-purple-400/70 text-xs mt-1">Fill in Actual Cost and Sale Price above, then click Add Item.</p>
                </div>
              )}

              {/* Inventory item hint */}
              {pickerSelected && pickerItemId !== '__manual__' && (
                <p className="text-gray-500 text-xs">
                  {pickerSelected.name} · {pickerSelected.category} · Stock: {pickerSelected.qty} {pickerSelected.unit} · Default price: {formatCurrency(pickerSelected.price, currency)}
                </p>
              )}
            </div>

            {/* Items table */}
            {form.items.length > 0 && (
              <div className="bg-gray-800 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-gray-500 font-medium px-4 py-2.5 text-xs">Item</th>
                      <th className="text-center text-gray-500 font-medium px-4 py-2.5 text-xs">Qty</th>
                      <th className="text-right text-amber-600 font-medium px-4 py-2.5 text-xs">Actual Cost</th>
                      <th className="text-right text-blue-500 font-medium px-4 py-2.5 text-xs">Sale Price</th>
                      <th className="text-right text-green-600 font-medium px-4 py-2.5 text-xs">Profit</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map(item => {
                      const itemProfit = (item.price - (item.costPrice || 0)) * item.qty;
                      return (
                        <tr key={item.id} className="border-b border-gray-700 last:border-0">
                          <td className="px-4 py-2.5 text-white text-xs truncate max-w-[140px]">{item.name}</td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              min={1}
                              value={item.qty}
                              onChange={e => updateItemQty(item.id, e.target.value)}
                              className="w-16 text-center bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              min={0}
                              value={item.costPrice || ''}
                              onChange={e => updateItemCostPrice(item.id, e.target.value)}
                              placeholder="0"
                              className="w-28 text-right bg-gray-700 border border-amber-900/40 rounded-lg px-2 py-1 text-amber-300 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              min={0}
                              value={item.price}
                              onChange={e => updateItemPrice(item.id, e.target.value)}
                              className="w-28 text-right bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-blue-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className={`px-4 py-2.5 text-right text-xs font-mono font-medium ${itemProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(itemProfit, currency)}
                          </td>
                          <td className="px-4 py-2.5">
                            <button onClick={() => removeItem(item.id)} className="text-gray-600 hover:text-red-400">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="bg-gray-800 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-amber-500">Total Actual Cost</span>
                <span className="text-amber-300 font-mono">{formatCurrency(totalCostAmt, currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Sales Revenue (subtotal)</span>
                <span className="text-white font-mono">{formatCurrency(subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span className={grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}>Gross Profit</span>
                <span className={`font-mono ${grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(grossProfit, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-sm border-t border-gray-700 pt-2">
                <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.applyVat}
                    onChange={e => setForm(f => ({ ...f, applyVat: e.target.checked }))}
                    className="accent-blue-500"
                  />
                  VAT ({(vat * 100).toFixed(1)}%)
                </label>
                <span className="text-gray-400 font-mono">{formatCurrency(vatAmount, currency)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-gray-700 pt-2">
                <span className="text-white">Total Charged to Customer</span>
                <span className="text-blue-400 font-mono text-base">{formatCurrency(total, currency)}</span>
              </div>
              {/* Initial Payment */}
              <div className="border-t border-gray-700 pt-2 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <label className="text-gray-400">Initial Payment</label>
                  <input
                    type="number"
                    min={0}
                    value={form.amountPaid}
                    onChange={e => setForm(f => ({ ...f, amountPaid: e.target.value }))}
                    placeholder={`${formatCurrency(total, currency)} (full)`}
                    className="w-44 text-right bg-gray-700 border border-gray-600 rounded-lg px-2.5 py-1.5 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
                  />
                </div>
                {form.amountPaid !== '' && parseFloat(form.amountPaid) < total && (
                  <div className="flex justify-between text-sm">
                    <span className="text-orange-400">Balance Remaining</span>
                    <span className="text-orange-400 font-mono font-medium">{formatCurrency(total - (parseFloat(form.amountPaid) || 0), currency)}</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Note (optional)</label>
              <textarea
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
              <button
                onClick={submitSale}
                disabled={form.items.length === 0}
                className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
              >
                Record Sale
              </button>
            </div>
          </div>
        </Modal>
      )}

      {reportOpen && (
        <ReportModal
          title="Sales"
          data={filteredSales}
          dateKey="date"
          columns={salesColumns}
          getSummary={getSalesSummary}
          onClose={() => setReportOpen(false)}
          state={state}
        />
      )}

      {/* ── View Sale Modal ── */}
      {modal === 'view' && currentSelected && (() => {
        const salePayments = currentSelected.payments || [];
        const totalPaid = salePayments.reduce((s, p) => s + p.amount, 0);
        const balance = (currentSelected.total || 0) - totalPaid;
        const isFullyPaid = balance <= 0.005;
        return (
          <Modal title={`Sale #${currentSelected.id}`} onClose={() => { setModal(null); setShowPayForm(false); }}>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-gray-500 text-xs mb-1">Customer</p><p className="text-white font-medium">{currentSelected.customer}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Date</p><p className="text-white">{fmtDateTime(currentSelected.date)}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Payment</p><p className="text-white">{currentSelected.payment}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Branch</p><p className="text-white">{currentSelected.branch === 'DUB' ? 'Dubai Market' : 'Kubwa Office'}</p></div>
                {currentSelected.note && <div className="col-span-2"><p className="text-gray-500 text-xs mb-1">Note</p><p className="text-white">{currentSelected.note}</p></div>}
              </div>

              <div className="bg-gray-800 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-gray-500 font-medium px-4 py-2.5 text-xs">Item</th>
                      <th className="text-center text-gray-500 font-medium px-4 py-2.5 text-xs">Qty</th>
                      <th className="text-right text-amber-600 font-medium px-4 py-2.5 text-xs">Actual Cost</th>
                      <th className="text-right text-blue-500 font-medium px-4 py-2.5 text-xs">Sale Price</th>
                      <th className="text-right text-green-600 font-medium px-4 py-2.5 text-xs">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentSelected.items?.map(item => {
                      const itemProfit = (item.price - (item.costPrice || 0)) * item.qty;
                      return (
                        <tr key={item.id} className="border-b border-gray-700 last:border-0">
                          <td className="px-4 py-2.5 text-white text-xs">{item.name}</td>
                          <td className="px-4 py-2.5 text-center text-gray-400 text-xs">{item.qty} {item.unit}</td>
                          <td className="px-4 py-2.5 text-right text-amber-300 text-xs font-mono">
                            {item.costPrice != null ? formatCurrency(item.costPrice * item.qty, currency) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right text-blue-400 text-xs font-mono">{formatCurrency(item.price * item.qty, currency)}</td>
                          <td className={`px-4 py-2.5 text-right text-xs font-mono font-medium ${itemProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {item.costPrice != null ? formatCurrency(itemProfit, currency) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Cost summary */}
              <div className="bg-gray-800 rounded-xl p-4 space-y-1.5 text-sm">
                {currentSelected.totalCost != null && (
                  <div className="flex justify-between">
                    <span className="text-amber-500">Total Actual Cost</span>
                    <span className="text-amber-300 font-mono">{formatCurrency(currentSelected.totalCost, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between"><span className="text-gray-400">Sales Revenue</span><span className="text-white font-mono">{formatCurrency(currentSelected.subtotal || 0, currency)}</span></div>
                {currentSelected.profit != null && (
                  <div className="flex justify-between font-medium">
                    <span className={currentSelected.profit >= 0 ? 'text-green-400' : 'text-red-400'}>Gross Profit</span>
                    <span className={`font-mono ${currentSelected.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(currentSelected.profit, currency)}</span>
                  </div>
                )}
                {currentSelected.vat > 0 && <div className="flex justify-between"><span className="text-gray-400">VAT</span><span className="text-white font-mono">{formatCurrency(currentSelected.vat, currency)}</span></div>}
                <div className="flex justify-between font-semibold border-t border-gray-700 pt-2"><span className="text-white">Total Charged to Customer</span><span className="text-blue-400 font-mono">{formatCurrency(currentSelected.total, currency)}</span></div>
              </div>

              {/* Payment status summary */}
              <div className="bg-gray-800 rounded-xl p-4 space-y-1.5 text-sm">
                <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-2">Payment Status</p>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Cost</span>
                  <span className="text-white font-mono">{formatCurrency(currentSelected.total || 0, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Amount Paid</span>
                  <span className="text-green-400 font-mono">{formatCurrency(totalPaid, currency)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-gray-700 pt-2">
                  <span className={isFullyPaid ? 'text-green-400' : 'text-orange-400'}>Balance Remaining</span>
                  <span className={`font-mono ${isFullyPaid ? 'text-green-400' : 'text-orange-400'}`}>
                    {isFullyPaid ? 'Fully Paid' : formatCurrency(balance, currency)}
                  </span>
                </div>
              </div>

              {/* Payment history */}
              {salePayments.length > 0 && (
                <div>
                  <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-2">Payment History</p>
                  <div className="bg-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left text-gray-500 font-medium px-4 py-2.5">Date</th>
                          <th className="text-left text-gray-500 font-medium px-4 py-2.5">Method</th>
                          <th className="text-left text-gray-500 font-medium px-4 py-2.5">Note</th>
                          <th className="text-right text-gray-500 font-medium px-4 py-2.5">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salePayments.map((p, i) => (
                          <tr key={p.id || i} className="border-b border-gray-700 last:border-0">
                            <td className="px-4 py-2.5 text-gray-300">{fmtDate(p.date)}</td>
                            <td className="px-4 py-2.5 text-gray-400">{p.method}</td>
                            <td className="px-4 py-2.5 text-gray-500">{p.note || '—'}</td>
                            <td className="px-4 py-2.5 text-right text-green-400 font-mono font-medium">{formatCurrency(p.amount, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Add subsequent payment */}
              {!isFullyPaid && (
                <div>
                  {!showPayForm ? (
                    <button
                      onClick={() => setShowPayForm(true)}
                      className="w-full flex items-center justify-center gap-2 bg-green-950 hover:bg-green-900 border border-green-800 text-green-400 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Payment — {formatCurrency(balance, currency)} remaining
                    </button>
                  ) : (
                    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
                      <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">Record New Payment</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-gray-500 text-xs block mb-1">Amount</label>
                          <input
                            type="number"
                            min={0}
                            max={balance}
                            value={payForm.amount}
                            onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                            placeholder={formatCurrency(balance, currency)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 placeholder-gray-600"
                          />
                        </div>
                        <div>
                          <label className="text-gray-500 text-xs block mb-1">Date</label>
                          <input
                            type="date"
                            value={payForm.date}
                            onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs block mb-1">Payment Method</label>
                        <div className="flex flex-wrap gap-2">
                          {PAYMENT_METHODS.map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setPayForm(f => ({ ...f, method: m }))}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${payForm.method === m ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs block mb-1">Note (optional)</label>
                        <input
                          type="text"
                          value={payForm.note}
                          onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))}
                          placeholder="e.g. Second instalment"
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 placeholder-gray-600"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setShowPayForm(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors">Cancel</button>
                        <button
                          onClick={submitPayment}
                          disabled={!payForm.amount || parseFloat(payForm.amount) <= 0}
                          className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                        >
                          Save Payment
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Action buttons ── */}
              <div className="space-y-2.5">
                {/* Print */}
                <button
                  onClick={() => printReceipt(currentSelected, state)}
                  className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                  </svg>
                  Print Receipt
                </button>

                {/* Confirm — primary action, closes modal */}
                <button
                  onClick={() => { setModal(null); setShowPayForm(false); }}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white text-sm font-bold px-4 py-3 rounded-xl transition-colors shadow-lg shadow-green-900/30"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                  </svg>
                  Confirm Transaction — Done
                </button>

                {/* Delete — destructive, smaller */}
                <button
                  onClick={() => deleteSale(currentSelected.id)}
                  className="w-full text-red-500 hover:text-red-400 text-xs font-medium py-1.5 rounded-xl transition-colors hover:bg-red-950/40"
                >
                  Delete Sale
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {deleteReq && (
        <DeleteRequestModal
          type={deleteReq.type}
          targetId={deleteReq.targetId}
          label={deleteReq.label}
          onClose={() => setDeleteReq(null)}
        />
      )}
    </div>
  );
}
