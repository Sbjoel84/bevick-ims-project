import * as XLSX from 'xlsx';

export function exportPurchaseListExcel({ items, bizName, bizRC }) {
  const now = new Date();
  const dateStr = now.toLocaleString('en-NG');
  const fileDateStr = now.toISOString().slice(0, 10);

  const wb = XLSX.utils.book_new();

  // Build rows: metadata header, blank, column headers, data, blank, summary
  const metaRows = [
    [bizName || 'Bevick Packaging Machineries'],
    [bizRC || 'RC: 967373'],
    ['Purchase Requirements — Items from Active Bookings'],
    [`Generated: ${dateStr}`],
    [],
    ['S/N', 'Item Name', 'Unit', 'Total Booked', 'In Stock (KUB)', 'In Stock (DUB)', 'In Stock (Total)', 'Qty to Purchase', 'PO Status'],
  ];

  const dataRows = items.map((item, idx) => [
    idx + 1,
    item.name,
    item.unit || '',
    item.totalBooked,
    item.kubQty,
    item.dubQty,
    item.inStock,
    item.needed,
    item.hasPO ? 'PO Raised' : 'No PO Yet',
  ]);

  const totalUnits = items.reduce((s, i) => s + i.needed, 0);
  const summaryRows = [
    [],
    ['', 'Total Items', '', items.length],
    ['', 'Total Units to Purchase', '', '', '', '', '', totalUnits],
  ];

  const allRows = [...metaRows, ...dataRows, ...summaryRows];
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Column widths
  ws['!cols'] = [
    { wch: 6 },   // S/N
    { wch: 36 },  // Item Name
    { wch: 12 },  // Unit
    { wch: 14 },  // Total Booked
    { wch: 16 },  // In Stock KUB
    { wch: 16 },  // In Stock DUB
    { wch: 18 },  // In Stock Total
    { wch: 16 },  // Qty to Purchase
    { wch: 14 },  // PO Status
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Purchase List');
  XLSX.writeFile(wb, `Purchase-Requirements-${fileDateStr}.xlsx`);
}
