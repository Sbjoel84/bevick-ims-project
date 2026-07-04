import { useState } from 'react';
import { RANGE_PRESETS, getDateRange } from '../utils/dateRanges';

const INPUT_CLS = 'bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500';

// Shared filter bar for both transaction ledgers. `fields` controls which
// optional selects render (category/source are inventory-only); branch,
// transaction type, officer, search, and the date-range presets are common
// to both ledgers.
export default function LedgerFilterBar({ filters, onChange, onReset, branches, categories, transactionTypes, fields = {} }) {
  const [datePreset, setDatePreset] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  function applyPreset(id) {
    setDatePreset(id);
    if (id === '') { onChange({ start: null, end: null }); return; }
    if (id === 'custom') return; // wait for both custom dates
    const { start, end } = getDateRange(id);
    onChange({ start, end });
  }

  function applyCustomRange(s, e) {
    setCustomStart(s);
    setCustomEnd(e);
    if (s || e) {
      const { start, end } = getDateRange('custom', s, e);
      onChange({ start, end });
    }
  }

  const hasActiveFilters = filters.search || datePreset || filters.branch !== 'all'
    || (fields.category && filters.category !== 'all')
    || filters.transactionType !== 'all' || filters.officer || (fields.source && filters.source);

  function reset() {
    setDatePreset('');
    setCustomStart('');
    setCustomEnd('');
    onReset();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search transaction no., product, officer, reference…"
          value={filters.search}
          onChange={e => onChange({ search: e.target.value })}
          className={`${INPUT_CLS} w-full sm:w-72`}
        />
        <select value={datePreset} onChange={e => applyPreset(e.target.value)} className={INPUT_CLS}>
          <option value="">All Dates</option>
          {RANGE_PRESETS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        {datePreset === 'custom' && (
          <>
            <input type="date" value={customStart} onChange={e => applyCustomRange(e.target.value, customEnd)} className={INPUT_CLS} />
            <input type="date" value={customEnd} onChange={e => applyCustomRange(customStart, e.target.value)} className={INPUT_CLS} />
          </>
        )}
        <select value={filters.branch} onChange={e => onChange({ branch: e.target.value })} className={INPUT_CLS}>
          <option value="all">All Branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
        {fields.category && (
          <select value={filters.category} onChange={e => onChange({ category: e.target.value })} className={INPUT_CLS}>
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select value={filters.transactionType} onChange={e => onChange({ transactionType: e.target.value })} className={INPUT_CLS}>
          <option value="all">All Types</option>
          {transactionTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <input
          type="text"
          placeholder="Filter by officer…"
          value={filters.officer}
          onChange={e => onChange({ officer: e.target.value })}
          className={`${INPUT_CLS} w-full sm:w-52`}
        />
        {fields.source && (
          <input
            type="text"
            placeholder="Filter by source…"
            value={filters.source}
            onChange={e => onChange({ source: e.target.value })}
            className={`${INPUT_CLS} w-full sm:w-52`}
          />
        )}
        {hasActiveFilters && (
          <button
            onClick={reset}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
