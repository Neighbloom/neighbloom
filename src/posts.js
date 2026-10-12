// Supabase posts data layer for Neighbloom Milestone 1.
// Handles CRUD operations for posts with RLS enforcement.

import { supabase, isSupabaseConfigured } from './supabase.js';

/**
 * Fetch all posts from Supabase, ordered by creation date (newest first).
 * Public read — works for anon and authenticated users.
 */
export async function fetchPosts({ kind = null, limit = 50 } = {}) {
  if (!isSupabaseConfigured()) return [];
  
  let query = supabase
    .from('posts')
    .select(`
      *,
      owner:profiles!posts_owner_id_fkey (
        id,
        display_name,
        handle,
        avatar_url,
        town
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (kind) {
    query = query.eq('kind', kind);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Create a new post. owner_id is set from the authenticated user.
 * System fields (stage, status, helpers) are forced to defaults by DB trigger.
 */
export async function createPost({ kind, title, details, area, category, prefTags, helpersNeeded }) {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be authenticated to create posts');
  
  const { data, error } = await supabase
    .from('posts')
    .insert({
      owner_id: user.id,
      kind,
      title,
      details: details || null,
      area: area || null,
      category: category || null,
      pref_tags: prefTags || null,
      helpers_needed: helpersNeeded || 1,
      // stage, status, helpers forced by DB trigger — do not set here
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * Update a post. Only the owner can update (enforced by RLS).
 * System fields are blocked by DB trigger.
 */
export async function updatePost(postId, updates) {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  
  // Only allow user-editable fields
  const allowed = ['title', 'details', 'area', 'category', 'pref_tags', 'helpers_needed'];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k))
  );
  
  const { data, error } = await supabase
    .from('posts')
    .update(filtered)
    .eq('id', postId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

/**
 * Delete a post. Only the owner can delete (enforced by RLS).
 */
export async function deletePost(postId) {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId);
  
  if (error) throw error;
}

/**
 * Fetch replies for a post.
 */
export async function fetchReplies(postId) {
  if (!isSupabaseConfigured()) return [];
  
  const { data, error } = await supabase
    .from('replies')
    .select(`
      *,
      author:profiles!replies_author_id_fkey (
        id,
        display_name,
        avatar_url
      )
    `)
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  
  if (error) throw error;
  return data || [];
}

/**
 * Create a reply. author_id is set from the authenticated user.
 */
export async function createReply({ postId, body, kind = 'suggestion' }) {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be authenticated to reply');
  
  const { data, error } = await supabase
    .from('replies')
    .insert({
      post_id: postId,
      author_id: user.id,
      body,
      kind,
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}
