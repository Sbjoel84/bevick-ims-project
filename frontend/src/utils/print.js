// ── Helpers ─────────────────────────────────────────────────────────────────

const SYM   = { NGN: '₦', USD: '$', EUR: '€', GBP: '£', CNY: '¥' };
const RATES = { NGN: 1, USD: 0.00066, EUR: 0.00061, GBP: 0.00052, CNY: 0.0048 };

const CONTACT = '+234 703 925 4820';

function fmtAmt(amount, currency = 'NGN') {
  const sym  = SYM[currency]   || '₦';
  const rate = RATES[currency] || 1;
  return `${sym}${((amount || 0) * rate).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function esc(v) {
  if (v == null) return '—';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function logoUrl() {
  // Build absolute URL so the pop-up window (about:blank origin) can load the image
  return `${window.location.origin}/Bevick%20logo.jpeg`;
}

function openWindow(html) {
  const win = window.open('', '_blank', 'width=820,height=920,scrollbars=yes');
  if (!win) { alert('Please allow pop-ups to print.'); return; }
  win.document.write(html);
  win.document.close();
}

// ── Shared CSS ───────────────────────────────────────────────────────────────

const REPORT_CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size:13px; color:#111; background:#fff; }
.page { padding:28px 36px; }
.logo-wrap { text-align:center; margin-bottom:12px; }
.logo-wrap img { height:70px; width:auto; object-fit:contain; }
.header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2.5px solid #111; padding-bottom:14px; margin-bottom:20px; }
.biz-name { font-size:20px; font-weight:700; letter-spacing:0.5px; }
.biz-sub  { font-size:11px; color:#555; margin-top:3px; }
.doc-title { font-size:16px; font-weight:700; text-align:right; }
.doc-sub   { font-size:11px; color:#555; text-align:right; margin-top:3px; }
.record-count { font-size:12px; color:#6b7280; margin-bottom:8px; }
table { width:100%; border-collapse:collapse; margin:6px 0 18px; font-size:12px; }
th { background:#f3f4f6; padding:8px 10px; border:1px solid #d1d5db; font-size:10.5px; text-transform:uppercase; letter-spacing:0.4px; font-weight:600; }
td { padding:6.5px 10px; border:1px solid #e5e7eb; vertical-align:top; }
tr:nth-child(even) td { background:#f9fafb; }
.tr { text-align:right; }
.tc { text-align:center; }
.summary-wrap { display:flex; justify-content:flex-end; margin-top:4px; }
.summary-box { border:1px solid #d1d5db; border-radius:6px; padding:12px 18px; min-width:260px; }
.sum-row { display:flex; justify-content:space-between; gap:40px; padding:3px 0; font-size:13px; color:#374151; }
.sum-bold { font-weight:700; font-size:14px; border-top:1px solid #d1d5db; margin-top:7px; padding-top:7px; color:#111; }
.footer { margin-top:28px; padding-top:10px; border-top:1px solid #e5e7eb; font-size:10px; color:#9ca3af; display:flex; justify-content:space-between; }
@media print {
  @page { size:A4; margin:14mm 12mm; }
  body { font-size:12px; }
  .page { padding:0; }
  img { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
}
`;

// ── Print Receipt ─────────────────────────────────────────────────────────────

export function printReceipt(sale, state) {
  const { currency = 'NGN', bizName, bizRC, bizEmail, bizAddress } = state || {};
  const logo = logoUrl();

  const itemRows = (sale.items || []).map(item => `
    <tr>
      <td>${esc(item.name)}</td>
      <td style="text-align:center;">${esc(item.qty)} ${esc(item.unit)}</td>
      <td style="text-align:right;">${fmtAmt(item.price, currency)}</td>
      <td style="text-align:right;">${fmtAmt((item.price || 0) * (item.qty || 0), currency)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt · ${esc(sale.id)}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Courier New',Courier,monospace; font-size:13px; color:#111; background:#fff; }
.wrap { max-width:380px; margin:0 auto; padding:20px; }
.head { text-align:center; border-bottom:2px dashed #555; padding-bottom:14px; margin-bottom:14px; }
.logo  { height:64px; width:auto; object-fit:contain; margin-bottom:8px; }
.biz-name { font-size:17px; font-weight:bold; letter-spacing:1px; }
.biz-sub  { font-size:11px; color:#555; margin-top:2px; }
.rtitle   { text-align:center; font-size:12px; font-weight:bold; letter-spacing:3px; margin-bottom:10px; border-bottom:1px solid #aaa; padding-bottom:6px; }
.meta     { font-size:12px; margin-bottom:8px; }
.meta-row { display:flex; justify-content:space-between; padding:2px 0; border-bottom:1px dashed #eee; }
.lbl      { color:#555; }
table     { width:100%; border-collapse:collapse; font-size:12px; margin:12px 0; }
th        { border-bottom:1px solid #333; border-top:1px solid #333; padding:5px 4px; font-size:11px; }
td        { padding:5px 4px; border-bottom:1px dashed #ddd; }
th:nth-child(2),td:nth-child(2){ text-align:center; }
th:nth-child(3),td:nth-child(3),th:nth-child(4),td:nth-child(4){ text-align:right; }
.totals   { margin-top:6px; border-top:2px dashed #555; padding-top:8px; font-size:13px; }
.tot-row  { display:flex; justify-content:space-between; padding:2px 0; }
.grand    { font-weight:bold; font-size:15px; border-top:1px solid #333; margin-top:5px; padding-top:5px; }
.foot     { text-align:center; margin-top:16px; font-size:11px; color:#555; border-top:2px dashed #555; padding-top:12px; }
@media print {
  @page { margin:5mm; size:80mm auto; }
  img { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
}
</style></head><body>
<div class="wrap">
  <div class="head">
    <img class="logo" src="${logo}" alt="Bevick Logo"/>
    <div class="biz-name">${esc(bizName) || 'Bevick Packaging Machineries'}</div>
    <div class="biz-sub">${esc(bizRC) || 'RC: 967373'}</div>
    <div class="biz-sub">Tel: ${CONTACT}</div>
    ${bizAddress ? `<div class="biz-sub">${esc(bizAddress)}</div>` : ''}
    ${bizEmail   ? `<div class="biz-sub">${esc(bizEmail)}</div>` : ''}
  </div>
  <div class="rtitle">SALES RECEIPT</div>
  <div class="meta">
    <div class="meta-row"><span class="lbl">Receipt #</span><strong>${esc(sale.id)}</strong></div>
    <div class="meta-row"><span class="lbl">Date</span><span>${fmtDateTime(sale.date)}</span></div>
    <div class="meta-row"><span class="lbl">Customer</span><span>${esc(sale.customer) || 'Walk-in'}</span></div>
    <div class="meta-row"><span class="lbl">Payment</span><span>${esc(sale.payment) || 'Cash'}</span></div>
    <div class="meta-row"><span class="lbl">Branch</span><span>${sale.branch === 'DUB' ? 'Dubai Market' : 'Kubwa Office'}</span></div>
    ${sale.createdBy ? `<div class="meta-row"><span class="lbl">Served by</span><span>${esc(sale.createdBy)}</span></div>` : ''}
  </div>
  <table>
    <thead><tr><th style="text-align:left;">Item</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
    <tbody>${itemRows || '<tr><td colspan="4" style="text-align:center;">No items</td></tr>'}</tbody>
  </table>
  <div class="totals">
    <div class="tot-row"><span>Subtotal</span><span>${fmtAmt(sale.subtotal || 0, currency)}</span></div>
    ${(sale.vat || 0) > 0 ? `<div class="tot-row"><span>VAT</span><span>${fmtAmt(sale.vat, currency)}</span></div>` : ''}
    <div class="tot-row grand"><span>TOTAL</span><span>${fmtAmt(sale.total || 0, currency)}</span></div>
  </div>
  ${sale.note ? `<p style="font-size:11px;color:#555;margin-top:8px;">Note: ${esc(sale.note)}</p>` : ''}
  <div class="foot">
    <p>** Thank you for your business! **</p>
    <p style="margin-top:8px;font-size:10px;">${fmtDateTime(new Date().toISOString())}</p>
  </div>
</div>
<script>window.onload=function(){ window.print(); window.onafterprint=function(){ window.close(); }; }</script>
</body></html>`;

  openWindow(html);
}

// ── Print Report ──────────────────────────────────────────────────────────────

export function printReport({ title, subtitle, columns, rows, summaryRows, dateRange, state }) {
  const { bizName, bizRC, bizEmail } = state || {};
  const logo = logoUrl();
  const now = new Date().toLocaleString('en-NG');

  const thead = columns.map(c =>
    `<th style="${c.align === 'tr' ? 'text-align:right;' : c.align === 'tc' ? 'text-align:center;' : ''}">${esc(c.label)}</th>`
  ).join('');

  const tbody = rows.length === 0
    ? `<tr><td colspan="${columns.length}" style="text-align:center;padding:20px;color:#999;">No records found</td></tr>`
    : rows.map(row => {
        const cells = columns.map(c => {
          const raw = row[c.key];
          const val = c.format ? esc(c.format(raw, row)) : esc(raw ?? '');
          const align = c.align === 'tr' ? 'text-align:right;' : c.align === 'tc' ? 'text-align:center;' : '';
          return `<td style="${align}">${val}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      }).join('');

  const summaryHtml = summaryRows?.map(s =>
    `<div class="sum-row${s.bold ? ' sum-bold' : ''}"><span>${esc(s.label)}</span><span>${esc(s.value)}</span></div>`
  ).join('') || '';

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${REPORT_CSS}</style>
</head><body>
<div class="page">
  <div class="logo-wrap">
    <img src="${logo}" alt="Bevick Logo"/>
  </div>
  <div class="header">
    <div>
      <div class="biz-name">${esc(bizName) || 'Bevick Packaging Machineries'}</div>
      <div class="biz-sub">${esc(bizRC) || 'RC: 967373'}</div>
      <div class="biz-sub">Tel: ${CONTACT}</div>
      ${bizEmail ? `<div class="biz-sub">${esc(bizEmail)}</div>` : ''}
    </div>
    <div>
      <div class="doc-title">${esc(title)}</div>
      ${subtitle   ? `<div class="doc-sub">${esc(subtitle)}</div>` : ''}
      ${dateRange  ? `<div class="doc-sub">Period: ${esc(dateRange)}</div>` : ''}
      <div class="doc-sub">Generated: ${now}</div>
    </div>
  </div>
  <p class="record-count">${rows.length} record(s)</p>
  <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
  ${summaryHtml ? `<div class="summary-wrap"><div class="summary-box">${summaryHtml}</div></div>` : ''}
  <div class="footer">
    <span>${esc(bizName) || 'Bevick IMS'} · Confidential</span>
    <span>Printed: ${now}</span>
  </div>
</div>
<script>window.onload=function(){ window.print(); window.onafterprint=function(){ window.close(); }; }</script>
</body></html>`;

  openWindow(html);
}
