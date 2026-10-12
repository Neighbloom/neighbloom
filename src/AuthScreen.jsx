// Auth UI for Neighbloom Milestone 1.
// Signup, login, and logout screens matching the existing design.

import { useState } from 'react';
import { useAuth } from './auth.jsx';

export function AuthScreen() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { signUp, signIn } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (!displayName.trim()) throw new Error('Please enter a display name');
        await signUp(email.trim(), password, displayName.trim());
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
    <div className="nb-auth-screen" style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: '#031628',
      color: '#fff',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🏘️</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Neighbloom</h1>
      <p style={{ opacity: 0.7, marginBottom: 32, textAlign: 'center' }}>
        Your neighborhood help network
      </p>

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 320 }}>
        {mode === 'signup' && (
          <input
            type="text"
            placeholder="Display name"
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
        {error && (
          <div className="nb-error" style={{ marginBottom: 12 }}>{error}</div>
        )}
        <button
          type="submit"
          className="nb-btn nb-btn-primary"
          style={{ width: '100%', marginBottom: 12 }}
          disabled={busy}
        >
          {busy ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
        <button
          type="button"
          className="nb-btn nb-btn-ghost"
          style={{ width: '100%' }}
          onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); }}
        >
          {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </form>
    </div>
  );
}
