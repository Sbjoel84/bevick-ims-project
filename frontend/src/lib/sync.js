/**
 * sync.js — Sync reducer actions to Supabase
 *
 * Called after every dispatch with (action, prevState, nextState).
 * Maps each action type to the appropriate Supabase write(s).
 * Errors are caught and logged — they never crash the app.
 */
import { supabase } from './supabase';

// ── Helpers ─────────────────────────────────────────────────────────────────

const BRANCH_TABLES = new Set(['inventory','inventory_movements','sales','customers','expenses','bookings','purchase_list','goods_received']);

// Max rows per upsert request — prevents oversized payloads as data grows.
const CHUNK_SIZE = 50;

// Retries a Supabase write up to maxAttempts times with exponential backoff.
// Handles transient network errors so data is never silently lost.
async function withRetry(fn, maxAttempts = 3, baseDelayMs = 400) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, baseDelayMs * 2 ** attempt));
      }
    }
  }
  throw lastErr;
}

async function upsert(table, obj) {
  const row = { id: String(obj.id), data: obj };
  if (BRANCH_TABLES.has(table)) row.branch = obj.branch || null;
  await withRetry(async () => {
    const { error } = await supabase.from(table).upsert(row);
    if (error) throw error;
  });
}

async function remove(table, id) {
  await withRetry(async () => {
    const { error } = await supabase.from(table).delete().eq('id', String(id));
    if (error) throw error;
  });
}

// Chunked batch upsert — avoids request-size limits for large collections.
async function upsertMany(table, items) {
  if (!items.length) return;
  const rows = items.map(obj => {
    const row = { id: String(obj.id), data: obj };
    if (BRANCH_TABLES.has(table)) row.branch = obj.branch || null;
    return row;
  });
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    await withRetry(async () => {
      const { error } = await supabase.from(table).upsert(chunk);
      if (error) throw error;
    });
  }
}

async function syncAudit(nextState, prevState) {
  const next = nextState.auditLog[0];
  const prev = prevState.auditLog[0];
  if (next && next !== prev) {
    await withRetry(async () => {
      const { error } = await supabase.from('audit_log').upsert({ id: String(next.id), data: next });
      if (error) throw error;
    });
  }
}

async function toRecycleBin(nextState, id) {
  const item = nextState.recycleBin.find(r => r.id === id);
  if (item) await upsert('recycle_bin', item);
}

// Stock movements are always prepended (never mutated), same as auditLog —
// diff by length and upsert whatever's new, regardless of which action caused it.
async function syncMovements(nextState, prevState) {
  const prevLen = prevState.inventoryMovements?.length || 0;
  const nextLen = nextState.inventoryMovements?.length || 0;
  const newCount = nextLen - prevLen;
  if (newCount > 0) {
    await upsertMany('inventory_movements', nextState.inventoryMovements.slice(0, newCount));
  }
}

// ── Main sync function ───────────────────────────────────────────────────────

