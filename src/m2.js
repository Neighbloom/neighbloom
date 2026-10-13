// Milestone 2: Client-side data layer for lifecycle, messaging, and NP.
// All operations go through SECURITY DEFINER RPCs that enforce authorization
// server-side. The client never directly modifies system fields.

import { supabase as sb } from './supabase.js';

function getSupabase() {
  if (!sb) throw new Error('Supabase not configured');
  return sb;
}

// ─── Lifecycle ───────────────────────────────────────────────

/**
 * Transition a post to a new lifecycle stage.
 * Only the post owner can call this; the server validates the transition.
 * Valid: open→booked→started→done→confirmed, or →cancelled from any stage.
 */
export async function transitionPost(postId, toStage) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('transition_post', {
    p_post_id: postId,
    p_to_stage: toStage,
  });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Select helpers for a post. Only the owner, only while stage='open',
 * only from users who volunteered, max = helpers_needed.
 */
export async function selectHelpers(postId, helperIds) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('select_helpers', {
    p_post_id: postId,
    p_helper_ids: helperIds,
  });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Get the transition history for a post (audit trail).
 */
export async function fetchTransitions(postId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('post_transitions')
    .select('*, actor:profiles!post_transitions_actor_id_fkey(display_name)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

// ─── Private Messaging ───────────────────────────────────────

/**
 * Get or create a conversation with a selected helper.
 * Only the post owner can call this.
 */
export async function getOrCreateConversation(postId, helperId) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('create_conversation', {
    p_post_id: postId,
    p_helper_id: helperId,
  });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * List all conversations for the current user (as owner or helper).
 */
export async function fetchConversations() {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      post:posts!conversations_post_id_fkey(id, title, kind, stage),
      owner:profiles!conversations_owner_id_fkey(id, display_name, avatar_url),
      helper:profiles!conversations_helper_id_fkey(id, display_name, avatar_url)
    `)
    .or(`owner_id.eq.${user.id},helper_id.eq.${user.id}`)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Fetch messages for a conversation. RLS ensures only participants can read.
 */
export async function fetchMessages(conversationId, limit = 50) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      sender:profiles!messages_sender_id_fkey(id, display_name, avatar_url)
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Send a message. RLS ensures only participants can send.
 */
export async function sendMessage(conversationId, body) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const trimmed = (body || '').trim();
  if (!trimmed) throw new Error('Message cannot be empty');
  if (trimmed.length > 2000) throw new Error('Message too long (max 2000 characters)');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: trimmed,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Subscribe to new messages in a conversation (realtime).
 * Returns an unsubscribe function.
 */
export function subscribeToMessages(conversationId, onMessage) {
  const supabase = getSupabase();
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onMessage(payload.new)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ─── Neighbor Points ─────────────────────────────────────────

/**
 * Award NP. All authorization is server-side.
 * For help_confirmed: awards +20 to a helper, advances post to 'confirmed'.
 * Idempotent via idempotency_key.
 */
export async function awardNP({ profileId, amount, reason, postId = null, idempotencyKey = null }) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('award_np', {
    p_profile_id: profileId,
    p_amount: amount,
    p_reason: reason,
    p_post_id: postId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Confirm help completion and award +20 NP to each selected helper.
 * Only the post owner can call this. Post must be in 'done' stage.
 * Returns array of ledger entries (one per helper).
 */
export async function confirmHelpAndAward(postId, helperIds) {
  const results = [];
  for (const helperId of helperIds) {
    const key = `help_confirmed:${postId}:${helperId}`;
    const entry = await awardNP({
      profileId: helperId,
      amount: 20,
      reason: 'help_confirmed',
      postId,
      idempotencyKey: key,
    });
    results.push(entry);
  }
  return results;
}

/**
 * Daily check-in: +5 NP, once per day. Idempotent via date-based key.
 */
export async function dailyCheckIn() {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return awardNP({
    profileId: user.id,
    amount: 5,
    reason: 'daily_checkin',
    idempotencyKey: `daily_checkin:${user.id}:${today}`,
  });
}

/**
 * Fetch the current user's NP ledger (audit trail).
 */
export async function fetchNPLedger(limit = 50) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('np_ledger')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Get the current user's real NP balance from their profile.
 */
export async function fetchNPBalance() {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .select('np')
    .eq('id', user.id)
    .single();
  if (error) throw new Error(error.message);
  return data?.np || 0;
}

// ─── Reporting & Blocking ────────────────────────────────────

/**
 * File a report against a post, reply, message, or profile.
 * Exactly one target ID must be provided.
 */
export async function fileReport({ postId = null, replyId = null, messageId = null, profileId = null, reason, details = null }) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const validReasons = ['spam', 'harassment', 'inappropriate', 'scam', 'safety', 'other'];
  if (!validReasons.includes(reason)) throw new Error('Invalid report reason');

  const { data, error } = await supabase
    .from('reports')
    .insert({
      reporter_id: user.id,
      reported_post_id: postId,
      reported_reply_id: replyId,
      reported_message_id: messageId,
      reported_profile_id: profileId,
      reason,
      details: details?.slice(0, 500) || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Block a user. Blocked users' content is hidden from the blocker.
 */
export async function blockUser(blockedId) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  if (user.id === blockedId) throw new Error('Cannot block yourself');

  const { error } = await supabase
    .from('blocks')
    .insert({ blocker_id: user.id, blocked_id: blockedId });
  if (error) throw new Error(error.message);
}

/**
 * Unblock a user.
 */
export async function unblockUser(blockedId) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);
  if (error) throw new Error(error.message);
}

/**
 * Get the current user's block list.
 */
export async function fetchBlocks() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id, created_at');
  if (error) throw new Error(error.message);
  return (data || []).map(b => b.blocked_id);
}

// ─── Push Notifications (Web Push) ─────────────────────────────
// Founder-approved: opt-in, granular controls, frequency limits.

/**
 * Check if Web Push is supported in this browser.
 */
export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Get the current notification permission state.
 */
export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default', 'granted', 'denied'
}

/**
 * Request notification permission from the user.
 * Must be called from a user gesture.
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) throw new Error('Notifications not supported');
  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Register for push notifications. Creates a push subscription and
 * saves it to the server. Also enables notification prefs.
 */
export async function enablePushNotifications(vapidPublicKey) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  if (!isPushSupported()) throw new Error('Push not supported in this browser');

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') throw new Error('Notification permission denied');

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidPublicKey,
  });

  const { endpoint, keys } = subscription.toJSON();

  // Save subscription to server.
  const { error: subError } = await supabase
    .from('push_subscriptions')
    .upsert({
      profile_id: user.id,
      endpoint,
      p256dh_key: keys.p256dh,
      auth_key: keys.auth,
      user_agent: navigator.userAgent?.slice(0, 200),
    }, { onConflict: 'profile_id,endpoint' });
  if (subError) throw new Error(subError.message);

  // Enable notification prefs (master switch on, all types on by default).
  const { error: prefError } = await supabase
    .from('notification_prefs')
    .upsert({
      profile_id: user.id,
      enabled: true,
    }, { onConflict: 'profile_id' });
  if (prefError) throw new Error(prefError.message);

  return subscription;
}

/**
 * Disable push notifications. Removes subscriptions and disables prefs.
 */
export async function disablePushNotifications() {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Remove all push subscriptions.
  await supabase.from('push_subscriptions').delete().eq('profile_id', user.id);

  // Disable master switch.
  await supabase.from('notification_prefs')
    .update({ enabled: false })
    .eq('profile_id', user.id);

  // Unsubscribe from browser push manager.
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
  } catch {}
}

/**
 * Get the current user's notification preferences.
 */
export async function fetchNotificationPrefs() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('notification_prefs')
    .select('*')
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data || null;
}

/**
 * Update notification preferences (granular controls).
 */
export async function updateNotificationPrefs(patch) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const allowed = [
    'enabled', 'notify_help_nearby', 'notify_volunteers',
    'notify_messages', 'notify_confirmed', 'notify_digest',
    'quiet_start', 'quiet_end',
  ];
  const filtered = {};
  for (const key of allowed) {
    if (key in patch) filtered[key] = patch[key];
  }

  const { data, error } = await supabase
    .from('notification_prefs')
    .upsert({ profile_id: user.id, ...filtered }, { onConflict: 'profile_id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Fetch pending (unread) in-app notifications.
 */
export async function fetchInAppNotifications(limit = 20) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Mark a notification as read.
 */
export async function markNotificationRead(notificationId) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);
  if (error) throw new Error(error.message);
}

// ─── Public Gratitude ──────────────────────────────────────────

/**
 * Post a public thank-you for a helper. Only the requester, only after confirmed.
 */
export async function postGratitude(postId, helperId, message) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('post_gratitude', {
    p_post_id: postId,
    p_helper_id: helperId,
    p_message: message,
  });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Hide gratitude about you (privacy control for helpers).
 */
export async function hideGratitude(gratitudeId) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('hide_gratitude', {
    p_gratitude_id: gratitudeId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Fetch recent public gratitude posts (for feed / Kindness Moments).
 */
export async function fetchGratitude(limit = 10) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('gratitude_posts')
    .select(`
      *,
      helper:profiles!gratitude_posts_helper_id_fkey(id, display_name, avatar_url),
      thanker:profiles!gratitude_posts_thanker_id_fkey(id, display_name, avatar_url)
    `)
    .eq('hidden_by_helper', false)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Get the verified help count for a profile ("Helped X neighbors").
 */
export async function getHelpCount(profileId) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('get_help_count', {
    p_profile_id: profileId,
  });
  if (error) throw new Error(error.message);
  return data || 0;
}

// ─── Neighbor Intros & Directory (Concepts A+B) ────────────────

/**
 * Update the current user's intro, visibility, and skills.
 */
export async function updateIntro({ intro, introVisible, skills }) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const patch = {};
  if (intro !== undefined) {
    if (intro && intro.length > 200) throw new Error('Intro must be 200 characters or less');
    patch.intro = intro || null;
  }
  if (introVisible !== undefined) patch.intro_visible = !!introVisible;
  if (skills !== undefined) {
    if (skills && skills.length > 10) throw new Error('Maximum 10 skills');
    patch.skills = skills || null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id);
    // Note: No .select() here — intro/skills columns are revoked for direct
    // SELECT. The caller should re-fetch via visible_profiles view if needed.
  if (error) throw new Error(error.message);
  return patch;
}

/**
 * Fetch visible neighbors in the same town (the "Your Neighbors" directory).
 * Uses the DB-enforced get_neighbor_directory() function which respects
 * intro_visible at the database level. Privacy is NOT reliant on client filtering.
 * Ordered by most recently joined. Excludes the current user.
 */
export async function fetchNeighbors(town, limit = 20) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc('get_neighbor_directory', {
    p_town: town || null,
    p_limit: Math.min(limit + 5, 50), // Fetch extra to allow client-side exclusion
  });
  if (error) throw new Error(error.message);

  // Exclude current user client-side (function returns all visible).
  let neighbors = data || [];
  if (user) {
    neighbors = neighbors.filter(n => n.id !== user.id);
  }
  return neighbors.slice(0, limit);
}

/**
 * Get the neighbor count for a town ("You're neighbor #N").
 */
export async function getNeighborCount(town) {
  const supabase = getSupabase();
  let query = supabase
    .from('visible_profiles')
    .select('id', { count: 'exact', head: true });
  if (town) query = query.eq('town', town);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count || 0;
}
