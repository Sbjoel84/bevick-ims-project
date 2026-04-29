import { useEffect, useMemo } from 'react';
import { useApp, formatCurrency, fmtDate } from '../context/AppContext';
import { refreshInventory, refreshSales, refreshExpenses, refreshCustomers, refreshBookings } from '../lib/refresh';

function StatCard({ label, value, sub, color = 'blue', icon }) {
  const colors = {
    blue:    'bg-blue-500/10 text-blue-400',
    amber:   'bg-amber-500/10 text-amber-400',
    red:     'bg-red-500/10 text-red-400',
    purple:  'bg-purple-500/10 text-purple-400',
  };
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 overflow-hidden min-w-0">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${colors[color]}`}>
          {icon}
        </div>
      </div>
      <p className="text-xl md:text-2xl font-syne font-bold text-white leading-tight break-all">{value}</p>
      <p className="text-gray-400 text-sm mt-0.5 truncate">{label}</p>
      {sub && <p className="text-gray-600 text-xs mt-1 truncate">{sub}</p>}
    </div>
  );
}

function SimpleBarChart({ data, currency }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
        No sales data available
      </div>
    );
  }
  
  const maxQty = Math.max(...data.map(d => d.qty));
  
  const colors = [
    'from-blue-600 to-blue-400',
    'from-emerald-600 to-emerald-400',
    'from-violet-600 to-violet-400',
    'from-amber-600 to-amber-400',
    'from-rose-600 to-rose-400',
    'from-cyan-600 to-cyan-400',
    'from-orange-600 to-orange-400',
    'from-indigo-600 to-indigo-400',
    'from-pink-600 to-pink-400',
    'from-teal-600 to-teal-400',
  ];
  
  return (
    <div className="flex items-end justify-between gap-2 h-48 pb-4">
      {data.map((item, idx) => (
        <div key={idx} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-gray-400 text-xs font-mono font-semibold">{item.qty}</span>
          <div className="w-full bg-gray-800 rounded-t-lg overflow-hidden relative" style={{ height: '140px' }}>
            <div 
              className={`absolute bottom-0 w-full bg-gradient-to-t ${colors[idx % colors.length]} rounded-t-lg transition-all duration-500`}
              style={{ height: `${(item.qty / maxQty) * 100}%` }}
            />
          </div>
          <span className="text-gray-500 text-[10px] text-center truncate w-full" title={item.name}>
            {item.name.length > 8 ? item.name.slice(0, 8) + '...' : item.name}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { state, dispatch } = useApp();
  const { sales, expenses, inventory, bookings, customers, currency, thr, branch, bname, user } = state;
  const isAdmin = user?.role === 'super_admin';

  useEffect(() => {
    refreshInventory(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'inventory', data } }));
    refreshSales(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'sales', data } }));
    refreshExpenses(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'expenses', data } }));
    refreshCustomers(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'customers', data } }));
    refreshBookings(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'bookings', data } }));
  }, []);

  // Filter by branch — null branch means admin (sees all)
  const filteredSales     = branch ? sales.filter(s => s.branch === branch) : sales;
  const filteredExpenses  = branch ? expenses.filter(e => e.branch === branch) : expenses;
  const filteredInventory = branch ? inventory.filter(i => i.branch === branch) : inventory;
  const filteredBookings  = branch ? bookings.filter(b => !b.branch || b.branch === branch) : bookings;
  const filteredCustomers = branch ? customers.filter(c => !c.branch || c.branch === branch) : customers;

  // All unique customers: registered + anyone named in a sale or booking (mirrors Customers page)
  const totalUniqueCustomers = useMemo(() => {
    const norm = s => s?.toLowerCase().trim() || '';
    const seen = new Set(filteredCustomers.map(c => norm(c.name)).filter(Boolean));
    [...filteredSales.map(s => s.customer), ...filteredBookings.map(b => b.customer)]
      .forEach(name => { const k = norm(name); if (k) seen.add(k); });
    return seen.size;
  }, [filteredCustomers, filteredSales, filteredBookings]);

  // KPIs
  const totalRevenue = filteredSales.reduce((s, x) => s + (x.total || 0), 0);
  const totalExpenses = filteredExpenses.reduce((s, x) => s + (x.amount || 0), 0);
  const netProfit = totalRevenue - totalExpenses;
  const lowStock = filteredInventory.filter(i => i.qty <= (i.minQty || thr));
  const outOfStock = filteredInventory.filter(i => i.qty === 0);

  // Today's sales
  const today = new Date().toDateString();
  const todaySales = filteredSales.filter(s => new Date(s.date).toDateString() === today);
  const todayRevenue = todaySales.reduce((s, x) => s + (x.total || 0), 0);

  // Recent sales (last 5)
  const recentSales = [...filteredSales].slice(0, 5);

  // Top 10 most sold items
  const topSoldItems = useMemo(() => {
    const itemMap = new Map();
    filteredSales.forEach(sale => {
      (sale.items || []).forEach(item => {
        if (!item.name) return;
        const key = item.name;
        const existing = itemMap.get(key) || { name: key, qty: 0, total: 0 };
        existing.qty += item.qty || 1;
        existing.total += (item.qty || 1) * (item.price || 0);
        itemMap.set(key, existing);
      });
    });
    return Array.from(itemMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
  }, [filteredSales]);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-syne text-xl md:text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">{bname} · Overview</p>
      </div>

      {/* KPI Grid — admin only */}
      {isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatCard
            label="Total Revenue"
            value={formatCurrency(totalRevenue, currency)}
            sub={`${filteredSales.length} sales`}
            color="blue"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
          />
          <StatCard
            label="Total Expenses"
            value={formatCurrency(totalExpenses, currency)}
            sub={`${filteredExpenses.length} entries`}
            color="red"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>}
          />
          <StatCard
            label="Net Profit"
            value={formatCurrency(netProfit, currency)}
            sub={netProfit >= 0 ? 'Positive balance' : 'In deficit'}
            color={netProfit >= 0 ? 'blue' : 'amber'}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>}
          />
          <StatCard
            label="Today's Sales"
            value={formatCurrency(todayRevenue, currency)}
            sub={`${todaySales.length} transactions`}
            color="purple"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>}
          />
        </div>
      )}

      {/* Second row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Inventory Items"
          value={filteredInventory.length}
          sub={`${outOfStock.length} out of stock`}
          color="blue"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>}
        />
        <StatCard
          label="Low Stock Alerts"
          value={lowStock.length}
          sub="Items below threshold"
          color={lowStock.length > 0 ? 'amber' : 'blue'}
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>}
        />
        <StatCard
          label="Active Bookings"
          value={filteredBookings.filter(b => b.status === 'pending').length}
          sub={`${filteredBookings.length} total`}
          color="purple"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>}
        />
        <StatCard
          label="Customers"
          value={totalUniqueCustomers}
          sub="Registered"
          color="blue"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Recent Sales */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="font-syne font-semibold text-white mb-4">Recent Sales</h2>
          {recentSales.length === 0 ? (
            <p className="text-gray-600 text-sm py-6 text-center">No sales recorded yet</p>
          ) : (
            <div className="space-y-3">
              {recentSales.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-2 py-2 border-b border-gray-800 last:border-0">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{s.customer || 'Walk-in'}</p>
                    <p className="text-gray-500 text-xs truncate">{fmtDate(s.date)} · #{s.id}</p>
                  </div>
                  <span className="text-blue-400 text-sm font-mono font-medium shrink-0">
                    {formatCurrency(s.total || 0, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="font-syne font-semibold text-white mb-4">Low Stock Alerts</h2>
          {lowStock.length === 0 ? (
            <p className="text-gray-600 text-sm py-6 text-center">All items are sufficiently stocked</p>
          ) : (
            <div className="space-y-3">
              {lowStock.slice(0, 6).map(item => (
                <div key={item.id} className="flex items-center justify-between gap-2 py-2 border-b border-gray-800 last:border-0">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{item.name}</p>
                    <p className="text-gray-500 text-xs truncate">{item.category}</p>
                  </div>
                  <span className={`text-xs font-mono px-2 py-1 rounded-lg font-semibold shrink-0 ${
                    item.qty === 0
                      ? 'bg-red-950 text-red-400'
                      : 'bg-amber-950 text-amber-400'
                  }`}>
                    {item.qty === 0 ? 'OUT' : `${item.qty} left`}
                  </span>
                </div>
              ))}
              {lowStock.length > 6 && (
                <p className="text-gray-600 text-xs text-center pt-1">+{lowStock.length - 6} more</p>
              )}
            </div>
          )}
        </div>

        {/* Top 10 Most Sold Items - spans 2 columns */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 lg:col-span-2">
          <h2 className="font-syne font-semibold text-white mb-4">Top 10 Most Sold Items</h2>
          <SimpleBarChart data={topSoldItems} currency={currency} />
        </div>
      </div>
    </div>
  );
}
