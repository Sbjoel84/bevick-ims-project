import { useState, useEffect } from 'react';
import { useApp, formatCurrency, fmtDate, fmtDateTime, genId } from '../context/AppContext';
import { refreshGoodsReceived, refreshInventory, refreshPurchaseList, refreshBookings } from '../lib/refresh';
import ReportModal from '../components/ReportModal';

const BRANCHES = [{ id: 'DUB', label: 'Dubai Market' }, { id: 'KUB', label: 'Kubwa Office' }];

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="font-syne font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function Goods() {
  const { state, dispatch } = useApp();
  const { goodsReceived, inventory, suppliers, currency, branch, bname, user } = state;

  useEffect(() => {
    refreshGoodsReceived(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'goodsReceived', data } }));
    refreshInventory(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'inventory', data } }));
    refreshPurchaseList(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'purchaseList', data } }));
    refreshBookings(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'bookings', data } }));
  }, []);

  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [reportOpen, setReportOpen] = useState(false);

  const grnColumns = [
    { key: 'id',        label: 'GRN #' },
    { key: 'date',      label: 'Date',     format: v => fmtDate(v) },
    { key: 'supplier',  label: 'Supplier' },
    { key: 'branch',    label: 'Branch',   format: v => v === 'DUB' ? 'Dubai Market' : 'Kubwa Office' },
    { key: 'invoiceNo', label: 'Invoice #' },
    { key: 'items',     label: 'Items',    align: 'tc', format: v => v?.length || 0 },
    { key: 'totalCost', label: 'Total Cost', align: 'tr', format: v => formatCurrency(v || 0, currency) },
    { key: 'receivedBy',label: 'Received By' },
  ];

  function getGRNSummary(data) {
    const total = data.reduce((s, g) => s + (g.totalCost || 0), 0);
    return [
      { label: 'Total GRNs',       value: data.length },
      { label: 'Total Value Received', value: formatCurrency(total, currency), bold: true },
    ];
  }

  // GRN Form
  const [form, setForm] = useState({ supplier: '', branch: branch || 'DUB', invoiceNo: '', date: new Date().toISOString().slice(0,10), note: '', items: [] });
  const [supplierMode, setSupplierMode] = useState('select');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [itemDropdown, setItemDropdown] = useState(false);

  function addNewSupplier() {
    const name = newSupplierName.trim();
    if (!name) return;
    dispatch({ type: 'ADD_SUPPLIER', payload: { id: genId('SUP'), name, status: 'active' } });
    setForm(f => ({ ...f, supplier: name }));
    setSupplierMode('select');
    setNewSupplierName('');
  }

  function closeGRNModal() {
    setModal(null);
    setForm({ supplier: '', branch: branch || 'DUB', invoiceNo: '', date: new Date().toISOString().slice(0,10), note: '', items: [] });
    setSupplierMode('select');
    setNewSupplierName('');
  }

  const filtered = goodsReceived
    .filter(g => branch ? g.branch === branch : true)
    .filter(g => {
      const q = search.toLowerCase();
      return !q || g.supplier?.toLowerCase().includes(q) || g.id?.toLowerCase().includes(q) || g.invoiceNo?.toLowerCase().includes(q);
    });

  const availableItems = inventory.filter(i =>
    itemSearch === '' || i.name.toLowerCase().includes(itemSearch.toLowerCase())
  );

  function addItem(item) {
    const existing = form.items.find(i => i.id === item.id);
    if (existing) {
      setForm(f => ({ ...f, items: f.items.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i) }));
    } else {
      setForm(f => ({ ...f, items: [...f.items, { id: item.id, name: item.name, qty: 1, unit: item.unit, unitCost: item.price }] }));
    }
    setItemSearch('');
    setItemDropdown(false);
  }

  const totalCost = form.items.reduce((s, i) => s + i.qty * (i.unitCost || 0), 0);

  function submit() {
    if (form.items.length === 0) return;
    dispatch({
      type: 'RECEIVE_GOODS',
      payload: {
        id: genId('GRN'),
        supplier: form.supplier,
        branch: branch || form.branch,
        invoiceNo: form.invoiceNo,
        date: form.date || new Date().toISOString(),
        note: form.note,
        items: form.items,
        totalCost,
        receivedBy: user?.name,
        createdAt: new Date().toISOString(),
      },
    });
    setModal(null);
    setForm({ supplier: '', branch: branch || 'DUB', invoiceNo: '', date: new Date().toISOString().slice(0,10), note: '', items: [] });
    setSupplierMode('select');
    setNewSupplierName('');
  }

  function openEditModal(grn) {
    setSelected(grn);
    setForm({
      supplier: grn.supplier || '',
      branch: grn.branch || branch || 'DUB',
      invoiceNo: grn.invoiceNo || '',
      date: grn.date ? grn.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      note: grn.note || '',
      items: grn.items ? grn.items.map(i => ({ ...i })) : [],
    });
    setSupplierMode('select');
    setNewSupplierName('');
    setModal('edit');
  }

  function submitEdit() {
    if (form.items.length === 0) return;
    const editTotalCost = form.items.reduce((s, i) => s + i.qty * (i.unitCost || 0), 0);
    const updated = {
      ...selected,
      supplier: form.supplier,
      branch: branch || form.branch,
      invoiceNo: form.invoiceNo,
      date: form.date || selected.date,
      note: form.note,
      items: form.items,
      totalCost: editTotalCost,
    };
    dispatch({ type: 'UPDATE_GRN', payload: { updated, original: selected } });
    setModal(null);
    setSelected(null);
    setForm({ supplier: '', branch: branch || 'DUB', invoiceNo: '', date: new Date().toISOString().slice(0,10), note: '', items: [] });
    setSupplierMode('select');
    setNewSupplierName('');
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Goods Received</h1>
          <p className="text-gray-500 text-sm mt-0.5">{bname}</p>
        </div>
        <button
          onClick={() => { setForm({ supplier: '', branch: branch || 'DUB', invoiceNo: '', date: new Date().toISOString().slice(0,10), note: '', items: [] }); setSupplierMode('select'); setNewSupplierName(''); setModal('new'); }}
          className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          Receive Goods
        </button>
        <button
          onClick={() => setReportOpen(true)}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          Report
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0">
          <p className="text-gray-500 text-xs font-medium mb-1">Total GRNs</p>
          <p className="font-syne text-sm sm:text-xl md:text-2xl font-bold text-white">{filtered.length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0">
          <p className="text-gray-500 text-xs font-medium mb-1">Total Value Received</p>
          <p className="font-syne text-xs sm:text-sm md:text-xl font-bold text-white break-all">{formatCurrency(filtered.reduce((s, g) => s + (g.totalCost || 0), 0), currency)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0">
          <p className="text-gray-500 text-xs font-medium mb-1">This Month</p>
          <p className="font-syne text-sm sm:text-xl md:text-2xl font-bold text-white">{filtered.filter(g => new Date(g.createdAt).getMonth() === new Date().getMonth()).length}</p>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search by supplier, GRN ID or invoice…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-80"
      />

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 font-medium px-5 py-3">GRN ID</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Supplier</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Invoice No.</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Date</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Items</th>
                <th className="text-right text-gray-500 font-medium px-5 py-3">Total Cost</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Received By</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-gray-600 py-12">No goods receipts found</td></tr>
              ) : filtered.map(g => (
                <tr key={g.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-gray-400 text-xs">{g.id}</td>
                  <td className="px-5 py-3.5 text-white font-medium">{g.supplier || '—'}</td>
                  <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">{g.invoiceNo || '—'}</td>
                  <td className="px-5 py-3.5 text-gray-400">{fmtDate(g.date || g.createdAt)}</td>
                  <td className="px-5 py-3.5 text-gray-400">{g.items?.length || 0}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-blue-400">{formatCurrency(g.totalCost || 0, currency)}</td>
                  <td className="px-5 py-3.5 text-gray-400">{g.receivedBy || '—'}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEditModal(g)} className="text-gray-500 hover:text-blue-400 transition-colors" title="Edit GRN">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <button onClick={() => { setSelected(g); setModal('view'); }} className="text-gray-500 hover:text-white transition-colors" title="View GRN">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New GRN Modal */}
      {modal === 'new' && (
        <Modal title="Receive Goods (New GRN)" onClose={closeGRNModal}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Supplier</label>
                {supplierMode === 'add' ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="New supplier name…"
                      value={newSupplierName}
                      onChange={e => setNewSupplierName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addNewSupplier()}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <button type="button" onClick={addNewSupplier} className="bg-blue-500 hover:bg-blue-400 text-white text-xs font-semibold px-3 rounded-lg transition-colors">Save</button>
                    <button type="button" onClick={() => { setSupplierMode('select'); setNewSupplierName(''); }} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 rounded-lg transition-colors">✕</button>
                  </div>
                ) : (
                  <select
                    value={form.supplier}
                    onChange={e => {
                      if (e.target.value === '__add__') {
                        setSupplierMode('add');
                      } else {
                        setForm(f => ({ ...f, supplier: e.target.value }));
                      }
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select supplier —</option>
                    {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    <option value="__add__">+ Add new supplier…</option>
                  </select>
                )}
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Invoice No.</label>
                <input type="text" value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Branch</label>
                <select value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value, items: [] }))} disabled={!!branch} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                  {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Add Items <span className="text-red-400">*</span></label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search inventory…"
                  value={itemSearch}
                  onChange={e => { setItemSearch(e.target.value); setItemDropdown(true); }}
                  onFocus={() => setItemDropdown(true)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {itemDropdown && itemSearch && availableItems.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl mt-1 z-10 max-h-48 overflow-y-auto">
                    {availableItems.slice(0, 8).map(item => (
                      <button key={item.id} type="button" onClick={() => addItem(item)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-700 text-left transition-colors">
                        <span className="text-white text-sm truncate">{item.name}</span>
                        <span className="text-gray-400 text-xs ml-2 shrink-0">{item.qty} {item.unit} in stock</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {form.items.length > 0 && (
              <div className="bg-gray-800 rounded-xl divide-y divide-gray-700">
                {form.items.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-white text-xs flex-1 truncate">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs">Qty:</span>
                      <input
                        type="number"
                        min={1}
                        value={item.qty}
                        onChange={e => setForm(f => ({ ...f, items: f.items.map(i => i.id === item.id ? { ...i, qty: parseInt(e.target.value) || 1 } : i) }))}
                        className="w-14 text-center bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-white text-xs focus:outline-none"
                      />
                      <span className="text-gray-500 text-xs">Cost:</span>
                      <input
                        type="number"
                        min={0}
                        value={item.unitCost}
                        onChange={e => setForm(f => ({ ...f, items: f.items.map(i => i.id === item.id ? { ...i, unitCost: parseFloat(e.target.value) || 0 } : i) }))}
                        className="w-24 text-right bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-white text-xs focus:outline-none"
                      />
                      <button onClick={() => setForm(f => ({ ...f, items: f.items.filter(i => i.id !== item.id) }))} className="text-gray-600 hover:text-red-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-2.5 text-xs">
                  <span className="text-gray-400">Total Cost</span>
                  <span className="text-blue-400 font-mono">{formatCurrency(totalCost, currency)}</span>
                </div>
              </div>
            )}
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Note</label>
              <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={closeGRNModal} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
              <button onClick={submit} disabled={form.items.length === 0} className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">Confirm Receipt</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit GRN Modal */}
      {modal === 'edit' && selected && (
        <Modal title={`Edit GRN #${selected.id}`} onClose={() => { setModal(null); setSelected(null); }}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Supplier</label>
                {supplierMode === 'add' ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="New supplier name…"
                      value={newSupplierName}
                      onChange={e => setNewSupplierName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addNewSupplier()}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <button type="button" onClick={addNewSupplier} className="bg-blue-500 hover:bg-blue-400 text-white text-xs font-semibold px-3 rounded-lg transition-colors">Save</button>
                    <button type="button" onClick={() => { setSupplierMode('select'); setNewSupplierName(''); }} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 rounded-lg transition-colors">✕</button>
                  </div>
                ) : (
                  <select
                    value={form.supplier}
                    onChange={e => {
                      if (e.target.value === '__add__') { setSupplierMode('add'); }
                      else { setForm(f => ({ ...f, supplier: e.target.value })); }
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select supplier —</option>
                    {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    <option value="__add__">+ Add new supplier…</option>
                  </select>
                )}
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Invoice No.</label>
                <input type="text" value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Branch</label>
                <select value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} disabled={!!branch} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                  {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Items <span className="text-red-400">*</span></label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search inventory to add items…"
                  value={itemSearch}
                  onChange={e => { setItemSearch(e.target.value); setItemDropdown(true); }}
                  onFocus={() => setItemDropdown(true)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {itemDropdown && itemSearch && availableItems.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl mt-1 z-10 max-h-48 overflow-y-auto">
                    {availableItems.slice(0, 8).map(item => (
                      <button key={item.id} type="button" onClick={() => addItem(item)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-700 text-left transition-colors">
                        <span className="text-white text-sm truncate">{item.name}</span>
                        <span className="text-gray-400 text-xs ml-2 shrink-0">{item.qty} {item.unit} in stock</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {form.items.length > 0 && (
              <div className="bg-gray-800 rounded-xl divide-y divide-gray-700">
                {form.items.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-white text-xs flex-1 truncate">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs">Qty:</span>
                      <input
                        type="number"
                        min={1}
                        value={item.qty}
                        onChange={e => setForm(f => ({ ...f, items: f.items.map(i => i.id === item.id ? { ...i, qty: parseInt(e.target.value) || 1 } : i) }))}
                        className="w-14 text-center bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-white text-xs focus:outline-none"
                      />
                      <span className="text-gray-500 text-xs">Cost:</span>
                      <input
                        type="number"
                        min={0}
                        value={item.unitCost}
                        onChange={e => setForm(f => ({ ...f, items: f.items.map(i => i.id === item.id ? { ...i, unitCost: parseFloat(e.target.value) || 0 } : i) }))}
                        className="w-24 text-right bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-white text-xs focus:outline-none"
                      />
                      <button onClick={() => setForm(f => ({ ...f, items: f.items.filter(i => i.id !== item.id) }))} className="text-gray-600 hover:text-red-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-2.5 text-xs">
                  <span className="text-gray-400">Total Cost</span>
                  <span className="text-blue-400 font-mono">{formatCurrency(form.items.reduce((s, i) => s + i.qty * (i.unitCost || 0), 0), currency)}</span>
                </div>
              </div>
            )}
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Note</label>
              <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setModal(null); setSelected(null); }} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
              <button onClick={submitEdit} disabled={form.items.length === 0} className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">Save Changes</button>
            </div>
          </div>
        </Modal>
      )}

      {/* View GRN Modal */}
      {modal === 'view' && selected && (
        <Modal title={`GRN #${selected.id}`} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-gray-500 text-xs mb-1">Supplier</p><p className="text-white">{selected.supplier || '—'}</p></div>
              <div><p className="text-gray-500 text-xs mb-1">Invoice No.</p><p className="text-white font-mono">{selected.invoiceNo || '—'}</p></div>
              <div><p className="text-gray-500 text-xs mb-1">Date</p><p className="text-white">{fmtDate(selected.date || selected.createdAt)}</p></div>
              <div><p className="text-gray-500 text-xs mb-1">Received By</p><p className="text-white">{selected.receivedBy || '—'}</p></div>
            </div>
            <div className="bg-gray-800 rounded-xl divide-y divide-gray-700 text-sm">
              <div className="grid grid-cols-4 px-4 py-2 text-gray-500 text-xs font-medium">
                <span className="col-span-2">Item</span><span className="text-center">Qty</span><span className="text-right">Unit Cost</span>
              </div>
              {selected.items?.map(item => (
                <div key={item.id} className="grid grid-cols-4 px-4 py-2.5">
                  <span className="text-white col-span-2 truncate">{item.name}</span>
                  <span className="text-gray-400 text-center text-xs">{item.qty} {item.unit}</span>
                  <span className="text-gray-400 text-right text-xs font-mono">{item.unitCost ? formatCurrency(item.unitCost, currency) : '—'}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-2.5 font-medium">
                <span className="text-gray-400">Total Cost</span>
                <span className="text-blue-400 font-mono">{formatCurrency(selected.totalCost || 0, currency)}</span>
              </div>
            </div>
            {selected.note && <div className="bg-gray-800 rounded-xl p-4 text-sm"><p className="text-gray-500 text-xs mb-1">Note</p><p className="text-white">{selected.note}</p></div>}
          </div>
        </Modal>
      )}

      {reportOpen && (
        <ReportModal
          title="Goods Received"
          data={filtered}
          dateKey="date"
          columns={grnColumns}
          getSummary={getGRNSummary}
          onClose={() => setReportOpen(false)}
          state={state}
        />
      )}
    </div>
  );
}
