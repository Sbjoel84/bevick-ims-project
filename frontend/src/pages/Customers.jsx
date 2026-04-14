import { useState, useEffect, useMemo } from 'react';
import { useApp, formatCurrency, fmtDate, genId } from '../context/AppContext';
import { refreshCustomers, refreshSales, refreshBookings } from '../lib/refresh';
import DeleteRequestModal from '../components/DeleteRequestModal';

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
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

const EMPTY = { name: '', phone: '', email: '', address: '', note: '' };

// Normalize a name for case-insensitive comparison
const norm = str => str?.toLowerCase().trim() || '';

export default function Customers() {
  const { state, dispatch } = useApp();
  const { customers, sales, bookings, currency, branch, bname, user } = state;

  useEffect(() => {
    refreshCustomers(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'customers', data } }));
    refreshSales(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'sales', data } }));
    refreshBookings(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'bookings', data } }));
  }, []);

  const [modal, setModal] = useState(null); // 'add' | 'edit' | 'view'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [deleteReq, setDeleteReq] = useState(null);

  // Branch-scoped sales and bookings
  const scopedSales = useMemo(
    () => branch ? sales.filter(s => s.branch === branch) : sales,
    [sales, branch]
  );
  const scopedBookings = useMemo(
    () => branch ? bookings.filter(b => b.branch === branch) : bookings,
    [bookings, branch]
  );

  // Unified customer list: registered customers + anyone named in a sale or booking
  // who is not already registered. Virtual entries show transaction data but no contact info.
  const allCustomers = useMemo(() => {
    const registeredKeys = new Set(customers.map(c => norm(c.name)));
    const seen = new Set(registeredKeys);
    const virtual = [];

    [...scopedSales.map(s => s.customer), ...scopedBookings.map(b => b.customer)]
      .filter(Boolean)
      .forEach(name => {
        const key = norm(name);
        if (key && !seen.has(key)) {
          seen.add(key);
          virtual.push({ id: `_v_${key}`, name, _virtual: true });
        }
      });

    return [...customers, ...virtual];
  }, [customers, scopedSales, scopedBookings]);

  // Compute financial stats for a customer by name
  function getStats(customerName) {
    const cKey = norm(customerName);

    const cSales = scopedSales.filter(s => norm(s.customer) === cKey);
    const cBookings = scopedBookings.filter(
      b => norm(b.customer) === cKey && b.status !== 'cancelled'
    );

    const salesTotal = cSales.reduce((s, x) => s + (x.total || 0), 0);
    const bookingsTotal = cBookings.reduce((s, b) => s + (b.total || 0), 0);
    const totalGoods = salesTotal + bookingsTotal;

    const amountPaid =
      // Sales: sum recorded payments, or treat as fully paid if no payments array (legacy)
      cSales.reduce((s, x) => {
        if (x.payments && x.payments.length > 0)
          return s + x.payments.reduce((a, p) => a + (p.amount || 0), 0);
        return s + (x.total || 0);
      }, 0) +
      // Bookings: sum deposits recorded on each booking
      cBookings.reduce((s, b) => s + (b.amountPaid || 0), 0);

    const balance = totalGoods - amountPaid;

    return { totalGoods, amountPaid, balance, salesCount: cSales.length, bookingsCount: cBookings.length, cSales, cBookings };
  }

  const filtered = allCustomers.filter(c => {
    const q = search.toLowerCase();
    return !q || norm(c.name).includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q);
  });

  // ── Actions ──────────────────────────────────────────────────────────────────

  function openAdd(prefillName = '') {
    setForm({ ...EMPTY, name: prefillName });
    setModal('add');
  }

  function openEdit(c) {
    setSelected(c);
    setForm({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '', note: c.note || '' });
    setModal('edit');
  }

  function openView(c) {
    setSelected(c);
    setModal('view');
  }

  function save() {
    if (!form.name.trim()) return;
    if (modal === 'add') {
      dispatch({ type: 'ADD_CUSTOMER', payload: { id: genId('C'), ...form, branch: branch || null, createdAt: new Date().toISOString() } });
    } else {
      dispatch({ type: 'UPDATE_CUSTOMER', payload: { ...selected, ...form } });
    }
    setModal(null);
  }

  function del(id) {
    if (user?.role === 'super_admin') {
      if (window.confirm('Delete this customer? They will be moved to the recycle bin.')) {
        dispatch({ type: 'DELETE_CUSTOMER', payload: id });
        if (modal) setModal(null);
      }
    } else {
      const c = customers.find(x => x.id === id);
      setDeleteReq({ type: 'customer', targetId: id, label: c?.name || id });
    }
  }

  // ── Summary cards ─────────────────────────────────────────────────────────────

  const totalGoods   = filtered.reduce((s, c) => s + getStats(c.name).totalGoods, 0);
  const totalPaid    = filtered.reduce((s, c) => s + getStats(c.name).amountPaid, 0);
  const totalBalance = filtered.reduce((s, c) => s + getStats(c.name).balance, 0);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Customers</h1>
          <p className="text-gray-500 text-sm mt-0.5">{bname} · {filtered.length} customers</p>
        </div>
        <button
          onClick={() => openAdd()}
          className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Add Customer
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-gray-500 text-xs font-medium mb-1">Total Customers</p>
          <p className="font-syne text-2xl font-bold text-white">{filtered.length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-gray-500 text-xs font-medium mb-1">Total Goods Value</p>
          <p className="font-syne text-xl font-bold text-white">{formatCurrency(totalGoods, currency)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-gray-500 text-xs font-medium mb-1">Total Amount Paid</p>
          <p className="font-syne text-xl font-bold text-green-400">{formatCurrency(totalPaid, currency)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <p className="text-gray-500 text-xs font-medium mb-1">Total Balance Due</p>
          <p className={`font-syne text-xl font-bold ${totalBalance > 0.005 ? 'text-orange-400' : 'text-white'}`}>
            {formatCurrency(totalBalance, currency)}
          </p>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search customers…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-72"
      />

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 font-medium px-5 py-3">Name</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Phone</th>
                <th className="text-center text-gray-500 font-medium px-5 py-3">Transactions</th>
                <th className="text-right text-gray-500 font-medium px-5 py-3">Total Goods</th>
                <th className="text-right text-gray-500 font-medium px-5 py-3">Paid</th>
                <th className="text-right text-gray-500 font-medium px-5 py-3">Balance</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-gray-600 py-12">No customers found</td>
                </tr>
              ) : filtered.map(c => {
                const stats = getStats(c.name);
                const isVirtual = !!c._virtual;

                return (
                  <tr key={c.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                    {/* Name */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isVirtual ? 'bg-gray-700 text-gray-400' : 'bg-blue-600/30 text-blue-400'}`}>
                          {c.name?.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-white font-medium">{c.name}</span>
                          {isVirtual && (
                            <span className="ml-2 text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-md">unregistered</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="px-5 py-3.5 text-gray-400">
                      {isVirtual ? '—' : (c.phone || '—')}
                    </td>

                    {/* Transaction count */}
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        {stats.salesCount > 0 && (
                          <span className="bg-blue-950 text-blue-400 text-xs px-2 py-0.5 rounded-lg font-medium">
                            {stats.salesCount} sale{stats.salesCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {stats.bookingsCount > 0 && (
                          <span className="bg-purple-950 text-purple-400 text-xs px-2 py-0.5 rounded-lg font-medium">
                            {stats.bookingsCount} booking{stats.bookingsCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {stats.salesCount === 0 && stats.bookingsCount === 0 && (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </div>
                    </td>

                    {/* Total Goods */}
                    <td className="px-5 py-3.5 text-right font-mono text-white">
                      {stats.totalGoods > 0 ? formatCurrency(stats.totalGoods, currency) : <span className="text-gray-600">—</span>}
                    </td>

                    {/* Paid */}
                    <td className="px-5 py-3.5 text-right font-mono text-green-400">
                      {stats.amountPaid > 0 ? formatCurrency(stats.amountPaid, currency) : <span className="text-gray-600">—</span>}
                    </td>

                    {/* Balance */}
                    <td className="px-5 py-3.5 text-right font-mono font-semibold">
                      {stats.balance > 0.005
                        ? <span className="text-orange-400">{formatCurrency(stats.balance, currency)}</span>
                        : <span className="text-gray-600">—</span>
                      }
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => openView(c)} title="View" className="text-gray-500 hover:text-white transition-colors p-1">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                          </svg>
                        </button>
                        {!isVirtual && (
                          <button onClick={() => openEdit(c)} title="Edit" className="text-gray-500 hover:text-white transition-colors p-1">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                          </button>
                        )}
                        {isVirtual ? (
                          <button
                            onClick={() => openAdd(c.name)}
                            title="Register customer"
                            className="text-gray-500 hover:text-blue-400 transition-colors p-1"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
                            </svg>
                          </button>
                        ) : (
                          <button onClick={() => del(c.id)} title="Delete" className="text-gray-500 hover:text-red-400 transition-colors p-1">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? 'Add Customer' : 'Edit Customer'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            {[
              { key: 'name',    label: 'Full Name',       placeholder: 'Customer name', required: true },
              { key: 'phone',   label: 'Phone Number',    placeholder: '+234…' },
              { key: 'email',   label: 'Email Address',   placeholder: 'customer@email.com' },
              { key: 'address', label: 'Address',         placeholder: 'Street, City' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">
                  {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <input
                  type="text"
                  placeholder={f.placeholder}
                  value={form[f.key]}
                  onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Note</label>
              <textarea
                value={form.note}
                onChange={e => setForm(x => ({ ...x, note: e.target.value }))}
                rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
              <button onClick={save} disabled={!form.name.trim()} className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
                {modal === 'add' ? 'Add Customer' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* View Modal */}
      {modal === 'view' && selected && (() => {
        const stats = getStats(selected.name);
        const { totalGoods: tGoods, amountPaid: tPaid, balance: tBal, cSales, cBookings } = stats;
        const isVirtual = !!selected._virtual;

        return (
          <Modal title={selected.name} onClose={() => setModal(null)}>
            <div className="space-y-5">
              {/* Contact info — only for registered customers */}
              {!isVirtual && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    { label: 'Phone',   value: selected.phone },
                    { label: 'Email',   value: selected.email },
                    { label: 'Address', value: selected.address },
                    { label: 'Added',   value: selected.createdAt ? fmtDate(selected.createdAt) : null },
                  ].map(f => (
                    <div key={f.label}>
                      <p className="text-gray-500 text-xs mb-1">{f.label}</p>
                      <p className="text-white">{f.value || '—'}</p>
                    </div>
                  ))}
                  {selected.note && (
                    <div className="col-span-2">
                      <p className="text-gray-500 text-xs mb-1">Note</p>
                      <p className="text-white">{selected.note}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Unregistered notice */}
              {isVirtual && (
                <div className="bg-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
                  <p className="text-gray-400 text-sm">This customer is not yet registered.</p>
                  <button
                    onClick={() => openAdd(selected.name)}
                    className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
                  >
                    Register →
                  </button>
                </div>
              )}

              {/* Financial summary */}
              <div className="bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Cost of Goods</span>
                  <span className="text-white font-mono">{formatCurrency(tGoods, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Amount Paid</span>
                  <span className="text-green-400 font-mono">{formatCurrency(tPaid, currency)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-gray-700 pt-2">
                  <span className={tBal > 0.005 ? 'text-orange-400' : 'text-green-400'}>Balance Remaining</span>
                  <span className={`font-mono ${tBal > 0.005 ? 'text-orange-400' : 'text-green-400'}`}>
                    {tBal > 0.005 ? formatCurrency(tBal, currency) : 'Fully Paid'}
                  </span>
                </div>
              </div>

              {/* Sales history */}
              {cSales.length > 0 && (
                <div>
                  <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-2">Sales Transactions</p>
                  <div className="bg-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left text-gray-500 font-medium px-4 py-2.5">Date</th>
                          <th className="text-right text-gray-500 font-medium px-4 py-2.5">Total</th>
                          <th className="text-right text-gray-500 font-medium px-4 py-2.5">Paid</th>
                          <th className="text-right text-gray-500 font-medium px-4 py-2.5">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cSales.map(s => {
                          const paid = s.payments && s.payments.length > 0
                            ? s.payments.reduce((a, p) => a + (p.amount || 0), 0)
                            : (s.total || 0);
                          const bal = (s.total || 0) - paid;
                          return (
                            <tr key={s.id} className="border-b border-gray-700 last:border-0">
                              <td className="px-4 py-2.5 text-gray-300">{fmtDate(s.date)}</td>
                              <td className="px-4 py-2.5 text-right text-white font-mono">{formatCurrency(s.total || 0, currency)}</td>
                              <td className="px-4 py-2.5 text-right text-green-400 font-mono">{formatCurrency(paid, currency)}</td>
                              <td className={`px-4 py-2.5 text-right font-mono font-medium ${bal > 0.005 ? 'text-orange-400' : 'text-gray-500'}`}>
                                {bal > 0.005 ? formatCurrency(bal, currency) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Bookings history */}
              {cBookings.length > 0 && (
                <div>
                  <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-2">Bookings</p>
                  <div className="bg-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left text-gray-500 font-medium px-4 py-2.5">Date</th>
                          <th className="text-left text-gray-500 font-medium px-4 py-2.5">Booking ID</th>
                          <th className="text-left text-gray-500 font-medium px-4 py-2.5">Status</th>
                          <th className="text-right text-gray-500 font-medium px-4 py-2.5">Value</th>
                          <th className="text-right text-gray-500 font-medium px-4 py-2.5">Paid</th>
                          <th className="text-right text-gray-500 font-medium px-4 py-2.5">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cBookings.map(b => {
                          const bPaid = b.amountPaid || 0;
                          const bBal  = (b.total || 0) - bPaid;
                          return (
                          <tr key={b.id} className="border-b border-gray-700 last:border-0">
                            <td className="px-4 py-2.5 text-gray-300">{fmtDate(b.date)}</td>
                            <td className="px-4 py-2.5 text-gray-300 font-mono">{b.id}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                b.status === 'delivered' ? 'bg-green-950 text-green-400' :
                                b.status === 'confirmed' ? 'bg-blue-950 text-blue-400' :
                                'bg-amber-950 text-amber-400'
                              }`}>
                                {b.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-white font-mono">{formatCurrency(b.total || 0, currency)}</td>
                            <td className="px-4 py-2.5 text-right text-green-400 font-mono">
                              {bPaid > 0 ? formatCurrency(bPaid, currency) : <span className="text-gray-600">—</span>}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-mono font-semibold ${bBal > 0.005 ? 'text-orange-400' : 'text-gray-500'}`}>
                              {bBal > 0.005 ? formatCurrency(bBal, currency) : '—'}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action buttons — only for registered customers */}
              {!isVirtual && (
                <div className="flex gap-3">
                  <button onClick={() => openEdit(selected)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Edit</button>
                  <button onClick={() => del(selected.id)} className="flex-1 bg-red-950 hover:bg-red-900 text-red-400 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Delete</button>
                </div>
              )}
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
