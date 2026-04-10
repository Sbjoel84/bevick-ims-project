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

    case 'LOGIN': {
      const u = action.payload;
      return {
        ...state,
        user: u,
        branch: u.bid,
        bname: u.bid === 'DUB' ? 'Dubai Market' : u.bid === 'KUB' ? 'Kubwa Office' : 'All Branches',
        page: 'dashboard',
      };
    }

    case 'LOGOUT':
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

    case 'DELETE_SALE': {
      const s = state.sales.find(x => x.id === action.payload);
      return {
        ...state,
        sales: state.sales.filter(x => x.id !== action.payload),
        recycleBin: [...state.recycleBin, { ...s, _type: 'sale', _deletedAt: new Date().toISOString() }],
        auditLog: [{ id: Date.now(), action: 'Sale deleted', user: state.user?.name, ts: new Date().toISOString(), detail: `#${action.payload}` }, ...state.auditLog],
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
        const invItem = state.inventory.find(i => i.id === item.id);
        const currentQty = invItem ? invItem.qty : 0;
        if (currentQty < item.qty) {
          const needed = item.qty - currentQty;
          newPurchases.push({
            id: `PO${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2,5).toUpperCase()}`,
            name: item.name,
            itemId: item.id,
            qty: needed,
            unit: item.unit || '',
            priority: 'high',
            status: 'pending',
            branch: booking.branch,
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
    case 'UPDATE_BOOKING_STATUS':
      return { ...state, bookings: state.bookings.map(b => b.id === action.payload.id ? { ...b, status: action.payload.status } : b) };
    case 'UPDATE_BOOKING': {
      const upd = action.payload;
      return {
        ...state,
        bookings: state.bookings.map(b => b.id === upd.id ? { ...b, ...upd } : b),
        auditLog: [{ id: Date.now(), action: 'Booking updated', user: state.user?.name, ts: new Date().toISOString(), detail: `#${upd.id}` }, ...state.auditLog],
      };
    }
    case 'DELETE_BOOKING': {
      const b = state.bookings.find(x => x.id === action.payload);
      return {
        ...state,
        bookings: state.bookings.filter(x => x.id !== action.payload),
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
      return {
        ...state,
        goodsReceived: [gr, ...state.goodsReceived],
        inventory,
        auditLog: [{ id: Date.now(), action: 'Goods received', user: state.user?.name, ts: new Date().toISOString(), detail: `GRN#${gr.id}` }, ...state.auditLog],
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
        supplier: 'DELETE_SUPPLIER',
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
      // Update permissions for super_admin role
      if (approvedUser.role === 'super_admin') approvedUser.bid = null;
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
    case 'EMPTY_BIN':
      return { ...state, recycleBin: [] };

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

        // After data is loaded, check for an existing Supabase auth session
        // (handles page refresh while logged in)
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
        // User clicked the reset link — they'll land on the app, sign them out
        // so they see the login page where they can set new password.
        // The actual password update is done in Settings after admin login,
        // or via the reset flow which Supabase handles via email link.
        supabase.auth.signOut();
      }
    });

    return () => subscription.unsubscribe();
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
