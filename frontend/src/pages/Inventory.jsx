import { useState, useEffect, useMemo } from 'react';
import { useApp, formatCurrency, genId, fmtDate } from '../context/AppContext';
import { refreshInventory, refreshBookings, refreshAuditLog } from '../lib/refresh';
import ReportModal from '../components/ReportModal';
import DeleteRequestModal from '../components/DeleteRequestModal';
import InventoryTransactionsLedger from '../components/InventoryTransactionsLedger';
import { stockMovementColumns, getStockMovementsSummary, getStockMovementsData } from '../utils/stockMovements';

const CATEGORIES = ['Machinery', 'Spare Parts', 'Chemicals', 'Consumables', 'Others'];
const UNITS = ['Unit', 'Pcs', 'Roll', 'Set', 'Meter', 'Kg', 'Litre', 'Box', 'Carton'];
const BRANCHES = [{ id: 'DUB', label: 'Dubai Market' }, { id: 'KUB', label: 'Kubwa Office' }];
const SOURCES = ['China', 'Lagos', 'Abuja', 'Others'];

// Audit-log actions that reflect a stock-affecting transaction — everything
// else (customers, expenses, commissions, permissions, etc.) is out of scope
// for the Inventory page's transaction history.
const INVENTORY_ACTIONS = new Set([
  'Item added', 'Item updated', 'Item deleted', 'Item restocked',
  'Sale recorded', 'Booking sale recorded', 'Sale updated', 'Sale deleted',
  'Booking delivered — stock deducted',
  'Goods received', 'GRN updated', 'GRN deleted',
]);

const ACTION_STYLES = {
  'Item added':                        'bg-green-950 text-green-400',
  'Item updated':                      'bg-blue-950 text-blue-400',
  'Item deleted':                      'bg-red-950 text-red-400',
  'Item restocked':                    'bg-amber-950 text-amber-400',
  'Sale recorded':                     'bg-purple-950 text-purple-400',
  'Booking sale recorded':             'bg-purple-950 text-purple-400',
  'Sale updated':                      'bg-blue-950 text-blue-400',
  'Sale deleted':                      'bg-red-950 text-red-400',
  'Booking delivered — stock deducted':'bg-indigo-950 text-indigo-400',
  'Goods received':                    'bg-cyan-950 text-cyan-400',
  'GRN updated':                       'bg-cyan-950 text-cyan-400',
  'GRN deleted':                       'bg-red-950 text-red-400',
};

