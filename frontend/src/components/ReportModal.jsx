import { useState } from 'react';
import { printReport } from '../utils/print';

const RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'week',  label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'year',  label: 'This Year' },
  { id: 'custom',label: 'Custom' },
];

function getRange(id, s, e) {
  const now = new Date();
  if (id === 'today') {
    const a = new Date(now); a.setHours(0,0,0,0);
    const b = new Date(now); b.setHours(23,59,59,999);
    return { start: a, end: b };
  }
  if (id === 'week') {
    const day = now.getDay();
    const a = new Date(now); a.setDate(now.getDate() - (day === 0 ? 6 : day - 1)); a.setHours(0,0,0,0);
    const b = new Date(a); b.setDate(a.getDate() + 6); b.setHours(23,59,59,999);
    return { start: a, end: b };
  }
  if (id === 'month') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999) };
  }
  if (id === 'year') {
    return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999) };
  }
  return { start: s ? new Date(s + 'T00:00:00') : new Date(0), end: e ? new Date(e + 'T23:59:59') : new Date() };
}

function rangeLabel(id, s, e) {
  if (id === 'custom') return `${s || '…'} to ${e || '…'}`;
  return RANGES.find(r => r.id === id)?.label || id;
}

// columns: [{ key, label, align? ('tr'|'tc'|''), format?(val,row)=>string }]
// dateKey: string key on each record for date filtering, or null to show all
// getSummary: (filteredData) => [{ label, value, bold? }]
export default function ReportModal({ title, data, dateKey, columns, getSummary, onClose, state }) {
  const [range, setRange]     = useState('month');
  const [customS, setCustomS] = useState('');
  const [customE, setCustomE] = useState('');

  const { start, end } = getRange(range, customS, customE);

  const rows = dateKey
    ? data.filter(item => { const d = new Date(item[dateKey]); return d >= start && d <= end; })
    : data;

  const summary = getSummary ? getSummary(rows) : null;
  const label   = rangeLabel(range, customS, customE);

  function handlePrint() {
    printReport({
      title,
      subtitle:   state.bname,
      columns,
      rows,
      summaryRows: summary,
      dateRange:   dateKey ? label : null,
      state,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h2 className="font-syne font-semibold text-white">{title} Report</h2>
            <p className="text-gray-500 text-xs mt-0.5">{state.bname}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">

          {/* Date range selector (only when dateKey is provided) */}
          {dateKey && (
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-2">Period</label>
              <div className="flex gap-2 flex-wrap">
                {RANGES.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setRange(r.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${range === r.id ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {range === 'custom' && (
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="text-gray-500 text-xs block mb-1">From</label>
                    <input type="date" value={customS} onChange={e => setCustomS(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs block mb-1">To</label>
                    <input type="date" value={customE} onChange={e => setCustomE(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Preview table */}
          <div>
            <p className="text-gray-500 text-xs mb-2">
              {rows.length} record(s){dateKey ? ` · ${label}` : ' · Current snapshot'}
            </p>
            <div className="bg-gray-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-700 bg-gray-800 sticky top-0">
                      {columns.map(c => (
                        <th key={c.key} className={`text-gray-500 font-medium px-4 py-2.5 whitespace-nowrap ${c.align === 'tr' ? 'text-right' : c.align === 'tc' ? 'text-center' : 'text-left'}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={columns.length} className="text-center text-gray-600 py-8">No records in this period</td></tr>
                    ) : rows.slice(0, 8).map((row, i) => (
                      <tr key={i} className="border-b border-gray-700 last:border-0">
                        {columns.map(c => {
                          const raw = row[c.key];
                          const val = c.format ? c.format(raw, row) : (raw ?? '—');
                          return (
                            <td key={c.key} className={`px-4 py-2 text-gray-300 ${c.align === 'tr' ? 'text-right' : c.align === 'tc' ? 'text-center' : ''}`}>
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {rows.length > 8 && (
                      <tr>
                        <td colSpan={columns.length} className="text-center text-gray-600 py-2 text-xs">
                          +{rows.length - 8} more rows in printed report
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Summary */}
          {summary && summary.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 space-y-1.5">
              {summary.map(s => (
                <div key={s.label} className={`flex justify-between text-sm ${s.bold ? 'font-semibold' : ''}`}>
                  <span className="text-gray-400">{s.label}</span>
                  <span className={s.bold ? 'text-white' : 'text-gray-300'}>{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-800 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
            Cancel
          </button>
          <button
            onClick={handlePrint}
            disabled={rows.length === 0}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
            </svg>
            Print Report ({rows.length})
          </button>
        </div>
      </div>
    </div>
  );
}
