import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

const NEIGHBLOOM_LOGO =
  'https://storage.googleapis.com/space-apps-assets/store_MJDeCrFHOB/9kmK0Kexuz-logo.jpg';

  const APP_NAME = 'Neighbloom';
const APP_TAGLINE = 'Little missions, big city.';

const AVATAR =
  'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&w=80';

const BUSINESS_MODE = false; // set true when you're ready for local ads/sponsors

const NOW = () => Date.now();
const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 10)}`;

function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function containsLink(text) {
  return /(https?:\/\/|www\.)/i.test(text || '');
}

function maskPhones(text) {
  if (!text) return '';
  // mask common US phone patterns, keep last4
  return text.replace(
    /(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g,
    (m) => {
      const digits = m.replace(/\D/g, '');
      const last4 = digits.slice(-4);
      return `***-***-${last4}`;
    }
  );
}

function normalizeText(t) {
  return (t || '').trim().replace(/\s+/g, ' ');
}

function buildRecTitle(recCategory, area) {
  const cat = normalizeText(recCategory);
  const loc = normalizeText(area);

  if (cat && loc) return `Need a ${cat} in ${loc}`;
  if (cat) return `Need a ${cat} recommendation`;
  if (loc) return `Recommendation in ${loc}`;
  return 'Recommendation';
}

function effectiveRecPrefTags(post) {
  const tags = Array.isArray(post?.prefTags) ? post.prefTags : [];
  if (tags.length) return tags;
  // legacy fallback (old posts)
  if (post?.preferNeighborOwned) return ['Neighbor-owned'];
  return [];
}

function prettyBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  const units = ['B', 'KB', 'MB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function imageFileToDataUrl(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected.'));
    if (!file.type || !file.type.startsWith('image/')) {
      return reject(new Error('Please choose an image file.'));
    }
    if (file.size > 6 * 1024 * 1024) {
      return reject(new Error('Image too large (max 6MB).'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Couldn’t read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Couldn’t load that image.'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch {
          reject(new Error('Couldn’t process that photo.'));
        }
      };

      img.src = String(reader.result || '');
    };

    reader.readAsDataURL(file);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function compressImageFileToDataUrl(
  file,
  { maxDim = 1600, quality = 0.82, mime = 'image/jpeg' } = {}
) {
  const src = await fileToDataUrl(file);

  const img = new Image();
  img.src = src;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Invalid image'));
  });

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');

  ctx.drawImage(img, 0, 0, cw, ch);

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, mime, quality)
  );
  if (!blob) throw new Error('Compression failed');

  const out = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Failed to read compressed image'));
    r.readAsDataURL(blob);
  });

  return { dataUrl: out, bytes: blob.size };
}

const BADGES = [
  { min: 0, name: '🌱 Seedling' },
  { min: 100, name: '🌿 Sprout' },
  { min: 300, name: '🌸 Blossom' },
  { min: 800, name: '🌳 Oak' },
];

const BADGE_DETAILS = {
  Seedling: 'Getting started. Communicates clearly and respects the rules.',
  Sprout:
    'Dependable follow-through. Confirms details and completes what they commit to.',
  Blossom:
    'High-trust. Frequently chosen because plans stay clear and outcomes match expectations.',
  Oak: 'Proven cornerstone. A long track record of confirmed help—consistent, calm, reliable.',
};

function badgeFor(points) {
  let b = BADGES[0];
  for (const x of BADGES) if (points >= x.min) b = x;
  return b.name;
}

function badgeParts(label) {
  const parts = String(label || '').split(' ');
  return {
    emoji: parts[0] || '🌱',
    name: parts.slice(1).join(' ') || 'Seedling',
  };
}

// -------------------- PERSISTENCE (V1) --------------------
const STORAGE_KEY = 'neighbloom_v1';
const STORAGE_VERSION = 1;
const MAX_SAVED_SEARCHES = 5;

function searchFingerprint({ query, homeChip, homeShowAll }) {
  const q = normalizeText(query).toLowerCase();
  const chip = homeChip || 'all';
  const showAll = homeShowAll ? '1' : '0';
  return `${chip}|${showAll}|${q}`;
}

function defaultSavedSearchName(query) {
  const q = normalizeText(query);
  if (!q) return 'Saved';
  return q.length > 22 ? `${q.slice(0, 22)}…` : q;
}

function safeJsonParse(raw, fallback) {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function loadAppState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const data = safeJsonParse(raw, null);

  if (!data || data.version !== STORAGE_VERSION) return null;

  // Basic shape checks (keep it light, avoid brittle validation)
  if (!Array.isArray(data.posts)) return null;
  if (!Array.isArray(data.activity)) return null;
  if (typeof data.npPointsByUser !== 'object') return null;
  if (typeof data.replyStats !== 'object') return null;
  if (typeof data.chats !== 'object') return null;

  // Optional (newer versions). Keep backwards compatible.
  if ('followsByUser' in data && typeof data.followsByUser !== 'object')
    return null;
  if ('homeFollowOnly' in data && typeof data.homeFollowOnly !== 'boolean')
    return null;

  return data;
}

function saveAppState(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, ...state })
    );
  } catch {
    // ignore quota / private mode errors
  }
}

function resetAppState() {
  localStorage.removeItem(STORAGE_KEY);
}

function mentionsReward(text) {
  const t = (text || '').toLowerCase();
  return (
    t.includes('reward') ||
    t.includes('bounty') ||
    /\$\s*\d+/.test(t) ||
    t.includes('venmo') ||
    t.includes('zelle') ||
    t.includes('paypal') ||
    t.includes('cashapp') ||
    t.includes('cash app')
  );
}

function mentionsIndoor(text) {
  const t = (text || '').toLowerCase();
  const terms = [
    'inside',
    'indoors',
    'enter',
    'come in',
    'in my house',
    'in the house',
    'bedroom',
    'bathroom',
    'kitchen',
    'basement',
    'upstairs',
    'downstairs',
    'garage',
  ];
  return terms.some((w) => t.includes(w));
}

const REC_CATEGORIES = [
  'Plumber',
  'Electrician',
  'Mechanic',
  'Barber',
  'Daycare',
  'Pediatric PT',
  'Dentist',
  'CPA / Tax',
  'Landscaper',
  'Dog Groomer',
  'Handyman',
  '__custom__', // Custom…
];

const REC_PREF_TAGS = [
  'Neighbor-owned',
  'Honest pricing',
  'No upsell',
  'Fast turnaround',
  'Warranty-backed',
  'Great with kids',
  'Accepts insurance',
];

const HELP_CATEGORIES = [
  'Snow shoveling (driveway/sidewalk)',
  'Yard help (raking/bagging)',
  'Trash bins (to/from curb)',
  'Curb-to-curb move',
  'Porch pickup / drop (no valuables)',
  'Outdoor quick pet assist',
  'Litter pickup / block cleanup',
  'Quick outside check (ice/porch/etc.)',
];

const HELP_TEMPLATES = [
  {
    category: 'Snow shoveling (driveway/sidewalk)',
    label: 'Quick driveway',
    title: 'Need help shoveling my driveway/sidewalk',
    details:
      'Single driveway + sidewalk. Should be ~20–30 min. I have a shovel.',
    whenRange: 'Today after 5pm',
  },
  {
    category: 'Yard help (raking/bagging)',
    label: 'Rake & bag',
    title: 'Need help raking and bagging leaves',
    details: 'Front yard only. Bags provided. ~30–45 min.',
    whenRange: 'This weekend',
  },
  {
    category: 'Trash bins (to/from curb)',
    label: 'Bins',
    title: 'Need help bringing bins to/from curb',
    details: '2 bins. Super quick (5 min).',
    whenRange: 'Tomorrow morning',
  },
  {
    category: 'Curb-to-curb move',
    label: 'One heavy item',
    title: 'Need help moving 1 heavy item (curb-to-curb)',
    details: 'One item. 2 people preferred. ~20 min. No indoor entry needed.',
    whenRange: 'Today 6–8pm',
  },
  {
    category: 'Porch pickup / drop (no valuables)',
    label: 'Pickup/drop',
    title: 'Need a porch pickup/drop (no valuables)',
    details: 'Small item only. Porch pickup + porch drop. No cash/valuables.',
    whenRange: 'Anytime today',
  },
];

// -------------------- HYPERLOCAL (Phase 1) --------------------
const RADIUS_PRESETS = {
  near: { label: 'Near', miles: 1 },
  local: { label: 'Local', miles: 3 },
  area: { label: 'Area', miles: 8 },
  all: { label: 'All', miles: Infinity }, // global feed (no effective distance limit)
};

// Approx town centers (Phase 1 = good-enough demo radius)
const TOWN_CENTERS = {
  Worth: { lat: 41.6895, lng: -87.7973 },
  'Tinley Park': { lat: 41.5734, lng: -87.7845 },
  'Orland Park': { lat: 41.6303, lng: -87.8539 },
  'Oak Lawn': { lat: 41.719, lng: -87.7479 },
  'Homer Glen': { lat: 41.6, lng: -87.9384 },
  Lemont: { lat: 41.6736, lng: -87.9995 },
  Frankfort: { lat: 41.4959, lng: -87.8487 },
  'Palos Heights': { lat: 41.6686, lng: -87.7964 },
  'Palos Hills': { lat: 41.6967, lng: -87.8303 },
  'Palos Park': { lat: 41.6676, lng: -87.8342 },
};

const TOWN_KEYS = Object.keys(TOWN_CENTERS);

function deg2rad(d) {
  return (d * Math.PI) / 180;
}

function milesBetween(a, b) {
  if (!a || !b) return Infinity;
  const R = 3958.7613; // miles
  const dLat = deg2rad((b.lat || 0) - (a.lat || 0));
  const dLng = deg2rad((b.lng || 0) - (a.lng || 0));
  const lat1 = deg2rad(a.lat || 0);
  const lat2 = deg2rad(b.lat || 0);

  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function inferTownKeyFromText(text) {
  const t = String(text || '').toLowerCase();
  for (const k of TOWN_KEYS) {
    if (t.includes(k.toLowerCase())) return k;
  }
  return null;
}

function defaultCenterForLocation(locationText) {
  const key = inferTownKeyFromText(locationText);
  if (!key) return null;
  const c = TOWN_CENTERS[key];
  if (!c) return null;
  return { ...c, label: key, source: 'town', townKey: key, updatedAt: NOW() };
}

const USERS_SEED = [
  {
    id: 'me',
    name: 'DonnieB.',
    handle: '@don18',
    avatar: AVATAR,
    location: 'Worth',
    tagline: 'Little missions, big city.',
  },
  {
    id: 'u1',
    name: 'Sarah K.',
    handle: '@sarahk',
    avatar:
      'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&w=80',
    location: 'Tinley Park',
    tagline: 'Helpful neighbor energy.',
  },
  {
    id: 'u2',
    name: 'Mike R.',
    handle: '@miker',
    avatar:
      'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&w=80',
    location: 'Orland Park',
    tagline: 'I know a guy (sometimes).',
  },
  {
    id: 'u3',
    name: 'Amina S.',
    handle: '@amina',
    avatar:
      'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&w=80',
    location: 'Oak Lawn',
    tagline: 'Community first.',
  },
];

const seedPosts = () => {
  const t = NOW();
  return [
    // Help
    {
      id: 'p_help_1',
      kind: 'help',
      helpType: 'need', // need | volunteer
      category: 'Moving help',
      title: 'Need help moving a couch (2 people)',
      details: 'Tinley Park area. Garage to curb. 20–30 minutes max.',
      area: 'Tinley Park (near 183rd)',
      whenRange: 'Today 6–8pm',
      helpersNeeded: 2,
      selectedUserIds: [],
      status: 'open', // open | resolved
      stage: 'open', // open | booked | started | done | confirmed
      ownerId: 'u1',
      createdAt: t - 1000 * 60 * 22,
      replies: [], // volunteers / notes
      selectedUserId: null,
    },

    // Recommendations
    {
      id: 'p_rec_1',
      kind: 'rec',
      recCategory: 'Mechanic',
      area: 'Orland Park / Tinley Park',
      prefTags: ['Honest pricing', 'No upsell', 'Neighbor-owned'],
      preferences: 'Honest + fair pricing • No upsell • Prefer neighbor-owned',
      allowChatAfterTopPick: false,
      title: buildRecTitle('Mechanic', 'Orland Park / Tinley Park'),
      details: 'Need someone solid for brakes + general maintenance.',
      status: 'open',
      ownerId: 'me',
      createdAt: t - 1000 * 60 * 80,
      replies: [
        {
          id: 'r1',
          type: 'suggestion',
          authorId: 'u3',
          text: 'Try J&J Auto in Oak Lawn. Ask for Sam. ***-***-4412',
          createdAt: t - 1000 * 60 * 40,
          helpful: false,
          topPick: false,
          hidden: false,
        },
      ],
      topPickReplyId: null,
    },
  ];
};

function normalizePostsForRecSocial(list) {
  if (!Array.isArray(list)) return [];
  let changed = false;

  const next = list.map((p) => {
    if (!p || p.kind !== 'rec') return p;

    const replies = Array.isArray(p.replies) ? p.replies : [];
    let repliesChanged = false;

    const nextReplies = replies.map((r) => {
      if (!r || typeof r !== 'object') return r;

      let did = false;
      const out = { ...r };

      // Hearts: always an array of userIds
      const hearts = Array.isArray(r.hearts) ? r.hearts.filter(Boolean) : [];
      if (!Array.isArray(r.hearts)) {
        out.hearts = hearts;
        did = true;
      }

      // Comments: support legacy accidental nesting (r.replies)
      const rawComments = Array.isArray(r.comments)
        ? r.comments
        : Array.isArray(r.replies)
        ? r.replies
        : [];

      const comments = rawComments
        .filter((c) => c && typeof c === 'object' && typeof c.text === 'string')
        .map((c) => ({
          id: c.id || uid('c'),
          authorId: c.authorId || '',
          text: c.text,
          createdAt: typeof c.createdAt === 'number' ? c.createdAt : NOW(),
        }));

      if (!Array.isArray(r.comments) || Array.isArray(r.replies)) {
        out.comments = comments;
        if (Array.isArray(out.replies)) delete out.replies;
        did = true;
      }

      if (did) {
        repliesChanged = true;
        return out;
      }
      return r;
    });

    if (repliesChanged) {
      changed = true;
      return { ...p, replies: nextReplies };
    }
    return p;
  });

  return changed ? next : list;
}

function HomeScreen({
  Hero,
  Chips,
  EmptyState,
  PostCard,
  homeChip,
  homeShowAll,
  setHomeShowAll,
  homeFollowOnly,
  setHomeFollowOnly,
  homeQuery,
  setHomeQuery,
  feed,
  setActiveTab,
  setPostFlow,

  // NEW (Phase 1)
  radiusPreset,
  setRadiusPreset,
  homeCenterLabel,
  onOpenHomeSetup,

  // Saved searches
  savedSearches,
  activeSavedSearchId,
  onApplySavedSearch,
  onClearSavedSearch,
  onClearSavedSearchHighlight,
  onSaveCurrentSearch,
  canSaveCurrentSearch,
  currentSearchIsSaved,
  savedLimitReached,
  onManageSavedSearch,
}) {
  const hasQuery = normalizeText(homeQuery).length > 0;
  const feedAfterSearch = feed;

  const saveDisabled =
    homeFollowOnly || !hasQuery || currentSearchIsSaved || savedLimitReached;
  const saveLabel = currentSearchIsSaved
    ? 'Saved ✓'
    : savedLimitReached
    ? 'Max 5'
    : 'Save';

  return (
    <div className="nb-page">
      <Hero />
      <Chips />

      {/* Hyperlocal radius (Phase 1) */}
      <div
        className="nb-home-toggles"
        style={{ marginTop: 10, justifyContent: 'space-between' }}
      >
        <div className="nb-seg nb-seg-compact">
          <button
            type="button"
            className={`nb-segbtn ${radiusPreset === 'near' ? 'is-on' : ''}`}
            onClick={() => setRadiusPreset('near')}
            title="About 1 mile"
          >
            Near
          </button>
          <button
            type="button"
            className={`nb-segbtn ${radiusPreset === 'local' ? 'is-on' : ''}`}
            onClick={() => setRadiusPreset('local')}
            title="~About 3 miles"
          >
            Local
          </button>
          <button
  type="button"
  className={`nb-segbtn ${radiusPreset === 'area' ? 'is-on' : ''}`}
  onClick={() => setRadiusPreset('area')}
  title="~About 8 miles"
>
  Area
</button>

          <button
  type="button"
  className={`nb-segbtn ${radiusPreset === 'all' ? 'is-on' : ''}`}
  onClick={() => setRadiusPreset('all')}
  title="Any distance"
>
  Any
</button>
        </div>

        

        <button
          type="button"
          className="nb-btn nb-btn-ghost nb-btn-sm"
          onClick={onOpenHomeSetup}
          title="Set your home center"
        >
          Home: {homeCenterLabel || 'Set'}
        </button>
      </div>

      <div className="nb-home-toggles">
        <div className="nb-seg nb-seg-compact">
          <button
            type="button"
            className={`nb-segbtn ${
              !homeShowAll && !homeFollowOnly ? 'is-on' : ''
            }`}
            onClick={() => {
              setHomeFollowOnly(false);
              setHomeShowAll(false);
            }}
          >
            Open
          </button>

          <button
            type="button"
            className={`nb-segbtn ${
              homeShowAll && !homeFollowOnly ? 'is-on' : ''
            }`}
            onClick={() => {
              setHomeFollowOnly(false);
              setHomeShowAll(true);
            }}
          >
            All
          </button>

          <button
            type="button"
            className={`nb-segbtn ${homeFollowOnly ? 'is-on' : ''}`}
            onClick={() => {
              onClearSavedSearchHighlight?.(); // prevent a highlighted pill that no longer reflects the feed
              setHomeShowAll(false); // Following = Open-only (simple + consistent)
              setHomeFollowOnly(true);
            }}
            title="Only posts from neighbors you follow (plus you)"
          >
            Following
          </button>
        </div>
      </div>

      <div className="nb-searchrow">
        <div className="nb-search">
          <span className="nb-search-icon">🔎</span>
          <input
            className="nb-search-input"
            value={homeQuery}
            onChange={(e) => setHomeQuery(e.target.value)}
            placeholder="Search: mechanic, restaurant, etc."
          />
          {hasQuery ? (
            <button
              type="button"
              className="nb-search-clear"
              onClick={() => setHomeQuery('')}
              aria-label="Clear search"
              title="Clear"
            >
              ✕
            </button>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {hasQuery ? (
            <div className="nb-search-meta">
              {feedAfterSearch.length} results
            </div>
          ) : null}

          <button
            type="button"
            className="nb-btn nb-btn-ghost nb-btn-sm"
            onClick={onSaveCurrentSearch}
            disabled={saveDisabled}
            title={
              homeFollowOnly
                ? 'Turn off Following to use saved searches'
                : !hasQuery
                ? 'Type a search query to save it'
                : currentSearchIsSaved
                ? 'Already saved'
                : savedLimitReached
                ? 'Saved searches are limited to 5'
                : 'Save this search'
            }
          >
            {saveLabel}
          </button>
        </div>
      </div>

      {/* Saved Searches row */}
      <div style={{ marginTop: 10 }}>
        <div
          className="nb-seg nb-seg-compact nb-seg-scroll"
          style={{ width: '100%' }}
        >
          <button
            type="button"
            className={`nb-segbtn ${!activeSavedSearchId ? 'is-on' : ''}`}
            onClick={onClearSavedSearch}
            title="Reset to default feed"
          >
            All
          </button>

          {(savedSearches || []).map((s) => {
            const newCount = Number(s.newCount || 0);
            const badge = newCount > 9 ? '9+' : String(newCount);

            return (
              <div
                key={s.id}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <button
                  type="button"
                  className={`nb-segbtn ${
                    activeSavedSearchId === s.id ? 'is-on' : ''
                  }`}
                  onClick={() => onApplySavedSearch(s.id)}
                  title="Apply saved search"
                >
                  {s.name || 'Saved'}
                  {newCount > 0 ? (
                    <span
                      aria-label={`${newCount} new`}
                      title={`${newCount} new since last view`}
                      style={{
                        marginLeft: 8,
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 900,
                        lineHeight: '16px',
                        background: 'rgba(255,145,90,.95)',
                        color: '#111',
                        border: '1px solid rgba(255,255,255,.12)',
                      }}
                    >
                      {badge}
                    </span>
                  ) : null}
                </button>

                <button
                  type="button"
                  className="nb-iconbtn"
                  onClick={() => onManageSavedSearch(s.id)}
                  aria-label="Manage saved search"
                  title="Rename / delete"
                  style={{ width: 34 }}
                >
                  ⋯
                </button>
              </div>
            );
          })}
        </div>

        {!savedSearches || savedSearches.length === 0 ? (
          <div
            className="nb-muted small"
            style={{ marginTop: 8, fontWeight: 850 }}
          >
            Save a search to pin it here for one-tap access.
          </div>
        ) : null}
      </div>

      {!hasQuery &&
      radiusPreset !== 'all' &&
      feedAfterSearch.length > 0 &&
      feedAfterSearch.length < 10 ? (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="nb-btn nb-btn-ghost nb-btn-sm"
            style={{ width: '100%', justifyContent: 'space-between' }}
            onClick={() => setRadiusPreset('all')}
            title="Expand your radius to see more posts"
          >
            <span style={{ fontWeight: 900 }}>
            Seeing only {feedAfterSearch.length} posts — expand to All
            </span>
            <span aria-hidden="true" style={{ opacity: 0.8 }}>
              →
            </span>
          </button>
        </div>
      ) : null}

      {feedAfterSearch.length === 0 ? (
        <>
          {!hasQuery && radiusPreset !== 'all' ? (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                className="nb-btn nb-btn-ghost nb-btn-sm"
                style={{ width: '100%', justifyContent: 'space-between' }}
                onClick={() => setRadiusPreset('all')}
                title="Expand your radius to see more posts"
              >
                <span style={{ fontWeight: 900 }}>
                Nothing nearby — expand to All
                </span>
                <span aria-hidden="true" style={{ opacity: 0.8 }}>
                  →
                </span>
              </button>
            </div>
          ) : null}

          <EmptyState
            title="Nothing here yet"
            body={
              homeFollowOnly
                ? 'You’re not following anyone yet. Open a neighbor profile and hit Follow.'
                : homeChip === 'help'
                ? 'No help posts yet. The app feels dead if nobody posts. Fix that.'
                : homeChip === 'rec'
                ? 'No recommendation requests yet. Ask a specific question and you’ll get better replies.'
                : 'No posts yet. Start the neighborhood with one structured post.'
            }
            ctaLabel="Create a post"
            onCta={() => {
              setActiveTab('post');
              setPostFlow({ step: 'chooser', kind: null });
            }}
          />
        </>
      ) : (
        <div className="nb-feed">
          {feedAfterSearch.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  // -------------------- LOAD SAVED STATE (V1) --------------------
  const saved = useMemo(() => loadAppState(), []);

  const [activeTab, setActiveTab] = useState(() => saved?.activeTab ?? 'home'); // home | post | activity | profile
  const [meId, setMeId] = useState('me'); // tiny demo switcher (optional)
  const me = useMemo(
    () => USERS_SEED.find((u) => u.id === meId) || USERS_SEED[0],
    [meId]
  );

  const [posts, setPosts] = useState(() =>
    normalizePostsForRecSocial(saved?.posts ?? seedPosts())
  );
  const [homeChip, setHomeChip] = useState(() => saved?.homeChip ?? 'all'); // all | help | rec
  const [homeShowAll, setHomeShowAll] = useState(
    () => saved?.homeShowAll ?? false
  ); // Open / All (resolved visibility)
  const [homeFollowOnly, setHomeFollowOnly] = useState(
    () => saved?.homeFollowOnly ?? false
  ); // Following mode

  const [expandedThreads, setExpandedThreads] = useState(
    () => saved?.expandedThreads ?? {}
  ); // postId -> bool
  const [expandedOtherVols, setExpandedOtherVols] = useState(
  () => saved?.expandedOtherVols ?? {}
); // postId -> bool
  const [homeQuery, setHomeQuery] = useState(() => saved?.homeQuery ?? '');
  const [savedSearches, setSavedSearches] = useState(
    () => saved?.savedSearches ?? []
  );
  const [activeSavedSearchId, setActiveSavedSearchId] = useState(
    () => saved?.activeSavedSearchId ?? null
  );

  // -------------------- HYPERLOCAL RADIUS (Phase 1) --------------------
  const [homeCenters, setHomeCenters] = useState(
    () => saved?.homeCenters ?? {}
  );
  const [radiusByUser, setRadiusByUser] = useState(
    () => saved?.radiusByUser ?? {}
  );

  const homeCenter = useMemo(() => {
    return (
      homeCenters?.[me.id] || defaultCenterForLocation(me.location) || null
    );
  }, [homeCenters, me.id, me.location]);

  const radiusPreset = radiusByUser?.[me.id] || 'all';
  const radiusMiles = (RADIUS_PRESETS[radiusPreset] || RADIUS_PRESETS.local)
    .miles;

  function setRadiusPresetForMe(preset) {
    if (!RADIUS_PRESETS[preset]) return;
    setRadiusByUser((prev) => ({ ...(prev || {}), [me.id]: preset }));
  }

  function saveHomeCenterForMe(center) {
    if (
      !center ||
      typeof center.lat !== 'number' ||
      typeof center.lng !== 'number'
    )
      return;
    setHomeCenters((prev) => ({ ...(prev || {}), [me.id]: center }));
  }

  function postApproxCenter(post) {
    if (!post) return null;
  
    const areaText = String(post.area || '');
    const ownerLoc = String(
  (USERS_SEED.find((u) => u.id === post.ownerId)?.location) || ''
);
  
    const explicitTownKey = String(post.townKey || '').trim();
    const townKey =
      (explicitTownKey && TOWN_CENTERS[explicitTownKey] ? explicitTownKey : null) ||
      inferTownKeyFromText(areaText) ||
      inferTownKeyFromText(ownerLoc);
  
    if (!townKey) return null;
    const c = TOWN_CENTERS[townKey];
    if (!c) return null;
  
    return { ...c, label: townKey, source: 'post', townKey, updatedAt: NOW() };
  }

  // points are only for HELP confirmed loops (not rec)
  const [npPointsByUser, setNpPointsByUser] = useState(
    () =>
      saved?.npPointsByUser ?? {
        me: 20,
        u1: 60,
        u2: 120,
        u3: 35,
      }
  );

  // rate limit and spam guard for replies (rec)
  const [replyStats, setReplyStats] = useState(() => saved?.replyStats ?? {});
  // activity log
  const [activity, setActivity] = useState(() => {
    const raw = saved?.activity ?? [];

    // MIGRATION: older activity items had no audienceIds, so “You …” could show under the wrong demo user.
    // In this demo, default old items to the primary user ("me") so they don’t leak across logins.
    return raw.map((a) => {
      if (!a) return a;
      if (typeof a === 'string') {
        return { id: uid('a'), ts: NOW(), text: a, audienceIds: ['me'] };
      }
      if (!Array.isArray(a.audienceIds)) {
        return { ...a, audienceIds: ['me'] };
      }
      return a;
    });
  });

  // modal: reply or confirm actions
  const [modal, setModal] = useState(null); // {type, postId, mode}
  // recommendation comment thread (per recommendation reply)
  const [thread, setThread] = useState(null); // { postId, replyId } | null
  // chat drawer
  const [chat, setChat] = useState(null); // {postId, otherUserId}
  const didAutoOpenChatOnActivity = useRef(false);
  const [chats, setChats] = useState(() => {
    const raw = saved?.chats ?? {};
    const out = {};

    if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) {
        // expected: array of message objects
        if (Array.isArray(v)) {
          out[k] = v.filter((m) => m && typeof m === 'object');
          continue;
        }

        // support older shape: { messages: [...] }
        if (v && typeof v === 'object' && Array.isArray(v.messages)) {
          out[k] = v.messages.filter((m) => m && typeof m === 'object');
          continue;
        }

        // if someone saved JSON as a string
        if (typeof v === 'string') {
          const parsed = safeJsonParse(v, null);
          out[k] = Array.isArray(parsed)
            ? parsed.filter((m) => m && typeof m === 'object')
            : [];
          continue;
        }

        // anything else is invalid → drop it
        out[k] = [];
      }
    }

    return out;
  });

  const [lastRead, setLastRead] = useState(() => saved?.lastRead ?? {});

  // post flow
  const [postFlow, setPostFlow] = useState({ step: 'chooser', kind: null });

  const npPoints = npPointsByUser[me.id] || 0;
  const myBadge = badgeFor(npPoints);

  const usersById = useMemo(() => {
    const m = {};
    USERS_SEED.forEach((u) => (m[u.id] = u));
    return m;
  }, []);

  // -------------------- FOLLOW (Phase 1) --------------------
  const [followsByUser, setFollowsByUser] = useState(
    () => saved?.followsByUser ?? {}
  );

  const followingSet = useMemo(() => {
    const arr = Array.isArray(followsByUser?.[me.id])
      ? followsByUser[me.id]
      : [];
    return new Set(arr.filter(Boolean));
  }, [followsByUser, me.id]);

  const followersByUser = useMemo(() => {
    const out = {};
    const obj =
      followsByUser && typeof followsByUser === 'object' ? followsByUser : {};
    for (const [followerId, list] of Object.entries(obj)) {
      if (!Array.isArray(list)) continue;
      for (const followedId of list.filter(Boolean)) {
        if (!out[followedId]) out[followedId] = [];
        if (!out[followedId].includes(followerId))
          out[followedId].push(followerId);
      }
    }
    return out;
  }, [followsByUser]);

  function isFollowing(viewerId, targetId) {
    const arr = Array.isArray(followsByUser?.[viewerId])
      ? followsByUser[viewerId]
      : [];
    return arr.includes(targetId);
  }

  function toggleFollow(targetId) {
    if (!targetId) return;
    if (targetId === me.id) return;

    setFollowsByUser((prev) => {
      const base = prev && typeof prev === 'object' ? prev : {};
      const cur = Array.isArray(base[me.id]) ? base[me.id].filter(Boolean) : [];
      const has = cur.includes(targetId);
      const next = has ? cur.filter((x) => x !== targetId) : [...cur, targetId];
      return { ...base, [me.id]: next };
    });
  }

  const helpfulRepliesCount = useMemo(() => {
    // Count only rec replies marked helpful OR top pick by the post owner.
    const counts = {};
    for (const p of posts) {
      if (p.kind !== 'rec') continue;
      const ownerId = p.ownerId;
      for (const r of p.replies || []) {
        if (r.hidden) continue;
        if (r.authorId === ownerId) continue;
        if (r.helpful || r.topPick) {
          counts[r.authorId] = (counts[r.authorId] || 0) + 1;
        }
      }
    }
    return counts[me.id] || 0;
  }, [posts, me.id]);

  const myPostCount = useMemo(
    () => posts.filter((p) => p.ownerId === me.id).length,
    [posts, me.id]
  );

  // -------------------- SAVED SEARCHES (Enhancement #2) --------------------
  const mySavedSearches = useMemo(() => {
    const list = Array.isArray(savedSearches) ? savedSearches : [];
    return list
      .filter((s) => s && typeof s === 'object')
      .filter((s) => (s.userId || 'me') === me.id) // migration: missing userId -> "me"
      .slice(0, MAX_SAVED_SEARCHES);
  }, [savedSearches, me.id]);

  const currentSearchFp = useMemo(
    () =>
      searchFingerprint({
        query: homeQuery,
        homeChip,
        homeShowAll,
      }),
    [homeQuery, homeChip, homeShowAll]
  );

  const currentSearchIsSaved = useMemo(() => {
    return mySavedSearches.some((s) => {
      const fp = searchFingerprint({
        query: s.query,
        homeChip: s.homeChip,
        homeShowAll: s.homeShowAll,
      });
      return fp === currentSearchFp;
    });
  }, [mySavedSearches, currentSearchFp]);

  function postMatchesSavedSearch(post, s) {
    if (!post || !s) return false;

    // Open/All (resolved visibility)
    if (!s.homeShowAll && post.status === 'resolved') return false;

    // Chip filter
    const chip = s.homeChip || 'all';
    if (chip !== 'all' && post.kind !== chip) return false;

    // Query filter
    const q = normalizeText(s.query).toLowerCase();
    if (!q) return true;

    const hay = [
      post.title,
      post.details,
      post.area,
      post.category, // help
      post.recCategory, // rec
      post.whenRange,
      post.preferences,
      ...(Array.isArray(post.prefTags) ? post.prefTags : []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return hay.includes(q);
  }

  function countNewForSavedSearch(s) {
    const last = typeof s?.lastSeenTs === 'number' ? s.lastSeenTs : 0;
    let c = 0;

    for (const p of posts) {
      if (!p || typeof p.createdAt !== 'number') continue;
      if (p.createdAt <= last) continue;
      if (postMatchesSavedSearch(p, s)) c += 1;
    }

    return c;
  }

  const mySavedSearchesWithCounts = useMemo(() => {
    return mySavedSearches.map((s) => ({
      ...s,
      newCount: countNewForSavedSearch(s),
    }));
  }, [mySavedSearches, posts]);

  const savedLimitReached = mySavedSearches.length >= MAX_SAVED_SEARCHES;

  const canSaveCurrentSearch =
    normalizeText(homeQuery).length > 0 &&
    !currentSearchIsSaved &&
    !savedLimitReached;

  function saveCurrentSearch() {
    const q = normalizeText(homeQuery);
    if (!q) return;
    if (savedLimitReached) return;

    const fp = searchFingerprint({
      query: q,
      homeChip,
      homeShowAll,
    });

    const exists = mySavedSearches.some((s) => {
      const sFp = searchFingerprint({
        query: s.query,
        homeChip: s.homeChip,
        homeShowAll: s.homeShowAll,
      });
      return sFp === fp;
    });

    if (exists) return;

    const item = {
      id: uid('ss'),
      userId: me.id,
      name: defaultSavedSearchName(q),
      query: q,
      homeChip,
      homeShowAll: !!homeShowAll,
      lastSeenTs: NOW(), // start "seen" now so badge doesn't instantly show
      createdAt: NOW(),
    };

    setSavedSearches((prev) => [item, ...(Array.isArray(prev) ? prev : [])]);
  }

  function applySavedSearch(searchId) {
    const s = mySavedSearches.find((x) => x.id === searchId);
    if (!s) return;

    setHomeChip(s.homeChip || 'all');
    setHomeShowAll(!!s.homeShowAll);
    setHomeQuery(s.query || '');
    setActiveSavedSearchId(s.id);

    // mark as seen (clears "new" badge)
    setSavedSearches((prev) =>
      (Array.isArray(prev) ? prev : []).map((x) =>
        x && x.id === s.id ? { ...x, lastSeenTs: NOW() } : x
      )
    );
  }

  function clearSavedSearch() {
    setActiveSavedSearchId(null);
    setHomeChip('all');
    setHomeShowAll(false);
    setHomeQuery('');
  }

  // Reset pill selection when switching demo user
  useEffect(() => {
    setActiveSavedSearchId(null);
  }, [me.id]);

  // If the user edits filters manually, drop the active pill highlight unless it still matches
  useEffect(() => {
    if (!activeSavedSearchId) return;

    const s = mySavedSearches.find((x) => x.id === activeSavedSearchId);
    if (!s) return; // don't auto-clear on races; just stop highlighting

    const sFp = searchFingerprint({
      query: s.query,
      homeChip: s.homeChip,
      homeShowAll: s.homeShowAll,
    });

    if (sFp !== currentSearchFp) {
      setActiveSavedSearchId(null);
    }
  }, [activeSavedSearchId, mySavedSearches, currentSearchFp]);

  function pushActivity(payload) {
    // payload can be a string (legacy) or an event object
    if (typeof payload === 'string') {
      setActivity((prev) => [
        { id: uid('a'), ts: NOW(), text: payload, audienceIds: [me.id] },
        ...prev,
      ]);
      return;
    }

    const evt = payload || {};
    const audienceIds = Array.isArray(evt.audienceIds)
      ? evt.audienceIds
      : [evt.actorId || me.id];

    setActivity((prev) => [
      { id: uid('a'), ts: NOW(), ...evt, audienceIds },
      ...prev,
    ]);
  }

  function otherIdFromActivity(a, viewerId) {
    const actor = a?.actorId;
    const other = a?.otherUserId;
    if (!actor || !other) return null;
    if (viewerId === actor) return other;
    if (viewerId === other) return actor;
    return null;
  }

  function activityText(a, viewerId) {
    if (!a) return '';

    // Legacy string-only entries
    if (typeof a.text === 'string' && !a.type) return a.text;

    const actorName = usersById[a.actorId]?.name || 'Someone';
    const ownerName = usersById[a.postOwnerId]?.name || 'Owner';
    const otherName = usersById[a.otherUserId]?.name || 'Neighbor';

    const viewerIsActor = viewerId === a.actorId;
    const viewerIsOwner = viewerId === a.postOwnerId;
    const viewerIsOther = viewerId === a.otherUserId;

    switch (a.type) {
      case 'reply_sent': {
        if (a.postKind === 'rec') {
          if (viewerIsActor) return `You suggested to ${ownerName}.`;
          if (viewerIsOwner) return `${actorName} suggested on your post.`;
          return `${actorName} suggested to ${ownerName}.`;
        }
        // help
        if (viewerIsActor) return `You volunteered to help ${ownerName}.`;
        if (viewerIsOwner) return `${actorName} volunteered to help you.`;
        return `${actorName} volunteered to help ${ownerName}.`;
      }

      case 'chat_unlocked': {
        if (viewerIsActor) return `You chose ${otherName}. Chat unlocked.`;
        if (viewerIsOther) return `${actorName} chose you. Chat unlocked.`;
        return `Chat unlocked between ${actorName} and ${otherName}.`;
      }

      case 'chat_message': {
        if (viewerIsActor) return `You messaged ${otherName}.`;
        if (viewerIsOther) return `${actorName} messaged you.`;
        return `${actorName} messaged ${otherName}.`;
      }

      default:
        return a.text || '';
    }
  }

  function toggleThread(postId) {
    setExpandedThreads((prev) => ({ ...prev, [postId]: !prev[postId] }));
  }

  function toggleOtherVols(postId) {
  setExpandedOtherVols((prev) => ({ ...prev, [postId]: !prev?.[postId] }));
}

  function getChatId(postId, a, b) {
    const x = [a, b].sort().join('|');
    return `${postId}::${x}`;
  }

  function readKey(userId, chatId) {
    return `${userId}::${chatId}`;
  }

  function getLastChatTs(chatId) {
    const msgs = Array.isArray(chats[chatId]) ? chats[chatId] : [];
    let max = 0;
    for (const m of msgs) {
      if (m && typeof m.ts === 'number' && m.ts > max) max = m.ts;
    }
    return max;
  }

  function unreadCount(chatId, viewerId) {
    const msgs = Array.isArray(chats[chatId]) ? chats[chatId] : [];
    const last = lastRead[readKey(viewerId, chatId)] || 0;

    let c = 0;
    for (const m of msgs) {
      if (!m) continue;
      if (typeof m.ts !== 'number') continue;
      if (m.ts <= last) continue;
      if (m.fromId === viewerId) continue; // don’t count my own messages as unread
      c += 1;
    }
    return c;
  }

  function markChatRead(chatId, viewerId) {
    const lastTs = getLastChatTs(chatId);
    const k = readKey(viewerId, chatId);
    setLastRead((prev) => ({
      ...prev,
      [k]: Math.max(prev[k] || 0, lastTs),
    }));
  }

  function getHelpersNeeded(post) {
    const n = Number(post.helpersNeeded ?? post.needHelpers ?? 1);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(6, Math.floor(n)));
  }

  function getSelectedHelperIds(post) {
    const arr = Array.isArray(post.selectedUserIds)
      ? post.selectedUserIds
      : post.selectedUserId
      ? [post.selectedUserId]
      : [];
    return Array.from(new Set(arr.filter(Boolean)));
  }

  function canOpenChatForPost(post, otherUserId) {
    if (!post || !otherUserId) return false;

    // HELP chats: requester <-> selected helper(s)
    if (post.kind === 'help') {
      const selected = getSelectedHelperIds(post);
      if (selected.length === 0) return false;

      const meIsOwner = me.id === post.ownerId;
      const meIsSelectedHelper = selected.includes(me.id);

      if (meIsOwner) return selected.includes(otherUserId);
      if (meIsSelectedHelper) return otherUserId === post.ownerId;

      return false;
    }

    // REC chats (optional): owner <-> Top pick (if enabled)
    if (post.kind === 'rec') {
      if (!post.allowChatAfterTopPick) return false;
      if (!post.topPickReplyId) return false;

      const top = (post.replies || []).find(
        (r) => r && !r.hidden && r.id === post.topPickReplyId
      );
      const topAuthorId = top?.authorId;
      if (!topAuthorId) return false;

      const meIsOwner = me.id === post.ownerId;
      const meIsTopAuthor = me.id === topAuthorId;

      if (meIsOwner) return otherUserId === topAuthorId;
      if (meIsTopAuthor) return otherUserId === post.ownerId;

      return false;
    }

    return false;
  }

  function openChat(postId, otherUserId) {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    if (!otherUserId) return;

    // never open a chat with yourself
    if (otherUserId === me.id) return;
    // REC: don’t open the drawer unless it’s actually unlocked
    if (post.kind === 'rec' && !canOpenChatForPost(post, otherUserId)) return;

    // normalize "other" based on the rules:
    // - owner chats with selected helpers
    // - selected helper chats only with owner
    if (post.kind === 'help') {
      const selected = getSelectedHelperIds(post);
      const meIsOwner = me.id === post.ownerId;
      const meIsSelectedHelper = selected.includes(me.id);

      if (meIsSelectedHelper && !meIsOwner) {
        otherUserId = post.ownerId; // helper can only chat with owner
      }
    }

    setChat({ postId, otherUserId });
  }

  function sendChatMessage(postId, otherUserId, text) {
    const clean = normalizeText(text);
    if (!clean) return;

    const chatId = getChatId(postId, me.id, otherUserId);

    setChats((prev) => {
      const prevMsgs = Array.isArray(prev[chatId]) ? prev[chatId] : [];
      const next = [
        ...prevMsgs,
        { id: uid('m'), fromId: me.id, text: clean, ts: NOW() },
      ];
      return { ...prev, [chatId]: next };
    });

    pushActivity({
      type: 'chat_message',
      actorId: me.id,
      otherUserId,
      postId,
      audienceIds: [me.id, otherUserId],
    });
  }

  function getReplyLimitKey(kind) {
    // separate limits by kind
    return `limit_${kind}`;
  }

  function getTodayStamp() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function checkAndConsumeReplyBudget(kind) {
    // only enforce for rec
    if (kind !== 'rec') return { ok: true };

    const key = `${me.id}:${kind}`;
    const today = getTodayStamp();
    const prev = replyStats[key] || {
      day: today,
      count: 0,
      lastTs: 0,
      strikes: 0,
    };

    // reset daily
    const current =
      prev.day === today
        ? prev
        : { day: today, count: 0, lastTs: 0, strikes: prev.strikes || 0 };

    // cooldown: 25s
    if (NOW() - (current.lastTs || 0) < 25 * 1000) {
      const wait = Math.ceil((25 * 1000 - (NOW() - current.lastTs)) / 1000);
      return { ok: false, error: `Slow down — try again in ${wait}s.` };
    }

    // daily limit: 12
    if ((current.count || 0) >= 12) {
      return { ok: false, error: 'Daily limit reached (12). Try tomorrow.' };
    }

    setReplyStats((s) => ({
      ...s,
      [key]: { ...current, count: (current.count || 0) + 1, lastTs: NOW() },
    }));

    return { ok: true };
  }

  function remainingRepliesToday(kind) {
    if (kind !== 'rec') return null;
    const key = `${me.id}:${kind}`;
    const today = getTodayStamp();
    const prev = replyStats[key] || { day: today, count: 0 };
    const cur = prev.day === today ? prev : { day: today, count: 0 };
    return Math.max(0, 12 - (cur.count || 0));
  }

  function submitReply(postId, mode, text) {
    const clean = normalizeText(text);

    if (!clean) return { ok: false, error: 'Reply can’t be empty.' };
    if (clean.length < 8)
      return { ok: false, error: 'Too short. Add one more detail.' };
    if (containsLink(clean))
      return {
        ok: false,
        error:
          'Links aren’t supported yet — share the name + why you recommend them.',
      };

    const post = posts.find((p) => p.id === postId);
    if (!post) return { ok: false, error: 'Post not found.' };

    // enforce rate limits for rec
    const budget = checkAndConsumeReplyBudget(post.kind);
    if (!budget.ok) return budget;

    // basic repeat spam: same text from same user on same post
    const already = (post.replies || []).some(
      (r) =>
        r.authorId === me.id &&
        normalizeText(r.text).toLowerCase() === clean.toLowerCase()
    );
    if (already)
      return { ok: false, error: 'You already sent that. Add something new.' };

    const reply = {
      id: uid('r'),
      hearts: [],
      comments: [],
      type:
        mode === 'suggest'
          ? 'suggestion'
          : mode === 'lead'
          ? 'lead'
          : 'volunteer',
      authorId: me.id,
      text: maskPhones(clean),
      createdAt: NOW(),
      helpful: false,
      topPick: false,
      hidden: false,
    };

    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, replies: [...(p.replies || []), reply] } : p
      )
    );

    pushActivity({
      type: 'reply_sent',
      actorId: me.id,
      postOwnerId: post.ownerId,
      postKind: post.kind,
      postId,
      audienceIds: [me.id, post.ownerId],
    });

    return { ok: true };
  }

  function setResolved(postId) {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, status: 'resolved' } : p))
    );
    pushActivity('Marked a post as resolved.');
  }

  function getRecComments(r) {
    // Backward compatible: if you already used r.replies somewhere, prefer r.comments first.
    if (Array.isArray(r?.comments)) return r.comments;
    if (Array.isArray(r?.replies)) return r.replies; // legacy accidental nesting
    return [];
  }

  function addRecCommentLegacy(postId, replyId, text) {
    const clean = normalizeText(text);
    if (!clean) return;

    const comment = {
      id: uid('c'),
      authorId: me.id,
      text: clean,
      createdAt: NOW(),
    };

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        if (p.kind !== 'rec') return p;

        const replies = (p.replies || []).map((r) => {
          if (!r || r.hidden) return r;
          if (r.id !== replyId) return r;

          const existing = getRecComments(r);
          return { ...r, comments: [...existing, comment] };
        });

        return { ...p, replies };
      })
    );
  }

  function markHelpful(postId, replyId) {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const replies = (p.replies || []).map((r) =>
          r.id === replyId ? { ...r, helpful: !r.helpful } : r
        );
        return { ...p, replies };
      })
    );
    pushActivity('Updated helpful status.');
  }

  function setTopPick(postId, replyId) {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const chosen = (post.replies || []).find(
      (r) => r.id === replyId && !r.hidden
    );
    if (!chosen) return;

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const replies = (p.replies || []).map((r) => ({
          ...r,
          topPick: r.id === replyId,
        }));
        return { ...p, replies, topPickReplyId: replyId };
      })
    );

    // If Rec chat is enabled, unlock it for BOTH people via Activity (safe + explicit)
    if (post.kind === 'rec' && post.allowChatAfterTopPick) {
      pushActivity({
        type: 'chat_unlocked',
        actorId: post.ownerId,
        otherUserId: chosen.authorId,
        postId,
        postOwnerId: post.ownerId,
        postKind: post.kind,
        audienceIds: [post.ownerId, chosen.authorId],
      });
      return;
    }

    pushActivity('Chose a Top pick.');
  }

  function toggleHeart(postId, replyId) {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId || p.kind !== 'rec') return p;

        const replies = (p.replies || []).map((r) => {
          if (r.id !== replyId) return r;

          const hearts = Array.isArray(r.hearts) ? r.hearts : [];
          const has = hearts.includes(me.id);
          const nextHearts = has
            ? hearts.filter((x) => x !== me.id)
            : [...hearts, me.id];

          return { ...r, hearts: nextHearts };
        });

        return { ...p, replies };
      })
    );
  }

  function addRecComment(postId, replyId, text) {
    const clean = normalizeText(text);
    if (!clean) return { ok: false, error: 'Reply can’t be empty.' };
    if (clean.length < 4) return { ok: false, error: 'Too short.' };
    if (containsLink(clean)) {
      return {
        ok: false,
        error: 'Links aren’t supported yet — use names + details.',
      };
    }

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId || p.kind !== 'rec') return p;

        const replies = (p.replies || []).map((r) => {
          if (r.id !== replyId) return r;

          const comments = getRecComments(r);

          const c = {
            id: uid('c'),
            authorId: me.id,
            text: maskPhones(clean),
            createdAt: NOW(),
          };

          return { ...r, comments: [...comments, c] };
        });

        return { ...p, replies };
      })
    );

    return { ok: true };
  }

  function chooseOneForChat(postId, userId) {
    const post = posts.find((p) => p.id === postId);
    if (!post || post.kind !== 'help') return;

    // only owner can choose
    if (me.id !== post.ownerId) return;

    const helpersNeeded = getHelpersNeeded(post);
    const currentSelected = getSelectedHelperIds(post);

    // already selected -> just open chat
    if (currentSelected.includes(userId)) {
      openChat(postId, userId);
      return;
    }

    // slots full -> do nothing
    if (currentSelected.length >= helpersNeeded) return;

    const nextSelected = [...currentSelected, userId];

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        return {
          ...p,
          selectedUserIds: nextSelected,
          // keep legacy field for older code paths
          selectedUserId: p.selectedUserId || nextSelected[0],
        };
      })
    );

    pushActivity({
      type: 'chat_unlocked',
      actorId: me.id,
      otherUserId: userId,
      postId,
      audienceIds: [me.id, userId],
    });

    // Keep "others" open until slots are filled
    setExpandedOtherVols((prev) => {
      const next = new Set(prev);
      if (nextSelected.length >= helpersNeeded) next.delete(postId);
      else next.add(postId);
      return next;
    });

    // open chat immediately
    openChat(postId, userId);
  }

  function advanceHelpStage(postId, nextStage) {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        return { ...p, stage: nextStage };
      })
    );
    pushActivity(`Help status updated: ${nextStage}.`);
  }

  function confirmHelp(postId) {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const selectedIds = getSelectedHelperIds(post);
    if (post.kind !== 'help' || selectedIds.length === 0) return;

    // prevent double-award
    if (post.stage === 'confirmed') return;

    // Award NP to EVERY selected helper
    setNpPointsByUser((prev) => {
      const next = { ...prev };
      for (const helperId of selectedIds) {
        next[helperId] = (next[helperId] || 0) + 20;
      }
      return next;
    });

    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, stage: 'confirmed', status: 'resolved' } : p
      )
    );

    const names = selectedIds
      .map((id) => usersById[id]?.name || 'Helper')
      .join(', ');
    pushActivity(`Confirmed help. +20 NP to ${names}.`);
  }

  const filteredFeed = useMemo(() => {
    let list = [...posts];

    // Default feed shows open only (resolved hidden)
    if (!homeShowAll) list = list.filter((p) => p.status !== 'resolved');
    // Following mode: only show posts from neighbors I follow (plus me)
    if (homeFollowOnly) {
      list = list.filter(
        (p) => p && (p.ownerId === me.id || followingSet.has(p.ownerId))
      );
    }

    // Radius filter (Phase 1)
    if (
      homeCenter &&
      typeof homeCenter.lat === 'number' &&
      typeof homeCenter.lng === 'number'
    ) {
      list = list.filter((p) => {
        const pc = postApproxCenter(p);
        if (!pc) return true; // Phase 1: unknown location stays visible
        return milesBetween(homeCenter, pc) <= radiusMiles;
      });
    }

    // Chip filter
    if (homeChip !== 'all') {
      list = list.filter((p) => p.kind === homeChip);
    }

    // Sort: recency first
    list.sort((a, b) => b.createdAt - a.createdAt);

    return list;
  }, [
    posts,
    homeChip,
    homeShowAll,
    homeFollowOnly,
    followingSet,
    me.id,
    homeCenter,
    radiusMiles,
  ]);
  const searchedFeed = useMemo(() => {
    const q = normalizeText(homeQuery).toLowerCase();
    if (!q) return filteredFeed;

    return filteredFeed.filter((p) => {
      const hay = [
        p.title,
        p.details,
        p.area,
        p.category, // help
        p.recCategory, // rec
        p.whenRange,
        p.preferences,
        ...(Array.isArray(p.prefTags) ? p.prefTags : []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return hay.includes(q);
    });
  }, [filteredFeed, homeQuery]);

  const myPosts = useMemo(() => {
    const list = posts
      .filter((p) => p.ownerId === me.id)
      .sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [posts, me.id]);

  // Close modal on tab change for sanity
  useEffect(() => {
    setModal(null);
  }, [activeTab]);

  useEffect(() => {
    if (!chat) return;
    const chatId = getChatId(chat.postId, me.id, chat.otherUserId);
    markChatRead(chatId, me.id);
  }, [chat, chats, me.id]);

  // If you switch demo users while a chat is open, ensure "otherUserId" is still the OTHER person.
  // Otherwise you end up chatting with yourself / wrong chatId.
  useEffect(() => {
    if (!chat) return;

    const post = posts.find((p) => p.id === chat.postId);
    if (!post) {
      setChat(null);
      return;
    }

    // ---------- HELP: keep your existing normalization ----------
    if (post.kind === 'help') {
      const selected = getSelectedHelperIds(post);
      if (selected.length === 0) {
        setChat(null);
        return;
      }

      const meIsOwner = me.id === post.ownerId;
      const meIsSelectedHelper = selected.includes(me.id);

      // viewer must be owner or selected helper
      if (!meIsOwner && !meIsSelectedHelper) {
        setChat(null);
        return;
      }

      let otherId = null;

      if (meIsOwner) {
        // Owner can chat with any selected helper.
        // Keep current chat if valid, otherwise pick the first selected helper.
        otherId = selected.includes(chat.otherUserId)
          ? chat.otherUserId
          : selected[0];
      } else {
        // Helper chats only with owner
        otherId = post.ownerId;
      }

      if (!otherId) {
        setChat(null);
        return;
      }

      if (chat.otherUserId !== otherId) {
        setChat({ postId: post.id, otherUserId: otherId });
      }

      return;
    }

    // ---------- REC: DO NOT auto-close. Normalize owner <-> top pick only ----------
    if (post.kind === 'rec') {
      // Must be enabled + must have a top pick
      if (!post.allowChatAfterTopPick || !post.topPickReplyId) {
        setChat(null);
        return;
      }

      const top = (post.replies || []).find(
        (r) => r && !r.hidden && r.id === post.topPickReplyId
      );
      const topAuthorId = top?.authorId;
      if (!topAuthorId) {
        setChat(null);
        return;
      }

      const meIsOwner = me.id === post.ownerId;
      const meIsTopAuthor = me.id === topAuthorId;

      // Only these two people can be in the chat
      if (!meIsOwner && !meIsTopAuthor) {
        setChat(null);
        return;
      }

      const otherId = meIsOwner ? topAuthorId : post.ownerId;

      // If the chat is pointing at the wrong person, correct it
      if (chat.otherUserId !== otherId) {
        setChat({ postId: post.id, otherUserId: otherId });
        return;
      }

      // If the current otherUserId can’t open chat anymore, close it
      if (!canOpenChatForPost(post, otherId)) {
        setChat(null);
      }
    }
  }, [me.id, posts, chat]);

  // -------------------- AUTOSAVE (V1) --------------------
  // -------------------- AUTOSAVE (V1) --------------------

// Strip heavy fields before saving (prevents localStorage quota + jank)
function postsForStorage(list) {
  if (!Array.isArray(list)) return [];
  return list.map((p) => {
    if (!p || typeof p !== 'object') return p;
    // drop base64 photos from storage (keep in-memory only)
    if (p.photo && typeof p.photo === 'string' && p.photo.startsWith('data:')) {
      const { photo, ...rest } = p;
      return rest;
    }
    return p;
  });
}

// Debounce saves so typing / toggles don't freeze the UI
useEffect(() => {
  const t = setTimeout(() => {
    saveAppState({
      posts: postsForStorage(posts),
      activity,
      npPointsByUser,
      replyStats,
      homeCenters,
      radiusByUser,
      chats,
      lastRead,
      activeTab,
      homeChip,
      homeShowAll,
      homeQuery,
      homeFollowOnly,
      followsByUser,
      savedSearches,
      activeSavedSearchId,
    });
  }, 1200);

  return () => clearTimeout(t);
}, [
  posts,
  activity,
  npPointsByUser,
  replyStats,
  homeCenters,
  radiusByUser,
  chats,
  lastRead,
  activeTab,
  homeChip,
  homeShowAll,
  homeQuery,
  homeFollowOnly,
  followsByUser,
  savedSearches,
  activeSavedSearchId,
]);

  // ---------- UI COMPONENTS ----------
  function HomeSetupModal() {
    const [townKey, setTownKey] = useState(() => {
      const guess = me.location && TOWN_CENTERS[me.location] ? me.location : '';
      return guess || TOWN_KEYS[0] || '';
    });
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);

    const currentLabel = homeCenter?.label || me.location || 'Not set';

    function chooseTown() {
      setErr('');
      const c = TOWN_CENTERS[townKey];
      if (!c) return setErr('Choose a town.');
      saveHomeCenterForMe({
        ...c,
        label: townKey,
        source: 'town',
        townKey,
        updatedAt: NOW(),
      });
      setModal(null);
    }

    function useMyLocation() {
      setErr('');
      if (!navigator.geolocation) {
        setErr('Location isn’t supported on this device/browser.');
        return;
      }

      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLoading(false);
          const lat = pos?.coords?.latitude;
          const lng = pos?.coords?.longitude;

          if (typeof lat !== 'number' || typeof lng !== 'number') {
            setErr('Couldn’t read your location. Try choosing a town instead.');
            return;
          }

          saveHomeCenterForMe({
            lat,
            lng,
            label: 'My location',
            source: 'gps',
            updatedAt: NOW(),
          });
          setModal(null);
        },
        () => {
          setLoading(false);
          setErr(
            'Couldn’t get location. Allow location access or choose a town.'
          );
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 }
      );
    }

    return (
      <div className="nb-modal-backdrop" onClick={() => setModal(null)}>
        <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
          <div className="nb-modal-head">
            <div className="nb-modal-title">Set home center</div>
            <button
              className="nb-x"
              onClick={() => setModal(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="nb-modal-sub">
            Your feed filters by distance from your home center. Phase 1 uses
            town centers (not addresses).
          </div>

          <div style={{ padding: '14px', display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 950 }}>Current: {currentLabel}</div>

            <button
              type="button"
              className="nb-btn nb-btn-primary"
              onClick={useMyLocation}
              disabled={loading}
              title="Use your device location"
            >
              {loading ? 'Getting location…' : 'Use my location'}
            </button>

            <div
              style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}
            >
              <div style={{ fontWeight: 950, marginBottom: 8 }}>
                Or choose a town
              </div>

              <select
                className="nb-input"
                value={townKey}
                onChange={(e) => {
                  setTownKey(e.target.value);
                  setErr('');
                }}
              >
                {TOWN_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="nb-btn nb-btn-ghost"
                style={{ marginTop: 10, width: '100%' }}
                onClick={chooseTown}
                disabled={!townKey}
              >
                Save town center
              </button>
            </div>

            {err ? <div className="nb-error">{err}</div> : null}
          </div>

          <div className="nb-modal-foot">
            <div className="nb-muted">Change this anytime from Home.</div>
            <div className="nb-modal-actions">
              <button
                className="nb-btn nb-btn-primary"
                onClick={() => setModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function UserBadge({ userId, showText = false }) {
    const pts = npPointsByUser?.[userId] || 0;
    const label = badgeFor(pts); // e.g. "🌱 Seedling"
    const { emoji, name } = badgeParts(label);

    return (
      <span
        title={`${name} • ${pts} NP`}
        style={{
          marginLeft: 6,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          opacity: 0.9,
        }}
      >
        <span aria-hidden="true">{emoji}</span>
        {showText ? (
          <span
            style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 900 }}
          >
            {name}
          </span>
        ) : null}
      </span>
    );
  }

  function Header() {
    const titleMap = {
      home: 'Your Feed',
      post: 'Create',
      activity: 'Activity',
      profile: 'Profile',
    };

    const subtitle =
      activeTab === 'home'
        ? me.tagline || 'Little missions, big city.'
        : activeTab === 'post'
        ? postFlow.step === 'chooser'
          ? 'Create a structured post.'
          : postFlow.kind === 'help'
          ? 'Post a “Need a hand” request.'
          : 'Ask for a recommendation.'
        : activeTab === 'activity'
        ? 'Bookings, replies, and updates.'
        : 'How neighbors see you.';

    return (
      <div className="nb-header">
        <div className="nb-header-left">
          <img className="nb-logo" src={NEIGHBLOOM_LOGO} alt="Neighbloom" />
          <div className="nb-titlewrap">
            <div className="nb-title">
              {titleMap[activeTab] || 'Neighbloom'}
            </div>
            <div className="nb-subtitle">{subtitle}</div>
          </div>
        </div>

        <div className="nb-header-right">
          <button
            type="button"
            className="nb-pill nb-pill-ghost nb-pillbtn"
            title="Neighbor Points"
            onClick={() => setModal({ type: 'points' })}
          >
            <span className="nb-pill-text">NP</span>
            <span className="nb-pill-strong">{npPoints}</span>
          </button>

          <button
            className="nb-iconbtn"
            aria-label="Activity"
            title="Activity"
            onClick={() => setActiveTab('activity')}
          >
            🔔
          </button>

          <button
            className="nb-avatarbtn"
            aria-label="Profile"
            title="Profile"
            onClick={() => setActiveTab('profile')}
          >
            <img className="nb-avatar sm" src={me.avatar} alt={me.name} />
          </button>
        </div>
      </div>
    );
  }

  function BottomTabs() {
    // total unread across chats involving me (for the badge on Activity)
    const totalUnread = (() => {
      let sum = 0;
      const obj = chats && typeof chats === 'object' ? chats : {};
      for (const chatId of Object.keys(obj)) {
        const pair = String(chatId).split('::')[1] || '';
        if (!pair.split('|').includes(me.id)) continue;
        sum += unreadCount(chatId, me.id);
      }
      return sum;
    })();

    const unreadLabel = totalUnread > 9 ? '9+' : String(totalUnread);

    function go(tab) {
      // kill overlays that can make it FEEL like tabs don't work
      setChat(null);
      setThread(null);
      setModal(null);

      if (tab === 'post') setPostFlow({ step: 'chooser', kind: null });
      setActiveTab(tab);
    }

    return (
      <div className="nb-bottomtabs" role="navigation" aria-label="Primary">
        <button
          type="button"
          className={`nb-tabbtn ${activeTab === 'home' ? 'is-active' : ''}`}
          onClick={() => go('home')}
        >
          <span className="nb-tabicon" aria-hidden="true">🏠</span>
          <span className="nb-tablabel">Home</span>
        </button>

        <button
          type="button"
          className={`nb-tabbtn ${activeTab === 'post' ? 'is-active' : ''}`}
          onClick={() => go('post')}
        >
          <span className="nb-tabicon" aria-hidden="true">➕</span>
          <span className="nb-tablabel">Post</span>
        </button>

        <button
          type="button"
          className={`nb-tabbtn ${activeTab === 'activity' ? 'is-active' : ''}`}
          onClick={() => go('activity')}
        >
          <span className="nb-tabicon" aria-hidden="true">🔔</span>
          <span className="nb-tablabel">Activity</span>

          {totalUnread > 0 ? (
            <span className="nb-tabbadge" aria-label={`${totalUnread} unread chats`}>
              {unreadLabel}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          className={`nb-tabbtn ${activeTab === 'profile' ? 'is-active' : ''}`}
          onClick={() => go('profile')}
        >
          <span className="nb-tabicon" aria-hidden="true">👤</span>
          <span className="nb-tablabel">Profile</span>
        </button>
      </div>
    );
  }

  function Chips() {
    return (
      <div className="nb-chips">
        <button
          className={`nb-chip ${homeChip === 'all' ? 'is-active' : ''}`}
          onClick={() => setHomeChip('all')}
        >
          All
        </button>
        <button
          className={`nb-chip ${homeChip === 'help' ? 'is-active' : ''}`}
          onClick={() => setHomeChip('help')}
        >
          Need a hand
        </button>
        <button
          className={`nb-chip ${homeChip === 'rec' ? 'is-active' : ''}`}
          onClick={() => setHomeChip('rec')}
        >
          Recommendations
        </button>
      </div>
    );
  }

  function HomeToggles() {
    return (
      <div className="nb-home-toggles">
        <div className="nb-seg nb-seg-compact">
          <button
            type="button"
            className={`nb-segbtn ${!homeShowAll ? 'is-on' : ''}`}
            onClick={() => setHomeShowAll(false)}
          >
            Open
          </button>
          <button
            type="button"
            className={`nb-segbtn ${homeShowAll ? 'is-on' : ''}`}
            onClick={() => setHomeShowAll(true)}
          >
            All
          </button>
        </div>
      </div>
    );
  }

  function EmptyState({ title, body, ctaLabel, onCta }) {
    return (
      <div className="nb-empty">
        <div className="nb-empty-card">
          <div className="nb-empty-title">{title}</div>
          <div className="nb-empty-body">{body}</div>
          {ctaLabel ? (
            <button className="nb-btn nb-btn-primary" onClick={onCta}>
              {ctaLabel}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  function PostMetaLine({ post }) {
    const owner = usersById[post.ownerId];
    const statusLabel =
      post.status === 'resolved'
        ? 'Resolved'
        : post.kind === 'help' && post.stage !== 'open'
        ? `Help: ${post.stage}`
        : 'Open';

    return (
      <div className="nb-card-meta">
        <div className="nb-meta-left">
          <img
            className="nb-avatar"
            src={owner?.avatar}
            alt={owner?.name}
            onClick={() =>
              setModal({ type: 'user_profile', userId: post.ownerId })
            }
            style={{ cursor: 'pointer' }}
            title="View profile"
          />
          <div className="nb-meta-text">
            <div
              className="nb-meta-name"
              onClick={() =>
                setModal({ type: 'user_profile', userId: post.ownerId })
              }
              style={{ cursor: 'pointer' }}
              title="View profile"
            >
              {owner?.name}
              <UserBadge userId={post.ownerId} />
              <span className="nb-handle">{owner?.handle}</span>
            </div>
            <div className="nb-meta-sub">
              {timeAgo(post.createdAt)} · {owner?.location}
            </div>
          </div>
        </div>

        <div
          className={`nb-status ${
            post.status === 'resolved' ? 'is-resolved' : ''
          }`}
        >
          {statusLabel}
        </div>
      </div>
    );
  }

  function ReplyList({ post }) {
    const isOwner = post.ownerId === me.id;
    const open = !!expandedThreads[post.id];
    const visibleReplies = (post.replies || []).filter((r) => !r.hidden);

    if (!open) return null;

    if (!visibleReplies.length) {
      return (
        <div className="nb-thread-empty">
          {post.kind === 'rec' ? (
            <>
              <div className="nb-thread-empty-title">
                No recommendations yet
              </div>
              <div className="nb-thread-empty-sub">
                Add a name + why they’re good (pricing, turnaround, warranty).
              </div>
            </>
          ) : (
            <>
              <div className="nb-thread-empty-title">No volunteers yet</div>
              <div className="nb-thread-empty-sub">
                Reply with your timing + what you can do. Keep it outdoor-only.
              </div>
            </>
          )}
        </div>
      );
    }

    const isHelp = post.kind === 'help';

    const helpersNeeded = isHelp ? getHelpersNeeded(post) : 1;
    const selectedIds = isHelp ? getSelectedHelperIds(post) : [];

    const hasChosen = isHelp && selectedIds.length > 0;
    const slotsFull = isHelp && selectedIds.length >= helpersNeeded;

    const chosenReplies = hasChosen
      ? visibleReplies.filter((r) => selectedIds.includes(r.authorId))
      : [];

    const otherReplies = hasChosen
      ? visibleReplies.filter((r) => !selectedIds.includes(r.authorId))
      : visibleReplies;

    const otherCount = hasChosen ? otherReplies.length : 0;
    const othersOpen = expandedOtherVols.has(post.id);

    const listToRender = hasChosen
      ? [...chosenReplies, ...(othersOpen ? otherReplies : [])]
      : visibleReplies;

    return (
      <div className="nb-thread">
        {hasChosen ? (
          <div style={{ margin: '6px 0 10px' }}>
            {otherCount > 0 ? (
              <button
                type="button"
                className="nb-btn nb-btn-ghost nb-btn-sm"
                onClick={() => toggleOtherVols(post.id)}
                style={{ width: '100%', justifyContent: 'space-between' }}
                title="Show or hide other volunteers"
              >
                <span style={{ fontWeight: 900 }}>
                  {othersOpen ? 'Hide' : 'Show'} other volunteers ({otherCount})
                </span>
                <span aria-hidden="true" style={{ opacity: 0.8 }}>
                  {othersOpen ? '▴' : '▾'}
                </span>
              </button>
            ) : (
              <div
                style={{ color: 'var(--muted)', fontWeight: 850, fontSize: 12 }}
              >
                No other volunteers.
              </div>
            )}
          </div>
        ) : null}

        {listToRender.map((r) => {
          const u = usersById[r.authorId];
          const canOwnerActions = isOwner && r.authorId !== me.id;
          const hearts = Array.isArray(r.hearts) ? r.hearts : [];
          const heartCount = hearts.length;
          const iHearted = hearts.includes(me.id);

          const comments = getRecComments(r);

          const isChosenHelper = isHelp && selectedIds.includes(r.authorId);
          const canChooseThis =
            canOwnerActions && isHelp && !slotsFull && !isChosenHelper;

          const chatOtherUserId = isOwner ? r.authorId : post.ownerId;

          // Owner: show Open chat only on selected helpers’ rows
          // Helper: show Open chat only on THEIR OWN row (and only if they were selected)
          const canChatThis =
            isHelp &&
            (isOwner
              ? isChosenHelper && canOpenChatForPost(post, r.authorId)
              : r.authorId === me.id &&
                selectedIds.includes(me.id) &&
                canOpenChatForPost(post, post.ownerId));

          return (
            <div key={r.id} className="nb-reply">
              <img
                className="nb-avatar sm"
                src={u?.avatar}
                alt={u?.name}
                onClick={() =>
                  setModal({ type: 'user_profile', userId: r.authorId })
                }
                style={{ cursor: 'pointer' }}
                title="View profile"
              />
              <div className="nb-reply-body">
                <div className="nb-reply-head">
                  <div
                    className="nb-reply-name"
                    onClick={() =>
                      setModal({ type: 'user_profile', userId: r.authorId })
                    }
                    style={{ cursor: 'pointer' }}
                    title="View profile"
                  >
                    {u?.name}
                    <UserBadge userId={r.authorId} />
                    <span className="nb-handle">{u?.handle}</span>
                  </div>
                  <div className="nb-reply-time">{timeAgo(r.createdAt)}</div>
                </div>

                <div className="nb-reply-text">{r.text}</div>

                <div className="nb-reply-tags">
                  {isHelp && isChosenHelper ? (
                    <span className="nb-tag top">Selected</span>
                  ) : null}
                  {r.topPick ? (
                    <span className="nb-tag top">Top pick</span>
                  ) : null}
                  {r.helpful ? <span className="nb-tag">Helpful</span> : null}
                </div>

                <div className="nb-reply-actions">
                  {/* -------- REC reply actions -------- */}
                  {post.kind === 'rec' ? (
                    <>
                      {/* Owner-only moderation */}
                      {canOwnerActions ? (
                        <>
                          <button
                            className="nb-link"
                            onClick={() => markHelpful(post.id, r.id)}
                          >
                            {r.helpful ? 'Unmark helpful' : 'Mark helpful'}
                          </button>

                          <button
                            className="nb-link"
                            onClick={() => setTopPick(post.id, r.id)}
                            disabled={r.topPick}
                            title={
                              r.topPick
                                ? 'Current Top pick'
                                : 'Choose this as Top pick'
                            }
                          >
                            {r.topPick ? 'Top pick chosen' : 'Set Top pick'}
                          </button>
                        </>
                      ) : null}

                      {/* Chat CTA (only for unlocked top pick pair) */}
                      {post.allowChatAfterTopPick &&
                      post.topPickReplyId === r.id &&
                      canOpenChatForPost(post, chatOtherUserId) ? (
                        <button
                          className="nb-link"
                          onClick={() => openChat(post.id, chatOtherUserId)}
                          title="Open private chat (unlocked by Top pick)"
                        >
                          Open chat
                        </button>
                      ) : null}

                      {/* Hearts (everyone) */}
                      <button
                        className="nb-link"
                        onClick={() => toggleHeart(post.id, r.id)}
                        title="Agree with this recommendation"
                      >
                        {iHearted ? '❤️' : '🤍'}{' '}
                        {heartCount > 0 ? `(${heartCount})` : ''}
                      </button>

                      {/* Reply opens THREAD viewer (everyone can view, not forced to post) */}
                      <button
                        className="nb-link"
                        onClick={() =>
                          setThread({ postId: post.id, replyId: r.id })
                        }
                        title="View the comment thread (you don’t have to post)"
                      >
                        Reply{' '}
                        {comments.length > 0 ? `(${comments.length})` : ''}
                      </button>
                    </>
                  ) : null}

                  {/* -------- HELP reply actions -------- */}
                  {isHelp ? (
                    <>
                      {canChooseThis ? (
                        <button
                          className="nb-link"
                          onClick={() => chooseOneForChat(post.id, r.authorId)}
                          title="Select this helper"
                        >
                          {helpersNeeded > 1
                            ? `Choose helper (${selectedIds.length}/${helpersNeeded})`
                            : 'Choose helper'}
                        </button>
                      ) : null}

                      {canChatThis ? (
                        <button
                          className="nb-link"
                          onClick={() => openChat(post.id, chatOtherUserId)}
                          title="Open chat"
                        >
                          Open chat
                        </button>
                      ) : null}

                      {canOwnerActions && slotsFull && !isChosenHelper ? (
                        <span
                          className="nb-muted small"
                          style={{ fontWeight: 900 }}
                        >
                          Slots filled
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function PostCard({ post }) {
    const isOwner = post.ownerId === me.id;
    const open = !!expandedThreads[post.id];
    const repliesVisible = (post.replies || []).filter((r) => !r.hidden);
    const replyCount = repliesVisible.length;

    const threadLabel =
      post.kind === 'rec'
        ? `Recommendations (${replyCount})`
        : `Volunteers (${replyCount})`;

    const helpersNeeded =
      post.kind === 'help' ? Math.max(1, Number(post.helpersNeeded || 1)) : 1;

      const rulesRow =
      post.kind === 'rec'
        ? 'Share a name + why you trust them'
        : `No indoor entry • ${helpersNeeded} helper${
            helpersNeeded > 1 ? 's' : ''
          } needed • +20 NP after confirmed`;

    const canReply =
      post.status !== 'resolved' &&
      !isOwner &&
      (post.kind === 'rec' || post.kind === 'help');

    const replyBtnLabel = post.kind === 'rec' ? 'Recommend' : 'Volunteer';

    const remaining = remainingRepliesToday(post.kind);

    const selectedHelperIds =
      post.kind === 'help' ? getSelectedHelperIds(post) : [];

    const showChatButton = (() => {
      if (post.kind !== 'help') return false;
      if (selectedHelperIds.length === 0) return false;

      const meIsOwner = me.id === post.ownerId;
      const meIsSelected = selectedHelperIds.includes(me.id);

      // Owner: only show on card if exactly ONE helper selected (otherwise ambiguous)
      if (meIsOwner) return selectedHelperIds.length === 1;

      // Selected helper: always OK (only chats with owner)
      if (meIsSelected) return true;

      return false;
    })();

    const chatOtherUserId = (() => {
      if (post.kind !== 'help') return null;
      if (selectedHelperIds.length === 0) return null;

      const meIsOwner = me.id === post.ownerId;

      if (meIsOwner)
        return selectedHelperIds.length === 1 ? selectedHelperIds[0] : null;
      if (selectedHelperIds.includes(me.id)) return post.ownerId;

      return null;
    })();

    return (
      <div className="nb-card">
        <PostMetaLine post={post} />

        <div className="nb-card-main">
          <div className="nb-card-title">{post.title}</div>
          {post.kind === 'help' && post.photo ? (
            <img className="nb-card-photo" src={post.photo} alt="" />
          ) : null}

          <div className="nb-meta-chips">
            {/* At-a-glance (no duplicates) */}
            {post.kind === 'help' ? (
              <div className="nb-meta-chips">
                <span
                  className={`nb-meta-chip ${
                    post.helpType === 'need' ? 'accent' : ''
                  }`}
                >
                  {post.helpType === 'need' ? 'Need' : 'Offer'}
                </span>
                <span className="nb-meta-chip">{post.category}</span>
                <span className="nb-meta-chip">{post.area}</span>
                {post.whenRange ? (
                  <span className="nb-meta-chip">{post.whenRange}</span>
                ) : null}
              </div>
            ) : null}

            {post.kind === 'rec' ? (
              <>
                <div className="nb-meta-chips">
                  <span className="nb-meta-chip accent">Recommendation</span>
                  <span className="nb-meta-chip">{post.recCategory}</span>
                  <span className="nb-meta-chip">{post.area}</span>

                  {effectiveRecPrefTags(post)
                    .slice(0, 2)
                    .map((t) => (
                      <span key={t} className="nb-meta-chip accent">
                        {t}
                      </span>
                    ))}
                </div>

                {post.preferences || post.constraints ? (
                  <div className="nb-constraints">
                    <span className="nb-constraints-label">Preferences:</span>{' '}
                    {post.preferences || post.constraints}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className={`nb-card-details ${open ? '' : 'is-clamped'}`}>
            {post.details}
          </div>

          <div className="nb-rules-row">
            <span className="nb-rules-dot" />
            <span>{rulesRow}</span>
          </div>

          <div className="nb-card-actions">
            {canReply ? (
              <button
                className="nb-btn nb-btn-primary"
                onClick={() =>
                  setModal({
                    type: 'reply',
                    postId: post.id,
                    mode: post.kind === 'rec' ? 'suggest' : 'offer',
                  })
                }
              >
                {replyBtnLabel}
              </button>
            ) : null}

            {showChatButton ? (
              <button
                className="nb-btn nb-btn-ghost"
                onClick={() => openChat(post.id, chatOtherUserId)}
              >
                Open chat
              </button>
            ) : null}

            {isOwner && post.status !== 'resolved' ? (
              <button
                className="nb-btn nb-btn-ghost"
                onClick={() => setResolved(post.id)}
              >
                Mark resolved
              </button>
            ) : null}

            {isOwner &&
            post.kind === 'help' &&
            ((Array.isArray(post.selectedUserIds) &&
              post.selectedUserIds.length > 0) ||
              !!post.selectedUserId) ? (
              <div className="nb-helpflow">
                <button
                  className={`nb-mini ${
                    post.stage === 'booked' ? 'is-on' : ''
                  }`}
                  onClick={() => advanceHelpStage(post.id, 'booked')}
                >
                  Booked
                </button>

                <button
                  className={`nb-mini ${
                    post.stage === 'started' ? 'is-on' : ''
                  }`}
                  onClick={() => advanceHelpStage(post.id, 'started')}
                >
                  Started
                </button>

                <button
                  className={`nb-mini ${post.stage === 'done' ? 'is-on' : ''}`}
                  onClick={() => advanceHelpStage(post.id, 'done')}
                >
                  Done
                </button>

                <button
                  className={`nb-mini ${
                    post.stage === 'confirmed' ? 'is-on' : ''
                  }`}
                  onClick={() => confirmHelp(post.id)}
                  title="Awards NP points only when confirmed"
                >
                  Confirm
                </button>
              </div>
            ) : null}

            <button
              type="button"
              className="nb-btn nb-btn-ghost nb-btn-sm"
              onClick={() => toggleThread(post.id)}
            >
              {open ? 'Hide' : 'Show'} {threadLabel}
            </button>
          </div>

          <ReplyList post={post} />
        </div>
      </div>
    );
  }

  function PointsModal() {
    const points = npPoints;
    const current =
      BADGES.slice()
        .reverse()
        .find((b) => points >= b.min) || BADGES[0];
    const next = BADGES.find((b) => points < b.min) || null;

    const prevMin = current.min;
    const nextMin = next ? next.min : prevMin;
    const denom = next ? Math.max(1, nextMin - prevMin) : 1;
    const progress = next ? Math.min(1, (points - prevMin) / denom) : 1;
    const toNext = next ? Math.max(0, nextMin - points) : 0;
    const levels = BADGES.map((b, i) => {
      const parts = String(b.name || '').split(' ');
      const emoji = parts[0] || '🌱';
      const label = parts.slice(1).join(' ') || 'Seedling';

      const nextLevel = BADGES[i + 1] || null;

      const unlockAt = b.min;
      const rangeText = nextLevel
        ? `${b.min}–${nextLevel.min - 1}`
        : `${b.min}+`;

      const unlocked = points >= unlockAt;
      const isCurrent = unlocked && (!nextLevel || points < nextLevel.min);

      return {
        key: `${b.min}_${label}`,
        emoji,
        label,
        unlockAt,
        rangeText,
        desc: BADGE_DETAILS[label] || '',
        unlocked,
        isCurrent,
      };
    });

    return (
      <div className="nb-modal-backdrop" onClick={() => setModal(null)}>
        <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
          <div className="nb-modal-head">
            <div className="nb-modal-title">Badges & Points</div>
            <button
              className="nb-x"
              onClick={() => setModal(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="nb-modal-body-scroll" style={{ padding: 14 }}>
            <div style={{ fontWeight: 980, fontSize: 18 }}>{current.name}</div>
            <div
              style={{
                marginTop: 8,
                fontSize: 44,
                fontWeight: 980,
                letterSpacing: '-.02em',
              }}
            >
              {points}
            </div>
            <div
              style={{ color: 'var(--muted)', fontWeight: 850, marginTop: 6 }}
            >
              Total NP points
            </div>

            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,.08)',
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.round(progress * 100)}%`,
                    background:
                      'linear-gradient(90deg, rgba(255,145,90,.95), rgba(255,106,61,.95))',
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: 10,
                  color: 'var(--muted)',
                  fontWeight: 850,
                }}
              >
                {next
                  ? `${toNext} more points to unlock ${next.name}`
                  : 'Top rank unlocked'}
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: '1px solid var(--border)',
              }}
            >
              <div style={{ fontWeight: 980, fontSize: 14 }}>Levels</div>

              <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                {levels.map((lv) => (
                  <div
                    key={lv.key}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      padding: '10px 12px',
                      borderRadius: 14,
                      border: '1px solid var(--border)',
                      background: lv.isCurrent
                        ? 'rgba(255,145,90,.10)'
                        : 'rgba(255,255,255,.03)',
                    }}
                  >
                    <div
                      style={{ fontSize: 18, lineHeight: '18px' }}
                      aria-hidden="true"
                    >
                      {lv.emoji}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 980, fontSize: 13 }}>
                        {lv.label}{' '}
                        <span
                          style={{
                            color: 'var(--muted)',
                            fontWeight: 850,
                            fontSize: 12,
                          }}
                        >
                          (Unlocks at {lv.unlockAt} NP · Range {lv.rangeText})
                        </span>
                      </div>

                      {lv.desc ? (
                        <div
                          style={{
                            marginTop: 3,
                            color: 'var(--muted)',
                            fontWeight: 850,
                            fontSize: 12,
                          }}
                        >
                          {lv.desc}
                        </div>
                      ) : null}
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 980,
                        color: lv.unlocked ? 'var(--text)' : 'var(--muted)',
                      }}
                    >
                      {lv.isCurrent
                        ? 'Current'
                        : lv.unlocked
                        ? 'Unlocked'
                        : 'Locked'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14, fontWeight: 980 }}>
              How to earn more NP
            </div>
            <div
              style={{
                marginTop: 10,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span className="nb-badge">Confirmed help: +20 NP</span>
              <span className="nb-badge">Be chosen as helper</span>
              <span className="nb-badge">Stay active weekly</span>
            </div>
          </div>

          <div className="nb-modal-foot">
            <div className="nb-muted">NP = Neighbor Points</div>
            <div className="nb-modal-actions">
              <button
                className="nb-btn nb-btn-primary"
                onClick={() => setModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function SavedSearchManageModal({ searchId }) {
    const s = (Array.isArray(savedSearches) ? savedSearches : []).find(
      (x) => x && x.id === searchId && (x.userId || 'me') === me.id
    );
    if (!s) return null;

    const q = normalizeText(s.query);

    const summary = [
      s.homeChip === 'all'
        ? 'All posts'
        : s.homeChip === 'help'
        ? 'Need a hand'
        : 'Recommendations',
      s.homeShowAll ? 'All (incl. resolved)' : 'Open only',
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <div className="nb-modal-backdrop" onClick={() => setModal(null)}>
        <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
          <div className="nb-modal-head">
            <div className="nb-modal-title">Saved search</div>
            <button
              className="nb-x"
              onClick={() => setModal(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="nb-modal-sub">
            <div style={{ fontWeight: 980 }}>{s.name || 'Saved'}</div>
            <div
              style={{ marginTop: 6, color: 'var(--muted)', fontWeight: 850 }}
            >
              {summary}
            </div>

            {q ? (
              <div style={{ marginTop: 10 }}>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 12,
                    color: 'var(--muted)',
                  }}
                >
                  Query
                </div>
                <div style={{ marginTop: 4, fontWeight: 900 }}>{q}</div>
              </div>
            ) : null}
          </div>

          <div className="nb-modal-foot">
            <div className="nb-muted">Rename or delete this saved search.</div>
            <div className="nb-modal-actions">
              <button
                className="nb-btn nb-btn-ghost"
                onClick={() => {
                  const next = window.prompt(
                    'Rename saved search',
                    s.name || ''
                  );
                  if (next == null) return;
                  const clean = normalizeText(next);
                  if (!clean) return;

                  setSavedSearches((prev) =>
                    (Array.isArray(prev) ? prev : []).map((x) =>
                      x && x.id === s.id ? { ...x, name: clean } : x
                    )
                  );
                }}
              >
                Rename
              </button>

              <button
                className="nb-btn nb-btn-ghost"
                onClick={() => {
                  const ok = window.confirm('Delete this saved search?');
                  if (!ok) return;

                  setSavedSearches((prev) =>
                    (Array.isArray(prev) ? prev : []).filter(
                      (x) => x && x.id !== s.id
                    )
                  );

                  if (activeSavedSearchId === s.id) {
                    setActiveSavedSearchId(null);
                  }

                  setModal(null);
                }}
              >
                Delete
              </button>

              <button
                className="nb-btn nb-btn-primary"
                onClick={() => setModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function ReplyModal({ postId, mode }) {
    const post = posts.find((p) => p.id === postId);
    const [text, setText] = useState('');
    const [err, setErr] = useState('');

    if (!post) return null;

    const heading =
      mode === 'suggest'
        ? 'Add a recommendation'
        : mode === 'lead'
        ? 'Share a lead'
        : 'Volunteer to help';

    const helperText =
      post.kind === 'rec'
        ? 'Share who you recommend + why. Be concrete (price, turnaround, quality, who you worked with).'
        : 'Confirm timing + what you can do. Keep it to driveway/sidewalk/yard/porch help — no indoor entry. No payments in-app.';

    const blockHint =
      post.kind === 'rec'
        ? 'Tip: One strong sentence beats a paragraph.'
        : 'Chat opens only after the owner chooses one helper.';

    return (
      <div className="nb-modal-backdrop" onClick={() => setModal(null)}>
        <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
          <div className="nb-modal-head">
            <div className="nb-modal-title">{heading}</div>
            <button
              className="nb-x"
              onClick={() => setModal(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="nb-modal-sub">{helperText}</div>

          <textarea
            className={`nb-input nb-textarea ${err ? 'has-error' : ''}`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setErr('');
            }}
            placeholder={
              post.kind === 'rec'
                ? 'Example: ‘J&J Auto in Oak Lawn — fair pricing, quick turnaround. Ask for Sam.’'
                : 'Example: ‘I can help at 7pm. I have a dolly and straps.’'
            }
          />

          {err ? <div className="nb-error">{err}</div> : null}

          <div className="nb-modal-foot">
            <div className="nb-muted">{blockHint}</div>
            <div className="nb-modal-actions">
              <button
                className="nb-btn nb-btn-ghost"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button
                className="nb-btn nb-btn-primary"
                onClick={() => {
                  const res = submitReply(postId, mode, text);
                  if (!res.ok) setErr(res.error);
                  else setModal(null);
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function RecCommentModal({ postId, replyId }) {
    const post = posts.find((p) => p.id === postId);
    const parent = (post?.replies || []).find((r) => r.id === replyId);
    const [text, setText] = useState('');
    const [err, setErr] = useState('');

    if (!post || !parent) return null;

    const author = usersById[parent.authorId];

    return (
      <div className="nb-modal-backdrop" onClick={() => setModal(null)}>
        <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
          <div className="nb-modal-head">
            <div className="nb-modal-title">Reply to recommendation</div>
            <button
              className="nb-x"
              onClick={() => setModal(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="nb-modal-sub">
            Replying to {author?.name}: “{parent.text}”
          </div>

          <textarea
            className={`nb-input nb-textarea ${err ? 'has-error' : ''}`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setErr('');
            }}
            placeholder="Add something useful (price, what to ask for, your experience, etc.)"
          />

          {err ? <div className="nb-error">{err}</div> : null}

          <div className="nb-modal-foot">
            <div className="nb-muted">Keep it short and specific.</div>
            <div className="nb-modal-actions">
              <button
                className="nb-btn nb-btn-ghost"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button
                className="nb-btn nb-btn-primary"
                onClick={() => {
                  const res = addRecComment(postId, replyId, text);
                  if (!res.ok) setErr(res.error);
                  else setModal(null);
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function RecThreadModal({ postId, replyId }) {
    const post = posts.find((p) => p.id === postId);
    if (!post) return null;

    const rec = (post.replies || []).find(
      (r) => r && !r.hidden && r.id === replyId
    );
    if (!rec) return null;

    const author = usersById[rec.authorId];
    const comments = getRecComments(rec);
    const isTopPickThread = post.topPickReplyId === rec.id;

    const topPickAuthorId = (() => {
      if (!post.allowChatAfterTopPick || !post.topPickReplyId) return null;
      const top = (post.replies || []).find(
        (x) => x && !x.hidden && x.id === post.topPickReplyId
      );
      return top?.authorId || null;
    })();

    const recChatOtherId =
      me.id === post.ownerId ? topPickAuthorId : post.ownerId;

    const canOpenRecChatHere =
      isTopPickThread &&
      !!recChatOtherId &&
      canOpenChatForPost(post, recChatOtherId);

    const [text, setText] = useState('');

    return (
      <div className="nb-modal-backdrop" onClick={() => setThread(null)}>
        <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
          <div className="nb-modal-head">
            <div className="nb-modal-title">Comments</div>
            <button
              className="nb-x"
              onClick={() => setThread(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="nb-modal-sub">
            <div style={{ fontWeight: 950 }}>
              {author?.name || 'Neighbor'} said:
            </div>
            <div
              style={{ marginTop: 8, color: 'var(--text)', fontWeight: 850 }}
            >
              {rec.text}
            </div>
          </div>
          {canOpenRecChatHere ? (
            <div style={{ padding: '0 14px 10px' }}>
              <button
                className="nb-btn nb-btn-ghost nb-btn-sm"
                style={{ width: '100%' }}
                onClick={() => openChat(post.id, recChatOtherId)}
                title="Chat is unlocked for the Top pick"
              >
                Open chat
              </button>
            </div>
          ) : null}
          <div style={{ padding: '14px', maxHeight: 320, overflow: 'auto' }}>
            {comments.length === 0 ? (
              <div className="nb-muted">No comments yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {comments.map((c) => {
                  const u = usersById[c.authorId];
                  return (
                    <div
                      key={c.id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 14,
                        padding: '10px 12px',
                        background: 'rgba(255,255,255,.03)',
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                      }}
                    >
                      <img
                        className="nb-avatar sm"
                        src={u?.avatar || AVATAR}
                        alt={u?.name || 'Neighbor'}
                      />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            gap: 12,
                          }}
                        >
                          <div style={{ fontWeight: 950, fontSize: 13 }}>
                            {u?.name || 'Neighbor'}
                            <UserBadge userId={c.authorId} />
                            {u?.handle ? (
                              <span className="nb-handle">{u.handle}</span>
                            ) : null}
                          </div>

                          <div
                            style={{
                              color: 'var(--muted)',
                              fontWeight: 850,
                              fontSize: 12,
                            }}
                          >
                            {timeAgo(c.createdAt)}
                          </div>
                        </div>

                        <div style={{ marginTop: 6, fontWeight: 850 }}>
                          {c.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="nb-modal-foot">
            <div className="nb-muted">Keep it helpful and specific.</div>
            <div
              className="nb-modal-actions"
              style={{ gap: 10, width: '100%' }}
            >
              <input
                className="nb-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Add a comment…"
                style={{ flex: 1 }}
              />
              <button
                className="nb-btn nb-btn-primary"
                onClick={() => {
                  addRecComment(postId, replyId, text);
                  setText('');
                }}
              >
                Post
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function ChatDrawer() {
    if (!chat) return null;
    const post = posts.find((p) => p.id === chat.postId);
    if (!post) return null;

    const other = usersById[chat.otherUserId];
    const chatId = getChatId(post.id, me.id, chat.otherUserId);
    const rawMsgs = chats[chatId];
    const msgs = Array.isArray(rawMsgs)
      ? rawMsgs.filter(
          (m) => m && typeof m === 'object' && typeof m.text === 'string'
        )
      : [];

    // guard: only show if gated properly
    if (!canOpenChatForPost(post, chat.otherUserId)) {
      const canChat = canOpenChatForPost(post, chat.otherUserId);
      return (
        <div className="nb-chat">
          <div className="nb-chat-head">
            <div className="nb-chat-title">Chat locked</div>
            <button
              className="nb-x"
              onClick={() => setChat(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="nb-chat-body">
            This chat isn’t available yet. It only unlocks after the post owner
            selects one person.
          </div>
        </div>
      );
    }

    return (
      <div className="nb-chat">
        <div className="nb-chat-head">
          <div className="nb-chat-title">
            Chat with {other?.name}
            <UserBadge userId={chat.otherUserId} />
            <span className="nb-handle">{other?.handle}</span>
          </div>
          <button
            className="nb-x"
            onClick={() => setChat(null)}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="nb-chat-sub">{post.title}</div>

        <div className="nb-chat-scroll">
          {msgs.length ? (
            msgs.map((m) => (
              <div
                key={m.id}
                className={`nb-msg ${m.fromId === me.id ? 'me' : 'them'}`}
              >
                <div className="nb-msg-bubble">{m.text}</div>
                <div className="nb-msg-time">{timeAgo(m.ts)}</div>
              </div>
            ))
          ) : (
            <div className="nb-chat-empty">
              No messages yet. Keep it simple: confirm details and next step.
            </div>
          )}
        </div>

        <ChatComposer
          onSend={(text) => sendChatMessage(post.id, chat.otherUserId, text)}
        />
      </div>
    );
  }

  function ChatComposer({ onSend }) {
    const [t, setT] = useState('');
    return (
      <div className="nb-chat-compose">
        <input
          className="nb-input"
          value={t}
          onChange={(e) => setT(e.target.value)}
          placeholder="Message…"
        />
        <button
          className="nb-btn nb-btn-primary"
          onClick={() => {
            onSend(t);
            setT('');
          }}
        >
          Send
        </button>
      </div>
    );
  }

  function HomeHero() {
    return (
      <div className="nb-hero">
        {BUSINESS_MODE ? (
          <div className="nb-hero-bar">
            <div className="nb-hero-bar-left">
              <div className="nb-hero-title">Promote Your Business</div>
              <div className="nb-hero-sub">
                Reach neighbors with local offers
              </div>
            </div>

            <button
              type="button"
              className="nb-hero-cta"
              onClick={() => window.open('mailto:contact@neighbloom.com')}
            >
              Contact Us
            </button>
          </div>
        ) : null}

        <div className="nb-hero-card">
          <div className="nb-hero-card-title">Start something</div>
          <div className="nb-hero-card-sub">
            Ask for a quick hand or request a recommendation.
          </div>

          <div className="nb-hero-actions">
            <button
              type="button"
              className="nb-quickbtn nb-quickbtn-primary"
              onClick={() => {
                setActiveTab('post');
                setPostFlow({ step: 'form', kind: 'help' });
              }}
            >
              Need a hand
            </button>

            <button
              type="button"
              className="nb-quickbtn nb-quickbtn-ghost"
              onClick={() => {
                setActiveTab('post');
                setPostFlow({ step: 'form', kind: 'rec' });
              }}
            >
              Recommendations
            </button>

            <button
              type="button"
              className="nb-herolink"
              onClick={() => {
                setActiveTab('home');
                setHomeChip('help');
                setHomeShowAll(false);
              }}
            >
              Prefer to help?{' '}
              <span className="nb-herolink-accent">Browse requests →</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  function PostChooser() {
    return (
      <div className="nb-page">
        <div className="nb-section">
          <div className="nb-section-title">Create a Post</div>
          <div className="nb-section-sub">
            Posts are structured. That’s the point — keeps spam/scams out.
          </div>

          <div className="nb-grid3">
            <button
              className="nb-choice"
              onClick={() => setPostFlow({ step: 'form', kind: 'help' })}
            >
              <div className="nb-choice-emoji">🧰</div>
              <div className="nb-choice-title">Need a hand</div>
              <div className="nb-choice-sub">
                Post Your Need → Pick Your Helper → Confirm Completion
              </div>
            </button>

            <button
              className="nb-choice"
              onClick={() => setPostFlow({ step: 'form', kind: 'rec' })}
            >
              <div className="nb-choice-emoji">🧠</div>
              <div className="nb-choice-title">Recommendations</div>
              <div className="nb-choice-sub">In-thread only • No DMs</div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  function HelpForm() {
    const helpType = 'need';

    // Primary categories shown as compact segments (premium)
    const PRIMARY_CATS = [
      'Snow shoveling (driveway/sidewalk)',
      'Yard help (raking/bagging)',
      'Trash bins (to/from curb)',
      'Curb-to-curb move',
    ];

    const CAT_SHORT = {
      'Snow shoveling (driveway/sidewalk)': 'Snow',
      'Yard help (raking/bagging)': 'Yard',
      'Trash bins (to/from curb)': 'Bins',
      'Curb-to-curb move': 'Move',
    };

    const TIME_PRESETS = [
      'Anytime today',
      'Today after 5pm',
      'Tomorrow morning',
      'This weekend',
    ];

    const [category, setCategory] = useState(PRIMARY_CATS[0]);
    const [showAllCats, setShowAllCats] = useState(false);

    const [title, setTitle] = useState('');
    const [helpersNeeded, setHelpersNeeded] = useState(1);
    const [area, setArea] = useState(me.location || '');
    const [townKey, setTownKey] = useState(() => inferTownKeyFromText(me.location) || TOWN_KEYS[0] || '');
const [nearText, setNearText] = useState('');

    // Premium Timing: single selector + optional custom field (no chip spam)
    const [whenMode, setWhenMode] = useState(''); // "", preset, "__custom__"
    const [whenCustom, setWhenCustom] = useState('');
    useEffect(() => {
      if (category === 'Curb-to-curb move' && helpersNeeded < 2) {
        setHelpersNeeded(2);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category]);

    const [details, setDetails] = useState('');
    const [photo, setPhoto] = useState(null); // dataURL (local demo only)
    const [err, setErr] = useState('');
    const [photoErr, setPhotoErr] = useState('');

    function clearPhoto() {
      setPhoto(null);
      setPhotoErr('');
    }

    async function onPickPhoto(file) {
      setPhotoErr('');
      if (!file) return;

      if (!file.type || !file.type.startsWith('image/')) {
        setPhotoErr('Choose an image (jpg/png/webp).');
        return;
      }

      // Allow bigger originals since we compress client-side
      if (file.size > 12 * 1024 * 1024) {
        setPhotoErr('That photo is too large. Try a smaller one.');
        return;
      }

      try {
        const { dataUrl } = await compressImageFileToDataUrl(file);
        setPhoto(dataUrl);
      } catch {
        setPhotoErr('Couldn’t process that photo. Try another.');
      }
    }

    function submit() {
      setErr('');
      setPhotoErr('');

      const t = title.trim();
      const a = normalizeText(
        nearText ? `${townKey} (near ${nearText})` : `${townKey}`
      );
      const d = details.trim();

      const whenRange =
        whenMode === '__custom__'
          ? normalizeText(whenCustom)
          : normalizeText(whenMode);

      if (!category) return setErr('Category is required.');
      if (!t) return setErr('Title is required.');
      if (!a) return setErr('Location is required.');
      if (!d) return setErr('Details are required.');
      if (d.length < 12)
        return setErr('Add one more detail (time, size, or constraints).');

      const combined = `${t} ${d}`;

      if (mentionsReward(combined)) {
        return setErr(
          'Payments aren’t supported here. Keep it neighbor-to-neighbor.'
        );
      }

      if (mentionsIndoor(combined)) {
        return setErr(
          'This looks like an indoor request. Post it as a Recommendation instead.'
        );
      }

      const p = {
        id: uid('p'),
        kind: 'help',
        helpType,
        category,
        title: normalizeText(t),
        details: normalizeText(d),
        area: normalizeText(a),
        townKey,
        whenRange,
        helpersNeeded: Math.max(1, Number(helpersNeeded || 1)),
        selectedUserIds: [],
        photo, // local demo only
        status: 'open',
        stage: 'open',
        ownerId: me.id,
        createdAt: NOW(),
        replies: [],
        selectedUserId: null,
      };

      setPosts((prev) => [p, ...prev]);
      pushActivity('Created a help request.');
      setActiveTab('home');
      setHomeChip('help');
      setHomeShowAll(false);
      setPostFlow({ step: 'chooser', kind: null });
    }

    return (
      <div className="nb-page">
        <div className="nb-formhead">
          <button
            className="nb-link"
            onClick={() => setPostFlow({ step: 'chooser', kind: null })}
          >
            ← Back
          </button>
          <div className="nb-formtitle">Need a hand</div>
          <div className="nb-formsub">
            One clear request gets better replies.
          </div>
        </div>

        <div className="nb-form">
          {/* Category (premium segmented + optional More picker) */}
          <div className="nb-row">
            <label className="nb-label">Category</label>

            <div className="nb-seg nb-seg-compact nb-seg-scroll">
              {PRIMARY_CATS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`nb-segbtn ${category === c ? 'is-on' : ''}`}
                  onClick={() => {
                    setCategory(c);
                    setShowAllCats(false);
                    setErr('');
                  }}
                  title={c}
                >
                  {CAT_SHORT[c] || c}
                </button>
              ))}

              <button
                type="button"
                className={`nb-segbtn ${showAllCats ? 'is-on' : ''}`}
                onClick={() => setShowAllCats((v) => !v)}
                title="All categories"
              >
                More
              </button>
            </div>

            {showAllCats ? (
              <select
                className="nb-input"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setErr('');
                }}
              >
                {HELP_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {/* Title */}
<div className="nb-row">
  <label className="nb-label">Title</label>
  <input
    className="nb-input"
    value={title}
    onChange={(e) => {
      setTitle(e.target.value);
      setErr('');
    }}
    placeholder="Example: Need help shoveling my driveway"
  />
</div>
          <div className="nb-row">
  <label className="nb-label">Location</label>

  <select
    className="nb-input"
    value={townKey}
    onChange={(e) => {
      setTownKey(e.target.value);
      setErr('');
    }}
  >
    {TOWN_KEYS.map((k) => (
      <option key={k} value={k}>{k}</option>
    ))}
  </select>

  <input
    className="nb-input"
    value={nearText}
    onChange={(e) => {
      setNearText(e.target.value);
      setErr('');
    }}
    placeholder="Optional: near cross-street or landmark (e.g., near 183rd/Harlem)"
    style={{ marginTop: 10 }}
  />
</div>

          {/* Helpers needed */}
          <div className="nb-row">
            <label className="nb-label">Helpers needed</label>
            <select
              className="nb-input"
              value={helpersNeeded}
              onChange={(e) => setHelpersNeeded(Number(e.target.value))}
            >
              <option value={1}>1 helper</option>
              <option value={2}>2 helpers</option>
              <option value={3}>3 helpers</option>
              <option value={4}>4 helpers</option>
            </select>
            <div className="nb-hintrow">
              Only select more than 1 if it truly requires multiple people
              (heavy item / safety).
            </div>
          </div>

          {/* Timing */}
          <div className="nb-row">
            <label className="nb-label">Timing (optional)</label>

            <select
              className="nb-input"
              value={whenMode}
              onChange={(e) => {
                const v = e.target.value;
                setWhenMode(v);
                if (v !== '__custom__') setWhenCustom('');
                setErr('');
              }}
            >
              <option value="">Not sure yet</option>
              {TIME_PRESETS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="__custom__">Custom…</option>
            </select>

            {whenMode === '__custom__' ? (
              <input
                className="nb-input"
                value={whenCustom}
                onChange={(e) => {
                  setWhenCustom(e.target.value);
                  setErr('');
                }}
                placeholder="Example: Today 6–8pm"
              />
            ) : null}
          </div>

          {/* Photo */}
          <div className="nb-row">
            <label className="nb-label">Photo (optional)</label>

            <div className="nb-photorow">
              <input
                id="nb_help_photo"
                className="nb-file"
                type="file"
                accept="image/*"
                onChange={(e) => onPickPhoto(e.target.files?.[0])}
              />
              <label
                htmlFor="nb_help_photo"
                className="nb-btn nb-btn-ghost nb-filebtn"
              >
                {photo ? 'Change photo' : 'Add photo'}
              </label>

              {photo ? (
                <button type="button" className="nb-link" onClick={clearPhoto}>
                  Remove
                </button>
              ) : null}
            </div>

            {photoErr ? <div className="nb-error">{photoErr}</div> : null}
            {photo ? (
              <img className="nb-photopreview" src={photo} alt="Preview" />
            ) : null}
          </div>

          {/* Details */}
          <div className="nb-row">
            <div className="nb-labelrow">
              <label className="nb-label">Details</label>
              <span className="nb-muted small">{details.length}/400</span>
            </div>

            <textarea
              className={`nb-input nb-textarea ${err ? 'has-error' : ''}`}
              value={details}
              onChange={(e) => {
                setDetails(e.target.value);
                setErr('');
              }}
              maxLength={400}
              placeholder="Add the key details…"
            />

            <div className="nb-hintrow">
              Include time estimate, tools you have, and anything tricky
              (stairs, ice, parking).
            </div>
          </div>

          {err ? <div className="nb-error">{err}</div> : null}

          <div className="nb-formactions">
            <button
              className="nb-btn nb-btn-ghost"
              onClick={() => setPostFlow({ step: 'chooser', kind: null })}
            >
              Cancel
            </button>
            <button className="nb-btn nb-btn-primary" onClick={submit}>
              Post
            </button>
          </div>
        </div>
      </div>
    );
  }

  function RecForm() {
    const [recCategory, setRecCategory] = useState('Mechanic');
    const [customCategory, setCustomCategory] = useState('');
    const [area, setArea] = useState(me.location || '');
    const [townKey, setTownKey] = useState(() => inferTownKeyFromText(me.location) || TOWN_KEYS[0] || '');
const [nearText, setNearText] = useState('');
    const [question, setQuestion] = useState('');
    const [preferences, setPreferences] = useState('');
    const [prefTags, setPrefTags] = useState([]);
    const [allowChatAfterTopPick, setAllowChatAfterTopPick] = useState(false);
    const [err, setErr] = useState('');

    const isCustom = recCategory === '__custom__' || recCategory === 'Other';
    const effectiveCategory = isCustom
      ? normalizeText(customCategory)
      : normalizeText(recCategory);

    const titlePreview = buildRecTitle(
      effectiveCategory || (isCustom ? 'Service' : recCategory),
      normalizeText(area)
    );

    function toggleTag(tag) {
      setPrefTags((prev) => {
        const next = new Set(prev);
        if (next.has(tag)) next.delete(tag);
        else next.add(tag);
        return Array.from(next);
      });
    }

    function submit() {
      setErr('');

      const a = normalizeText(area);
      const q = normalizeText(question);
      const typedPref = normalizeText(preferences);

      if (!a) return setErr('Location is required.');
      if (!q) return setErr('Write what you’re looking for.');
      if (q.length < 12)
        return setErr('Add one more detail so replies are useful.');

      if (isCustom) {
        if (!effectiveCategory) return setErr('Custom category is required.');
        if (effectiveCategory.length < 3)
          return setErr('Custom category is too short.');
      } else {
        if (!recCategory) return setErr('Category is required.');
      }

      const tags = prefTags.map(normalizeText).filter(Boolean);

      // Build a single clean preferences string (chips + typed)
      const pieces = [];
      const seen = new Set();
      for (const x of [...tags, typedPref]) {
        if (!x) continue;
        const k = x.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        pieces.push(x);
      }
      const prefFinal = pieces.join(' • ');

      if (containsLink(`${q} ${prefFinal}`)) {
        return setErr('Links aren’t allowed. Just share names + why.');
      }

      const catFinal = effectiveCategory || recCategory;

      const p = {
        id: uid('p'),
        kind: 'rec',
        recCategory: catFinal,
        area: a,
        prefTags: tags,
        preferences: prefFinal,
        allowChatAfterTopPick,
        title: buildRecTitle(catFinal, a),
        details: q,
        status: 'open',
        ownerId: me.id,
        createdAt: NOW(),
        replies: [],
        topPickReplyId: null,
      };

      setPosts((prev) => [p, ...prev]);
      pushActivity('Created a recommendation request.');
      setActiveTab('home');
      setHomeChip('rec');
      setHomeShowAll(false);
      setPostFlow({ step: 'chooser', kind: null });
    }

    return (
      <div className="nb-page">
        <div className="nb-formhead">
          <button
            className="nb-link"
            onClick={() => setPostFlow({ step: 'chooser', kind: null })}
          >
            ← Back
          </button>
          <div className="nb-formtitle">Recommendations</div>
          <div className="nb-formsub">
            Ask a specific question. Neighbors reply publicly.
          </div>
        </div>

        <div className="nb-form">
          <div className="nb-row">
            <label className="nb-label">What are you looking for?</label>
            <select
              className="nb-input"
              value={recCategory}
              onChange={(e) => {
                const v = e.target.value;
                setRecCategory(v);
                if (v !== '__custom__') setCustomCategory('');
                setErr('');
              }}
            >
              {REC_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === '__custom__' ? 'Custom…' : c}
                </option>
              ))}
            </select>

            {isCustom ? (
              <input
                className="nb-input"
                value={customCategory}
                onChange={(e) => {
                  setCustomCategory(e.target.value);
                  setErr('');
                }}
                placeholder="Type what it is (e.g., Car detailer, Tax prep, Drywall, Photographer)"
                style={{ marginTop: 10 }}
              />
            ) : null}

            <div className="nb-hintrow">
              Title preview:{' '}
              <span style={{ fontWeight: 900 }}>{titlePreview}</span>
            </div>
          </div>

          <div className="nb-row">
            <label className="nb-label">Where?</label>
            <input
              className="nb-input"
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                setErr('');
              }}
              placeholder="Example: Worth / Oak Lawn"
            />
          </div>

          <div className="nb-row">
            <label className="nb-label">What do you need?</label>
            <textarea
              className={`nb-input nb-textarea ${err ? 'has-error' : ''}`}
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                setErr('');
              }}
              placeholder="Example: Need brakes + general maintenance. Looking for fair pricing + no upsell. Who do you trust and why?"
            />
          </div>

          <div className="nb-row">
            <label className="nb-label">Quick preferences (tap to add)</label>
            <div className="nb-seg nb-seg-compact nb-seg-scroll">
              {REC_PREF_TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`nb-segbtn ${prefTags.includes(t) ? 'is-on' : ''}`}
                  onClick={() => toggleTag(t)}
                  title="Tap to toggle"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="nb-row">
            <label className="nb-label">More preferences (optional)</label>
            <textarea
              className="nb-input nb-textarea"
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              placeholder="Anything specific? (price range, warranty, weekend hours, etc.)"
            />
          </div>

          <div className="nb-row inline">
            <label className="nb-label">
              Enable private chat after Top pick
            </label>
            <button
              className={`nb-toggle ${allowChatAfterTopPick ? 'is-on' : ''}`}
              onClick={() => setAllowChatAfterTopPick((v) => !v)}
              type="button"
              title="Still no DMs by default — only unlocks after you choose a Top pick."
            >
              {allowChatAfterTopPick ? 'Yes' : 'No'}
            </button>
          </div>

          {err ? <div className="nb-error">{err}</div> : null}

          <div className="nb-formactions">
            <button
              className="nb-btn nb-btn-ghost"
              onClick={() => setPostFlow({ step: 'chooser', kind: null })}
            >
              Cancel
            </button>
            <button className="nb-btn nb-btn-primary" onClick={submit}>
              Post
            </button>
          </div>
        </div>
      </div>
    );
  }

  function PostTab() {
    if (postFlow.step === 'chooser') return <PostChooser />;
    if (postFlow.kind === 'help') return <HelpForm />;
    if (postFlow.kind === 'rec') return <RecForm />;
    return <PostChooser />;
  }

  function ActivityTab() {
    const visibleActivity = useMemo(() => {
  const list = Array.isArray(activity) ? activity : [];
  return list.filter((a) => {
    if (!a || typeof a !== 'object') return false;
    const aud = Array.isArray(a.audienceIds) ? a.audienceIds : [];
    return aud.includes(me.id);
  });
}, [activity, me.id]);
    const shownChatCtas = new Set(); // dedupe per thread (newest event wins)

    return (
      <div className="nb-page">
        <div className="nb-section">
          <div className="nb-section-title">Activity</div>
          <div className="nb-section-sub">
            Replies, chat unlocks, and resolution updates show up here.
          </div>
        </div>

        {visibleActivity.length === 0 ? (
          <EmptyState
            title="No activity yet"
            body="That usually means nobody is posting. The fastest fix: create one structured post."
            ctaLabel="Go to Home"
            onCta={() => setActiveTab('home')}
          />
        ) : (
          <div className="nb-list">
            {visibleActivity.map((a) => {
              const isChatEvent =
                a?.type === 'chat_unlocked' || a?.type === 'chat_message';
              const post = a?.postId
                ? posts.find((p) => p.id === a.postId)
                : null;
              const otherId = otherIdFromActivity(a, me.id);

              const canCta =
                isChatEvent &&
                post &&
                otherId &&
                canOpenChatForPost(post, otherId);

              // thread key based on the two participants (not viewer)
              const threadKey = canCta
                ? getChatId(a.postId, a.actorId, a.otherUserId)
                : null;

              const showCta =
                canCta && threadKey && !shownChatCtas.has(threadKey);
              if (showCta) shownChatCtas.add(threadKey);

              const viewerChatId = canCta
                ? getChatId(post.id, me.id, otherId)
                : null;
              const unread = viewerChatId
                ? unreadCount(viewerChatId, me.id)
                : 0;
              const unreadLabel = unread > 9 ? '9+' : String(unread);

              return (
                <div key={a.id} className="nb-listitem">
                  <div className="nb-listdot" />
                  <div className="nb-listtext">
                    <div className="nb-listmain">{activityText(a, me.id)}</div>
                    <div className="nb-listsub">{timeAgo(a.ts)}</div>
                  </div>

                  {showCta ? (
                    <button
                      type="button"
                      className="nb-btn nb-btn-ghost nb-btn-sm"
                      onClick={() => openChat(post.id, otherId)}
                    >
                      Open chat
                      {unread > 0 ? (
                        <span
                          aria-label={`${unread} unread`}
                          title={`${unread} unread`}
                          style={{
                            marginLeft: 8,
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            lineHeight: '16px',
                            background: 'rgba(255,145,90,.95)',
                            color: '#111',
                            border: '1px solid rgba(255,255,255,.12)',
                          }}
                        >
                          {unreadLabel}
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const visibleActivity = (activity || []).filter(
    (a) => !a?.audienceIds || a.audienceIds.includes(me.id)
  );

  function ProfilePostRow({ post, onOpen }) {
    const owner = usersById[post.ownerId];
    const isHelp = post.kind === 'help';

    const statusLabel =
      post.status === 'resolved'
        ? 'Resolved'
        : isHelp && post.stage !== 'open'
        ? `Help: ${post.stage}`
        : 'Open';

    return (
      <button type="button" className="nb-postrow" onClick={onOpen}>
        <div className="nb-postrow-left">
          <div className="nb-postrow-title">{post.title}</div>

          <div className="nb-postrow-sub">
            {timeAgo(post.createdAt)} ·{' '}
            {isHelp ? post.area || owner?.location || '' : post.area || ''}
          </div>

          <div className="nb-postrow-chips">
            {isHelp ? (
              <>
                <span
                  className={`nb-meta-chip ${
                    post.helpType === 'need' ? 'accent' : ''
                  }`}
                >
                  {post.helpType === 'need' ? 'Need' : 'Offer'}
                </span>

                {post.category ? (
                  <span className="nb-meta-chip">{post.category}</span>
                ) : null}

                {post.whenRange ? (
                  <span className="nb-meta-chip">{post.whenRange}</span>
                ) : null}
              </>
            ) : (
              <>
                <span className="nb-meta-chip accent">Recommendation</span>
                {post.recCategory ? (
                  <span className="nb-meta-chip">{post.recCategory}</span>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div
          className={`nb-status ${
            post.status === 'resolved' ? 'is-resolved' : ''
          }`}
        >
          {statusLabel}
        </div>
      </button>
    );
  }

  function UserProfileModal({ userId }) {
    const u = usersById[userId];
    if (!u) return null;

    const isMe = userId === me.id;

    const pts = npPointsByUser?.[userId] || 0;
    const followers = Array.isArray(followersByUser?.[userId])
      ? followersByUser[userId].length
      : 0;

    const followingCount = Array.isArray(followsByUser?.[userId])
      ? followsByUser[userId].filter(Boolean).length
      : 0;

    const theirPosts = posts
      .filter((p) => p && p.ownerId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);

    return (
      <div className="nb-modal-backdrop" onClick={() => setModal(null)}>
        <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
          <div className="nb-modal-head">
            <div className="nb-modal-title">Profile</div>
            <button
              className="nb-x"
              onClick={() => setModal(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div style={{ padding: 14, display: 'flex', gap: 12 }}>
            <img className="nb-avatar" src={u.avatar} alt={u.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 980, fontSize: 16 }}>
                {u.name} <span className="nb-handle">{u.handle}</span>
                <UserBadge userId={u.id} showText />
              </div>
              <div style={{ marginTop: 4, color: 'var(--muted)', fontWeight: 850 }}>
                {u.location || ''}
              </div>
              {u.tagline ? (
                <div style={{ marginTop: 8, fontWeight: 850 }}>{u.tagline}</div>
              ) : null}

              {!isMe ? (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className={`nb-btn ${isFollowing(me.id, u.id) ? 'nb-btn-ghost' : 'nb-btn-primary'}`}
                    onClick={() => toggleFollow(u.id)}
                  >
                    {isFollowing(me.id, u.id) ? 'Following' : 'Follow'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ padding: '0 14px 14px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              }}
            >
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: 12,
                  background: 'rgba(255,255,255,.03)',
                }}
              >
                <div style={{ color: 'var(--muted)', fontWeight: 850, fontSize: 12 }}>
                  NP
                </div>
                <div style={{ marginTop: 6, fontWeight: 980, fontSize: 16 }}>
                  {pts}
                </div>
              </div>

              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: 12,
                  background: 'rgba(255,255,255,.03)',
                }}
              >
                <div style={{ color: 'var(--muted)', fontWeight: 850, fontSize: 12 }}>
                  Followers
                </div>
                <div style={{ marginTop: 6, fontWeight: 980, fontSize: 16 }}>
                  {followers}
                </div>
              </div>

              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: 12,
                  background: 'rgba(255,255,255,.03)',
                }}
              >
                <div style={{ color: 'var(--muted)', fontWeight: 850, fontSize: 12 }}>
                  Following
                </div>
                <div style={{ marginTop: 6, fontWeight: 980, fontSize: 16 }}>
                  {followingCount}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 14,
                borderTop: '1px solid var(--border)',
                paddingTop: 14,
              }}
            >
              <div style={{ fontWeight: 980 }}>Posts</div>

              {theirPosts.length === 0 ? (
                <div className="nb-muted" style={{ marginTop: 10 }}>
                  No posts yet.
                </div>
              ) : (
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  {theirPosts.map((p) => (
                    <ProfilePostRow
                      key={p.id}
                      post={p}
                      onOpen={() => {
                        // Jump user to Home and open the thread for this post
                        setActiveTab('home');
                        setExpandedThreads((prev) => ({ ...prev, [p.id]: true }));
                        setModal(null);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="nb-modal-foot">
            <div className="nb-muted">Profiles are local-demo only right now.</div>
            <div className="nb-modal-actions">
              <button className="nb-btn nb-btn-primary" onClick={() => setModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function ProfileTab() {
    const myFollowers = Array.isArray(followersByUser?.[me.id])
      ? followersByUser[me.id].length
      : 0;

    const myFollowing = Array.isArray(followsByUser?.[me.id])
      ? followsByUser[me.id].filter(Boolean).length
      : 0;

    const discover = USERS_SEED.filter((u) => u.id !== me.id);

    return (
      <div className="nb-page">
        <div className="nb-section">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <img className="nb-avatar" src={me.avatar} alt={me.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 980, fontSize: 18 }}>
                {me.name} <span className="nb-handle">{me.handle}</span>
                <UserBadge userId={me.id} showText />
              </div>
              <div style={{ marginTop: 4, color: 'var(--muted)', fontWeight: 850 }}>
                {me.location || ''}
              </div>
              {me.tagline ? (
                <div style={{ marginTop: 8, fontWeight: 850 }}>{me.tagline}</div>
              ) : null}
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 10,
            }}
          >
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 12,
                background: 'rgba(255,255,255,.03)',
              }}
            >
              <div style={{ color: 'var(--muted)', fontWeight: 850, fontSize: 12 }}>
                NP
              </div>
              <div style={{ marginTop: 6, fontWeight: 980, fontSize: 16 }}>
                {npPoints}
              </div>
            </div>

            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 12,
                background: 'rgba(255,255,255,.03)',
              }}
            >
              <div style={{ color: 'var(--muted)', fontWeight: 850, fontSize: 12 }}>
                Helpful
              </div>
              <div style={{ marginTop: 6, fontWeight: 980, fontSize: 16 }}>
                {helpfulRepliesCount}
              </div>
            </div>

            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 12,
                background: 'rgba(255,255,255,.03)',
              }}
            >
              <div style={{ color: 'var(--muted)', fontWeight: 850, fontSize: 12 }}>
                Followers
              </div>
              <div style={{ marginTop: 6, fontWeight: 980, fontSize: 16 }}>
                {myFollowers}
              </div>
            </div>

            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 12,
                background: 'rgba(255,255,255,.03)',
              }}
            >
              <div style={{ color: 'var(--muted)', fontWeight: 850, fontSize: 12 }}>
                Following
              </div>
              <div style={{ marginTop: 6, fontWeight: 980, fontSize: 16 }}>
                {myFollowing}
              </div>
            </div>
          </div>
        </div>

        {/* Demo user switcher (optional but useful for testing) */}
        <div className="nb-section">
          <div className="nb-section-title">Demo user</div>
          <div className="nb-section-sub">
            Switch identities to test Following, chats, and activity audience filtering.
          </div>

          <select
            className="nb-input"
            value={meId}
            onChange={(e) => setMeId(e.target.value)}
            title="Switch demo user"
          >
            {USERS_SEED.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.location})
              </option>
            ))}
          </select>
        </div>

        <div className="nb-section">
          <div className="nb-section-title">Discover neighbors</div>
          <div className="nb-section-sub">
            Follow someone to enable the “Following” feed filter.
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {discover.map((u) => {
              const followed = isFollowing(me.id, u.id);
              return (
                <div
                  key={u.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: 12,
                    background: 'rgba(255,255,255,.03)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <img
                    className="nb-avatar sm"
                    src={u.avatar}
                    alt={u.name}
                    onClick={() => setModal({ type: 'user_profile', userId: u.id })}
                    style={{ cursor: 'pointer' }}
                    title="View profile"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 980 }}>
                      {u.name} <span className="nb-handle">{u.handle}</span>
                      <UserBadge userId={u.id} />
                    </div>
                    <div style={{ color: 'var(--muted)', fontWeight: 850 }}>
                      {u.location}
                    </div>
                  </div>

                  <button
                    className={`nb-btn ${followed ? 'nb-btn-ghost' : 'nb-btn-primary'}`}
                    onClick={() => toggleFollow(u.id)}
                    type="button"
                  >
                    {followed ? 'Following' : 'Follow'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="nb-section">
          <div className="nb-section-title">My posts</div>
          <div className="nb-section-sub">
            Tap a row to jump back to the feed and expand that post’s thread.
          </div>

          {myPosts.length === 0 ? (
            <div className="nb-muted">No posts yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {myPosts.map((p) => (
                <ProfilePostRow
                  key={p.id}
                  post={p}
                  onOpen={() => {
                    setActiveTab('home');
                    setExpandedThreads((prev) => ({ ...prev, [p.id]: true }));
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function TabBar() {
    const tabs = [
      { key: 'home', label: 'Home', icon: '🏠' },
      { key: 'post', label: 'Post', icon: '➕' },
      { key: 'activity', label: 'Activity', icon: '🔔' },
      { key: 'profile', label: 'Profile', icon: '👤' },
    ];

    return (
      <div className="nb-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`nb-tab ${activeTab === t.key ? 'is-on' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            <div className="nb-tab-ico" aria-hidden="true">
              {t.icon}
            </div>
            <div className="nb-tab-label">{t.label}</div>
          </button>
        ))}
      </div>
    );
  }

  function HomeTab() {
    return (
      <HomeScreen
        Hero={HomeHero}
        Chips={Chips}
        EmptyState={EmptyState}
        PostCard={PostCard}
        homeChip={homeChip}
        homeShowAll={homeShowAll}
        setHomeShowAll={setHomeShowAll}
        homeFollowOnly={homeFollowOnly}
        setHomeFollowOnly={setHomeFollowOnly}
        homeQuery={homeQuery}
        setHomeQuery={setHomeQuery}
        feed={searchedFeed}
        setActiveTab={setActiveTab}
        setPostFlow={setPostFlow}
        radiusPreset={radiusPreset}
        setRadiusPreset={setRadiusPresetForMe}
        homeCenterLabel={homeCenter?.label || homeCenter?.townKey || ''}
        onOpenHomeSetup={() => setModal({ type: 'home_setup' })}
        savedSearches={mySavedSearchesWithCounts}
        activeSavedSearchId={activeSavedSearchId}
        onApplySavedSearch={applySavedSearch}
        onClearSavedSearch={clearSavedSearch}
        onClearSavedSearchHighlight={() => setActiveSavedSearchId(null)}
        onSaveCurrentSearch={saveCurrentSearch}
        canSaveCurrentSearch={canSaveCurrentSearch}
        currentSearchIsSaved={currentSearchIsSaved}
        savedLimitReached={savedLimitReached}
        onManageSavedSearch={(id) =>
          setModal({ type: 'saved_search_manage', searchId: id })
        }
      />
    );
  }

  return (
    <div className="nb-app">
      <Header />

      {activeTab === 'home' ? (
        <HomeTab />
      ) : activeTab === 'post' ? (
        <PostTab />
      ) : activeTab === 'activity' ? (
        <ActivityTab />
      ) : (
        <ProfileTab />
      )}

      <BottomTabs activeTab={activeTab} onChange={setActiveTab} />

      {/* Drawers / overlays */}
      {chat ? <ChatDrawer /> : null}

      {/* Modals (modal state) */}
      {modal?.type === 'reply' ? (
        <ReplyModal postId={modal.postId} mode={modal.mode} />
      ) : null}

      {modal?.type === 'points' ? <PointsModal /> : null}

      {modal?.type === 'home_setup' ? <HomeSetupModal /> : null}

      {modal?.type === 'saved_search_manage' ? (
        <SavedSearchManageModal searchId={modal.searchId} />
      ) : null}

      {modal?.type === 'user_profile' ? (
        <UserProfileModal userId={modal.userId} />
      ) : null}

      {/* Recommendation thread modal (separate state) */}
      {thread ? <RecThreadModal postId={thread.postId} replyId={thread.replyId} /> : null}
    </div>
  );
}

function BottomTabs({ activeTab, onChange }) {
  const tabs = [
    { key: 'home', label: 'Home', icon: '🏠' },
    { key: 'post', label: 'Post', icon: '➕' },
    { key: 'activity', label: 'Activity', icon: '🔔' },
    { key: 'profile', label: 'Profile', icon: '👤' },
  ];

  return (
    <nav className="nb-bottomtabs" role="navigation" aria-label="Bottom Tabs">
      {tabs.map((t) => {
        const isActive = activeTab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            className={`nb-bottomtab ${isActive ? 'active' : ''}`}
            onClick={() => onChange(t.key)}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="nb-bottomtab-ico" aria-hidden="true">
              {t.icon}
            </span>
            <span className="nb-bottomtab-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default App;
