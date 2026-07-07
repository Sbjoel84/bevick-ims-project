import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { refreshBookings, refreshInventory } from '../lib/refresh';
import { printReport } from '../utils/print';

const RANGES = [
  { id: 'today',  label: 'Daily' },
  { id: 'week',   label: 'Weekly' },
  { id: 'month',  label: 'Monthly' },
  { id: 'year',   label: 'Yearly' },
  { id: 'all',    label: 'All Time' },
  { id: 'custom', label: 'Custom' },
];

function getRange(id, s, e) {
  const now = new Date();
  if (id === 'today') {
    const a = new Date(now); a.setHours(0, 0, 0, 0);
    const b = new Date(now); b.setHours(23, 59, 59, 999);
    return { start: a, end: b };
  }
  if (id === 'week') {
    const day = now.getDay();
    const a = new Date(now); a.setDate(now.getDate() - (day === 0 ? 6 : day - 1)); a.setHours(0, 0, 0, 0);
    const b = new Date(a); b.setDate(a.getDate() + 6); b.setHours(23, 59, 59, 999);
    return { start: a, end: b };
  }
  if (id === 'month') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end:   new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }
  if (id === 'year') {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end:   new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }
  if (id === 'all') {
    return { start: new Date(0), end: new Date(8.64e15) };
  }
  return {
    start: s ? new Date(s + 'T00:00:00') : new Date(0),
    end:   e ? new Date(e + 'T23:59:59') : new Date(),
  };
}

