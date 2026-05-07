import { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { DEFAULT_PERMISSIONS } from '../data/users';
import { loadData } from '../lib/db';
import { syncAction } from '../lib/sync';
import { supabase } from '../lib/supabase';

const AppContext = createContext(null);

const initialState = {
  // App meta
  dbLoaded: false,
  // Auth
  user: null,
  recoveryMode: false, // true while user is resetting their password via email link
  // Delete Requests
  deleteRequests: [],
  // Settings
  vat: 0.075,
  thr: 5,
  currency: 'NGN',
  theme: 'dark',
  bizName: 'Bevick Packaging Machineries',
  bizRC: 'RC: 967373',
  bizPhone: '+234 800 000 0000',
  bizEmail: 'info@bevick.com',
  bizAddress: 'Plot 14, Industrial Layout, Abuja',
  // Branch filter (null = all branches)
  branch: null,
  bname: 'All Branches',
  // Data
  sales: [],
  customers: [],
  expenses: [],
  inventory: [],
  bookings: [],
  purchaseList: [],
  goodsReceived: [],
  recycleBin: [],
  suppliers: [],
  users: [],
  auditLog: [],
  pendingUsers: [],
  commissions: [],
  permissions: JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS)),
  // Filters
  sF: 'all',
  iF: 'all',
  eF: 'all',
  // Notifications
  notifySales: true,
  notifyLowStock: true,
  notifyExpenses: false,
  // Current page
  page: 'login',
};

