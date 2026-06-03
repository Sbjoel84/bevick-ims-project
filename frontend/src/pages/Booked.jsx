import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp, formatCurrency, fmtDate, fmtDateTime, genId, dedupeInventory } from '../context/AppContext';
import { refreshBookings, refreshInventory, refreshPurchaseList } from '../lib/refresh';
import ReportModal from '../components/ReportModal';
import DeleteRequestModal from '../components/DeleteRequestModal';

const STATUSES = ['pending', 'confirmed', 'delivered', 'cancelled'];

const STATUS_COLORS = {
  pending:   'bg-amber-950 text-amber-400',
  confirmed: 'bg-blue-950 text-blue-400',
  delivered: 'bg-green-950 text-green-400',
  cancelled: 'bg-gray-800 text-gray-500',
};

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'POS', 'Cheque', 'Credit'];

// Full Factory template items (China/Lagos order)
const FULL_FACTORY_TEMPLATE = [
  // CHINA/LAGOS ITEMS
  { name: 'Dingli Sachet Machine', qty: 4, unit: 'Unit' },
  { name: 'Steam Labeler/ Air Conveyor', qty: 5, unit: 'Unit' },
  { name: 'Fully Automated Labeller', qty: 2, unit: 'Unit' },
  { name: 'Cap Loader', qty: 4, unit: 'Unit' },
  { name: '8-S-3 Monoblock Machine', qty: 5, unit: 'Unit' },
  { name: '2 HP Air Compressor', qty: 3, unit: 'Unit' },
  { name: 'Pet Blowing Machine', qty: 3, unit: 'Unit' },
  { name: 'Semi Automated Shrink Wrapping Machine', qty: 6, unit: 'Unit' },
  { name: 'Decapper and Washer', qty: 2, unit: 'Unit' },
  { name: 'Dispenser Machine', qty: 1, unit: 'Unit' },
  { name: 'Table Date Coding Machine', qty: 2, unit: 'Unit' },
  { name: 'Ink Jet Date Coding Machine (BIG)', qty: 1, unit: 'Unit' },
  { name: 'Ink Jet Date Coding Machine (SMALL)', qty: 2, unit: 'Unit' },
  { name: '3Ton Foreign Treatment Plant', qty: 5, unit: 'Unit' },
  { name: '1665 Fibre Glass', qty: 2, unit: 'Unit' },
  { name: 'Panamar Membrane', qty: 40, unit: 'Unit' },
  { name: '6Grams Stainless Ozone Generator', qty: 4, unit: 'Unit' },
  { name: 'Cation Resin', qty: 4, unit: 'Unit' },
  { name: 'Anion Resin', qty: 3, unit: 'Unit' },
  { name: 'Sand', qty: 45, unit: 'Kg' },
  { name: 'Activated Carbon (France)', qty: 5, unit: 'Unit' },
  { name: 'Activated Carbon (USA)', qty: 6, unit: 'Unit' },
  { name: 'Local Carbon (Malaysia)', qty: 5, unit: 'Unit' },
  { name: '2HP Vertical Pump', qty: 1, unit: 'Unit' },
  { name: '1Hp Stainless Pump', qty: 4, unit: 'Unit' },
  { name: '2Hp Stainless Pump', qty: 8, unit: 'Unit' },
  { name: '20"Complete Filter Cartridge', qty: 44, unit: 'Unit' },
  { name: 'Jumbo Normal/Threaded Filter Candle', qty: 7, unit: 'Unit' },
  { name: 'Jumbo Carbon Filter Candle', qty: 1, unit: 'Unit' },
  { name: 'Jumbo Filter Housing', qty: 6, unit: 'Unit' },
  { name: 'Single Tube UV Water Sterilizer', qty: 4, unit: 'Unit' },
  { name: 'Single Tube UV Water Sterilizer with Base', qty: 2, unit: 'Unit' },
  { name: 'Double Tube UV Water Sterilizer', qty: 5, unit: 'Unit' },
  { name: 'Heat Gun', qty: 1, unit: 'Unit' },
  { name: '1HP Water Chiller', qty: 4, unit: 'Unit' },
  { name: 'Bottle Mould', qty: 17, unit: 'Unit' },
  { name: '3 Cavity Pet Blowing Mould 50cl and 75cl', qty: 3, unit: 'Unit' },
  { name: '20"Complete Air Sterilizer', qty: 8, unit: 'Unit' },
  { name: 'TDS Test Kits', qty: 2, unit: 'Unit' },
  { name: 'Chlorine Test Kits', qty: 2, unit: 'Unit' },
  { name: 'PH Test Kit', qty: 2, unit: 'Unit' },
  { name: 'Electric Insect Killer', qty: 4, unit: 'Unit' },
  { name: 'Digital Weighing Scale', qty: 2, unit: 'Unit' },
  { name: 'Dough Spiral Mixer', qty: 1, unit: 'Unit' },
  { name: 'Deck Oven 16 Trays (Electric)', qty: 1, unit: 'Unit' },
  { name: 'Deck Oven 9 Trays (Gas)', qty: 1, unit: 'Unit' },
  { name: 'Cooling Rack 5ft', qty: 2, unit: 'Unit' },
  { name: 'Bread Slicer', qty: 1, unit: 'Unit' },
  { name: 'Dough Moulder', qty: 1, unit: 'Unit' },
  { name: 'Rotary Oven 1 Bag', qty: 1, unit: 'Unit' },
  { name: 'Extractor Fan', qty: 3, unit: 'Unit' },
  // CONSUMABLES / SAFETY / PACKAGING
  { name: 'Dispenser Cap', qty: 1, unit: 'Unit' },
  { name: 'First Aid Box', qty: 3, unit: 'Unit' },
  { name: 'Fire Extinguisher', qty: 3, unit: 'Unit' },
  { name: 'Lab Coat', qty: 15, unit: 'Pcs' },
  { name: 'Nose Mask/Hand gloves', qty: 4, unit: 'Set' },
  { name: 'Hair Net', qty: 2, unit: 'Pcs' },
  { name: 'Plastic Bowl', qty: 6, unit: 'Unit' },
  { name: 'Shrink Wrapping Film(in kg)', qty: 50, unit: 'Kg' },
  { name: 'Sachet Water Packaging Bag', qty: 2, unit: 'Unit' },
  { name: 'Dispenser Packaging Bag', qty: 1, unit: 'Unit' },
  { name: 'Footwears', qty: 20, unit: 'Pcs' },
  { name: 'Preform', qty: 2, unit: 'Unit' },
  { name: 'Bottle Caps', qty: 2, unit: 'Unit' },
  { name: 'Plastic Dustbin', qty: 6, unit: 'Unit' },
  { name: 'Plastic Stereo Design', qty: 2, unit: 'Unit' },
  { name: 'Sachet Nylon', qty: 1, unit: 'Unit' },
  { name: 'Sticker and Design/Printing', qty: 3, unit: 'Unit' },
  { name: 'M.block Holding/Receiving Table', qty: 9, unit: 'Unit' },
  { name: 'Tamper Proof', qty: 1, unit: 'Unit' },
  { name: 'Plastic Pallet', qty: 30, unit: 'Unit' },
  // MEMBRANE R.O
  { name: '10Membrane R.O', qty: 4, unit: 'Unit' },
];

