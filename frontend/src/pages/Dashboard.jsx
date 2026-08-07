import { useEffect, useMemo } from 'react';
import { useApp, formatCurrency, fmtDate } from '../context/AppContext';
import { refreshInventory, refreshSales, refreshExpenses, refreshBookings, refreshCommissions } from '../lib/refresh';
import { getExpenseType } from './Expenses';

function StatCard({ label, value, sub, color = 'blue', icon }) {
  const colors = {
    blue:    'bg-blue-500/10 text-blue-400',
    amber:   'bg-amber-500/10 text-amber-400',
    red:     'bg-red-500/10 text-red-400',
    purple:  'bg-purple-500/10 text-purple-400',
  };
  return (
    <div className="stat-card bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0">
      <div className="flex items-start justify-between mb-2 sm:mb-3">
        <div className={`w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-xl flex items-center justify-center ${colors[color]}`}>
          {icon}
        </div>
      </div>
      <p className="text-xs sm:text-sm md:text-xl font-syne font-bold text-white leading-tight break-all">{value}</p>
      <p className="text-gray-400 text-xs mt-0.5 truncate">{label}</p>
      {sub && <p className="text-gray-600 text-[10px] sm:text-xs mt-1 truncate">{sub}</p>}
    </div>
  );
}

function SalesOverviewChart({ data, currency }) {
  if (!data || data.length === 0) {
    return <div className="h-52 flex items-center justify-center text-gray-500 text-sm">No sales data available</div>;
  }
  const W = 600, H = 200, padTop = 12, padBottom = 24, padX = 8;
  const plotH = H - padTop - padBottom;
  const maxVal = Math.max(1, ...data.map(d => Math.max(d.revenue, d.profit)));
  const minVal = Math.min(0, ...data.map(d => d.profit));
  const range = (maxVal - minVal) || 1;
  const yScale = v => padTop + ((maxVal - v) / range) * plotH;
  const zeroY = yScale(0);
  const n = data.length;
  const groupW = (W - padX * 2) / n;
  const barW = groupW * 0.42;
  const linePts = data.map((d, i) => ({ x: padX + groupW * i + groupW / 2, y: yScale(d.profit), v: d.profit }));
  const linePath = linePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  return (
    <div>
      <div className="flex items-center gap-4 mb-2 text-xs">
        <span className="flex items-center gap-1.5 text-gray-400"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400 inline-block" /> Daily Sales</span>
        <span className="flex items-center gap-1.5 text-gray-400"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Profit Trend</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-52">
        <line x1={padX} y1={zeroY} x2={W - padX} y2={zeroY} stroke="#383835" strokeWidth="1" strokeDasharray="3 3" />
        {data.map((d, i) => {
          const x = padX + groupW * i + (groupW - barW) / 2;
          const yTop = yScale(d.revenue);
          const h = Math.max(0, zeroY - yTop);
          return (
            <rect key={i} x={x} y={yTop} width={barW} height={h} rx="3" fill="#60a5fa" opacity="0.85">
              <title>{`${d.label}: ${formatCurrency(d.revenue, currency)} sales`}</title>
            </rect>
          );
        })}
        <path d={linePath} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {linePts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#34d399" stroke="#111827" strokeWidth="1.5">
            <title>{`${data[i].label}: ${formatCurrency(p.v, currency)} profit`}</title>
          </circle>
        ))}
        {data.map((d, i) => (
          <text key={i} x={padX + groupW * i + groupW / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="#898781">{d.label}</text>
        ))}
      </svg>
    </div>
  );
}

