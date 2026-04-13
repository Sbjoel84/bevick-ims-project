import { useState } from 'react';
import { useApp, formatCurrency, fmtDateTime } from '../context/AppContext';

const TYPE_LABELS = {
  inventory: 'Inventory Item',
  sale:      'Sale',
  customer:  'Customer',
  expense:   'Expense',
  supplier:  'Supplier',
  booking:   'Booking',
};

const TYPE_COLORS = {
  inventory: 'bg-blue-950 text-blue-400',
  sale:      'bg-blue-950 text-blue-400',
  customer:  'bg-purple-950 text-purple-400',
  expense:   'bg-red-950 text-red-400',
  supplier:  'bg-amber-950 text-amber-400',
  booking:   'bg-indigo-950 text-indigo-400',
};

export default function RecycleBin() {
  const { state, dispatch } = useApp();
  const { recycleBin, currency, branch } = state;

  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = recycleBin
    .filter(i => branch ? (!i.branch || i.branch === branch) : true)
    .filter(i => filterType === 'all' || i._type === filterType)
    .filter(i => {
      const q = search.toLowerCase();
      return !q || i.name?.toLowerCase().includes(q) || i.id?.toLowerCase().includes(q) || i.desc?.toLowerCase().includes(q) || i.customer?.toLowerCase().includes(q);
    });

  function getLabel(item) {
    return item.name || item.customer || item.desc || item.id;
  }

  function getSub(item) {
    if (item._type === 'sale') return `${formatCurrency(item.total || 0, currency)} · ${item.customer}`;
    if (item._type === 'expense') return `${formatCurrency(item.amount || 0, currency)} · ${item.category}`;
    if (item._type === 'inventory') return `${item.qty} ${item.unit} · ${item.category}`;
    if (item._type === 'supplier') return item.category;
    return null;
  }

  function restore(id) {
    dispatch({ type: 'RESTORE_ITEM', payload: id });
  }

  function permDelete(id) {
    if (window.confirm('Permanently delete this item? This cannot be undone.')) {
      dispatch({ type: 'PERM_DELETE', payload: id });
    }
  }

  function emptyBin() {
    if (window.confirm(`Permanently delete all ${filtered.length} items? This cannot be undone.`)) {
      dispatch({ type: 'EMPTY_BIN', payload: { branch } });
    }
  }

  const types = [...new Set(recycleBin.map(i => i._type))];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Recycle Bin</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={emptyBin}
            className="flex items-center gap-2 bg-red-950 hover:bg-red-900 text-red-400 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            Empty Bin
          </button>
        )}
      </div>

      {recycleBin.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl py-20 flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </div>
          <p className="text-gray-500 text-sm">Recycle bin is empty</p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search deleted items…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${filterType === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >All</button>
              {types.map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium capitalize transition-colors ${filterType === t ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                  {TYPE_LABELS[t] || t}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-gray-500 font-medium px-5 py-3">Item</th>
                    <th className="text-left text-gray-500 font-medium px-5 py-3">Type</th>
                    <th className="text-left text-gray-500 font-medium px-5 py-3">Deleted</th>
                    <th className="text-left text-gray-500 font-medium px-5 py-3">ID</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="text-center text-gray-600 py-12">No items match</td></tr>
                  ) : filtered.map(item => (
                    <tr key={item.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="text-white font-medium">{getLabel(item)}</p>
                        {getSub(item) && <p className="text-gray-500 text-xs mt-0.5">{getSub(item)}</p>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${TYPE_COLORS[item._type] || 'bg-gray-800 text-gray-400'}`}>
                          {TYPE_LABELS[item._type] || item._type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-400 text-xs">{item._deletedAt ? fmtDateTime(item._deletedAt) : '—'}</td>
                      <td className="px-5 py-3.5 text-gray-500 font-mono text-xs">{item.id}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3 justify-end">
                          <button
                            onClick={() => restore(item.id)}
                            className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                            Restore
                          </button>
                          <button
                            onClick={() => permDelete(item.id)}
                            className="text-gray-500 hover:text-red-400 transition-colors"
                          >
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
        </>
      )}
    </div>
  );
}
