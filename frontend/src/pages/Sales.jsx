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

  const salesColumns = [
    { key: 'id',       label: 'Sale ID' },
    { key: 'date',     label: 'Date',    format: v => fmtDate(v) },
    { key: 'customer', label: 'Customer' },
    { key: 'branch',   label: 'Branch',  format: v => v === 'DUB' ? 'Dubai Market' : 'Kubwa Office' },
    { key: 'payment',  label: 'Payment' },
    { key: 'subtotal', label: 'Subtotal', align: 'tr', format: v => formatCurrency(v || 0, currency) },
    { key: 'vat',      label: 'VAT',      align: 'tr', format: v => formatCurrency(v || 0, currency) },
    { key: 'total',    label: 'Total',    align: 'tr', format: v => formatCurrency(v || 0, currency) },
  ];

  function getSalesSummary(data) {
    const totalRev = data.reduce((s, x) => s + (x.total    || 0), 0);
    const totalVat = data.reduce((s, x) => s + (x.vat      || 0), 0);
    const totalSub = data.reduce((s, x) => s + (x.subtotal || 0), 0);
    return [
      { label: 'Number of Sales',      value: data.length },
      { label: 'Total VAT Collected',  value: formatCurrency(totalVat, currency) },
      { label: 'Net Revenue (ex-VAT)', value: formatCurrency(totalSub, currency) },
      { label: 'Total Revenue',        value: formatCurrency(totalRev, currency), bold: true },
    ];
  }

  const [form, setForm] = useState({
    customer: '',
    branch: branch || 'DUB',
    payment: 'Cash',
    note: '',
    items: [],
    applyVat: false,
  });

  // Item picker state
  const [pickerItemId, setPickerItemId] = useState('');
  const [pickerQty, setPickerQty] = useState(1);
  const [pickerPrice, setPickerPrice] = useState('');

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
    const item = availableItems.find(i => i.id === id);
    setPickerPrice(item ? item.price : '');
    setPickerQty(1);
  }

  function handleAddItem() {
    if (!pickerItemId || !pickerSelected) return;
    const qty = parseInt(pickerQty) || 1;
    const price = parseFloat(pickerPrice) || pickerSelected.price;
    const existing = form.items.find(i => i.id === pickerItemId);
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
          { id: pickerSelected.id, name: pickerSelected.name, price, qty, unit: pickerSelected.unit },
        ],
      }));
    }
    setPickerItemId('');
    setPickerQty(1);
    setPickerPrice('');
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

  const subtotal  = form.items.reduce((s, i) => s + i.price * i.qty, 0);
  const vatAmount = form.applyVat ? subtotal * vat : 0;
  const total     = subtotal + vatAmount;

  function submitSale() {
    if (form.items.length === 0) return;
    const sale = {
      id: genId('S'),
      customer: form.customer || 'Walk-in',
      branch: form.branch,
      payment: form.payment,
      note: form.note,
      items: form.items,
      subtotal,
      vat: vatAmount,
      total,
      date: new Date().toISOString(),
      createdBy: user?.name,
    };
    dispatch({ type: 'ADD_SALE', payload: sale });
    setForm({ customer: '', branch: branch || 'DUB', payment: 'Cash', note: '', items: [], applyVat: false });
    setPickerItemId(''); setPickerQty(1); setPickerPrice('');
    // Open receipt view automatically
    setSelected(sale);
    setModal('view');
  }

  function openView(sale) { setSelected(sale); setModal('view'); }

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
              setForm({ customer: '', branch: branch || 'DUB', payment: 'Cash', note: '', items: [], applyVat: false });
              setPickerItemId(''); setPickerQty(1); setPickerPrice('');
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
                <th className="text-right text-gray-500 font-medium px-5 py-3">Total</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-gray-600 py-12">No sales found</td></tr>
              ) : filteredSales.map(s => (
                <tr key={s.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-gray-400 text-xs">{s.id}</td>
                  <td className="px-5 py-3.5 text-white font-medium">{s.customer}</td>
                  <td className="px-5 py-3.5 text-gray-400">{fmtDate(s.date)}</td>
                  <td className="px-5 py-3.5">
                    <span className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-lg">{s.payment}</span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-400">{s.items?.length || 0}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-blue-400 font-medium">{formatCurrency(s.total, currency)}</td>
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
                <div className="w-32">
                  <label className="text-gray-500 text-xs block mb-1">Unit Price (₦)</label>
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
                  disabled={!pickerItemId}
                  className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Item
                </button>
              </div>

              {/* Selected item hint */}
              {pickerSelected && (
                <p className="text-gray-500 text-xs">
                  {pickerSelected.name} · {pickerSelected.category} · Stock: {pickerSelected.qty} {pickerSelected.unit} · Default price: {formatCurrency(pickerSelected.price, currency)}
                </p>
              )}
            </div>

            {/* Items table */}
            {form.items.length > 0 && (
              <div className="bg-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-gray-500 font-medium px-4 py-2.5 text-xs">Item</th>
                      <th className="text-center text-gray-500 font-medium px-4 py-2.5 text-xs">Qty</th>
                      <th className="text-right text-gray-500 font-medium px-4 py-2.5 text-xs">Unit Price</th>
                      <th className="text-right text-gray-500 font-medium px-4 py-2.5 text-xs">Subtotal</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map(item => (
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
                            value={item.price}
                            onChange={e => updateItemPrice(item.id, e.target.value)}
                            className="w-28 text-right bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right text-blue-400 text-xs font-mono">
                          {formatCurrency(item.price * item.qty, currency)}
                        </td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => removeItem(item.id)} className="text-gray-600 hover:text-red-400">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="bg-gray-800 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-white font-mono">{formatCurrency(subtotal, currency)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
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
                <span className="text-white">Total</span>
                <span className="text-blue-400 font-mono text-base">{formatCurrency(total, currency)}</span>
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
      {modal === 'view' && selected && (
        <Modal title={`Sale #${selected.id}`} onClose={() => setModal(null)}>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-gray-500 text-xs mb-1">Customer</p><p className="text-white font-medium">{selected.customer}</p></div>
              <div><p className="text-gray-500 text-xs mb-1">Date</p><p className="text-white">{fmtDateTime(selected.date)}</p></div>
              <div><p className="text-gray-500 text-xs mb-1">Payment</p><p className="text-white">{selected.payment}</p></div>
              <div><p className="text-gray-500 text-xs mb-1">Branch</p><p className="text-white">{selected.branch === 'DUB' ? 'Dubai Market' : 'Kubwa Office'}</p></div>
              {selected.note && <div className="col-span-2"><p className="text-gray-500 text-xs mb-1">Note</p><p className="text-white">{selected.note}</p></div>}
            </div>

            <div className="bg-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left text-gray-500 font-medium px-4 py-2.5 text-xs">Item</th>
                    <th className="text-center text-gray-500 font-medium px-4 py-2.5 text-xs">Qty</th>
                    <th className="text-right text-gray-500 font-medium px-4 py-2.5 text-xs">Unit Price</th>
                    <th className="text-right text-gray-500 font-medium px-4 py-2.5 text-xs">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items?.map(item => (
                    <tr key={item.id} className="border-b border-gray-700 last:border-0">
                      <td className="px-4 py-2.5 text-white text-xs">{item.name}</td>
                      <td className="px-4 py-2.5 text-center text-gray-400 text-xs">{item.qty} {item.unit}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400 text-xs font-mono">{formatCurrency(item.price, currency)}</td>
                      <td className="px-4 py-2.5 text-right text-blue-400 text-xs font-mono">{formatCurrency(item.price * item.qty, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Subtotal</span><span className="text-white font-mono">{formatCurrency(selected.subtotal || 0, currency)}</span></div>
              {selected.vat > 0 && <div className="flex justify-between"><span className="text-gray-400">VAT</span><span className="text-white font-mono">{formatCurrency(selected.vat, currency)}</span></div>}
              <div className="flex justify-between font-semibold border-t border-gray-700 pt-2"><span className="text-white">Total</span><span className="text-blue-400 font-mono">{formatCurrency(selected.total, currency)}</span></div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => printReceipt(selected, state)}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                </svg>
                Print Receipt
              </button>
              <button onClick={() => deleteSale(selected.id)} className="flex-1 bg-red-950 hover:bg-red-900 text-red-400 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
                Delete Sale
              </button>
            </div>
          </div>
        </Modal>
      )}

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