function ProfitLossAreaChart({ data, currency }) {
  if (!data || data.length === 0) {
    return <div className="h-52 flex items-center justify-center text-gray-500 text-sm">No data available</div>;
  }
  const W = 600, H = 200, padTop = 14, padBottom = 24, padX = 8;
  const plotH = H - padTop - padBottom;
  const values = data.map(d => d.profit);
  const maxVal = Math.max(1, ...values, 0);
  const minVal = Math.min(0, ...values);
  const range = (maxVal - minVal) || 1;
  const yScale = v => padTop + ((maxVal - v) / range) * plotH;
  const zeroY = yScale(0);
  const n = data.length;
  const xStep = n > 1 ? (W - padX * 2) / (n - 1) : 0;
  const pts = data.map((d, i) => ({ x: padX + xStep * i, y: yScale(d.profit), v: d.profit }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `M${pts[0].x},${zeroY} L${pts.map(p => `${p.x},${p.y}`).join(' L')} L${pts[pts.length - 1].x},${zeroY} Z`;
  const zeroFrac = (zeroY / H) * 100;
  const gradId = 'plGrad';

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-52">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0ca30c" stopOpacity="0.55" />
            <stop offset={`${zeroFrac}%`} stopColor="#0ca30c" stopOpacity="0.25" />
            <stop offset={`${zeroFrac}%`} stopColor="#d03b3b" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#d03b3b" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id={`${gradId}-line`} x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0ca30c" />
            <stop offset={`${zeroFrac}%`} stopColor="#0ca30c" />
            <stop offset={`${zeroFrac}%`} stopColor="#d03b3b" />
            <stop offset="100%" stopColor="#d03b3b" />
          </linearGradient>
        </defs>
        <line x1={padX} y1={zeroY} x2={W - padX} y2={zeroY} stroke="#383835" strokeWidth="1" strokeDasharray="3 3" />
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={`url(#${gradId}-line)`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={p.v >= 0 ? '#0ca30c' : '#d03b3b'} stroke="#111827" strokeWidth="1.5">
            <title>{`${data[i].label}: ${formatCurrency(p.v, currency)} ${p.v >= 0 ? 'profit' : 'loss'}`}</title>
          </circle>
        ))}
        {data.map((d, i) => (
          <text key={i} x={padX + xStep * i} y={H - 6} textAnchor="middle" fontSize="9" fill="#898781">{d.label}</text>
        ))}
      </svg>
    </div>
  );
}

