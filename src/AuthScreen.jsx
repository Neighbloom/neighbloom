// Auth UI for Neighbloom Milestone 1.
// Signup, login, password reset, and recovery screens matching the
// existing design.

import { useState } from 'react';
import { useAuth } from './auth.jsx';

const SCREEN_STYLE = {
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'linear-gradient(180deg, #0B1220 0%, #050A14 100%)',
  color: '#fff',
};

export function AuthScreen() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot' | 'forgot-sent'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { signUp, signIn, resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (!displayName.trim()) throw new Error('Please enter a display name');
        await signUp(email.trim(), password, displayName.trim());
      } else if (mode === 'forgot') {
        await resetPassword(email.trim());
        setMode('forgot-sent');
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nb-auth-screen" style={SCREEN_STYLE}>
      <div style={{ fontSize: 44, marginBottom: 10 }} aria-hidden="true">🌼</div>
      <h1 style={{ fontSize: 34, fontWeight: 950, letterSpacing: '-0.02em', marginBottom: 8 }}>Neighbloom</h1>
      <div style={{ width: 56, height: 4, borderRadius: 999, background: 'linear-gradient(90deg, #FF6A3D, #FF915A)', marginBottom: 16 }} />
      <p style={{ fontWeight: 800, marginBottom: 6, textAlign: 'center' }}>Little missions, big city.</p>
      <p style={{ opacity: 0.72, marginBottom: 28, textAlign: 'center', maxWidth: 320, lineHeight: 1.45 }}>
        Ask a neighbor for a hand — or lend yours. Small help, real people, your town.
      </p>

      {mode === 'forgot-sent' ? (
        <div style={{ width: '100%', maxWidth: 320, textAlign: 'center' }}>
          <p style={{ marginBottom: 16 }}>
            If that email has a Neighbloom account, a password reset link is on its way.
          </p>
          <p style={{ opacity: 0.7, marginBottom: 24 }}>
            The link signs you in and lets you choose a new password.
          </p>
          <button
            type="button"
            className="nb-btn nb-btn-primary"
            style={{ width: '100%' }}
            onClick={() => { setMode('signin'); setError(''); }}
          >
            Back to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 320 }}>
          {mode === 'signup' && (
            <p style={{ opacity: 0.72, marginBottom: 12, textAlign: 'center', fontSize: 13, lineHeight: 1.45 }}>
              Create your account — we'll ask which town is home right after.
            </p>
          )}
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Your name — what neighbors will call you"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="nb-input"
              style={{ width: '100%', marginBottom: 12 }}
              autoComplete="name"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="nb-input"
            style={{ width: '100%', marginBottom: 12 }}
            required
            autoComplete="email"
          />
          {mode !== 'forgot' && (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="nb-input"
              style={{ width: '100%', marginBottom: 16 }}
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          )}
          {error && (
            <div className="nb-error" style={{ marginBottom: 12 }}>{error}</div>
          )}
          <button
            type="submit"
            className="nb-btn nb-btn-primary"
            style={{ width: '100%', marginBottom: 12 }}
            disabled={busy}
          >
            {busy ? 'Please wait...' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Email me a reset link' : 'Sign in'}
          </button>
          {mode === 'signin' && (
            <button
              type="button"
              className="nb-btn nb-btn-ghost"
              style={{ width: '100%', marginBottom: 12 }}
              onClick={() => { setMode('forgot'); setError(''); }}
            >
              Forgot password?
            </button>
          )}
          <button
            type="button"
            className="nb-btn nb-btn-ghost"
            style={{ width: '100%' }}
            onClick={() => { setMode(mode === 'signup' ? 'signin' : mode === 'forgot' ? 'signin' : 'signup'); setError(''); }}
          >
            {mode === 'signup' ? 'Already have an account? Sign in' : mode === 'forgot' ? 'Back to sign in' : "Don't have an account? Sign up"}
          </button>
        </form>
      )}

      <p style={{ opacity: 0.55, marginTop: 28, fontSize: 13, textAlign: 'center' }}>
        Now growing in Worth, Illinois — one town, real neighbors.
      </p>
    </div>
  );
}

// Landing screen for the password-reset email link. The link creates
// a recovery session (auth.jsx flags it); submitting here sets the
// new password and drops the user into the app, signed in.
export function PasswordResetScreen() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { completePasswordReset, cancelRecovery } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await completePasswordReset(password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nb-auth-screen" style={SCREEN_STYLE}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔑</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Choose a new password</h1>
      <p style={{ opacity: 0.7, marginBottom: 32, textAlign: 'center' }}>
        You followed a reset link — set a new password to continue.
      </p>

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 320 }}>
        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="nb-input"
          style={{ width: '100%', marginBottom: 12 }}
          required
          minLength={6}
          autoComplete="new-password"
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="nb-input"
          style={{ width: '100%', marginBottom: 16 }}
          required
          minLength={6}
          autoComplete="new-password"
        />
        {error && (
          <div className="nb-error" style={{ marginBottom: 12 }}>{error}</div>
        )}
        <button
          type="submit"
          className="nb-btn nb-btn-primary"
          style={{ width: '100%', marginBottom: 12 }}
          disabled={busy}
        >
          {busy ? 'Please wait...' : 'Set new password'}
        </button>
        <button
          type="button"
          className="nb-btn nb-btn-ghost"
          style={{ width: '100%' }}
          onClick={() => { cancelRecovery(); }}
        >
          Cancel and sign out
        </button>
      </form>
    </div>
  );
}
