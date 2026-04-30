import { useState, useEffect, useMemo } from 'react';
import { useApp, formatCurrency, genId } from '../context/AppContext';
import { refreshInventory } from '../lib/refresh';
import ReportModal from '../components/ReportModal';
import DeleteRequestModal from '../components/DeleteRequestModal';

const CATEGORIES = ['Machinery', 'Spare Parts', 'Chemicals', 'Safety', 'Others'];
const UNITS = ['Unit', 'Pcs', 'Roll', 'Set', 'Meter', 'Kg', 'Litre', 'Box', 'Carton'];
const BRANCHES = [{ id: 'DUB', label: 'Dubai Market' }, { id: 'KUB', label: 'Kubwa Office' }];
const SOURCES = ['China', 'Lagos', 'Abuja', 'Others'];

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
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

const EMPTY_ITEM = { name: '', category: 'Machinery', dubQty: '', kubQty: '', unit: 'Unit', price: '', minQty: '5', supplier: '' };

export default function Inventory() {
  const { state, dispatch } = useApp();
  const { inventory, currency, branch, bname, thr, user } = state;

  useEffect(() => {
    refreshInventory(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'inventory', data } }));
  }, []);

  const userBranch = user?.bid;
  const canEditAll = user?.role === 'super_admin' || user?.role === 'admin';

  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [form, setForm] = useState(EMPTY_ITEM);
  const [restockQty, setRestockQty] = useState('');
  const [restockBranch, setRestockBranch] = useState('DUB');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterStock, setFilterStock] = useState('all');
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteReq, setDeleteReq] = useState(null);

  const mergedInventory = useMemo(() => {
    const map = new Map();
    inventory.forEach(item => {
      const key = `${item.name}-${item.category}`;
      if (!map.has(key)) {
        map.set(key, { 
          id: item.id, 
          name: item.name, 
          category: item.category,
          dubQty: 0, 
          kubQty: 0,
          unit: item.unit,
          price: item.price,
          minQty: item.minQty,
          supplier: item.supplier,
          dubId: null,
          kubId: null,
          items: []
        });
      }
      const entry = map.get(key);
      if (item.branch === 'DUB') {
        entry.dubQty += item.qty || 0;
        entry.dubId = item.id;
      } else if (item.branch === 'KUB') {
        entry.kubQty += item.qty || 0;
        entry.kubId = item.id;
      }
      entry.items.push(item);
      if (item.price !== undefined) entry.price = item.price;
      if (item.minQty !== undefined) entry.minQty = item.minQty;
      if (item.supplier) entry.supplier = item.supplier;
      if (item.unit) entry.unit = item.unit;
    });
    return Array.from(map.values());
  }, [inventory]);

  const inventoryColumns = [
    { key: 'name', label: 'Item Name' },
    { key: 'category', label: 'Category' },
    { key: 'dubQty', label: 'Dubai Qty', align: 'tc' },
    { key: 'kubQty', label: 'Kubwa Qty', align: 'tc' },
    { key: 'unit', label: 'Unit', align: 'tc' },
    { key: 'price', label: 'Unit Price', align: 'tr', format: v => formatCurrency(v || 0, currency) },
    { key: 'qty', label: 'Total Value', align: 'tr', format: (v, row) => formatCurrency(((row.dubQty || 0) + (row.kubQty || 0)) * (row.price || 0), currency) },
    { key: 'qty', label: 'Status', align: 'tc', format: (v, row) => {
      const total = (row.dubQty || 0) + (row.kubQty || 0);
      if (total === 0) return 'Out of Stock';
      return total <= (row.minQty || thr) ? 'Low Stock' : 'In Stock';
    }},
  ];

  function getInventorySummary(data) {
    const totalVal = data.reduce((s, i) => s + ((i.dubQty || 0) + (i.kubQty || 0)) * (i.price || 0), 0);
    const totalQty = data.reduce((s, i) => s + (i.dubQty || 0) + (i.kubQty || 0), 0);
    const lowCount = data.filter(i => { const t = (i.dubQty || 0) + (i.kubQty || 0); return t > 0 && t <= (i.minQty || thr); }).length;
    const outCount = data.filter(i => (i.dubQty || 0) + (i.kubQty || 0) === 0).length;
    return [
      { label: 'Total Items', value: data.length },
      { label: 'Total Quantity', value: totalQty },
      { label: 'Low Stock Items', value: lowCount },
      { label: 'Out of Stock', value: outCount },
      { label: 'Total Stock Value', value: formatCurrency(totalVal, currency), bold: true },
    ];
  }

  const filtered = mergedInventory
    .filter(i => filterCat === 'all' || i.category === filterCat)
    .filter(i => {
      const total = (i.dubQty || 0) + (i.kubQty || 0);
      if (filterStock === 'low') return total > 0 && total <= (i.minQty || thr);
      if (filterStock === 'out') return total === 0;
      if (filterStock === 'ok') return total > (i.minQty || thr);
      return true;
    })
    .filter(i => {
      const q = search.toLowerCase();
      return !q || i.name?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q) || i.supplier?.toLowerCase().includes(q);
    });

  const totalValue = filtered.reduce((s, i) => s + ((i.dubQty || 0) + (i.kubQty || 0)) * i.price, 0);
  const totalQty = filtered.reduce((s, i) => s + (i.dubQty || 0) + (i.kubQty || 0), 0);
  const lowCount = filtered.filter(i => { const t = (i.dubQty || 0) + (i.kubQty || 0); return t > 0 && t <= (i.minQty || thr); }).length;
  const outCount = filtered.filter(i => (i.dubQty || 0) + (i.kubQty || 0) === 0).length;

  function canEditBranch(itemBranch) {
    if (canEditAll) return true;
    return userBranch === itemBranch;
  }

  function openAdd(branch = userBranch || 'DUB') {
    setSelectedBranch(branch);
    setForm({ ...EMPTY_ITEM, dubQty: branch === 'DUB' ? '' : '0', kubQty: branch === 'KUB' ? '' : '0' });
    setModal('add');
  }

  function openEdit(item, itemBranch) {
    const isAllowed = canEditAll || userBranch === itemBranch;
    if (!isAllowed) {
      alert(`You can only edit items for your assigned branch (${userBranch === 'DUB' ? 'Dubai Market' : 'Kubwa Office'})`);
      return;
    }
    const sourceItem = item.items.find(i => i.branch === itemBranch) || item.items[0];
    setSelected(item);
    setSelectedBranch(itemBranch);
    setForm({ 
      name: item.name, 
      category: item.category, 
      dubQty: item.dubQty, 
      kubQty: item.kubQty,
      unit: item.unit, 
      price: item.price, 
      minQty: item.minQty, 
      supplier: item.supplier || '' 
    });
    setModal('edit');
  }

  function openRestock(item, itemBranch = 'DUB') {
    const isAllowed = canEditAll || userBranch === itemBranch;
    if (!isAllowed) {
      alert(`You can only restock items for your assigned branch (${userBranch === 'DUB' ? 'Dubai Market' : 'Kubwa Office'})`);
      return;
    }
    setSelected(item);
    setSelectedBranch(itemBranch);
    setRestockQty('');
    setRestockBranch(itemBranch);
    setModal('restock');
  }

  function openView(item) {
    setSelected(item);
    setModal('view');
  }

  function saveItem() {
    if (!form.name.trim()) return;
    const qty = selectedBranch === 'DUB' ? (parseInt(form.dubQty) || 0) : (parseInt(form.kubQty) || 0);
    const item = { 
      name: form.name, 
      category: form.category, 
      qty, 
      unit: form.unit, 
      price: parseFloat(form.price) || 0, 
      minQty: parseInt(form.minQty) || thr, 
      branch: selectedBranch, 
      supplier: form.supplier 
    };
    if (modal === 'add') {
      dispatch({ type: 'ADD_ITEM', payload: { id: genId('I'), ...item } });
    } else {
      const sourceItem = selected.items.find(i => i.branch === selectedBranch);
      if (sourceItem) {
        dispatch({ type: 'UPDATE_ITEM', payload: { ...sourceItem, ...item } });
      } else {
        dispatch({ type: 'ADD_ITEM', payload: { id: genId('I'), ...item } });
      }
    }
    setModal(null);
  }

  function doRestock() {
    const q = parseInt(restockQty);
    if (!q || q < 1) return;
    const sourceItem = selected.items.find(i => i.branch === restockBranch);
    if (sourceItem) {
      dispatch({ type: 'RESTOCK_ITEM', payload: { id: sourceItem.id, qty: q } });
    } else {
      const newItem = {
        id: genId('I'),
        name: selected.name,
        category: selected.category,
        qty: q,
        unit: selected.unit,
        price: selected.price || 0,
        minQty: selected.minQty || thr,
        branch: restockBranch,
        supplier: selected.supplier || ''
      };
      dispatch({ type: 'ADD_ITEM', payload: newItem });
    }
    setModal(null);
  }

  function del(item) {
    if (user?.role === 'super_admin') {
      if (window.confirm('Delete this item from both branches? It will be moved to the recycle bin.')) {
        item.items.forEach(i => dispatch({ type: 'DELETE_ITEM', payload: i.id }));
        if (modal) setModal(null);
      }
    } else {
      setDeleteReq({ type: 'inventory', targetId: item.id, label: item.name });
    }
  }

  function stockBadge(item) {
    const total = (item.dubQty || 0) + (item.kubQty || 0);
    if (total === 0) return <span className="bg-red-950 text-red-400 text-xs px-2 py-0.5 rounded-lg font-medium">Out of Stock</span>;
    if (total <= (item.minQty || thr)) return <span className="bg-amber-950 text-amber-400 text-xs px-2 py-0.5 rounded-lg font-medium">Low Stock</span>;
    return <span className="bg-blue-950 text-blue-400 text-xs px-2 py-0.5 rounded-lg font-medium">In Stock</span>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Inventory</h1>
          <p className="text-gray-500 text-sm mt-0.5">All Branches</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Stock Report
          </button>
          <button onClick={() => openAdd()} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            Add Item
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 md:p-5">
          <p className="text-gray-500 text-xs font-medium mb-1">Total Items</p>
          <p className="font-syne text-xl md:text-2xl font-bold text-white">{filtered.length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 md:p-5">
          <p className="text-gray-500 text-xs font-medium mb-1">Total Quantity</p>
          <p className="font-syne text-xl md:text-2xl font-bold text-white">{totalQty}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 md:p-5">
          <p className="text-gray-500 text-xs font-medium mb-1">Stock Value</p>
          <p className="font-syne text-lg md:text-xl font-bold text-white">{formatCurrency(totalValue, currency)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 md:p-5">
          <p className="text-gray-500 text-xs font-medium mb-1">Low Stock</p>
          <p className={`font-syne text-xl md:text-2xl font-bold ${lowCount > 0 ? 'text-amber-400' : 'text-white'}`}>{lowCount}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 md:p-5 col-span-2 md:col-span-1">
          <p className="text-gray-500 text-xs font-medium mb-1">Out of Stock</p>
          <p className={`font-syne text-xl md:text-2xl font-bold ${outCount > 0 ? 'text-red-400' : 'text-white'}`}>{outCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search items…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-48 md:w-64"
        />
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select
          value={filterStock}
          onChange={e => setFilterStock(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Stock</option>
          <option value="ok">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
        <div className="flex items-center gap-2 text-xs text-gray-500 ml-auto">
          <span className="bg-gray-800 px-2 py-1 rounded">Your branch: {userBranch === 'DUB' ? 'Dubai' : userBranch === 'KUB' ? 'Kubwa' : 'All'}</span>
          {canEditAll && <span className="bg-blue-900 text-blue-400 px-2 py-1 rounded">Admin</span>}
        </div>
      </div>

      {/* Table - Mobile Card Layout */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 font-medium px-4 py-3">Item</th>
                <th className="text-left text-gray-500 font-medium px-4 py-3">Category</th>
                <th className="text-center text-gray-500 font-medium px-4 py-3">Dubai</th>
                <th className="text-center text-gray-500 font-medium px-4 py-3">Kubwa</th>
                <th className="text-left text-gray-500 font-medium px-4 py-3">Unit</th>
                <th className="text-left text-gray-500 font-medium px-4 py-3">Price</th>
                <th className="text-left text-gray-500 font-medium px-4 py-3">Value</th>
                <th className="text-left text-gray-500 font-medium px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-gray-600 py-12">No items found</td></tr>
              ) : filtered.map(item => (
                <tr key={item.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{item.name}</p>
                    {item.supplier && <p className="text-gray-500 text-xs mt-0.5">{item.supplier}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-lg">{item.category}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-white font-mono">{item.dubQty} <span className="text-gray-500 text-xs">{item.unit}</span></td>
                  <td className="px-4 py-3 text-center text-white font-mono">{item.kubQty} <span className="text-gray-500 text-xs">{item.unit}</span></td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{item.unit}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono">{formatCurrency(item.price, currency)}</td>
                  <td className="px-4 py-3 text-blue-400 font-mono">{formatCurrency(((item.dubQty || 0) + (item.kubQty || 0)) * item.price, currency)}</td>
                  <td className="px-4 py-3">{stockBadge(item)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => openView(item)} title="View" className="text-gray-500 hover:text-white transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      </button>
                      <button onClick={() => openRestock(item, 'DUB')} title="Restock Dubai" className={`text-gray-500 hover:text-blue-400 transition-colors p-1 ${!canEditAll && userBranch !== 'DUB' ? 'opacity-30 cursor-not-allowed' : ''}`} disabled={!canEditAll && userBranch !== 'DUB'}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                        <span className="text-xs ml-0.5">D</span>
                      </button>
                      <button onClick={() => openRestock(item, 'KUB')} title="Restock Kubwa" className={`text-gray-500 hover:text-blue-400 transition-colors p-1 ${!canEditAll && userBranch !== 'KUB' ? 'opacity-30 cursor-not-allowed' : ''}`} disabled={!canEditAll && userBranch !== 'KUB'}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                        <span className="text-xs ml-0.5">K</span>
                      </button>
                      <button onClick={() => openEdit(item, 'DUB')} title="Edit Dubai" className={`text-gray-500 hover:text-white transition-colors p-1 ${!canEditAll && userBranch !== 'DUB' ? 'opacity-30 cursor-not-allowed' : ''}`} disabled={!canEditAll && userBranch !== 'DUB'}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        <span className="text-xs ml-0.5">D</span>
                      </button>
                      <button onClick={() => openEdit(item, 'KUB')} title="Edit Kubwa" className={`text-gray-500 hover:text-white transition-colors p-1 ${!canEditAll && userBranch !== 'KUB' ? 'opacity-30 cursor-not-allowed' : ''}`} disabled={!canEditAll && userBranch !== 'KUB'}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        <span className="text-xs ml-0.5">K</span>
                      </button>
                      <button onClick={() => del(item)} title="Delete" className="text-gray-500 hover:text-red-400 transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card Layout */}
        <div className="md:hidden divide-y divide-gray-800">
          {filtered.length === 0 ? (
            <div className="text-center text-gray-600 py-12">No items found</div>
          ) : filtered.map(item => (
            <div key={item.id} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-white font-medium">{item.name}</p>
                  {item.supplier && <p className="text-gray-500 text-xs">{item.supplier}</p>}
                </div>
                {stockBadge(item)}
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="bg-gray-800 px-2 py-1 rounded">
                  <span className="text-gray-500">Category:</span> <span className="text-gray-300">{item.category}</span>
                </div>
                <div className="bg-gray-800 px-2 py-1 rounded">
                  <span className="text-gray-500">Dubai:</span> <span className="text-white font-mono">{item.dubQty} {item.unit}</span>
                </div>
                <div className="bg-gray-800 px-2 py-1 rounded">
                  <span className="text-gray-500">Kubwa:</span> <span className="text-white font-mono">{item.kubQty} {item.unit}</span>
                </div>
                <div className="bg-gray-800 px-2 py-1 rounded">
                  <span className="text-gray-500">Price:</span> <span className="text-gray-300 font-mono">{formatCurrency(item.price, currency)}</span>
                </div>
                <div className="bg-gray-800 px-2 py-1 rounded">
                  <span className="text-gray-500">Value:</span> <span className="text-blue-400 font-mono">{formatCurrency(((item.dubQty || 0) + (item.kubQty || 0)) * item.price, currency)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end pt-2 border-t border-gray-800">
                <button onClick={() => openView(item)} className="text-gray-500 hover:text-white p-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                </button>
                {(canEditAll || userBranch === 'DUB') && (
                  <button onClick={() => openRestock(item, 'DUB')} className="text-gray-500 hover:text-blue-400 p-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                    <span className="text-xs ml-1">D</span>
                  </button>
                )}
                {(canEditAll || userBranch === 'KUB') && (
                  <button onClick={() => openRestock(item, 'KUB')} className="text-gray-500 hover:text-blue-400 p-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                    <span className="text-xs ml-1">K</span>
                  </button>
                )}
                {(canEditAll || userBranch === 'DUB') && (
                  <button onClick={() => openEdit(item, 'DUB')} className="text-gray-500 hover:text-white p-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    <span className="text-xs ml-1">D</span>
                  </button>
                )}
                {(canEditAll || userBranch === 'KUB') && (
                  <button onClick={() => openEdit(item, 'KUB')} className="text-gray-500 hover:text-white p-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    <span className="text-xs ml-1">K</span>
                  </button>
                )}
                <button onClick={() => del(item)} className="text-gray-500 hover:text-red-400 p-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? 'Add Inventory Item' : 'Edit Item'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Item Name <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Branch <span className="text-red-400">*</span></label>
                <select 
                  value={selectedBranch} 
                  onChange={e => setSelectedBranch(e.target.value)} 
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
                <p className="text-gray-500 text-xs mt-1">{!canEditAll && `You can only add to ${userBranch === 'DUB' ? 'Dubai' : 'Kubwa'} branch`}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Quantity ({selectedBranch === 'DUB' ? 'Dubai' : 'Kubwa'})</label>
                <input 
                  type="number" 
                  min={0} 
                  value={selectedBranch === 'DUB' ? form.dubQty : form.kubQty} 
                  onChange={e => setForm(f => ({ ...f, [selectedBranch === 'DUB' ? 'dubQty' : 'kubQty']: e.target.value }))} 
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Unit</label>
                <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Min Qty</label>
                <input type="number" min={0} value={form.minQty} onChange={e => setForm(f => ({ ...f, minQty: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Unit Price (₦)</label>
                <input type="number" min={0} value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Source</label>
              <select value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select source —</option>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
              <button onClick={saveItem} disabled={!form.name.trim()} className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
                {modal === 'add' ? 'Add Item' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Restock Modal */}
      {modal === 'restock' && selected && (
        <Modal title={`Restock: ${selected.name}`} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800 rounded-xl p-4 text-sm">
                <p className="text-gray-400 text-xs mb-1">Dubai Stock</p>
                <p className="text-white font-mono">{selected.dubQty} {selected.unit}</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 text-sm">
                <p className="text-gray-400 text-xs mb-1">Kubwa Stock</p>
                <p className="text-white font-mono">{selected.kubQty} {selected.unit}</p>
              </div>
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Restock Branch</label>
              <select 
                value={restockBranch} 
                onChange={e => setRestockBranch(e.target.value)} 
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Add Quantity</label>
              <input
                type="number"
                min={1}
                placeholder="Enter quantity to add…"
                value={restockQty}
                onChange={e => setRestockQty(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {restockQty && (
              <div className="bg-gray-800 rounded-xl p-4 text-sm flex justify-between">
                <span className="text-gray-400">New Total ({restockBranch === 'DUB' ? 'Dubai' : 'Kubwa'})</span>
                <span className="text-blue-400 font-mono">
                  {(restockBranch === 'DUB' ? selected.dubQty : selected.kubQty) + parseInt(restockQty || 0)} {selected.unit}
                </span>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
              <button onClick={doRestock} disabled={!restockQty || parseInt(restockQty) < 1} className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
                Restock
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* View Modal */}
      {modal === 'view' && selected && (
        <Modal title={selected.name} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500 text-xs mb-1">Category</p>
                <p className="text-white">{selected.category}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-1">Unit</p>
                <p className="text-white">{selected.unit}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-1">Dubai Quantity</p>
                <p className="text-white font-mono">{selected.dubQty} {selected.unit}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-1">Kubwa Quantity</p>
                <p className="text-white font-mono">{selected.kubQty} {selected.unit}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-1">Total Quantity</p>
                <p className="text-white font-mono">{(selected.dubQty || 0) + (selected.kubQty || 0)} {selected.unit}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-1">Min Stock</p>
                <p className="text-white">{selected.minQty || thr} {selected.unit}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-1">Unit Price</p>
                <p className="text-white">{formatCurrency(selected.price, currency)}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-1">Stock Value</p>
                <p className="text-blue-400">{formatCurrency(((selected.dubQty || 0) + (selected.kubQty || 0)) * selected.price, currency)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-500 text-xs mb-1">Source</p>
                <p className="text-white">{selected.supplier || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-500 text-xs mb-1">Status</p>
                {stockBadge(selected)}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setModal(null); openRestock(selected, 'DUB'); }} className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Restock Dubai</button>
              <button onClick={() => { setModal(null); openRestock(selected, 'KUB'); }} className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Restock Kubwa</button>
              <button onClick={() => del(selected)} className="bg-red-950 hover:bg-red-900 text-red-400 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Delete</button>
            </div>
          </div>
        </Modal>
      )}

      {reportOpen && (
        <ReportModal
          title="Stock Report"
          data={filtered}
          dateKey={null}
          columns={inventoryColumns}
          getSummary={getInventorySummary}
          onClose={() => setReportOpen(false)}
          state={state}
        />
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
