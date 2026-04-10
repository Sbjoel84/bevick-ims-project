import { useState } from 'react';
import { useApp, formatCurrency, fmtDate, genId } from '../context/AppContext';
import ReportModal from '../components/ReportModal';
import DeleteRequestModal from '../components/DeleteRequestModal';

const STATUSES = ['pending', 'confirmed', 'delivered', 'cancelled'];

const STATUS_COLORS = {
  pending:   'bg-amber-950 text-amber-400',
  confirmed: 'bg-blue-950 text-blue-400',
  delivered: 'bg-emerald-950 text-emerald-400',
  cancelled: 'bg-gray-800 text-gray-500',
};

function blankRow() {
  return { _rowId: Date.now() + Math.random(), id: null, name: '', qty: 1, unit: '', price: 0 };
}

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

function ItemRow({ item, availableItems, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(item.name || '');

  const filtered = availableItems.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase())
  );

  function select(inv) {
    setSearch(inv.name);
    setOpen(false);
    onChange({ ...item, id: inv.id, name: inv.name, unit: inv.unit, price: inv.price });
  }

  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-700 last:border-0">
      <div className="relative flex-1">
        <input
          type="text"
          placeholder="Search item…"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); onChange({ ...item, id: null, name: e.target.value }); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        {open && filtered.length > 0 && (
          <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl mt-1 z-20 max-h-52 overflow-y-auto shadow-xl">
            {filtered.map(i => (
              <button
                key={i.id}
                type="button"
                onMouseDown={() => select(i)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-700 text-left gap-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs truncate">{i.name}</p>
                  <p className="text-gray-500 text-xs">{i.category} · {i.branch === 'DUB' ? 'Dubai' : 'Kubwa'}</p>
                </div>
                <span className="text-gray-400 text-xs shrink-0">{i.qty} {i.unit}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <input
        type="number"
        min={1}
        value={item.qty}
        onChange={e => onChange({ ...item, qty: parseInt(e.target.value) || 1 })}
        className="w-14 text-center bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none"
      />
      <span className="text-gray-500 text-xs w-8 shrink-0">{item.unit || '—'}</span>
      <button type="button" onClick={onRemove} className="text-gray-600 hover:text-red-400 shrink-0">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
  );
}

function BookingFormFields({ f, setF, availableItems, currency }) {
  const total = f.items.filter(i => i.id).reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0);

  function addRow() {
    setF(x => ({ ...x, items: [...x.items, blankRow()] }));
  }

  function updateRow(rowId, updated) {
    setF(x => ({ ...x, items: x.items.map(i => i._rowId === rowId ? updated : i) }));
  }

  function removeRow(rowId) {
    setF(x => ({ ...x, items: x.items.filter(i => i._rowId !== rowId) }));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-1.5">Customer <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={f.customer}
            onChange={e => setF(x => ({ ...x, customer: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-1.5">Delivery Date</label>
          <input
            type="date"
            value={f.deliveryDate}
            onChange={e => setF(x => ({ ...x, deliveryDate: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-gray-400 text-xs font-medium">Items <span className="text-red-400">*</span></label>
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            Add Item
          </button>
        </div>

        {f.items.length === 0 ? (
          <button
            type="button"
            onClick={addRow}
            className="w-full border-2 border-dashed border-gray-700 hover:border-emerald-600 rounded-xl py-6 text-gray-500 hover:text-emerald-400 text-sm transition-colors flex flex-col items-center gap-1.5"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            Click to add items
          </button>
        ) : (
          <div className="bg-gray-800 rounded-xl px-4">
            <div className="flex items-center gap-2 py-2 border-b border-gray-700">
              <span className="flex-1 text-gray-500 text-xs">Item</span>
              <span className="w-14 text-center text-gray-500 text-xs">Qty</span>
              <span className="w-8 text-gray-500 text-xs">Unit</span>
              <span className="w-3.5" />
            </div>
            {f.items.map(item => (
              <ItemRow
                key={item._rowId}
                item={item}
                availableItems={availableItems}
                onChange={updated => updateRow(item._rowId, updated)}
                onRemove={() => removeRow(item._rowId)}
              />
            ))}
            <div className="flex justify-between py-2.5 text-xs border-t border-gray-700 mt-1">
              <span className="text-gray-400">Estimated Value</span>
              <span className="text-emerald-400 font-mono">{formatCurrency(total, currency)}</span>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="text-gray-400 text-xs font-medium block mb-1.5">Note</label>
        <textarea
          value={f.note}
          onChange={e => setF(x => ({ ...x, note: e.target.value }))}
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
        />
      </div>
    </div>
  );
}

const EMPTY_FORM = { customer: '', branch: 'DUB', deliveryDate: '', note: '', items: [] };

export default function Booked() {
  const { state, dispatch } = useApp();
  const { bookings, inventory, currency, branch, bname, user } = state;

  const [modal, setModal] = useState(null); // 'new' | 'edit' | 'view'
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState({ ...EMPTY_FORM, branch: branch || 'DUB' });
  const [editForm, setEditForm] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteReq, setDeleteReq] = useState(null);

  const bookingColumns = [
    { key: 'customer', label: 'Customer' },
    { key: 'id',       label: 'Booking ID' },
    { key: 'date',     label: 'Booked', format: v => fmtDate(v) },
    { key: 'items', label: 'Items', tdStyle: 'white-space:pre-line;', format: v => (v || []).map(i => `${i.name}  ×${i.qty}${i.unit ? ' ' + i.unit : ''}`).filter(Boolean).join('\n') || '—' },
    { key: 'status',   label: 'Status' },
  ];

  function getBookingSummary(data) {
    const total = data.reduce((s, b) => s + (b.total || 0), 0);
    const byStatus = STATUSES.map(st => ({
      label: st.charAt(0).toUpperCase() + st.slice(1),
      value: data.filter(b => b.status === st).length,
    }));
    return [
      ...byStatus,
      { label: 'Total Booking Value', value: formatCurrency(total, currency), bold: true },
    ];
  }

  const filtered = bookings
    .filter(b => branch ? b.branch === branch : true)
    .filter(b => filterStatus === 'all' || b.status === filterStatus)
    .filter(b => {
      const q = search.toLowerCase();
      return !q || b.customer?.toLowerCase().includes(q) || b.id?.toLowerCase().includes(q);
    });

  function availableFor() {
    return inventory;
  }

  function submitNew() {
    const validItems = form.items.filter(i => i.id).map(({ _rowId, ...rest }) => rest);
    if (!form.customer.trim() || validItems.length === 0) return;
    dispatch({
      type: 'ADD_BOOKING',
      payload: {
        id: genId('B'),
        customer: form.customer,
        branch: branch || form.branch,
        deliveryDate: form.deliveryDate,
        note: form.note,
        items: validItems,
        total: validItems.reduce((s, i) => s + i.qty * i.price, 0),
        status: 'pending',
        date: new Date().toISOString(),
        createdBy: user?.name,
      },
    });
    setModal(null);
    setForm({ ...EMPTY_FORM, branch: branch || 'DUB' });
  }

  function openEdit(b) {
    setEditForm({
      ...b,
      items: b.items.map(i => ({ ...i, _rowId: i.id + '-' + Math.random() })),
    });
    setModal('edit');
  }

  function submitEdit() {
    const validItems = editForm.items.filter(i => i.id).map(({ _rowId, ...rest }) => rest);
    if (!editForm.customer.trim() || validItems.length === 0) return;
    dispatch({
      type: 'UPDATE_BOOKING',
      payload: { ...editForm, items: validItems, total: validItems.reduce((s, i) => s + i.qty * i.price, 0) },
    });
    setModal(null);
    setEditForm(null);
  }

  function updateStatus(id, status) {
    dispatch({ type: 'UPDATE_BOOKING_STATUS', payload: { id, status } });
  }

  function del(id) {
    if (user?.role === 'super_admin') {
      if (window.confirm('Delete this booking?')) {
        dispatch({ type: 'DELETE_BOOKING', payload: id });
        if (modal) setModal(null);
      }
    } else {
      const b = bookings.find(x => x.id === id);
      setDeleteReq({ type: 'booking', targetId: id, label: `Booking #${id}${b?.customer ? ` — ${b.customer}` : ''}` });
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Booked Items</h1>
          <p className="text-gray-500 text-sm mt-0.5">{bname}</p>
        </div>
        <button
          onClick={() => { setForm({ ...EMPTY_FORM, branch: branch || 'DUB' }); setModal('new'); }}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          New Booking
        </button>
        <button
          onClick={() => setReportOpen(true)}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          Report
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search bookings…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-64"
        />
        <div className="flex gap-2">
          {['all', ...STATUSES].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-2 rounded-xl text-xs font-medium capitalize transition-colors ${filterStatus === s ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 font-medium px-5 py-3">Customer</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Booking ID</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Date</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Items</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-600 py-12">No bookings found</td></tr>
              ) : filtered.map(b => (
                <tr key={b.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3.5 text-white font-medium">{b.customer}</td>
                  <td className="px-5 py-3.5 font-mono text-gray-400 text-xs">{b.id}</td>
                  <td className="px-5 py-3.5 text-gray-400">{fmtDate(b.date)}</td>
                  <td className="px-5 py-3.5">
                    <div className="space-y-1">
                      {(b.items || []).map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-xs leading-tight">
                          <span className="text-gray-200">{item.name}</span>
                          <span className="text-gray-500">×{item.qty}{item.unit ? ' ' + item.unit : ''}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <select
                      value={b.status}
                      onChange={e => updateStatus(b.id, e.target.value)}
                      className={`text-xs px-2 py-1 rounded-lg border-0 outline-none cursor-pointer capitalize font-medium ${STATUS_COLORS[b.status] || 'bg-gray-800 text-gray-400'}`}
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => { setSelected(b); setModal('view'); }} className="text-gray-500 hover:text-white transition-colors" title="View">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      </button>
                      <button onClick={() => openEdit(b)} className="text-gray-500 hover:text-emerald-400 transition-colors" title="Edit">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <button onClick={() => del(b.id)} className="text-gray-500 hover:text-red-400 transition-colors" title="Delete">
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

      {/* New Booking Modal */}
      {modal === 'new' && (
        <Modal title="New Booking" onClose={() => setModal(null)}>
          <BookingFormFields f={form} setF={setForm} availableItems={availableFor()} currency={currency} />
          <div className="flex gap-3 pt-4">
            <button onClick={() => setModal(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
            <button
              onClick={submitNew}
              disabled={!form.customer.trim() || form.items.filter(i => i.id).length === 0}
              className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              Create Booking
            </button>
          </div>
        </Modal>
      )}

      {/* Edit Booking Modal */}
      {modal === 'edit' && editForm && (
        <Modal title={`Edit Booking · ${editForm.id}`} onClose={() => setModal(null)}>
          <BookingFormFields f={editForm} setF={setEditForm} availableItems={availableFor(branch || editForm.branch)} currency={currency} />
          <div className="flex gap-3 pt-4">
            <button onClick={() => setModal(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
            <button
              onClick={submitEdit}
              disabled={!editForm.customer.trim() || editForm.items.filter(i => i.id).length === 0}
              className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              Save Changes
            </button>
          </div>
        </Modal>
      )}

      {/* View Modal */}
      {modal === 'view' && selected && (
        <Modal title={`Booking · ${selected.id}`} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-gray-500 text-xs mb-1">Customer</p><p className="text-white font-medium">{selected.customer}</p></div>
              <div><p className="text-gray-500 text-xs mb-1">Status</p><span className={`text-xs px-2 py-0.5 rounded-lg capitalize font-medium ${STATUS_COLORS[selected.status]}`}>{selected.status}</span></div>
              <div><p className="text-gray-500 text-xs mb-1">Booked</p><p className="text-white">{fmtDate(selected.date)}</p></div>
              <div><p className="text-gray-500 text-xs mb-1">Delivery</p><p className="text-white">{selected.deliveryDate ? fmtDate(selected.deliveryDate) : '—'}</p></div>
            </div>
            <div className="bg-gray-800 rounded-xl divide-y divide-gray-700 text-sm">
              {selected.items?.map(item => (
                <div key={item.id} className="flex justify-between px-4 py-2.5">
                  <span className="text-white">{item.name}</span>
                  <span className="text-gray-400 text-xs">{item.qty} {item.unit}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-2.5 font-medium">
                <span className="text-gray-400">Estimated Value</span>
                <span className="text-emerald-400 font-mono">{formatCurrency(selected.total || 0, currency)}</span>
              </div>
            </div>
            {selected.note && (
              <div className="bg-gray-800 rounded-xl p-4 text-sm">
                <p className="text-gray-500 text-xs mb-1">Note</p>
                <p className="text-white">{selected.note}</p>
              </div>
            )}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Update Status</label>
                <select
                  value={selected.status}
                  onChange={e => { updateStatus(selected.id, e.target.value); setSelected(s => ({ ...s, status: e.target.value })); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none"
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button
                onClick={() => { setModal(null); openEdit(selected); }}
                className="mt-5 bg-blue-950 hover:bg-blue-900 text-blue-400 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
              >
                Edit
              </button>
              <button onClick={() => del(selected.id)} className="mt-5 bg-red-950 hover:bg-red-900 text-red-400 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Delete</button>
            </div>
          </div>
        </Modal>
      )}

      {reportOpen && (
        <ReportModal
          title="Bookings"
          data={filtered}
          dateKey="date"
          columns={bookingColumns}
          getSummary={getBookingSummary}
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
