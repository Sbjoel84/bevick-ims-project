/**
 * setup-db.mjs
 * Run this ONCE after executing supabase-schema.sql in the Supabase SQL Editor.
 *
 * Usage:
 *   node setup-db.mjs
 *
 * What it does:
 *   1. Verifies the Supabase connection and that all tables exist
 *   2. Seeds default data: users, inventory (94 items), suppliers, permissions
 *   3. Creates the default settings row
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL     = 'https://vqhxqnhqylxskwpxdhun.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxaHhxbmhxeWx4c2t3cHhkaHVuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTE3NTU4MywiZXhwIjoyMDg2NzUxNTgzfQ.kqOHj42IHHDp0R0G6XHm3kMz7Mkw9jcpahnP9WXEBs0';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── Default data ──────────────────────────────────────────────────────────────

const DEMO_USERS = [
  { id:'U1', em:'admin@bevick.com',  pw:'admin123', name:'K White',   role:'super_admin', bid:null,  initials:'KW', phone:'+234 801 000 0001', status:'active' },
  { id:'U2', em:'dubai@bevick.com',  pw:'dubai123', name:'A Musa',    role:'inventory',   bid:'DUB', initials:'AM', phone:'+234 802 000 0002', status:'active' },
  { id:'U3', em:'kubwa@bevick.com',  pw:'kubwa123', name:'B Okafor',  role:'sales',       bid:'KUB', initials:'BO', phone:'+234 803 000 0003', status:'active' },
];

const DEFAULT_PERMISSIONS = {
  super_admin: ['dashboard','sales','customers','expenses','inventory','booked','purchase','goods','suppliers','recycle','settings','admin'],
  inventory:   ['dashboard','inventory','booked','purchase','goods','suppliers','settings'],
  sales:       ['dashboard','sales','customers','expenses','booked','settings'],
};

const DEFAULT_SUPPLIERS = [
  { id:'S1', name:'TechPack Ltd',    contact:'Emeka Eze',       phone:'+234 801 111 0001', email:'info@techpack.ng',     address:'Lagos, Nigeria',  category:'Machinery',   status:'active' },
  { id:'S2', name:'SealPro NG',      contact:'Fatima Bello',    phone:'+234 802 111 0002', email:'sales@sealpro.ng',     address:'Abuja, Nigeria',  category:'Spare Parts', status:'active' },
  { id:'S3', name:'FilmPack NG',     contact:'Chukwudi Obi',    phone:'+234 803 111 0003', email:'info@filmpack.ng',     address:'Kano, Nigeria',   category:'Consumables', status:'active' },
  { id:'S4', name:'OilChem NG',      contact:'Aisha Mohammed',  phone:'+234 804 111 0004', email:'sales@oilchem.ng',     address:'Lagos, Nigeria',  category:'Chemicals',   status:'active' },
  { id:'S5', name:'SafetyGear NG',   contact:'Tunde Adeyemi',   phone:'+234 805 111 0005', email:'info@safetygear.ng',   address:'Abuja, Nigeria',  category:'Others',      status:'active' },
  { id:'S6', name:'LabelTech NG',    contact:'Grace Nwosu',     phone:'+234 806 111 0006', email:'sales@labeltech.ng',   address:'PH, Nigeria',     category:'Consumables', status:'active' },
  { id:'S7', name:'BeltTech NG',     contact:'Ibrahim Suleiman',phone:'+234 807 111 0007', email:'info@belttech.ng',     address:'Kaduna, Nigeria', category:'Spare Parts', status:'active' },
  { id:'S8', name:'ElectroParts NG', contact:'Ngozi Ike',       phone:'+234 808 111 0008', email:'sales@electroparts.ng',address:'Enugu, Nigeria',  category:'Spare Parts', status:'active' },
];

const SETTINGS = {
  vat: 0.075, thr: 5, currency: 'NGN',
  bizName: 'Bevick Packaging Machineries', bizRC: 'RC: 967373',
  bizPhone: '+234 800 000 0000', bizEmail: 'info@bevick.com',
  bizAddress: 'Plot 14, Industrial Layout, Abuja',
  notifySales: true, notifyLowStock: true, notifyExpenses: false,
};

// Load inventory from the project's data file
let ALL_ITEMS = [];
try {
  // Read the inventory data file
  const raw = readFileSync('./src/data/inventory.js', 'utf8');
  // Extract the array using a regex (simple extraction)
  const match = raw.match(/export const ALL_ITEMS\s*=\s*(\[[\s\S]*?\]);/);
  if (match) {
    ALL_ITEMS = eval(match[1]);
    console.log(`  Loaded ${ALL_ITEMS.length} inventory items from local data file`);
  }
} catch (e) {
  console.warn('  Could not load inventory.js, will skip inventory seeding:', e.message);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(label) { console.log(`  ✓ ${label}`); }
function fail(label, err) { console.error(`  ✗ ${label}:`, err?.message || err); }

async function tableExists(name) {
  const col = name === 'permissions' ? 'role' : 'id';
  const { error } = await supabase.from(name).select(col).limit(1);
  return !error;
}

async function isEmpty(name) {
  const col = name === 'permissions' ? 'role' : 'id';
  const { data } = await supabase.from(name).select(col).limit(1);
  return !data || data.length === 0;
}

const BRANCH_TABLES = new Set(['inventory','sales','customers','expenses','bookings','purchase_list','goods_received']);

async function upsert(table, obj) {
  const row = { id: String(obj.id), data: obj };
  if (BRANCH_TABLES.has(table)) row.branch = obj.branch || null;
  const { error } = await supabase.from(table).upsert(row);
  if (error) throw error;
}

async function upsertMany(table, items, chunk = 50) {
  for (let i = 0; i < items.length; i += chunk) {
    const rows = items.slice(i, i + chunk).map(obj => {
      const row = { id: String(obj.id), data: obj };
      if (BRANCH_TABLES.has(table)) row.branch = obj.branch || null;
      return row;
    });
    const { error } = await supabase.from(table).upsert(rows);
    if (error) throw error;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('\n🚀 Bevick IMS — Database Setup\n');

// Step 1: Verify all tables exist
console.log('1. Checking tables…');
const TABLES = [
  'app_settings','app_users','inventory','sales','customers','expenses',
  'bookings','purchase_list','goods_received','suppliers',
  'recycle_bin','audit_log','pending_users','delete_requests','permissions',
];

let allOk = true;
for (const t of TABLES) {
  const exists = await tableExists(t);
  if (exists) ok(t);
  else { fail(t, 'Table not found — run supabase-schema.sql first!'); allOk = false; }
}

if (!allOk) {
  console.log('\n❌ Some tables are missing!');
  console.log('\n👉 Please run supabase-schema.sql in your Supabase Dashboard:');
  console.log('   1. Go to https://supabase.com/dashboard/project/vqhxqnhqylxskwpxdhun/sql/new');
  console.log('   2. Copy and paste the contents of supabase-schema.sql');
  console.log('   3. Click "Run"');
  console.log('   4. Then run: node setup-db.mjs again\n');
  process.exit(1);
}

// Step 2: Seed default data if tables are empty
console.log('\n2. Seeding default data…');

// Settings
try {
  await supabase.from('app_settings').upsert({ id: 'main', data: SETTINGS });
  ok('Settings');
} catch(e) { fail('Settings', e); }

// Users
try {
  if (await isEmpty('app_users')) {
    await Promise.all(DEMO_USERS.map(u => upsert('app_users', u)));
    ok(`Users (${DEMO_USERS.length} demo accounts seeded)`);
  } else {
    ok('Users (already have data, skipped)');
  }
} catch(e) { fail('Users', e); }

// Inventory
try {
  if (ALL_ITEMS.length && await isEmpty('inventory')) {
    await upsertMany('inventory', ALL_ITEMS);
    ok(`Inventory (${ALL_ITEMS.length} items seeded)`);
  } else if (!ALL_ITEMS.length) {
    ok('Inventory (skipped — could not read inventory.js)');
  } else {
    ok('Inventory (already have data, skipped)');
  }
} catch(e) { fail('Inventory', e); }

// Suppliers
try {
  if (await isEmpty('suppliers')) {
    await Promise.all(DEFAULT_SUPPLIERS.map(s => upsert('suppliers', s)));
    ok(`Suppliers (${DEFAULT_SUPPLIERS.length} seeded)`);
  } else {
    ok('Suppliers (already have data, skipped)');
  }
} catch(e) { fail('Suppliers', e); }

// Permissions
try {
  const { data } = await supabase.from('permissions').select('role').limit(1);
  if (!data || data.length === 0) {
    await Promise.all(
      Object.entries(DEFAULT_PERMISSIONS).map(([role, pages]) =>
        supabase.from('permissions').upsert({ role, pages })
      )
    );
    ok('Permissions (seeded)');
  } else {
    ok('Permissions (already have data, skipped)');
  }
} catch(e) { fail('Permissions', e); }

console.log('\n✅ Database setup complete!\n');
console.log('Login credentials:');
console.log('  Super Admin : admin@bevick.com  / admin123');
console.log('  Dubai       : dubai@bevick.com  / dubai123');
console.log('  Kubwa       : kubwa@bevick.com  / kubwa123');
console.log('\nStart the app:  npm run dev\n');
