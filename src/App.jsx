import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import './App.css';
import pkg from '../package.json';

/* ---------- NB: show fatal errors on-screen (prod-friendly) ---------- */
function nbFormatErr(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  const msg = err.message || String(err);
  const stack = err.stack ? `\n\n${err.stack}` : '';
  return `${msg}${stack}`;
}

function nbShowFatalOverlay(err) {
  try {
    const id = 'nb-fatal-overlay';
    const existing = document.getElementById(id);
    const box = existing || document.createElement('div');
    box.id = id;
    box.style.position = 'fixed';
    box.style.inset = '12px';
    box.style.zIndex = '999999';
    box.style.background = 'rgba(10,10,14,0.95)';
    box.style.color = '#fff';
    box.style.padding = '14px';
    box.style.borderRadius = '12px';
    box.style.fontFamily =
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    box.style.fontSize = '12px';
    box.style.whiteSpace = 'pre-wrap';
    box.style.overflow = 'auto';
    box.innerText = 'NeighBloom crashed:\n\n' + nbFormatErr(err);
    if (!existing) document.body.appendChild(box);
  } catch (_) {}
}

function ClickAwayHandler({ onAway, targetRefs = [] }) {
  useEffect(() => {
    function handleDown(e) {
      const path = e.composedPath ? e.composedPath() : (e.path || []);
      // If any of the target refs contain the event target, ignore
      for (const r of targetRefs) {
        const el = r?.current || null;
        if (!el) continue;
        if (el.contains(e.target) || path.includes(el)) return;
      }
      onAway && onAway();
    }

    document.addEventListener('mousedown', handleDown);
    document.addEventListener('touchstart', handleDown);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('touchstart', handleDown);
    };
  }, [onAway, targetRefs]);

  return null;
}

