import { useState, useEffect } from 'react';
import { useApp, formatCurrency, fmtDate, genId } from '../context/AppContext';
import { refreshExpenses } from '../lib/refresh';
import ReportModal from '../components/ReportModal';
import DeleteRequestModal from '../components/DeleteRequestModal';

const CATEGORIES = ['Operations', 'Logistics', 'Salaries', 'Utilities', 'Maintenance', 'Marketing', 'Office', 'Other'];
const BRANCHES = [{ id: 'DUB', label: 'Dubai Market' }, { id: 'KUB', label: 'Kubwa Office' }];

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg">
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

const EMPTY = { desc: '', amount: '', category: 'Operations', branch: 'DUB', date: new Date().toISOString().slice(0, 10), note: '' };

export default function Expenses() {
  const { state, dispatch } = useApp();
  const { expenses, currency, branch, bname, user } = state;

  useEffect(() => {
    refreshExpenses(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'expenses', data } }));
  }, []);

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null); // expense being edited, or null for add
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteReq, setDeleteReq] = useState(null);

  const expenseColumns = [
    { key: 'date',     label: 'Date',     format: v => fmtDate(v) },
    { key: 'desc',     label: 'Description' },
    { key: 'category', label: 'Category' },
    { key: 'branch',   label: 'Branch',   format: v => v === 'DUB' ? 'Dubai Market' : 'Kubwa Office' },
    { key: 'amount',   label: 'Amount',   align: 'tr', format: v => formatCurrency(v || 0, currency) },
  ];

  function getExpenseSummary(data) {
    const total = data.reduce((s, e) => s + (e.amount || 0), 0);
    const byCat = CATEGORIES.map(cat => ({
      label: cat, value: formatCurrency(data.filter(e => e.category === cat).reduce((s, e) => s + (e.amount || 0), 0), currency),
    })).filter(x => data.some(e => e.category === x.label));
    return [
      ...byCat,
      { label: 'Total Expenses', value: formatCurrency(total, currency), bold: true },
    ];
  }

  const filtered = expenses
    .filter(e => branch ? e.branch === branch : true)
    .filter(e => filterCat === 'all' || e.category === filterCat)
    .filter(e => {
      const q = search.toLowerCase();
      return !q || e.desc?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q);
    });

  const total = filtered.reduce((s, e) => s + (e.amount || 0), 0);

  // Group totals by category
  const byCategory = CATEGORIES.map(cat => ({
    cat,
    total: filtered.filter(e => e.category === cat).reduce((s, e) => s + (e.amount || 0), 0),
  })).filter(x => x.total > 0);

  function openEdit(e) {
    setEditing(e);
    setForm({
      desc: e.desc || '',
      amount: String(e.amount || ''),
      category: e.category || 'Operations',
      branch: e.branch || 'DUB',
      date: e.date ? e.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      note: e.note || '',
    });
    setModal(true);
  }

  function submit() {
    if (!form.desc.trim() || !form.amount) return;
    if (editing) {
      dispatch({
        type: 'UPDATE_EXPENSE',
        payload: {
          ...editing,
          desc: form.desc,
          amount: parseFloat(form.amount),
          category: form.category,
          branch: branch || form.branch,
          date: form.date || editing.date,
          note: form.note,
        },
      });
    } else {
      dispatch({
        type: 'ADD_EXPENSE',
        payload: {
          id: genId('E'),
          desc: form.desc,
          amount: parseFloat(form.amount),
          category: form.category,
          branch: branch || form.branch,
          date: form.date || new Date().toISOString(),
          note: form.note,
          createdBy: user?.name,
        },
      });
    }
    setModal(false);
    setEditing(null);
    setForm(EMPTY);
  }

  function del(id) {
    if (user?.role === 'super_admin') {
      if (window.confirm('Delete this expense?')) dispatch({ type: 'DELETE_EXPENSE', payload: id });
    } else {
      const e = expenses.find(x => x.id === id);
      setDeleteReq({ type: 'expense', targetId: id, label: e?.desc || id });
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Expenses</h1>
          <p className="text-gray-500 text-sm mt-0.5">{bname}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Report
          </button>
          <button
            onClick={() => { setEditing(null); setForm({ ...EMPTY, branch: branch || 'DUB' }); setModal(true); }}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            Add Expense
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 lg:col-span-2 overflow-hidden min-w-0">
          <p className="text-gray-500 text-xs font-medium mb-1">Total Expenses</p>
          <p className="font-syne text-xs sm:text-sm md:text-2xl font-bold text-white break-all">{formatCurrency(total, currency)}</p>
          <p className="text-gray-600 text-xs mt-1">{filtered.length} entries</p>
        </div>
        {byCategory.slice(0, 2).map(x => (
          <div key={x.cat} className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0">
            <p className="text-gray-500 text-xs font-medium mb-1">{x.cat}</p>
            <p className="font-syne text-xs sm:text-sm md:text-lg font-bold text-white break-all">{formatCurrency(x.total, currency)}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search expenses…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 font-medium px-5 py-3">Description</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Category</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Date</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Branch</th>
                <th className="text-right text-gray-500 font-medium px-5 py-3">Amount</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-600 py-12">No expenses found</td></tr>
              ) : filtered.map(e => (
                <tr key={e.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-white font-medium">{e.desc}</p>
                    {e.note && <p className="text-gray-500 text-xs mt-0.5">{e.note}</p>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-lg">{e.category}</span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-400">{fmtDate(e.date)}</td>
                  <td className="px-5 py-3.5 text-gray-400">{e.branch === 'DUB' ? 'Dubai' : 'Kubwa'}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-red-400 font-medium">{formatCurrency(e.amount, currency)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(e)} className="text-gray-500 hover:text-blue-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <button onClick={() => del(e.id)} className="text-gray-500 hover:text-red-400 transition-colors">
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

      {reportOpen && (
        <ReportModal
          title="Expenses"
          data={filtered}
          dateKey="date"
          columns={expenseColumns}
          getSummary={getExpenseSummary}
          onClose={() => setReportOpen(false)}
          state={state}
        />
      )}

      {modal && (
        <Modal title={editing ? 'Edit Expense' : 'Add Expense'} onClose={() => { setModal(false); setEditing(null); setForm(EMPTY); }}>
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Description <span className="text-red-400">*</span></label>
              <input
                type="text"
                placeholder="e.g. Generator fuel"
                value={form.desc}
                onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Amount <span className="text-red-400">*</span></label>
                <input
                  type="number"
                  min={0}
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
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
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Note</label>
              <textarea
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setModal(false); setEditing(null); setForm(EMPTY); }} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
              <button
                onClick={submit}
                disabled={!form.desc.trim() || !form.amount}
                className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
              >
                {editing ? 'Save Changes' : 'Add Expense'}
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