export default function GeneralRecord() {
  const { state, dispatch } = useApp();
  const { bookings, inventory, branch, bname } = state;

  useEffect(() => {
    refreshBookings(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'bookings', data } }));
    refreshInventory(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'inventory', data } }));
  }, []);

  const [range, setRange]   = useState('all');
  const [customS, setCustomS] = useState('');
  const [customE, setCustomE] = useState('');
  const [search, setSearch] = useState('');

  const { start, end } = getRange(range, customS, customE);

  // Bookings filtered by branch + date range, excluding cancelled
  const filteredBookings = useMemo(() => {
    return bookings
      .filter(b => branch ? (!b.branch || b.branch === branch) : true)
      .filter(b => b.status !== 'cancelled')
      .filter(b => {
        const d = new Date(b.date);
        return d >= start && d <= end;
      });
  }, [bookings, branch, start, end]);

  // Per-item summary derived from bookings + inventory
  const records = useMemo(() => {
    const map = new Map();

    filteredBookings.forEach(booking => {
      // Support both bookingType field and legacy type field
      const btype = booking.bookingType || booking.type || 'others';
      const isFF = btype === 'full_factory';
      (booking.items || []).forEach(item => {
        if (!item.name) return;
        const key = item.name.toLowerCase();
        if (!map.has(key)) {
          map.set(key, { name: item.name, ffQty: 0, othersQty: 0 });
        }
        const rec = map.get(key);
        if (isFF) rec.ffQty    += item.qty || 1;
        else       rec.othersQty += item.qty || 1;
      });
    });

    return Array.from(map.values()).map(rec => {
      let kubQty = 0;
      let dubQty = 0;
      inventory.forEach(inv => {
        if (inv.name?.toLowerCase() === rec.name.toLowerCase()) {
          if (inv.branch === 'KUB') kubQty += inv.qty || 0;
          else if (inv.branch === 'DUB') dubQty += inv.qty || 0;
        }
      });

      const itemsSold    = rec.ffQty + rec.othersQty;
      const totalStock   = kubQty + dubQty;
      const goodsToOrder = Math.max(0, itemsSold - totalStock);
      const goodsForSales = Math.max(0, totalStock - itemsSold);

      return { ...rec, itemsSold, kubQty, dubQty, goodsToOrder, goodsForSales };
    });
  }, [filteredBookings, inventory]);

  const filtered = search
    ? records.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : records;

  const totals = useMemo(() => ({
    ffQty:        filtered.reduce((s, r) => s + r.ffQty, 0),
    othersQty:    filtered.reduce((s, r) => s + r.othersQty, 0),
    itemsSold:    filtered.reduce((s, r) => s + r.itemsSold, 0),
    kubQty:       filtered.reduce((s, r) => s + r.kubQty, 0),
    dubQty:       filtered.reduce((s, r) => s + r.dubQty, 0),
    goodsToOrder: filtered.reduce((s, r) => s + r.goodsToOrder, 0),
    goodsForSales:filtered.reduce((s, r) => s + r.goodsForSales, 0),
  }), [filtered]);

  function handlePrint() {
    const rangeLabel = RANGES.find(r => r.id === range)?.label || '';
    const dateRange = range === 'custom'
      ? (customS && customE ? `${customS} – ${customE}` : rangeLabel)
      : rangeLabel;
    printReport({
      title: 'General Record',
      subtitle: bname,
      columns: [
        { key: 'name',          label: 'Item' },
        { key: 'ffQty',         label: 'Full Factory',    align: 'tc' },
        { key: 'othersQty',     label: 'Others',          align: 'tc' },
        { key: 'itemsSold',     label: 'Items Sold',      align: 'tc' },
        { key: 'kubQty',        label: 'Stocks (Kubwa)',  align: 'tc' },
        { key: 'dubQty',        label: 'Stocks (Dubai)',  align: 'tc' },
        { key: 'goodsToOrder',  label: 'Goods to Order',  align: 'tc' },
        { key: 'goodsForSales', label: 'Goods for Sales', align: 'tc' },
      ],
      rows: filtered,
      summaryRows: [
        { label: 'Full Factory',   value: totals.ffQty },
        { label: 'Others',         value: totals.othersQty },
        { label: 'Items Sold',     value: totals.itemsSold,     bold: true },
        { label: 'Goods to Order', value: totals.goodsToOrder },
        { label: 'Goods for Sales',value: totals.goodsForSales, bold: true },
      ],
      dateRange,
      state,
    });
  }

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">General Record</h1>
          <p className="text-gray-500 text-sm mt-0.5">{bname} · Booking-based inventory summary</p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white text-sm font-medium transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
          </svg>
          Print
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search item…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
        />
        <div className="flex gap-2 flex-wrap">
          {RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`filter-tab px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                range === r.id ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={customS}
              onChange={e => setCustomS(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-600 text-xs">to</span>
            <input
              type="date"
              value={customE}
              onChange={e => setCustomE(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <p className="text-gray-500 text-xs mb-1">Items Sold</p>
          <p className="font-syne font-bold text-white text-xl">{totals.itemsSold}</p>
          <p className="text-gray-600 text-xs mt-0.5">FF {totals.ffQty} · Others {totals.othersQty}</p>
        </div>
        <div className="stat-card bg-gray-900 border border-blue-500/30 rounded-xl px-4 py-3">
          <p className="text-gray-500 text-xs mb-1">Full Factory</p>
          <p className="font-syne font-bold text-blue-400 text-xl">{totals.ffQty}</p>
        </div>
        <div className="stat-card bg-gray-900 border border-purple-500/30 rounded-xl px-4 py-3">
          <p className="text-gray-500 text-xs mb-1">Others</p>
          <p className="font-syne font-bold text-purple-400 text-xl">{totals.othersQty}</p>
        </div>
        <div className={`stat-card bg-gray-900 border rounded-xl px-4 py-3 ${totals.goodsToOrder > 0 ? 'border-amber-500/40' : 'border-green-500/30'}`}>
          <p className="text-gray-500 text-xs mb-1">Goods to Order</p>
          <p className={`font-syne font-bold text-xl ${totals.goodsToOrder > 0 ? 'text-amber-400' : 'text-green-400'}`}>
            {totals.goodsToOrder}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[65vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-900">
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 font-medium px-5 py-3 whitespace-nowrap">Item</th>
                <th className="text-center text-gray-500 font-medium px-4 py-3 whitespace-nowrap">Full Factory</th>
                <th className="text-center text-gray-500 font-medium px-4 py-3 whitespace-nowrap">Others</th>
                <th className="text-center text-gray-500 font-medium px-4 py-3 whitespace-nowrap">Items Sold</th>
                <th className="text-center text-gray-500 font-medium px-4 py-3 whitespace-nowrap">Stocks in Kubwa</th>
                <th className="text-center text-gray-500 font-medium px-4 py-3 whitespace-nowrap">Stocks in Dubai</th>
                <th className="text-center text-gray-500 font-medium px-4 py-3 whitespace-nowrap">Goods to Order</th>
                <th className="text-center text-gray-500 font-medium px-4 py-3 whitespace-nowrap">Goods for Sales</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-gray-600 py-12 text-sm">
                    No booking records found for this period
                  </td>
                </tr>
              ) : (
                <>
                  {filtered.map((row, i) => (
                    <tr key={i} className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30 transition-colors">
                      <td className="px-5 py-3 text-white font-medium">{row.name}</td>
                      <td className="px-4 py-3 text-center font-mono text-blue-400">
                        {row.ffQty > 0 ? row.ffQty : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-purple-400">
                        {row.othersQty > 0 ? row.othersQty : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono font-semibold text-white">
                        {row.itemsSold}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-gray-300">
                        {row.kubQty > 0 ? row.kubQty : <span className="text-gray-600">0</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-gray-300">
                        {row.dubQty > 0 ? row.dubQty : <span className="text-gray-600">0</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono">
                        {row.goodsToOrder > 0
                          ? <span className="text-amber-400 font-semibold">{row.goodsToOrder}</span>
                          : <span className="text-green-500 text-xs font-medium">Sufficient</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-center font-mono font-semibold text-emerald-400">
                        {row.goodsForSales}
                      </td>
                    </tr>
                  ))}

                  {/* Totals row */}
                  <tr className="border-t-2 border-gray-700 bg-gray-800/40">
                    <td className="px-5 py-3 text-gray-400 font-semibold text-xs uppercase tracking-wide">
                      Total ({filtered.length} item{filtered.length !== 1 ? 's' : ''})
                    </td>
                    <td className="px-4 py-3 text-center text-blue-400 font-mono font-bold">{totals.ffQty}</td>
                    <td className="px-4 py-3 text-center text-purple-400 font-mono font-bold">{totals.othersQty}</td>
                    <td className="px-4 py-3 text-center text-white font-mono font-bold">{totals.itemsSold}</td>
                    <td className="px-4 py-3 text-center text-gray-300 font-mono font-bold">{totals.kubQty}</td>
                    <td className="px-4 py-3 text-center text-gray-300 font-mono font-bold">{totals.dubQty}</td>
                    <td className="px-4 py-3 text-center text-amber-400 font-mono font-bold">{totals.goodsToOrder}</td>
                    <td className="px-4 py-3 text-center text-emerald-400 font-mono font-bold">{totals.goodsForSales}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