function PostOverflowMenu({ anchorRef, open, onClose, items = [] }) {
  const elRef = useRef(null);
  const [style, setStyle] = useState({ left: 0, top: 0, visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open) return;
    const btn = anchorRef?.current;
    const menu = elRef?.current;
    if (!btn || !menu) return;

    const r = btn.getBoundingClientRect();
    // default positioning below the button, left-aligned
    const margin = 6;
    const menuW = menu.offsetWidth || 160;
    const menuH = menu.offsetHeight || 120;
    let left = Math.round(r.left);
    let top = Math.round(r.bottom + margin);

    // flip horizontally if overflowing
    if (left + menuW > window.innerWidth - 8) {
      left = Math.max(8, Math.round(r.right - menuW));
    }
    // flip vertically if overflowing bottom
    if (top + menuH > window.innerHeight - 8) {
      top = Math.max(8, Math.round(r.top - menuH - margin));
    }

    setStyle({ left, top, visibility: 'visible' });
  }, [open, anchorRef]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose && onClose();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    function onDown(e) {
      const menu = elRef.current;
      const btn = anchorRef?.current;
      if (!menu) return;
      if (menu.contains(e.target) || (btn && btn.contains(e.target))) return;
      onClose && onClose();
    }
    if (open) {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('touchstart', onDown);
    }
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open, anchorRef, onClose]);

  if (!open) return null;

  const menu = (
    <div
      ref={elRef}
      className="nb-overflow-menu"
      style={{ position: 'fixed', left: style.left + 'px', top: style.top + 'px', visibility: style.visibility }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((it, i) => (
        <button
          key={i}
          className={`nb-overflow-item${it.danger ? ' danger' : ''}`}
          onClick={() => {
            try {
              it.onClick && it.onClick();
            } finally {
              onClose && onClose();
            }
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );

  return createPortal(menu, document.body);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__NB_ERR_HOOKED__) {
  window.__NB_ERR_HOOKED__ = true;
  window.addEventListener('error', (e) => nbShowFatalOverlay(e.error || e.message || e));
  window.addEventListener('unhandledrejection', (e) => nbShowFatalOverlay(e.reason || e));
}
/* -------------------------------------------------------------------- */

const NEIGHBLOOM_LOGO =
  'https://storage.googleapis.com/space-apps-assets/store_MJDeCrFHOB/9kmK0Kexuz-logo.jpg';

  const APP_NAME = 'Neighbloom';
const APP_TAGLINE = 'Little missions, big city.';

const LS_CHECKINS = 'nb_checkins_v1';
const DAILY_CHECKIN_REWARD = 5;

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

// Lightweight telemetry helper (buffers to window and logs to console).
function trackEvent(name, payload = {}) {
  try {
    if (typeof window !== 'undefined') {
      window.__nb_telemetry__ = window.__nb_telemetry__ || [];
      window.__nb_telemetry__.push({ name, payload, ts: NOW() });
    }
    // Keep in console for quick remote-inspect verification
    console.debug('[telemetry]', name, payload);
  } catch (_) {}
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
    label: 'Shoveling',
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
    details: 'Small item only. Porch pickup + porch drop.',
    whenRange: 'Anytime today',
  },
];

// -------------------- HYPERLOCAL (Phase 1) --------------------
const RADIUS_PRESETS = {
  near: { label: 'Near', miles: 1 },
  local: { label: 'Local', miles: 3 },
  area: { label: 'Area', miles: 10 },
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
  /* Nearby suburbs added to broaden inference coverage */
  'Hickory Hills': { lat: 41.6995, lng: -87.8074 },
  'Oak Forest': { lat: 41.6206, lng: -87.8012 },
  'Bridgeview': { lat: 41.7406, lng: -87.7839 },
  'Alsip': { lat: 41.6645, lng: -87.6999 },
  'Burbank': { lat: 41.7734, lng: -87.8063 },
  'Justice': { lat: 41.7381, lng: -87.8198 },
  'Orland Hills': { lat: 41.6631, lng: -87.8720 },
  /* Slightly further suburbs */
  'Mokena': { lat: 41.5456, lng: -87.8549 },
  'New Lenox': { lat: 41.487, lng: -87.912 },
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
  const raw = String(text || '').toLowerCase();
  const t = raw.replace(/[^a-z0-9\s]/g, ''); // strip punctuation for matching
  const tCompacted = raw.replace(/[^a-z0-9]/g, ''); // compacted (no spaces)
  for (const k of TOWN_KEYS) {
    const kLower = k.toLowerCase();
    const kCompacted = kLower.replace(/[^a-z0-9]/g, '');
    // direct substring match (word-preserving)
    if (t.includes(kLower)) return k;
    // compacted match to catch tokens like 'oaklawn'
    if (tCompacted.includes(kCompacted)) return k;
    // all-words match: e.g., 'oak' and 'lawn' appear separately
    const parts = kLower.split(/\s+/).filter(Boolean);
    if (parts.length > 1 && parts.every((p) => t.indexOf(p) !== -1)) return k;
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
  refreshing,
onRefresh,
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
  
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Mobile detection (simple + good enough for MVP)
  const isMobile =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(max-width: 720px)').matches;

  function closeFilters() {
    setFiltersOpen(false);
  }
  const hasQuery = normalizeText(homeQuery).length > 0;
  const visibleFeed = feed;
  useEffect(() => {
    console.log('[HomeScreen] mount');
    return () => console.log('[HomeScreen] unmount');
  }, []);

  const saveDisabled =
    homeFollowOnly || !hasQuery || currentSearchIsSaved || savedLimitReached;
  const saveLabel = currentSearchIsSaved
    ? 'Saved ✓'
    : savedLimitReached
    ? 'Max 5'
    : 'Save';

    // --- Collapsible filter content (used for desktop inline + mobile modal) ---
  function FiltersContent() {
    return (
      <>
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
              onClick={() => {
                setRadiusPreset('near');
                if (isMobile) closeFilters();
              }}
              title="About 1 mile"
            >
              Near
            </button>

            <button
              type="button"
              className={`nb-segbtn ${radiusPreset === 'local' ? 'is-on' : ''}`}
              onClick={() => {
                setRadiusPreset('local');
                if (isMobile) closeFilters();
              }}
              title="About 3 miles"
            >
              Local
            </button>

            <button
              type="button"
              className={`nb-segbtn ${radiusPreset === 'area' ? 'is-on' : ''}`}
              onClick={() => {
                setRadiusPreset('area');
                if (isMobile) closeFilters();
              }}
              title="About 8 miles"
            >
              Area
            </button>

            <button
              type="button"
              className={`nb-segbtn ${radiusPreset === 'all' ? 'is-on' : ''}`}
              onClick={() => {
                setRadiusPreset('all');
                if (isMobile) closeFilters();
              }}
              title="Any distance"
            >
              Any
            </button>
          </div>

          <button
            type="button"
            className="nb-btn nb-btn-ghost nb-btn-sm"
            onClick={() => {
              onOpenHomeSetup?.();
              if (isMobile) closeFilters();
            }}
            title="Set your home center"
          >
            Home: {homeCenterLabel || 'Set'}
          </button>
        </div>

        {/* Open / All / Following */}
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
                if (isMobile) closeFilters();
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
                if (isMobile) closeFilters();
              }}
            >
              All
            </button>

            <button
              type="button"
              className={`nb-segbtn ${homeFollowOnly ? 'is-on' : ''}`}
              onClick={() => {
                onClearSavedSearchHighlight?.();
                setHomeShowAll(false);
                setHomeFollowOnly(true);
                if (isMobile) closeFilters();
              }}
              title="Only posts from neighbors you follow (plus you)"
            >
              Following
            </button>
          </div>
        </div>

        {/* Search + Save + Refresh (desktop) */}
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
              <div className="nb-search-meta">{visibleFeed.length} results</div>
            ) : null}

            <button
              type="button"
              className="nb-btn nb-btn-ghost nb-btn-sm"
              onClick={() => {
                onSaveCurrentSearch?.();
                if (isMobile) closeFilters();
              }}
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

            {!isMobile ? (
              <button
                type="button"
                className="nb-btn nb-btn-ghost nb-btn-sm"
                onClick={onRefresh}
                disabled={refreshing}
                title={refreshing ? 'Refreshing…' : 'Refresh feed'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <span aria-hidden="true">{refreshing ? '⏳' : '↻'}</span>
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            ) : null}
          </div>
        </div>

        {/* Saved Searches row */}
        <div style={{ marginTop: 10 }}>
          <div
            className="nb-seg nb-seg-compact nb-seg-scroll"
            style={{ width: '100%' }}
          >
            {(savedSearches || []).length > 0 ? (
              <button
                type="button"
                className={`nb-segbtn ${!activeSavedSearchId ? 'is-on' : ''}`}
                onClick={() => {
                  onClearSavedSearch?.();
                  if (isMobile) closeFilters();
                }}
                title="Reset feed"
              >
                Reset
              </button>
            ) : null}

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
                    onClick={() => {
                      if (homeFollowOnly) setHomeFollowOnly(false);
                      onApplySavedSearch?.(s.id);
                      if (isMobile) closeFilters();
                    }}
                    disabled={homeFollowOnly}
                    title={
                      homeFollowOnly
                        ? 'Turn off Following to use saved searches'
                        : 'Apply saved search'
                    }
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
                    onClick={() => onManageSavedSearch?.(s.id)}
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

          {(savedSearches || []).length === 0 ? (
            <div
              className="nb-muted small"
              style={{ marginTop: 8, fontWeight: 850 }}
            >
              Save a search to pin it here for one-tap access.
            </div>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <div
      className="nb-page"
      style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
    >
      <Hero />
      {refreshing ? (
        <div className="nb-muted small" style={{ marginTop: 8, fontWeight: 900 }}>
          Refreshing…
        </div>
      ) : null}

      {/* Progressive disclosure: collapse filters behind one button on mobile */}
      {isMobile ? (
        <>
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <button
              type="button"
              className="nb-btn nb-btn-ghost nb-btn-sm"
              onClick={() => setFiltersOpen(true)}
              title="Filters"
            >
              Filter
            </button>

            <button
              type="button"
              className="nb-btn nb-btn-ghost nb-btn-sm"
              onClick={onRefresh}
              disabled={refreshing}
              title={refreshing ? 'Refreshing…' : 'Refresh feed'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <span aria-hidden="true">{refreshing ? '⏳' : '↻'}</span>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {filtersOpen ? (
            <div className="nb-modal-backdrop" onClick={closeFilters}>
              <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
                <div className="nb-modal-head">
                  <div className="nb-modal-title">Filters</div>
                  <button
                    className="nb-x"
                    onClick={closeFilters}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                <div className="nb-modal-body-scroll" style={{ padding: 14 }}>
                  <FiltersContent />
                </div>

                <div className="nb-modal-foot">
                  <div className="nb-muted">Adjust your feed.</div>
                  <div className="nb-modal-actions">
                    <button
                      className="nb-btn nb-btn-primary"
                      onClick={closeFilters}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <FiltersContent />
      )}
      

      {!hasQuery &&
      radiusPreset !== 'all' &&
      visibleFeed.length > 0 &&
      visibleFeed.length < 10 ? (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="nb-btn nb-btn-ghost nb-btn-sm"
            style={{ width: '100%', justifyContent: 'space-between' }}
            onClick={() => setRadiusPreset('all')}
            title="Expand your radius to see more posts"
          >
            <span style={{ fontWeight: 900 }}>
            Seeing only {visibleFeed.length} posts — expand to All
            </span>
            <span aria-hidden="true" style={{ opacity: 0.8 }}>
              →
            </span>
          </button>
        </div>
      ) : null}

      {visibleFeed.length === 0 ? (
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
            title={
              homeFollowOnly
                ? 'Make your feed yours'
                : homeChip === 'help'
                ? 'Need a hand?'
                : homeChip === 'rec'
                ? 'Looking for local tips?'
                : 'Start your neighborhood'
            }
            body={
              homeFollowOnly
                ? 'Follow neighbors to see posts that matter to you.'
                : homeChip === 'help'
                ? 'Ask for help — neighbors often pitch in quickly.'
                : homeChip === 'rec'
                ? 'Ask a specific question and get useful recommendations.'
                : 'Be the first to share — post a question or request and get neighbors involved.'
            }
            ctaLabel={
              homeFollowOnly
                ? 'Discover neighbors'
                : homeChip === 'help'
                ? 'Ask for help'
                : homeChip === 'rec'
                ? 'Ask for recommendations'
                : 'Create a post'
            }
            onCta={() => {
              if (homeFollowOnly) {
                setActiveTab('profile');
              } else if (homeChip === 'help') {
                setActiveTab('post');
                setPostFlow({ step: 'form', kind: 'help' });
              } else if (homeChip === 'rec') {
                setActiveTab('post');
                setPostFlow({ step: 'form', kind: 'rec' });
              } else {
                setActiveTab('post');
                setPostFlow({ step: 'form', kind: null });
              }
            }}
          />
        </>
      ) : (
        <div className="nb-feed">
          {visibleFeed.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Pull-to-refresh for a scrollable DIV (not window).
 * Triggers only when scrollTop === 0.
 */

function useLocalStorageJsonState(key, fallbackValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallbackValue : JSON.parse(raw);
    } catch {
      return fallbackValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);

  return [value, setValue];
}


function App() {
  // -------------------- LOAD SAVED STATE (V1) --------------------
  const saved = useMemo(() => loadAppState(), []);

  const [activeTab, setActiveTab] = useState(() => saved?.activeTab ?? 'home'); // home | post | activity | profile
  
  
  const [homeRefreshing, setHomeRefreshing] = useState(false);
  const homeRefreshingRef = useRef(false);

  const refreshHome = React.useCallback(async () => {
    // Ref guard prevents double-trigger before React commits state.
    if (homeRefreshingRef.current) return;

    homeRefreshingRef.current = true;
    setHomeRefreshing(true);

    try {
      // Simulate a network refresh (swap this later for real fetch)
      await sleep(650);
    } finally {
      homeRefreshingRef.current = false;
      setHomeRefreshing(false);
    }
  }, []);
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

  // Highlights feature state (opt-in + temporary boosts)
  const [highlightsByUser, setHighlightsByUser] = useState(() => saved?.highlightsByUser || {});

  function setUserHighlightOptIn(userId, allow) {
    setHighlightsByUser((prev) => {
      const next = { ...(prev || {}) };
      next[userId] = { ...(next[userId] || {}), allowHighlights: !!allow };
      try {
        const store = safeJsonParse(localStorage.getItem(STORAGE_KEY), {}) || {};
        store.highlightsByUser = next;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...store }));
      } catch {}
      return next;
    });
    trackEvent('highlight_opt_in', { userId, optIn: !!allow });
  }

  function setUserTempBoost(userId, untilTs) {
    setHighlightsByUser((prev) => {
      const next = { ...(prev || {}) };
      next[userId] = { ...(next[userId] || {}), tempBoostUntil: untilTs };
      try {
        const store = safeJsonParse(localStorage.getItem(STORAGE_KEY), {}) || {};
        store.highlightsByUser = next;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...store }));
      } catch {}
      return next;
    });
    trackEvent('highlight_set', { userId, until: untilTs });
  }

  const [expandedThreads, setExpandedThreads] = useState(() => ({})); // postId -> bool (start collapsed)
  const [expandedOtherVols, setExpandedOtherVols] = useState(
  () => saved?.expandedOtherVols ?? {}
); // postId -> bool
  const [pendingSelection, setPendingSelection] = useState(null); // { postId, userId, userName }
  const [replyOverflow, setReplyOverflow] = useState(null); // { postId, replyId, anchorRef }
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

    // Small hook to animate numbers (e.g. NP badge count-up)
    function useAnimatedNumber(value, duration = 1000) {
      const [display, setDisplay] = useState(Number(value) || 0);
      const rafRef = useRef(null);
      const fromRef = useRef(Number(value) || 0);

      useEffect(() => {
        cancelAnimationFrame(rafRef.current);
        const from = Number(fromRef.current) || 0;
        const to = Number(value) || 0;
        if (from === to) {
          setDisplay(to);
          fromRef.current = to;
          return;
        }
        const start = performance.now();
        function step(now) {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
          const current = Math.round(from + (to - from) * eased);
          setDisplay(current);
          if (t < 1) rafRef.current = requestAnimationFrame(step);
          else fromRef.current = to;
        }
        rafRef.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(rafRef.current);
      }, [value, duration]);

      // keep baseline in sync if outer code resets value
      useEffect(() => {
        fromRef.current = Number(value) || 0;
      }, []);

      return display;
    }

  // -------------------- DAILY CHECK-IN (local, no backend) --------------------
  const [checkInByUser, setCheckInByUser] = useLocalStorageJsonState(
    'nb_checkInByUser',
    {}
  );

  const [onboardingByUser, setOnboardingByUser] = useLocalStorageJsonState(
    'nb_onboardingByUser',
    {}
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
  // share modal state (opened by sharePost)
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareTargetPost, setShareTargetPost] = useState(null);
  // public post view (for /p/:id deep links that should open a read-only public page)
  const [publicViewPostId, setPublicViewPostId] = useState(() => {
    const m = window.location.pathname.match(/\/p\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  });

  // Analytics / tracking helper (lightweight)
  function trackEvent(name, data = {}) {
    try {
      if (window.dataLayer && typeof window.dataLayer.push === 'function') {
        window.dataLayer.push({ event: name, ...data });
      } else {
        console.log('[trackEvent]', name, data);
      }
    } catch (e) {
      // swallow
    }
  }

  // Focus management for share modal (accessibility)
  const shareModalFirstBtnRef = useRef(null);
  const shareModalRef = useRef(null);

  useEffect(() => {
    const modalEl = shareModalRef.current;
    const appEl = document.querySelector('.nb-app');

    if (shareModalOpen) {
      const prevOverflow = document.body.style.overflow || '';
      const prevAria = appEl ? appEl.getAttribute('aria-hidden') : null;

      // prevent background scroll while modal open
      document.body.style.overflow = 'hidden';
      if (appEl) appEl.setAttribute('aria-hidden', 'true');

      // focus first actionable control
      setTimeout(() => {
        try {
          shareModalFirstBtnRef.current && shareModalFirstBtnRef.current.focus();
        } catch (e) {}
      }, 60);

      function onKey(e) {
        if (e.key === 'Escape') {
          setShareModalOpen(false);
          setShareTargetPost(null);
          return;
        }

        if (e.key === 'Tab') {
          if (!modalEl) return;
          const nodes = modalEl.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          const focusable = Array.prototype.slice.call(nodes).filter((n) => n.offsetParent !== null);
          if (focusable.length === 0) return;
          const idx = focusable.indexOf(document.activeElement);

          if (e.shiftKey) {
            if (idx === 0 || document.activeElement === modalEl) {
              e.preventDefault();
              focusable[focusable.length - 1].focus();
            }
          } else {
            if (idx === focusable.length - 1) {
              e.preventDefault();
              focusable[0].focus();
            }
          }
        }
      }

      // use capture so we get key events before inner handlers
      document.addEventListener('keydown', onKey, true);

      return () => {
        document.removeEventListener('keydown', onKey, true);
        document.body.style.overflow = prevOverflow;
        if (appEl) {
          if (prevAria === null) appEl.removeAttribute('aria-hidden');
          else appEl.setAttribute('aria-hidden', prevAria);
        }
      };
    }
    return undefined;
  }, [shareModalOpen]);

  // When viewing a public post, update basic meta tags (client-side only).
  function setMetaTag(name, content) {
    try {
      let el = document.querySelector(`meta[property="${name}"]`) || document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        // prefer property for OpenGraph
        el.setAttribute('property', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content || '');
    } catch (e) {}
  }

  useEffect(() => {
    if (!publicViewPostId) return;
    const p = (posts || []).find((x) => x && x.id === publicViewPostId);
    if (!p) return;
    try {
      document.title = p.title || 'Neighbloom';
      setMetaTag('og:title', p.title || 'Neighbloom');
      setMetaTag('og:description', p.details || '');
      setMetaTag('og:url', postUrl(p.id));
      if (p.photo) setMetaTag('og:image', p.photo);
    } catch (e) {}
  }, [publicViewPostId, posts]);
  // ---------------- BLOCK / REPORT (local MVP) ----------------
  const [blockedByUser, setBlockedByUser] = useLocalStorageJsonState(
    'nb_blockedByUser',
    {}
  );

  const [reports, setReports] = useLocalStorageJsonState('nb_reports', []);
  // recommendation comment thread (per recommendation reply)
  const [thread, setThread] = useState(null); // { postId, replyId } | null
  // Inline composer: postId for which the small inline composer is open
  const [inlineComposerFor, setInlineComposerFor] = useState(null);
  // Track when we programmatically opened a thread to show the inline composer
  const [composerOpenedFor, setComposerOpenedFor] = useState(null);
  function closeInlineComposer(postId) {
    setInlineComposerFor(null);
    if (postId && composerOpenedFor === postId) {
      setExpandedThreads((prev) => {
        const next = { ...(prev || {}) };
        delete next[postId];
        return next;
      });
      setComposerOpenedFor(null);
    } else {
      setComposerOpenedFor(null);
    }
  }
  // chat drawer
  const [chat, setChat] = useState(null); // {postId, otherUserId}
  const didAutoOpenChatOnActivity = useRef(false);
  // Lightweight toast + deep-link guards (share / referrals / post links)
  const [toastMsg, setToastMsg] = useState(null);
  const toastTimerRef = useRef(null);
  const deepLinkHandledRef = useRef(false);
  const referralHandledRef = useRef(false);
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
  const [lastSeenByUser, setLastSeenByUser] = useLocalStorageJsonState(
    'nb_lastSeenByUser',
    {}
  );

  function getLastSeen(userId) {
    const base =
      lastSeenByUser && typeof lastSeenByUser === 'object' ? lastSeenByUser : {};
    const row = base?.[userId] && typeof base[userId] === 'object' ? base[userId] : {};
    return {
      homeTs: Number(row.homeTs) || 0,
      activityTs: Number(row.activityTs) || 0,
      profileTs: Number(row.profileTs) || 0,
    };
  }

  function markSeen(userId, tabKey) {
    if (!userId || !tabKey) return;
    setLastSeenByUser((prev) => {
      const base = prev && typeof prev === 'object' ? prev : {};
      const row = base?.[userId] && typeof base[userId] === 'object' ? base[userId] : {};
      return {
        ...base,
        [userId]: {
          ...row,
          [`${tabKey}Ts`]: NOW(),
        },
      };
    });
  }
  // Compatibility alias: if older code still calls chatsById, it now points to chats.
const chatsById = chats;

  // post flow
  const [postFlow, setPostFlow] = useState({ step: 'chooser', kind: null });

  const lastSeen = useMemo(() => getLastSeen(me.id), [me.id, lastSeenByUser]);

  const homeNewCount = useMemo(() => {
    const ts = lastSeen.homeTs || 0;
    // Simple v1: "new posts" = posts created after last seen, not mine
    const list = Array.isArray(posts) ? posts : [];
    return list.filter((p) => p && p.createdAt > ts && p.ownerId !== me.id).length;
  }, [posts, me.id, lastSeen.homeTs]);

  const activityNewCount = useMemo(() => {
    const ts = lastSeen.activityTs || 0;
    const list = Array.isArray(activity) ? activity : [];
    return list.filter((a) => a && a.ts > ts && Array.isArray(a.audienceIds) && a.audienceIds.includes(me.id)).length;
  }, [activity, me.id, lastSeen.activityTs]);

  // Profile badge is disabled for now (avoids TDZ crash from followersByUser)
const profileNewCount = useMemo(() => 0, [me.id, lastSeen.profileTs]);

  const tabBadges = useMemo(() => {
    return {
      home: homeNewCount,
      activity: activityNewCount,
      profile: profileNewCount,
      post: 0,
    };
  }, [homeNewCount, activityNewCount, profileNewCount]);

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

  // Aggregated "You offered" panel state + computed offers
  const [youOfferedOpen, setYouOfferedOpen] = useState(false);

  const myOffers = useMemo(() => {
    const out = [];
    for (const p of posts || []) {
      if (!p || !Array.isArray(p.replies)) continue;
      for (const r of p.replies) {
        if (!r || r.authorId !== me.id) continue;
        // only show volunteer replies (help flow)
        if (p.kind === 'help' && (r.type === 'volunteer' || !r.type)) {
          out.push({
            postId: p.id,
            postTitle: p.title || p.details || 'Help request',
            postArea: p.area,
            postOwnerId: p.ownerId,
            replyId: r.id,
            helperStatus: r.helperStatus || 'offered',
            postStage: p.stage || 'open',
            selected: Array.isArray(p.selectedUserIds) && p.selectedUserIds.includes(me.id),
            createdAt: r.createdAt || 0,
          });
        }
      }
    }
    // sort by most recent offer first
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  }, [posts, me.id]);

  function cancelOffer(postId, replyId) {
    if (!postId || !replyId) return;
    setPosts((prev) =>
      (prev || []).map((p) => {
        if (!p || p.id !== postId) return p;
        const nextReplies = (p.replies || []).filter((r) => r.id !== replyId);
        return { ...p, replies: nextReplies };
      })
    );

    pushActivity({
      text: `${usersById[me.id]?.name || 'You'} cancelled an offer.`,
      actorId: me.id,
      postId,
      postKind: 'help',
      audienceIds: [me.id, posts.find((x) => x.id === postId)?.ownerId].filter(Boolean),
    });
    showToast('Offer cancelled');
  }

  function goToOfferPost(postId) {
    if (!postId) return;
    // Navigate to home and expand that post thread
    setActiveTab('home');
    setExpandedThreads((prev) => ({ ...(prev || {}), [postId]: true }));
    setYouOfferedOpen(false);
    // Scroll the post into view after UI updates (give React a tick)
    setTimeout(() => {
      try {
        const el = document.getElementById(`post_card_${postId}`);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          try { el.classList.add('nb-highlight'); } catch (e) {}
          // Remove highlight after animation completes
          setTimeout(() => {
            try { el.classList.remove('nb-highlight'); } catch (e) {}
          }, 2400);
        }
      } catch (e) {}
    }, 60);
  }

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

  const savedSearchFpSet = useMemo(() => {
    const set = new Set();
    for (const s of mySavedSearches) {
      const fp = searchFingerprint({
        query: s.query,
        homeChip: s.homeChip,
        homeShowAll: s.homeShowAll,
      });
      set.add(fp);
    }
    return set;
  }, [mySavedSearches]);

  const currentSearchIsSaved = useMemo(() => {
    return savedSearchFpSet.has(currentSearchFp);
  }, [savedSearchFpSet, currentSearchFp]);

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

  const countNewForSavedSearch = React.useCallback(
    (s) => {
      const last = typeof s?.lastSeenTs === 'number' ? s.lastSeenTs : 0;
      let c = 0;

      for (const p of posts) {
        if (!p || typeof p.createdAt !== 'number') continue;
        if (p.createdAt <= last) continue;
        if (postMatchesSavedSearch(p, s)) c += 1;
      }

      return c;
    },
    [posts]
  );

  const mySavedSearchesWithCounts = useMemo(() => {
    return mySavedSearches.map((s) => ({
      ...s,
      newCount: countNewForSavedSearch(s),
    }));
  }, [mySavedSearches, countNewForSavedSearch]);

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
  // Deep-links
  // - ?p=<postId> opens that post in the feed
  // - ?ref=<userId> simulates an invite/referral reward
  useEffect(() => {
    if (deepLinkHandledRef.current) return;

    const params = new URLSearchParams(window.location.search);
    let postId = params.get('p');
    // also support path-style deep link: /p/<postId>
    if (!postId) {
      const m = window.location.pathname.match(/\/p\/(.+)$/);
      if (m) postId = decodeURIComponent(m[1]);
    }
    if (postId) {
      deepLinkHandledRef.current = true;
      // small delay so the feed DOM exists before we scroll
      setTimeout(() => jumpToPostFromActivity(postId), 60);
    }
  }, [posts]);

  useEffect(() => {
    if (referralHandledRef.current) return;

    const params = new URLSearchParams(window.location.search);
    let ref = params.get('ref');
    // also support path-style invite: /ref/<userId>
    if (!ref) {
      const m = window.location.pathname.match(/\/ref\/(.+)$/);
      if (m) ref = decodeURIComponent(m[1]);
    }
    if (!ref) return;
    if (ref === meId) return;

    const key = `nb_ref_credited_${ref}_${meId}`;
    if (localStorage.getItem(key)) {
      referralHandledRef.current = true;
      return;
    }

    localStorage.setItem(key, '1');
    referralHandledRef.current = true;
    // MVP reward: arriving via an invite link gives the visitor a small boost
    setNpPointsByUser((prev) => {
      const cur = prev?.[meId] ?? 0;
      return { ...prev, [meId]: cur + 20 };
    });
    showToast('Invite accepted • +20 NP');
  }, [meId]);

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

  // ---------- Round 4: Activity click behavior ----------
  function jumpToPostFromActivity(postId) {
    if (!postId) return;

    // Make sure the post is visible regardless of current filters
    setHomeShowAll(true);
    setHomeChip('all');
    setHomeQuery('');
    setActiveSavedSearchId(null);

    // Close overlays so it never feels "stuck"
    setChat(null);
    setThread(null);
    setModal(null);

    // Go home + expand the thread
    setActiveTab('home');
    setExpandedThreads((prev) => ({ ...(prev || {}), [postId]: true }));
  }

  function handleActivityClick(a) {
    if (!a || !a.postId) return;

    const post = posts.find((p) => p && p.id === a.postId);
    if (!post) return;

    const otherUserId = otherIdFromActivity(a, me.id);

    // If chat is allowed for THIS viewer + otherUserId, open it.
    if (otherUserId && canOpenChatForPost(post, otherUserId)) {
      openChat(a.postId, otherUserId);
      return;
    }

    // Otherwise, jump to the post and expand it.
    jumpToPostFromActivity(a.postId);
  }

  function toggleThread(postId) {
    setExpandedThreads((prev) => ({ ...prev, [postId]: !prev[postId] }));
  }

  // -------------------- DAILY CHECK-IN helpers --------------------
  function dateKeyLocal(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`; // local calendar day
  }

  function todayKey() {
    return dateKeyLocal(new Date());
  }

  function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

  function getCheckInFor(uid) {
  const safeUid = uid || 'me';
  try {
    const raw = localStorage.getItem(LS_CHECKINS);
    const map = raw ? JSON.parse(raw) : {};
    const c = map && map[safeUid] ? map[safeUid] : null;
    return {
      lastDate: (c && c.lastDate) || '',
      streak: Number(c && c.streak) || 0,
    };
  } catch {
    return { lastDate: '', streak: 0 };
  }
}

function setCheckInFor(uid, next) {
  const safeUid = uid || 'me';
  try {
    const raw = localStorage.getItem(LS_CHECKINS);
    const map = raw ? JSON.parse(raw) : {};
    map[safeUid] = {
      lastDate: (next && next.lastDate) || '',
      streak: Number(next && next.streak) || 0,
    };
    localStorage.setItem(LS_CHECKINS, JSON.stringify(map));
  } catch {
    // ignore write errors
  }
}

  function dailyCheckIn() {
    const uid = me?.id || 'me';
const ci = getCheckInFor(uid);
const today = todayKey();

if (ci.lastDate === today) return;

const nextStreak =
  ci.lastDate === yesterdayKey()
    ? Math.max(1, (Number(ci.streak) || 0) + 1)
    : 1;

setCheckInFor(uid, { lastDate: today, streak: nextStreak });

    setNpPointsByUser((prev) => {
      const base = prev && typeof prev === 'object' ? prev : {};
      const curPts = Number(base[uid]) || 0;
      const reward = DAILY_CHECKIN_REWARD;
      return { ...base, [uid]: curPts + DAILY_CHECKIN_REWARD };
    });

    showToast(`Checked in • ${nextStreak}-day streak • +${DAILY_CHECKIN_REWARD} NP`);
  }

  // -------------------- SHARING (viral loop) --------------------
  function hasOnboardingClaimed(userId) {
    const raw =
      onboardingByUser && typeof onboardingByUser === 'object'
        ? onboardingByUser[userId]
        : null;
    return !!raw?.claimed;
  }

  function claimOnboardingBonus() {
    const uid = me?.id || 'me';

    // Requirements
    const ci = getCheckInFor(uid);
    const checkedInToday = ci.lastDate === todayKey();
    const hasPosted = (Array.isArray(posts) ? posts : []).some(
      (p) => p && p.ownerId === uid
    );
    const hasFollowed = followingSet && typeof followingSet.size === 'number'
      ? followingSet.size > 0
      : false;

    if (hasOnboardingClaimed(uid)) {
      showToast('Bonus already claimed');
      return;
    }

    if (!checkedInToday || !hasPosted || !hasFollowed) {
      showToast('Complete all 3 steps first');
      return;
    }

    const bonus = 25;

    setOnboardingByUser((prev) => {
      const base = prev && typeof prev === 'object' ? prev : {};
      return {
        ...base,
        [uid]: { claimed: true, claimedAt: NOW() },
      };
    });

    setNpPointsByUser((prev) => {
      const base = prev && typeof prev === 'object' ? prev : {};
      const curPts = Number(base[uid]) || 0;
      return { ...base, [uid]: curPts + bonus };
    });

    showToast(`Onboarding bonus claimed • +${bonus} NP`);
  }
  function showToast(msg) {
    if (!msg) return;
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2000);
  }

  function baseUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  // Use path-style deep links so shared links look like /p/<postId> and /ref/<userId>
  function postUrl(postId) {
    return `${window.location.origin}/p/${encodeURIComponent(postId)}`;
  }

  function inviteUrl(userId) {
    return `${window.location.origin}/ref/${encodeURIComponent(userId)}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (__) {
        return false;
      }
    }
  }

  async function shareUrl({ title, text, url }) {
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return true;
      }
    } catch (e) {
      // user cancelled share sheet — ignore
    }
    const copied = await copyText(url);
    if (copied) showToast('Link copied');
    else showToast('Could not copy link');
    return copied;
  }

  async function sharePost(post) {
    // Prefer native share on supporting browsers; otherwise open modal
    trackEvent('share_open', { postId: post?.id });
    if (navigator.share) {
      await performShareAction({ action: 'native', post });
      return;
    }
    // open explicit modal with fallbacks
    setShareTargetPost(post);
    setShareModalOpen(true);
  }

  // called from modal buttons to actually invoke native share / copy
  async function performShareAction({ action = 'native', post }) {
    const url = postUrl(post.id);
    const payload = { title: post.title || 'Neighbloom', text: `${post.title || 'Post'} — ${post.city || ''}`, url };
    if (action === 'native' && navigator.share) {
      try {
        await navigator.share(payload);
        setShareModalOpen(false);
        setShareTargetPost(null);
        showToast('Shared');
        return true;
      } catch (e) {
        // fall through to copy
      }
    }
    if (action === 'twitter') {
      const tw = `https://twitter.com/intent/tweet?text=${encodeURIComponent(payload.text)}&url=${encodeURIComponent(payload.url)}`;
      setShareModalOpen(false);
      setShareTargetPost(null);
      window.open(tw, '_blank');
      showToast('Opened Twitter');
      return true;
    }
    if (action === 'facebook') {
      const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(payload.url)}&quote=${encodeURIComponent(payload.text)}`;
      setShareModalOpen(false);
      setShareTargetPost(null);
      window.open(fb, '_blank');
      showToast('Opened Facebook');
      return true;
    }
    if (action === 'email') {
      const subject = encodeURIComponent(payload.title || 'Neighbloom');
      const body = encodeURIComponent(`${payload.text}\n\n${payload.url}`);
      const mailto = `mailto:?subject=${subject}&body=${body}`;
      // Ensure the link is available if the mail composer fails: copy first.
      try {
        await copyText(payload.url);
      } catch (e) {}
      setShareModalOpen(false);
      setShareTargetPost(null);
      window.location.href = mailto;
      showToast('Opened email composer');
      return true;
    }
    if (action === 'sms') {
      const body = encodeURIComponent(`${payload.text} ${payload.url}`);
      // Platform variations exist for sms URI schemes. Try to make a best-effort and
      // copy the link first so the user can paste if the composer doesn't open.
      try {
        await copyText(payload.url);
      } catch (e) {}
      const ua = (navigator.userAgent || '').toLowerCase();
      const isiOS = /iphone|ipad|ipod/.test(ua);
      const sms = isiOS ? `sms:&body=${body}` : `sms:?&body=${body}`;
      setShareModalOpen(false);
      setShareTargetPost(null);
      window.location.href = sms;
      showToast('Opened SMS');
      return true;
    }
    if (action === 'whatsapp') {
      const wa = `https://api.whatsapp.com/send?text=${encodeURIComponent(payload.text + ' ' + payload.url)}`;
      // copy link as backup (web clients may not have WhatsApp app installed)
      try { await copyText(payload.url); } catch (e) {}
      setShareModalOpen(false);
      setShareTargetPost(null);
      window.open(wa, '_blank');
      showToast('Opened WhatsApp');
      return true;
    }
    // default: copy
    const copied = await copyText(url);
    setShareModalOpen(false);
    setShareTargetPost(null);
    if (copied) showToast('Link copied');
    else showToast('Could not copy link');
    return copied;
  }

  async function shareInviteLink(userId) {
    const url = inviteUrl(userId);
    await shareUrl({
      title: 'Join Neighbloom',
      text: 'Join my neighborhood feed on Neighbloom',
      url,
    });
  }

  function toggleOtherVols(postId) {
  setExpandedOtherVols((prev) => {
    const base = prev && typeof prev === 'object' ? prev : {};
    return { ...base, [postId]: !base[postId] };
  });
}

  function getChatId(postId, a, b) {
    const x = [a, b].sort().join('|');
    return `${postId}::${x}`;
  }

  function readKey(userId, chatId) {
    return `${userId}::${chatId}`;
  }

  function getLastChatTs(chatId) {
  const msgs = Array.isArray(chats?.[chatId]) ? chats[chatId] : [];
  let max = 0;

  for (const m of msgs) {
    if (!m) continue;

    const tsRaw = m.ts;
    const ts =
      typeof tsRaw === 'number'
        ? tsRaw
        : typeof tsRaw === 'string'
        ? Number(tsRaw)
        : 0;

    if (Number.isFinite(ts) && ts > max) max = ts;
  }

  return max;
}

  function unreadCount(chatId, viewerId) {
  const msgs = Array.isArray(chats?.[chatId]) ? chats[chatId] : [];

  const rawLast = lastRead?.[readKey(viewerId, chatId)];
  const last =
    typeof rawLast === 'number'
      ? rawLast
      : typeof rawLast === 'string'
      ? Number(rawLast)
      : 0;

  let c = 0;
  for (const m of msgs) {
    if (!m) continue;

    const tsRaw = m.ts;
    const ts =
      typeof tsRaw === 'number'
        ? tsRaw
        : typeof tsRaw === 'string'
        ? Number(tsRaw)
        : NaN;

    if (!Number.isFinite(ts)) continue;
    if (Number.isFinite(last) && ts <= last) continue;
    if (m.fromId === viewerId) continue; // don’t count my own messages as unread
    c += 1;
  }
  return c;
}

  function markChatRead(chatId, viewerId) {
  const lastTs = getLastChatTs(chatId);
  const k = readKey(viewerId, chatId);

  setLastRead((prev) => {
    const raw = prev?.[k];
    const cur =
      typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : 0;

    const curSafe = Number.isFinite(cur) ? cur : 0;
    const lastSafe = Number.isFinite(lastTs) ? lastTs : 0;

    return {
      ...prev,
      [k]: Math.max(curSafe, lastSafe),
    };
  });
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
  if (!post || !otherUserId) return;

  // never open a chat with yourself
  if (otherUserId === me.id) return;

  // HELP: normalize "other" so a selected helper always chats with the owner
  if (post.kind === 'help') {
    const selected = getSelectedHelperIds(post);
    const meIsOwner = me.id === post.ownerId;
    const meIsSelectedHelper = selected.includes(me.id);

    if (meIsSelectedHelper && !meIsOwner) {
      otherUserId = post.ownerId;
    }
  }

  // Final gate for BOTH help + rec (prevents opening locked drawers)
  if (!canOpenChatForPost(post, otherUserId)) return;

  setChat({ postId, otherUserId });
}

  function sendChatMessage(postId, otherUserId, text) {
  const clean = normalizeText(text);
  if (!clean) return;

  const post = posts.find((p) => p && p.id === postId);
  if (!post || !otherUserId) return;

  // never message yourself
  if (otherUserId === me.id) return;

  // HELP: normalize "other" so a selected helper always chats with the owner
  if (post.kind === 'help') {
    const selected = getSelectedHelperIds(post);
    const meIsOwner = me.id === post.ownerId;
    const meIsSelectedHelper = selected.includes(me.id);

    if (meIsSelectedHelper && !meIsOwner) {
      otherUserId = post.ownerId;
    }
  }

  // Final gate (prevents ghost threads / writing into locked chats)
  if (!canOpenChatForPost(post, otherUserId)) return;

  const chatId = getChatId(postId, me.id, otherUserId);

  setChats((prev) => {
    const prevMsgs = Array.isArray(prev?.[chatId]) ? prev[chatId] : [];
    const next = [
      ...prevMsgs,
      { id: uid('m'), fromId: me.id, text: clean, ts: NOW() },
    ];
    return { ...(prev || {}), [chatId]: next };
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
    // Allow shorter volunteer replies to reduce friction (support "I can" style replies).
    if (mode === 'volunteer') {
      if (clean.length < 4) return { ok: false, error: 'Too short. Add one more detail.' };
    } else {
      if (clean.length < 8) return { ok: false, error: 'Too short. Add one more detail.' };
    }
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
  const base = prev && typeof prev === 'object' ? prev : {};
  const next = { ...base };

  // If slots are full, collapse others. Otherwise keep it open.
  if (nextSelected.length >= helpersNeeded) {
    delete next[postId];
  } else {
    next[postId] = true;
  }

  return next;
});

    // open chat immediately
    openChat(postId, userId);
  }

  function advanceHelpStage(postId, nextStage) {
  const post = posts.find((p) => p && p.id === postId);
  if (!post || post.kind !== 'help') return;

  const selected = getSelectedHelperIds(post);
  const meIsOwner = me.id === post.ownerId;
  const meIsSelectedHelper = selected.includes(me.id);

  // Only requester OR selected helper(s) can touch stages
  if (!meIsOwner && !meIsSelectedHelper) return;

  const order = { open: 0, booked: 1, started: 2, done: 3, confirmed: 4 };
  const curStage = post.stage || 'open';

  if (!(nextStage in order)) return;

  // Selected helpers can ONLY set started/done, and only forward
  if (!meIsOwner) {
    if (nextStage !== 'started' && nextStage !== 'done') return;
    if ((order[nextStage] ?? 0) < (order[curStage] ?? 0)) return;
    if (curStage === 'confirmed') return;
  }

  // If the actor is a selected helper, update their own reply-level status
  // instead of mutating the global post.stage. Owners still control the
  // canonical lifecycle of the post.
  if (!meIsOwner) {
    const myReply = (post.replies || []).find((r) => r && r.authorId === me.id);
    if (!myReply) return;
    // Map nextStage to helperStatus (started/done)
    setHelperStatus(postId, myReply.id, nextStage);
    return;
  }

  // Owner: update global post stage
  setPosts((prev) =>
    prev.map((p) => (p.id === postId ? { ...p, stage: nextStage } : p))
  );

  // Activity breadcrumb visible to BOTH sides
  const audience = Array.from(new Set([post.ownerId, ...selected].filter(Boolean)));
  const actorName = usersById[me.id]?.name || 'Neighbor';

  pushActivity({
    text: `${actorName} marked help as ${nextStage}.`,
    postId,
    actorId: me.id,
    postOwnerId: post.ownerId,
    postKind: post.kind,
    audienceIds: audience,
  });
}

  // Helpers shouldn’t change the global post stage; they should update their
  // own reply-level helperStatus (offered | started | done). This function
  // lets a helper set their status on their reply.
  function setHelperStatus(postId, replyId, status) {
    if (!postId || !replyId) return;
    const post = posts.find((p) => p && p.id === postId);
    if (!post || post.kind !== 'help') return;

    const reply = (post.replies || []).find((r) => r && r.id === replyId);
    if (!reply || reply.authorId !== me.id) return; // only update own reply

    setPosts((prev) =>
      (prev || []).map((p) => {
        if (!p || p.id !== postId) return p;
        const replies = (p.replies || []).map((r) =>
          r.id === replyId ? { ...r, helperStatus: status } : r
        );

        // If all selected helpers have now marked 'done', auto-promote post.stage -> 'done'
        const next = { ...p, replies };
        try {
          const selected = getSelectedHelperIds(next);
          if (Array.isArray(selected) && selected.length > 0) {
            const allDone = selected.every((id) => {
              const rr = (replies || []).find((x) => x && x.authorId === id);
              return rr && rr.helperStatus === 'done';
            });
            if (allDone && next.stage !== 'done' && next.stage !== 'confirmed') {
              return { ...next, stage: 'done' };
            }
          }
        } catch (e) {
          // fall back to conservative behavior
        }

        return next;
      })
    );

    pushActivity({
      text: `${usersById[me.id]?.name || 'You'} marked progress: ${status}.`,
      actorId: me.id,
      postId,
      postOwnerId: post.ownerId,
      postKind: 'help',
      audienceIds: [me.id, post.ownerId],
    });
  }

  function confirmHelp(postId) {
  const post = posts.find((p) => p && p.id === postId);
  if (!post) return;

  // Only the requester (post owner) can confirm + award NP
  if (me.id !== post.ownerId) return;

  const selectedIds = getSelectedHelperIds(post);
  if (post.kind !== 'help' || selectedIds.length === 0) return;

  if (post.stage === 'confirmed') return;

  // Don’t award points before the helper marks done
  if (post.stage !== 'done') {
    notify('Mark this help as “Done” before confirming.');
    return;
  }

  // If there's no approved completion photo, surface the award guard modal.
  if (!post.completionPhoto || !post.completionPhotoApproved) {
    setModal({ type: 'award_guard', postId, helperIds: selectedIds });
    return;
  }

  // Award via helper to keep logic DRY
  awardHelpers(postId, selectedIds);
}

  function awardHelpers(postId, selectedIds) {
    console.log('awardHelpers called', { postId, selectedIds });
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

    pushActivity({
      text: `Confirmed help. +20 NP to ${names}.`,
      postId,
      actorId: me.id,
      postOwnerId: posts.find((p) => p.id === postId)?.ownerId,
      postKind: 'help',
      audienceIds: Array.from(new Set([posts.find((p) => p.id === postId)?.ownerId, ...selectedIds].filter(Boolean))),
    });

    // celebration: confetti burst + toast showing total NP awarded
    const AWARD_PER_HELPER = 20;
    const totalAwarded = (selectedIds?.length || 0) * AWARD_PER_HELPER;
    console.log('awardHelpers: launching confetti, totalAwarded=', totalAwarded, 'postId=', postId, 'selectedIds=', selectedIds);
    // deliberately not wrapped in try/catch so errors surface in console
    launchConfetti(48);
    showToast(`+${totalAwarded} NP • Great job!`);

    // Delay opening the thank-you modal so celebration animations can run first
    setTimeout(() => {
      setModal({ type: 'thank_you', postId, helperIds: selectedIds });
    }, 2500);
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

  const post = posts.find((p) => p.id === chat.postId);
  if (!post) return;

  // Prevent marking read for the wrong viewer (demo user switches / locked chats)
  if (!canOpenChatForPost(post, chat.otherUserId)) return;

  const chatId = getChatId(chat.postId, me.id, chat.otherUserId);
  markChatRead(chatId, me.id);
}, [chat, chats, me.id, posts]);

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
      expandedThreads,
expandedOtherVols,
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
  expandedThreads,
expandedOtherVols,
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

  function navTo(tab) {
    // kill overlays that can make it FEEL like tabs don't work
    setChat(null);
    setThread(null);
    setModal(null);

    if (tab === 'post') setPostFlow({ step: 'chooser', kind: null });
    setActiveTab(tab);
  }

  function getTotalUnreadForUser(chatsObj, userId, unreadCountFn) {
  const obj = chatsObj && typeof chatsObj === 'object' ? chatsObj : {};
  let sum = 0;

  for (const chatId of Object.keys(obj)) {
    const pair = String(chatId).split('::')[1] || '';
    const members = pair.split('|');
    if (!members.includes(userId)) continue;
    sum += unreadCountFn(chatId, userId);
  }

  return sum;
}

  function Header() {
    const titleMap = {
      home: 'Home',
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

        const totalUnread = getTotalUnreadForUser(chats || chats, me.id, unreadCount);

    const unreadLabel = totalUnread > 9 ? '9+' : String(totalUnread);
    const uid = me?.id || 'me';
    const ci = getCheckInFor(uid);
    const checkedInToday = ci.lastDate === todayKey();
    const hasPosted = (Array.isArray(posts) ? posts : []).some(
      (p) => p && p.ownerId === uid
    );
    const hasFollowed =
      followingSet && typeof followingSet.size === 'number'
        ? followingSet.size > 0
        : false;

    const onboardingDoneCount = [checkedInToday, hasPosted, hasFollowed].filter(Boolean).length;
    const onboardingClaimed = hasOnboardingClaimed(uid);
    const onboardingAllDone = checkedInToday && hasPosted && hasFollowed;

    const onboardingPillMode = onboardingClaimed
  ? 'hidden'
  : onboardingAllDone
  ? 'claim'
  : 'start';

const onboardingTooltip =
  onboardingPillMode === 'claim'
    ? 'Claim your +25 NP bonus'
    : 'Quick start checklist: complete 3 steps to earn +25 NP';

    // NP badge calculations (show progress to next level)
    const points = npPoints;
    const displayedPoints = useAnimatedNumber(npPoints, 1000);
    const currentBadge =
      BADGES.slice()
        .reverse()
        .find((b) => points >= b.min) || BADGES[0];
    const nextBadge = BADGES.find((b) => points < b.min) || null;
    const prevMin = currentBadge.min;
    const nextMin = nextBadge ? nextBadge.min : prevMin;
    const denom = nextBadge ? Math.max(1, nextMin - prevMin) : 1;
    const progress = nextBadge ? Math.min(1, (points - prevMin) / denom) : 1;
    const toNext = nextBadge ? Math.max(0, nextMin - points) : 0;
    const nextParts = nextBadge ? badgeParts(nextBadge.name) : { emoji: '', name: '' };

    return (
      <>
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
              className="nb-iconbtn"
              aria-label="Your offers"
              title="Your offers"
              onClick={() => setYouOfferedOpen(true)}
            >
              🤝
              {myOffers && myOffers.length > 0 ? (
                <span className="nb-iconbadge" aria-hidden="true">
                  {myOffers.length > 9 ? '9+' : String(myOffers.length)}
                </span>
              ) : null}
            </button>

            <button
              className="nb-avatarbtn"
              aria-label="Profile"
              title="Profile"
              onClick={() => navTo('profile')}
            >
              <img className="nb-avatar sm" src={me.avatar} alt={me.name} />
            </button>
          </div>
        </div>

        {/* NP badge sits in its own row below the header to avoid overlap */}
        <div className="nb-np-row" style={{ padding: '10px 14px' }}>
          <button
            type="button"
            className="nb-np-badge"
            title="Neighbor Points"
            aria-label={`Neighbor Points ${npPoints} points`}
            onClick={() => setModal({ type: 'points' })}
          >
              <div className="nb-np-main">
              <div className="nb-np-value">{displayedPoints}</div>
              <div style={{ flex: 1 }}>
                <div className="nb-np-sub">{points} / {nextMin} NP</div>
                <div className="nb-np-progress" aria-hidden="true">
                  <div
                    className="nb-np-progress-inner"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="nb-np-note">
              {toNext} more to unlock {nextParts.emoji} {nextParts.name}
            </div>
          </button>
        </div>
      </>
    );
  }

  function YouOfferedPanel() {
    if (!youOfferedOpen) return null;

    return (
      <div className="nb-modal-backdrop" onClick={() => setYouOfferedOpen(false)}>
        <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
          <div className="nb-modal-head">
            <div className="nb-modal-title">Your offers</div>
            <button className="nb-x" onClick={() => setYouOfferedOpen(false)} aria-label="Close">✕</button>
          </div>

          <div className="nb-modal-body-scroll" style={{ padding: 14 }}>
            {(!myOffers || myOffers.length === 0) ? (
              <div className="nb-muted">You haven't offered on any help requests yet.</div>
            ) : (
              <div className="nb-offers-list">
                {myOffers.map((o) => (
                  <div key={`${o.postId}::${o.replyId}`} className="nb-offer-item">
                    <div className="nb-offer-main">
                      <div className="nb-offer-title" style={{ fontWeight: 900 }}>{o.postTitle}</div>
                      <div className="nb-offer-meta nb-muted">{o.postArea || ''} · {o.postStage}</div>
                    </div>
                    <div className="nb-offer-actions">
                      <button className="nb-btn nb-btn-ghost" onClick={() => goToOfferPost(o.postId)}>Open post</button>
                      {!o.selected ? (
                        <button className="nb-btn nb-btn-ghost" onClick={() => { cancelOffer(o.postId, o.replyId); }} style={{ marginLeft: 8 }}>Cancel</button>
                      ) : (
                        <div style={{ marginLeft: 8, fontWeight: 900, color: 'var(--accent)' }}>Selected</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="nb-modal-foot">
            <div className="nb-muted">Manage your active offers here.</div>
            <div className="nb-modal-actions">
              <button className="nb-btn nb-btn-primary" onClick={() => setYouOfferedOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function BottomTabs() {
    // total unread across chats involving me (for the badge on Activity)
    const totalUnread = getTotalUnreadForUser(chats || chats, me.id, unreadCount);

    const unreadLabel = totalUnread > 9 ? '9+' : String(totalUnread);

    

    return (
      <div className="nb-bottomtabs" role="navigation" aria-label="Primary">
        <button
          type="button"
          className={`nb-tabbtn ${activeTab === 'home' ? 'is-active' : ''}`}
          onClick={() => navTo('home')}
        >
          <span className="nb-tabicon" aria-hidden="true">🏠</span>
          <span className="nb-tablabel">Home</span>
        </button>

        <button
          type="button"
          className={`nb-tabbtn ${activeTab === 'post' ? 'is-active' : ''}`}
          onClick={() => navTo('post')}
        >
          <span className="nb-tabicon" aria-hidden="true">➕</span>
          <span className="nb-tablabel">Post</span>
        </button>

        <button
          type="button"
          className={`nb-tabbtn ${activeTab === 'activity' ? 'is-active' : ''}`}
          onClick={() => navTo('activity')}
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
          onClick={() => navTo('profile')}
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
    
    const visibleReplies = (post.replies || []).filter(
      (r) => !r.hidden && !isBlockedUser(r.authorId)
    );
    const isHelp = post.kind === 'help';
    const helpersNeeded = isHelp ? getHelpersNeeded(post) : 1;
    const selectedIds = isHelp ? getSelectedHelperIds(post) : [];
    const replyCount = visibleReplies.length;
      const [composerText, setComposerText] = useState('');
      const [composerErr, setComposerErr] = useState('');
      const composerRef = useRef(null);
      const draftKey = `nb_draft_reply_${post.id}`;
      // Load draft when composer mounts for this post
      useEffect(() => {
        try {
          const raw = localStorage.getItem(draftKey);
          if (raw && !composerText) setComposerText(raw);
        } catch (e) {}
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [inlineComposerFor, post.id]);

      // Autosave draft with debounce
      useEffect(() => {
        const t = setTimeout(() => {
          try {
            if (composerText && composerText.trim().length > 0) localStorage.setItem(draftKey, composerText);
            else localStorage.removeItem(draftKey);
          } catch (e) {}
        }, 700);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [composerText]);
      useEffect(() => {
        if (inlineComposerFor === post.id && composerRef.current) {
          try {
            composerRef.current.focus();
          } catch (e) {}
        }
      }, [inlineComposerFor, post.id]);

      const renderInlineComposer = () => (
        <div className="nb-inline-composer">
          <textarea
            ref={composerRef}
            className={`nb-input nb-textarea ${composerErr ? 'has-error' : ''}`}
            value={composerText}
            onChange={(e) => {
              setComposerText(e.target.value);
              setComposerErr('');
            }}
            placeholder={'Example: "I can help at 7pm. I have a dolly and straps."'}
          />

          {composerErr ? <div className="nb-error">{composerErr}</div> : null}

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button
              className="nb-btn nb-btn-ghost"
              onClick={() => {
                setComposerText('');
                setComposerErr('');
                setInlineComposerFor(null);
              }}
            >
              Cancel
            </button>

            <button
              className="nb-btn nb-btn-primary"
              onClick={() => {
                const res = submitReply(post.id, 'volunteer', composerText);
                if (!res.ok) setComposerErr(res.error);
                else {
                  try { localStorage.removeItem(draftKey); } catch (e) {}
                  setComposerText('');
                  setComposerErr('');
                  setInlineComposerFor(null);
                }
              }}
            >
              Send offer
            </button>
          </div>
        </div>
      );

    if (!visibleReplies.length) {
      return (
        <div className="nb-thread-empty">
          {/* Helpers summary lives in the thread area now */}
          {isHelp ? (
            <div className="nb-thread-summary">
              Helpers now: {selectedIds.length}/{helpersNeeded} selected · {replyCount} volunteered
            </div>
          ) : null}

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

          {inlineComposerFor === post.id && !isOwner && post.status !== 'resolved' ? renderInlineComposer() : null}

        </div>
      );
    }

    

    const hasChosen = isHelp && selectedIds.length > 0;
    const slotsFull = isHelp && selectedIds.length >= helpersNeeded;

    const chosenReplies = hasChosen
      ? visibleReplies.filter((r) => selectedIds.includes(r.authorId))
      : [];

    const otherReplies = hasChosen
      ? visibleReplies.filter((r) => !selectedIds.includes(r.authorId))
      : visibleReplies;

    const otherCount = hasChosen ? otherReplies.length : 0;
    const othersOpen = !!expandedOtherVols?.[post.id];

    const listToRender = hasChosen
      ? [...chosenReplies, ...(othersOpen ? otherReplies : [])]
      : visibleReplies;

    return (
      <div className="nb-thread">
        {inlineComposerFor === post.id && !isOwner && post.status !== 'resolved' ? renderInlineComposer() : null}
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
                alt={u?.name || 'Neighbor'}
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
                    {post.kind === 'help' && r.helperStatus ? (
                      <span
                        className="nb-helper-status"
                        title={`Status: ${r.helperStatus}`}
                        style={{ marginLeft: 8, fontSize: 12, fontWeight: 900 }}
                      >
                        {r.helperStatus === 'offered' ? 'You offered' : r.helperStatus === 'started' ? 'Started' : r.helperStatus === 'done' ? 'Done' : r.helperStatus}
                      </span>
                    ) : null}
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
                          onClick={(e) => {
  e.stopPropagation();
  openChat(post.id, chatOtherUserId);
}}
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
                        <>
                          <button
                            className="nb-link"
                            onClick={() => setPendingSelection({ postId: post.id, userId: r.authorId, userName: usersById[r.authorId]?.name || 'Helper' })}
                            title="Select this helper"
                          >
                            {helpersNeeded > 1
                              ? `Choose helper (${selectedIds.length}/${helpersNeeded})`
                              : 'Choose helper'}
                          </button>

                          {/* Inline pending-confirm row for owner to confirm selection */}
                          {pendingSelection && pendingSelection.postId === post.id && pendingSelection.userId === r.authorId ? (
                            <div className="nb-pending-confirm" style={{ marginTop: 8 }}>
                              <span style={{ marginRight: 10 }}>Pick {pendingSelection.userName} as helper?</span>
                              <button
                                className="nb-btn nb-btn-primary"
                                onClick={() => { chooseOneForChat(post.id, r.authorId); setPendingSelection(null); }}
                              >
                                Select helper
                              </button>
                              <button
                                className="nb-btn nb-btn-ghost"
                                style={{ marginLeft: 8 }}
                                onClick={() => setPendingSelection(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : null}
                        </>
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

  // ---------------- ACTIVITY (in-app notifications) ----------------
  function pushActivityEvent(evt) {
    setActivity((prev) => [evt, ...(Array.isArray(prev) ? prev : [])]);
  }

  // Compatibility wrapper: older code calls pushActivity(...)
// Supports either pushActivity("text") or pushActivity({eventObject})
function pushActivity(arg, meta = {}) {
  if (arg && typeof arg === 'object') {
    return pushActivityEvent(arg);
  }
  return pushActivityEvent({
    type: 'log',
    text: String(arg || ''),
    ...meta,
  });
}

  function notify(text, extra = {}) {
    pushActivityEvent({
      id: uid('a'),
      type: extra.type || 'notice',
      text,
      ts: NOW(),
      audienceIds: [me.id],
      actorId: me.id,
      ...extra,
    });
  }

  // ---------------- BLOCK / REPORT ----------------
  function getBlockedSet(userId) {
    const arr = blockedByUser?.[userId];
    return new Set(Array.isArray(arr) ? arr : []);
  }

  function isBlockedUser(otherUserId) {
    return getBlockedSet(me.id).has(otherUserId);
  }

  function toggleBlockUser(otherUserId) {
    setBlockedByUser((prev) => {
      const base = prev && typeof prev === 'object' ? prev : {};
      const cur = new Set(Array.isArray(base[me.id]) ? base[me.id] : []);
      if (cur.has(otherUserId)) cur.delete(otherUserId);
      else cur.add(otherUserId);
      return { ...base, [me.id]: Array.from(cur) };
    });

    // Close chat if you block them (prevents weird “still chatting” behavior)
    setChat((c) => (c?.otherUserId === otherUserId ? null : c));

    notify(
      isBlockedUser(otherUserId) ? 'User unblocked.' : 'User blocked.',
      { type: 'user_block', otherUserId }
    );
  }

  function reportUser(otherUserId) {
    const reason = window.prompt('Report reason (short):');
    if (!reason) return;

    const clean = normalizeText(reason);
    if (!clean) return;

    setReports((prev) => [
      {
        id: uid('rep'),
        reporterId: me.id,
        reportedUserId: otherUserId,
        reason: clean,
        ts: NOW(),
      },
      ...(Array.isArray(prev) ? prev : []),
    ]);

    notify('Report submitted (local demo).', {
      type: 'user_report',
      otherUserId,
    });
  }

  // ---------------- POST LIFECYCLE ----------------
  function inferLifecycle(post) {
    // Prefer explicit lifecycle if present
    if (post?.lifecycle) return post.lifecycle;

    // Back-compat with your older states
    if (post?.status === 'archived') return 'archived';
    if (post?.status === 'resolved') return 'completed';

    // Help posts already have stage — map it
    if (post?.kind === 'help') {
      if (post.stage === 'confirmed') return 'completed';
      if (post.stage && post.stage !== 'open') return 'in_progress';
    }

    return 'open';
  }

  function setPostLifecycle(postId, nextLifecycle) {
    setPosts((prev) =>
      (Array.isArray(prev) ? prev : []).map((p) => {
        if (!p || p.id !== postId) return p;

        // Keep your old "status" in sync for backwards UI logic if needed
        const nextStatus =
          nextLifecycle === 'archived'
            ? 'archived'
            : nextLifecycle === 'completed'
            ? 'resolved'
            : 'open';

        return {
          ...p,
          lifecycle: nextLifecycle,
          status: nextStatus,
        };
      })
    );

    notify(`Post moved to: ${nextLifecycle.replace('_', ' ')}`, {
      type: 'post_status',
      postId,
    });
  }

  function nextLifecycle(cur) {
    if (cur === 'open') return 'in_progress';
    if (cur === 'in_progress') return 'completed';
    if (cur === 'completed') return 'archived';
    return 'open';
  }

  // ---------------- EDIT / DELETE ----------------
  function updatePost(postId, patch) {
    setPosts((prev) =>
      (Array.isArray(prev) ? prev : []).map((p) =>
        p && p.id === postId ? { ...p, ...patch } : p
      )
    );
    notify('Post updated.', { type: 'post_edit', postId });
  }

  function deletePost(postId) {
    const ok = window.confirm(
      'Delete this post? This cannot be undone (local demo).'
    );
    if (!ok) return;

    setPosts((prev) => (Array.isArray(prev) ? prev : []).filter((p) => p?.id !== postId));

    // Clean UI state so you don’t get “ghost thread/chat”
    setExpandedThreads((prev) => {
      const next = { ...(prev || {}) };
      delete next[postId];
      return next;
    });
    setThread((t) => (t?.postId === postId ? null : t));
    setChat((c) => (c?.postId === postId ? null : c));
    setModal(null);

    notify('Post deleted.', { type: 'post_delete', postId });
  }

  function PostCard({ post }) {
    const isOwner = post.ownerId === me.id;
    const [overflowOpen, setOverflowOpen] = useState(false);
    const overflowRef = useRef(null);
    const overflowBtnRef = useRef(null);
    const lifecycle = inferLifecycle(post);
    const open = !!expandedThreads[post.id];
    const repliesVisible = (post.replies || []).filter((r) => !r.hidden);
    const replyCount = repliesVisible.length;

    const threadLabel =
      post.kind === 'rec'
        ? `Recommendations (${replyCount})`
        : `Volunteers (${replyCount})`;

    const helpersNeeded = post.kind === 'help' ? getHelpersNeeded(post) : 1;

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

    const replyBtnLabel = post.kind === 'rec' ? 'Recommend' : 'Offer help';

    const viewerAlreadyOffered = (post.replies || []).some(
      (r) => r && r.authorId === me.id && r.type === 'volunteer'
    );

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

    const cardKindClass = post.kind === 'help' ? 'nb-card-help' : post.kind === 'rec' ? 'nb-card-rec' : '';

    return (
      <div id={`post_card_${post.id}`} className={"nb-card " + cardKindClass}>
        <PostMetaLine post={post} />

        <div className="nb-card-main">
          <div className="nb-card-title">{post.title}</div>
          {post.kind === 'help' && post.photo ? (
            <img className="nb-card-photo" src={post.photo} alt="" />
          ) : null}
          {post.kind === 'help' && post.completionPhoto ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 950, marginBottom: 6, color: 'var(--good)' }}>Completed ✓</div>
              <img className="nb-card-photo" src={post.completionPhoto} alt="Completion photo" />
            </div>
          ) : null}

          <div className="nb-meta-chips">
            {/* Simplified chips: category, location, time */}
            {post.kind === 'help' ? (
              <>
                <span className="nb-meta-chip">{post.category}</span>
                <span className="nb-meta-chip">{post.area}</span>
                {post.whenRange ? (
                  <span className="nb-meta-chip">{post.whenRange}</span>
                ) : null}
              </>
            ) : null}

            {post.kind === 'rec' ? (
              <>
                <span className="nb-meta-chip accent">{post.recCategory || 'Recommendation'}</span>
                <span className="nb-meta-chip">{post.area}</span>
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
                className={`nb-btn nb-btn-primary ${viewerAlreadyOffered ? 'is-disabled' : ''}`}
                disabled={viewerAlreadyOffered}
                onClick={() => {
                  if (viewerAlreadyOffered) return;
                  if (post.kind === 'help') {
                    setExpandedThreads((prev) => {
                      const next = { ...(prev || {}) };
                      const wasOpen = !!next[post.id];
                      next[post.id] = true;
                      if (!wasOpen) setComposerOpenedFor(post.id);
                      return next;
                    });
                    setInlineComposerFor(post.id);
                  } else {
                    setModal({ type: 'reply', postId: post.id, mode: 'suggest' });
                  }
                }}
              >
                {viewerAlreadyOffered ? 'Offer sent' : replyBtnLabel}
              </button>
            ) : null}

            {/* Overflow menu: consolidate secondary actions (Open chat, Share, Thread) into one menu for all users; owner items remain */}
            <div style={{ position: 'relative' }} ref={overflowRef}>
              <button
                ref={overflowBtnRef}
                className="nb-btn nb-btn-ghost nb-btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setOverflowOpen((s) => !s);
                }}
                aria-haspopup="true"
                aria-expanded={overflowOpen}
                title="More"
              >
                ⋯
              </button>

              <PostOverflowMenu
                anchorRef={overflowBtnRef}
                open={overflowOpen}
                onClose={() => setOverflowOpen(false)}
                items={(() => {
                  const items = [];
                  if (showChatButton) items.push({ label: 'Open chat', onClick: () => openChat(post.id, chatOtherUserId) });
                  items.push({ label: 'Share', onClick: () => sharePost(post) });
                  if (replyCount > 0) items.push({ label: open ? `Hide ${threadLabel}` : `Show ${threadLabel}`, onClick: () => toggleThread(post.id) });
                  if (isOwner) {
                    items.push({ label: 'Edit', onClick: () => setModal({ type: 'edit_post', postId: post.id }) });
                    items.push({ label: 'Delete', danger: true, onClick: () => deletePost(post.id) });
                    items.push({ label: lifecycle === 'open' ? 'Start' : lifecycle === 'in_progress' ? 'Complete' : lifecycle === 'completed' ? 'Archive' : 'Restore', onClick: () => setPostLifecycle(post.id, nextLifecycle(lifecycle)) });
                  } else {
                    items.push({ label: 'Report', onClick: () => reportUser(post.ownerId) });
                  }
                  return items;
                })()}
              />
            </div>

            {isOwner && post.kind === 'help' && (selectedHelperIds.length > 0) ? (
              <div className="nb-helpflow">
                <button
                  className={`nb-btn nb-btn-primary ${post.stage === 'confirmed' ? 'is-on' : ''}`}
                  onClick={() => setModal({ type: 'confirm_award', postId: post.id, helperIds: getSelectedHelperIds(post) })}
                  disabled={post.stage !== 'done' && post.stage !== 'confirmed'}
                  title={
                    post.stage === 'done'
                      ? 'Award +20 NP to selected helper(s)'
                      : 'Waiting for helper to mark Completed'
                  }
                >
                  Confirm - Award NP
                </button>
              </div>
            ) : null}

            {/* Selected helper UI: single Completed button + awaiting confirmation */}
            {!isOwner && post.kind === 'help' && post.status !== 'resolved' && (post.replies || []).some((r) => r && r.authorId === me.id) && selectedHelperIds.includes(me.id) ? (
              (() => {
                const myReply = (post.replies || []).find((r) => r && r.authorId === me.id);
                if (!myReply) return null;
                const cur = myReply.helperStatus || 'offered';
                return (
                  <div className="nb-helpflow">
                    {cur !== 'done' ? (
                      <button
                        className="nb-btn nb-btn-primary"
                        onClick={() => {
                          if (!myReply) return;
                          setHelperStatus(post.id, myReply.id, 'done');
                          pushActivity({ text: `${usersById[me.id]?.name || 'You'} marked this as completed.`, actorId: me.id, postId: post.id, audienceIds: [me.id, post.ownerId] });
                        }}
                      >
                        Completed
                      </button>
                    ) : (
                      <span className="nb-muted small" style={{ fontWeight: 900 }}>
                        Awaiting confirmation
                      </span>
                    )}

                    <button
                      className="nb-btn nb-btn-ghost nb-btn-sm"
                        onClick={() => {
                        if (!myReply) return;
                        const ok = window.confirm('Cancel your offer?');
                        if (!ok) return;
                        setPosts((prev) =>
                          (prev || []).map((p) => {
                            if (p.id !== post.id) return p;
                            const nextReplies = (p.replies || []).filter((r) => r.id !== myReply.id);
                            const prevSelected = Array.isArray(p.selectedUserIds)
                              ? p.selectedUserIds
                              : p.selectedUserId
                              ? [p.selectedUserId]
                              : [];
                            const nextSelected = prevSelected.filter((id) => id !== myReply.authorId);
                            return {
                              ...p,
                              replies: nextReplies,
                              selectedUserIds: nextSelected.length ? nextSelected : undefined,
                            };
                          })
                        );
                        pushActivity({ text: `${usersById[me.id]?.name || 'You'} cancelled an offer.`, actorId: me.id, postId: post.id, audienceIds: [me.id, post.ownerId] });
                      }}
                      title="Cancel your offer"
                    >
                      Cancel offer
                    </button>
                  </div>
                );
              })()
            ) : null}

            
            <button
              type="button"
              className="nb-btn nb-btn-ghost nb-btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                sharePost(post);
              }}
              title="Share this post"
            >
              Share
            </button>

            {replyCount > 0 ? (
              <button
                type="button"
                className="nb-link"
                onClick={() => toggleThread(post.id)}
              >
                {open ? 'Hide' : 'Show'} {threadLabel}
              </button>
            ) : null}
          </div>

          {open ? <ReplyList post={post} /> : null}
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

  function ThankYouModal({ postId, helperIds }) {
  const post = posts.find((p) => p && p.id === postId);
  const ids = Array.isArray(helperIds) ? helperIds.filter(Boolean) : [];

  const helpers = ids
    .map((id) => usersById[id])
    .filter((u) => u && u.id);

  const totalAwarded = ids.length * 20;

  return (
    <div className="nb-modal-backdrop" onClick={() => setModal(null)}>
      <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nb-modal-head">
          <div className="nb-modal-title">Thank you</div>
          <button className="nb-x" onClick={() => setModal(null)} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="nb-modal-sub">
          Confirmed. {totalAwarded} NP awarded across {ids.length} helper
          {ids.length === 1 ? '' : 's'}.
        </div>

        <div className="nb-modal-body-scroll" style={{ padding: 14 }}>
          <div style={{ fontWeight: 950 }}>{post?.title || 'Help request'}</div>

          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {helpers.map((h) => {
              const canChat = post ? canOpenChatForPost(post, h.id) : false;

              return (
                <div
                  key={h.id}
                  className="nb-thanks-row"
                >
                  <img className="nb-avatar sm" src={h.avatar} alt={h.name} />

                  <div className="nb-thanks-main">
                    <div className="nb-thanks-top">
                      <div className="nb-thanks-name">
                        {h.name}
                        <span style={{ marginLeft: 8 }}><UserBadge userId={h.id} /></span>
                      </div>
                      <div className="nb-thanks-np">🎉 +20 NP 🙌</div>
                    </div>
                    <div className="nb-thanks-sub">{h.handle} • Thank you</div>
                  </div>

                      <div style={{ marginLeft: 10 }}>
                    <button
                      className="nb-btn nb-btn-primary nb-btn-sm"
                      disabled={!canChat}
                      style={{ minWidth: 140 }}
                      onClick={() => {
                        try { launchConfetti(48); } catch (e) {}
                        try { setModal(null); } catch (e) {}
                        setTimeout(() => {
                          sendChatMessage(
                            postId,
                            h.id,
                            'Thanks again — confirmed. Appreciate you.'
                          );
                          openChat(postId, h.id);
                        }, 80);
                      }}
                      title={canChat ? 'Send a quick thank-you' : 'Chat is locked'}
                    >
                      Send thanks
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="nb-modal-foot">
          <div className="nb-muted">No payments in-app — keep it neighborly.</div>
          <div className="nb-modal-actions">
            <button className="nb-btn nb-btn-primary" onClick={() => setModal(null)}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function launchConfetti(count = 36) {
  const root = document.body;
  try {
    if (root && root.style) root.style.overflowX = 'hidden';
  } catch (e) {}
  const pieces = [];
  // Brand palette: coral, turquoise, gold
  const colors = ['#FF6A3D', '#4FD1C5', '#F59E0B'];
  console.log('launchConfetti called, count=', count, 'colors=', colors);
  let firstLogged = false;
  for (let i = 0; i < count; i++) {
  const el = document.createElement('div');
  el.className = 'nb-confetti-piece';
  el.style.background = colors[Math.floor(Math.random() * colors.length)];
  el.style.left = Math.round(Math.random() * 80 + 10) + '%';
    const w = 8 + Math.round(Math.random() * 14);
    const h = 10 + Math.round(Math.random() * 18);
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    // overall fall centered around ~2s with slight variance
    const fall = 1.6 + Math.random() * 0.8; // ~1.6 - 2.4s
    const spin = 0.9 + Math.random() * 1.2;
    el.style.animationDuration = `${fall}s, ${spin}s`;
    root.appendChild(el);
    pieces.push(el);
    if (!firstLogged) {
      try {
        const cs = window.getComputedStyle(el);
        console.log('confetti piece computed style:', { animationName: cs.animationName, animationDuration: cs.animationDuration, width: cs.width, height: cs.height });
      } catch (e) {
        console.log('confetti computed style read failed', e);
      }
      firstLogged = true;
    }
    setTimeout(() => {
      try { el.remove(); } catch (e) {}
    }, (fall * 1000) + 600 + Math.round(Math.random() * 600));
  }
  // restore overflow after confetti animation finishes
  try {
    setTimeout(() => {
      try {
        if (root && root.style) root.style.overflowX = '';
      } catch (e) {}
    }, 3000);
  } catch (e) {}
}

function OnboardingModal() {
    const uid = me?.id || 'me';

    // Step 1: check-in today
    const ci = getCheckInFor(uid);
    const checkedInToday = ci.lastDate === todayKey();

    // Step 2: posted at least once
    const hasPosted = (Array.isArray(posts) ? posts : []).some(
      (p) => p && p.ownerId === uid
    );

    // Step 3: followed at least 1 person
    const hasFollowed =
      followingSet && typeof followingSet.size === 'number'
        ? followingSet.size > 0
        : false;

    const doneCount = [checkedInToday, hasPosted, hasFollowed].filter(Boolean)
      .length;

    const claimed = hasOnboardingClaimed(uid);
    const allDone = checkedInToday && hasPosted && hasFollowed;

    const title = claimed
      ? 'All set'
      : allDone
      ? 'Claim your bonus'
      : 'Start here';

    const sub = claimed
      ? 'You already claimed your onboarding bonus.'
      : allDone
      ? 'Nice — you completed all 3 steps.'
      : 'Do these 3 quick actions to unlock your first bonus.';

    function goToPostHelp() {
      setModal(null);
      setActiveTab('post');
      setPostFlow({ step: 'form', kind: 'help' });
    }

    function goToPostRec() {
      setModal(null);
      setActiveTab('post');
      setPostFlow({ step: 'form', kind: 'rec' });
    }

    function goToProfile() {
      setModal(null);
      setActiveTab('profile');
    }

    function doCheckIn() {
      if (checkedInToday) return;
      dailyCheckIn();
    }

    return (
      <div className="nb-modal-backdrop" onClick={() => setModal(null)}>
        <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
          <div className="nb-modal-head">
            <div className="nb-modal-title">{title}</div>
            <button className="nb-x" onClick={() => setModal(null)} aria-label="Close">
              ✕
            </button>
          </div>

          <div className="nb-modal-sub">
            <div style={{ fontWeight: 980 }}>{sub}</div>
            {!claimed ? (
              <div style={{ marginTop: 6, color: 'var(--muted)', fontWeight: 850 }}>
                Progress: {doneCount}/3 • Bonus: +25 NP
              </div>
            ) : null}
          </div>

          <div className="nb-modal-body-scroll" style={{ padding: 14 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              {/* Step 1 */}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'rgba(255,255,255,.03)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 950 }}>
                    1) Daily check-in {checkedInToday ? '✅' : ''}
                  </div>
                  <div className="nb-muted small" style={{ fontWeight: 850, marginTop: 4 }}>
                    Quick win to get you moving.
                  </div>
                </div>

                <button
                  className={checkedInToday ? 'nb-btn nb-btn-ghost nb-btn-sm' : 'nb-btn nb-btn-primary nb-btn-sm'}
                  disabled={checkedInToday}
                  onClick={doCheckIn}
                  title={checkedInToday ? 'Done' : 'Check in'}
                >
                  {checkedInToday ? 'Done' : '+5 NP'}
                </button>
              </div>

              {/* Step 2 */}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'rgba(255,255,255,.03)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 950 }}>
                    2) Make your first post {hasPosted ? '✅' : ''}
                  </div>
                  <div className="nb-muted small" style={{ fontWeight: 850, marginTop: 4 }}>
                    Ask for help or request a recommendation.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button
                    className="nb-btn nb-btn-ghost nb-btn-sm"
                    disabled={hasPosted}
                    onClick={goToPostRec}
                    title="Create a recommendation request"
                  >
                    Rec
                  </button>
                  <button
                    className="nb-btn nb-btn-primary nb-btn-sm"
                    disabled={hasPosted}
                    onClick={goToPostHelp}
                    title="Create a Need a hand post"
                  >
                    Help
                  </button>
                </div>
              </div>

              {/* Step 3 */}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'rgba(255,255,255,.03)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 950 }}>
                    3) Follow 1 neighbor {hasFollowed ? '✅' : ''}
                  </div>
                  <div className="nb-muted small" style={{ fontWeight: 850, marginTop: 4 }}>
                    Following makes your feed feel alive.
                  </div>
                </div>

                <button
                  className={hasFollowed ? 'nb-btn nb-btn-ghost nb-btn-sm' : 'nb-btn nb-btn-primary nb-btn-sm'}
                  disabled={hasFollowed}
                  onClick={goToProfile}
                  title={hasFollowed ? 'Done' : 'Go follow someone'}
                >
                  {hasFollowed ? 'Done' : 'Go'}
                </button>
              </div>
            </div>
          </div>

          <div className="nb-modal-foot">
            <div className="nb-muted">
              {claimed
                ? 'You’re good. Now just use the app.'
                : allDone
                ? 'Claim your onboarding bonus now.'
                : 'Finish all 3 steps to unlock the bonus.'}
            </div>

            <div className="nb-modal-actions">
              <button className="nb-btn nb-btn-ghost" onClick={() => setModal(null)}>
                Close
              </button>

              <button
                className="nb-btn nb-btn-primary"
                disabled={claimed || !allDone}
                onClick={() => {
                  claimOnboardingBonus();
                  setModal(null);
                }}
                title={claimed ? 'Already claimed' : !allDone ? 'Complete all steps first' : 'Claim +25 NP'}
              >
                {claimed ? 'Claimed' : 'Claim +25'}
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

  function EditPostModal({ postId }) {
    const post = posts.find((p) => p?.id === postId);
    const [title, setTitle] = useState(post?.title || '');
    const [details, setDetails] = useState(post?.details || '');
    const [area, setArea] = useState(post?.area || '');
    const [err, setErr] = useState('');

    if (!post) return null;

    return (
      <div className="nb-modal-backdrop" onClick={() => setModal(null)}>
        <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
          <div className="nb-modal-head">
            <div className="nb-modal-title">Edit post</div>
            <button className="nb-x" onClick={() => setModal(null)} aria-label="Close">
              ✕
            </button>
          </div>

          <div className="nb-modal-body-scroll" style={{ padding: 14 }}>
            <div className="nb-row">
              <label className="nb-label">Title</label>
              <input
                className="nb-input"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setErr('');
                }}
              />
            </div>

            <div className="nb-row">
              <label className="nb-label">Area</label>
              <input
                className="nb-input"
                value={area}
                onChange={(e) => {
                  setArea(e.target.value);
                  setErr('');
                }}
              />
            </div>

            <div className="nb-row">
              <label className="nb-label">Details</label>
              <textarea
                className={`nb-input nb-textarea ${err ? 'has-error' : ''}`}
                value={details}
                onChange={(e) => {
                  setDetails(e.target.value);
                  setErr('');
                }}
              />
            </div>

            {err ? <div className="nb-error">{err}</div> : null}
          </div>

          <div className="nb-modal-foot">
            <div className="nb-muted">Edits are local demo only.</div>
            <div className="nb-modal-actions">
              <button className="nb-btn nb-btn-ghost" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="nb-btn nb-btn-primary"
                onClick={() => {
                  const t = normalizeText(title);
                  const d = normalizeText(details);
                  const a = normalizeText(area);
                  if (!t) return setErr('Title is required.');
                  if (!a) return setErr('Area is required.');
                  if (!d) return setErr('Details are required.');

                  updatePost(postId, { title: t, details: d, area: a });
                  setModal(null);
                }}
              >
                Save
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
    const replyTextareaRef = useRef(null);

    useEffect(() => {
      if (replyTextareaRef && replyTextareaRef.current) {
        try {
          replyTextareaRef.current.focus();
        } catch (e) {}
      }
    }, []);

    if (!post) return null;

    const heading =
  mode === 'suggest'
    ? 'Add a recommendation'
    : mode === 'lead'
    ? 'Share a lead'
    : 'Offer help';

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
            ref={replyTextareaRef}
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
    const rawMsgs = chats?.[chatId];
    const msgs = Array.isArray(rawMsgs)
      ? rawMsgs.filter(
          (m) => m && typeof m === 'object' && typeof m.text === 'string'
        )
      : [];

    // guard: only show if gated properly
if (!canOpenChatForPost(post, chat.otherUserId)) {
  const lockedBody =
    post.kind === 'rec'
      ? 'This chat unlocks only after the post owner chooses a Top pick (and private chat is enabled).'
      : 'This chat unlocks only after the requester selects you as a helper.';

  return (
    <div className="nb-chat">
      <div className="nb-chat-head">
        <div className="nb-chat-title">Chat locked</div>
        <button className="nb-x" onClick={() => setChat(null)} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="nb-chat-body">{lockedBody}</div>
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

  function LiveBoard({ me, users, onOpenAvailable }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState('');
  const [availTick, setAvailTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setAvailTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const meId = me?.id || 'me';
  const locRaw = String(me?.location || '').trim();

  const myAvail = useMemo(() => getUserAvailability(meId), [meId, availTick]);
  const myOn = isAvailabilityActive(myAvail);

  // Build list of available users (real toggle, auto-expiring)
  const availableUsers = useMemo(() => {
    const roster = Array.isArray(users) ? users : [];
    return roster
      .map((u) => {
        const v = getUserAvailability(u?.id);
        return { u, v, on: isAvailabilityActive(v) };
      })
      .filter((x) => x?.u?.id && x.on);
  }, [users, availTick]);

  const otherAvailableUsers = useMemo(() => {
    return (Array.isArray(availableUsers) ? availableUsers : []).filter(
      (x) => x?.u?.id && x.u.id !== meId
    );
  }, [availableUsers, meId]);

  const wrapStyle = {
    marginTop: 10,
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: 12,
    background: 'rgba(255,255,255,.02)',
  };

  const headerRow = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  };

  const chipRow = {
    marginTop: 10,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  };

  const chipStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    border: '1px solid var(--border)',
    borderRadius: 999,
    background: 'rgba(255,255,255,.03)',
    color: 'var(--text)',
    fontWeight: 900,
    fontSize: 12,
    cursor: 'pointer',
  };

  const chipPassive = { ...chipStyle, cursor: 'default', opacity: 0.85 };

  return (
    <div style={wrapStyle}>
      <div style={headerRow}>
        <div style={{ fontWeight: 980 }}>
          Helpers available{locRaw ? ` near ${locRaw}` : ''}
        </div>

        <button
          type="button"
          className="nb-herolink"
          onClick={() => setExpanded((v) => !v)}
          style={{ padding: 0, margin: 0 }}
          title={expanded ? 'Hide controls' : 'Show controls'}
        >
          <span className="nb-herolink-accent">{expanded ? 'Hide' : 'Details'}</span>
        </button>
      </div>

      <div style={chipRow}>
        <button
          type="button"
          style={chipStyle}
          onClick={() => onOpenAvailable && onOpenAvailable()}
          title="See who else is available now"
        >
          🟢 {otherAvailableUsers.length} available now
        </button>

        <span style={chipPassive}>
          Your status: {myOn ? 'Available ✅' : 'Off'}
        </span>
      </div>

      {expanded ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <div style={{ fontWeight: 900, opacity: 0.85 }}>
            Toggle your availability (auto-expires in ~2 hours)
          </div>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (e.g., 'free until 3pm')"
            className="nb-input"
          />
          <div className="nb-muted small" style={{ fontWeight: 850, opacity: 0.85 }}>
  This note will show to neighbors in the “Available now” list.
  {note ? ` Preview: “${note}”` : ''}
</div>

          <button
            type="button"
            className={myOn ? 'nb-btn nb-btn-ghost' : 'nb-btn nb-btn-primary'}
            onClick={() => {
              const nextOn = !myOn;
              setUserAvailability(meId, nextOn, note);
              // force immediate UI refresh
              setAvailTick((x) => x + 1);
            }}
            style={{ justifyContent: 'center' }}
          >
            {myOn ? 'Turn OFF availability' : 'I’m available now'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------- AVAILABILITY (Helpers Available Now) ----------------
const LS_AVAIL = 'nb_availability_v1';

// Returns: { [userId]: { on: boolean, note: string, ts: number } }
function getAvailabilityMap() {
  try {
    const raw = localStorage.getItem(LS_AVAIL);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function setAvailabilityMap(next) {
  try {
    localStorage.setItem(LS_AVAIL, JSON.stringify(next || {}));
  } catch {}
}

function getUserAvailability(userId) {
  const m = getAvailabilityMap();
  const v = m?.[userId];
  return v && typeof v === 'object'
    ? { on: !!v.on, note: String(v.note || ''), ts: Number(v.ts || 0) }
    : { on: false, note: '', ts: 0 };
}

// Auto-expire after 2 hours so people don’t stay “on” forever.
function isAvailabilityActive(v) {
  const ts = Number(v?.ts || 0);
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  return !!v?.on && ts > 0 && Date.now() - ts < TWO_HOURS;
}

function setUserAvailability(userId, on, note) {
  const m = getAvailabilityMap();
  m[userId] = { on: !!on, note: String(note || ''), ts: Date.now() };
  setAvailabilityMap(m);
}

  function HomeHero() {
    const ci = getCheckInFor(me?.id || 'me');
    const checkedInToday = ci.lastDate === todayKey();
    // --- Onboarding (for the mobile Start Something card nudge) ---
const uid2 = me?.id || 'me';
const ci2 = getCheckInFor(uid2);
const checkedInToday2 = ci2.lastDate === todayKey();

const hasPosted2 = (Array.isArray(posts) ? posts : []).some(
  (p) => p && p.ownerId === uid2
);

const hasFollowed2 =
  followingSet && typeof followingSet.size === 'number'
    ? followingSet.size > 0
    : false;

const onboardingDoneCount2 = [checkedInToday2, hasPosted2, hasFollowed2].filter(Boolean).length;
const onboardingClaimed2 = hasOnboardingClaimed(uid2);
const onboardingAllDone2 = checkedInToday2 && hasPosted2 && hasFollowed2;

const showMobileOnboardingNudge = !onboardingClaimed2 && !onboardingAllDone2;
    return (
      <div className="nb-hero">
        {(typeof BUSINESS_MODE !== 'undefined' && BUSINESS_MODE) ? (
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
            {showMobileOnboardingNudge ? (
  <button
    type="button"
    className="nb-onbNudge"
    onClick={() => setModal({ type: 'onboarding' })}
    title="Complete 3 quick steps to earn +25 NP"
  >
    <span className="nb-onbNudge-left">
      <span className="nb-onbNudge-emoji" aria-hidden="true">✨</span>
      <span className="nb-onbNudge-text">Quick start</span>
    </span>
    <span className="nb-onbNudge-right">
      <span className="nb-onbNudge-steps">Steps {onboardingDoneCount2}/3</span>
      <span className="nb-onbNudge-reward">+25</span>
    </span>
  </button>
) : null}
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
                // ensure we're showing requests (not just following)
                setHomeFollowOnly(false);
                // clear any existing search so all help posts are visible
                setHomeQuery('');
                // give immediate visual feedback by scrolling the feed into view
                setTimeout(() => {
                  const feed = document.querySelector('.nb-feed');
                  if (feed) feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 50);
              }}
            >
              Prefer to help?{' '}
              <span className="nb-herolink-accent">Browse requests →</span>
            </button>
            <button
              type="button"
              className="nb-herolink"
              onClick={() => shareInviteLink(meId)}
            >
              Invite a neighbor{' '}
              <span className="nb-herolink-accent">(+20 NP)</span>
            </button>
            <button
              type="button"
              className="nb-quickbtn nb-quickbtn-ghost"
              onClick={() => dailyCheckIn()}
              disabled={checkedInToday}
              title={checkedInToday ? 'Come back tomorrow' : 'Claim your daily NP'}
            >
              {checkedInToday
                ? `Checked in ✅ (${Math.max(1, ci.streak)}-day streak)`
                : 'Daily check-in (+5 NP)'}
            </button>
          </div>
          <LiveBoard
            me={me}
            users={USERS_SEED}
            onOpenAvailable={() => {
              // simplest possible behavior for now
              setModal({ type: 'available_now' });
            }}
          />
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

  function PostFormV2({ kind, onBack }) {
  const isHelp = kind === 'help';
  const isRec = kind === 'rec';

  const [what, setWhat] = useState('');
  const [area, setArea] = useState(me?.location || '');
  const [whenRange, setWhenRange] = useState('');
  const DRAFT_KEY = `nb_draft_post_v1:${kind}`;
  const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const [draftAvailable, setDraftAvailable] = useState(false);
  const autosaveRef = useRef(null);
  const suppressAutosaveRef = useRef(false);
  const [whenIsCustom, setWhenIsCustom] = useState(false);
  const [helpersNeeded, setHelpersNeeded] = useState(1);
  const [details, setDetails] = useState('');
  const [message, setMessage] = useState('');
  const [prefTags, setPrefTags] = useState([]);
  const [photo, setPhoto] = useState('');
  const [photoBytes, setPhotoBytes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showInferConfirm, setShowInferConfirm] = useState(false);

  useEffect(() => {
    // Reset when switching kinds
    setWhat('');
    setArea(me?.location || '');
    setWhenRange('');
    setHelpersNeeded(1);
    setDetails('');
    setMessage('');
    setPrefTags([]);
    setPhoto('');
    setPhotoBytes(0);
    setErr('');
  }, [kind, me?.location]);

  // Load draft if present for this kind
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return setDraftAvailable(false);
      const obj = JSON.parse(raw);
      if (!obj) return setDraftAvailable(false);
      // TTL: ignore drafts older than 7 days
      if (obj.savedAt && typeof obj.savedAt === 'number') {
        if (Date.now() - obj.savedAt > DRAFT_TTL_MS) {
          try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
          return setDraftAvailable(false);
        }
      }
      // Only consider drafts that have meaningful content (not just default area)
      const hasContent = (obj.what && String(obj.what).trim()) || (obj.details && String(obj.details).trim());
      if (hasContent) setDraftAvailable(true);
      else {
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
        setDraftAvailable(false);
      }
    } catch (e) {
      setDraftAvailable(false);
    }
  }, [DRAFT_KEY]);

  function saveDraft() {
    try {
      const hasContent = (what && String(what).trim()) || (details && String(details).trim());
      if (!hasContent) {
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
        setDraftAvailable(false);
        return;
      }
      const payload = { what: what || '', area: area || '', details: details || '', savedAt: Date.now() };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      setDraftAvailable(true);
    } catch (e) {}
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); setDraftAvailable(false); } catch (e) {}
  }

  // Autosave on changes (debounced)
  useEffect(() => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      if (suppressAutosaveRef.current) { suppressAutosaveRef.current = false; return; }
      const hasContent = (what && String(what).trim()) || (details && String(details).trim());
      if (hasContent) saveDraft();
    }, 800);
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [what, details, area]);

  const helpExamples = [
    'shovel my driveway',
    'move a couch to the curb',
    'bring trash bins to/from curb',
    'rake & bag leaves',
  ];

  const recExamples = [
    'mechanic',
    'plumber',
    'barber',
    'daycare',
    'dentist',
  ];

  function togglePref(tag) {
    setPrefTags((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.includes(tag) ? arr.filter((x) => x !== tag) : [...arr, tag];
    });
  }

  function fillHelpTemplate(t) {
    setErr('');
    const raw = String(t?.label || t?.title || '').trim();
    const n = normalizeText(raw || '');
    let friendly = n;
    const low = n.toLowerCase();
    // remove restrictive phrases
    friendly = friendly.replace(/curb[- ]to[- ]curb/gi, '').replace(/one item\.?/gi, '').trim();
    if (/driveway/i.test(low)) {
      friendly = 'Need help shoveling my driveway (snow).';
    } else if (/rake|leaf|leaves/i.test(low)) {
      friendly = 'Need help raking and bagging leaves.';
    } else if (/couch|sofa|move/i.test(low)) {
      friendly = 'Need help moving a couch.';
    } else if (/\bbin\b|bins|trash/i.test(low)) {
      friendly = 'Need help bringing trash bins to the curb.';
    } else if (/pickup|drop|pickup\/drop|pick up|drop off/i.test(low)) {
      friendly = 'Need help picking up or dropping off an item.';
    } else if (!/[a-z]/i.test(friendly)) {
      friendly = 'Need help with a task.';
    } else {
      if (!/need|help|looking/i.test(friendly)) friendly = 'Need help with ' + friendly.replace(/^:/, '').trim();
      friendly = friendly.charAt(0).toUpperCase() + friendly.slice(1);
      if (!/[.!?]$/.test(friendly)) friendly = friendly + '.';
    }
    // Replace the message to avoid accumulation
    setMessage(friendly);
    const first = String(friendly).split(/\.|\n/)[0].trim();
    setWhat(first.replace(/^need help (with )?/i, '').trim());
    try { if (t?.details && String(t.details).trim() && String(t.details).length < 120) setDetails(t.details); } catch (e) {}
    try { if (t?.whenRange && String(t.whenRange).trim() && String(t.whenRange).length < 80) setWhenRange(t.whenRange); } catch (e) {}
  }

  function fillRecQuick(cat) {
    setErr('');
    setWhat(cat);
    const friendly = (typeof cat === 'string' && cat.trim()) ? `Looking for ${cat}.` : 'Looking for a recommendation.';
    setMessage(friendly);
  }

  // UI submit wrapper: show inline hint and expand details if needed
  const [autoOpenDetails, setAutoOpenDetails] = useState(false);
  function uiSubmit() {
    const msg = validate();
    if (msg) {
      setErr(msg);
      setAutoOpenDetails(true);
      return;
    }
    submit();
  }

  // When message changes, derive `what` (first line/sentence) and `details`
  function handleMessageChange(v) {
    setMessage(v);
    setErr('');
    const lines = v.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0) {
      setWhat('');
      setDetails('');
      return;
    }
    // first line as short phrase
    const first = lines[0];
    // rest joined as details
    const rest = lines.slice(1).join('\n');
    setWhat(first);
    if (rest) setDetails(rest);
  }

  function getMessagePlaceholder() {
    // Only show structured placeholder when message is empty; placeholder only appears when textarea has no value.
    if (message && String(message).trim()) return '';
    if (isHelp) return 'Need help with [what] — [where/how], [when].';
    return 'Looking for [what] in [area] — include timing if relevant.';
  }

  function validate() {
  const w = normalizeText(what);
  // allow falling back to the user's profile location to reduce friction
  const a = normalizeText(area) || normalizeText(me?.location || '');
  // Details are optional now to reduce friction; encourage but don't block posting
  const d = normalizeText(details);

  if (!w) return 'Start with what you need (one short phrase).';
  if (!a) return 'Add an area (town / neighborhood).';

  // No content blocking. Guidance lives in placeholders + hint text.
  return '';
}

  function buildHelpPost() {
    const w = normalizeText(what);
    const a = normalizeText(area) || normalizeText(me?.location || '');
    const d = normalizeText(details);
    const when = normalizeText(whenRange);

    const title =
      /^need/i.test(w) || /^help/i.test(w) ? w : `Need a hand: ${w}`;

    return {
      id: uid('p_help'),
      kind: 'help',
      helpType: 'need',
      category: w || 'Help request', // kept for your meta chips (but no UI “category” section)
      title,
      details: d,
      area: a,
      whenRange: when,
      helpersNeeded: Math.max(1, Math.min(6, Math.floor(Number(helpersNeeded) || 1))),
      selectedUserIds: [],
      status: 'open',
      stage: 'open',
      ownerId: me.id,
      createdAt: NOW(),
      replies: [],
      selectedUserId: null,
      ...(photo ? { photo } : {}),
    };
  }

  function buildRecPost() {
    const w = normalizeText(what);
    const a = normalizeText(area) || normalizeText(me?.location || '');
    const d = normalizeText(details);

    const prefs = Array.isArray(prefTags) && prefTags.length ? prefTags : [];
    const preferences =
      prefs.length > 0 ? prefs.join(' • ') : '';

    return {
      id: uid('p_rec'),
      kind: 'rec',
      recCategory: w || 'Recommendation',
      area: a,
      prefTags: prefs,
      preferences,
      allowChatAfterTopPick: false,
      title: buildRecTitle(w, a),
      details: d,
      status: 'open',
      ownerId: me.id,
      createdAt: NOW(),
      replies: [],
      topPickReplyId: null,
    };
  }

  async function onPickPhoto(file) {
    setErr('');
    if (!file) return;

    setBusy(true);
    try {
      const out = await compressImageFileToDataUrl(file, {
        maxDim: 1600,
        quality: 0.82,
        mime: 'image/jpeg',
      });
      setPhoto(out.dataUrl || '');
      setPhotoBytes(out.bytes || 0);
    } catch (e) {
      setErr(e?.message || 'Could not attach that photo.');
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    const msg = validate();
    if (msg) {
      setErr(msg);
      return;
    }

    const post = isHelp ? buildHelpPost() : buildRecPost();

    setPosts((prev) => [post, ...(Array.isArray(prev) ? prev : [])]);

    // Make it feel instant: go home and focus the relevant chip. Do not auto-expand threads.
    setHomeChip(isHelp ? 'help' : 'rec');
    setHomeShowAll(false);
    setHomeQuery('');
    setActiveSavedSearchId(null);

    notify('Post created.', { type: 'post_create', postId: post.id });

    setActiveTab('home');
    setPostFlow({ step: 'chooser', kind: null });
    // Clear any saved draft for this kind on successful post
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }

  const headerTitle = isHelp ? 'Need a hand' : 'Recommendations';
  const sub =
    isHelp
      ? 'Write it like a text to a neighbor. Be clear about where/how (porch, curb, driveway, indoors, etc.). One solid detail beats a paragraph.'
      : 'Ask for exactly what you want. One detail about price/timing helps a lot.';

  const quickRow = isHelp ? (
    <div className="nb-suggest-row" style={{ marginTop: 10 }}>
      <label style={{ display: 'none' }} htmlFor="nb_quick_select">Quick templates</label>
      <select id="nb_quick_select" className="nb-quick-select" onChange={(e) => {
        const idx = Number(e.target.value);
        const arr = (typeof HELP_TEMPLATES !== 'undefined' && Array.isArray(HELP_TEMPLATES) ? HELP_TEMPLATES : []);
        const item = arr[idx];
        if (item) fillHelpTemplate(item);
        e.target.selectedIndex = 0;
      }}>
        <option value="">Choose a quick template…</option>
        {(typeof HELP_TEMPLATES !== 'undefined' && Array.isArray(HELP_TEMPLATES) ? HELP_TEMPLATES : []).map((t, i) => (
          <option key={t.label || i} value={i}>{t.label || (`Template ${i+1}`)}</option>
        ))}
      </select>
    </div>
  ) : (
    <div className="nb-suggest-row" style={{ marginTop: 10 }}>
      <label style={{ display: 'none' }} htmlFor="nb_rec_select">Common requests</label>
      <select id="nb_rec_select" className="nb-quick-select" onChange={(e) => {
        const v = e.target.value;
        if (v) fillRecQuick(v);
        e.target.selectedIndex = 0;
      }}>
        <option value="">Choose a common request…</option>
        {(typeof REC_CATEGORIES !== 'undefined' && Array.isArray(REC_CATEGORIES) ? REC_CATEGORIES : [])
          .filter((x) => x && x !== '__custom__')
          .slice(0, 8)
          .map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
      </select>
    </div>
  );

  return (
    <div className="nb-page">
      <div className="nb-section">
        <div className="nb-form-card">
          <div className="nb-form-head">
            <div>
              <div className="nb-form-title">{headerTitle}</div>
              <div className="nb-form-sub">{sub}</div>
            </div>

            <button
              type="button"
              className="nb-btn nb-btn-ghost nb-btn-sm"
              onClick={onBack}
              title="Back"
            >
              ← Back
            </button>
          </div>

          {quickRow}

          {(() => {
            const isPristine = !String(what || '').trim() && !String(details || '').trim() && !String(area || '').trim();
            const showBanner = draftAvailable && isPristine;
            return showBanner ? (
              <div style={{ marginTop: 10 }}>
                <div className="nb-draft-banner">
                  <div>
                    <strong>Saved draft found</strong>
                    <div className="nb-muted small">We saved your draft locally. Restore or discard.</div>
                  </div>
                  <div className="nb-draft-actions">
                    <button className="nb-draft-cta restore" onClick={() => {
                      try {
                        const raw = localStorage.getItem(DRAFT_KEY);
                        if (!raw) return clearDraft();
                        const obj = JSON.parse(raw || '{}');
                        setWhat(obj.what || '');
                        setDetails(obj.details || '');
                        setArea(obj.area || me?.location || '');
                        setDraftAvailable(false);
                      } catch (e) { clearDraft(); }
                    }}>Restore</button>
                    <button className="nb-draft-cta discard" onClick={() => {
                      if (!confirm('Discard saved draft?')) return;
                      try { clearDraft(); } catch (e) {}
                      try { if (autosaveRef.current) clearTimeout(autosaveRef.current); } catch (e) {}
                      suppressAutosaveRef.current = true;
                      try { setWhat(''); setDetails(''); setArea(''); } catch (e) {}
                    }}>Discard</button>
                  </div>
                </div>
              </div>
            ) : null;
          })()}

          {/* inline top error/hint */}
          {err ? (
            <div className="nb-error" style={{ marginTop: 10 }}>{err}</div>
          ) : null}

          {/* Primary composer: single message first */}
          <div className="nb-card" style={{ marginTop: 12 }}>
            <label className="nb-label">Message</label>
            <textarea
              className="nb-input nb-textarea nb-message"
              value={message}
              onChange={(e) => handleMessageChange(e.target.value)}
              placeholder={getMessagePlaceholder()}
              rows={4}
            />
            {/* Suggested location micro-confirmation (tappable, non-destructive) */}
            {(() => {
              const inferredTown = (() => {
                try { return inferTownKeyFromText(message || '') || null; } catch (e) { return null; }
              })();
              if (!inferredTown || (String(normalizeText(area) || '').toLowerCase() === String(inferredTown || '').toLowerCase())) return null;
              return (
                <div style={{ marginTop: 8 }}>
                  {!showInferConfirm ? (
                    <button
                      type="button"
                      className="nb-meta-chip nb-infer-chip"
                      onClick={() => setShowInferConfirm(true)}
                    >
                      Suggested location: {inferredTown}
                    </button>
                  ) : (
                    <div className="nb-infer-confirm-row">
                      <span>Set location to {inferredTown}?</span>
                      <div style={{ display: 'inline-flex', gap: 8, marginLeft: 8 }}>
                        <button
                          type="button"
                          className="nb-btn nb-btn-primary nb-infer-action"
                          onClick={() => { setArea(inferredTown); setShowInferConfirm(false); }}
                        >
                          Set Location
                        </button>
                        <button
                          type="button"
                          className="nb-btn nb-infer-action"
                          onClick={() => setShowInferConfirm(false)}
                        >
                          Keep mine
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="nb-muted" style={{ marginTop: 8 }}>Include: what + where/how + when.</div>

            

          {/* spacer so sticky CTA doesn't cover content on mobile */}
          {/* Sticky CTA removed — use single action row */}
          </div>

          {/* (composer above replaces the older segmented inputs to keep UI simple) */}

          {/* Section C: Details */}
          <div className="nb-card" style={{ marginTop: 12 }}>
            <label className="nb-label">Details <span className="nb-muted small">(optional)</span></label>
            <div className="nb-muted" style={{ marginTop: 6 }}>Where exactly + timing + anything heavy/tools (optional but helpful)</div>
            <textarea
              className={`nb-input nb-textarea ${err ? 'has-error' : ''}`}
              value={details}
              onChange={(e) => {
                setDetails(e.target.value);
                setErr('');
              }}
              placeholder={isHelp ? 'Add 1–2 specifics: porch/curb, timing, heavy items, tools' : 'Add a short reason or detail'}
            />

            {!details.trim() ? (
              <div className="nb-inline-hint">Add a short detail so helpers know what to expect.</div>
            ) : null}

            <details className="nb-more-options" style={{ marginTop: 10 }}>
              <summary>More options</summary>

              {isHelp ? (
                <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                  <div>
                    <label className="nb-label">How many helpers?</label>
                    <div className="nb-stepper" style={{ marginTop: 8 }}>
                      <button type="button" onClick={() => setHelpersNeeded((n) => Math.max(1, (Number(n) || 1) - 1))}>−</button>
                      <div className="nb-stepper-num">{helpersNeeded}</div>
                      <button type="button" onClick={() => setHelpersNeeded((n) => Math.min(6, (Number(n) || 1) + 1))}>+</button>
                    </div>
                  </div>

                  <div>
                    <label className="nb-label">Attach photo (optional)</label>
                    <div className="nb-photorow" style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
                      {photo ? <img className="nb-photo-thumb" src={photo} alt="" /> : <div className="nb-muted">Photo helps with clarity</div>}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input id="nb_post_photo" type="file" accept="image/*" onChange={(e) => onPickPhoto(e.target.files?.[0])} style={{ display: 'none' }} />
                        <label htmlFor="nb_post_photo" className="nb-btn nb-btn-ghost nb-filebtn">{photo ? 'Change photo' : 'Add photo'}</label>
                        {photo ? <span className="nb-muted" style={{ fontSize: 12 }}>{photoBytes ? prettyBytes(photoBytes) : 'Attached'}</span> : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <label className="nb-label">Preference chips (optional)</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {(typeof REC_PREF_TAGS !== 'undefined' && Array.isArray(REC_PREF_TAGS) ? REC_PREF_TAGS : []).map((t) => {
                      const on = prefTags.includes(t);
                      return (
                        <button key={t} type="button" className={`nb-suggest ${on ? 'is-on' : ''}`} onClick={() => togglePref(t)}>{t}</button>
                      );
                    })}
                  </div>
                </div>
              )}
            </details>
          </div>

          {err ? <div className="nb-error" style={{ marginTop: 10 }}>{err}</div> : null}

          <div className="nb-formactions" style={{ marginTop: 12 }}>
            <button className="nb-btn nb-btn-ghost" onClick={onBack}>Cancel</button>
            <button className="nb-btn nb-btn-primary" onClick={uiSubmit} disabled={busy || !what.trim() || !area.trim()}>{busy ? 'Working…' : 'Post'}</button>
          </div>

          
        </div>
      </div>
    </div>
  );
}

  function ProfileScreen() {
  const followers = (followersByUser?.[me.id] || []).length;
  const following = Array.isArray(followsByUser?.[me.id])
    ? followsByUser[me.id].filter(Boolean).length
    : 0;

  return (
    <div className="nb-page">
      <div className="nb-section">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <img className="nb-avatar" src={me.avatar} alt={me.name} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 980, fontSize: 18 }}>
              {me.name} <UserBadge userId={me.id} showText />
            </div>
            <div className="nb-muted" style={{ fontWeight: 850 }}>
              {me.handle} · {me.location}
            </div>
          </div>
        </div>

        {me.tagline ? (
          <div style={{ marginTop: 10, fontWeight: 850 }}>{me.tagline}</div>
        ) : null}

        <div
          style={{
            marginTop: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
          }}
        >
          <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}>
            <div style={{ fontWeight: 980, fontSize: 18 }}>{npPoints}</div>
            <div className="nb-muted" style={{ fontWeight: 850, fontSize: 12 }}>NP</div>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}>
            <div style={{ fontWeight: 980, fontSize: 18 }}>{myPostCount}</div>
            <div className="nb-muted" style={{ fontWeight: 850, fontSize: 12 }}>Posts</div>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}>
            <div style={{ fontWeight: 980, fontSize: 18 }}>{helpfulRepliesCount}</div>
            <div className="nb-muted" style={{ fontWeight: 850, fontSize: 12 }}>Helpful</div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="nb-pill">
            <span className="nb-pill-text">Following</span>
            <span className="nb-pill-strong">{following}</span>
          </div>
          <div className="nb-pill">
            <span className="nb-pill-text">Followers</span>
            <span className="nb-pill-strong">{followers}</span>
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          <button className="nb-btn nb-btn-ghost" onClick={() => setModal({ type: 'points' })}>
            View badges & points
          </button>

          <button
            className="nb-btn nb-btn-ghost"
            onClick={() => {
              const ok = window.confirm(
                'Reset all local demo data? This clears posts, chats, saved searches, and points.'
              );
              if (!ok) return;
              localStorage.removeItem(LS_CHECKINS);
              localStorage.removeItem(LS_AVAIL);
              resetAppState();
              window.location.reload();
            }}
            title="Clears localStorage demo data"
          >
            Reset demo data
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="nb-muted small" style={{ fontWeight: 850, marginBottom: 8 }}>
            Demo user
          </div>
          <select
            className="nb-input"
            value={meId}
            onChange={(e) => setMeId(e.target.value)}
          >
            {USERS_SEED.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.location})
              </option>
            ))}
          </select>
        </div>

        <div className="nb-section">
          <div className="nb-section-title">App Health</div>
          <div className="nb-section-sub">Version and debug info for troubleshooting.</div>

          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: 'var(--muted)' }}>Version</div>
              <div style={{ fontWeight: 950 }}>{pkg?.version || 'unknown'}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: 'var(--muted)' }}>Mode</div>
              <div style={{ fontWeight: 950 }}>{import.meta.env.DEV ? 'dev' : 'prod'}</div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="nb-btn nb-btn-ghost"
                onClick={async () => {
                  try {
                    const info = {
                      version: pkg?.version || 'unknown',
                      mode: import.meta.env.DEV ? 'dev' : 'prod',
                      time: new Date().toISOString(),
                      user: me ? { id: me.id, name: me.name } : null,
                    };
                    const txt = JSON.stringify(info, null, 2);
                    await navigator.clipboard.writeText(txt);
                    setToastMsg('Copied debug info');
                  } catch (e) {
                    setToastMsg('Could not copy debug info');
                  }
                }}
              >
                Copy debug info
              </button>
            </div>
          </div>
        </div>
      </div>

      {myPosts.length ? (
        <div className="nb-section">
          <div className="nb-section-title">Your posts</div>
          <div className="nb-feed">
            {myPosts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </div>
      ) : null}
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
    const [townKey, setTownKey] = useState(() => inferTownKeyFromText(me?.location) || '');
    // Ensure townKey gets a default AFTER TOWN_KEYS exists (prevents TDZ crash)
useEffect(() => {
  setTownKey((prev) => {
    if (prev) return prev;
    const first =
      typeof TOWN_KEYS !== 'undefined' && Array.isArray(TOWN_KEYS) && TOWN_KEYS[0]
        ? TOWN_KEYS[0]
        : '';
    return first;
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
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

      // Guidance only (no blocking)
if (mentionsReward(combined)) {
  // You can keep this as a soft warning if you want:
  // setErr('Tip: Avoid mentioning payment; keep it neighbor-to-neighbor.');
}

if (mentionsIndoor(combined)) {
  // Soft suggestion only:
  // setErr('Tip: For indoor tasks, consider a Recommendation post instead.');
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
        lifecycle: 'open',
        stage: 'open',
        ownerId: me.id,
        createdAt: NOW(),
        replies: [],
        selectedUserId: null,
        // completion photo proof metadata (optional)
        completionPhoto: null,
        completionPhotoMeta: null,
        completionPhotoApproved: false,
        awardQueuedUntil: null,
      };

      setPosts((prev) => [p, ...(Array.isArray(prev) ? prev : [])]);
      pushActivity({ type: 'post_created', text: 'Created a help request.', actorId: me.id, postId: p.id, postOwnerId: me.id, audienceIds: [me.id] });
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
    {(typeof TOWN_KEYS !== 'undefined' && Array.isArray(TOWN_KEYS) ? TOWN_KEYS : []).map((k) => (
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
              placeholder="Add specifics: what you need, where (porch/curb/outdoor), timing, tools you have, and anything tricky (stairs, ice, parking)."
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
    const [townKey, setTownKey] = useState(() => inferTownKeyFromText(me?.location) || '');
    useEffect(() => {
  setTownKey((prev) => {
    if (prev) return prev;
    const first =
      typeof TOWN_KEYS !== 'undefined' && Array.isArray(TOWN_KEYS) && TOWN_KEYS[0]
        ? TOWN_KEYS[0]
        : '';
    return first;
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
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

      setPosts((prev) => [p, ...(Array.isArray(prev) ? prev : [])]);
      pushActivity({ type: 'post_created', text: 'Created a recommendation request.', actorId: me.id, postId: p.id, postOwnerId: me.id, audienceIds: [me.id] });
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
              placeholder="Example: Need brakes + general maintenance. Looking for fair pricing + no upsell. Share who you trust and why (no need for links)."
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
  // Source of truth: step decides whether we're choosing or filling
  if (postFlow.step === 'chooser') return <PostChooser />;

  // Safety net: if kind isn't set, go back to chooser
  if (postFlow.kind !== 'help' && postFlow.kind !== 'rec') return <PostChooser />;

  // Render the new unified form
  return (
    <PostFormV2
      kind={postFlow.kind}
      onBack={() => setPostFlow({ step: 'chooser', kind: null })}
    />
  );
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

    // Group activity by postId (fallback to actor/type key)
    const groups = useMemo(() => {
      const map = new Map();
      for (const a of visibleActivity) {
        const key = a?.postId ? String(a.postId) : `x_${a?.actorId}_${a?.type}`;
        const arr = map.get(key) || [];
        arr.push(a);
        map.set(key, arr);
      }

      const out = Array.from(map.entries()).map(([key, events]) => {
        const last = events.reduce((m, e) => (e && e.ts > (m?.ts || 0) ? e : m), events[0]);
        const preview = activityText(last, me.id);

        // Try to find a postId anywhere in the group's events (some events may omit postId)
        const foundPost = events.find((ev) => ev && ev.postId);
        const groupPostId = foundPost ? foundPost.postId : last?.postId || null;

        // aggregate unread for chat threads inside this group
        let unread = 0;
        let primary = { type: 'view', postId: groupPostId };

        for (const ev of events) {
          const isChatEvent = ev?.type === 'chat_unlocked' || ev?.type === 'chat_message';
          const post = ev?.postId ? posts.find((p) => p.id === ev.postId) : null;
          const otherId = otherIdFromActivity(ev, me.id);
          if (isChatEvent && post && otherId && canOpenChatForPost(post, otherId)) {
            const viewerChatId = getChatId(post.id, me.id, otherId);
            unread += unreadCount(viewerChatId, me.id);
            // prefer chat as primary action
            primary = { type: 'chat', postId: post.id, otherId };
          }
        }

        return {
          id: key,
          postId: groupPostId,
          events,
          last,
          preview,
          unread,
          primary,
          count: events.length,
        };
      });

      return out.sort((a, b) => (b.last?.ts || 0) - (a.last?.ts || 0));
    }, [visibleActivity, posts, chats, lastRead, me.id]);

    function openGroupPrimary(g, e) {
      if (e && e.stopPropagation) e.stopPropagation();
      trackEvent('activity_primary_cta', { type: g.primary?.type, postId: g.postId });
      if (g.primary?.type === 'chat' && g.primary.otherId) {
        console.debug('Activity: open chat', g.primary);
        openChat(g.primary.postId, g.primary.otherId);
        return;
      }

      if (g.postId) {
        console.debug('Activity: jump to post', g.postId);
        // use existing helper to ensure consistent behavior
        jumpToPostFromActivity(g.postId);
      }
    }

    function quickReply(g, text, e) {
      if (e && e.stopPropagation) e.stopPropagation();
      if (g.primary?.type !== 'chat' || !g.primary.otherId || !g.primary.postId) return;
      trackEvent('activity_quick_reply', { postId: g.primary.postId, otherId: g.primary.otherId, text });
      sendChatMessage(g.primary.postId, g.primary.otherId, text);
    }

    return (
      <div className="nb-page">
        <div className="nb-section">
          <div className="nb-section-title">Activity</div>
          <div className="nb-section-sub">Replies, chat unlocks, and resolution updates show up here.</div>
        </div>

        {groups.length === 0 ? (
          <EmptyState
            title="Your activity starts here"
            body="Create a post to see replies and updates."
            ctaLabel="Create a post"
            onCta={() => {
              setActiveTab('post');
              setPostFlow({ step: 'form', kind: null });
            }}
          />
        ) : (
          <div className="nb-list">
            {groups.map((g) => {
              const actor = usersById[g.last?.actorId];
              const actorPoints = (typeof npPointsByUser === 'object' && actor && actor.id) ? (npPointsByUser?.[actor.id] || 0) : 0;
              const avatar = actor?.avatar || AVATAR;
              const title = activityText(g.last, me.id);
              const time = timeAgo(g.last?.ts || Date.now());
              const unreadLabel = g.unread > 9 ? '9+' : String(g.unread || '');

              return (
                <div
                  key={g.id}
                  className="nb-activity-group"
                  role="group"
                  tabIndex={0}
                  onClick={() => openGroupPrimary(g)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') openGroupPrimary(g, e);
                  }}
                >
                  <div className="nb-activity-left">
                    <img
                      src={avatar}
                      alt={actor?.name || ''}
                      className="nb-avatar sm is-loading"
                      loading="lazy"
                      onLoad={(ev) => ev.currentTarget.classList.remove('is-loading')}
                    />
                  </div>

                  <div className="nb-activity-main">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="nb-activity-title" style={{ flex: 1 }}>{title}</div>
                      <div className="nb-activity-token" title={badgeParts(badgeFor(actorPoints)).name}>
                        {badgeParts(badgeFor(actorPoints)).emoji}
                      </div>
                    </div>
                    <div className="nb-activity-sub">{g.preview}</div>
                    <div className="nb-activity-meta">{time} · {g.count} event{g.count>1?'s':''}</div>

                    <div className="nb-activity-footer">
                      <div className="nb-activity-ctas">
                        {g.primary?.type !== 'none' && g.primary ? (
                          <button
                            type="button"
                            className={`nb-btn nb-btn-primary nb-btn-sm ${!g.postId && g.primary?.type === 'view' ? 'disabled' : ''}`}
                            onClick={(e) => {
                              // prevent no-op if there's no postId
                              if (g.primary?.type === 'view' && !g.postId) return;
                              openGroupPrimary(g, e);
                            }}
                          >
                            {g.primary?.type === 'chat' ? 'Open chat' : 'View post'}
                          </button>
                        ) : null}

                        {g.unread > 0 ? (
                          <div className="nb-unread-pill" aria-label={`${g.unread} unread`}>
                            {unreadLabel}
                          </div>
                        ) : null}
                      </div>

                      {/* Quick replies removed from activity list - kept inside chat view instead */}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  

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

    // Highlights info (opt-in + current boost)
    const highlightInfo = highlightsByUser?.[userId] || {};
    const isHighlighted = highlightInfo.tempBoostUntil && Date.now() < highlightInfo.tempBoostUntil;
    const allowHighlights = !!highlightInfo.allowHighlights;

    // compute helps count from activity events (approx)
    const helpsCount = Array.isArray(activity)
      ? activity.filter((a) => a && a.type === 'help_confirmed' && a.actorId === userId).length
      : 0;
    const npBalance = npPointsByUser?.[userId] || 0;

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
                  <button
                    type="button"
                    className="nb-btn nb-btn-ghost"
                    onClick={() => reportUser(u.id)}
                    style={{ marginLeft: 10 }}
                    title="Report this user (local demo)"
                  >
                    Report
                  </button>

                  <button
                    type="button"
                    className="nb-btn nb-btn-ghost"
                    onClick={() => toggleBlockUser(u.id)}
                    style={{ marginLeft: 10 }}
                    title="Block hides their posts/replies"
                  >
                    {isBlockedUser(u.id) ? 'Unblock' : 'Block'}
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
              {/* Profile ledger + highlights */}
              <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ fontWeight: 900 }}>{u.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>Helps: {helpsCount}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>NP: {npBalance}</div>
                  {isHighlighted ? <div className="nb-badge">Highlighted</div> : null}
                </div>

                {isMe ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>Allow public highlights</div>
                    <button
                      className={`nb-btn ${allowHighlights ? 'nb-btn-primary' : 'nb-btn-ghost'}`}
                      onClick={() => setUserHighlightOptIn(userId, !allowHighlights)}
                    >
                      {allowHighlights ? 'Enabled' : 'Enable'}
                    </button>
                  </div>
                ) : null}

                {me.id === 'me' && !isMe ? (
                  <div>
                    {isHighlighted ? (
                      <button className="nb-btn nb-btn-ghost" onClick={() => setUserTempBoost(userId, null)}>Remove highlight</button>
                    ) : (
                      <button className="nb-btn nb-btn-primary" onClick={() => setUserTempBoost(userId, Date.now() + 1000 * 60 * 60 * 24 * 7)}>Highlight for 7 days (dev)</button>
                    )}
                  </div>
                ) : null}
              </div>
              <div style={{ fontWeight: 980 }}>Posts</div>

              {theirPosts.length === 0 ? (
                <EmptyState
                  title="No posts here"
                  body="Be the first to start a thread for this neighbor."
                  ctaLabel="Create a post"
                  onCta={() => {
                    setActiveTab('post');
                    setPostFlow({ step: 'chooser', kind: null });
                  }}
                />
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

  function AvailableNowModal({ me, users, onClose, onOpenProfile }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const meId = me?.id || 'me';
  const loc = String(me?.location || '').trim();

  const list = useMemo(() => {
    const roster = Array.isArray(users) ? users : [];
    return roster
      .map((u) => {
        const v = getUserAvailability(u?.id);
        return { u, v, on: isAvailabilityActive(v) };
      })
      .filter((x) => x?.u?.id && x.on && x.u.id !== meId)
      .sort((a, b) => {
        // prefer highlighted users (temporary boost)
        const ah = highlightsByUser?.[a.u?.id]?.tempBoostUntil && Date.now() < highlightsByUser[a.u.id].tempBoostUntil ? 1 : 0;
        const bh = highlightsByUser?.[b.u?.id]?.tempBoostUntil && Date.now() < highlightsByUser[b.u.id].tempBoostUntil ? 1 : 0;
        if (ah !== bh) return bh - ah; // highlighted first
        return Number(b?.v?.ts || 0) - Number(a?.v?.ts || 0);
      });
  }, [users, meId, tick]);

  return (
    <div className="nb-modal-backdrop" onClick={onClose}>
      <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nb-modal-head">
          <div className="nb-modal-title">
            Available now{loc ? ` near ${loc}` : ''}
          </div>
          <button className="nb-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div style={{ padding: 14 }}>
          <div className="nb-muted" style={{ fontWeight: 850, marginBottom: 10 }}>
            Demo only: this reflects local availability toggles in your browser.
          </div>

          {list.length === 0 ? (
            <div className="nb-muted" style={{ fontWeight: 850 }}>
              No one else is available right now.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {list.map(({ u, v }) => (
                <button
                  key={u.id}
                  type="button"
                  className="nb-listitem"
                  onClick={() => onOpenProfile && onOpenProfile(u.id)}
                  style={{ cursor: 'pointer', alignItems: 'center' }}
                  title="View profile"
                >
                  <img className="nb-avatar sm" src={u.avatar} alt={u.name} />
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={{ fontWeight: 980 }}>
                      {u.name} <span className="nb-handle">{u.handle}</span>
                    </div>
                    <div className="nb-muted" style={{ fontWeight: 850, fontSize: 12 }}>
                      {v?.note ? `“${v.note}” · ` : ''}
                      {v?.ts ? timeAgo(v.ts) : ''}
                      {u?.location ? ` · ${u.location}` : ''}
                    </div>
                  </div>
                  <span className="nb-herolink-accent" style={{ fontWeight: 950 }}>
                    View
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="nb-modal-foot">
          <div className="nb-muted">Availability auto-expires after ~2 hours.</div>
          <div className="nb-modal-actions">
            <button className="nb-btn nb-btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

  // --- Completion photo helper UI (inline modal-like small component) ---
  function CompletionPhotoForm({ postId, onSave }) {
    const post = posts.find((p) => p && p.id === postId) || {};
    const [preview, setPreview] = useState(post?.completionPhoto || '');
    const [meta, setMeta] = useState(post?.completionPhotoMeta || null);
    const [err, setErr] = useState('');

    async function handleFile(f) {
      setErr('');
      if (!f) return;
      // prefer camera capture on mobile
      try {
        // quick recency check
        const now = Date.now();
        if (f.lastModified && Math.abs(now - f.lastModified) > 1000 * 60 * 60 * 48) {
          // older than 48h
          setErr('Please take a recent photo (within 48 hours).');
        }

        const out = await compressImageFileToDataUrl(f, { maxDim: 1600, quality: 0.82 });
        // basic heuristic: resolution
        const img = new Image();
        img.src = out.dataUrl;
        await new Promise((res) => { img.onload = res; img.onerror = res; });
        if (img.width < 320 || img.height < 240) {
          setErr('Photo too small. Take a clearer picture.');
        }

        // variance check: draw small canvas to sample pixels
        try {
          const c = document.createElement('canvas');
          c.width = Math.min(64, img.width);
          c.height = Math.min(64, img.height);
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const data = ctx.getImageData(0, 0, c.width, c.height).data;
          let sum = 0, sumsq = 0, cnt = 0;
          for (let i = 0; i < data.length; i += 4) {
            const lum = 0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2];
            sum += lum; sumsq += lum*lum; cnt++;
          }
          const mean = sum / cnt; const variance = Math.max(0, sumsq / cnt - mean*mean);
          if (variance < 30) {
            setErr('Photo looks too uniform — please capture the scene (include the helper or vehicle).');
          }
        } catch (e) {}

        // accept
        setPreview(out.dataUrl || '');
        const metaObj = { name: f.name, lastModified: f.lastModified || Date.now(), size: f.size || 0 };
        setMeta(metaObj);
        // persist into posts state (helper uploaded proof; not yet owner-approved)
        setPosts((prev) => prev.map((p) => (p && p.id === postId ? { ...p, completionPhoto: out.dataUrl, completionPhotoMeta: metaObj, completionPhotoApproved: false } : p)));
        onSave && onSave(out.dataUrl, metaObj, false);
      } catch (e) {
        setErr('Could not process that photo.');
      }
    }

    return (
      <div style={{ marginTop: 8 }}>
        <div className="nb-label">Completion photo (optional but recommended)</div>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFile(e.target.files?.[0])}
          style={{ marginTop: 8 }}
        />
        {err ? <div className="nb-error" style={{ marginTop: 8 }}>{err}</div> : null}
        {preview ? (
          <div style={{ marginTop: 8 }}>
            <img src={preview} alt="preview" style={{ width: '100%', maxWidth: 320, borderRadius: 10 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="nb-btn nb-btn-ghost" onClick={() => { setPreview(''); setMeta(null); setPosts((prev) => prev.map((p) => (p && p.id === postId ? { ...p, completionPhoto: null, completionPhotoMeta: null, completionPhotoApproved: false } : p))); onSave && onSave(null, null, false); }}>Remove</button>
              <button className="nb-btn nb-btn-primary" onClick={() => { setPosts((prev) => prev.map((p) => (p && p.id === postId ? { ...p, completionPhotoApproved: true } : p))); onSave && onSave(preview, meta, true); }}>Save & mark ready</button>
            </div>
          </div>
        ) : null}
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

    const discover = USERS_SEED.filter((u) => u.id !== me.id && !isBlockedUser(u.id));

    return (
      <div className="nb-page nb-scroll" ref={scrollRef}>
        <div className="nb-ptr-slot" style={{ height: pull }}>
  <div className="nb-ptr-label">
    {refreshing ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span className="nb-spinner" aria-hidden="true" />
        Refreshing…
      </span>
    ) : pull >= threshold ? (
      'Release to refresh'
    ) : (
      'Pull to refresh'
    )}
  </div>
</div>
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
            <EmptyState
              title="You haven't posted yet"
              body="Share a local question or request to get responses."
              ctaLabel="Create a post"
              onCta={() => {
                setActiveTab('post');
                setPostFlow({ step: 'chooser', kind: null });
              }}
            />
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

  

  
const blockedSet = getBlockedSet(me.id);

  const visibleFeed = (Array.isArray(searchedFeed) ? searchedFeed : []).filter((p) => {
    if (!p) return false;
    if (blockedSet.has(p.ownerId)) return false;

    // hide archived by default (only show when "All" is toggled on)
    const lc = inferLifecycle(p);
    if (!homeShowAll && lc === 'archived') return false;

    return true;
  });
  
  function CompletionPhotoForm({ postId }) {
    const [preview, setPreview] = useState(null);
    const [loadingPhoto, setLoadingPhoto] = useState(false);

    async function onPick(file) {
      if (!file) return;
      setLoadingPhoto(true);
      try {
        const { dataUrl } = await compressImageFileToDataUrl(file);
        setPreview(dataUrl);
      } catch (e) {
        showToast('Couldn’t process that photo.');
      } finally {
        setLoadingPhoto(false);
      }
    }

    return (
      <div style={{ display: 'grid', gap: 10 }}>
        {preview ? (
          <img src={preview} alt="Preview" style={{ width: '100%', borderRadius: 12 }} />
        ) : null}

        <input
          id="nb-completion-photo"
          type="file"
          accept="image/*"
          style={{ display: 'block' }}
          onChange={(e) => onPick(e.target.files && e.target.files[0])}
        />

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="nb-btn nb-btn-primary"
            disabled={loadingPhoto || !preview}
            onClick={() => {
              if (!preview) return;
              // attach photo to post and mark done
              setPosts((prev) =>
                (prev || []).map((p) => (p && p.id === postId ? { ...p, completionPhoto: preview } : p))
              );
              advanceHelpStage(postId, 'done');
              setModal(null);
            }}
          >
            Attach & mark Done
          </button>

          <button
            className="nb-btn nb-btn-ghost"
            onClick={() => {
              // allow retry: clear preview
              setPreview(null);
            }}
          >
            Clear
          </button>
        </div>
      </div>
    );
  }
  if (publicViewPostId) {
    const p = (posts || []).find((x) => x && x.id === publicViewPostId);
    return (
      <div className="nb-app">
        <Header />
        <div className="nb-content nb-page-post">
          <div style={{ maxWidth: 840, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 980, fontSize: 18 }}>{p?.title || 'Post'}</div>
              <div>
                <button className="nb-btn nb-btn-ghost" onClick={() => { history.back(); }}>Back</button>
              </div>
            </div>
            {p ? <PostCard post={p} /> : <div className="nb-empty">Post not found</div>}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="nb-app">
      <Header />
      {toastMsg ? (
        <div className="nb-toast" role="status" aria-live="polite">
          {toastMsg}
        </div>
      ) : null}

      {activeTab === 'home' ? (
  <HomeScreen
    Hero={HomeHero}
    Chips={Chips}
    EmptyState={EmptyState}
    PostCard={PostCard}
    homeChip={homeChip}
    refreshing={homeRefreshing}
onRefresh={refreshHome}
    homeShowAll={homeShowAll}
    setHomeShowAll={setHomeShowAll}
    homeFollowOnly={homeFollowOnly}
    setHomeFollowOnly={setHomeFollowOnly}
    homeQuery={homeQuery}
    setHomeQuery={setHomeQuery}
    feed={visibleFeed}
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
) : activeTab === 'post' ? (
  <PostTab />
) : activeTab === 'activity' ? (
  <ActivityTab />
) : (
  <ProfileScreen />
)}


      <BottomTabs
        activeTab={activeTab}
        onChange={(k) => {
          setActiveTab(k);
          try {
  if (typeof markSeen === 'function') markSeen(me.id, k);
} catch (e) {
  // swallow in demo mode so tab switching never breaks
}
        }}
        badges={tabBadges}
      />

      {/* Drawers / overlays */}
      {chat ? <ChatDrawer /> : null}

      {/* Modals (modal state) */}
      {modal?.type === 'edit_post' ? (
        <EditPostModal postId={modal.postId} />
      ) : null}
      {modal?.type === 'reply' ? (
        <ReplyModal postId={modal.postId} mode={modal.mode} />
      ) : null}

      {modal?.type === 'points' ? <PointsModal /> : null}
      {modal?.type === 'onboarding' ? <OnboardingModal /> : null}

      {modal?.type === 'home_setup' ? <HomeSetupModal /> : null}

      {modal?.type === 'saved_search_manage' ? (
        <SavedSearchManageModal searchId={modal.searchId} />
      ) : null}

      {modal?.type === 'thank_you' ? (
  <ThankYouModal postId={modal.postId} helperIds={modal.helperIds} />
) : null}

      {modal?.type === 'user_profile' ? (
        <UserProfileModal userId={modal.userId} />
      ) : null}
      {modal?.type === 'available_now' ? (
  <AvailableNowModal
    me={me}
    users={USERS_SEED}
    onClose={() => setModal(null)}
    onOpenProfile={(userId) => setModal({ type: 'user_profile', userId })}
  />
) : null}

      {modal?.type === 'completion_photo' ? (
        <div className="nb-modal-backdrop" onClick={() => setModal(null)}>
          <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="nb-modal-head">
              <div className="nb-modal-title">Add a completion photo?</div>
              <button className="nb-x" onClick={() => setModal(null)} aria-label="Close">✕</button>
            </div>

            <div style={{ padding: 14 }}>
              <div className="nb-muted" style={{ marginBottom: 8, fontWeight: 850 }}>
                Optionally attach a photo showing the completed work (helps the requester verify).
              </div>

              <CompletionPhotoForm postId={modal.postId} />
            </div>

            <div className="nb-modal-foot">
              <div className="nb-muted">You can skip and mark the job done without a photo.</div>
              <div className="nb-modal-actions">
                <button className="nb-btn nb-btn-ghost" onClick={() => { advanceHelpStage(modal.postId, 'done'); setModal(null); }}>
                  Skip & mark Done
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {youOfferedOpen ? <YouOfferedPanel /> : null}

      {modal?.type === 'confirm_award' ? (
        <div className="nb-modal-backdrop" onClick={() => setModal(null)}>
          <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="nb-modal-head">
              <div className="nb-modal-title">Confirm award</div>
              <button className="nb-x" onClick={() => setModal(null)} aria-label="Close">✕</button>
            </div>

            <div style={{ padding: 14 }}>
              <div className="nb-muted" style={{ marginBottom: 8, fontWeight: 850 }}>
                Are you sure you want to award +20 NP to the selected helper(s)? This will mark the post resolved.
              </div>

              {(() => {
                const post = posts.find((p) => p && p.id === modal.postId);
                if (!post) return null;
                const names = (modal.helperIds || [])
                  .map((id) => usersById[id]?.name || 'Helper')
                  .filter(Boolean)
                  .join(', ');
                return (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ fontWeight: 950 }}>To: {names || 'Selected helpers'}</div>
                    {post.completionPhoto ? (
                      <div>
                        <div style={{ fontWeight: 850, marginBottom: 6 }}>Attached photo</div>
                        <img src={post.completionPhoto} alt="completion" style={{ width: '100%', maxWidth: 360, borderRadius: 8 }} />
                      </div>
                    ) : (
                      <div className="nb-muted">No completion photo attached.</div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="nb-modal-foot">
              <div className="nb-modal-actions">
                <button
                  className="nb-btn nb-btn-primary"
                  onClick={() => {
                    const pid = modal.postId;
                    const helpers = modal.helperIds || [];
                    // Close the confirm modal first so confetti is visible on the main screen
                    setModal(null);
                    setTimeout(() => {
                      awardHelpers(pid, helpers);
                    }, 100);
                  }}
                >
                  Confirm and award
                </button>

                <button className="nb-btn nb-btn-ghost" onClick={() => setModal(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* award_guard modal removed: confirm_award now proceeds directly to awarding */}

      {/* Recommendation thread modal (separate state) */}
      {thread ? <RecThreadModal postId={thread.postId} replyId={thread.replyId} /> : null}
        {/* Share modal (mobile-first) */}
        {shareModalOpen && shareTargetPost ? (
          <div
            className="nb-modal-backdrop"
            onClick={() => {
              setShareModalOpen(false);
              setShareTargetPost(null);
            }}
          >
            <div className="nb-modal" ref={shareModalRef} onClick={(e) => e.stopPropagation()}>
              <div className="nb-modal-head">
                <div className="nb-modal-title">Share post</div>
                <button
                  className="nb-x"
                  onClick={() => {
                    setShareModalOpen(false);
                    setShareTargetPost(null);
                  }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>
                  {shareTargetPost.title || 'Post'}
                </div>
                <div className="nb-muted" style={{ marginBottom: 14 }}>
                  Share this post with your neighbors.
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {/* Button ordering may be A/B tested via localStorage flag */}
                  {(() => {
                    const variant = localStorage.getItem('nb_share_variant') || (localStorage.setItem('nb_share_variant', Math.random() < 0.5 ? 'A' : 'B') || localStorage.getItem('nb_share_variant'));
                    const A = [
                      { k: 'whatsapp', label: 'Share via WhatsApp', cls: 'nb-btn nb-btn-primary' },
                      { k: 'email', label: 'Share via Email', cls: 'nb-btn nb-btn-ghost' },
                      { k: 'facebook', label: 'Share on Facebook', cls: 'nb-btn nb-btn-ghost' },
                      { k: 'sms', label: 'Share via SMS', cls: 'nb-btn nb-btn-ghost' },
                    ];
                    const B = [
                      { k: 'email', label: 'Share via Email', cls: 'nb-btn nb-btn-primary' },
                      { k: 'whatsapp', label: 'Share via WhatsApp', cls: 'nb-btn nb-btn-ghost' },
                      { k: 'facebook', label: 'Share on Facebook', cls: 'nb-btn nb-btn-ghost' },
                      { k: 'sms', label: 'Share via SMS', cls: 'nb-btn nb-btn-ghost' },
                    ];
                    const list = variant === 'B' ? B : A;
                    return list.map((it, idx) => (
                      <button
                        key={it.k}
                        ref={idx === 0 ? shareModalFirstBtnRef : undefined}
                        className={it.cls}
                        aria-label={it.label}
                        onClick={() => performShareAction({ action: it.k, post: shareTargetPost })}
                      >
                        {it.label}
                      </button>
                    ));
                  })()}

                  <button
                    className="nb-btn nb-btn-ghost"
                    aria-label="Copy link"
                    onClick={() => performShareAction({ action: 'copy', post: shareTargetPost })}
                  >
                    Copy link
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
    </div>
  );
}

function BottomTabs({ activeTab, onChange, badges }) {
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
            {badges && badges[t.key] > 0 ? (
              <span
                aria-label={`${badges[t.key]} new`}
                title={`${badges[t.key]} new`}
                style={{
                  marginLeft: 6,
                  minWidth: 18,
                  height: 18,
                  padding: '0 6px',
                  borderRadius: 999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 950,
                  background: 'rgba(255,145,90,.95)',
                  color: '#111',
                  border: '1px solid rgba(255,255,255,.12)',
                }}
              >
                {badges[t.key] > 9 ? '9+' : badges[t.key]}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export default App;