// Local (not UTC) calendar-day key, so entries group by the day the user
// actually experienced them rather than shifting at UTC midnight.
function dayKeyOf(iso) {
  return new Date(iso).toLocaleDateString('en-CA');
}

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
  const { inventory, inventoryMovements, sales, bookings, purchaseList, currency, branch, bname, thr, user, auditLog } = state;

  useEffect(() => {
    refreshInventory(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'inventory', data } }));
    refreshBookings(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'bookings', data } }));
    refreshAuditLog(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'auditLog', data } }));
  }, []);

  const userBranch = user?.bid;
  const canEditAll = ['main_super_admin', 'super_admin', 'admin'].includes(user?.role);

  const [tab, setTab] = useState('inventory');
  const [recordSearch, setRecordSearch] = useState('');
  const [recordEditItem, setRecordEditItem] = useState(null);
  const [recordEditForm, setRecordEditForm] = useState({ dubQty: '', kubQty: '' });
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [form, setForm] = useState(EMPTY_ITEM);
  const [restockQty, setRestockQty] = useState('');
  const [restockBranch, setRestockBranch] = useState('DUB');
  const [transferItem, setTransferItem] = useState(null);
  const [transferSourceBranch, setTransferSourceBranch] = useState('DUB');
  const [transferQty, setTransferQty] = useState('');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterStock, setFilterStock] = useState('all');
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteReq, setDeleteReq] = useState(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDate, setHistoryDate] = useState('');
  const [historyUser, setHistoryUser] = useState('all');

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

  const stockMovementsData = useMemo(() => getStockMovementsData(inventoryMovements), [inventoryMovements]);

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

  const recordData = useMemo(() => {
    const activeBookings = bookings.filter(b => b.status !== 'cancelled');

    // Build a map keyed by item name (lowercase) aggregating from bookings
    const map = new Map();

    activeBookings.forEach(b => {
      const bType = (b.bookingType || b.type);
      const isFullFactory = bType === 'full_factory';
      const isOthers = bType === 'others' || (!isFullFactory);

      (b.items || []).forEach(bi => {
        const nameLower = bi.name?.toLowerCase().trim();
        if (!nameLower) return;

        if (!map.has(nameLower)) {
          map.set(nameLower, { name: bi.name, fullFactory: 0, others: 0 });
        }
        const entry = map.get(nameLower);
        if (isFullFactory) {
          entry.fullFactory += bi.qty || 1;
        } else {
          entry.others += bi.qty || 1;
        }
      });
    });

    // Cross-reference with inventory for stock quantities.
    // Accumulate rather than overwrite so that duplicate entries differing only
    // in name casing (e.g. "Dingli sachet machine" vs "Dingli Sachet Machine")
    // are merged. The entry with the most title-cased words wins the name.
    const titleScore = n => (n?.match(/\b[A-Z]/g) || []).length;
    const inventoryByName = new Map();
    mergedInventory.forEach(item => {
      const key = item.name?.toLowerCase().trim();
      if (!key) return;
      if (!inventoryByName.has(key)) {
        inventoryByName.set(key, { ...item });
      } else {
        const existing = inventoryByName.get(key);
        existing.dubQty = (existing.dubQty || 0) + (item.dubQty || 0);
        existing.kubQty = (existing.kubQty || 0) + (item.kubQty || 0);
        if (titleScore(item.name) > titleScore(existing.name)) existing.name = item.name;
      }
    });

    return Array.from(map.values()).map(entry => {
      const invItem = inventoryByName.get(entry.name?.toLowerCase().trim());
      const dubQty = invItem?.dubQty || 0;
      const kubQty = invItem?.kubQty || 0;
      const totalStock = dubQty + kubQty;
      const itemsSold = entry.fullFactory + entry.others;
      const goodsToOrder = Math.max(0, itemsSold - totalStock);
      const goodsForSales = Math.max(0, totalStock - itemsSold);

      return {
        id: invItem?.id || entry.name,
        name: invItem?.name || entry.name,
        supplier: invItem?.supplier || '',
        dubQty,
        kubQty,
        fullFactory: entry.fullFactory,
        others: entry.others,
        itemsSold,
        goodsToOrder,
        goodsForSales,
      };
    });
  }, [mergedInventory, bookings]);

  const filteredRecord = useMemo(() => {
    const q = recordSearch.toLowerCase().trim();
    if (!q) return recordData;
    return recordData.filter(i => i.name.toLowerCase().includes(q) || i.supplier?.toLowerCase().includes(q));
  }, [recordData, recordSearch]);

  // ── Transaction History (daily-grouped audit trail) ─────────────────────
  const inventoryHistory = useMemo(
    () => (auditLog || []).filter(e => INVENTORY_ACTIONS.has(e.action)),
    [auditLog]
  );

  const historyUsers = useMemo(() => {
    const names = new Set(inventoryHistory.map(e => e.user).filter(Boolean));
    return Array.from(names).sort();
  }, [inventoryHistory]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase().trim();
    return inventoryHistory.filter(e => {
      if (historyDate && dayKeyOf(e.ts) !== historyDate) return false;
      if (historyUser !== 'all' && e.user !== historyUser) return false;
      if (!q) return true;
      return (
        e.action?.toLowerCase().includes(q) ||
        e.user?.toLowerCase().includes(q) ||
        e.detail?.toLowerCase().includes(q)
      );
    });
  }, [inventoryHistory, historySearch, historyDate, historyUser]);

  const groupedHistory = useMemo(() => {
    const map = new Map();
    filteredHistory.forEach(e => {
      const key = dayKeyOf(e.ts);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredHistory]);

  function clearHistoryFilters() {
    setHistorySearch('');
    setHistoryDate('');
    setHistoryUser('all');
  }

  function openRecordEdit(item) {
    setRecordEditItem(item);
    setRecordEditForm({ dubQty: String(item.dubQty), kubQty: String(item.kubQty) });
  }

  function saveRecordEdit() {
    const newDubQty = parseInt(recordEditForm.dubQty) || 0;
    const newKubQty = parseInt(recordEditForm.kubQty) || 0;
    const invItem = mergedInventory.find(i => i.name?.toLowerCase().trim() === recordEditItem.name?.toLowerCase().trim());
    const dubItem = invItem?.items?.find(i => i.branch === 'DUB');
    const kubItem = invItem?.items?.find(i => i.branch === 'KUB');
    if (dubItem) dispatch({ type: 'UPDATE_ITEM', payload: { ...dubItem, qty: newDubQty } });
    if (kubItem) dispatch({ type: 'UPDATE_ITEM', payload: { ...kubItem, qty: newKubQty } });
    setRecordEditItem(null);
  }

  function printGeneralRecord() {
    const { bizName, bizRC } = state;
    const logo = `${window.location.origin}/Bevick%20logo.jpeg`;
    const now = new Date().toLocaleString('en-NG');
    const rows = filteredRecord.map((item, idx) => `
      <tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${item.name}${item.supplier ? ` (${item.supplier})` : ''}</td>
        <td style="text-align:center">${item.fullFactory}</td>
        <td style="text-align:center">${item.others}</td>
        <td style="text-align:center">${item.itemsSold}</td>
        <td style="text-align:center">${item.kubQty}</td>
        <td style="text-align:center">${item.dubQty}</td>
        <td style="text-align:center">${item.goodsToOrder}</td>
        <td style="text-align:center">${item.goodsForSales}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>General Record</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding-top:18mm}
        .logo-bar{text-align:center;padding:6px 0 5px;border-bottom:1.5px solid #e5e7eb;margin-bottom:14px;background:#fff}
        .logo-bar img{height:44px;width:auto;object-fit:contain}
        .page{padding:0 20px 20px}
        .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}
        .biz-name{font-size:16px;font-weight:700}
        .biz-sub{font-size:10px;color:#555;margin-top:2px}
        .doc-title{font-size:14px;font-weight:700;text-align:right}
        .doc-sub{font-size:10px;color:#555;text-align:right;margin-top:2px}
        table{width:100%;border-collapse:collapse;margin-top:6px}
        th,td{border:1px solid #bbb;padding:5px 8px}
        th{background:#e8e8e8;font-weight:bold;text-align:center;font-size:10px;text-transform:uppercase}
        tr:nth-child(even) td{background:#f5f5f5}
        .footer{margin-top:20px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:9px;color:#9ca3af;display:flex;justify-content:space-between}
        @media print{
          @page{size:A4 landscape;margin:8mm 10mm 12mm}
          body{padding-top:18mm}
          .logo-bar{position:fixed;top:0;left:0;right:0;padding:2mm 0 2mm;border-bottom:1px solid #e5e7eb;margin-bottom:0}
          img{print-color-adjust:exact;-webkit-print-color-adjust:exact}
        }
      </style></head><body>
      <div class="logo-bar"><img src="${logo}" alt="Bevick Logo"/></div>
      <div class="page">
        <div class="header">
          <div>
            <div class="biz-name">${bizName || 'Bevick Packaging Machineries'}</div>
            <div class="biz-sub">${bizRC || 'RC: 967373'}</div>
          </div>
          <div>
            <div class="doc-title">General Record</div>
            <div class="doc-sub">Generated: ${now}</div>
            <div class="doc-sub">${filteredRecord.length} item(s)</div>
          </div>
        </div>
        <table><thead><tr>
          <th>S/N</th><th style="text-align:left">Item Name</th>
          <th>Full Factory</th><th>Others</th><th>Items Sold</th>
          <th>Stocks in Kubwa</th><th>Stocks in Dubai</th>
          <th>Goods to Order</th><th>Goods for Sales</th>
        </tr></thead><tbody>${rows}</tbody></table>
        <div class="footer">
          <span>${bizName || 'Bevick IMS'} · Confidential</span>
          <span>Printed: ${now}</span>
        </div>
      </div>
      <script>window.onload=function(){ window.print(); window.onafterprint=function(){ window.close(); }; }</script>
      </body></html>`;
    const win = window.open('', '_blank', 'width=1000,height=920,scrollbars=yes');
    if (!win) { alert('Please allow pop-ups to print.'); return; }
    win.document.write(html);
    win.document.close();
  }

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

  function openTransfer(item) {
    setTransferItem(item);
    setTransferSourceBranch(item.dubQty > 0 ? 'DUB' : 'KUB');
    setTransferQty('');
    setModal('transfer');
  }

  function doTransfer() {
    const q = parseInt(transferQty);
    if (!q || q < 1 || !transferItem) return;
    const sourceItem = transferItem.items.find(i => i.branch === transferSourceBranch);
    if (!sourceItem || q > sourceItem.qty) return;
    const destBranch = transferSourceBranch === 'DUB' ? 'KUB' : 'DUB';
    dispatch({
      type: 'TRANSFER_ITEM',
      payload: { transferId: genId('TRF'), fromId: sourceItem.id, toBranch: destBranch, qty: q },
    });
    setModal(null);
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
    if (['main_super_admin', 'super_admin', 'admin'].includes(user?.role)) {
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
          {tab === 'inventory' && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Tab Navbar */}
      <div className="flex border-b border-gray-800 -mt-2">
        <button
          onClick={() => setTab('inventory')}
          className={`px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${tab === 'inventory' ? 'text-blue-400 border-blue-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
        >
          General Inventory
        </button>
        <button
          onClick={() => setTab('record')}
          className={`px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${tab === 'record' ? 'text-blue-400 border-blue-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
        >
          General Record
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${tab === 'history' ? 'text-blue-400 border-blue-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
        >
          Transaction History
        </button>
        <button
          onClick={() => setTab('ledger')}
          className={`px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${tab === 'ledger' ? 'text-blue-400 border-blue-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
        >
          Inventory Transactions
        </button>
      </div>

      {/* ── General Inventory Tab ── */}
      {tab === 'inventory' && (<>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="stat-card bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0">
          <p className="text-gray-500 text-xs font-medium mb-1">Total Items</p>
          <p className="font-syne text-sm sm:text-xl md:text-2xl font-bold text-white">{filtered.length}</p>
        </div>
        <div className="stat-card bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0">
          <p className="text-gray-500 text-xs font-medium mb-1">Total Quantity</p>
          <p className="font-syne text-sm sm:text-xl md:text-2xl font-bold text-white">{totalQty}</p>
        </div>
        <div className="stat-card bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0">
          <p className="text-gray-500 text-xs font-medium mb-1">Stock Value</p>
          <p className="font-syne text-xs sm:text-sm md:text-xl font-bold text-white break-all">{formatCurrency(totalValue, currency)}</p>
        </div>
        <div className="stat-card bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0">
          <p className="text-gray-500 text-xs font-medium mb-1">Low Stock</p>
          <p className={`font-syne text-sm sm:text-xl md:text-2xl font-bold ${lowCount > 0 ? 'text-amber-400' : 'text-white'}`}>{lowCount}</p>
        </div>
        <div className="stat-card bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 md:p-5 overflow-hidden min-w-0 col-span-2 md:col-span-1">
          <p className="text-gray-500 text-xs font-medium mb-1">Out of Stock</p>
          <p className={`font-syne text-sm sm:text-xl md:text-2xl font-bold ${outCount > 0 ? 'text-red-400' : 'text-white'}`}>{outCount}</p>
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
      </div>

      {/* Table - Mobile Card Layout */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto overflow-y-auto max-h-[65vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-900">
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
                      <button onClick={() => openRestock(item, 'DUB')} title="Restock Dubai" className="text-gray-500 hover:text-blue-400 transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                        <span className="text-xs ml-0.5">D</span>
                      </button>
                      <button onClick={() => openRestock(item, 'KUB')} title="Restock Kubwa" className="text-gray-500 hover:text-blue-400 transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                        <span className="text-xs ml-0.5">K</span>
                      </button>
                      <button onClick={() => openTransfer(item)} title="Transfer Between Branches" className="text-gray-500 hover:text-purple-400 transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4"/></svg>
                      </button>
                      <button onClick={() => openEdit(item, 'DUB')} title="Edit Dubai" className="text-gray-500 hover:text-white transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        <span className="text-xs ml-0.5">D</span>
                      </button>
                      <button onClick={() => openEdit(item, 'KUB')} title="Edit Kubwa" className="text-gray-500 hover:text-white transition-colors p-1">
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
                <button onClick={() => openRestock(item, 'DUB')} className="text-gray-500 hover:text-blue-400 p-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                  <span className="text-xs ml-1">D</span>
                </button>
                <button onClick={() => openRestock(item, 'KUB')} className="text-gray-500 hover:text-blue-400 p-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                  <span className="text-xs ml-1">K</span>
                </button>
                <button onClick={() => openTransfer(item)} title="Transfer Between Branches" className="text-gray-500 hover:text-purple-400 p-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4"/></svg>
                </button>
                <button onClick={() => openEdit(item, 'DUB')} className="text-gray-500 hover:text-white p-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  <span className="text-xs ml-1">D</span>
                </button>
                <button onClick={() => openEdit(item, 'KUB')} className="text-gray-500 hover:text-white p-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  <span className="text-xs ml-1">K</span>
                </button>
                <button onClick={() => del(item)} className="text-gray-500 hover:text-red-400 p-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      </>)}

      {/* ── General Record Tab ── */}
      {tab === 'record' && (
        <div className="space-y-4">

          {/* Summary Cards */}
          {(() => {
            const totFF    = filteredRecord.reduce((s, r) => s + r.fullFactory, 0);
            const totOth   = filteredRecord.reduce((s, r) => s + r.others, 0);
            const totSold  = filteredRecord.reduce((s, r) => s + r.itemsSold, 0);
            const totOrder = filteredRecord.reduce((s, r) => s + r.goodsToOrder, 0);
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="stat-card bg-gray-900 border border-green-500/30 rounded-xl px-4 py-3">
                  <p className="text-gray-500 text-xs mb-1">Items Sold</p>
                  <p className="font-syne font-bold text-green-400 text-2xl">{totSold}</p>
                  <p className="text-gray-600 text-xs mt-0.5">FF {totFF} · Others {totOth}</p>
                </div>
                <div className="stat-card bg-gray-900 border border-amber-500/30 rounded-xl px-4 py-3">
                  <p className="text-gray-500 text-xs mb-1">Full Factory</p>
                  <p className="font-syne font-bold text-amber-300 text-2xl">{totFF}</p>
                </div>
                <div className="stat-card bg-gray-900 border border-red-500/30 rounded-xl px-4 py-3">
                  <p className="text-gray-500 text-xs mb-1">Others</p>
                  <p className="font-syne font-bold text-red-400 text-2xl">{totOth}</p>
                </div>
                <div className={`stat-card bg-gray-900 border rounded-xl px-4 py-3 ${totOrder > 0 ? 'border-orange-500/40' : 'border-gray-800'}`}>
                  <p className="text-gray-500 text-xs mb-1">Goods to Order</p>
                  <p className={`font-syne font-bold text-2xl ${totOrder > 0 ? 'text-orange-400' : 'text-gray-400'}`}>{totOrder}</p>
                </div>
              </div>
            );
          })()}

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 w-full sm:max-w-xs">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
              <input
                type="text"
                placeholder="Search items…"
                value={recordSearch}
                onChange={e => setRecordSearch(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-gray-500 text-xs">{filteredRecord.length} item{filteredRecord.length !== 1 ? 's' : ''}</span>
              <button
                onClick={printGeneralRecord}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                Print Report
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto overflow-y-auto max-h-[65vh]">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="bg-gray-800 text-gray-400 font-medium px-3 py-2.5 text-center border border-gray-700 w-10">S/N</th>
                    <th className="bg-gray-800 text-gray-400 font-medium px-3 py-2.5 text-left border border-gray-700 min-w-[200px]">Item Name</th>
                    <th className="bg-amber-950 text-amber-300 font-bold px-3 py-2.5 text-center border border-gray-700 min-w-[110px]">Full Factory</th>
                    <th className="bg-red-950 text-red-400 font-bold px-3 py-2.5 text-center border border-gray-700 min-w-[90px]">Others</th>
                    <th className="bg-green-950 text-green-400 font-bold px-3 py-2.5 text-center border border-gray-700 min-w-[100px]">Items Sold</th>
                    <th className="bg-cyan-950 text-cyan-400 font-bold px-3 py-2.5 text-center border border-gray-700 min-w-[130px]">Stocks in Kubwa</th>
                    <th className="bg-indigo-950 text-indigo-400 font-bold px-3 py-2.5 text-center border border-gray-700 min-w-[120px]">Stocks in Dubai</th>
                    <th className="bg-orange-950 text-orange-400 font-bold px-3 py-2.5 text-center border border-gray-700 min-w-[120px]">Goods to Order</th>
                    <th className="bg-emerald-950 text-emerald-400 font-bold px-3 py-2.5 text-center border border-gray-700 min-w-[120px]">Goods for Sales</th>
                    {canEditAll && <th className="bg-gray-800 text-gray-400 font-medium px-3 py-2.5 text-center border border-gray-700 w-12"></th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredRecord.length === 0 ? (
                    <tr><td colSpan={canEditAll ? 10 : 9} className="text-center text-gray-600 py-12">No items found</td></tr>
                  ) : filteredRecord.map((item, idx) => (
                    <tr key={item.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-center text-gray-500 font-mono text-xs border border-gray-800">{idx + 1}</td>
                      <td className="px-3 py-2.5 border border-gray-800">
                        <p className="text-white font-medium text-sm">{item.name}</p>
                        {item.supplier && <p className="text-gray-500 text-xs">{item.supplier}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-center border border-gray-800">
                        <span className={`font-mono font-bold text-sm ${item.fullFactory > 0 ? 'text-amber-300' : 'text-gray-600'}`}>{item.fullFactory}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center border border-gray-800">
                        <span className={`font-mono font-bold text-sm ${item.others > 0 ? 'text-red-400' : 'text-gray-600'}`}>{item.others}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center border border-gray-800">
                        <span className={`font-mono font-bold text-sm ${item.itemsSold > 0 ? 'text-green-400' : 'text-gray-600'}`}>{item.itemsSold}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center border border-gray-800">
                        <span className={`font-mono font-bold text-sm ${item.kubQty > 0 ? 'text-cyan-400' : 'text-gray-600'}`}>{item.kubQty}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center border border-gray-800">
                        <span className={`font-mono font-bold text-sm ${item.dubQty > 0 ? 'text-indigo-400' : 'text-gray-600'}`}>{item.dubQty}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center border border-gray-800">
                        <span className={`font-mono font-bold text-sm ${item.goodsToOrder > 0 ? 'text-orange-400' : 'text-gray-600'}`}>{item.goodsToOrder}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center border border-gray-800">
                        <span className={`font-mono font-bold text-sm ${item.goodsForSales > 0 ? 'text-emerald-400' : 'text-gray-600'}`}>{item.goodsForSales}</span>
                      </td>
                      {canEditAll && (
                        <td className="px-3 py-2.5 text-center border border-gray-800">
                          <button
                            onClick={() => openRecordEdit(item)}
                            title="Edit stock quantities"
                            className="text-gray-500 hover:text-blue-400 transition-colors p-1"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Transaction History Tab ── */}
      {tab === 'history' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search action, user, or detail…"
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
            />
            <input
              type="date"
              value={historyDate}
              onChange={e => setHistoryDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={historyUser}
              onChange={e => setHistoryUser(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Users</option>
              {historyUsers.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            {(historySearch || historyDate || historyUser !== 'all') && (
              <button
                onClick={clearHistoryFilters}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
              >
                Clear Filters
              </button>
            )}
            <span className="text-gray-500 text-xs self-center sm:ml-auto">
              {filteredHistory.length} record{filteredHistory.length !== 1 ? 's' : ''} across {groupedHistory.length} day{groupedHistory.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Daily-grouped log */}
          {groupedHistory.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl text-center text-gray-600 py-12">
              No transaction history found
            </div>
          ) : (
            <div className="space-y-5">
              {groupedHistory.map(([dayKey, entries]) => (
                <div key={dayKey} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                  <div className="card-heading flex items-center justify-between px-5 py-3 bg-gray-800/60 border-b border-gray-800">
                    <p className="font-syne font-semibold text-white text-sm">{fmtDate(dayKey)}</p>
                    <span className="text-gray-500 text-xs">{entries.length} transaction{entries.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="divide-y divide-gray-800">
                    {entries.map(entry => (
                      <div key={entry.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-5 py-3">
                        <span className="text-gray-500 text-xs font-mono w-16 shrink-0">
                          {new Date(entry.ts).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-lg shrink-0 w-fit ${ACTION_STYLES[entry.action] || 'bg-gray-800 text-gray-300'}`}>
                          {entry.action}
                        </span>
                        <span className="text-gray-300 text-sm flex-1 min-w-0 truncate" title={entry.detail}>{entry.detail}</span>
                        <span className="text-gray-500 text-xs shrink-0">{entry.user || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Inventory Transactions Ledger Tab ── */}
      {tab === 'ledger' && (
        <InventoryTransactionsLedger state={state} />
      )}

      {/* General Record Edit Modal */}
      {recordEditItem && (
        <Modal title={`Edit Record: ${recordEditItem.name}`} onClose={() => setRecordEditItem(null)}>
          <div className="space-y-5">
            <p className="text-gray-500 text-xs">Update stock quantities for this item. Booking and sales figures are computed automatically.</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-gray-400 text-xs font-medium mb-1">Full Factory</p>
                <p className="text-amber-300 font-mono font-bold text-lg">{recordEditItem.fullFactory}</p>
                <p className="text-gray-600 text-xs mt-0.5">Auto — from bookings</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-gray-400 text-xs font-medium mb-1">Others</p>
                <p className="text-red-400 font-mono font-bold text-lg">{recordEditItem.others}</p>
                <p className="text-gray-600 text-xs mt-0.5">Auto — from bookings</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-gray-400 text-xs font-medium mb-1">Items Sold</p>
                <p className="text-green-400 font-mono font-bold text-lg">{recordEditItem.itemsSold}</p>
                <p className="text-gray-600 text-xs mt-0.5">Auto — from sales</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4">
                <p className="text-gray-400 text-xs font-medium mb-1">Goods to Order</p>
                <p className="text-orange-400 font-mono font-bold text-lg">{recordEditItem.goodsToOrder}</p>
                <p className="text-gray-600 text-xs mt-0.5">Auto — from purchase list</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-cyan-400 text-xs font-semibold block mb-1.5">Stocks in Kubwa</label>
                <input
                  type="number"
                  min={0}
                  value={recordEditForm.kubQty}
                  onChange={e => setRecordEditForm(f => ({ ...f, kubQty: e.target.value }))}
                  className="w-full bg-gray-800 border border-cyan-900 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="text-indigo-400 text-xs font-semibold block mb-1.5">Stocks in Dubai</label>
                <input
                  type="number"
                  min={0}
                  value={recordEditForm.dubQty}
                  onChange={e => setRecordEditForm(f => ({ ...f, dubQty: e.target.value }))}
                  className="w-full bg-gray-800 border border-indigo-900 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="bg-gray-800 rounded-xl px-4 py-3 flex justify-between text-sm">
              <span className="text-gray-400">Goods for Sales (computed)</span>
              <span className="text-emerald-400 font-mono font-bold">
                {(parseInt(recordEditForm.dubQty) || 0) + (parseInt(recordEditForm.kubQty) || 0)}
              </span>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setRecordEditItem(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
              <button onClick={saveRecordEdit} className="flex-1 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">Save Changes</button>
            </div>
          </div>
        </Modal>
      )}

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
                <p className="text-gray-500 text-xs mt-1">Select which branch to add this item to</p>
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

      {/* Transfer Modal */}
      {modal === 'transfer' && transferItem && (() => {
        const sourceQty = transferSourceBranch === 'DUB' ? transferItem.dubQty : transferItem.kubQty;
        const destBranch = transferSourceBranch === 'DUB' ? 'KUB' : 'DUB';
        const destQty = destBranch === 'DUB' ? transferItem.dubQty : transferItem.kubQty;
        const q = parseInt(transferQty) || 0;
        return (
          <Modal title={`Transfer: ${transferItem.name}`} onClose={() => setModal(null)}>
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Source Branch</label>
                <select
                  value={transferSourceBranch}
                  onChange={e => setTransferSourceBranch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
                <p className="text-gray-500 text-xs mt-1">Available: {sourceQty} {transferItem.unit}</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 text-sm flex justify-between items-center">
                <span className="text-gray-400">Destination Branch</span>
                <span className="text-purple-400 font-medium">{destBranch === 'DUB' ? 'Dubai Market' : 'Kubwa Office'}</span>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Quantity to Transfer</label>
                <input
                  type="number"
                  min={1}
                  max={sourceQty}
                  placeholder="Enter quantity…"
                  value={transferQty}
                  onChange={e => setTransferQty(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {q > 0 && (
                <div className="bg-gray-800 rounded-xl p-4 text-sm space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-gray-400">New {transferSourceBranch === 'DUB' ? 'Dubai' : 'Kubwa'} Stock</span>
                    <span className="text-red-400 font-mono">{Math.max(0, sourceQty - q)} {transferItem.unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">New {destBranch === 'DUB' ? 'Dubai' : 'Kubwa'} Stock</span>
                    <span className="text-green-400 font-mono">{destQty + q} {transferItem.unit}</span>
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setModal(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
                <button onClick={doTransfer} disabled={!q || q < 1 || q > sourceQty} className="flex-1 bg-purple-500 hover:bg-purple-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
                  Transfer
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

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
          data={stockMovementsData}
          dateKey="_date"
          columns={stockMovementColumns}
          getSummary={getStockMovementsSummary}
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