export async function syncAction(action, prevState, nextState) {
  try {
    switch (action.type) {

      // ── LOGIN — persist sessionToken so refresh restores the session ─────────
      case 'LOGIN': {
        const u = nextState.user;
        if (u?.id && u?.sessionToken) {
          // Write the full user object (including sessionToken) to app_users.
          // On refresh, AppContext reads this back and matches localStorage token.
          await supabase.from('app_users').upsert({ id: String(u.id), data: u });
        }
        return;
      }

      // ── LOGOUT — clear sessionToken so stale localStorage tokens can't replay
      case 'LOGOUT': {
        const prev = prevState.user;
        if (prev?.id) {
          const { sessionToken: _drop, ...userWithoutToken } = prev;
          await supabase.from('app_users').upsert({ id: String(prev.id), data: userWithoutToken });
        }
        return;
      }

      // ── PAGE / BRANCH / RECOVERY / REFRESH — no persistence needed ──────────
      case 'SET_PAGE':
      case 'SET_BRANCH':
      case 'ENTER_RECOVERY':
      case 'EXIT_RECOVERY':
      case 'INIT':
      case 'REFRESH_TABLE':
      case 'REFRESH_SETTINGS':
        return;

      // ── SALES ────────────────────────────────────────────────
      case 'ADD_SALE': {
        console.log('[sync] ADD_SALE:', action.payload.id, 'branch:', action.payload.branch);
        await upsert('sales', action.payload);
        // Sync deducted inventory items
        const ids = new Set(action.payload.items.map(i => i.id));
        const modified = nextState.inventory.filter(i => ids.has(i.id));
        console.log('[sync] inventory modified count:', modified.length);
        await upsertMany('inventory', modified);
        break;
      }
      case 'DELETE_SALE': {
        await remove('sales', action.payload);
        await toRecycleBin(nextState, action.payload);
        // Sync inventory items that were restored when the sale was removed
        const deletedSale = prevState.sales.find(s => s.id === action.payload);
        if (deletedSale?.items?.length) {
          const ids = new Set(deletedSale.items.filter(i => !i._custom).map(i => i.id));
          const restored = nextState.inventory.filter(i => ids.has(i.id));
          if (restored.length) await upsertMany('inventory', restored);
        }
        // If this was a booking-type sale, also remove the linked booking from Supabase
        if (deletedSale?.bookingId) {
          await remove('bookings', deletedSale.bookingId);
          await toRecycleBin(nextState, deletedSale.bookingId);
          const purchasesToDelete = prevState.purchaseList.filter(p => p.bookingId === deletedSale.bookingId);
          if (purchasesToDelete.length) {
            await Promise.all(purchasesToDelete.map(p => remove('purchase_list', p.id)));
          }
        }
        break;
      }
      case 'UPDATE_SALE': {
        await upsert('sales', action.payload);
        // Sync all inventory items touched by the original and updated sale
        const originalSale = prevState.sales.find(s => s.id === action.payload.id);
        const allIds = new Set([
          ...(originalSale?.items || []).filter(i => !i._custom).map(i => i.id),
          ...(action.payload.items || []).filter(i => !i._custom).map(i => i.id),
        ]);
        if (allIds.size) {
          const modified = nextState.inventory.filter(i => allIds.has(i.id));
          if (modified.length) await upsertMany('inventory', modified);
        }
        break;
      }
      case 'ADD_PAYMENT': {
        const sale = nextState.sales.find(s => s.id === action.payload.saleId);
        if (sale) await upsert('sales', sale);
        break;
      }

      // ── CUSTOMERS ────────────────────────────────────────────
      case 'ADD_CUSTOMER':
        await upsert('customers', action.payload);
        break;
      case 'UPDATE_CUSTOMER':
        await upsert('customers', action.payload);
        break;
      case 'DELETE_CUSTOMER': {
        await remove('customers', action.payload);
        await toRecycleBin(nextState, action.payload);
        break;
      }

      // ── EXPENSES ─────────────────────────────────────────────
      case 'ADD_EXPENSE':
        await upsert('expenses', action.payload);
        break;
      case 'UPDATE_EXPENSE':
        await upsert('expenses', action.payload);
        break;
      case 'DELETE_EXPENSE': {
        await remove('expenses', action.payload);
        await toRecycleBin(nextState, action.payload);
        break;
      }

      // ── NORMALIZE ITEM NAME — sync all touched records to Supabase ──────────
      case 'NORMALIZE_ITEM_NAME': {
        const changedInventory = nextState.inventory.filter(i => {
          const prev = prevState.inventory.find(x => x.id === i.id);
          return prev && prev.name !== i.name;
        });
        const changedBookings = nextState.bookings.filter(b => {
          const prev = prevState.bookings.find(x => x.id === b.id);
          return prev && JSON.stringify(prev.items) !== JSON.stringify(b.items);
        });
        const changedSales = nextState.sales.filter(s => {
          const prev = prevState.sales.find(x => x.id === s.id);
          return prev && JSON.stringify(prev.items) !== JSON.stringify(s.items);
        });
        if (changedInventory.length) await upsertMany('inventory', changedInventory);
        if (changedBookings.length)  await upsertMany('bookings',  changedBookings);
        if (changedSales.length)     await upsertMany('sales',     changedSales);
        break;
      }

      // ── INVENTORY ────────────────────────────────────────────
      case 'ADD_ITEM':
        await upsert('inventory', action.payload);
        break;
      case 'UPDATE_ITEM':
        await upsert('inventory', action.payload);
        break;
      case 'DELETE_ITEM': {
        await remove('inventory', action.payload);
        await toRecycleBin(nextState, action.payload);
        break;
      }
      case 'RESTOCK_ITEM': {
        const item = nextState.inventory.find(i => i.id === action.payload.id);
        if (item) await upsert('inventory', item);
        break;
      }

      // ── BOOKINGS ─────────────────────────────────────────────
      case 'ADD_BOOKING': {
        await upsert('bookings', action.payload);
        // Sync auto-generated purchase list entries (new ones are at the front of nextState)
        const prevIds = new Set(prevState.purchaseList.map(p => p.id));
        const newPurchases = nextState.purchaseList.filter(p => !prevIds.has(p.id));
        await upsertMany('purchase_list', newPurchases);
        break;
      }
      case 'SYNC_PURCHASES_FROM_BOOKINGS': {
        const prevIds = new Set(prevState.purchaseList.map(p => p.id));
        const newPurchases = nextState.purchaseList.filter(p => !prevIds.has(p.id));
        await upsertMany('purchase_list', newPurchases);
        break;
      }
      case 'UPDATE_BOOKING_STATUS': {
        const b = nextState.bookings.find(x => x.id === action.payload.id);
        if (b) await upsert('bookings', b);
        break;
      }
      case 'ADD_BOOKING_PAYMENT': {
        const b = nextState.bookings.find(x => x.id === action.payload.bookingId);
        if (b) await upsert('bookings', b);
        break;
      }
      case 'UPDATE_BOOKING': {
        await upsert('bookings', action.payload);
        // Also sync purchase orders that were regenerated for this booking
        const purchasesForBooking = nextState.purchaseList.filter(p => p.bookingId === action.payload.id);
        if (purchasesForBooking.length) await upsertMany('purchase_list', purchasesForBooking);
        // Remove old purchases from this booking that no longer exist
        const oldPurchases = prevState.purchaseList.filter(p => p.bookingId === action.payload.id);
        const newPurchaseIds = new Set(purchasesForBooking.map(p => p.id));
        const stalePurchases = oldPurchases.filter(p => !newPurchaseIds.has(p.id));
        if (stalePurchases.length) {
          await Promise.all(stalePurchases.map(p => remove('purchase_list', p.id)));
        }
        break;
      }
      case 'DELIVER_BOOKING': {
        const { bookingId } = action.payload;
        // Sync the booking's updated status ('delivered')
        const updatedBooking = nextState.bookings.find(b => b.id === bookingId);
        if (updatedBooking) await upsert('bookings', updatedBooking);
        // Sync the linked sale's updated status ('delivered')
        const updatedSale = nextState.sales.find(s => s.bookingId === bookingId);
        if (updatedSale) await upsert('sales', updatedSale);
        // Sync all inventory items that were deducted
        const sourceItems =
          prevState.bookings.find(b => b.id === bookingId)?.items ||
          prevState.sales.find(s => s.bookingId === bookingId)?.items || [];
        const itemIds = new Set(sourceItems.filter(i => i.id).map(i => i.id));
        if (itemIds.size) {
          const modified = nextState.inventory.filter(i => itemIds.has(i.id));
          if (modified.length) await upsertMany('inventory', modified);
        }
        break;
      }
      case 'DELETE_BOOKING': {
        await remove('bookings', action.payload);
        await toRecycleBin(nextState, action.payload);
        const purchasesToDelete = prevState.purchaseList.filter(p => p.bookingId === action.payload);
        if (purchasesToDelete.length) {
          await Promise.all(purchasesToDelete.map(p => remove('purchase_list', p.id)));
        }
        // Also remove the linked booking-type sale from Supabase
        const linkedSale = prevState.sales.find(s => s.bookingId === action.payload);
        if (linkedSale) {
          await remove('sales', linkedSale.id);
          await toRecycleBin(nextState, linkedSale.id);
        }
        break;
      }

      // ── PURCHASE LIST ─────────────────────────────────────────
      case 'ADD_PURCHASE':
        await upsert('purchase_list', action.payload);
        break;
      case 'UPDATE_PURCHASE_STATUS': {
        const p = nextState.purchaseList.find(x => x.id === action.payload.id);
        if (p) await upsert('purchase_list', p);
        break;
      }
      case 'DELETE_PURCHASE':
        await remove('purchase_list', action.payload);
        break;

      // ── GOODS RECEIVED ────────────────────────────────────────
      case 'RECEIVE_GOODS': {
        await upsert('goods_received', action.payload);
        // Sync restocked inventory items
        const ids = new Set(action.payload.items.map(i => i.id));
        const modified = nextState.inventory.filter(i => ids.has(i.id));
        await upsertMany('inventory', modified);
        // Sync any purchase orders that were marked as "fulfilled"
        const changedPurchases = nextState.purchaseList.filter(p => {
          const prevP = prevState.purchaseList.find(x => x.id === p.id);
          return prevP && prevP.status !== p.status;
        });
        if (changedPurchases.length) await upsertMany('purchase_list', changedPurchases);
        break;
      }

      case 'UPDATE_GRN': {
        await upsert('goods_received', action.payload.updated);
        const allItemIds = new Set([
          ...action.payload.original.items.map(i => i.id),
          ...action.payload.updated.items.map(i => i.id),
        ]);
        const modifiedItems = nextState.inventory.filter(i => allItemIds.has(i.id));
        await upsertMany('inventory', modifiedItems);
        break;
      }

      case 'DELETE_GRN': {
        await remove('goods_received', action.payload);
        const grn = prevState.goodsReceived.find(g => g.id === action.payload);
        if (grn?.items?.length) {
          const ids = new Set(grn.items.map(i => i.id));
          const reversed = nextState.inventory.filter(i => ids.has(i.id));
          if (reversed.length) await upsertMany('inventory', reversed);
        }
        break;
      }

      // ── COMMISSIONS ──────────────────────────────────────────
      case 'ADD_COMMISSION':
        await upsert('commissions', action.payload);
        break;
      case 'UPDATE_COMMISSION':
        await upsert('commissions', action.payload);
        break;
      case 'DELETE_COMMISSION':
        await remove('commissions', action.payload);
        break;

      // ── SUPPLIERS ─────────────────────────────────────────────
      case 'ADD_SUPPLIER':
        await upsert('suppliers', action.payload);
        break;
      case 'UPDATE_SUPPLIER':
        await upsert('suppliers', action.payload);
        break;
      case 'DELETE_SUPPLIER': {
        await remove('suppliers', action.payload);
        await toRecycleBin(nextState, action.payload);
        break;
      }

      // ── USERS ─────────────────────────────────────────────────
      case 'ADD_USER':
        await upsert('app_users', action.payload);
        break;
      case 'UPDATE_USER':
        await upsert('app_users', action.payload);
        break;
      case 'DELETE_USER':
        await remove('app_users', action.payload);
        break;
      case 'APPROVE_PENDING': {
        await remove('pending_users', action.payload);
        const approved = nextState.users.find(u => u.id === action.payload);
        if (approved) {
          await supabase.from('app_users').upsert({ id: String(approved.id), data: approved });
        }
        break;
      }
      case 'REJECT_PENDING':
        await remove('pending_users', action.payload);
        break;
      case 'REGISTER_USER':
        // Save to pending_users table (no branch column on this table)
        await supabase.from('pending_users').upsert({ id: String(action.payload.id), data: action.payload });
        break;

      // ── PERMISSIONS ───────────────────────────────────────────
      case 'SET_PERMISSIONS': {
        const { role, pages } = action.payload;
        await supabase.from('permissions').upsert({ role, pages });
        break;
      }
      case 'SET_USER_PERMISSIONS': {
        const u = nextState.users.find(x => x.id === action.payload.userId);
        if (u) await upsert('app_users', u);
        break;
      }

      // ── RECYCLE BIN ───────────────────────────────────────────
      case 'RESTORE_ITEM': {
        await remove('recycle_bin', action.payload);
        // Find the original type from prevState recycle bin
        const binItem = prevState.recycleBin.find(x => x.id === action.payload);
        if (binItem) {
          const typeToTable = {
            inventory: 'inventory', sale: 'sales', customer: 'customers',
            expense: 'expenses', supplier: 'suppliers', booking: 'bookings',
          };
          const tbl = typeToTable[binItem._type];
          const stateKey = {
            inventory: 'inventory', sale: 'sales', customer: 'customers',
            expense: 'expenses', supplier: 'suppliers', booking: 'bookings',
          }[binItem._type];
          if (tbl && stateKey) {
            const restored = nextState[stateKey].find(x => x.id === action.payload);
            if (restored) await upsert(tbl, restored);
          }
        }
        break;
      }
      case 'PERM_DELETE':
        await remove('recycle_bin', action.payload);
        break;
      case 'EMPTY_BIN': {
        const b = action.payload?.branch;
        const toDelete = b
          ? prevState.recycleBin.filter(r => !r.branch || r.branch === b)
          : prevState.recycleBin;
        const ids = toDelete.map(r => String(r.id));
        if (ids.length) {
          await supabase.from('recycle_bin').delete().in('id', ids);
        }
        break;
      }

      // ── SETTINGS ──────────────────────────────────────────────
      case 'UPDATE_SETTINGS': {
        // Merge updated settings into the stored settings object
        const currentSettings = {
          vat: nextState.vat, thr: nextState.thr, currency: nextState.currency,
          bizName: nextState.bizName, bizRC: nextState.bizRC, bizPhone: nextState.bizPhone,
          bizEmail: nextState.bizEmail, bizAddress: nextState.bizAddress,
          notifySales: nextState.notifySales, notifyLowStock: nextState.notifyLowStock,
          notifyExpenses: nextState.notifyExpenses,
        };
        await supabase.from('app_settings').upsert({ id: 'main', data: currentSettings });
        break;
      }
      case 'UPDATE_PROFILE': {
        const u = nextState.users.find(x => x.id === nextState.user?.id);
        if (u) await upsert('app_users', u);
        break;
      }

      // ── DELETE REQUESTS ───────────────────────────────────────
      case 'REQUEST_DELETE':
        await upsert('delete_requests', action.payload);
        break;
      case 'APPROVE_DELETE': {
        // Remove the request
        await remove('delete_requests', action.payload);
        // Find what type of record was deleted and sync accordingly
        const req = prevState.deleteRequests.find(r => r.id === action.payload);
        if (req) {
          const tableMap = {
            sale: 'sales', customer: 'customers', expense: 'expenses',
            inventory: 'inventory', booking: 'bookings',
            purchase: 'purchase_list', supplier: 'suppliers',
            commission: 'commissions',
          };
          const tbl = tableMap[req.type];
          if (tbl) {
            await remove(tbl, req.targetId);
            await toRecycleBin(nextState, req.targetId);
          }
          // For sale deletions, sync the inventory items that were restored
          if (req.type === 'sale') {
            const deletedSale = prevState.sales.find(s => s.id === req.targetId);
            if (deletedSale?.items?.length) {
              const ids = new Set(deletedSale.items.filter(i => !i._custom).map(i => i.id));
              const restored = nextState.inventory.filter(i => ids.has(i.id));
              if (restored.length) await upsertMany('inventory', restored);
            }
          }
        }
        break;
      }
      case 'REJECT_DELETE':
        await remove('delete_requests', action.payload);
        break;

      default:
        break;
    }

    // Always sync the latest audit log entry and any new stock movements
    await syncAudit(nextState, prevState);
    await syncMovements(nextState, prevState);

  } catch (err) {
    console.error('[sync] Error syncing action', action.type, ':', err?.message || err);
    throw err;
  }
}
