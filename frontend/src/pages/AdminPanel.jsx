import { useState, useEffect } from 'react';
import { useApp, fmtDateTime, fmtDate, genId } from '../context/AppContext';
import { refreshAppUsers, refreshPendingUsers, refreshDeleteRequests, refreshPermissions, refreshAuditLog } from '../lib/refresh';
import { ROLES, ALL_PAGES } from '../data/users';

const ALL_ROLES = [
  { id: 'main_super_admin', label: 'Main Super Admin' },
  { id: 'super_admin',      label: 'Super Admin' },
  { id: 'admin',            label: 'Admin' },
  { id: 'inventory',        label: 'Inventory Manager' },
  { id: 'sales',            label: 'Sales Officer' },
];

function PendingCard({ u, dispatch }) {
  const [role, setRole] = useState(u.role || 'sales');
  const [bid, setBid] = useState(u.bid || 'KUB');

  function approve() {
    dispatch({
      type: 'APPROVE_PENDING',
      payload: u.id,
      // Pass overridden role/bid so reducer can apply them
      role,
      bid: role === 'super_admin' ? null : bid,
    });
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-white font-medium">{u.name}</p>
          <p className="text-gray-500 text-xs mt-0.5">{u.em}</p>
          {u.phone && <p className="text-gray-600 text-xs">{u.phone}</p>}
          {u.registeredAt && <p className="text-gray-700 text-xs mt-1">Registered {fmtDate(u.registeredAt)}</p>}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 items-end sm:items-center">
          <select value={role} onChange={e => setRole(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            {ALL_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          {role !== 'super_admin' && (
            <select value={bid} onChange={e => setBid(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="DUB">Dubai Market</option>
              <option value="KUB">Kubwa Office</option>
            </select>
          )}
          <button onClick={approve}
            className="text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap">
            Approve
          </button>
          <button onClick={() => dispatch({ type: 'REJECT_PENDING', payload: u.id })}
            className="text-xs bg-red-950 hover:bg-red-900 text-red-400 px-3 py-1.5 rounded-lg font-medium transition-colors">
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

const BRANCHES = [
  { id: null,  label: 'All Branches (Admin)' },
  { id: 'DUB', label: 'Dubai Market' },
  { id: 'KUB', label: 'Kubwa Office' },
];

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

const TABS = ['Users', 'Pending', 'Requests', 'Permissions', 'Audit Log', 'Branch'];

const EMPTY_USER = { name: '', em: '', pw: '', role: 'sales', bid: 'KUB', phone: '', status: 'active' };

export default function AdminPanel() {
  const { state, dispatch } = useApp();
  const { users, pendingUsers, deleteRequests, permissions, auditLog, branch, bname, user: currentUser } = state;

  useEffect(() => {
    // Do NOT refresh app_users here — doing so races with the async ADD_USER sync
    // and overwrites optimistically-added users before they land in Supabase.
    // app_users is kept current by the Realtime subscription in AppContext.
    refreshPendingUsers(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'pendingUsers', data } }));
    refreshDeleteRequests(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'deleteRequests', data } }));
    refreshPermissions(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'permissions', data } }));
    refreshAuditLog(data => dispatch({ type: 'REFRESH_TABLE', payload: { key: 'auditLog', data } }));
  }, []);

  const [tab, setTab] = useState('Users');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_USER);
  const [selected, setSelected] = useState(null);
  const [editPerms, setEditPerms] = useState(null);
  const [permPages, setPermPages] = useState([]);
  const [userPermsTarget, setUserPermsTarget] = useState(null);
  const [userPermPages, setUserPermPages] = useState([]);

  // Branch switcher (super admin only)
  function setBranch(bid) {
    dispatch({ type: 'SET_BRANCH', payload: bid });
  }

  function openAddUser()  { setForm(EMPTY_USER); setModal('add'); }
  function openEditUser(u) { setSelected(u); setForm({ name: u.name, em: u.em, pw: u.pw, role: u.role, bid: u.bid || null, phone: u.phone || '', status: u.status }); setModal('edit'); }

  function saveUser() {
    if (!form.name.trim() || !form.em.trim()) return;
    const payload = { ...form, bid: form.bid || null, initials: form.name.slice(0,2).toUpperCase() };
    if (modal === 'add') {
      dispatch({ type: 'ADD_USER', payload: { id: genId('U'), ...payload } });
    } else {
      dispatch({ type: 'UPDATE_USER', payload: { ...selected, ...payload } });
    }
    setModal(null);
  }

  function deleteUser(id) {
    if (window.confirm('Delete this user?')) dispatch({ type: 'DELETE_USER', payload: id });
  }

  function openPerms(role) {
    setEditPerms(role);
    setPermPages([...(permissions[role] || [])]);
  }

  function openUserPerms(u) {
    setUserPermsTarget(u);
    // Start from user's custom pages if set, otherwise their role defaults
    setUserPermPages([...(u.customPages || permissions[u.role] || [])]);
  }

  function saveUserPerms() {
    dispatch({ type: 'SET_USER_PERMISSIONS', payload: { userId: userPermsTarget.id, pages: userPermPages } });
    setUserPermsTarget(null);
  }

  function toggleUserPermPage(pageId) {
    setUserPermPages(p => p.includes(pageId) ? p.filter(x => x !== pageId) : [...p, pageId]);
  }

  function togglePage(pageId) {
    setPermPages(p => p.includes(pageId) ? p.filter(x => x !== pageId) : [...p, pageId]);
  }

  function savePerms() {
    dispatch({ type: 'SET_PERMISSIONS', payload: { role: editPerms, pages: permPages } });
    setEditPerms(null);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-syne text-2xl font-bold text-white">Admin Panel</h1>
        <p className="text-gray-500 text-sm mt-0.5">System administration</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-2xl p-1.5 w-fit">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === t ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {t}
            {t === 'Pending' && pendingUsers.length > 0 && (
              <span className="ml-1.5 bg-amber-500 text-black text-xs rounded-full px-1.5 py-0.5 font-bold">{pendingUsers.length}</span>
            )}
            {t === 'Requests' && (deleteRequests || []).length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{(deleteRequests || []).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Users Tab */}
      {tab === 'Users' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openAddUser} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
              Add User
            </button>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-500 font-medium px-5 py-3">User</th>
                  <th className="text-left text-gray-500 font-medium px-5 py-3">Role</th>
                  <th className="text-left text-gray-500 font-medium px-5 py-3">Branch</th>
                  <th className="text-left text-gray-500 font-medium px-5 py-3">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className={`border-b border-gray-800 last:border-0 hover:bg-gray-800/40 transition-colors ${u.id === currentUser?.id ? 'bg-blue-500/5' : ''}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {u.initials || u.name?.slice(0,2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-white font-medium">{u.name} {u.id === currentUser?.id && <span className="text-gray-500 text-xs">(you)</span>}</p>
                          <p className="text-gray-500 text-xs">{u.em}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-lg capitalize">{u.role?.replace('_', ' ')}</span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-400">{u.bid === 'DUB' ? 'Dubai Market' : u.bid === 'KUB' ? 'Kubwa Office' : 'All'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${u.status === 'active' ? 'bg-blue-950 text-blue-400' : 'bg-gray-800 text-gray-500'}`}>{u.status}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openUserPerms(u)} title="Edit user permissions" className="text-gray-500 hover:text-blue-400 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
                        </button>
                        <button onClick={() => openEditUser(u)} className="text-gray-500 hover:text-white transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        {u.id !== currentUser?.id && (
                          <button onClick={() => deleteUser(u.id)} className="text-gray-500 hover:text-red-400 transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending Tab */}
      {tab === 'Pending' && (
        <div className="space-y-4">
          {pendingUsers.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl py-12 text-center text-gray-600">No pending registrations</div>
          ) : pendingUsers.map(u => (
            <PendingCard key={u.id} u={u} dispatch={dispatch} />
          ))}
        </div>
      )}

      {/* Requests Tab */}
      {tab === 'Requests' && (
        <div className="space-y-4">
          {(deleteRequests || []).length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl py-12 text-center text-gray-600">No pending delete requests</div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 font-medium px-5 py-3">Item</th>
                      <th className="text-left text-gray-500 font-medium px-5 py-3">Type</th>
                      <th className="text-left text-gray-500 font-medium px-5 py-3">Requested By</th>
                      <th className="text-left text-gray-500 font-medium px-5 py-3">Reason</th>
                      <th className="text-left text-gray-500 font-medium px-5 py-3">Date</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(deleteRequests || []).map(req => (
                      <tr key={req.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                        <td className="px-5 py-3.5 text-white font-medium">{req.label}</td>
                        <td className="px-5 py-3.5">
                          <span className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-lg capitalize">{req.type}</span>
                        </td>
                        <td className="px-5 py-3.5 text-gray-400">{req.requestedBy || '—'}</td>
                        <td className="px-5 py-3.5 text-gray-400 max-w-xs truncate">{req.reason}</td>
                        <td className="px-5 py-3.5 text-gray-500 text-xs">{fmtDateTime(req.requestedAt)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => dispatch({ type: 'APPROVE_DELETE', payload: req.id })}
                              className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-1.5 rounded-lg font-medium transition-colors"
                            >Approve &amp; Delete</button>
                            <button
                              onClick={() => dispatch({ type: 'REJECT_DELETE', payload: req.id })}
                              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg font-medium transition-colors"
                            >Reject</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Permissions Tab */}
      {tab === 'Permissions' && (
        <div className="space-y-4">
          {ROLES.map(role => (
            <div key={role.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-syne font-semibold text-white">{role.label}</h3>
                  <p className="text-gray-500 text-xs mt-0.5">{(permissions[role.id] || []).length} pages accessible</p>
                </div>
                {editPerms === role.id ? (
                  <div className="flex gap-2">
                    <button onClick={() => setEditPerms(null)} className="text-xs bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
                    <button onClick={savePerms} className="text-xs bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">Save</button>
                  </div>
                ) : (
                  <button onClick={() => openPerms(role.id)} className="text-xs bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg transition-colors">Edit</button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {ALL_PAGES.map(page => {
                  const active = editPerms === role.id
                    ? permPages.includes(page.id)
                    : (permissions[role.id] || []).includes(page.id);
                  return (
                    <button
                      key={page.id}
                      onClick={() => editPerms === role.id && togglePage(page.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        active
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-gray-800 text-gray-500 border border-transparent'
                      } ${editPerms === role.id ? 'cursor-pointer hover:border-gray-600' : 'cursor-default'}`}
                    >
                      {page.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Audit Log Tab */}
      {tab === 'Audit Log' && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-500 font-medium px-5 py-3">Action</th>
                  <th className="text-left text-gray-500 font-medium px-5 py-3">User</th>
                  <th className="text-left text-gray-500 font-medium px-5 py-3">Detail</th>
                  <th className="text-left text-gray-500 font-medium px-5 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-gray-600 py-12">No audit entries yet</td></tr>
                ) : auditLog.slice(0, 100).map(entry => (
                  <tr key={entry.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                    <td className="px-5 py-3 text-white">{entry.action}</td>
                    <td className="px-5 py-3 text-gray-400">{entry.user || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 font-mono text-xs">{entry.detail}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{fmtDateTime(entry.ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Branch Tab */}
      {tab === 'Branch' && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="font-syne font-semibold text-white mb-4">Active Branch View</h3>
            <p className="text-gray-500 text-sm mb-5">Switch the branch context for your session. As super admin, you can view data from any branch.</p>
            <div className="space-y-3">
              {BRANCHES.map(b => (
                <button
                  key={b.id || 'all'}
                  onClick={() => setBranch(b.id)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border transition-colors ${
                    (state.branch === b.id) || (b.id === null && state.branch === null)
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <span className="font-medium">{b.label}</span>
                  {((state.branch === b.id) || (b.id === null && state.branch === null)) && (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Per-User Permissions Modal */}
      {userPermsTarget && (
        <Modal title={`Permissions — ${userPermsTarget.name}`} onClose={() => setUserPermsTarget(null)}>
          <div className="space-y-4">
            <p className="text-gray-400 text-xs">
              Custom permissions override the default role permissions for this user only.
              {userPermsTarget.customPages && (
                <span className="ml-1 text-amber-400">Custom permissions are active.</span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_PAGES.map(page => {
                const active = userPermPages.includes(page.id);
                return (
                  <button
                    key={page.id}
                    onClick={() => toggleUserPermPage(page.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                      active
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                        : 'bg-gray-800 text-gray-500 border-transparent hover:border-gray-600'
                    }`}
                  >
                    {page.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 pt-1">
              {userPermsTarget.customPages && (
                <button
                  onClick={() => {
                    dispatch({ type: 'SET_USER_PERMISSIONS', payload: { userId: userPermsTarget.id, pages: [] } });
                    setUserPermsTarget(null);
                  }}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-amber-400 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Reset to Role Default
                </button>
              )}
              <div className="flex-1"/>
              <button onClick={() => setUserPermsTarget(null)} className="text-xs bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors">Cancel</button>
              <button onClick={saveUserPerms} className="text-xs bg-blue-500 hover:bg-blue-400 text-white px-4 py-2 rounded-lg font-medium transition-colors">Save</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add/Edit User Modal */}
      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? 'Add User' : 'Edit User'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            {[
              { key: 'name', label: 'Full Name', required: true },
              { key: 'em',   label: 'Email Address', required: true, type: 'email' },
              { key: 'pw',   label: 'Password', type: 'password' },
              { key: 'phone', label: 'Phone Number' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">{f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}</label>
                <input type={f.type || 'text'} value={form[f.key]} onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium block mb-1.5">Branch</label>
                <select value={form.bid || ''} onChange={e => setForm(f => ({ ...f, bid: e.target.value || null }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All Branches</option>
                  <option value="DUB">Dubai Market</option>
                  <option value="KUB">Kubwa Office</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
              <button onClick={saveUser} disabled={!form.name.trim() || !form.em.trim()} className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
                {modal === 'add' ? 'Add User' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
