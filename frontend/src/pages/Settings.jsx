import { useState } from 'react';
import { useApp, CURRENCY_SYMBOLS } from '../context/AppContext';
import { supabase } from '../lib/supabase';

const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'CNY'];

function Section({ title, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
      <h2 className="font-syne font-semibold text-white text-base">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-white text-sm font-medium">{label}</p>
        {hint && <p className="text-gray-500 text-xs mt-0.5">{hint}</p>}
      </div>
      <div className="sm:shrink-0 sm:ml-4">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { state, dispatch } = useApp();
  const { user, vat, thr, currency, bizName, bizRC, bizPhone, bizEmail, bizAddress, notifySales, notifyLowStock, notifyExpenses } = state;

  const [saved, setSaved] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: user?.name || '', phone: user?.phone || '' });

  function update(payload) {
    dispatch({ type: 'UPDATE_SETTINGS', payload });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function saveProfile() {
    dispatch({ type: 'UPDATE_PROFILE', payload: profileForm });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white">Settings</h1>
          <p className="text-gray-500 text-sm mt-0.5">Configure your IMS preferences</p>
        </div>
        {saved && (
          <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
            Saved
          </span>
        )}
      </div>

      {/* Profile */}
      <Section title="My Profile">
        <Field label="Display Name">
          <input
            type="text"
            value={profileForm.name}
            onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2 text-white text-sm w-52 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </Field>
        <Field label="Phone Number">
          <input
            type="text"
            value={profileForm.phone}
            onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2 text-white text-sm w-52 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </Field>
        <Field label="Email">
          <span className="text-gray-400 text-sm font-mono">{user?.em}</span>
        </Field>
        <Field label="Role">
          <span className="text-gray-400 text-sm capitalize">{user?.role?.replace('_', ' ')}</span>
        </Field>
        <button onClick={saveProfile} className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
          Save Profile
        </button>
      </Section>

      {/* Business — admin only */}
      {user?.role === 'super_admin' && (
        <Section title="Business Information">
          {[
            { key: 'bizName',    label: 'Business Name' },
            { key: 'bizRC',      label: 'RC Number' },
            { key: 'bizPhone',   label: 'Business Phone' },
            { key: 'bizEmail',   label: 'Business Email' },
            { key: 'bizAddress', label: 'Address' },
          ].map(f => (
            <Field key={f.key} label={f.label}>
              <input
                type="text"
                value={state[f.key]}
                onChange={e => update({ [f.key]: e.target.value })}
                className="bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2 text-white text-sm w-52 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </Field>
          ))}
        </Section>
      )}

      {/* Finance */}
      <Section title="Finance Settings">
        <Field label="Currency" hint="Used for all monetary display">
          <div className="flex gap-2 flex-wrap">
            {CURRENCIES.map(c => (
              <button
                key={c}
                onClick={() => update({ currency: c })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${currency === c ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                {CURRENCY_SYMBOLS[c]}&nbsp;{c}
              </button>
            ))}
          </div>
        </Field>
        <Field label="VAT Rate" hint="Applied when creating sales">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={(vat * 100).toFixed(1)}
              onChange={e => update({ vat: parseFloat(e.target.value) / 100 || 0 })}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2 text-white text-sm w-24 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-gray-400 text-sm">%</span>
          </div>
        </Field>
        <Field label="Low Stock Threshold" hint="Alert when qty falls below this">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={thr}
              onChange={e => update({ thr: parseInt(e.target.value) || 5 })}
              className="bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2 text-white text-sm w-24 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-gray-400 text-sm">units</span>
          </div>
        </Field>
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        {[
          { key: 'notifySales', label: 'New Sale Alerts', hint: 'Show notification on new sales' },
          { key: 'notifyLowStock', label: 'Low Stock Alerts', hint: 'Warn when items fall below threshold' },
          { key: 'notifyExpenses', label: 'Expense Alerts', hint: 'Notify when expenses are added' },
        ].map(f => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <button
              onClick={() => update({ [f.key]: !state[f.key] })}
              className={`relative w-11 h-6 rounded-full transition-colors ${state[f.key] ? 'bg-emerald-500' : 'bg-gray-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${state[f.key] ? 'translate-x-5' : ''}`}/>
            </button>
          </Field>
        ))}
      </Section>

      {/* Change Password */}
      <Section title="Security">
        <ChangePassword />
        <Field label="Sign Out" hint="Log out of your current session">
          <button
            onClick={() => dispatch({ type: 'LOGOUT' })}
            className="bg-red-950 hover:bg-red-900 text-red-400 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            Sign Out
          </button>
        </Field>
      </Section>
    </div>
  );
}

function ChangePassword() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (form.next.length < 6) { setMsg({ ok: false, text: 'New password must be at least 6 characters.' }); return; }
    if (form.next !== form.confirm) { setMsg({ ok: false, text: 'Passwords do not match.' }); return; }
    setLoading(true);
    try {
      // Re-authenticate with current password first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setMsg({ ok: false, text: 'Not authenticated. Please log in again.' }); return; }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: form.current,
      });
      if (signInErr) { setMsg({ ok: false, text: 'Current password is incorrect.' }); return; }

      const { error } = await supabase.auth.updateUser({ password: form.next });
      if (error) { setMsg({ ok: false, text: error.message }); return; }
      setMsg({ ok: true, text: 'Password updated successfully.' });
      setForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setMsg({ ok: false, text: 'Failed to update password.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white text-sm font-medium">Change Password</p>
          <p className="text-gray-500 text-xs mt-0.5">Update your account password</p>
        </div>
        <button onClick={() => { setShow(v => !v); setMsg(null); }}
          className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">
          {show ? 'Cancel' : 'Change'}
        </button>
      </div>
      {show && (
        <form onSubmit={submit} className="space-y-3 pt-1">
          {msg && (
            <div className={`text-xs px-3 py-2 rounded-lg border ${msg.ok ? 'bg-emerald-950 border-emerald-800 text-emerald-300' : 'bg-red-950 border-red-800 text-red-300'}`}>
              {msg.text}
            </div>
          )}
          {[
            { key: 'current', label: 'Current Password', auto: 'current-password' },
            { key: 'next',    label: 'New Password',     auto: 'new-password' },
            { key: 'confirm', label: 'Confirm New',      auto: 'new-password' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-gray-400 text-xs font-medium block mb-1">{f.label}</label>
              <input
                type="password" autoComplete={f.auto} required
                value={form[f.key]}
                onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))}
                placeholder="••••••••"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          ))}
          <button type="submit" disabled={loading || !form.current || !form.next || !form.confirm}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors flex items-center gap-2">
            {loading ? (
              <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Updating…</>
            ) : 'Update Password'}
          </button>
        </form>
      )}
    </div>
  );
}
