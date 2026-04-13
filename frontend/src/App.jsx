import { useState, useEffect } from 'react';
import { useApp } from './context/AppContext';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Customers from './pages/Customers';
import Expenses from './pages/Expenses';
import Inventory from './pages/Inventory';
import Booked from './pages/Booked';
import Purchase from './pages/Purchase';
import Goods from './pages/Goods';
import Suppliers from './pages/Suppliers';
import RecycleBin from './pages/RecycleBin';
import Settings from './pages/Settings';
import AdminPanel from './pages/AdminPanel';
import Reports from './pages/Reports';

const PAGES = {
  dashboard: Dashboard,
  sales: Sales,
  customers: Customers,
  expenses: Expenses,
  inventory: Inventory,
  booked: Booked,
  purchase: Purchase,
  goods: Goods,
  suppliers: Suppliers,
  recycle: RecycleBin,
  settings: Settings,
  admin: AdminPanel,
  reports: Reports,
};

function LoadingScreen() {
  return (
    <div className="flex h-screen bg-gray-950 items-center justify-center flex-col gap-5">
      <img
        src="/Bevick logo.jpeg"
        alt="Bevick Packaging Machineries"
        className="h-20 w-auto rounded-2xl object-contain"
      />
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Connecting to database…</p>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { state, dispatch } = useApp();
  const isLight = state.theme === 'light';
  return (
    <button
      onClick={() => dispatch({ type: 'UPDATE_SETTINGS', payload: { theme: isLight ? 'dark' : 'light' } })}
      title={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      className="fixed top-3 right-4 z-50 p-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 hover:text-white transition-colors shadow-lg"
    >
      {isLight ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z"/>
        </svg>
      )}
    </button>
  );
}

export default function App() {
  const { state } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme || 'dark');
  }, [state.theme]);

  // Show loading screen while Supabase data is being fetched
  if (!state.dbLoaded) return <LoadingScreen />;

  if (!state.user) return <Login />;

  const PageComponent = PAGES[state.page] || Dashboard;

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <ThemeToggle />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:ml-64 min-w-0">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-gray-950 border-b border-gray-800 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-syne font-bold text-white text-sm">Bevick IMS</span>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto">
          <PageComponent />
        </main>
      </div>
    </div>
  );
}
