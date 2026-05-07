import { useState, useEffect } from 'react';
import { useApp, formatCurrency, fmtDate, genId } from '../context/AppContext';
import { refreshCommissions } from '../lib/refresh';
import ReportModal from '../components/ReportModal';
import DeleteRequestModal from '../components/DeleteRequestModal';

const BRANCHES = [{ id: 'DUB', label: 'Dubai Market' }, { id: 'KUB', label: 'Kubwa Office' }];

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <h2 className="font-syne font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">{children}</div>
      </div>
    </div>
  );
}

// Normalise legacy records that stored items as a string or string[]
function normItems(c) {
  if (!c) return [];
  // New format: items is array of objects with name/customerPrice/engineerPrice
  if (Array.isArray(c.items) && c.items.length > 0 && typeof c.items[0] === 'object') {
    return c.items;
  }
  // Legacy: has top-level prices → one item row
  if (c.customerPrice || c.engineerPrice) {
    const name = Array.isArray(c.items)
      ? c.items.filter(Boolean).join(', ')
      : (typeof c.items === 'string' ? c.items : '');
    return [{ name, customerPrice: c.customerPrice || 0, engineerPrice: c.engineerPrice || 0 }];
  }
  return [];
}

function itemCommission(item) {
  return (parseFloat(item.customerPrice) || 0) - (parseFloat(item.engineerPrice) || 0);
}

const EMPTY_ITEM = () => ({ id: genId('I'), name: '', customerPrice: '', engineerPrice: '' });

const EMPTY_FORM = {
  partner: '',
  customer: '',
  date: new Date().toISOString().slice(0, 10),
  items: [EMPTY_ITEM()],
  branch: 'DUB',
  note: '',
};

