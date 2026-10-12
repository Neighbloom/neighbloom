// Pure utility functions extracted from App.jsx for testability.
// These have no React dependencies and are safe to unit test.

export function normalizeText(t) {
  return (t || '').trim().replace(/\s+/g, ' ');
}

export function containsLink(text) {
  return /(https?:\/\/|www\.)/i.test(text || '');
}

export function maskPhones(text) {
  if (!text) return '';
  return text.replace(
    /(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g,
    (m) => {
      const digits = m.replace(/\D/g, '');
      const last4 = digits.slice(-4);
      return `***-***-${last4}`;
    }
  );
}

export function buildRecTitle(recCategory, area) {
  const cat = normalizeText(recCategory);
  const loc = normalizeText(area);

  if (cat && loc) return `Need a ${cat} in ${loc}`;
  if (cat) return `Need a ${cat} recommendation`;
  if (loc) return `Recommendation in ${loc}`;
  return 'Recommendation';
}

const BADGES = [
  { min: 0, name: '🌱 Seedling' },
  { min: 100, name: '🌿 Sprout' },
  { min: 300, name: '🌸 Blossom' },
  { min: 800, name: '🌳 Oak' },
];

export function badgeFor(points) {
  let b = BADGES[0];
  for (const x of BADGES) if (points >= x.min) b = x;
  return b.name;
}

export function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
