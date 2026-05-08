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

  // Items from active bookings that exceed current branch stock and have no pending/ordered PO yet
  const existingPOKeys = new Set(
    purchaseList
      .filter(p => p.status === 'pending' || p.status === 'ordered')
      .map(p => p.itemId)
  );
  const orderableItems = (() => {
    const seen = new Set();
    const items = [];
    visibleBookings
      .filter(b => b.status === 'pending' || b.status === 'confirmed')
      .forEach(b => {
        (b.items || []).forEach(item => {
          if (!item.id || !item.name) return;
          if (seen.has(item.id) || existingPOKeys.has(item.id)) return;
          const invItem = inventory.find(i => i.id === item.id && i.branch === b.branch);
          const currentQty = invItem ? (invItem.qty || 0) : 0;
          if (currentQty < (item.qty || 1)) {
            seen.add(item.id);
            const needed = (item.qty || 1) - currentQty;
            items.push({
              itemId: item.id,
              name: item.name,
              needed,
              inStock: currentQty,
              unit: item.unit || invItem?.unit || '',
              bookingId: b.id,
              customer: b.customer,
              branch: b.branch,
              category: invItem?.category || 'Others',
              estimatedCost: (invItem?.price || 0) * needed,
            });
          }
        });
      });
    return items;
  })();

  // Aggregate booked items (pending/confirmed) by normalised name+branch.
  // Grouping by name (not id) ensures all bookings for the same item are merged
  // even when different booking records carry different ids or no id at all.
  const bookedNotInStock = (() => {
    const map = new Map();
    visibleBookings
      .filter(b => b.status === 'pending' || b.status === 'confirmed')
      .forEach(b => {
        (b.items || []).forEach(item => {
          if (!item.name) return;
          const normName = item.name.toLowerCase().trim();
          const key = `${normName}::${b.branch}`;
          if (!map.has(key)) {
            const invItem = inventory.find(
              i => i.name.toLowerCase().trim() === normName && i.branch === b.branch
            );
            const inStock = invItem ? (invItem.qty || 0) : 0;
            map.set(key, {
              name: item.name,
              itemId: item.id || invItem?.id || null,
              totalBooked: 0,
              inStock,
              unit: item.unit || invItem?.unit || '',
              branch: b.branch,
              branchLabel: b.branch === 'DUB' ? 'Dubai' : 'Kubwa',
              hasPO: existingPurchaseKeys.has(item.id) || existingPurchaseKeys.has(normName),
            });
          }
          map.get(key).totalBooked += (item.qty || 1);
        });
      });
    return [...map.values()]
      .filter(i => i.totalBooked > i.inStock)
      .map(i => ({ ...i, needed: i.totalBooked - i.inStock }));
  })();

  const [activeTab, setActiveTab] = useState('purchase');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [selectedOrderable, setSelectedOrderable] = useState('');
  const [itemNameSearch, setItemNameSearch] = useState('');
  const [itemNameDropdown, setItemNameDropdown] = useState(false);
  const [search, setSearch] = useState('');
  const [bookedSearch, setBookedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteReq, setDeleteReq] = useState(null);

  const filteredInvItems = inventory.filter(i =>
    !itemNameSearch || i.name.toLowerCase().includes(itemNameSearch.toLowerCase())
  );

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
    setSelectedOrderable('');
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

  const filteredBookedNotInStock = bookedNotInStock.filter(item => {
    const q = bookedSearch.toLowerCase();
    return !q || item.name?.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Purchase List</h1>
          <p className="text-gray-500 text-sm mt-0.5">{bname}</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'purchase' && missingItems.length > 0 && (
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
          {activeTab === 'purchase' && (
            <button
              onClick={() => { setForm({ ...EMPTY, branch: branch || 'DUB' }); setSelectedOrderable(''); setModal(true); }}
              className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
              Add Request
            </button>
          )}
        </div>
        <button
          onClick={() => setReportOpen(true)}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          Report
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-2xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('purchase')}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'purchase' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          Purchase List
          <span className={`text-xs font-bold rounded-full px-1.5 py-0.5 ${activeTab === 'purchase' ? 'bg-white/20 text-white' : 'bg-gray-800 text-gray-400'}`}>{filtered.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('booked_needed')}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'booked_needed' ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'}`}
        >
          Booked Items Needed
          {bookedNotInStock.length > 0 && (
            <span className={`text-xs font-bold rounded-full px-1.5 py-0.5 ${activeTab === 'booked_needed' ? 'bg-black/20 text-black' : 'bg-amber-500/20 text-amber-400'}`}>{bookedNotInStock.length}</span>
          )}
        </button>
      </div>

      {activeTab === 'purchase' && (
        <>
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
                        {p.bookingId && <p className="text-blue-500 text-xs mt-0.5">Booking #{p.bookingId}</p>}
                        {p.note && !p.bookingId && <p className="text-gray-500 text-xs mt-0.5 truncate max-w-[180px]">{p.note}</p>}
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
        </>
      )}

      {activeTab === 'booked_needed' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Items Needed', value: bookedNotInStock.length, color: 'text-white' },
              { label: 'No PO Yet', value: bookedNotInStock.filter(i => !i.hasPO).length, color: 'text-amber-400' },
              { label: 'PO Raised', value: bookedNotInStock.filter(i => i.hasPO).length, color: 'text-blue-400' },
              { label: 'Total Units to Buy', value: bookedNotInStock.reduce((s, i) => s + i.needed, 0), color: 'text-green-400' },
            ].map(s => (
              <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0">
                <p className="text-gray-500 text-xs font-medium mb-1">{s.label}</p>
                <p className={`font-syne font-bold break-all text-sm sm:text-lg md:text-2xl ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search item…"
              value={bookedSearch}
              onChange={e => setBookedSearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500 w-64"
            />
            {missingItems.length > 0 && (
              <button
                onClick={() => dispatch({ type: 'SYNC_PURCHASES_FROM_BOOKINGS' })}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                Generate Purchase Orders
                <span className="bg-black/20 text-black text-xs font-bold rounded-full px-1.5 py-0.5">{missingItems.length}</span>
              </button>
            )}
          </div>

          {/* Booked Items Needed Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              <span className="text-amber-400 text-sm font-semibold">Items from Active Bookings — Not in Store Inventory</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-gray-500 font-medium px-5 py-3">#</th>
                    <th className="text-left text-gray-500 font-medium px-5 py-3">Item Name</th>
                    <th className="text-center text-gray-500 font-medium px-5 py-3">Total Booked</th>
                    <th className="text-center text-gray-500 font-medium px-5 py-3">In Stock</th>
                    <th className="text-center text-gray-500 font-medium px-5 py-3">Qty to Purchase</th>
                    <th className="text-left text-gray-500 font-medium px-5 py-3">Branch</th>
                    <th className="text-left text-gray-500 font-medium px-5 py-3">PO Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookedNotInStock.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-gray-600 py-12">
                        {bookedNotInStock.length === 0 ? 'All booked items are available in inventory' : 'No results match your search'}
                      </td>
                    </tr>
                  ) : filteredBookedNotInStock.map((item, idx) => (
                    <tr key={`${item.itemId}::${item.branch}`} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                      <td className="px-5 py-3.5 text-gray-500 text-xs">{idx + 1}</td>
                      <td className="px-5 py-3.5">
                        <p className="text-white font-medium">{item.name}</p>
                        {item.unit && <p className="text-gray-500 text-xs mt-0.5">{item.unit}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono text-white">{item.totalBooked}</td>
                      <td className="px-5 py-3.5 text-center font-mono text-red-400">{item.inStock}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="bg-amber-500/20 text-amber-400 font-mono font-bold text-sm px-2 py-0.5 rounded-lg">{item.needed}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${item.branch === 'DUB' ? 'bg-blue-950 text-blue-400' : 'bg-purple-950 text-purple-400'}`}>
                          {item.branchLabel}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {item.hasPO ? (
                          <span className="bg-blue-950 text-blue-400 text-xs px-2 py-0.5 rounded-lg font-medium">PO Raised</span>
                        ) : (
                          <span className="bg-amber-950 text-amber-400 text-xs px-2 py-0.5 rounded-lg font-medium">No PO Yet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modal && (
        <Modal title="Purchase Request" onClose={() => { setModal(false); setForm(EMPTY); setSelectedOrderable(''); setItemNameSearch(''); }}>
          <div className="space-y-4">

            {/* Optional: pre-fill from booked items */}
            {orderableItems.length > 0 && (
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">
                  Quick-fill from Bookings <span className="text-gray-600">(optional)</span>
                </label>
                <select
                  value={selectedOrderable}
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedOrderable(val);
                    if (!val) { setForm(f => ({ ...f, name: '', itemId: '', bookingId: '', qty: '', unit: '', category: 'Spare Parts', estimatedCost: '' })); setItemNameSearch(''); return; }
                    const found = orderableItems.find(o => o.itemId === val);
                    if (found) {
                      setItemNameSearch(found.name);
                      setForm(f => ({
                        ...f,
                        name: found.name,
                        itemId: found.itemId,
                        bookingId: found.bookingId,
                        qty: String(found.needed),
                        unit: found.unit,
                        category: found.category,
                        estimatedCost: String(found.estimatedCost),
                        branch: found.branch,
                        note: `From booking #${found.bookingId} — ${found.customer || ''}`.trim().replace(/—\s*$/, ''),
                      }));
                    }
                  }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Select a booked item needing stock —</option>
                  {orderableItems.map(o => (
                    <option key={o.itemId} value={o.itemId}>
                      {o.name} · need {o.needed} {o.unit} · {o.branch === 'DUB' ? 'Dubai' : 'Kubwa'} (booking #{o.bookingId})
                    </option>
                  ))}
                </select>
                {selectedOrderable && (() => { const o = orderableItems.find(x => x.itemId === selectedOrderable); return o ? (
                  <div className="mt-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2 text-xs text-amber-400 flex flex-wrap gap-x-4 gap-y-0.5">
                    <span>Customer: <strong>{o.customer || '—'}</strong></span>
                    <span>In stock: <strong>{o.inStock}</strong></span>
                    <span>Needed: <strong>{o.needed} {o.unit}</strong></span>
                    <span>Branch: <strong>{o.branch === 'DUB' ? 'Dubai' : 'Kubwa'}</strong></span>
                  </div>
                ) : null; })()}
              </div>
            )}

            {/* Item name — searchable inventory dropdown */}
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">
                Item Name <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search inventory or type item name…"
                  value={itemNameSearch}
                  onChange={e => {
                    setItemNameSearch(e.target.value);
                    setForm(f => ({ ...f, name: e.target.value }));
                    setItemNameDropdown(true);
                    setSelectedOrderable('');
                  }}
                  onFocus={() => setItemNameDropdown(true)}
                  onBlur={() => setTimeout(() => setItemNameDropdown(false), 150)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {itemNameDropdown && filteredInvItems.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl mt-1 z-20 max-h-56 overflow-y-auto shadow-xl">
                    {filteredInvItems.map(i => (
                      <button
                        key={i.id}
                        type="button"
                        onMouseDown={() => {
                          setItemNameSearch(i.name);
                          setItemNameDropdown(false);
                          setForm(f => ({
                            ...f,
                            name:          i.name,
                            itemId:        i.id,
                            unit:          i.unit || f.unit,
                            category:      i.category || f.category,
                            estimatedCost: i.price ? String(i.price) : f.estimatedCost,
                            supplier:      i.supplier || f.supplier,
                          }));
                        }}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-700 text-left transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm truncate">{i.name}</p>
                          <p className="text-gray-500 text-xs">{i.category} · {i.branch === 'DUB' ? 'Dubai' : 'Kubwa'}</p>
                        </div>
                        <span className="text-gray-400 text-xs ml-2 shrink-0">{i.qty} {i.unit} in stock</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Branch</label>
                <select value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} disabled={!!branch} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                  {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Supplier (optional)</label>
                <input type="text" list="supplier-list" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                <datalist id="supplier-list">
                  {suppliers.map(s => <option key={s.id} value={s.name}/>)}
                </datalist>
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Note</label>
              <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => { setModal(false); setForm(EMPTY); setSelectedOrderable(''); setItemNameSearch(''); }} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
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
