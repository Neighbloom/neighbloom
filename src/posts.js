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
 * Convert a raw Supabase post row (with owner join) to the app's
 * post shape. THE single conversion — every loader in App.jsx uses
 * it, so fields like selectedUserIds can never drift between
 * refresh paths again (the initial-load and create-post paths once
 * shipped without selectedUserIds, silently breaking helper
 * selection state for posts loaded through them).
 */
export function toAppPost(p) {
  return {
    id: p.id,
    kind: p.kind,
    title: p.title,
    details: p.details,
    area: p.area,
    category: p.category,
    prefTags: p.pref_tags,
    helpersNeeded: p.helpers_needed,
    helpers: p.helpers,
    selectedUserIds: Array.isArray(p.helpers) ? p.helpers.map(h => h.id || h) : [],
    stage: p.stage,
    status: p.status,
    createdAt: new Date(p.created_at).getTime(),
    ownerId: p.owner_id,
    ownerName: p.owner?.display_name,
    ownerAvatar: p.owner?.avatar_url,
    _supabase: true,
  };
}

/**
 * Fetch posts and convert them to the app shape in one call.
 */
export async function fetchAppPosts(opts) {
  const data = await fetchPosts(opts);
  const appPosts = data.map(toAppPost);
  // Attach replies (app shape) so volunteers/recommendations are
  // visible and actionable on real posts, not just demo ones.
  try {
    const byPost = await fetchRepliesForPosts(appPosts.map((p) => p.id));
    for (const p of appPosts) p.replies = byPost[p.id] || [];
  } catch (e) {
    console.error('[Supabase] Failed to fetch replies:', e.message);
    for (const p of appPosts) p.replies = [];
  }
  return appPosts;
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
 * Convert a raw replies row (with author join) to the app's reply
 * shape. THE single conversion — the app model speaks `type`,
 * `text`, `authorId`; the table speaks `kind`, `body`,
 * `author_id`. Server replies were historically never converted
 * NOR loaded into post objects at all, which made volunteers
 * invisible on real posts (owners saw "No volunteers yet" while
 * the replies table held real offers, and could not select or
 * book anyone — the helping loop stalled at its first step).
 */
export function toAppReply(r) {
  return {
    id: r.id,
    type: r.kind || 'suggestion',
    authorId: r.author_id,
    authorName: r.author?.display_name || null,
    authorAvatar: r.author?.avatar_url || null,
    text: r.body || '',
    createdAt: r.created_at ? new Date(r.created_at).getTime() : 0,
    hearts: [],
    comments: [],
    helpful: false,
    topPick: false,
    hidden: false,
    // M5 lifecycle: 'active' | 'withdrawn' | 'cancelled'. Rows
    // fetched before the M5 columns exist read as active.
    status: r.status || 'active',
    statusAt: r.status_at ? new Date(r.status_at).getTime() : 0,
    _supabase: true,
  };
}

const REPLY_SELECT = `
  *,
  author:profiles!replies_author_id_fkey (
    id,
    display_name,
    avatar_url
  )
`;

/**
 * Fetch replies for many posts in one query, grouped by post id,
 * in app shape. Returns { [postId]: [appReply, ...] }.
 */
export async function fetchRepliesForPosts(postIds) {
  const ids = (postIds || []).filter(Boolean);
  if (!isSupabaseConfigured() || ids.length === 0) return {};

  const { data, error } = await supabase
    .from('replies')
    .select(REPLY_SELECT)
    .in('post_id', ids)
    .order('created_at', { ascending: true });

  if (error) throw error;
  const byPost = {};
  for (const row of data || []) {
    (byPost[row.post_id] ||= []).push(toAppReply(row));
  }
  return byPost;
}

/**
 * Fetch replies for a post (app shape).
 */
export async function fetchReplies(postId) {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from('replies')
    .select(REPLY_SELECT)
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(toAppReply);
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
