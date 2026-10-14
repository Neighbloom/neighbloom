# Neighbloom Security Backlog — Launch-Critical

## BLOCKING-001: RLS Enforcement of User Blocking [LAUNCH-CRITICAL]

**Status:** Documented, not implemented. Must resolve before public launch.

**Current state:**
- `blocks` table exists with RLS (users can block/unblock)
- `is_blocked(user_a, user_b)` function exists
- **NOT enforced in any RLS policy** — blocked users can still:
  - See blocker's posts in feed (`posts_select_all` = USING(true))
  - Reply to blocker's posts
  - Send messages (if conversation exists)
  - View blocker's profile

**Proposed behavior (for founder approval):**

When User A blocks User B:

1. **Posts:** User B cannot see User A's posts in feed or via direct query
   - Implementation: Modify `posts_select_all` to exclude posts from users who blocked the viewer
   - Privacy note: This reveals the block (B notices A's posts disappeared). Alternative: show posts but disable interaction (softer, doesn't confirm block).

2. **Replies:** User B cannot reply to User A's posts
   - Implementation: Add check to `replies_insert` policy using `is_blocked()`

3. **Messages:** User B cannot initiate new conversations with User A
   - Implementation: Add check to `create_conversation()` function
   - Existing conversations: freeze (no new messages) or allow? Recommend: freeze.

4. **Profile:** User B sees limited profile (name/avatar only, no intro)

**Recommendation:** Option 1 (hard block, hide content). It's clearer, safer, and standard for safety features. The "reveal" concern is outweighed by the safety benefit — if someone blocks, they want distance, not subtlety.

**Estimated work:** 1 migration (policy updates) + client UI updates for blocked states.

---

## Other backlog items

- **NOTIF-001:** Web Push VAPID keys not configured; no push worker. Notifications queue but don't deliver.
- **GRAT-001:** Gratitude UI not yet built (backend ready).
- **CELEB-001:** Celebration experience not yet built.