function ExpenseBreakdownChart({ data, currency }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) {
    return <div className="h-52 flex items-center justify-center text-gray-500 text-sm">No expense data available</div>;
  }
  const size = 160, radius = 60, strokeW = 22, cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = 3;
  let offsetAcc = 0;
  const segments = data.filter(d => d.value > 0).map(d => {
    const frac = d.value / total;
    const dash = frac * circumference;
    const seg = { ...d, frac, dash: Math.max(0, dash - gap), offset: offsetAcc };
    offsetAcc += dash;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-36 h-36 shrink-0 -rotate-90">
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#27272a" strokeWidth={strokeW} />
        {segments.map((s, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth={strokeW}
            strokeDasharray={`${s.dash} ${circumference - s.dash}`}
            strokeDashoffset={-s.offset}
          >
            <title>{`${s.label}: ${formatCurrency(s.value, currency)} (${Math.round(s.frac * 100)}%)`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex flex-col gap-2 w-full min-w-0">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-gray-400 min-w-0">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="text-gray-300 font-mono font-medium shrink-0">{Math.round(s.frac * 100)}%</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2 text-xs pt-2 mt-1 border-t border-gray-800">
          <span className="text-gray-500">Total</span>
          <span className="text-white font-mono font-semibold">{formatCurrency(total, currency)}</span>
        </div>
      </div>
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
    <div className="flex flex-col gap-2">
      {data.map((item, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <span className="text-gray-400 text-xs w-28 shrink-0 truncate text-right" title={item.name}>
            {item.name}
          </span>
          <div className="flex-1 bg-gray-800 rounded-full overflow-hidden h-5 relative">
            <div
              className={`h-full bg-gradient-to-r ${colors[idx % colors.length]} rounded-full transition-all duration-500`}
              style={{ width: `${(item.qty / maxQty) * 100}%` }}
            />
          </div>
          <span className="text-gray-400 text-xs font-mono font-semibold w-8 shrink-0">{item.qty}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { state, dispatch } = useApp();
  const { sales, expenses, inventory, bookings, commissions = [], currency, thr, branch, bname, user } = state;
  const isAdmin = ['main_super_admin', 'super_admin', 'admin'].includes(user?.role);

  useEffect(() => {
    refreshInventory(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'inventory', data } }));
    refreshSales(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'sales', data } }));
    refreshExpenses(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'expenses', data } }));
    refreshBookings(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'bookings', data } }));
    refreshCommissions(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'commissions', data } }));
  }, []);

  // Filter by branch — null branch means admin (sees all)
  const filteredSales     = branch ? sales.filter(s => s.branch === branch) : sales;
  const filteredExpenses  = branch ? expenses.filter(e => e.branch === branch) : expenses;
  const filteredInventory = branch ? inventory.filter(i => i.branch === branch) : inventory;
  const filteredBookings  = branch ? bookings.filter(b => !b.branch || b.branch === branch) : bookings;

  // KPIs
  const totalRevenue = filteredSales.reduce((s, x) => s + (x.total || 0), 0);
  const totalExpenses = filteredExpenses.reduce((s, x) => s + (x.amount || 0), 0);
  const netProfit = totalRevenue - totalExpenses;
  const lowStock = filteredInventory.filter(i => i.qty <= (i.minQty || thr));

  // Commission stats
  const filteredCommissions = branch ? commissions.filter(c => c.branch === branch) : commissions;
  const totalCommissions = filteredCommissions.reduce((s, c) => s + (c.commission || 0), 0);

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

  // Sales Overview — last 7 days: daily revenue (bars) vs daily profit (line)
  const salesOverviewData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    return days.map(d => {
      const key = d.toDateString();
      const revenue = filteredSales.filter(s => new Date(s.date).toDateString() === key).reduce((s, x) => s + (x.total || 0), 0);
      const expense = filteredExpenses.filter(e => new Date(e.date).toDateString() === key).reduce((s, x) => s + (x.amount || 0), 0);
      return { label: d.toLocaleDateString('en-US', { weekday: 'short' }), revenue, profit: revenue - expense };
    });
  }, [filteredSales, filteredExpenses]);

  // Profit & Loss Analysis — current month, bucketed by week
  const profitLossData = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weekCount = Math.ceil(daysInMonth / 7);
    const buckets = Array.from({ length: weekCount }, (_, i) => ({ label: `Week ${i + 1}`, revenue: 0, expense: 0 }));
    filteredSales.forEach(s => {
      const d = new Date(s.date);
      if (d.getFullYear() === year && d.getMonth() === month) buckets[Math.floor((d.getDate() - 1) / 7)].revenue += s.total || 0;
    });
    filteredExpenses.forEach(e => {
      const d = new Date(e.date);
      if (d.getFullYear() === year && d.getMonth() === month) buckets[Math.floor((d.getDate() - 1) / 7)].expense += e.amount || 0;
    });
    return buckets.map(b => ({ label: b.label, profit: b.revenue - b.expense }));
  }, [filteredSales, filteredExpenses]);

  // Expense Breakdown — by expense type
  const expenseBreakdownData = useMemo(() => {
    const roExp   = filteredExpenses.filter(e => getExpenseType(e) === 'roExpense').reduce((s, e) => s + (e.amount || 0), 0);
    const siteTP  = filteredExpenses.filter(e => getExpenseType(e) === 'siteTP').reduce((s, e) => s + (e.amount || 0), 0);
    const offExp  = filteredExpenses.filter(e => getExpenseType(e) === 'officeExp').reduce((s, e) => s + (e.amount || 0), 0);
    return [
      { label: 'RO Expense', value: roExp, color: '#60a5fa' },
      { label: 'Site TP & Others', value: siteTP, color: '#fbbf24' },
      { label: 'Office Expense', value: offExp, color: '#fb7185' },
    ];
  }, [filteredExpenses]);

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
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
          label="Total Commissions"
          value={formatCurrency(totalCommissions, currency)}
          sub={`${filteredCommissions.length} referral${filteredCommissions.length !== 1 ? 's' : ''}`}
          color="blue"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
        />
      </div>

      {/* Sales Overview, Profit / Loss & Expense Breakdown charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 lg:col-span-2">
          <h2 className="font-syne font-semibold text-white mb-1">Sales Overview</h2>
          <p className="text-gray-600 text-xs mb-3">Last 7 days</p>
          <SalesOverviewChart data={salesOverviewData} currency={currency} />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-syne font-semibold text-white">Profit &amp; Loss Analysis</h2>
            <span className="text-gray-500 text-xs bg-gray-800 border border-gray-700 rounded-lg px-2 py-1">This Month</span>
          </div>
          <p className="text-gray-600 text-xs mb-3">Weekly profit trend</p>
          <ProfitLossAreaChart data={profitLossData} currency={currency} />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 lg:col-span-1">
          <h2 className="font-syne font-semibold text-white mb-1">Expense Breakdown</h2>
          <p className="text-gray-600 text-xs mb-3">By category</p>
          <ExpenseBreakdownChart data={expenseBreakdownData} currency={currency} />
        </div>
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
