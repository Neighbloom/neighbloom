// Supabase Auth integration for Neighbloom Milestone 1.
// Provides signup, login, logout, and session management.
// Falls back gracefully when Supabase is not configured (demo mode).

import { useState, useEffect, createContext, useContext } from 'react';
import { supabase, isSupabaseConfigured } from './supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false); // PASSWORD_RECOVERY landing

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') setRecovery(true);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    try {
      // Use visible_profiles view (DB-enforces intro_visible privacy).
      // Owner sees their own intro via auth.uid() = id in the view.
      const { data, error } = await supabase
        .from('visible_profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      setProfile(data);
    } catch (e) {
      console.error('[Auth] Failed to fetch profile:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email, password, displayName) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } }
    });
    if (error) throw error;
    return data;
  };

  const signIn = async (email, password) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setProfile(null);
  };

  const resetPassword = async (email) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) throw error;
  };

  const completePasswordReset = async (newPassword) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setRecovery(false);
  };

  const cancelRecovery = async () => {
    // A recovery landing holds a live session; backing out must not
    // leave the user silently signed in on someone else's device.
    setRecovery(false);
    await signOut();
  };

  const updateProfile = async (updates) => {
    if (!user) throw new Error('Not authenticated');
    // Only allow user-editable fields (np, id, created_at are protected)
    const allowed = ['display_name', 'handle', 'town', 'avatar_url'];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k))
    );
    const { data, error } = await supabase
      .from('profiles')
      .update(filtered)
      .eq('id', user.id)
      .select()
      .single();
    if (error) throw error;
    setProfile(data);
    return data;
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      isConfigured: isSupabaseConfigured(),
      isAuthenticated: !!user,
      recovery,
      signUp,
      signIn,
      signOut,
      resetPassword,
      completePasswordReset,
      cancelRecovery,
      updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
