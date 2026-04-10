import { useState } from 'react';
import { useApp, genId } from '../context/AppContext';
import { supabase } from '../lib/supabase';

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
    success: 'bg-emerald-950 border-emerald-800 text-emerald-300',
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

  const [view, setView] = useState('login'); // 'login' | 'register' | 'forgot'
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

  // ── Login ────────────────────────────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const email = loginForm.email.trim().toLowerCase();

      const { error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password: loginForm.password,
      });

      if (authErr) {
        setMsg({ type: 'error', text: authErr.message === 'Invalid login credentials'
          ? 'Incorrect email or password.'
          : authErr.message });
        return;
      }

      // Look up app user by email
      const appUser = users.find(u => u.em?.toLowerCase() === email);
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
      const { error: authErr } = await supabase.auth.signUp({
        email,
        password: regForm.password,
        options: { emailRedirectTo: window.location.origin },
      });

      if (authErr) {
        setMsg({ type: 'error', text: authErr.message });
        return;
      }

      // Always sign out after signUp (pending approval — they shouldn't be in)
      await supabase.auth.signOut();

      // Save to pending_users in app state + Supabase
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
        text: 'Account created! Please check your email to confirm your address, then wait for admin approval before logging in.',
      });
      setRegForm({ name: '', email: '', password: '', confirm: '', role: 'sales', bid: 'KUB', phone: '' });
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
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-gray-400 text-xs font-medium">Password</label>
                  <button type="button" onClick={() => switchView('forgot')}
                    className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'} required autoComplete="current-password"
                    value={loginForm.password}
                    onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-10"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    <EyeIcon open={showPw}/>
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors flex items-center justify-center gap-2">
                {loading ? <><Spinner/> Signing in…</> : 'Sign in'}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-gray-800 text-center">
              <p className="text-gray-500 text-sm">
                Don't have an account?{' '}
                <button onClick={() => switchView('register')}
                  className="text-emerald-500 hover:text-emerald-400 font-medium transition-colors">
                  Create account
                </button>
              </p>
            </div>
          </div>
        )}

        {/* ── REGISTER VIEW ── */}
        {view === 'register' && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="font-syne text-lg font-semibold text-white mb-1">Create an account</h2>
            <p className="text-gray-500 text-sm mb-6">Your account will require admin approval before you can log in.</p>

            {msg && <Alert type={msg.type}>{msg.text}</Alert>}

            {!msg || msg.type !== 'success' ? (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Full Name <span className="text-red-400">*</span></label>
                  <input type="text" required
                    value={regForm.name}
                    onChange={e => setRegForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Your full name"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Email address <span className="text-red-400">*</span></label>
                  <input type="email" required autoComplete="email"
                    value={regForm.email}
                    onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="you@example.com"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Phone</label>
                  <input type="tel"
                    value={regForm.phone}
                    onChange={e => setRegForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+234 800 000 0000"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-400 text-xs font-medium mb-1.5">Role</label>
                    <select value={regForm.role} onChange={e => setRegForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs font-medium mb-1.5">Branch</label>
                    <select value={regForm.bid} onChange={e => setRegForm(f => ({ ...f, bid: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Password <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} required autoComplete="new-password"
                      value={regForm.password}
                      onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Min. 6 characters"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-10"
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
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-10"
                    />
                    <button type="button" onClick={() => setShowPw2(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      <EyeIcon open={showPw2}/>
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading || !regForm.name || !regForm.email || !regForm.password || !regForm.confirm}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors flex items-center justify-center gap-2">
                  {loading ? <><Spinner/> Creating account…</> : 'Create Account'}
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
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button type="submit" disabled={loading || !forgotEmail.trim()}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors flex items-center justify-center gap-2">
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
      </div>
    </div>
  );
}
