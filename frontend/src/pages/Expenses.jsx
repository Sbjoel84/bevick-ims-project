import { useState, useEffect } from 'react';
import { useApp, formatCurrency, fmtDate, genId } from '../context/AppContext';
import { refreshExpenses } from '../lib/refresh';
import ReportModal from '../components/ReportModal';
import DeleteRequestModal from '../components/DeleteRequestModal';

const EXPENSE_TYPES = [
  { id: 'cashIn',    label: 'Cash In' },
  { id: 'roExpense', label: 'RO Expense' },
  { id: 'siteTP',    label: 'Site TP & Others' },
  { id: 'officeExp', label: 'Office Expense' },
];

const BRANCHES = [{ id: 'DUB', label: 'Dubai Market' }, { id: 'KUB', label: 'Kubwa Office' }];

export function getExpenseType(e) {
  if (e.expType) return e.expType;
  if (['Operations', 'Marketing', 'Maintenance'].includes(e.category)) return 'roExpense';
  if (['Logistics', 'Salaries'].includes(e.category)) return 'siteTP';
  return 'officeExp';
}

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

const EMPTY = { desc: '', amount: '', expType: 'roExpense', branch: 'DUB', date: new Date().toISOString().slice(0, 10), note: '' };

export default function Expenses() {
  const { state, dispatch } = useApp();
  const { expenses, currency, branch, bname, user } = state;

  useEffect(() => {
    refreshExpenses(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'expenses', data } }));
  }, []);

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteReq, setDeleteReq] = useState(null);

  const expenseColumns = [
    { key: 'date',   label: 'Date',                              format: v => fmtDate(v) },
    { key: 'desc',   label: 'Details' },
    { key: '_ci',    label: 'Cash In (₦)',           align: 'tr', format: (_, row) => getExpenseType(row) === 'cashIn'    ? formatCurrency(row.amount || 0, currency) : '' },
    { key: '_ro',    label: 'Cash Out RO Expense',   align: 'tr', format: (_, row) => getExpenseType(row) === 'roExpense' ? formatCurrency(row.amount || 0, currency) : '' },
    { key: '_st',    label: 'Cash Out Site TP & Others', align: 'tr', format: (_, row) => getExpenseType(row) === 'siteTP'    ? formatCurrency(row.amount || 0, currency) : '' },
    { key: '_oe',    label: 'Cash Out Office Exp.',  align: 'tr', format: (_, row) => getExpenseType(row) === 'officeExp' ? formatCurrency(row.amount || 0, currency) : '' },
    { key: 'branch', label: 'Branch',                            format: v => v === 'DUB' ? 'Dubai Market' : 'Kubwa Office' },
  ];

  function getExpenseSummary(data) {
    const cashIn = data.filter(e => getExpenseType(e) === 'cashIn').reduce((s, e) => s + (e.amount || 0), 0);
    const roExp  = data.filter(e => getExpenseType(e) === 'roExpense').reduce((s, e) => s + (e.amount || 0), 0);
    const siteTP = data.filter(e => getExpenseType(e) === 'siteTP').reduce((s, e) => s + (e.amount || 0), 0);
    const offExp = data.filter(e => getExpenseType(e) === 'officeExp').reduce((s, e) => s + (e.amount || 0), 0);
    const total  = roExp + siteTP + offExp;
    return [
      { label: 'Cash In',              value: formatCurrency(cashIn, currency) },
      { label: 'RO Expenses',          value: formatCurrency(roExp, currency) },
      { label: 'Site TP & Others',     value: formatCurrency(siteTP, currency) },
      { label: 'Office Expenses',      value: formatCurrency(offExp, currency) },
      { label: 'Total Expenses',       value: formatCurrency(total, currency), bold: true },
      { label: 'Net Balance',          value: formatCurrency(cashIn - total, currency) },
    ];
  }

  const filtered = expenses
    .filter(e => branch ? e.branch === branch : true)
    .filter(e => filterType === 'all' || getExpenseType(e) === filterType)
    .filter(e => {
      const q = search.toLowerCase();
      return !q || e.desc?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const now  = new Date();
      const curY = now.getFullYear();
      const curM = now.getMonth();
      const da   = new Date(a.date);
      const db   = new Date(b.date);
      const aIsCur = da.getFullYear() === curY && da.getMonth() === curM ? 0 : 1;
      const bIsCur = db.getFullYear() === curY && db.getMonth() === curM ? 0 : 1;
      if (aIsCur !== bIsCur) return aIsCur - bIsCur;
      return db - da;
    });

  // Compute running balance and cumulative expenses (ledger-style)
  let runBalance = 0;
  let cumExpenses = 0;
  const ledger = filtered.map(e => {
    const type = getExpenseType(e);
    const amt = e.amount || 0;
    if (type === 'cashIn') { runBalance += amt; }
    else { runBalance -= amt; cumExpenses += amt; }
    return { ...e, _type: type, _balance: runBalance, _cumExp: cumExpenses };
  });

  const totalCashIn   = filtered.filter(e => getExpenseType(e) === 'cashIn').reduce((s, e) => s + (e.amount || 0), 0);
  const totalExpenses = filtered.filter(e => getExpenseType(e) !== 'cashIn').reduce((s, e) => s + (e.amount || 0), 0);

  function openEdit(e) {
    setEditing(e);
    setForm({
      desc:    e.desc || '',
      amount:  String(e.amount || ''),
      expType: getExpenseType(e),
      branch:  e.branch || 'DUB',
      date:    e.date ? e.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      note:    e.note || '',
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
          desc:    form.desc,
          amount:  parseFloat(form.amount),
          expType: form.expType,
          branch:  branch || form.branch,
          date:    form.date || editing.date,
          note:    form.note,
        },
      });
    } else {
      dispatch({
        type: 'ADD_EXPENSE',
        payload: {
          id:        genId('E'),
          desc:      form.desc,
          amount:    parseFloat(form.amount),
          expType:   form.expType,
          branch:    branch || form.branch,
          date:      form.date || new Date().toISOString(),
          note:      form.note,
          createdBy: user?.name,
        },
      });
    }
    setModal(false);
    setEditing(null);
    setForm(EMPTY);
  }

  function del(id) {
    if (['main_super_admin', 'super_admin', 'admin'].includes(user?.role)) {
      if (window.confirm('Delete this entry?')) dispatch({ type: 'DELETE_EXPENSE', payload: id });
    } else {
      const e = expenses.find(x => x.id === id);
      setDeleteReq({ type: 'expense', targetId: id, label: e?.desc || id });
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
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
            Add Entry
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 lg:col-span-2 overflow-hidden min-w-0">
          <p className="text-gray-500 text-xs font-medium mb-1">Total Expenses</p>
          <p className="font-syne text-xs sm:text-sm md:text-2xl font-bold text-red-400 break-all">{formatCurrency(totalExpenses, currency)}</p>
          <p className="text-gray-600 text-xs mt-1">{filtered.filter(e => getExpenseType(e) !== 'cashIn').length} expense entries</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0">
          <p className="text-gray-500 text-xs font-medium mb-1">Cash In</p>
          <p className="font-syne text-xs sm:text-sm md:text-lg font-bold text-green-400 break-all">{formatCurrency(totalCashIn, currency)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0">
          <p className="text-gray-500 text-xs font-medium mb-1">Net Balance</p>
          <p className={`font-syne text-xs sm:text-sm md:text-lg font-bold break-all ${totalCashIn - totalExpenses >= 0 ? 'text-white' : 'text-red-400'}`}>
            {formatCurrency(totalCashIn - totalExpenses, currency)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search entries…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Types</option>
          {EXPENSE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      {/* Ledger Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 font-medium px-4 py-3 whitespace-nowrap">Date</th>
                <th className="text-left text-gray-500 font-medium px-4 py-3">Details</th>
                <th className="text-right text-gray-500 font-medium px-4 py-3 whitespace-nowrap">Cash In (₦)</th>
                <th className="text-right text-gray-500 font-medium px-4 py-3 whitespace-nowrap">Cash Out RO Exp.</th>
                <th className="text-right text-gray-500 font-medium px-4 py-3 whitespace-nowrap">Cash Out Site TP &amp; Others</th>
                <th className="text-right text-gray-500 font-medium px-4 py-3 whitespace-nowrap">Cash Out Office Exp.</th>
                <th className="text-right text-gray-500 font-medium px-4 py-3 whitespace-nowrap">Balance</th>
                <th className="text-right text-gray-500 font-medium px-4 py-3 whitespace-nowrap">Total Expenses</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-gray-600 py-12">No entries found</td></tr>
              ) : ledger.map(e => (
                <tr key={e.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3.5 text-gray-400 whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="px-4 py-3.5">
                    <p className="text-white font-medium">{e.desc}</p>
                    {e.note && <p className="text-gray-500 text-xs mt-0.5">{e.note}</p>}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-green-400">
                    {e._type === 'cashIn' ? formatCurrency(e.amount, currency) : ''}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-orange-400">
                    {e._type === 'roExpense' ? formatCurrency(e.amount, currency) : ''}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-blue-400">
                    {e._type === 'siteTP' ? formatCurrency(e.amount, currency) : ''}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-yellow-400">
                    {e._type === 'officeExp' ? formatCurrency(e.amount, currency) : ''}
                  </td>
                  <td className={`px-4 py-3.5 text-right font-mono font-semibold ${e._balance >= 0 ? 'text-white' : 'text-red-400'}`}>
                    {formatCurrency(e._balance, currency)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-red-400">
                    {formatCurrency(e._cumExp, currency)}
                  </td>
                  <td className="px-4 py-3.5">
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
        <Modal title={editing ? 'Edit Entry' : 'Add Entry'} onClose={() => { setModal(false); setEditing(null); setForm(EMPTY); }}>
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Details <span className="text-red-400">*</span></label>
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
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Type</label>
                <select
                  value={form.expType}
                  onChange={e => setForm(f => ({ ...f, expType: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {EXPENSE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
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
                {editing ? 'Save Changes' : 'Add Entry'}
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
