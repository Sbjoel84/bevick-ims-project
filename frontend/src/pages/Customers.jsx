import { useState } from 'react';
import { useApp, formatCurrency, fmtDate, genId } from '../context/AppContext';
import DeleteRequestModal from '../components/DeleteRequestModal';

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="font-syne font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

const EMPTY = { name: '', phone: '', email: '', address: '', note: '' };

export default function Customers() {
  const { state, dispatch } = useApp();
  const { customers, sales, currency, branch, bname, user } = state;

  const [modal, setModal] = useState(null); // 'add' | 'edit' | 'view'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [deleteReq, setDeleteReq] = useState(null);

  const filtered = customers
    .filter(c => branch ? (!c.branch || c.branch === branch) : true)
    .filter(c => {
      const q = search.toLowerCase();
      return !q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q);
    });

  function openAdd() { setForm(EMPTY); setModal('add'); }
  function openEdit(c) { setSelected(c); setForm({ name: c.name, phone: c.phone, email: c.email, address: c.address, note: c.note || '' }); setModal('edit'); }
  function openView(c) { setSelected(c); setModal('view'); }

  function save() {
    if (!form.name.trim()) return;
    if (modal === 'add') {
      dispatch({ type: 'ADD_CUSTOMER', payload: { id: genId('C'), ...form, branch: branch || null, createdAt: new Date().toISOString() } });
    } else {
      dispatch({ type: 'UPDATE_CUSTOMER', payload: { ...selected, ...form } });
    }
    setModal(null);
  }

  function del(id) {
    if (user?.role === 'super_admin') {
      if (window.confirm('Delete this customer? They will be moved to the recycle bin.')) {
        dispatch({ type: 'DELETE_CUSTOMER', payload: id });
        if (modal) setModal(null);
      }
    } else {
      const c = customers.find(x => x.id === id);
      setDeleteReq({ type: 'customer', targetId: id, label: c?.name || id });
    }
  }

  function customerSales(id) {
    return sales
      .filter(s => branch ? s.branch === branch : true)
      .filter(s => s.customerId === id || s.customer === customers.find(c => c.id === id)?.name);
  }

  function customerTotal(id) {
    return customerSales(id).reduce((s, x) => s + (x.total || 0), 0);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Customers</h1>
          <p className="text-gray-500 text-sm mt-0.5">{bname} · {filtered.length} registered</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          Add Customer
        </button>
      </div>

      <input
        type="text"
        placeholder="Search customers…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-72"
      />

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 font-medium px-5 py-3">Name</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Phone</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Email</th>
                <th className="text-left text-gray-500 font-medium px-5 py-3">Added</th>
                <th className="text-right text-gray-500 font-medium px-5 py-3">Total Purchases</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-600 py-12">No customers found</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-600/30 flex items-center justify-center text-blue-400 text-xs font-bold shrink-0">
                        {c.name?.slice(0,2).toUpperCase()}
                      </div>
                      <span className="text-white font-medium">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-400">{c.phone || '—'}</td>
                  <td className="px-5 py-3.5 text-gray-400">{c.email || '—'}</td>
                  <td className="px-5 py-3.5 text-gray-400">{c.createdAt ? fmtDate(c.createdAt) : '—'}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-blue-400">{formatCurrency(customerTotal(c.id), 'NGN')}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openView(c)} className="text-gray-500 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      </button>
                      <button onClick={() => openEdit(c)} className="text-gray-500 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <button onClick={() => del(c.id)} className="text-gray-500 hover:text-red-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? 'Add Customer' : 'Edit Customer'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            {[
              { key: 'name', label: 'Full Name', placeholder: 'Customer name', required: true },
              { key: 'phone', label: 'Phone Number', placeholder: '+234…' },
              { key: 'email', label: 'Email Address', placeholder: 'customer@email.com' },
              { key: 'address', label: 'Address', placeholder: 'Street, City' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">{f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}</label>
                <input
                  type="text"
                  placeholder={f.placeholder}
                  value={form[f.key]}
                  onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Note</label>
              <textarea
                value={form.note}
                onChange={e => setForm(x => ({ ...x, note: e.target.value }))}
                rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
              <button onClick={save} disabled={!form.name.trim()} className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
                {modal === 'add' ? 'Add Customer' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* View Modal */}
      {modal === 'view' && selected && (
        <Modal title={selected.name} onClose={() => setModal(null)}>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                { label: 'Phone', value: selected.phone },
                { label: 'Email', value: selected.email },
                { label: 'Address', value: selected.address },
                { label: 'Added', value: selected.createdAt ? fmtDate(selected.createdAt) : '—' },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-gray-500 text-xs mb-1">{f.label}</p>
                  <p className="text-white">{f.value || '—'}</p>
                </div>
              ))}
              {selected.note && (
                <div className="col-span-2">
                  <p className="text-gray-500 text-xs mb-1">Note</p>
                  <p className="text-white">{selected.note}</p>
                </div>
              )}
            </div>

            <div className="bg-gray-800 rounded-xl p-4 flex items-center justify-between">
              <span className="text-gray-400 text-sm">Total Purchases</span>
              <span className="text-blue-400 font-mono font-medium">{formatCurrency(customerTotal(selected.id), 'NGN')}</span>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { openEdit(selected); }} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Edit</button>
              <button onClick={() => del(selected.id)} className="flex-1 bg-red-950 hover:bg-red-900 text-red-400 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Delete</button>
            </div>
          </div>
        </Modal>
      )}

      {deleteReq && (
        <DeleteRequestModal
          type={deleteReq.type}
          targetId={deleteReq.targetId}
          label={deleteReq.label}
          onClose={() => setDeleteReq(null)}
        />
      )}
    </div>
  );
}