export default function Commission() {
  const { state, dispatch } = useApp();
  const { commissions = [], inventory = [], currency, branch, bname, user } = state;

  useEffect(() => {
    refreshCommissions(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'commissions', data } }));
  }, []);

  const [modal, setModal]           = useState(false);
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [viewing, setViewing]       = useState(null);
  const [search, setSearch]         = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteReq, setDeleteReq]   = useState(null);

  const allItemNames = [...new Set(inventory.map(i => i.name).filter(Boolean))].sort();

  // ── Item row helpers ────────────────────────────────────────
  function addItemRow() {
    setForm(f => ({ ...f, items: [...f.items, EMPTY_ITEM()] }));
  }

  function removeItemRow(id) {
    setForm(f => ({ ...f, items: f.items.filter(i => i.id !== id) }));
  }

  function updateItemRow(id, field, value) {
    setForm(f => ({
      ...f,
      items: f.items.map(i => i.id === id ? { ...i, [field]: value } : i),
    }));
  }

  // ── Totals (live) ───────────────────────────────────────────
  const totalCustomerPrice = form.items.reduce((s, i) => s + (parseFloat(i.customerPrice) || 0), 0);
  const totalEngineerPrice = form.items.reduce((s, i) => s + (parseFloat(i.engineerPrice) || 0), 0);
  const totalCommissionForm = totalCustomerPrice - totalEngineerPrice;

  // ── Filtered table data ─────────────────────────────────────
  const filtered = commissions
    .filter(c => branch ? c.branch === branch : true)
    .filter(c => {
      const q = search.toLowerCase();
      if (!q) return true;
      if (c.partner?.toLowerCase().includes(q)) return true;
      if (c.customer?.toLowerCase().includes(q)) return true;
      const items = normItems(c);
      return items.some(i => i.name?.toLowerCase().includes(q));
    });

  const totalCommission = filtered.reduce((s, c) => s + (c.commission || 0), 0);

  const byPartner = [...new Set(filtered.map(c => c.partner))].map(partner => ({
    partner,
    total: filtered.filter(c => c.partner === partner).reduce((s, c) => s + (c.commission || 0), 0),
    count: filtered.filter(c => c.partner === partner).length,
  })).sort((a, b) => b.total - a.total);


  // ── Report columns ──────────────────────────────────────────
  const commissionColumns = [
    { key: 'partner',       label: 'Partner/Engineer' },
    { key: 'customer',      label: 'Customer' },
    { key: 'date',          label: 'Date',           format: v => fmtDate(v) },
    { key: 'items',         label: 'Items',          format: v => normItems({ items: v }).map(i => i.name).filter(Boolean).join(', ') },
    { key: 'customerPrice', label: 'Customer Price', align: 'tr', format: v => formatCurrency(v || 0, currency) },
    { key: 'engineerPrice', label: 'Engineer Price', align: 'tr', format: v => formatCurrency(v || 0, currency) },
    { key: 'commission',    label: 'Commission',     align: 'tr', format: v => formatCurrency(v || 0, currency) },
  ];

  function getCommissionSummary(data) {
    const total         = data.reduce((s, c) => s + (c.commission    || 0), 0);
    const totalCustomer = data.reduce((s, c) => s + (c.customerPrice || 0), 0);
    const totalEngineer = data.reduce((s, c) => s + (c.engineerPrice || 0), 0);
    return [
      { label: 'Total Customer Price', value: formatCurrency(totalCustomer, currency) },
      { label: 'Total Engineer Price', value: formatCurrency(totalEngineer, currency) },
      { label: 'Total Commissions',    value: formatCurrency(total, currency), bold: true },
    ];
  }

  // ── Modal open/close ────────────────────────────────────────
  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, items: [EMPTY_ITEM()], branch: branch || 'DUB' });
    setModal(true);
  }

  function openEdit(c) {
    setEditing(c.id);
    const items = normItems(c);
    setForm({
      partner:  c.partner  || '',
      customer: c.customer || '',
      date:     c.date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      items:    items.length
        ? items.map(i => ({ id: genId('I'), name: i.name || '', customerPrice: i.customerPrice || '', engineerPrice: i.engineerPrice || '' }))
        : [EMPTY_ITEM()],
      branch: c.branch || 'DUB',
      note:   c.note   || '',
    });
    setModal(true);
  }

  function closeModal() { setModal(false); setEditing(null); }
  function openView(c) { setViewing(c); }

  // ── Submit ──────────────────────────────────────────────────
  function submit() {
    if (!form.partner.trim() || !form.customer.trim()) return;
    const validItems = form.items
      .filter(i => i.name.trim() || i.customerPrice || i.engineerPrice)
      .map(i => ({
        name:          i.name.trim(),
        customerPrice: parseFloat(i.customerPrice) || 0,
        engineerPrice: parseFloat(i.engineerPrice) || 0,
        commission:    (parseFloat(i.customerPrice) || 0) - (parseFloat(i.engineerPrice) || 0),
      }));
    const totCust = validItems.reduce((s, i) => s + i.customerPrice, 0);
    const totEng  = validItems.reduce((s, i) => s + i.engineerPrice,  0);
    dispatch({
      type: editing ? 'UPDATE_COMMISSION' : 'ADD_COMMISSION',
      payload: {
        id:            editing || genId('CM'),
        partner:       form.partner.trim(),
        customer:      form.customer.trim(),
        date:          form.date || new Date().toISOString(),
        items:         validItems,
        customerPrice: totCust,
        engineerPrice: totEng,
        commission:    totCust - totEng,
        branch:        branch || form.branch,
        note:          form.note,
        createdBy:     user?.name,
      },
    });
    closeModal();
  }

  function del(id) {
    const isAdmin = ['main_super_admin', 'super_admin', 'admin'].includes(user?.role);
    if (isAdmin) {
      if (window.confirm('Delete this commission record?')) dispatch({ type: 'DELETE_COMMISSION', payload: id });
    } else {
      const c = commissions.find(x => x.id === id);
      setDeleteReq({ type: 'commission', targetId: id, label: `${c?.partner} → ${c?.customer}` });
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Commissions</h1>
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
            onClick={openAdd}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Add Referral
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 lg:col-span-2 overflow-hidden min-w-0">
          <p className="text-gray-500 text-xs font-medium mb-1">Total Commissions</p>
          <p className="font-syne text-xs sm:text-sm md:text-2xl font-bold text-emerald-400 break-all">
            {formatCurrency(totalCommission, currency)}
          </p>
          <p className="text-gray-600 text-xs mt-1">
            {filtered.length} referral{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        {byPartner.slice(0, 2).map(x => (
          <div key={x.partner} className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0">
            <p className="text-gray-500 text-xs font-medium mb-1 truncate">{x.partner}</p>
            <p className="font-syne text-xs sm:text-sm md:text-lg font-bold text-white break-all">
              {formatCurrency(x.total, currency)}
            </p>
            <p className="text-gray-600 text-xs mt-1">{x.count} referral{x.count !== 1 ? 's' : ''}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by partner, customer or items…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-72"
        />
      </div>

      {/* Table — one row per referral record */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 font-medium px-5 py-3">Partner/Engineer</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Customer</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Date</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Items</th>
                <th className="text-right text-gray-500 font-medium px-5 py-3">Customer Price</th>
                <th className="text-right text-gray-500 font-medium px-5 py-3">Engineer Price</th>
                <th className="text-right text-gray-500 font-medium px-5 py-3">Commission</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-gray-600 py-12">No commission records found</td>
                </tr>
              ) : filtered.map(c => {
                const items = normItems(c);
                const firstName = items[0]?.name || '—';
                const extra = items.length > 1 ? items.length - 1 : 0;
                return (
                  <tr
                    key={c.id}
                    className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <p className="text-white font-medium">{c.partner}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-gray-300">{c.customer}</p>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <p className="text-gray-400">{fmtDate(c.date)}</p>
                      {c.note && <p className="text-gray-600 text-xs mt-0.5">{c.note}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-300">{firstName}</span>
                        {extra > 0 && (
                          <span className="bg-gray-700 text-gray-400 text-xs rounded-full px-1.5 py-0.5 font-mono whitespace-nowrap">
                            +{extra} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-gray-300 whitespace-nowrap">
                      {formatCurrency(c.customerPrice || 0, currency)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-gray-300 whitespace-nowrap">
                      {formatCurrency(c.engineerPrice || 0, currency)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-emerald-400 font-medium whitespace-nowrap">
                      {formatCurrency(c.commission || 0, currency)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openView(c)} className="text-gray-500 hover:text-white transition-colors" title="View details">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                          </svg>
                        </button>
                        <button onClick={() => openEdit(c)} className="text-gray-500 hover:text-blue-400 transition-colors" title="Edit">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                          </svg>
                        </button>
                        <button onClick={() => del(c.id)} className="text-gray-500 hover:text-red-400 transition-colors" title="Delete">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {reportOpen && (
        <ReportModal
          title="Commissions"
          data={filtered}
          dateKey="date"
          columns={commissionColumns}
          getSummary={getCommissionSummary}
          onClose={() => setReportOpen(false)}
          state={state}
        />
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <Modal
          title={editing ? 'Edit Commission' : 'Add Referral Commission'}
          onClose={closeModal}
        >
          {/* Partner + Customer */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">
                Partner/Engineer <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Kevin"
                value={form.partner}
                onChange={e => setForm(f => ({ ...f, partner: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">
                Customer <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Olushola SA"
                value={form.customer}
                onChange={e => setForm(f => ({ ...f, customer: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Items section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-400 text-xs font-medium">Items</label>
              <span className="text-gray-600 text-xs">{allItemNames.length} items in inventory</span>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_130px_130px_90px_32px] gap-2 px-1 mb-1">
              <span className="text-gray-600 text-xs">Item name</span>
              <span className="text-gray-600 text-xs text-right">Customer Price</span>
              <span className="text-gray-600 text-xs text-right">Engineer Price</span>
              <span className="text-gray-600 text-xs text-right">Commission</span>
              <span />
            </div>

            {/* Item rows */}
            <div className="space-y-2">
              {form.items.map((item, index) => {
                const comm = itemCommission(item);
                return (
                  <div key={item.id} className="grid grid-cols-[1fr_130px_130px_90px_32px] gap-2 items-center">
                    {/* Item name — native datalist for autocomplete */}
                    <div>
                      <input
                        list={`inv-list-${item.id}`}
                        type="text"
                        placeholder="Search or type item…"
                        value={item.name}
                        onChange={e => updateItemRow(item.id, 'name', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <datalist id={`inv-list-${item.id}`}>
                        {allItemNames.map(n => <option key={n} value={n} />)}
                      </datalist>
                    </div>

                    {/* Customer Price */}
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={item.customerPrice}
                      onChange={e => updateItemRow(item.id, 'customerPrice', e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm text-right placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    {/* Engineer Price */}
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={item.engineerPrice}
                      onChange={e => updateItemRow(item.id, 'engineerPrice', e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm text-right placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    {/* Commission (auto) */}
                    <div className={`text-right text-sm font-mono font-medium px-1 ${
                      item.customerPrice || item.engineerPrice
                        ? comm >= 0 ? 'text-emerald-400' : 'text-red-400'
                        : 'text-gray-600'
                    }`}>
                      {item.customerPrice || item.engineerPrice
                        ? formatCurrency(comm, currency)
                        : '—'}
                    </div>

                    {/* Remove row */}
                    <button
                      type="button"
                      onClick={() => removeItemRow(item.id)}
                      disabled={form.items.length === 1}
                      className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center"
                      title="Remove row"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Add row button */}
            <button
              type="button"
              onClick={addItemRow}
              className="mt-3 flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
              Add item
            </button>

            {/* Totals row */}
            {form.items.some(i => i.customerPrice || i.engineerPrice) && (
              <div className="mt-3 grid grid-cols-[1fr_130px_130px_90px_32px] gap-2 border-t border-gray-800 pt-3">
                <span className="text-gray-500 text-xs font-medium self-center">Total</span>
                <span className="text-right text-xs font-mono text-gray-300">
                  {formatCurrency(totalCustomerPrice, currency)}
                </span>
                <span className="text-right text-xs font-mono text-gray-300">
                  {formatCurrency(totalEngineerPrice, currency)}
                </span>
                <span className={`text-right text-xs font-mono font-semibold ${totalCommissionForm >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(totalCommissionForm, currency)}
                </span>
                <span />
              </div>
            )}
          </div>

          {/* Date + Branch */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Branch</label>
              <select
                value={form.branch}
                onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
                disabled={!!branch}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-gray-400 text-xs font-medium block mb-1.5">Note</label>
            <textarea
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={closeModal}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!form.partner.trim() || !form.customer.trim()}
              className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              {editing ? 'Save Changes' : 'Add Referral'}
            </button>
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

      {/* ── View Commission Modal ── */}
      {viewing && (() => {
        const items = normItems(viewing);
        const totCust = items.reduce((s, i) => s + (i.customerPrice || 0), 0);
        const totEng  = items.reduce((s, i) => s + (i.engineerPrice  || 0), 0);
        const totComm = totCust - totEng;
        return (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
                <div>
                  <h2 className="font-syne font-semibold text-white">Commission Details</h2>
                  <p className="text-gray-500 text-xs mt-0.5">{viewing.id}</p>
                </div>
                <button onClick={() => setViewing(null)} className="text-gray-500 hover:text-white">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-5">

                {/* Deal info grid */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Partner / Engineer</p>
                    <p className="text-white font-medium">{viewing.partner}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Customer</p>
                    <p className="text-white font-medium">{viewing.customer}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Date</p>
                    <p className="text-white">{fmtDate(viewing.date)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Branch</p>
                    <p className="text-white">{viewing.branch === 'DUB' ? 'Dubai Market' : 'Kubwa Office'}</p>
                  </div>
                  {viewing.createdBy && (
                    <div>
                      <p className="text-gray-500 text-xs mb-1">Recorded by</p>
                      <p className="text-white">{viewing.createdBy}</p>
                    </div>
                  )}
                  {viewing.note && (
                    <div className="col-span-2">
                      <p className="text-gray-500 text-xs mb-1">Note</p>
                      <p className="text-white">{viewing.note}</p>
                    </div>
                  )}
                </div>

                {/* Items breakdown table */}
                <div>
                  <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-2">Items Breakdown</p>
                  <div className="bg-gray-800 rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left text-gray-500 font-medium px-4 py-2.5 text-xs">Item</th>
                          <th className="text-right text-gray-500 font-medium px-4 py-2.5 text-xs">Customer Price</th>
                          <th className="text-right text-gray-500 font-medium px-4 py-2.5 text-xs">Engineer Price</th>
                          <th className="text-right text-emerald-500 font-medium px-4 py-2.5 text-xs">Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="text-center text-gray-600 py-6 text-xs">No items recorded</td>
                          </tr>
                        ) : items.map((item, idx) => {
                          const comm = (item.customerPrice || 0) - (item.engineerPrice || 0);
                          return (
                            <tr key={idx} className="border-b border-gray-700 last:border-0">
                              <td className="px-4 py-2.5 text-white text-xs">{item.name || <span className="text-gray-600 italic">—</span>}</td>
                              <td className="px-4 py-2.5 text-right text-gray-300 text-xs font-mono">{formatCurrency(item.customerPrice || 0, currency)}</td>
                              <td className="px-4 py-2.5 text-right text-gray-300 text-xs font-mono">{formatCurrency(item.engineerPrice || 0, currency)}</td>
                              <td className={`px-4 py-2.5 text-right text-xs font-mono font-medium ${comm >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatCurrency(comm, currency)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals summary */}
                <div className="bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total Customer Price</span>
                    <span className="text-white font-mono">{formatCurrency(totCust, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total Engineer Price</span>
                    <span className="text-white font-mono">{formatCurrency(totEng, currency)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-gray-700 pt-2">
                    <span className={totComm >= 0 ? 'text-emerald-400' : 'text-red-400'}>Total Commission</span>
                    <span className={`font-mono ${totComm >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(totComm, currency)}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setViewing(null)}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => { setViewing(null); openEdit(viewing); }}
                    className="flex-1 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
                  >
                    Edit
                  </button>
                </div>

              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
