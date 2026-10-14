import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  containsLink,
  maskPhones,
  buildRecTitle,
  badgeFor,
  timeAgo,
} from './utils.js';

describe('normalizeText', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeText('  hello   world  ')).toBe('hello world');
  });
  it('handles null/undefined', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('containsLink', () => {
  it('detects http links', () => {
    expect(containsLink('visit https://example.com')).toBe(true);
  });
  it('detects www links', () => {
    expect(containsLink('visit www.example.com')).toBe(true);
  });
  it('allows plain text', () => {
    expect(containsLink('call me tomorrow')).toBe(false);
  });
});

describe('maskPhones', () => {
  it('masks US phone numbers keeping last 4', () => {
    expect(maskPhones('call 555-123-4567')).toBe('call ***-***-4567');
  });
  it('handles parenthesized area codes', () => {
    expect(maskPhones('(555) 123-4567')).toBe('***-***-4567');
  });
  it('leaves non-phone text alone', () => {
    expect(maskPhones('no phone here')).toBe('no phone here');
  });
  it('handles empty input', () => {
    expect(maskPhones('')).toBe('');
    expect(maskPhones(null)).toBe('');
  });
});

describe('buildRecTitle', () => {
  it('combines category and area', () => {
    expect(buildRecTitle('Plumber', 'Worth')).toBe('Need a Plumber in Worth');
  });
  it('handles category only', () => {
    expect(buildRecTitle('Plumber', '')).toBe('Need a Plumber recommendation');
  });
  it('handles empty inputs', () => {
    expect(buildRecTitle('', '')).toBe('Recommendation');
  });
});

describe('badgeFor', () => {
  it('returns Seedling for 0 points', () => {
    expect(badgeFor(0)).toBe('🌱 Seedling');
  });
  it('returns Sprout at 100', () => {
    expect(badgeFor(100)).toBe('🌿 Sprout');
    expect(badgeFor(299)).toBe('🌿 Sprout');
  });
  it('returns Blossom at 300', () => {
    expect(badgeFor(300)).toBe('🌸 Blossom');
  });
  it('returns Oak at 800', () => {
    expect(badgeFor(800)).toBe('🌳 Oak');
    expect(badgeFor(5000)).toBe('🌳 Oak');
  });
});

describe('timeAgo', () => {
  it('shows seconds for recent timestamps', () => {
    expect(timeAgo(Date.now() - 30000)).toBe('30s ago');
  });
  it('shows minutes', () => {
    expect(timeAgo(Date.now() - 5 * 60000)).toBe('5m ago');
  });
  it('shows hours', () => {
    expect(timeAgo(Date.now() - 3 * 3600000)).toBe('3h ago');
  });
  it('shows days', () => {
    expect(timeAgo(Date.now() - 2 * 86400000)).toBe('2d ago');
  });
});
