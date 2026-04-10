export const DEMO_USERS = [
  {
    id: 'U1',
    em: 'admin@bevick.com',
    pw: 'admin123',
    name: 'K White',
    role: 'super_admin',
    bid: null,
    initials: 'KW',
    phone: '+234 801 000 0001',
    status: 'active',
  },
  {
    id: 'U2',
    em: 'dubai@bevick.com',
    pw: 'dubai123',
    name: 'A Musa',
    role: 'inventory',
    bid: 'DUB',
    initials: 'AM',
    phone: '+234 802 000 0002',
    status: 'active',
  },
  {
    id: 'U3',
    em: 'kubwa@bevick.com',
    pw: 'kubwa123',
    name: 'B Okafor',
    role: 'sales',
    bid: 'KUB',
    initials: 'BO',
    phone: '+234 803 000 0003',
    status: 'active',
  },
];

export const ROLES = [
  { id: 'super_admin', label: 'Super Admin' },
  { id: 'inventory',   label: 'Inventory Manager' },
  { id: 'sales',       label: 'Sales Officer' },
];

export const ALL_PAGES = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'sales',      label: 'Sales' },
  { id: 'customers',  label: 'Customers' },
  { id: 'expenses',   label: 'Expenses' },
  { id: 'inventory',  label: 'Inventory' },
  { id: 'booked',     label: 'Booked Items' },
  { id: 'purchase',   label: 'Purchase List' },
  { id: 'goods',      label: 'Goods Received' },
  { id: 'suppliers',  label: 'Suppliers' },
  { id: 'recycle',    label: 'Recycle Bin' },
  { id: 'settings',   label: 'Settings' },
];

// Default page permissions per role
export const DEFAULT_PERMISSIONS = {
  super_admin: ['dashboard','sales','customers','expenses','inventory','booked','purchase','goods','suppliers','recycle','settings','admin'],
  inventory:   ['dashboard','inventory','booked','purchase','goods','suppliers','settings'],
  sales:       ['dashboard','sales','customers','expenses','booked','settings'],
};
