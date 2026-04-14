/**
 * db.js — Supabase data loading & seeding
 * Loads all app state from Supabase on startup.
 * Seeds default data (inventory, users, suppliers, permissions) if tables are empty.
 */
import { supabase } from './supabase';
import { ALL_ITEMS } from '../data/inventory';
import { DEFAULT_PERMISSIONS } from '../data/users';

const DEFAULT_SUPPLIERS = [
  { id:'S1', name:'TechPack Ltd',       contact:'Emeka Eze',       phone:'+234 801 111 0001', email:'info@techpack.ng',      address:'Lagos, Nigeria',  category:'Machinery',   status:'active' },
  { id:'S2', name:'SealPro NG',         contact:'Fatima Bello',    phone:'+234 802 111 0002', email:'sales@sealpro.ng',      address:'Abuja, Nigeria',  category:'Spare Parts', status:'active' },
  { id:'S3', name:'FilmPack NG',        contact:'Chukwudi Obi',    phone:'+234 803 111 0003', email:'info@filmpack.ng',      address:'Kano, Nigeria',   category:'Consumables', status:'active' },
  { id:'S4', name:'OilChem NG',         contact:'Aisha Mohammed',  phone:'+234 804 111 0004', email:'sales@oilchem.ng',      address:'Lagos, Nigeria',  category:'Chemicals',   status:'active' },
  { id:'S5', name:'SafetyGear NG',      contact:'Tunde Adeyemi',   phone:'+234 805 111 0005', email:'info@safetygear.ng',    address:'Abuja, Nigeria',  category:'Others',      status:'active' },
  { id:'S6', name:'LabelTech NG',       contact:'Grace Nwosu',     phone:'+234 806 111 0006', email:'sales@labeltech.ng',    address:'PH, Nigeria',     category:'Consumables', status:'active' },
  { id:'S7', name:'BeltTech NG',        contact:'Ibrahim Suleiman', phone:'+234 807 111 0007', email:'info@belttech.ng',     address:'Kaduna, Nigeria', category:'Spare Parts', status:'active' },
  { id:'S8', name:'ElectroParts NG',    contact:'Ngozi Ike',       phone:'+234 808 111 0008', email:'sales@electroparts.ng', address:'Enugu, Nigeria',  category:'Spare Parts', status:'active' },
];

// Helper: extract data from rows
const extract = (res) => (res.data || []).map(r => r.data);

// Tables that have a branch column in the schema
const BRANCH_TABLES = new Set(['inventory','sales','customers','expenses','bookings','purchase_list','goods_received']);

// Helper: upsert a single record into a table
async function upsert(table, obj) {
  const id = String(obj.id);
  const row = { id, data: obj };
  if (BRANCH_TABLES.has(table)) row.branch = obj.branch || null;
  const { error } = await supabase.from(table).upsert(row);
  if (error) console.error(`[db] upsert ${table} ${id}:`, error.message);
}

// Helper: upsert many records into a table (chunked to avoid request size limits)
async function upsertMany(table, items, chunkSize = 50) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize).map(obj => {
      const row = { id: String(obj.id), data: obj };
      if (BRANCH_TABLES.has(table)) row.branch = obj.branch || null;
      return row;
    });
    const { error } = await supabase.from(table).upsert(chunk);
    if (error) console.error(`[db] upsertMany ${table}:`, error.message);
  }
}

export async function loadData() {
  const [
    settingsRes,
    usersRes,
    inventoryRes,
    salesRes,
    customersRes,
    expensesRes,
    bookingsRes,
    purchaseRes,
    goodsRes,
    suppliersRes,
    recycleBinRes,
    auditRes,
    pendingRes,
    deleteReqRes,
    permissionsRes,
  ] = await Promise.all([
    supabase.from('app_settings').select('data').eq('id', 'main').maybeSingle(),
    supabase.from('app_users').select('data'),
    supabase.from('inventory').select('data'),
    supabase.from('sales').select('data'),
    supabase.from('customers').select('data'),
    supabase.from('expenses').select('data'),
    supabase.from('bookings').select('data'),
    supabase.from('purchase_list').select('data'),
    supabase.from('goods_received').select('data'),
    supabase.from('suppliers').select('data'),
    supabase.from('recycle_bin').select('data'),
    supabase.from('audit_log').select('data').order('id', { ascending: false }).limit(200),
    supabase.from('pending_users').select('data'),
    supabase.from('delete_requests').select('data'),
    supabase.from('permissions').select('role, pages'),
  ]);

  // ── Settings ─────────────────────────────────────────────────
  const settingsData = settingsRes.data?.data || {};

  // ── Users ────────────────────────────────────────────────────
  // Load users from Supabase (created via Gmail OAuth or manual registration)
  let users = extract(usersRes);

  // ── Inventory ─────────────────────────────────────────────────
  let inventory = extract(inventoryRes);
  if (!inventory.length) {
    inventory = JSON.parse(JSON.stringify(ALL_ITEMS));
    await upsertMany('inventory', inventory);
  }

  // ── Suppliers ─────────────────────────────────────────────────
  let suppliers = extract(suppliersRes);
  if (!suppliers.length) {
    suppliers = DEFAULT_SUPPLIERS;
    await Promise.all(suppliers.map(s => upsert('suppliers', s)));
  }

  // ── Permissions ───────────────────────────────────────────────
  const permRows = permissionsRes.data || [];
  let permissions = {};
  if (permRows.length) {
    permRows.forEach(p => { permissions[p.role] = p.pages || []; });
    // Merge: add any new default pages not yet stored (e.g. newly added pages like 'reports')
    let needsSync = false;
    for (const [role, defaultPages] of Object.entries(DEFAULT_PERMISSIONS)) {
      const stored = permissions[role] || [];
      const missing = defaultPages.filter(p => !stored.includes(p));
      if (missing.length) {
        permissions[role] = [...stored, ...missing];
        needsSync = true;
      }
    }
    if (needsSync) {
      await Promise.all(
        Object.entries(permissions).map(([role, pages]) =>
          supabase.from('permissions').upsert({ role, pages })
        )
      );
    }
  } else {
    permissions = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
    await Promise.all(
      Object.entries(permissions).map(([role, pages]) =>
        supabase.from('permissions').upsert({ role, pages })
      )
    );
  }

  return {
    // Settings fields (spread directly into state)
    vat:            settingsData.vat            ?? 0.075,
    thr:            settingsData.thr            ?? 5,
    currency:       settingsData.currency       ?? 'NGN',
    bizName:        settingsData.bizName        ?? 'Bevick Packaging Machineries',
    bizRC:          settingsData.bizRC          ?? 'RC: 967373',
    bizPhone:       settingsData.bizPhone       ?? '+234 800 000 0000',
    bizEmail:       settingsData.bizEmail       ?? 'info@bevick.com',
    bizAddress:     settingsData.bizAddress     ?? 'Plot 14, Industrial Layout, Abuja',
    notifySales:    settingsData.notifySales    ?? true,
    notifyLowStock: settingsData.notifyLowStock ?? true,
    notifyExpenses: settingsData.notifyExpenses ?? false,
    // Collections
    users,
    inventory,
    suppliers,
    permissions,
    sales:          extract(salesRes),
    customers:      extract(customersRes),
    expenses:       extract(expensesRes),
    bookings:       extract(bookingsRes),
    purchaseList:   extract(purchaseRes),
    goodsReceived:  extract(goodsRes),
    recycleBin:     extract(recycleBinRes),
    auditLog:       extract(auditRes),
    pendingUsers:   extract(pendingRes),
    deleteRequests: extract(deleteReqRes),
  };
}
