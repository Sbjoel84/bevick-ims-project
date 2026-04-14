import { useState, useEffect } from 'react';
import { useApp, genId } from '../context/AppContext';
import { refreshSuppliers } from '../lib/refresh';
import DeleteRequestModal from '../components/DeleteRequestModal';

const CATEGORIES = ['Machinery', 'Spare Parts', 'Consumables', 'Chemicals', 'Safety', 'Others'];
const EMPTY = { name: '', contact: '', phone: '', email: '', address: '', category: 'Spare Parts', status: 'active' };

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="font-syne font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function Suppliers() {
  const { state, dispatch } = useApp();
  const { suppliers, user } = state;

  useEffect(() => {
    refreshSuppliers(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'suppliers', data } }));
  }, []);

  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [deleteReq, setDeleteReq] = useState(null);

  const filtered = suppliers
    .filter(s => filterCat === 'all' || s.category === filterCat)
    .filter(s => {
      const q = search.toLowerCase();
      return !q || s.name?.toLowerCase().includes(q) || s.contact?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q);
    });

  function openAdd()   { setForm(EMPTY); setModal('add'); }
  function openEdit(s) { setSelected(s); setForm({ name: s.name, contact: s.contact, phone: s.phone, email: s.email, address: s.address, category: s.category, status: s.status }); setModal('edit'); }
  function openView(s) { setSelected(s); setModal('view'); }

  function save() {
    if (!form.name.trim()) return;
    if (modal === 'add') {
      dispatch({ type: 'ADD_SUPPLIER', payload: { id: genId('SUP'), ...form } });
    } else {
      dispatch({ type: 'UPDATE_SUPPLIER', payload: { ...selected, ...form } });
    }
    setModal(null);
  }

  function del(id) {
    if (user?.role === 'super_admin') {
      if (window.confirm('Delete this supplier?')) {
        dispatch({ type: 'DELETE_SUPPLIER', payload: id });
        if (modal) setModal(null);
      }
    } else {
      const s = suppliers.find(x => x.id === id);
      setDeleteReq({ type: 'supplier', targetId: id, label: s?.name || id });
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Suppliers</h1>
          <p className="text-gray-500 text-sm mt-0.5">{suppliers.length} suppliers</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          Add Supplier
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search suppliers…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-3 bg-gray-900 border border-gray-800 rounded-2xl py-12 text-center text-gray-600">No suppliers found</div>
        ) : filtered.map(s => (
          <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-3 hover:border-gray-700 transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-syne font-semibold text-white">{s.name}</h3>
                <p className="text-gray-500 text-xs mt-0.5">{s.contact}</p>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${s.status === 'active' ? 'bg-blue-950 text-blue-400' : 'bg-gray-800 text-gray-500'}`}>
                  {s.status}
                </span>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-gray-400">
              {s.phone && <div className="flex items-center gap-2"><svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg><span>{s.phone}</span></div>}
              {s.email && <div className="flex items-center gap-2"><svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg><span>{s.email}</span></div>}
              {s.address && <div className="flex items-center gap-2"><svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg><span>{s.address}</span></div>}
            </div>
            <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-800">
              <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-lg">{s.category}</span>
              <div className="flex gap-2">
                <button onClick={() => openEdit(s)} className="text-gray-500 hover:text-white transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button onClick={() => del(s.id)} className="text-gray-500 hover:text-red-400 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {deleteReq && (
        <DeleteRequestModal
          type={deleteReq.type}
          targetId={deleteReq.targetId}
          label={deleteReq.label}
          onClose={() => setDeleteReq(null)}
        />
      )}

      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? 'Add Supplier' : 'Edit Supplier'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            {[
              { key: 'name', label: 'Company Name', required: true },
              { key: 'contact', label: 'Contact Person' },
              { key: 'phone', label: 'Phone Number' },
              { key: 'email', label: 'Email Address' },
              { key: 'address', label: 'Address' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">{f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}</label>
                <input type="text" value={form[f.key]} onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
              <button onClick={save} disabled={!form.name.trim()} className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
                {modal === 'add' ? 'Add Supplier' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
