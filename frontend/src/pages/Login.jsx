import { useState } from 'react';
import { useApp, genId } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { DEMO_USERS } from '../data/users';

const ROLES = [
  { id: 'inventory', label: 'Inventory Manager' },
  { id: 'sales',     label: 'Sales Officer' },
];
const BRANCHES = [
  { id: 'DUB', label: 'Dubai Market' },
  { id: 'KUB', label: 'Kubwa Office' },
];

function EyeIcon({ open }) {
  return open ? (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
    </svg>
  );
}

function Alert({ type, children }) {
  const styles = {
    error:   'bg-red-950 border-red-800 text-red-300',
    success: 'bg-blue-950 border-blue-800 text-blue-300',
    warn:    'bg-amber-950 border-amber-800 text-amber-300',
  };
  return (
    <div className={`flex items-start gap-2 border text-sm rounded-lg px-3 py-2.5 mb-4 ${styles[type]}`}>
      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
      </svg>
      <span>{children}</span>
    </div>
  );
}

export default function Login() {
  const { state, dispatch } = useApp();
  const { users, pendingUsers } = state;

  // True when the database has no approved users and no pending users yet.
  // The very first person to register becomes the super_admin automatically.
  const isFirstUser = state.dbLoaded && users.length === 0 && pendingUsers.length === 0;

  // If AppContext detected a PASSWORD_RECOVERY event, jump straight to that view.
  const [view, setView] = useState(state.recoveryMode ? 'reset' : 'login'); // 'login' | 'register' | 'forgot' | 'reset'
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null); // { type, text }
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  // Login form
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });

  // Register form
  const [regForm, setRegForm] = useState({
    name: '', email: '', password: '', confirm: '',
    role: 'sales', bid: 'KUB', phone: '',
  });

  // Forgot form
  const [forgotEmail, setForgotEmail] = useState('');

  // Reset form (password recovery via email link)
  const [resetForm, setResetForm] = useState({ password: '', confirm: '' });
  const [showReset1, setShowReset1] = useState(false);
  const [showReset2, setShowReset2] = useState(false);

  // Keep view in sync if AppContext flips recoveryMode after component mounts
  // (e.g. user lands on the app via the reset link while Login is already rendered)
  useState(() => {
    if (state.recoveryMode) setView('reset');
  });

  // ── Set New Password (recovery) ───────────────────────────────────────────────
  async function handleResetPassword(e) {
    e.preventDefault();
    setMsg(null);
    if (resetForm.password !== resetForm.confirm) {
      setMsg({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    if (resetForm.password.length < 6) {
      setMsg({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: resetForm.password });
      if (error) {
        setMsg({ type: 'error', text: error.message });
        return;
      }
      // Done — sign out the recovery session, return to login
      await supabase.auth.signOut();
      dispatch({ type: 'EXIT_RECOVERY' });
      setView('login');
      setMsg({ type: 'success', text: 'Password updated! You can now sign in with your new password.' });
      setResetForm({ password: '', confirm: '' });
    } catch (err) {
      setMsg({ type: 'error', text: 'Failed to update password. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  // ── Login ────────────────────────────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const email = loginForm.email.trim().toLowerCase();
      const password = loginForm.password;

      // ── 1. Check app_users with a stored password (admin-created accounts) ──
      // Admin can create users via the Admin Panel with a plaintext pw field.
      // These users have no Supabase Auth account, so we match directly.
      const directUser = users.find(u => u.em?.toLowerCase() === email && u.pw && u.pw === password);
      if (directUser) {
        if (directUser.status === 'inactive') {
          setMsg({ type: 'error', text: 'Your account has been deactivated. Contact admin.' });
          return;
        }
        if (directUser.status === 'pending') {
          setMsg({ type: 'warn', text: 'Your account is awaiting admin approval.' });
          return;
        }
        dispatch({ type: 'LOGIN', payload: directUser });
        return;
      }

      // ── 2. Check DEMO_USERS (development / hardcoded test accounts) ────────
      const demoUser = DEMO_USERS.find(u => u.em?.toLowerCase() === email);
      if (demoUser && demoUser.pw === password) {
        const appUser = users.find(u => u.em?.toLowerCase() === email) || demoUser;
        if (appUser.status === 'inactive') {
          setMsg({ type: 'error', text: 'Your account has been deactivated. Contact admin.' });
          return;
        }
        if (appUser.status === 'active') {
          dispatch({ type: 'LOGIN', payload: appUser });
          return;
        }
      }

      // ── 3. Supabase Auth (email/password registered via sign-up form) ──────
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) {
        setMsg({ type: 'error', text: authErr.message === 'Invalid login credentials'
          ? 'Incorrect email or password.'
          : authErr.message });
        return;
      }

      const appUser = users.find(u => u.em?.toLowerCase() === email)
        || DEMO_USERS.find(u => u.em?.toLowerCase() === email);
      const isPending = pendingUsers.find(u => u.em?.toLowerCase() === email);

      if (!appUser && !isPending) {
        await supabase.auth.signOut();
        setMsg({ type: 'error', text: 'No account found for this email. Please register.' });
        return;
      }
      if (isPending) {
        await supabase.auth.signOut();
        setMsg({ type: 'warn', text: 'Your account is awaiting admin approval. You will be able to log in once approved.' });
        return;
      }
      if (appUser.status === 'inactive') {
        await supabase.auth.signOut();
        setMsg({ type: 'error', text: 'Your account has been deactivated. Contact admin.' });
        return;
      }

      dispatch({ type: 'LOGIN', payload: appUser });
    } catch (err) {
      setMsg({ type: 'error', text: 'An unexpected error occurred. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  // ── Register ─────────────────────────────────────────────────────────────────
  async function handleRegister(e) {
    e.preventDefault();
    setMsg(null);

    if (regForm.password !== regForm.confirm) {
      setMsg({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    if (regForm.password.length < 6) {
      setMsg({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }

    const email = regForm.email.trim().toLowerCase();

    // Check not already registered
    if (users.find(u => u.em?.toLowerCase() === email) || pendingUsers.find(u => u.em?.toLowerCase() === email)) {
      setMsg({ type: 'error', text: 'An account with this email already exists.' });
      return;
    }

    setLoading(true);
    try {
      // Create Supabase Auth account
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password: regForm.password,
        options: { emailRedirectTo: window.location.origin },
      });

      if (authErr) {
        setMsg({ type: 'error', text: authErr.message });
        return;
      }

      // Insert into profiles table using the Supabase Auth UUID.
      // data.user is null when email confirmation is required — skip silently in that case.
      if (authData?.user?.id) {
        const { error: profileErr } = await supabase.from('profiles').insert({
          id: authData.user.id,
          email,
        });
        if (profileErr && profileErr.code !== '23505') {
          // 23505 = unique_violation (user already exists) — safe to ignore on retry
          console.error('[signup] profiles insert:', profileErr.message);
        }
      }

      if (isFirstUser) {
        // ── First user → auto-approved super_admin ──────────────
        // No sign-out: let them straight into the app.
        const newAdmin = {
          id: genId('U'),
          em: email,
          name: regForm.name.trim(),
          role: 'super_admin',
          bid: null,
          phone: regForm.phone.trim(),
          initials: regForm.name.trim().slice(0, 2).toUpperCase(),
          status: 'active',
          registeredAt: new Date().toISOString(),
        };
        dispatch({ type: 'ADD_USER',  payload: newAdmin });
        dispatch({ type: 'LOGIN',     payload: newAdmin });
        // Redirect happens automatically via LOGIN dispatch → page: 'dashboard'
      } else {
        // ── Subsequent users → pending admin approval ───────────
        await supabase.auth.signOut();

        dispatch({
          type: 'REGISTER_USER',
          payload: {
            id: genId('U'),
            em: email,
            name: regForm.name.trim(),
            role: regForm.role,
            bid: regForm.bid,
            phone: regForm.phone.trim(),
            initials: regForm.name.trim().slice(0, 2).toUpperCase(),
            status: 'pending',
            registeredAt: new Date().toISOString(),
          },
        });

        setMsg({
          type: 'success',
          text: 'Account request submitted! An admin will review and approve your account before you can log in.',
        });
        setRegForm({ name: '', email: '', password: '', confirm: '', role: 'sales', bid: 'KUB', phone: '' });
      }
    } catch (err) {
      setMsg({ type: 'error', text: 'Registration failed. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  // ── Forgot Password ──────────────────────────────────────────────────────────
  async function handleForgot(e) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        forgotEmail.trim().toLowerCase(),
        { redirectTo: window.location.origin }
      );
      if (error) {
        setMsg({ type: 'error', text: error.message });
      } else {
        setMsg({ type: 'success', text: 'Password reset email sent. Check your inbox and follow the link to set a new password.' });
        setForgotEmail('');
      }
    } catch (err) {
      setMsg({ type: 'error', text: 'Failed to send reset email. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  function switchView(v) {
    setView(v);
    setMsg(null);
    setShowPw(false);
    setShowPw2(false);
  }

  const Spinner = () => (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-block mb-4">
            <img src="/Bevick logo.jpeg" alt="Bevick Packaging Machineries"
              className="h-24 w-auto rounded-2xl object-contain"/>
          </div>
          <p className="text-gray-400 text-sm mt-1">Inventory Management System</p>
        </div>

        {/* ── LOGIN VIEW ── */}
        {view === 'login' && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="font-syne text-lg font-semibold text-white mb-1">Sign in to your account</h2>
            <p className="text-gray-500 text-sm mb-6">Enter your credentials to continue</p>

            {msg && <Alert type={msg.type}>{msg.text}</Alert>}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Email address</label>
                <input
                  type="email" required autoComplete="email"
                  value={loginForm.email}
                  onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-gray-400 text-xs font-medium">Password</label>
                  <button type="button" onClick={() => switchView('forgot')}
                    className="text-xs text-blue-500 hover:text-blue-400 transition-colors">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'} required autoComplete="current-password"
                    value={loginForm.password}
                    onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    <EyeIcon open={showPw}/>
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-blue-800 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors flex items-center justify-center gap-2">
                {loading ? <><Spinner/> Signing in…</> : 'Sign in'}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-gray-800 text-center">
              <p className="text-gray-500 text-sm">
                Don't have an account?{' '}
                <button onClick={() => switchView('register')}
                  className="text-blue-500 hover:text-blue-400 font-medium transition-colors">
                  Create account
                </button>
              </p>
            </div>
          </div>
        )}

        {/* ── REGISTER VIEW ── */}
        {view === 'register' && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            {isFirstUser ? (
              <>
                <h2 className="font-syne text-lg font-semibold text-white mb-1">Set up your admin account</h2>
                <div className="flex items-start gap-2 bg-emerald-950 border border-emerald-800 text-emerald-300 text-xs rounded-lg px-3 py-2.5 mb-5">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                  </svg>
                  <span>No users exist yet. You will be the <strong>Super Admin</strong> and can log in immediately to approve other users.</span>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-syne text-lg font-semibold text-white mb-1">Create an account</h2>
                <p className="text-gray-500 text-sm mb-6">Your account will require admin approval before you can log in.</p>
              </>
            )}

            {msg && <Alert type={msg.type}>{msg.text}</Alert>}

            {!msg || msg.type !== 'success' ? (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Full Name <span className="text-red-400">*</span></label>
                  <input type="text" required
                    value={regForm.name}
                    onChange={e => setRegForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Your full name"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Email address <span className="text-red-400">*</span></label>
                  <input type="email" required autoComplete="email"
                    value={regForm.email}
                    onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="you@example.com"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Phone</label>
                  <input type="tel"
                    value={regForm.phone}
                    onChange={e => setRegForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+234 800 000 0000"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {!isFirstUser && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-400 text-xs font-medium mb-1.5">Role</label>
                      <select value={regForm.role} onChange={e => setRegForm(f => ({ ...f, role: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-400 text-xs font-medium mb-1.5">Branch</label>
                      <select value={regForm.bid} onChange={e => setRegForm(f => ({ ...f, bid: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Password <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} required autoComplete="new-password"
                      value={regForm.password}
                      onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Min. 6 characters"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      <EyeIcon open={showPw}/>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Confirm Password <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <input type={showPw2 ? 'text' : 'password'} required autoComplete="new-password"
                      value={regForm.confirm}
                      onChange={e => setRegForm(f => ({ ...f, confirm: e.target.value }))}
                      placeholder="Re-enter password"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                    />
                    <button type="button" onClick={() => setShowPw2(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      <EyeIcon open={showPw2}/>
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading || !regForm.name || !regForm.email || !regForm.password || !regForm.confirm}
                  className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors flex items-center justify-center gap-2">
                  {loading
                    ? <><Spinner/> {isFirstUser ? 'Setting up…' : 'Creating account…'}</>
                    : isFirstUser ? 'Create Admin Account' : 'Create Account'}
                </button>
              </form>
            ) : null}

            <div className="mt-4 pt-4 border-t border-gray-800 text-center">
              <button onClick={() => switchView('login')}
                className="text-sm text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5 mx-auto">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
                Back to sign in
              </button>
            </div>
          </div>
        )}

        {/* ── FORGOT PASSWORD VIEW ── */}
        {view === 'forgot' && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="font-syne text-lg font-semibold text-white mb-1">Reset password</h2>
            <p className="text-gray-500 text-sm mb-6">Enter your email and we'll send you a link to reset your password.</p>

            {msg && <Alert type={msg.type}>{msg.text}</Alert>}

            {!msg || msg.type !== 'success' ? (
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Email address</label>
                  <input type="email" required autoComplete="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button type="submit" disabled={loading || !forgotEmail.trim()}
                  className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors flex items-center justify-center gap-2">
                  {loading ? <><Spinner/> Sending…</> : 'Send Reset Link'}
                </button>
              </form>
            ) : null}

            <div className="mt-4 pt-4 border-t border-gray-800 text-center">
              <button onClick={() => switchView('login')}
                className="text-sm text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5 mx-auto">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
                Back to sign in
              </button>
            </div>
          </div>
        )}
        {/* ── SET NEW PASSWORD VIEW (after clicking email reset link) ── */}
        {view === 'reset' && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="font-syne text-lg font-semibold text-white mb-1">Set new password</h2>
            <p className="text-gray-500 text-sm mb-6">Choose a new password for your account.</p>

            {msg && <Alert type={msg.type}>{msg.text}</Alert>}

            {!msg || msg.type !== 'success' ? (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">New Password <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <input type={showReset1 ? 'text' : 'password'} required autoComplete="new-password"
                      value={resetForm.password}
                      onChange={e => setResetForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Min. 6 characters"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                    />
                    <button type="button" onClick={() => setShowReset1(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      <EyeIcon open={showReset1}/>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Confirm Password <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <input type={showReset2 ? 'text' : 'password'} required autoComplete="new-password"
                      value={resetForm.confirm}
                      onChange={e => setResetForm(f => ({ ...f, confirm: e.target.value }))}
                      placeholder="Re-enter new password"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                    />
                    <button type="button" onClick={() => setShowReset2(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      <EyeIcon open={showReset2}/>
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading || !resetForm.password || !resetForm.confirm}
                  className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors flex items-center justify-center gap-2">
                  {loading ? <><Spinner/> Updating password…</> : 'Set New Password'}
                </button>
              </form>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
