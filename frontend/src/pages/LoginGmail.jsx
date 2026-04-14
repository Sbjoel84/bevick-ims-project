import { useState, useEffect } from 'react';
import { useApp, genId } from '../context/AppContext';
import { supabase } from '../lib/supabase';

const ROLES = [
  { id: 'inventory', label: 'Inventory Manager' },
  { id: 'sales', label: 'Sales Officer' },
];
const BRANCHES = [
  { id: 'DUB', label: 'Dubai Market' },
  { id: 'KUB', label: 'Kubwa Office' },
];

function Alert({ type, children }) {
  const styles = {
    error: 'bg-red-950 border-red-800 text-red-300',
    success: 'bg-blue-950 border-blue-800 text-blue-300',
    warn: 'bg-amber-950 border-amber-800 text-amber-300',
  };
  return (
    <div className={`flex items-start gap-2 border text-sm rounded-lg px-3 py-2.5 mb-4 ${styles[type]}`}>
      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function LoginGmail() {
  const { state, dispatch } = useApp();
  const { users, pendingUsers } = state;

  const [view, setView] = useState('login'); // 'login' | 'profile-complete' | 'pending'
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pendingAuth, setPendingAuth] = useState(null); // { email, name, picture }
  const [profileForm, setProfileForm] = useState({
    phone: '',
    role: 'sales',
    bid: 'KUB',
  });

  // Check for OAuth callback on mount
  useEffect(() => {
    const handleOAuthCallback = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user && !state.user?.id) {
          const authUser = session.user;
          const email = authUser.email?.toLowerCase();
          const name = authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || '';
          const picture = authUser.user_metadata?.avatar_url || '';

          // Check if user already exists
          const existingUser = users.find(u => u.em?.toLowerCase() === email);
          
          if (existingUser) {
            if (existingUser.status === 'pending') {
              setView('pending');
              setMsg({ type: 'warn', text: 'Your account is awaiting admin approval.' });
              await supabase.auth.signOut();
            } else if (existingUser.status === 'active') {
              // Auto-login
              dispatch({ type: 'LOGIN', payload: existingUser });
            } else if (existingUser.status === 'inactive') {
              setMsg({ type: 'error', text: 'Your account has been deactivated. Contact admin.' });
              await supabase.auth.signOut();
            }
          } else if (pendingUsers.find(u => u.em?.toLowerCase() === email)) {
            setView('pending');
            setMsg({ type: 'warn', text: 'Your account is awaiting admin approval.' });
            await supabase.auth.signOut();
          } else {
            // New user - show profile completion
            setPendingAuth({ email, name, picture });
            setView('profile-complete');
          }
        }
      } catch (err) {
        console.error('OAuth callback error:', err);
      }
    };

    handleOAuthCallback();
  }, [users, pendingUsers, state.user?.id, dispatch]);

  // ── Handle Google Sign-In ──
  async function handleGoogleSignIn(e) {
    e?.preventDefault?.();
    setMsg(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${window.location.pathname}`,
        },
      });
      if (error) {
        setMsg({ type: 'error', text: error.message || 'Failed to sign in with Google' });
        setLoading(false);
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Google sign-in failed' });
      setLoading(false);
    }
  }

  // ── Complete Profile After OAuth ──
  async function handleCompleteProfile(e) {
    e.preventDefault();
    setMsg(null);
    
    if (!pendingAuth?.email) {
      setMsg({ type: 'error', text: 'Missing email. Please sign in again.' });
      return;
    }

    setLoading(true);
    try {
      // Generate initials
      const initials = pendingAuth.name.trim().slice(0, 2).toUpperCase() || pendingAuth.email[0].toUpperCase();

      // Create pending user record
      const newUser = {
        id: genId('U'),
        em: pendingAuth.email,
        name: pendingAuth.name,
        phone: profileForm.phone,
        role: profileForm.role,
        bid: profileForm.bid,
        initials,
        picture: pendingAuth.picture,
        status: 'pending',
        registeredAt: new Date().toISOString(),
      };

      // Save to Supabase pending_users
      const { error } = await supabase.from('pending_users').insert([{
        data: newUser,
      }]);

      if (error) {
        if (error.message.includes('duplicate')) {
          setMsg({ type: 'error', text: 'This email is already registered.' });
        } else {
          setMsg({ type: 'error', text: error.message });
        }
        setLoading(false);
        return;
      }

      // Dispatch to app context
      dispatch({
        type: 'REGISTER_USER',
        payload: newUser,
      });

      // Sign out and show pending message
      await supabase.auth.signOut();
      setView('pending');
      setPendingAuth(null);
      setProfileForm({ phone: '', role: 'sales', bid: 'KUB' });
      setMsg({
        type: 'success',
        text: 'Account created! Please wait for admin approval before logging in.',
      });
    } catch (err) {
      console.error('Profile completion error:', err);
      setMsg({ type: 'error', text: err.message || 'Failed to complete profile' });
      setLoading(false);
    }
  }

  // ── Forgot Password ──
  async function handleForgot(e) {
    e.preventDefault();
    const email = (e.target.email?.value || '').trim().toLowerCase();
    if (!email) return;

    setMsg(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) {
        setMsg({ type: 'error', text: error.message });
      } else {
        setMsg({ type: 'success', text: 'Password reset email sent. Check your inbox.' });
        e.target.reset();
      }
    } catch (err) {
      setMsg({ type: 'error', text: 'Failed to send reset email' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-block mb-4">
            <img src="/Bevick logo.jpeg" alt="Bevick"
              className="h-24 w-auto rounded-2xl object-contain" />
          </div>
          <p className="text-gray-400 text-sm mt-2">Inventory Management System</p>
        </div>

        {/* ── LOGIN VIEW ── */}
        {view === 'login' && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="font-syne text-lg font-semibold text-white mb-1">Welcome Back</h2>
            <p className="text-gray-500 text-sm mb-6">Sign in with your Google account</p>

            {msg && <Alert type={msg.type}>{msg.text}</Alert>}

            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full bg-white hover:bg-gray-100 disabled:bg-gray-400 text-gray-900 font-semibold rounded-lg px-4 py-3 text-sm transition-colors flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {loading ? 'Signing in...' : 'Sign in with Google'}
            </button>

            <div className="mt-4 pt-4 border-t border-gray-800 text-center">
              <p className="text-gray-500 text-xs">
                Don't have an account? Sign in with Google to create one.
              </p>
            </div>
          </div>
        )}

        {/* ── PROFILE COMPLETION VIEW ── */}
        {view === 'profile-complete' && pendingAuth && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="font-syne text-lg font-semibold text-white mb-1">Complete Your Profile</h2>
            <p className="text-gray-500 text-sm mb-6">Tell us a bit about yourself</p>

            {msg && <Alert type={msg.type}>{msg.text}</Alert>}

            {(!msg || msg.type !== 'success') && (
              <form onSubmit={handleCompleteProfile} className="space-y-4">
                <div className="text-center pb-4 border-b border-gray-800">
                  {pendingAuth.picture && (
                    <img src={pendingAuth.picture} alt={pendingAuth.name}
                      className="w-12 h-12 rounded-full mx-auto mb-2 object-cover" />
                  )}
                  <div className="text-white font-medium">{pendingAuth.name}</div>
                  <div className="text-gray-500 text-xs">{pendingAuth.email}</div>
                </div>

                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">Phone</label>
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+234 800 000 0000"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-400 text-xs font-medium mb-1.5">Role</label>
                    <select
                      value={profileForm.role}
                      onChange={e => setProfileForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {ROLES.map(r => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs font-medium mb-1.5">Branch</label>
                    <select
                      value={profileForm.bid}
                      onChange={e => setProfileForm(f => ({ ...f, bid: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {BRANCHES.map(b => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !profileForm.role || !profileForm.bid}
                  className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-gray-700 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Spinner />
                      Creating account…
                    </>
                  ) : (
                    'Create Account'
                  )}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── PENDING APPROVAL VIEW ── */}
        {view === 'pending' && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="font-syne text-lg font-semibold text-white mb-2">Account Pending</h2>
              <p className="text-gray-500 text-sm mb-6">
                Your account is awaiting admin approval. You'll be able to log in once approved.
              </p>

              {msg && <Alert type={msg.type}>{msg.text}</Alert>}

              <button
                onClick={() => setView('login')}
                className="text-sm text-blue-500 hover:text-blue-400 font-medium transition-colors"
              >
                Return to sign in
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