function blankRow() {
  return { _rowId: Date.now() + Math.random(), id: null, name: '', qty: 1, unit: '', price: '' };
}

function calcItemsTotal(items) {
  return items.filter(i => i.id || i.name?.trim()).reduce((s, i) => s + (i.qty || 1) * (parseFloat(i.price) || 0), 0);
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className={`bg-gray-900 border border-gray-800 rounded-2xl w-full max-h-[90vh] overflow-y-auto ${wide ? 'max-w-2xl' : 'max-w-xl'}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="font-syne font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ItemRow({ item, availableItems, onChange, onRemove, currency }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(item.name || '');

  const filtered = availableItems.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase())
  );

  function select(inv) {
    setSearch(inv.name);
    setOpen(false);
    onChange({ ...item, id: inv.id, name: inv.name, unit: inv.unit });
  }

  const lineNet = (item.qty || 1) * (parseFloat(item.price) || 0);

  return (
    <div className="py-2 border-b border-gray-700 last:border-0">
      {/* Row 1: item search, qty, unit, remove */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search item…"
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true); onChange({ ...item, id: null, name: e.target.value }); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {open && filtered.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl mt-1 z-20 max-h-52 overflow-y-auto shadow-xl">
              {filtered.map(i => (
                <button
                  key={i.id}
                  type="button"
                  onMouseDown={() => select(i)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-700 text-left gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs truncate">{i.name}</p>
                    <p className="text-gray-500 text-xs">{i.category} · {i.branch === 'DUB' ? 'Dubai' : 'Kubwa'}</p>
                  </div>
                  <span className="text-gray-400 text-xs shrink-0">{i.qty} {i.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="number"
          min={1}
          value={item.qty}
          onChange={e => onChange({ ...item, qty: parseInt(e.target.value) || 1 })}
          className="w-14 text-center bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none"
        />
        <span className="text-gray-500 text-xs w-8 shrink-0">{item.unit || '—'}</span>
        <button type="button" onClick={onRemove} className="text-gray-600 hover:text-red-400 shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      {/* Row 2: price, line total */}
      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-xs">Price</span>
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="0.00"
            value={item.price}
            onChange={e => onChange({ ...item, price: e.target.value })}
            className="w-24 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {parseFloat(item.price) > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-gray-500 text-xs">Line</span>
            <span className="text-blue-400 text-xs font-mono font-semibold">{formatCurrency(lineNet, currency)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BookingFormFields({ f, setF, availableItems, currency }) {
  const total = calcItemsTotal(f.items);

  function addRow() { setF(x => ({ ...x, items: [...x.items, blankRow()] })); }
  function updateRow(rowId, updated) { setF(x => ({ ...x, items: x.items.map(i => i._rowId === rowId ? updated : i) })); }
  function removeRow(rowId) { setF(x => ({ ...x, items: x.items.filter(i => i._rowId !== rowId) })); }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="text-gray-400 text-xs font-medium block mb-1.5">Customer <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={f.customer}
            onChange={e => setF(x => ({ ...x, customer: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="col-span-2">
          <label className="text-gray-400 text-xs font-medium block mb-1.5">Booking Type</label>
          <select
            value={f.type || 'others'}
            onChange={e => setF(x => ({ ...x, type: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="full_factory">Full Factory</option>
            <option value="others">Others (Selected Items)</option>
          </select>
        </div>
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-1.5">Booking Date</label>
          <input
            type="date"
            value={f.bookingDate}
            onChange={e => setF(x => ({ ...x, bookingDate: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-gray-400 text-xs font-medium block mb-1.5">Delivery Date</label>
          <input
            type="date"
            value={f.deliveryDate}
            onChange={e => setF(x => ({ ...x, deliveryDate: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-gray-400 text-xs font-medium">Items <span className="text-red-400">*</span></label>
          <button type="button" onClick={addRow} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            Add Item
          </button>
        </div>
        {f.items.length === 0 ? (
          <button type="button" onClick={addRow} className="w-full border-2 border-dashed border-gray-700 hover:border-blue-600 rounded-xl py-6 text-gray-500 hover:text-blue-400 text-sm transition-colors flex flex-col items-center gap-1.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            Click to add items
          </button>
        ) : (
          <div className="bg-gray-800 rounded-xl px-4">
            <div className="flex items-center gap-2 py-2 border-b border-gray-700">
              <span className="flex-1 text-gray-500 text-xs">Item</span>
              <span className="w-14 text-center text-gray-500 text-xs">Qty</span>
              <span className="w-8 text-gray-500 text-xs">Unit</span>
              <span className="w-3.5" />
            </div>
            {f.items.map(item => (
              <ItemRow
                key={item._rowId}
                item={item}
                availableItems={availableItems}
                onChange={updated => updateRow(item._rowId, updated)}
                onRemove={() => removeRow(item._rowId)}
                currency={currency}
              />
            ))}
            <div className="flex justify-between py-2.5 text-xs border-t border-gray-700 mt-1">
              <span className="text-gray-400">Estimated Total</span>
              <span className="text-blue-400 font-mono">{formatCurrency(total, currency)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Booking-level discount */}
      <div>
        <label className="text-gray-400 text-xs font-medium block mb-1.5">Booking Discount <span className="text-gray-600 normal-case">(optional flat amount)</span></label>
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="0.00"
          value={f.discount}
          onChange={e => setF(x => ({ ...x, discount: e.target.value }))}
          className="w-full bg-gray-800 border border-red-900/40 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500"
        />
        {parseFloat(f.discount) > 0 && total > 0 && (
          <p className="text-red-400 text-xs mt-1.5">
            Effective total: {formatCurrency(Math.max(0, total - (parseFloat(f.discount) || 0)), currency)}
          </p>
        )}
      </div>

      <div>
        <label className="text-gray-400 text-xs font-medium block mb-1.5">Note</label>
        <textarea
          value={f.note}
          onChange={e => setF(x => ({ ...x, note: e.target.value }))}
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
    </div>
  );
}

const EMPTY_FORM = { customer: '', branch: 'DUB', bookingDate: new Date().toISOString().split('T')[0], deliveryDate: '', note: '', items: [], discount: '', initialPayment: '', paymentMethod: 'Cash', type: 'others' };
const EMPTY_PAY  = { amount: '', method: 'Cash', date: new Date().toISOString().split('T')[0], note: '' };

export default function Booked() {
  const { state, dispatch } = useApp();
  const { bookings, inventory, currency, branch, bname, user } = state;

  useEffect(() => {
    refreshBookings(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'bookings', data } }));
    refreshInventory(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'inventory', data } }));
    refreshPurchaseList(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'purchaseList', data } }));
  }, []);

  const [modal, setModal] = useState(null); // 'new' | 'edit' | 'view'
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState({ ...EMPTY_FORM, branch: branch || 'DUB' });
  const [editForm, setEditForm] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportStatusPicker, setReportStatusPicker] = useState(false);
  const [reportStatusFilter, setReportStatusFilter] = useState('all');
  const [deleteReq, setDeleteReq] = useState(null);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState(EMPTY_PAY);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [editPayForm, setEditPayForm] = useState({ amount: '', date: '', method: 'Cash', note: '' });
  const [ffImportOpen, setFfImportOpen] = useState(false);
  const [ffCustomer, setFfCustomer] = useState('');
  const [ffDate, setFfDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState('bookings');
  const [matrixSearch, setMatrixSearch] = useState('');
  const matrixTableRef = useRef(null);
  const matrixRulerRef = useRef(null);
  const syncingRef     = useRef(false);
  const onTableScroll  = useCallback(() => {
    if (syncingRef.current || !matrixRulerRef.current || !matrixTableRef.current) return;
    syncingRef.current = true;
    matrixRulerRef.current.scrollLeft = matrixTableRef.current.scrollLeft;
    syncingRef.current = false;
  }, []);
  const onRulerScroll  = useCallback(() => {
    if (syncingRef.current || !matrixTableRef.current || !matrixRulerRef.current) return;
    syncingRef.current = true;
    matrixTableRef.current.scrollLeft = matrixRulerRef.current.scrollLeft;
    syncingRef.current = false;
  }, []);

  // Always derive live booking so payment additions reflect instantly in the view modal
  const currentSelected = selected
    ? (bookings.find(b => b.id === selected.id) || selected)
    : null;

  const bookingColumns = [
    { key: 'customer', label: 'Customer' },
    { key: 'id',       label: 'Booking ID' },
    { key: 'date',     label: 'Booked', format: v => fmtDate(v) },
    { key: 'items',    label: 'Items', tdStyle: 'white-space:pre-line;', format: v => (v || []).map(i => `${i.name}  ×${i.qty}${i.unit ? ' ' + i.unit : ''}`).filter(Boolean).join('\n') || '—' },
    { key: 'status',   label: 'Status' },
    { key: 'total',    label: 'Total',   align: 'tr', format: v => formatCurrency(v || 0, currency) },
    { key: 'amountPaid', label: 'Paid',  align: 'tr', format: v => formatCurrency(v || 0, currency) },
  ];

  function getBookingSummary(data) {
    const total   = data.reduce((s, b) => s + Math.max(0, (b.total || 0) - (b.discount || 0)), 0);
    const paid    = data.reduce((s, b) => s + (b.amountPaid || 0), 0);
    const balance = total - paid;
    const byStatus = STATUSES.map(st => ({
      label: st.charAt(0).toUpperCase() + st.slice(1),
      value: data.filter(b => b.status === st).length,
    }));
    return [
      ...byStatus,
      { label: 'Total Booking Value', value: formatCurrency(total, currency), bold: true },
      { label: 'Total Amount Paid',   value: formatCurrency(paid, currency) },
      { label: 'Total Balance Due',   value: formatCurrency(balance, currency) },
    ];
  }

  const filtered = bookings
    .filter(b => filterStatus === 'all' || b.status === filterStatus)
    .filter(b => {
      const q = search.toLowerCase();
      return !q || b.customer?.toLowerCase().includes(q) || b.id?.toLowerCase().includes(q);
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  function buildMatrix(type) {
    const isFF = type === 'full_factory';
    const typeBookings = bookings.filter(b =>
      b.status !== 'cancelled' &&
      ((isFF ? (b.bookingType || b.type) === 'full_factory' : (b.bookingType || b.type) !== 'full_factory'))
    );
    const customerOrder = [];
    const customerSet = new Set();
    typeBookings.forEach(b => {
      if (b.customer && !customerSet.has(b.customer)) {
        customerSet.add(b.customer);
        customerOrder.push(b.customer);
      }
    });
    const itemMap = new Map();
    typeBookings.forEach(b => {
      (b.items || []).forEach(item => {
        if (!item.name?.trim()) return;
        const key = item.name.trim();
        if (!itemMap.has(key)) itemMap.set(key, new Map());
        const entry = itemMap.get(key);
        entry.set(b.customer, (entry.get(b.customer) || 0) + (item.qty || 1));
      });
    });
    const rows = [...itemMap.entries()].map(([name, cMap]) => ({
      name,
      qtys: customerOrder.map(c => cMap.get(c) || 0),
      total: [...cMap.values()].reduce((s, q) => s + q, 0),
    }));
    return { customers: customerOrder, rows };
  }

  const ffMatrix  = useMemo(() => buildMatrix('full_factory'), [bookings]);
  const othMatrix = useMemo(() => buildMatrix('others'),       [bookings]);

  function submitNew() {
    const validItems = form.items.filter(i => i.id || i.name?.trim()).map(({ _rowId, ...rest }) => ({
      ...rest,
      price: parseFloat(rest.price) || 0,
    }));
    if (!form.customer.trim() || validItems.length === 0) return;

    const total    = validItems.reduce((s, i) => s + (i.qty || 1) * (parseFloat(i.price) || 0), 0);
    const discount = parseFloat(form.discount) || 0;
    const effectiveTotal = Math.max(0, total - discount);

    // Process initial payment if provided
    const payments = [];
    const initAmt = parseFloat(form.initialPayment);
    if (initAmt > 0) {
      payments.push({
        id: genId('PMT'),
        amount: initAmt,
        method: form.paymentMethod || 'Cash',
        date: new Date().toISOString(),
        note: 'Initial payment',
      });
    }
    const amountPaid = payments.reduce((s, p) => s + p.amount, 0);

    dispatch({
      type: 'ADD_BOOKING',
      payload: {
        id: genId('B'),
        customer: form.customer,
        branch: branch || form.branch,
        bookingType: form.type || 'others',
        type: form.type || 'others',
        deliveryDate: form.deliveryDate,
        note: form.note,
        items: validItems,
        total,
        discount,
        payments,
        amountPaid,
        status: 'pending',
        date: form.bookingDate ? new Date(form.bookingDate + 'T12:00:00').toISOString() : new Date().toISOString(),
        createdBy: user?.name,
      },
    });
    setModal(null);
    setForm({ ...EMPTY_FORM, branch: branch || 'DUB' });
  }

  function openEdit(b) {
    setEditForm({
      ...b,
      type: b.bookingType || b.type || 'others',
      bookingDate: b.date ? b.date.split('T')[0] : new Date().toISOString().split('T')[0],
      discount: b.discount != null ? String(b.discount) : '',
      items: b.items.map(i => ({ ...i, _rowId: i.id + '-' + Math.random() })),
    });
    setModal('edit');
  }

  function submitEdit() {
    const { bookingDate, ...editFormData } = editForm;
    const validItems = editFormData.items.filter(i => i.id || i.name?.trim()).map(({ _rowId, ...rest }) => ({
      ...rest,
      price: parseFloat(rest.price) || 0,
    }));
    if (!editFormData.customer.trim() || validItems.length === 0) return;
    const bookingType = editFormData.type || editFormData.bookingType || 'others';
    dispatch({
      type: 'UPDATE_BOOKING',
      payload: {
        ...editFormData,
        bookingType,
        type: bookingType,
        date: bookingDate ? new Date(bookingDate + 'T12:00:00').toISOString() : (editFormData.date || new Date().toISOString()),
        items: validItems,
        total: validItems.reduce((s, i) => s + (i.qty || 1) * (parseFloat(i.price) || 0), 0),
        discount: parseFloat(editFormData.discount) || 0,
      },
    });
    setModal(null);
    setEditForm(null);
  }

  function updateStatus(id, status) {
    dispatch({ type: 'UPDATE_BOOKING_STATUS', payload: { id, status } });
  }

  function addPayment(bookingId) {
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) return;
    dispatch({
      type: 'ADD_BOOKING_PAYMENT',
      payload: {
        bookingId,
        payment: {
          id: genId('PMT'),
          amount,
          method: payForm.method,
          date: payForm.date || new Date().toISOString().split('T')[0],
          note: payForm.note,
        },
      },
    });
    setPayForm(EMPTY_PAY);
    setShowPayForm(false);
  }

  function updatePayment(bookingId, paymentId, updated) {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;
    const updatedPayments = (booking.payments || []).map(p =>
      p.id === paymentId ? { ...p, ...updated, amount: parseFloat(updated.amount) || p.amount } : p
    );
    const amountPaid = updatedPayments.reduce((s, p) => s + (p.amount || 0), 0);
    dispatch({ type: 'UPDATE_BOOKING', payload: { ...booking, payments: updatedPayments, amountPaid } });
    setEditingPaymentId(null);
  }

  function del(id) {
    if (['main_super_admin', 'super_admin', 'admin'].includes(user?.role)) {
      if (window.confirm('Delete this booking?')) {
        dispatch({ type: 'DELETE_BOOKING', payload: id });
        if (modal) setModal(null);
      }
    } else {
      const b = bookings.find(x => x.id === id);
      setDeleteReq({ type: 'booking', targetId: id, label: `Booking #${id}${b?.customer ? ` — ${b.customer}` : ''}` });
    }
  }

  function submitFFImport() {
    if (!ffCustomer.trim()) return;
    const items = FULL_FACTORY_TEMPLATE.map(t => ({
      id: null,
      name: t.name,
      qty: t.qty,
      unit: t.unit,
      price: 0,
    }));
    dispatch({
      type: 'ADD_BOOKING',
      payload: {
        id: genId('B'),
        customer: ffCustomer.trim(),
        branch: branch || 'DUB',
        bookingType: 'full_factory',
        type: 'full_factory',
        deliveryDate: '',
        note: 'Imported from China/Lagos Full Factory order sheet',
        items,
        total: 0,
        discount: 0,
        payments: [],
        amountPaid: 0,
        status: 'pending',
        date: ffDate ? new Date(ffDate + 'T12:00:00').toISOString() : new Date().toISOString(),
        createdBy: user?.name,
      },
    });
    setFfImportOpen(false);
    setFfCustomer('');
    setFfDate(new Date().toISOString().split('T')[0]);
  }

  return (
    <div className="p-6 space-y-6" onClick={() => reportStatusPicker && setReportStatusPicker(false)}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Booked Items</h1>
          <p className="text-gray-500 text-sm mt-0.5">{bname}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setReportStatusPicker(p => !p)}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
              Print
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
            </button>
            {reportStatusPicker && (
              <div className="absolute right-0 top-full mt-2 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-20 p-3 w-52">
                <p className="text-gray-500 text-xs font-medium mb-2">Print which bookings?</p>
                {['all', ...STATUSES].map(s => (
                  <button
                    key={s}
                    onClick={() => { setReportStatusFilter(s); setReportStatusPicker(false); setReportOpen(true); }}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm capitalize transition-colors mb-0.5 ${reportStatusFilter === s ? 'bg-blue-500/20 text-blue-400' : 'text-gray-300 hover:bg-gray-800'}`}
                  >
                    {s === 'all' ? 'All Bookings' : `${s.charAt(0).toUpperCase() + s.slice(1)} only`}
                  </button>
                ))}
              </div>
            )}
          </div>
          {['main_super_admin', 'super_admin', 'admin'].includes(user?.role) && (
            <button
              onClick={() => setFfImportOpen(true)}
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
              title="Import Full Factory booking from China/Lagos order sheet"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              Import Full Factory
            </button>
          )}
          <button
            onClick={() => { setForm({ ...EMPTY_FORM, branch: branch || 'DUB' }); setModal('new'); }}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            New Booking
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {(() => {
        const activeBookings = bookings.filter(b => b.status !== 'cancelled');
        const ffBookings  = activeBookings.filter(b => (b.bookingType || b.type) === 'full_factory');
        const othBookings = activeBookings.filter(b => (b.bookingType || b.type) !== 'full_factory');

        const ffValue      = ffBookings.reduce((s, b)  => s + Math.max(0, (b.total || 0) - (b.discount || 0)), 0);
        const othValue     = othBookings.reduce((s, b) => s + Math.max(0, (b.total || 0) - (b.discount || 0)), 0);
        const ffCustomers  = new Set(ffBookings.map(b => b.customer?.trim().toLowerCase()).filter(Boolean)).size;
        const othCustomers = new Set(othBookings.map(b => b.customer?.trim().toLowerCase()).filter(Boolean)).size;

        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-gray-900 border border-blue-500/30 rounded-2xl px-4 py-4">
              <p className="text-gray-500 text-xs font-medium mb-1">Total Bookings</p>
              <p className="font-syne font-bold text-blue-400 text-2xl">{activeBookings.length}</p>
              <p className="text-gray-600 text-xs mt-1">FF {ffBookings.length} · Others {othBookings.length}</p>
            </div>
            <div className="bg-gray-900 border border-amber-500/20 rounded-2xl px-4 py-4">
              <p className="text-gray-500 text-xs font-medium mb-1">Full Factory Value</p>
              <p className="font-syne font-bold text-amber-300 text-sm sm:text-base break-all">{formatCurrency(ffValue, currency)}</p>
              <p className="text-gray-600 text-xs mt-1">excl. cancelled</p>
            </div>
            <div className="bg-gray-900 border border-red-500/20 rounded-2xl px-4 py-4">
              <p className="text-gray-500 text-xs font-medium mb-1">Others Value</p>
              <p className="font-syne font-bold text-red-400 text-sm sm:text-base break-all">{formatCurrency(othValue, currency)}</p>
              <p className="text-gray-600 text-xs mt-1">excl. cancelled</p>
            </div>
            <div className="bg-gray-900 border border-amber-500/30 rounded-2xl px-4 py-4">
              <p className="text-gray-500 text-xs font-medium mb-1">Full Factory Customers</p>
              <p className="font-syne font-bold text-amber-300 text-2xl">{ffCustomers}</p>
              <p className="text-gray-600 text-xs mt-1">unique customer{ffCustomers !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-gray-900 border border-red-500/30 rounded-2xl px-4 py-4 col-span-2 sm:col-span-1">
              <p className="text-gray-500 text-xs font-medium mb-1">Others Customers</p>
              <p className="font-syne font-bold text-red-400 text-2xl">{othCustomers}</p>
              <p className="text-gray-600 text-xs mt-1">unique customer{othCustomers !== 1 ? 's' : ''}</p>
            </div>
          </div>
        );
      })()}

      {/* Tab Nav */}
      <div className="overflow-x-auto pb-1 -mb-1">
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-2xl p-1 w-fit min-w-max">
        <button
          onClick={() => { setActiveTab('bookings'); setMatrixSearch(''); }}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'bookings' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          All Bookings
          <span className={`text-xs font-bold rounded-full px-1.5 py-0.5 ${activeTab === 'bookings' ? 'bg-white/20 text-white' : 'bg-gray-800 text-gray-400'}`}>{filtered.length}</span>
        </button>
        <button
          onClick={() => { setActiveTab('full_factory'); setMatrixSearch(''); }}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'full_factory' ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'}`}
        >
          Full Factory
          <span className={`text-xs font-bold rounded-full px-1.5 py-0.5 ${activeTab === 'full_factory' ? 'bg-black/20 text-black' : 'bg-amber-500/20 text-amber-400'}`}>{ffMatrix.customers.length}</span>
        </button>
        <button
          onClick={() => { setActiveTab('others'); setMatrixSearch(''); }}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'others' ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          Others
          <span className={`text-xs font-bold rounded-full px-1.5 py-0.5 ${activeTab === 'others' ? 'bg-white/20 text-white' : 'bg-red-500/20 text-red-400'}`}>{othMatrix.customers.length}</span>
        </button>
      </div>
      </div>

      {/* Filters */}
      {activeTab === 'bookings' && <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search bookings…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
        />
        <div className="flex flex-wrap gap-2">
          {['all', ...STATUSES].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-2 rounded-xl text-xs font-medium capitalize transition-colors ${filterStatus === s ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>}

      {activeTab === 'bookings' && <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 font-medium px-5 py-3">Customer</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Booking ID</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Date</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Items</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Type</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Status</th>
                <th className="text-right text-gray-500 font-medium px-5 py-3">Total</th>
                <th className="text-right text-gray-500 font-medium px-5 py-3">Paid</th>
                <th className="text-right text-gray-500 font-medium px-5 py-3">Balance</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center text-gray-600 py-12">No bookings found</td></tr>
              ) : filtered.map(b => {
                const bPaid    = b.amountPaid || 0;
                const bBalance = Math.max(0, (b.total || 0) - (b.discount || 0)) - bPaid;
                const canDeliver = b.status !== 'delivered' && b.status !== 'cancelled';
                return (
                  <tr key={b.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-3.5 text-white font-medium">{b.customer}</td>
                    <td className="px-5 py-3.5 font-mono text-gray-400 text-xs">{b.id}</td>
                    <td className="px-5 py-3.5 text-gray-400">{fmtDate(b.date)}</td>
                    <td className="px-5 py-3.5">
                      <div className="space-y-1">
                        {(b.items || []).map((item, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-xs leading-tight">
                            <span className="text-gray-200">{item.name}</span>
                            <span className="text-gray-500">×{item.qty}{item.unit ? ' ' + item.unit : ''}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {(b.bookingType || b.type) === 'full_factory'
                        ? <span className="bg-amber-950 text-amber-300 text-xs font-semibold px-2.5 py-1 rounded-lg">Full Factory</span>
                        : <span className="bg-red-950 text-red-400 text-xs font-semibold px-2.5 py-1 rounded-lg">Others</span>
                      }
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2.5 py-1 rounded-lg capitalize font-medium ${STATUS_COLORS[b.status] || 'bg-gray-800 text-gray-400'}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-white">{formatCurrency(b.total || 0, currency)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-green-400">
                      {bPaid > 0 ? formatCurrency(bPaid, currency) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold">
                      {bBalance > 0.005
                        ? <span className="text-orange-400">{formatCurrency(bBalance, currency)}</span>
                        : <span className="text-green-400 text-xs">Paid</span>
                      }
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 justify-end">
                        {canDeliver && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Mark "${b.customer}" booking as Delivered? This will deduct items from inventory.`)) {
                                dispatch({ type: 'DELIVER_BOOKING', payload: { bookingId: b.id } });
                              }
                            }}
                            className="text-emerald-500 hover:text-emerald-300 transition-colors"
                            title="Mark as Delivered — deduct from stock"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                            </svg>
                          </button>
                        )}
                        <button onClick={() => { setSelected(b); setShowPayForm(false); setPayForm(EMPTY_PAY); setEditingPaymentId(null); setModal('view'); }} className="text-gray-500 hover:text-white transition-colors" title="View">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        </button>
                        <button onClick={() => openEdit(b)} className="text-gray-500 hover:text-blue-400 transition-colors" title="Edit">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button onClick={() => del(b.id)} className="text-gray-500 hover:text-red-400 transition-colors" title="Delete">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>}

      {/* ── Full Factory / Others Matrix ── */}
      {(activeTab === 'full_factory' || activeTab === 'others') && (() => {
        const matrix = activeTab === 'full_factory' ? ffMatrix : othMatrix;
        const { customers, rows: allRows } = matrix;
        const isFF = activeTab === 'full_factory';

        const q = matrixSearch.trim().toLowerCase();
        const rows = q ? allRows.filter(r => r.name.toLowerCase().includes(q)) : allRows;

        const SNW    = 48;
        const ITEMW  = 260;
        const COLW   = 38;
        const TOTALW = 52;
        const totalW = SNW + ITEMW + customers.length * COLW + TOTALW;

        return (
          <div className="space-y-3">
            {/* Search toolbar */}
            <div className="flex items-center gap-3">
              <div className="relative w-72">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search items…"
                  value={matrixSearch}
                  onChange={e => setMatrixSearch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <span className="text-gray-500 text-xs">{rows.length} item{rows.length !== 1 ? 's' : ''} · {customers.length} client{customers.length !== 1 ? 's' : ''}</span>
            </div>

            {rows.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-16 text-center">
                <p className="text-gray-500 text-base font-medium">{q ? 'No items match your search' : `No ${isFF ? 'Full Factory' : 'Others'} bookings found`}</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {/* ── Top scrolling ruler ── */}
                <div
                  ref={matrixRulerRef}
                  onScroll={onRulerScroll}
                  style={{
                    overflowX: 'scroll', overflowY: 'hidden',
                    height: 16, background: '#0f172a',
                    borderRadius: '12px 12px 0 0',
                    border: '1px solid #1f2937', borderBottom: 'none',
                    scrollbarWidth: 'thin', scrollbarColor: '#475569 #1e293b',
                  }}
                >
                  {/* Ghost element — same width as the table so the ruler scrolls in sync */}
                  <div style={{ width: totalW, height: 1 }} />
                </div>

                {/* ── Main table ── */}
                <div
                  ref={matrixTableRef}
                  onScroll={onTableScroll}
                  style={{
                    width: '100%', overflowX: 'scroll', overflowY: 'visible',
                    borderRadius: '0 0 16px 16px',
                    border: '1px solid #1f2937', borderTop: 'none',
                    background: '#0f172a',
                    scrollbarWidth: 'thin', scrollbarColor: '#334155 #0f172a',
                  }}
                >
                  <table style={{ borderCollapse: 'collapse', minWidth: totalW, width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{
                          background: '#1e293b', color: '#94a3b8', fontWeight: 700, fontSize: 12,
                          textAlign: 'center', padding: '10px 4px', border: '1px solid #334155',
                          width: SNW, minWidth: SNW, position: 'sticky', left: 0, zIndex: 2,
                        }}>S/N</th>
                        <th style={{
                          background: '#1e293b', color: '#f1f5f9', fontWeight: 700, fontSize: 13,
                          textAlign: 'left', padding: '10px 14px', border: '1px solid #334155',
                          width: ITEMW, minWidth: ITEMW, position: 'sticky', left: SNW, zIndex: 2,
                        }}>ITEMS</th>
                        {customers.map((c, i) => (
                          <th key={i} style={{
                            background: '#1e293b', color: '#f1f5f9', fontWeight: 900, fontSize: 12,
                            border: '1px solid #334155', width: COLW, minWidth: COLW,
                            verticalAlign: 'bottom', padding: 0,
                          }}>
                            <div style={{
                              writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                              padding: '12px 8px', whiteSpace: 'nowrap',
                              textTransform: 'uppercase', letterSpacing: '0.04em',
                            }}>
                              {c}
                            </div>
                          </th>
                        ))}
                        <th style={{
                          background: '#1e3a8a', color: '#bfdbfe', fontWeight: 900, fontSize: 12,
                          border: '1px solid #334155', width: TOTALW, minWidth: TOTALW,
                          verticalAlign: 'bottom', padding: 0,
                        }}>
                          <div style={{
                            writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                            padding: '12px 8px', whiteSpace: 'nowrap',
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}>TOTAL</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => {
                        const rowBg = idx % 2 === 0 ? '#0f172a' : '#131e2e';
                        return (
                          <tr key={row.name} style={{ background: rowBg }}>
                            <td style={{
                              color: '#64748b', textAlign: 'center', padding: '9px 4px',
                              border: '1px solid #1e293b', fontSize: 12, fontWeight: 600,
                              position: 'sticky', left: 0, background: rowBg, zIndex: 1,
                            }}>{idx + 1}</td>
                            <td style={{
                              color: '#f1f5f9', fontWeight: 600, fontSize: 13,
                              padding: '9px 14px', border: '1px solid #1e293b',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              maxWidth: ITEMW, position: 'sticky', left: SNW, background: rowBg, zIndex: 1,
                            }}>{row.name}</td>
                            {row.qtys.map((qty, i) => (
                              <td key={i} style={{
                                textAlign: 'center', padding: '9px 2px',
                                border: '1px solid #1e293b',
                                fontWeight: qty > 0 ? 800 : 400,
                                color: qty > 0 ? '#f8fafc' : '#1e293b',
                                fontFamily: 'monospace', fontSize: 14,
                                background: qty > 0 ? (idx % 2 === 0 ? '#172133' : '#1a2840') : rowBg,
                              }}>
                                {qty > 0 ? qty : ''}
                              </td>
                            ))}
                            <td style={{
                              textAlign: 'center', padding: '9px 2px',
                              border: '1px solid #1e293b',
                              fontWeight: 800, fontSize: 15,
                              color: row.total > 0 ? '#93c5fd' : '#1e293b',
                              fontFamily: 'monospace', background: '#0e2044',
                            }}>
                              {row.total > 0 ? row.total : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── New Booking Modal ─────────────────────────────────────────────────── */}
      {modal === 'new' && (
        <Modal title="New Booking" onClose={() => setModal(null)}>
          <BookingFormFields f={form} setF={setForm} availableItems={dedupeInventory(inventory)} currency={currency} />

          {/* Initial payment section */}
          <div className="mt-5 border-t border-gray-800 pt-5 space-y-3">
            <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">Initial Payment <span className="normal-case text-gray-600">(optional)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-500 text-xs block mb-1.5">Amount Paid</label>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form.initialPayment}
                  onChange={e => setForm(x => ({ ...x, initialPayment: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-gray-500 text-xs block mb-1.5">Payment Method</label>
                <select
                  value={form.paymentMethod}
                  onChange={e => setForm(x => ({ ...x, paymentMethod: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            {/* Live preview */}
            {parseFloat(form.initialPayment) > 0 && (() => {
              const rawTotal     = calcItemsTotal(form.items);
              const discountAmt  = parseFloat(form.discount) || 0;
              const effTotal     = Math.max(0, rawTotal - discountAmt);
              const paid         = parseFloat(form.initialPayment) || 0;
              const balance      = effTotal - paid;
              return (
                <div className="bg-gray-800 rounded-xl px-4 py-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-400">Total Value</span><span className="text-white font-mono">{formatCurrency(rawTotal, currency)}</span></div>
                  {discountAmt > 0 && <div className="flex justify-between"><span className="text-red-400">Discount</span><span className="text-red-400 font-mono">- {formatCurrency(discountAmt, currency)}</span></div>}
                  {discountAmt > 0 && <div className="flex justify-between"><span className="text-gray-400">Amount Due</span><span className="text-white font-mono font-semibold">{formatCurrency(effTotal, currency)}</span></div>}
                  <div className="flex justify-between"><span className="text-gray-400">Initial Payment</span><span className="text-green-400 font-mono">{formatCurrency(paid, currency)}</span></div>
                  <div className="flex justify-between font-semibold border-t border-gray-700 pt-1 mt-1">
                    <span className={balance > 0.005 ? 'text-orange-400' : 'text-green-400'}>Balance Remaining</span>
                    <span className={`font-mono ${balance > 0.005 ? 'text-orange-400' : 'text-green-400'}`}>
                      {balance > 0.005 ? formatCurrency(balance, currency) : 'Fully Paid'}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={() => setModal(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
            <button
              onClick={submitNew}
              disabled={!form.customer.trim() || form.items.filter(i => i.id || i.name?.trim()).length === 0}
              className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              Create Booking
            </button>
          </div>
        </Modal>
      )}

      {/* ── Edit Booking Modal ────────────────────────────────────────────────── */}
      {modal === 'edit' && editForm && (
        <Modal title={`Edit Booking · ${editForm.id}`} onClose={() => setModal(null)}>
          <BookingFormFields f={editForm} setF={setEditForm} availableItems={dedupeInventory(inventory)} currency={currency} />
          <div className="flex gap-3 pt-4">
            <button onClick={() => setModal(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
            <button
              onClick={submitEdit}
              disabled={!editForm.customer.trim() || editForm.items.filter(i => i.id || i.name?.trim()).length === 0}
              className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              Save Changes
            </button>
          </div>
        </Modal>
      )}

      {/* ── View Modal ────────────────────────────────────────────────────────── */}
      {modal === 'view' && currentSelected && (() => {
        const b             = currentSelected;
        const payments      = b.payments || [];
        const paid          = b.amountPaid || 0;
        const effectiveTotal = Math.max(0, (b.total || 0) - (b.discount || 0));
        const balance       = effectiveTotal - paid;

        return (
          <Modal title={`Booking · ${b.id}`} onClose={() => { setModal(null); setEditingPaymentId(null); }} wide>
            <div className="space-y-5">

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-gray-500 text-xs mb-1">Customer</p><p className="text-white font-medium">{b.customer}</p></div>
                <div>
                  <p className="text-gray-500 text-xs mb-1">Status</p>
                  <span className={`text-xs px-2 py-0.5 rounded-lg capitalize font-medium ${STATUS_COLORS[b.status]}`}>{b.status}</span>
                </div>
                <div><p className="text-gray-500 text-xs mb-1">Booked</p><p className="text-white">{fmtDate(b.date)}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Delivery</p><p className="text-white">{b.deliveryDate ? fmtDate(b.deliveryDate) : '—'}</p></div>
                {b.createdBy && <div className="col-span-2"><p className="text-gray-500 text-xs mb-1">Created By</p><p className="text-white">{b.createdBy}</p></div>}
              </div>

              {/* Items */}
              <div className="bg-gray-800 rounded-xl divide-y divide-gray-700 text-sm">
                {b.items?.map(item => {
                  const lineTotal = (item.qty || 1) * (parseFloat(item.price) || 0);
                  return (
                    <div key={item.id} className="px-4 py-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-white">{item.name}</span>
                        <span className="text-blue-400 text-xs font-mono font-semibold">{formatCurrency(lineTotal, currency)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                        <span>{item.qty}{item.unit ? ' ' + item.unit : ''}</span>
                        {item.price > 0 && <span>@ {formatCurrency(item.price, currency)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Note */}
              {b.note && (
                <div className="bg-gray-800 rounded-xl p-4 text-sm">
                  <p className="text-gray-500 text-xs mb-1">Note</p>
                  <p className="text-white">{b.note}</p>
                </div>
              )}

              {/* ── Payment Summary ─────────────────────────────────────────────── */}
              <div className="bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Booking Value</span>
                  <span className="text-white font-mono">{formatCurrency(b.total || 0, currency)}</span>
                </div>
                {(b.discount || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-red-400">Discount Applied</span>
                    <span className="text-red-400 font-mono">- {formatCurrency(b.discount, currency)}</span>
                  </div>
                )}
                {(b.discount || 0) > 0 && (
                  <div className="flex justify-between border-t border-gray-700 pt-2">
                    <span className="text-gray-400">Amount Due</span>
                    <span className="text-white font-mono font-semibold">{formatCurrency(effectiveTotal, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Amount Paid</span>
                  <span className="text-green-400 font-mono">{formatCurrency(paid, currency)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-gray-700 pt-2">
                  <span className={balance > 0.005 ? 'text-orange-400' : 'text-green-400'}>
                    Balance Remaining
                  </span>
                  <span className={`font-mono ${balance > 0.005 ? 'text-orange-400' : 'text-green-400'}`}>
                    {balance > 0.005 ? formatCurrency(balance, currency) : 'Fully Paid'}
                  </span>
                </div>
              </div>

              {/* ── Payment History ─────────────────────────────────────────────── */}
              {payments.length > 0 && (
                <div>
                  <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-2">Payment History</p>
                  <div className="bg-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left text-gray-500 font-medium px-4 py-2.5">Date</th>
                          <th className="text-left text-gray-500 font-medium px-4 py-2.5">Method</th>
                          <th className="text-left text-gray-500 font-medium px-4 py-2.5">Note</th>
                          <th className="text-right text-gray-500 font-medium px-4 py-2.5">Amount</th>
                          <th className="w-6 px-2 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map(p => (
                          editingPaymentId === p.id ? (
                            <tr key={p.id} className="border-b border-gray-700 last:border-0 bg-gray-700/40">
                              <td className="px-2 py-2">
                                <input
                                  type="date"
                                  value={editPayForm.date}
                                  onChange={e => setEditPayForm(x => ({ ...x, date: e.target.value }))}
                                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <select
                                  value={editPayForm.method}
                                  onChange={e => setEditPayForm(x => ({ ...x, method: e.target.value }))}
                                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                                </select>
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="text"
                                  value={editPayForm.note}
                                  onChange={e => setEditPayForm(x => ({ ...x, note: e.target.value }))}
                                  placeholder="Note…"
                                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  min={0.01}
                                  step="0.01"
                                  value={editPayForm.amount}
                                  onChange={e => setEditPayForm(x => ({ ...x, amount: e.target.value }))}
                                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex flex-col items-center gap-1">
                                  <button onClick={() => updatePayment(b.id, p.id, editPayForm)} className="text-green-400 hover:text-green-300 font-bold leading-none" title="Save">✓</button>
                                  <button onClick={() => setEditingPaymentId(null)} className="text-gray-500 hover:text-white leading-none" title="Cancel">✕</button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr key={p.id} className="border-b border-gray-700 last:border-0">
                              <td className="px-4 py-2.5 text-gray-300">{fmtDate(p.date)}</td>
                              <td className="px-4 py-2.5 text-gray-300">{p.method}</td>
                              <td className="px-4 py-2.5 text-gray-500">{p.note || '—'}</td>
                              <td className="px-4 py-2.5 text-right text-green-400 font-mono font-semibold">{formatCurrency(p.amount, currency)}</td>
                              <td className="px-2 py-2.5">
                                <button
                                  onClick={() => { setEditingPaymentId(p.id); setEditPayForm({ amount: String(p.amount), date: p.date ? p.date.split('T')[0] : '', method: p.method || 'Cash', note: p.note || '' }); }}
                                  className="text-gray-500 hover:text-blue-400 transition-colors"
                                  title="Edit payment"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          )
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Add Payment ─────────────────────────────────────────────────── */}
              {balance > 0.005 && (
                <div>
                  {!showPayForm ? (
                    <button
                      onClick={() => setShowPayForm(true)}
                      className="w-full flex items-center justify-center gap-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                      Record Payment
                    </button>
                  ) : (
                    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
                      <p className="text-gray-300 text-sm font-medium">Record Payment</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-gray-500 text-xs block mb-1.5">Amount <span className="text-red-400">*</span></label>
                          <input
                            type="number"
                            min={0.01}
                            max={balance}
                            step="0.01"
                            placeholder={`Max ${formatCurrency(balance, currency)}`}
                            value={payForm.amount}
                            onChange={e => setPayForm(x => ({ ...x, amount: e.target.value }))}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                        <div>
                          <label className="text-gray-500 text-xs block mb-1.5">Method</label>
                          <select
                            value={payForm.method}
                            onChange={e => setPayForm(x => ({ ...x, method: e.target.value }))}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          >
                            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-gray-500 text-xs block mb-1.5">Date</label>
                          <input
                            type="date"
                            value={payForm.date}
                            onChange={e => setPayForm(x => ({ ...x, date: e.target.value }))}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                        <div>
                          <label className="text-gray-500 text-xs block mb-1.5">Note</label>
                          <input
                            type="text"
                            placeholder="Optional note…"
                            value={payForm.note}
                            onChange={e => setPayForm(x => ({ ...x, note: e.target.value }))}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                      </div>
                      {/* Preview after this payment */}
                      {parseFloat(payForm.amount) > 0 && (
                        <div className="bg-gray-700/60 rounded-lg px-3 py-2 text-xs flex justify-between">
                          <span className="text-gray-400">Balance after this payment</span>
                          <span className={`font-mono font-semibold ${balance - parseFloat(payForm.amount) > 0.005 ? 'text-orange-400' : 'text-green-400'}`}>
                            {balance - parseFloat(payForm.amount) > 0.005
                              ? formatCurrency(balance - parseFloat(payForm.amount), currency)
                              : 'Fully Paid'}
                          </span>
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => { setShowPayForm(false); setPayForm(EMPTY_PAY); }} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">Cancel</button>
                        <button
                          onClick={() => addPayment(b.id)}
                          disabled={!payForm.amount || parseFloat(payForm.amount) <= 0}
                          className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                        >
                          Confirm Payment
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Status + Actions ─────────────────────────────────────────────── */}
              <div className="space-y-3 pt-1 border-t border-gray-800">
                {/* Deliver button — prominent action when not yet delivered */}
                {b.status !== 'delivered' && b.status !== 'cancelled' && (
                  <button
                    onClick={() => {
                      if (window.confirm('Mark as Delivered? This will deduct all booked items from inventory stock.')) {
                        dispatch({ type: 'DELIVER_BOOKING', payload: { bookingId: b.id } });
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-3 rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                    </svg>
                    Mark as Delivered — Deduct from Stock
                  </button>
                )}
                {b.status === 'delivered' && (
                  <div className="flex items-center justify-center gap-2 bg-green-950 border border-green-800 text-green-400 text-sm font-medium px-4 py-2.5 rounded-xl">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                    </svg>
                    Delivered — Stock Deducted
                  </div>
                )}
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-gray-400 text-xs font-medium block mb-1.5">Update Status</label>
                    <select
                      value={b.status}
                      onChange={e => {
                        const newStatus = e.target.value;
                        if (newStatus === 'delivered' && b.status !== 'delivered') {
                          if (window.confirm('Mark as Delivered? This will deduct all booked items from inventory stock.')) {
                            dispatch({ type: 'DELIVER_BOOKING', payload: { bookingId: b.id } });
                          }
                        } else {
                          updateStatus(b.id, newStatus);
                          setSelected(s => ({ ...s, status: newStatus }));
                        }
                      }}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none"
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <button onClick={() => { setModal(null); openEdit(b); }} className="mt-5 bg-blue-950 hover:bg-blue-900 text-blue-400 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Edit</button>
                  <button onClick={() => del(b.id)} className="mt-5 bg-red-950 hover:bg-red-900 text-red-400 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Delete</button>
                </div>
              </div>

            </div>
          </Modal>
        );
      })()}

      {/* ── Report Modal ──────────────────────────────────────────────────────── */}
      {reportOpen && (() => {
        const reportData  = reportStatusFilter === 'all' ? filtered : filtered.filter(b => b.status === reportStatusFilter);
        const statusLabel = reportStatusFilter === 'all' ? 'All' : reportStatusFilter.charAt(0).toUpperCase() + reportStatusFilter.slice(1);
        return (
          <ReportModal
            title={`Bookings — ${statusLabel}`}
            data={reportData}
            dateKey="date"
            columns={bookingColumns}
            getSummary={getBookingSummary}
            onClose={() => setReportOpen(false)}
            state={state}
          />
        );
      })()}

      {deleteReq && (
        <DeleteRequestModal
          type={deleteReq.type}
          targetId={deleteReq.targetId}
          label={deleteReq.label}
          onClose={() => setDeleteReq(null)}
        />
      )}

      {/* ── Full Factory Import Modal ─────────────────────────────────────── */}
      {ffImportOpen && (
        <Modal title="Import Full Factory Booking" onClose={() => setFfImportOpen(false)}>
          <div className="space-y-4">
            <div className="bg-emerald-950/40 border border-emerald-700/40 rounded-xl px-4 py-3 text-xs text-emerald-300">
              Creates one <span className="font-semibold">Full Factory</span> booking with <span className="font-semibold">{FULL_FACTORY_TEMPLATE.length} items</span> from the China/Lagos order sheet. Prices default to 0 — edit the booking afterwards to fill them in.
            </div>

            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Customer / Order Name <span className="text-red-400">*</span></label>
              <input
                type="text"
                placeholder="e.g. China/Lagos Factory Order"
                value={ffCustomer}
                onChange={e => setFfCustomer(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />
            </div>

            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Booking Date</label>
              <input
                type="date"
                value={ffDate}
                onChange={e => setFfDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Item preview */}
            <div>
              <p className="text-gray-400 text-xs font-medium mb-2">Items Preview ({FULL_FACTORY_TEMPLATE.length})</p>
              <div className="bg-gray-800 rounded-xl max-h-48 overflow-y-auto">
                {FULL_FACTORY_TEMPLATE.map((t, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-1.5 border-b border-gray-700/50 last:border-0 text-xs">
                    <span className="text-gray-300 truncate flex-1">{t.name}</span>
                    <span className="text-blue-400 font-mono shrink-0 ml-3">{t.qty} {t.unit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setFfImportOpen(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
                Cancel
              </button>
              <button
                onClick={submitFFImport}
                disabled={!ffCustomer.trim()}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
              >
                Create Full Factory Booking
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
