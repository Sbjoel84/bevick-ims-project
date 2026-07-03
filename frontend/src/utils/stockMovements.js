import { fmtDate } from '../context/AppContext';

const bl = v => v === 'DUB' ? 'Dubai Market' : v === 'KUB' ? 'Kubwa Office' : v || '—';

// Shared column set for any "Stock Movements" report/print — used by both the
// Reports page tab and the Inventory page's Stock Report modal so the two stay in sync.
export const stockMovementColumns = [
  { key: '_date',    label: 'Date',           format: v => fmtDate(v) },
  { key: 'itemName', label: 'Item',           format: v => v || '—' },
  { key: 'branch',   label: 'Branch',         format: bl },
  { key: 'type',     label: 'Type',           format: v => v === 'in' ? 'Stock In' : v === 'out' ? 'Stock Out' : 'Adjustment' },
  { key: 'before',   label: 'Before Qty',     align: 'tc', format: v => v == null ? '—' : v },
  { key: 'qty',      label: 'Change',         align: 'tc', format: v => `${v > 0 ? '+' : ''}${v}` },
  { key: 'after',    label: 'After Qty',      align: 'tc', format: v => v == null ? '—' : v },
  { key: 'reason',   label: 'Order / Reason', format: v => v || '—' },
  { key: 'user',     label: 'By',             format: v => v || '—' },
];

export function getStockMovementsSummary(rows) {
  const stockIn  = rows.filter(r => r.qty > 0).reduce((s, r) => s + r.qty, 0);
  const stockOut = rows.filter(r => r.qty < 0).reduce((s, r) => s - r.qty, 0);
  return [
    { label: 'Movements',       value: rows.length },
    { label: 'Total Stock In',  value: `+${stockIn}` },
    { label: 'Total Stock Out', value: `-${stockOut}` },
    { label: 'Net Change',      value: `${stockIn - stockOut > 0 ? '+' : ''}${stockIn - stockOut}`, bold: true },
  ];
}

// Movement rows need `_date` (alias of `date`) so ReportModal / Reports.jsx's
// generic dateKey filtering can pick it up like every other report tab.
export function getStockMovementsData(inventoryMovements) {
  return (inventoryMovements || []).map(m => ({ ...m, _date: m.date }));
}