function reducer(state, action) {
  switch (action.type) {

    // ── DB INIT ────────────────────────────────────────────────
    case 'INIT':
      return { ...state, ...action.payload, dbLoaded: true };

    // ── PASSWORD RECOVERY — enter / exit reset-password mode ───
    case 'ENTER_RECOVERY':
      return { ...state, user: null, recoveryMode: true, page: 'login' };
    case 'EXIT_RECOVERY':
      return { ...state, recoveryMode: false };

    // ── REFRESH — bulk-set a single table from a manual Supabase fetch ─────────
    case 'REFRESH_TABLE':
      return { ...state, [action.payload.key]: action.payload.data };

    // ── REFRESH SETTINGS — spreads fetched settings fields into state ──────────
    case 'REFRESH_SETTINGS':
      return { ...state, ...action.payload };

    case 'LOGIN': {
      const u = action.payload;
      // Generate a session token for cross-browser login persistence
      const sessionToken = `ST_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).slice(2,10)}`;
      // Store session token in localStorage
      localStorage.setItem('bevick_session_token', sessionToken);
      localStorage.setItem('bevick_session_user_id', u.id);
      return {
        ...state,
        user: { ...u, sessionToken },
        branch: u.bid,
        bname: u.bid === 'DUB' ? 'Dubai Market' : u.bid === 'KUB' ? 'Kubwa Office' : 'All Branches',
        page: 'dashboard',
      };
    }

    case 'LOGOUT':
      // Clear session tokens from localStorage
      localStorage.removeItem('bevick_session_token');
      localStorage.removeItem('bevick_session_user_id');
      return {
        ...initialState,
        dbLoaded:       true,
        inventory:      state.inventory,
        sales:          state.sales,
        customers:      state.customers,
        expenses:       state.expenses,
        bookings:       state.bookings,
        purchaseList:   state.purchaseList,
        goodsReceived:  state.goodsReceived,
        recycleBin:     state.recycleBin,
        suppliers:      state.suppliers,
        users:          state.users,
        auditLog:       state.auditLog,
        pendingUsers:   state.pendingUsers,
        commissions:    state.commissions,
        permissions:    state.permissions,
        deleteRequests: state.deleteRequests,
        vat:            state.vat,
        thr:            state.thr,
        currency:       state.currency,
        bizName:        state.bizName,
        bizRC:          state.bizRC,
        bizPhone:       state.bizPhone,
        bizEmail:       state.bizEmail,
        bizAddress:     state.bizAddress,
        notifySales:    state.notifySales,
        notifyLowStock: state.notifyLowStock,
        notifyExpenses: state.notifyExpenses,
      };

    case 'SET_PAGE':
      return { ...state, page: action.payload };

    case 'SET_BRANCH': {
      const b = action.payload;
      return {
        ...state,
        branch: b,
        bname: b === 'DUB' ? 'Dubai Market' : b === 'KUB' ? 'Kubwa Office' : 'All Branches',
      };
    }

    // ── SALES ──────────────────────────────────────────────────
    case 'ADD_SALE': {
      const sale = action.payload;
      const inventory = state.inventory.map(item => {
        const lineItem = sale.items.find(i => i.id === item.id);
        if (lineItem) return { ...item, qty: Math.max(0, item.qty - lineItem.qty) };
        return item;
      });
      return {
        ...state,
        sales: [sale, ...state.sales],
        inventory,
        auditLog: [{ id: Date.now(), action: 'Sale recorded', user: state.user?.name, ts: new Date().toISOString(), detail: `#${sale.id}` }, ...state.auditLog],
      };
    }

    case 'UPDATE_SALE': {
      const updated = action.payload;
      return {
        ...state,
        sales: state.sales.map(s => s.id === updated.id ? updated : s),
        auditLog: [{ id: Date.now(), action: 'Sale updated', user: state.user?.name, ts: new Date().toISOString(), detail: `#${updated.id}` }, ...state.auditLog],
      };
    }

    case 'DELETE_SALE': {
      const s = state.sales.find(x => x.id === action.payload);
      return {
        ...state,
        sales: state.sales.filter(x => x.id !== action.payload),
        recycleBin: [...state.recycleBin, { ...s, _type: 'sale', _deletedAt: new Date().toISOString() }],
        auditLog: [{ id: Date.now(), action: 'Sale deleted', user: state.user?.name, ts: new Date().toISOString(), detail: `#${action.payload}` }, ...state.auditLog],
      };
    }

    case 'ADD_PAYMENT': {
      const { saleId, payment } = action.payload;
      return {
        ...state,
        sales: state.sales.map(s => {
          if (s.id !== saleId) return s;
          const payments = [...(s.payments || []), payment];
          const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
          return { ...s, payments, amountPaid };
        }),
        auditLog: [{ id: Date.now(), action: 'Payment recorded', user: state.user?.name, ts: new Date().toISOString(), detail: `Sale #${saleId} · ₦${payment.amount.toLocaleString()}` }, ...state.auditLog],
      };
    }

    // ── CUSTOMERS ──────────────────────────────────────────────
    case 'ADD_CUSTOMER': {
      const c = action.payload;
      return { ...state, customers: [c, ...state.customers], auditLog: [{ id: Date.now(), action: 'Customer added', user: state.user?.name, ts: new Date().toISOString(), detail: c.name }, ...state.auditLog] };
    }
    case 'UPDATE_CUSTOMER':
      return { ...state, customers: state.customers.map(c => c.id === action.payload.id ? action.payload : c) };
    case 'DELETE_CUSTOMER': {
      const c = state.customers.find(x => x.id === action.payload);
      return {
        ...state,
        customers: state.customers.filter(x => x.id !== action.payload),
        recycleBin: [...state.recycleBin, { ...c, _type: 'customer', _deletedAt: new Date().toISOString() }],
        auditLog: [{ id: Date.now(), action: 'Customer deleted', user: state.user?.name, ts: new Date().toISOString(), detail: c.name }, ...state.auditLog],
      };
    }

    // ── EXPENSES ───────────────────────────────────────────────
    case 'ADD_EXPENSE': {
      const e = action.payload;
      return { ...state, expenses: [e, ...state.expenses], auditLog: [{ id: Date.now(), action: 'Expense added', user: state.user?.name, ts: new Date().toISOString(), detail: e.desc }, ...state.auditLog] };
    }
    case 'DELETE_EXPENSE': {
      const e = state.expenses.find(x => x.id === action.payload);
      return {
        ...state,
        expenses: state.expenses.filter(x => x.id !== action.payload),
        recycleBin: [...state.recycleBin, { ...e, _type: 'expense', _deletedAt: new Date().toISOString() }],
        auditLog: [{ id: Date.now(), action: 'Expense deleted', user: state.user?.name, ts: new Date().toISOString(), detail: e.desc }, ...state.auditLog],
      };
    }

    // ── INVENTORY ──────────────────────────────────────────────
    case 'ADD_ITEM': {
      const item = action.payload;
      return { ...state, inventory: [item, ...state.inventory], auditLog: [{ id: Date.now(), action: 'Item added', user: state.user?.name, ts: new Date().toISOString(), detail: item.name }, ...state.auditLog] };
    }
    case 'UPDATE_ITEM':
      return { ...state, inventory: state.inventory.map(i => i.id === action.payload.id ? action.payload : i) };
    case 'DELETE_ITEM': {
      const item = state.inventory.find(x => x.id === action.payload);
      return {
        ...state,
        inventory: state.inventory.filter(x => x.id !== action.payload),
        recycleBin: [...state.recycleBin, { ...item, _type: 'inventory', _deletedAt: new Date().toISOString() }],
        auditLog: [{ id: Date.now(), action: 'Item deleted', user: state.user?.name, ts: new Date().toISOString(), detail: item.name }, ...state.auditLog],
      };
    }
    case 'RESTOCK_ITEM':
      return {
        ...state,
        inventory: state.inventory.map(i => i.id === action.payload.id ? { ...i, qty: i.qty + action.payload.qty } : i),
        auditLog: [{ id: Date.now(), action: 'Item restocked', user: state.user?.name, ts: new Date().toISOString(), detail: `${action.payload.id} +${action.payload.qty}` }, ...state.auditLog],
      };

    // ── BOOKINGS ───────────────────────────────────────────────
    case 'ADD_BOOKING': {
      const booking = action.payload;
      const newPurchases = [];
      (booking.items || []).forEach(item => {
        if (!item.id) return;
        const invItem = state.inventory.find(i => i.id === item.id && i.branch === booking.branch);
        const currentQty = invItem ? invItem.qty : 0;
        if (currentQty < item.qty) {
          const needed = item.qty - currentQty;
          newPurchases.push({
            id: `PO${Date.now().toString(36).toUpperCase()}${newPurchases.length}${Math.random().toString(36).slice(2,4).toUpperCase()}`,
            name: item.name,
            itemId: item.id,
            qty: needed,
            unit: item.unit || '',
            category: invItem?.category || 'Others',
            estimatedCost: invItem ? invItem.price * needed : 0,
            priority: 'high',
            status: 'pending',
            branch: booking.branch,
            bookingId: booking.id,
            note: `Auto-generated from booking #${booking.id}`,
            date: new Date().toISOString(),
            createdBy: booking.createdBy,
          });
        }
      });
      return {
        ...state,
        bookings: [booking, ...state.bookings],
        purchaseList: [...newPurchases, ...state.purchaseList],
        auditLog: [{ id: Date.now(), action: 'Booking created', user: state.user?.name, ts: new Date().toISOString(), detail: `#${booking.id}${newPurchases.length ? ` · ${newPurchases.length} purchase order(s) generated` : ''}` }, ...state.auditLog],
      };
    }
    // Scans all active bookings and creates purchase orders for items below stock level
    // Admin (super_admin/admin) sees all branches, non-admin sees only their assigned branch
    case 'SYNC_PURCHASES_FROM_BOOKINGS': {
      const userBranch = state.user?.bid;
      const canEditAll = state.user?.role === 'super_admin' || state.user?.role === 'admin';
      
      // Filter bookings based on user role - admin sees all, non-admin sees only their branch
      const visibleBookings = state.bookings.filter(b => {
        if (canEditAll) return true;
        return b.branch === userBranch;
      });

      // Build a set of item names already in the purchase list (pending or ordered) to avoid duplicates
      const existingKeys = new Set(
        state.purchaseList
          .filter(p => p.status === 'pending' || p.status === 'ordered')
          .map(p => (p.itemId || p.name?.toLowerCase()))
      );
      const newPurchases = [];
      const seenThisRun = new Set();
      let idx = 0;
      visibleBookings
        .filter(b => b.status === 'pending' || b.status === 'confirmed')
        .forEach(booking => {
          (booking.items || []).forEach(item => {
            if (!item.id || !item.name) return;
            const key = item.id;
            if (seenThisRun.has(key) || existingKeys.has(key)) return;
            // Find inventory for the same branch as the booking
            const invItem = state.inventory.find(i => i.id === item.id && i.branch === booking.branch);
            const currentQty = invItem ? (invItem.qty || 0) : 0;
            if (currentQty < (item.qty || 1)) {
              seenThisRun.add(key);
              const needed = (item.qty || 1) - currentQty;
              newPurchases.push({
                id: `PO${Date.now().toString(36).toUpperCase()}${idx++}${Math.random().toString(36).slice(2,4).toUpperCase()}`,
                name: item.name,
                itemId: item.id,
                qty: needed,
                unit: item.unit || '',
                category: invItem?.category || 'Others',
                estimatedCost: invItem ? (invItem.price || 0) * needed : 0,
                priority: 'high',
                status: 'pending',
                branch: booking.branch,
                bookingId: booking.id,
                note: `Synced from booking #${booking.id} — ${booking.customer || ''}`.trim().replace(/—\s*$/, ''),
                date: new Date().toISOString(),
                createdBy: state.user?.name,
              });
            }
          });
        });
      if (!newPurchases.length) return state;
      return {
        ...state,
        purchaseList: [...newPurchases, ...state.purchaseList],
        auditLog: [{ id: Date.now(), action: 'Purchase orders synced from bookings', user: state.user?.name, ts: new Date().toISOString(), detail: `${newPurchases.length} order(s) generated` }, ...state.auditLog],
      };
    }

    case 'UPDATE_BOOKING_STATUS':
      return { ...state, bookings: state.bookings.map(b => b.id === action.payload.id ? { ...b, status: action.payload.status } : b) };

    case 'ADD_BOOKING_PAYMENT': {
      const { bookingId, payment } = action.payload;
      return {
        ...state,
        bookings: state.bookings.map(b => {
          if (b.id !== bookingId) return b;
          const payments = [...(b.payments || []), payment];
          const amountPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
          return { ...b, payments, amountPaid };
        }),
        auditLog: [
          { id: Date.now(), action: 'Booking payment recorded', user: state.user?.name, ts: new Date().toISOString(), detail: `Booking #${bookingId} · ₦${payment.amount.toLocaleString()}` },
          ...state.auditLog,
        ],
      };
    }
    case 'UPDATE_BOOKING': {
      const upd = action.payload;
      // Remove old purchase orders from this booking and generate new ones based on updated items
      let updatedPurchases = state.purchaseList.filter(p => p.bookingId !== upd.id);
      const newPurchases = [];
      (upd.items || []).forEach(item => {
        if (!item.id) return;
        const invItem = state.inventory.find(i => i.id === item.id && i.branch === upd.branch);
        const currentQty = invItem ? invItem.qty : 0;
        if (currentQty < item.qty) {
          const needed = item.qty - currentQty;
          newPurchases.push({
            id: `PO${Date.now().toString(36).toUpperCase()}${newPurchases.length}${Math.random().toString(36).slice(2,4).toUpperCase()}`,
            name: item.name,
            itemId: item.id,
            qty: needed,
            unit: item.unit || '',
            category: invItem?.category || 'Others',
            estimatedCost: invItem ? invItem.price * needed : 0,
            priority: 'high',
            status: 'pending',
            branch: upd.branch,
            bookingId: upd.id,
            note: `Auto-generated from booking #${upd.id}`,
            date: new Date().toISOString(),
            createdBy: upd.createdBy,
          });
        }
      });
      updatedPurchases = [...newPurchases, ...updatedPurchases];
      return {
        ...state,
        bookings: state.bookings.map(b => b.id === upd.id ? { ...b, ...upd } : b),
        purchaseList: updatedPurchases,
        auditLog: [{ id: Date.now(), action: 'Booking updated', user: state.user?.name, ts: new Date().toISOString(), detail: `#${upd.id}` }, ...state.auditLog],
      };
    }
    case 'DELETE_BOOKING': {
      const b = state.bookings.find(x => x.id === action.payload);
      // Remove any purchase orders auto-generated from this booking
      const purchasesAfterDelete = state.purchaseList.filter(p => p.bookingId !== action.payload);
      return {
        ...state,
        bookings: state.bookings.filter(x => x.id !== action.payload),
        purchaseList: purchasesAfterDelete,
        recycleBin: [...state.recycleBin, { ...b, _type: 'booking', _deletedAt: new Date().toISOString() }],
      };
    }

    // ── PURCHASE LIST ──────────────────────────────────────────
    case 'ADD_PURCHASE':
      return { ...state, purchaseList: [action.payload, ...state.purchaseList] };
    case 'UPDATE_PURCHASE_STATUS':
      return { ...state, purchaseList: state.purchaseList.map(p => p.id === action.payload.id ? { ...p, status: action.payload.status } : p) };
    case 'DELETE_PURCHASE':
      return { ...state, purchaseList: state.purchaseList.filter(p => p.id !== action.payload) };

    // ── GOODS RECEIVED ─────────────────────────────────────────
    case 'RECEIVE_GOODS': {
      const gr = action.payload;
      const inventory = state.inventory.map(item => {
        const received = gr.items.find(i => i.id === item.id);
        if (received) return { ...item, qty: item.qty + received.qty };
        return item;
      });

      // Get IDs of items that were received
      const receivedItemIds = new Set(gr.items.map(i => i.id));

      // Update booking statuses: if a "delivered" booking has items that were just restocked, change to "pending"
      const bookings = state.bookings.map(booking => {
        if (booking.status === 'delivered') {
          const hasReceivedItems = (booking.items || []).some(item => receivedItemIds.has(item.id));
          if (hasReceivedItems) {
            return { ...booking, status: 'pending' };
          }
        }
        return booking;
      });

      // Update purchase orders: if a "received" purchase order has items that were just restocked, mark as "fulfilled"
      const purchaseList = state.purchaseList.map(po => {
        if (po.status === 'received' && receivedItemIds.has(po.itemId)) {
          return { ...po, status: 'fulfilled' };
        }
        return po;
      });

      return {
        ...state,
        goodsReceived: [gr, ...state.goodsReceived],
        inventory,
        bookings,
        purchaseList,
        auditLog: [{ id: Date.now(), action: 'Goods received', user: state.user?.name, ts: new Date().toISOString(), detail: `GRN#${gr.id}` }, ...state.auditLog],
      };
    }

    case 'UPDATE_GRN': {
      const { updated, original } = action.payload;
      const inventory = state.inventory.map(item => {
        const oldItem = original.items.find(i => i.id === item.id);
        const newItem = updated.items.find(i => i.id === item.id);
        let qty = item.qty;
        if (oldItem) qty -= oldItem.qty;
        if (newItem) qty += newItem.qty;
        return (oldItem || newItem) ? { ...item, qty: Math.max(0, qty) } : item;
      });
      return {
        ...state,
        goodsReceived: state.goodsReceived.map(g => g.id === updated.id ? updated : g),
        inventory,
        auditLog: [{ id: Date.now(), action: 'GRN updated', user: state.user?.name, ts: new Date().toISOString(), detail: `GRN#${updated.id}` }, ...state.auditLog],
      };
    }

    // ── COMMISSIONS ────────────────────────────────────────────
    case 'ADD_COMMISSION': {
      const c = action.payload;
      return {
        ...state,
        commissions: [c, ...state.commissions],
        auditLog: [{ id: Date.now(), action: 'Commission added', user: state.user?.name, ts: new Date().toISOString(), detail: `${c.partner} → ${c.customer}` }, ...state.auditLog],
      };
    }
    case 'UPDATE_COMMISSION': {
      const c = action.payload;
      return {
        ...state,
        commissions: state.commissions.map(x => x.id === c.id ? c : x),
        auditLog: [{ id: Date.now(), action: 'Commission updated', user: state.user?.name, ts: new Date().toISOString(), detail: `${c.partner} → ${c.customer}` }, ...state.auditLog],
      };
    }
    case 'DELETE_COMMISSION': {
      const c = state.commissions.find(x => x.id === action.payload);
      return {
        ...state,
        commissions: state.commissions.filter(x => x.id !== action.payload),
        auditLog: [{ id: Date.now(), action: 'Commission deleted', user: state.user?.name, ts: new Date().toISOString(), detail: c ? `${c.partner} → ${c.customer}` : action.payload }, ...state.auditLog],
      };
    }

    // ── SUPPLIERS ──────────────────────────────────────────────
    case 'ADD_SUPPLIER':
      return { ...state, suppliers: [action.payload, ...state.suppliers] };
    case 'UPDATE_SUPPLIER':
      return { ...state, suppliers: state.suppliers.map(s => s.id === action.payload.id ? action.payload : s) };
    case 'DELETE_SUPPLIER': {
      const s = state.suppliers.find(x => x.id === action.payload);
      return {
        ...state,
        suppliers: state.suppliers.filter(x => x.id !== action.payload),
        recycleBin: [...state.recycleBin, { ...s, _type: 'supplier', _deletedAt: new Date().toISOString() }],
      };
    }

    // ── DELETE REQUESTS ────────────────────────────────────────
    case 'REQUEST_DELETE':
      return {
        ...state,
        deleteRequests: [action.payload, ...state.deleteRequests],
        auditLog: [{ id: Date.now(), action: 'Delete request submitted', user: state.user?.name, ts: new Date().toISOString(), detail: action.payload.label }, ...state.auditLog],
      };
    case 'APPROVE_DELETE': {
      const req = state.deleteRequests.find(r => r.id === action.payload);
      if (!req) return state;
      const typeMap = {
        sale: 'DELETE_SALE', customer: 'DELETE_CUSTOMER', expense: 'DELETE_EXPENSE',
        inventory: 'DELETE_ITEM', booking: 'DELETE_BOOKING', purchase: 'DELETE_PURCHASE',
        supplier: 'DELETE_SUPPLIER', commission: 'DELETE_COMMISSION',
      };
      const deleteType = typeMap[req.type];
      const afterDelete = deleteType ? reducer(state, { type: deleteType, payload: req.targetId }) : state;
      return {
        ...afterDelete,
        deleteRequests: afterDelete.deleteRequests.filter(r => r.id !== req.id),
        auditLog: [{ id: Date.now(), action: 'Delete request approved', user: state.user?.name, ts: new Date().toISOString(), detail: req.label }, ...afterDelete.auditLog],
      };
    }
    case 'REJECT_DELETE': {
      const req = state.deleteRequests.find(r => r.id === action.payload);
      return {
        ...state,
        deleteRequests: state.deleteRequests.filter(r => r.id !== action.payload),
        auditLog: [{ id: Date.now(), action: 'Delete request rejected', user: state.user?.name, ts: new Date().toISOString(), detail: req?.label || '' }, ...state.auditLog],
      };
    }

    // ── USERS ──────────────────────────────────────────────────
    case 'ADD_USER':
      return { ...state, users: [...state.users, action.payload] };
    case 'UPDATE_USER':
      return { ...state, users: state.users.map(u => u.id === action.payload.id ? action.payload : u) };
    case 'DELETE_USER':
      return { ...state, users: state.users.filter(u => u.id !== action.payload) };
    case 'APPROVE_PENDING': {
      const pu = state.pendingUsers.find(u => u.id === action.payload);
      const approvedUser = {
        ...pu,
        status: 'active',
        // Allow admin to override role/bid at approval time
        role: action.role || pu.role,
        bid: action.bid !== undefined ? action.bid : pu.bid,
      };
      // Update permissions for admin roles: set bid to null for all admin types
      if (['main_super_admin', 'super_admin', 'admin'].includes(approvedUser.role)) {
        approvedUser.bid = null;
      }
      return {
        ...state,
        pendingUsers: state.pendingUsers.filter(u => u.id !== action.payload),
        users: [...state.users, approvedUser],
      };
    }
    case 'REJECT_PENDING':
      return { ...state, pendingUsers: state.pendingUsers.filter(u => u.id !== action.payload) };
    case 'REGISTER_USER':
      return { ...state, pendingUsers: [...state.pendingUsers, action.payload] };

    // ── PERMISSIONS ────────────────────────────────────────────
    case 'SET_PERMISSIONS':
      return { ...state, permissions: { ...state.permissions, [action.payload.role]: action.payload.pages } };

    case 'SET_USER_PERMISSIONS': {
      const { userId, pages } = action.payload;
      const applyCustom = u => ({ ...u, customPages: pages.length > 0 ? pages : undefined });
      return {
        ...state,
        users: state.users.map(u => u.id === userId ? applyCustom(u) : u),
        user: state.user?.id === userId ? applyCustom(state.user) : state.user,
      };
    }

    // ── RECYCLE BIN ────────────────────────────────────────────
    case 'RESTORE_ITEM': {
      const item = state.recycleBin.find(x => x.id === action.payload);
      const { _type, _deletedAt, ...restored } = item;
      const bin = state.recycleBin.filter(x => x.id !== action.payload);
      if (_type === 'inventory') return { ...state, inventory: [...state.inventory, restored], recycleBin: bin };
      if (_type === 'sale')      return { ...state, sales: [restored, ...state.sales], recycleBin: bin };
      if (_type === 'customer')  return { ...state, customers: [restored, ...state.customers], recycleBin: bin };
      if (_type === 'expense')   return { ...state, expenses: [restored, ...state.expenses], recycleBin: bin };
      if (_type === 'supplier')  return { ...state, suppliers: [restored, ...state.suppliers], recycleBin: bin };
      if (_type === 'booking')   return { ...state, bookings: [restored, ...state.bookings], recycleBin: bin };
      return { ...state, recycleBin: bin };
    }
    case 'PERM_DELETE':
      return { ...state, recycleBin: state.recycleBin.filter(x => x.id !== action.payload) };
    case 'EMPTY_BIN': {
      const b = action.payload?.branch;
      return {
        ...state,
        recycleBin: b
          ? state.recycleBin.filter(i => i.branch && i.branch !== b)
          : [],
      };
    }

    // ── SETTINGS ───────────────────────────────────────────────
    case 'UPDATE_SETTINGS':
      return { ...state, ...action.payload };
    case 'UPDATE_PROFILE': {
      const u = { ...state.user, ...action.payload };
      return {
        ...state,
        user: u,
        users: state.users.map(x => x.id === u.id ? u : x),
      };
    }

    // ── REMOTE CHANGE (from Supabase Realtime) ─────────────────
    case 'REMOTE_CHANGE': {
      const { table, event, row } = action.payload;
      // Map table names → state keys (for simple array tables)
      const tableToKey = {
        inventory: 'inventory', sales: 'sales', customers: 'customers',
        expenses: 'expenses', bookings: 'bookings', purchase_list: 'purchaseList',
        goods_received: 'goodsReceived', suppliers: 'suppliers',
        recycle_bin: 'recycleBin', app_users: 'users',
        pending_users: 'pendingUsers', delete_requests: 'deleteRequests',
        commissions: 'commissions',
      };
      // permissions table has a special structure (role/pages columns, not id/data)
      if (table === 'permissions') {
        if (event !== 'DELETE' && row?.role && row?.pages !== undefined) {
          return { ...state, permissions: { ...state.permissions, [row.role]: row.pages } };
        }
        return state;
      }
      // app_settings has a single row with nested data
      if (table === 'app_settings') {
        if (event !== 'DELETE' && row?.data) {
          return { ...state, ...row.data };
        }
        return state;
      }
      // audit_log: only prepend new entries, cap at 200
      if (table === 'audit_log') {
        if (event !== 'DELETE' && row?.data) {
          const item = row.data;
          if (!state.auditLog.some(a => String(a.id) === String(item.id))) {
            return { ...state, auditLog: [item, ...state.auditLog].slice(0, 200) };
          }
        }
        return state;
      }
      const stateKey = tableToKey[table];
      if (!stateKey) return state;
      if (event === 'DELETE') {
        return { ...state, [stateKey]: state[stateKey].filter(x => String(x.id) !== String(row.id)) };
      }
      // INSERT or UPDATE — upsert into the array
      const item = row?.data;
      if (!item) return state;
      const exists = state[stateKey].some(x => String(x.id) === String(item.id));
      return {
        ...state,
        [stateKey]: exists
          ? state[stateKey].map(x => String(x.id) === String(item.id) ? item : x)
          : [item, ...state[stateKey]],
      };
    }

    // ── SESSION RESTORATION ────────────────────────────────────
    case 'RESTORE_SESSION_FROM_TOKEN': {
      const sessionToken = localStorage.getItem('bevick_session_token');
      const userId = localStorage.getItem('bevick_session_user_id');
      
      if (!sessionToken || !userId) return state;
      
      // Find the user with matching session token
      const user = state.users.find(u => u.id === userId && u.sessionToken === sessionToken);
      
      if (!user) {
        // Token not found or doesn't match, clear localStorage
        localStorage.removeItem('bevick_session_token');
        localStorage.removeItem('bevick_session_user_id');
        return state;
      }
      
      // Restore session
      return {
        ...state,
        user,
        branch: user.bid,
        bname: user.bid === 'DUB' ? 'Dubai Market' : user.bid === 'KUB' ? 'Kubwa Office' : 'All Branches',
        page: 'dashboard',
      };
    }

    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, rawDispatch] = useReducer(reducer, initialState);

  // Keep a ref to current state so dispatch closure always reads latest
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Wrapped dispatch: runs reducer locally to compute nextState, then syncs to Supabase
  const dispatch = useCallback((action) => {
    const prevState = stateRef.current;
    rawDispatch(action);
    // Compute nextState using the reducer (pure, safe to run twice)
    const nextState = reducer(prevState, action);
    syncAction(action, prevState, nextState);
    // Sign out of Supabase Auth on logout
    if (action.type === 'LOGOUT') {
      supabase.auth.signOut();
    }
  }, []);

  // Load all data from Supabase once on mount, then try to restore session
  useEffect(() => {
    loadData()
      .then(async (data) => {
        rawDispatch({ type: 'INIT', payload: data });

        // Try to restore session from localStorage first (cross-browser persistence)
        const savedSessionToken = localStorage.getItem('bevick_session_token');
        const savedUserId = localStorage.getItem('bevick_session_user_id');
        
        if (savedSessionToken && savedUserId) {
          const user = data.users?.find(u => u.id === savedUserId && u.sessionToken === savedSessionToken);
          if (user && user.status === 'active') {
            rawDispatch({ type: 'LOGIN', payload: user });
            return;
          } else {
            // Saved session is invalid or user not found, clear it
            localStorage.removeItem('bevick_session_token');
            localStorage.removeItem('bevick_session_user_id');
          }
        }

        // Fallback: check for an existing Supabase auth session
        // (handles page refresh while logged in from same browser)
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const email = session.user.email?.toLowerCase();
          const appUser = data.users?.find(u => u.em?.toLowerCase() === email);
          if (appUser && appUser.status === 'active') {
            rawDispatch({ type: 'LOGIN', payload: appUser });
          }
        }
      })
      .catch(err => {
        console.error('[AppContext] Failed to load data from Supabase:', err);
        rawDispatch({ type: 'INIT', payload: {} });
      });

    // Listen for auth events (password recovery link click → redirect to app)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User clicked the reset link — enter recovery mode so Login.jsx
        // shows the "Set New Password" form. Do NOT sign out here; the
        // recovery token is needed to call supabase.auth.updateUser().
        rawDispatch({ type: 'ENTER_RECOVERY' });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Subscribe to Supabase Realtime — push remote changes to all connected clients
  useEffect(() => {
    const TABLES = [
      'inventory', 'sales', 'customers', 'expenses', 'bookings',
      'purchase_list', 'goods_received', 'suppliers', 'recycle_bin',
      'audit_log', 'app_users', 'pending_users', 'delete_requests',
      'permissions', 'app_settings', 'commissions',
    ];

    const channel = supabase.channel('realtime:all-tables');

    TABLES.forEach(table => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          const event = payload.eventType; // 'INSERT' | 'UPDATE' | 'DELETE'
          // For DELETE, Supabase only returns the primary key in payload.old
          const row = event === 'DELETE' ? payload.old : payload.new;
          rawDispatch({ type: 'REMOTE_CHANGE', payload: { table, event, row } });
        }
      );
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[realtime] Connected — live updates active');
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export const CURRENCY_SYMBOLS = { NGN: '₦', USD: '$', EUR: '€', GBP: '£', CNY: '¥' };
export const CURRENCY_RATES   = { NGN: 1, USD: 0.00066, EUR: 0.00061, GBP: 0.00052, CNY: 0.0048 };

export function formatCurrency(amount, currency = 'NGN') {
  const sym = CURRENCY_SYMBOLS[currency] || '₦';
  const rate = CURRENCY_RATES[currency] || 1;
  const val = amount * rate;
  return `${sym}${val.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function genId(prefix = 'ID') {
  return `${prefix}${Date.now().toString(36).toUpperCase()}`;
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-NG', { day:'2-digit', month:'short', year:'numeric' });
}

export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('en-NG', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
