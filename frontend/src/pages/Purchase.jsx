import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { refreshPurchaseList, refreshInventory, refreshBookings } from '../lib/refresh';

export default function Purchase() {
  const { state, dispatch } = useApp();
  const { purchaseList, bname, user, branch, inventory, bookings, bizName, bizRC } = state;

  const userBranch = user?.bid;
  const canEditAll = ['main_super_admin', 'super_admin', 'admin'].includes(user?.role);

  const visibleBookings = bookings.filter(b => {
    if (canEditAll) return true;
    return b.branch === userBranch;
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
        const totalInStock = inventory
          .filter(i => i.id === item.id)
          .reduce((sum, i) => sum + (i.qty || 0), 0);
        if (totalInStock < (item.qty || 1)) {
          unseenKeys.add(item.id);
          missingItems.push({
            name: item.name,
            booked: item.qty || 1,
            inStock: totalInStock,
            branch: b.branch,
            branchLabel: b.branch === 'DUB' ? 'Dubai' : 'Kubwa',
          });
        }
      });
    });

  useEffect(() => {
    refreshBookings(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'bookings', data } }));
    refreshPurchaseList(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'purchaseList', data } }));
    refreshInventory(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'inventory', data } }));
  }, []);

  const generalInventoryMap = new Map();
  const invIdToNameKey = new Map();
  inventory.forEach(inv => {
    if (!inv.name) return;
    const key = inv.name.toLowerCase().trim();
    if (!generalInventoryMap.has(key)) generalInventoryMap.set(key, { kubQty: 0, dubQty: 0 });
    const entry = generalInventoryMap.get(key);
    if (inv.branch === 'KUB') entry.kubQty += inv.qty || 0;
    else if (inv.branch === 'DUB') entry.dubQty += inv.qty || 0;
    if (inv.id) invIdToNameKey.set(inv.id, key);
  });

  const bookedNotInStock = (() => {
    const map = new Map();
    visibleBookings
      .filter(b => b.status === 'pending' || b.status === 'confirmed')
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .forEach(b => {
        (b.items || []).forEach(item => {
          if (!item.name) return;
          const normName = item.name.toLowerCase().trim();
          if (!map.has(normName)) {
            let stockData = generalInventoryMap.get(normName);
            if (!stockData && item.id) {
              const resolvedKey = invIdToNameKey.get(item.id);
              if (resolvedKey) stockData = generalInventoryMap.get(resolvedKey);
            }
            stockData = stockData || { kubQty: 0, dubQty: 0 };
            const totalInStock = stockData.kubQty + stockData.dubQty;
            const anyInvItem =
              inventory.find(i => i.id === item.id) ||
              inventory.find(i => i.name.toLowerCase().trim() === normName);
            map.set(normName, {
              name: item.name,
              itemId: item.id || anyInvItem?.id || null,
              totalBooked: 0,
              latestDate: b.date,
              inStock: totalInStock,
              kubQty: stockData.kubQty,
              dubQty: stockData.dubQty,
              unit: item.unit || anyInvItem?.unit || '',
              hasPO: existingPurchaseKeys.has(item.id) || existingPurchaseKeys.has(normName),
            });
          }
          map.get(normName).totalBooked += (item.qty || 1);
        });
      });
    return [...map.values()]
      .filter(i => i.totalBooked > i.inStock)
      .map(i => ({ ...i, needed: i.totalBooked - i.inStock }))
      .sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate));
  })();

  const [bookedSearch, setBookedSearch] = useState('');

  const filteredBookedNotInStock = bookedNotInStock.filter(item => {
    const q = bookedSearch.toLowerCase();
    return !q || item.name?.toLowerCase().includes(q);
  });

  function printBookedItems() {
    const logo = `${window.location.origin}/Bevick%20logo.jpeg`;
    const now = new Date().toLocaleString('en-NG');
    const rows = filteredBookedNotInStock.map((item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td style="text-align:left">${item.name}</td>
        <td>${item.needed}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Purchase Requirements</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding-top:20mm}
        .logo-bar{text-align:center;padding:6px 0 4px;border-bottom:1.5px solid #ccc;background:#fff}
        .logo-bar img{height:42px;width:auto;object-fit:contain}
        .page{padding:12px 20px 20px}
        .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}
        .biz-name{font-size:15px;font-weight:700}
        .biz-sub{font-size:9px;color:#555;margin-top:2px}
        .doc-title{font-size:13px;font-weight:700;text-align:right}
        .doc-sub{font-size:9px;color:#555;text-align:right;margin-top:2px}
        table{width:100%;border-collapse:collapse;margin-top:4px}
        th{background:#ffd700;color:#111;font-weight:700;font-size:10px;text-transform:uppercase;text-align:center;padding:6px 8px;border:1.5px solid #000}
        td{border:1px solid #555;padding:5px 8px;text-align:center;font-weight:600}
        td:first-child{width:48px}
        td:last-child{width:60px}
        tr:nth-child(even) td{background:#fffde7}
        .footer{margin-top:16px;padding-top:6px;border-top:1px solid #ccc;font-size:9px;color:#999;display:flex;justify-content:space-between}
        @media print{
          @page{size:A4;margin:6mm 10mm 10mm}
          body{padding-top:20mm}
          .logo-bar{position:fixed;top:0;left:0;right:0;padding:2mm 0;border-bottom:1px solid #ccc;margin-bottom:0}
          img{print-color-adjust:exact;-webkit-print-color-adjust:exact}
        }
      </style></head><body>
      <div class="logo-bar"><img src="${logo}" alt="Logo"/></div>
      <div class="page">
        <div class="header">
          <div>
            <div class="biz-name">${bizName || 'Bevick Packaging Machineries'}</div>
            <div class="biz-sub">${bizRC || 'RC: 967373'}</div>
          </div>
          <div>
            <div class="doc-title">Purchase Requirements</div>
            <div class="doc-sub">Items Needed from Active Bookings</div>
            <div class="doc-sub">Generated: ${now} &nbsp;·&nbsp; ${filteredBookedNotInStock.length} item(s)</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>S/N</th>
              <th style="text-align:left">ITEM NAME</th>
              <th>QTY</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">
          <span>${bizName || 'Bevick IMS'} · Confidential</span>
          <span>Printed: ${now}</span>
        </div>
      </div>
      <script>window.onload=function(){ window.print(); window.onafterprint=function(){ window.close(); }; }</script>
      </body></html>`;
    const win = window.open('', '_blank', 'width=780,height=950,scrollbars=yes');
    if (!win) { alert('Please allow pop-ups to print.'); return; }
    win.document.write(html);
    win.document.close();
  }

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Purchase List</h1>
          <p className="text-gray-500 text-sm mt-0.5">{bname}</p>
        </div>
        {missingItems.length > 0 && (
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
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Items Needed',  value: bookedNotInStock.length,                                   color: 'text-white' },
          { label: 'No PO Yet',           value: bookedNotInStock.filter(i => !i.hasPO).length,             color: 'text-amber-400' },
          { label: 'PO Raised',           value: bookedNotInStock.filter(i => i.hasPO).length,              color: 'text-blue-400' },
          { label: 'Total Units to Buy',  value: bookedNotInStock.reduce((s, i) => s + i.needed, 0),        color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0">
            <p className="text-gray-500 text-xs font-medium mb-1">{s.label}</p>
            <p className={`font-syne font-bold break-all text-sm sm:text-lg md:text-2xl ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Print */}
      <div className="flex flex-wrap items-center gap-3">
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
        <div className="ml-auto flex items-center gap-2">
          <span className="text-gray-500 text-xs">{filteredBookedNotInStock.length} item{filteredBookedNotInStock.length !== 1 ? 's' : ''}</span>
          <button
            onClick={printBookedItems}
            disabled={filteredBookedNotInStock.length === 0}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Print List
          </button>
        </div>
      </div>

      {/* Table */}
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
                <th className="text-center text-gray-500 font-medium px-5 py-3">In Stock (All Branches)</th>
                <th className="text-center text-gray-500 font-medium px-5 py-3">Qty to Purchase</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">PO Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookedNotInStock.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-gray-600 py-12">
                    {bookedNotInStock.length === 0
                      ? 'All booked items are available in inventory'
                      : 'No results match your search'}
                  </td>
                </tr>
              ) : filteredBookedNotInStock.map((item, idx) => (
                <tr key={item.itemId || item.name} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3.5 text-gray-500 text-xs">{idx + 1}</td>
                  <td className="px-5 py-3.5">
                    <p className="text-white font-medium">{item.name}</p>
                    {item.unit && <p className="text-gray-500 text-xs mt-0.5">{item.unit}</p>}
                  </td>
                  <td className="px-5 py-3.5 text-center font-mono text-white">{item.totalBooked}</td>
                  <td className="px-5 py-3.5 text-center font-mono">
                    <span className="text-red-400">{item.inStock}</span>
                    {(item.kubQty > 0 || item.dubQty > 0) && (
                      <p className="text-gray-600 text-xs mt-0.5">KUB {item.kubQty} · DUB {item.dubQty}</p>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="bg-amber-500/20 text-amber-400 font-mono font-bold text-sm px-2 py-0.5 rounded-lg">{item.needed}</span>
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

    </div>
  );
}
