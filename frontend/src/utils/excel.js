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
    ['Purchase Requirements'],
    [`Generated: ${dateStr}`],
    [],
    ['S/N', 'ITEM NAME', 'QTY'],
  ];

  const dataRows = items.map((item, idx) => [
    idx + 1,
    item.name,
    item.needed,
  ]);

  const totalUnits = items.reduce((s, i) => s + i.needed, 0);
  const summaryRows = [
    [],
    ['', 'TOTAL', totalUnits],
  ];

  const allRows = [...metaRows, ...dataRows, ...summaryRows];
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Column widths
  ws['!cols'] = [
    { wch: 6 },   // S/N
    { wch: 40 },  // Item Name
    { wch: 10 },  // QTY
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Purchase List');
  XLSX.writeFile(wb, `Purchase-Requirements-${fileDateStr}.xlsx`);
}
