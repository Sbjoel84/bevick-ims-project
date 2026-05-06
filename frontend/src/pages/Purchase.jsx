import { useState, useEffect } from 'react';
import { useApp, formatCurrency, fmtDate, genId } from '../context/AppContext';
import { refreshPurchaseList, refreshInventory, refreshSuppliers } from '../lib/refresh';
import ReportModal from '../components/ReportModal';
import DeleteRequestModal from '../components/DeleteRequestModal';

const STATUSES = ['pending', 'ordered', 'received', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const CATEGORIES = ['Machinery', 'Spare Parts', 'Chemicals', 'Safety', 'Others'];

const STATUS_COLORS = {
  pending:   'bg-amber-950 text-amber-400',
  ordered:   'bg-blue-950 text-blue-400',
  received:  'bg-blue-950 text-blue-400',
  cancelled: 'bg-gray-800 text-gray-500',
};
const PRIORITY_COLORS = {
  low:    'bg-gray-800 text-gray-400',
  medium: 'bg-blue-950 text-blue-400',
  high:   'bg-amber-950 text-amber-400',
  urgent: 'bg-red-950 text-red-400',
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
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

const BRANCHES = [{ id: 'DUB', label: 'Dubai Market' }, { id: 'KUB', label: 'Kubwa Office' }];
const EMPTY = { name: '', category: 'Spare Parts', qty: '', unit: 'Pcs', estimatedCost: '', supplier: '', priority: 'medium', note: '', branch: 'DUB' };

export default function Purchase() {
  const { state, dispatch } = useApp();
  const { purchaseList, suppliers, currency, bname, user, branch, inventory, bookings } = state;

  // Compute items in active bookings that exceed available stock and have no pending/ordered purchase yet
  // Admin (super_admin/admin) sees all branches, non-admin sees only their assigned branch
  const userBranch = user?.bid;
  const canEditAll = user?.role === 'super_admin' || user?.role === 'admin';
  
  // Filter bookings based on user role - admin sees all, non-admin sees only their branch
  const visibleBookings = bookings.filter(b => {
    if (canEditAll) return true; // Admin sees all
    return b.branch === userBranch; // Non-admin sees only their branch
  });

  const existingPurchaseKeys = new Set(
    purchaseList
      .filter(p => p.status === 'pending' || p.status === 'ordered')
      .map(p => p.itemId || p.name?.toLowerCase())
  );
  const unseenKeys = new Set();
  const missingItems = [];
  visibleBookings
    .filter(b => b.status === 'pending' || b.status === 'confirmed')
    .forEach(b => {
      (b.items || []).forEach(item => {
        if (!item.id || !item.name) return;
        if (unseenKeys.has(item.id) || existingPurchaseKeys.has(item.id)) return;
        
        // Find inventory for the same branch as the booking
        const invItem = inventory.find(i => i.id === item.id && i.branch === b.branch);
        const currentQty = invItem ? (invItem.qty || 0) : 0;
        if (currentQty < (item.qty || 1)) {
          unseenKeys.add(item.id);
          missingItems.push({ 
            name: item.name, 
            booked: item.qty || 1, 
            inStock: currentQty,
            branch: b.branch,
            branchLabel: b.branch === 'DUB' ? 'Dubai' : 'Kubwa'
          });
        }
      });
    });

  useEffect(() => {
    refreshPurchaseList(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'purchaseList', data } }));
    refreshInventory(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'inventory', data } }));
    refreshSuppliers(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'suppliers', data } }));
  }, []);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [customItem, setCustomItem] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteReq, setDeleteReq] = useState(null);

  const purchaseColumns = [
    { key: 'date',     label: 'Date',     format: v => fmtDate(v) },
    { key: 'name',     label: 'Item' },
    { key: 'qty',      label: 'Qty',      align: 'tc' },
    { key: 'unit',     label: 'Unit',     align: 'tc' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'priority', label: 'Priority' },
    { key: 'status',   label: 'Status' },
  ];

  function getPurchaseSummary(data) {
    const total = data.filter(p => p.status !== 'cancelled').reduce((s, p) => s + (p.estimatedCost || 0), 0);
    return [
      { label: 'Total Requests', value: data.length },
      { label: 'Pending',        value: data.filter(p => p.status === 'pending').length },
      { label: 'Ordered',        value: data.filter(p => p.status === 'ordered').length },
      { label: 'Est. Total Cost',value: formatCurrency(total, currency), bold: true },
    ];
  }

  const filtered = purchaseList
    .filter(p => {
      // Admin sees all branches, non-admin sees only their branch
      if (canEditAll) return true;
      return !p.branch || p.branch === userBranch;
    })
    .filter(p => filterStatus === 'all' || p.status === filterStatus)
    .filter(p => filterPriority === 'all' || p.priority === filterPriority)
    .filter(p => {
      const q = search.toLowerCase();
      return !q || p.name?.toLowerCase().includes(q) || p.supplier?.toLowerCase().includes(q);
    });

  function submit() {
    if (!form.name.trim()) return;
    dispatch({
      type: 'ADD_PURCHASE',
      payload: {
        id: genId('P'),
        ...form,
        branch: branch || form.branch,
        qty: parseFloat(form.qty) || 1,
        estimatedCost: parseFloat(form.estimatedCost) || 0,
        status: 'pending',
        date: new Date().toISOString(),
        createdBy: user?.name,
      },
    });
    setModal(false);
    setForm(EMPTY);
    setCustomItem(false);
  }

  function updateStatus(id, status) {
    dispatch({ type: 'UPDATE_PURCHASE_STATUS', payload: { id, status } });
  }

  function del(id) {
    if (user?.role === 'super_admin') {
      if (window.confirm('Remove this purchase request?')) {
        dispatch({ type: 'DELETE_PURCHASE', payload: id });
      }
    } else {
      const p = purchaseList.find(x => x.id === id);
      setDeleteReq({ type: 'purchase', targetId: id, label: p?.name || id });
    }
  }

  const totalEstimated = filtered.filter(p => p.status !== 'cancelled').reduce((s, p) => s + (p.estimatedCost || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Purchase List</h1>
          <p className="text-gray-500 text-sm mt-0.5">{bname}</p>
        </div>
        <div className="flex items-center gap-2">
          {missingItems.length > 0 && (
            <button
              onClick={() => dispatch({ type: 'SYNC_PURCHASES_FROM_BOOKINGS' })}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
              title="Generate purchase orders for booked items not available in stock"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              Generate from Bookings
              <span className="bg-black/20 text-black text-xs font-bold rounded-full px-1.5 py-0.5">{missingItems.length}</span>
            </button>
          )}
          <button
            onClick={() => { setForm({ ...EMPTY, branch: branch || 'DUB' }); setCustomItem(false); setModal(true); }}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            Add Request
          </button>
        </div>
        <button
          onClick={() => setReportOpen(true)}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          Report
        </button>
      </div>

      {/* Banner: items from bookings needing purchase */}
      {missingItems.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <div className="flex-1 min-w-0">
            <p className="text-amber-400 font-semibold text-sm">
              {missingItems.length} booked item{missingItems.length > 1 ? 's' : ''} not available in stock
              {!canEditAll && <span className="ml-2 text-amber-400/70">({userBranch === 'DUB' ? 'Dubai' : 'Kubwa'} branch)</span>}
            </p>
            <p className="text-amber-400/70 text-xs mt-0.5 truncate">
              {missingItems.map(i => `${i.name} (need ${i.booked - i.inStock}, have ${i.inStock} @ ${i.branchLabel})`).join(' · ')}
            </p>
          </div>
          <button
            onClick={() => dispatch({ type: 'SYNC_PURCHASES_FROM_BOOKINGS' })}
            className="shrink-0 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
          >
            Generate Orders
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Requests', value: filtered.length, color: 'text-white' },
          { label: 'Pending', value: filtered.filter(p => p.status === 'pending').length, color: 'text-amber-400' },
          { label: 'Ordered', value: filtered.filter(p => p.status === 'ordered').length, color: 'text-blue-400' },
          { label: 'Est. Cost', value: formatCurrency(totalEstimated, currency), color: 'text-red-400', small: true },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0">
            <p className="text-gray-500 text-xs font-medium mb-1">{s.label}</p>
            <p className={`font-syne font-bold break-all ${s.small ? 'text-xs sm:text-sm md:text-lg' : 'text-sm sm:text-lg md:text-2xl'} ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search requests…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 font-medium px-5 py-3">Item</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Category</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Qty</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Supplier</th>
                <th className="text-right text-gray-500 font-medium px-5 py-3">Est. Cost</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Priority</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-gray-600 py-12">No purchase requests found</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-white font-medium">{p.name}</p>
                    {p.note && <p className="text-gray-500 text-xs mt-0.5 truncate max-w-[180px]">{p.note}</p>}
                  </td>
                  <td className="px-5 py-3.5"><span className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-lg">{p.category}</span></td>
                  <td className="px-5 py-3.5 text-white font-mono">{p.qty} <span className="text-gray-500 text-xs">{p.unit}</span></td>
                  <td className="px-5 py-3.5 text-gray-400">{p.supplier || '—'}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-gray-300">{p.estimatedCost ? formatCurrency(p.estimatedCost, currency) : '—'}</td>
                  <td className="px-5 py-3.5"><span className={`text-xs px-2 py-0.5 rounded-lg capitalize font-medium ${PRIORITY_COLORS[p.priority]}`}>{p.priority}</span></td>
                  <td className="px-5 py-3.5">
                    <select
                      value={p.status}
                      onChange={e => updateStatus(p.id, e.target.value)}
                      className={`text-xs px-2 py-1 rounded-lg border-0 outline-none cursor-pointer capitalize font-medium ${STATUS_COLORS[p.status] || 'bg-gray-800 text-gray-400'}`}
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3.5">
                    <button onClick={() => del(p.id)} className="text-gray-500 hover:text-red-400 transition-colors float-right">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title="Purchase Request" onClose={() => { setModal(false); setCustomItem(false); setForm(EMPTY); }}>
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Item Name <span className="text-red-400">*</span></label>
              <select
                value={customItem ? '__custom__' : (form.name || '')}
                onChange={e => {
                  if (e.target.value === '__custom__') {
                    setCustomItem(true);
                    setForm(f => ({ ...f, name: '' }));
                  } else {
                    setCustomItem(false);
                    setForm(f => ({ ...f, name: e.target.value }));
                  }
                }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>Select an item…</option>
                {inventory
                  .filter(i => canEditAll || !i.branch || i.branch === userBranch)
                  .map(i => <option key={i.id} value={i.name}>{i.name} ({i.branch === 'DUB' ? 'Dubai' : 'Kubwa'})</option>)
                }
                <option value="__custom__">+ Add item not on list</option>
              </select>
              {customItem && (
                <input
                  type="text"
                  placeholder="Enter item name…"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-2 w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Priority</label>
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Quantity</label>
                <input type="number" min={1} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Unit</label>
                <input type="text" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Est. Cost</label>
                <input type="number" min={0} value={form.estimatedCost} onChange={e => setForm(f => ({ ...f, estimatedCost: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Branch</label>
              <select
                value={form.branch}
                onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
                disabled={!canEditAll}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
              {!canEditAll && <p className="text-gray-500 text-xs mt-1">You can only create purchase requests for your branch</p>}
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Supplier (optional)</label>
              <input type="text" list="supplier-list" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              <datalist id="supplier-list">
                {suppliers.map(s => <option key={s.id} value={s.name}/>)}
              </datalist>
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Note</label>
              <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setModal(false); setCustomItem(false); setForm(EMPTY); }} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
              <button onClick={submit} disabled={!form.name.trim()} className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">Add Request</button>
            </div>
          </div>
        </Modal>
      )}

      {reportOpen && (
        <ReportModal
          title="Purchase List"
          data={filtered}
          dateKey="date"
          columns={purchaseColumns}
          getSummary={getPurchaseSummary}
          onClose={() => setReportOpen(false)}
          state={state}
        />
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
