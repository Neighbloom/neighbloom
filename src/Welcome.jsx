// Welcome to Worth — First-visit experience (Concepts A+B).
//
// A coherent 60-second onboarding: belonging → something real → one action.
// Replaces the generic "Start something" checklist with a warm, human welcome.
//
// Design principles:
//   - Pioneer framing: "You're neighbor #N" is exciting, not apologetic
//   - Real faces first: show actual neighbors, not placeholders
//   - One meaningful action: answer a question or introduce yourself
//   - No checklist, no configuration — contribution, not setup

import React, { useState, useEffect } from 'react';
import { fetchNeighbors, getNeighborCount, updateIntro } from './m2.js';

/**
 * WelcomeHero: The first thing a new user sees.
 * Shows: neighbor count, real neighbor faces, one clear action.
 */
export function WelcomeHero({ town, displayName, onAnswerQuestion, onIntroduce, hasIntro }) {
  const [neighborCount, setNeighborCount] = useState(null);
  const [neighbors, setNeighbors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [count, list] = await Promise.all([
          getNeighborCount(town).catch(() => null),
          fetchNeighbors(town, 5).catch(() => []),
        ]);
        setNeighborCount(count);
        setNeighbors(list);
      } catch {}
      setLoading(false);
    })();
  }, [town]);

  if (loading) {
    return (
      <div className="nb-welcome-hero nb-welcome-loading">
        <div className="nb-welcome-title">Welcome{town ? ` to ${town}` : ''} 🏡</div>
        <div className="nb-welcome-sub">Getting to know your neighborhood…</div>
      </div>
    );
  }

  const isPioneer = neighborCount !== null && neighborCount <= 10;
  // The count includes the viewer; "neighbors are here" must not.
  const othersCount = neighborCount !== null ? Math.max(0, neighborCount - 1) : null;

  return (
    <div className="nb-welcome-hero">
      <div className="nb-welcome-title">
        Welcome{town ? ` to ${town}` : ''} 🏡
      </div>

      <div className="nb-welcome-count">
        {neighborCount !== null ? (
          isPioneer ? (
            <>You're neighbor <strong>#{neighborCount}</strong> — you're helping found this neighborhood.</>
          ) : (
            <><strong>{othersCount}</strong> neighbor{othersCount === 1 ? ' is' : 's are'} here.</>
          )
        ) : (
          <>Your neighborhood is just getting started.</>
        )}
      </div>

      {neighbors.length > 0 && (
        <div className="nb-welcome-neighbors">
          <div className="nb-welcome-neighbors-label">Your neighbors</div>
          <div className="nb-welcome-faces">
            {neighbors.slice(0, 5).map(n => (
              <div key={n.id} className="nb-welcome-face" title={n.display_name}>
                {n.avatar_url ? (
                  <img src={n.avatar_url} alt={n.display_name} />
                ) : (
                  <div className="nb-welcome-avatar-fallback">
                    {(n.display_name || '?')[0].toUpperCase()}
                  </div>
                )}
                <div className="nb-welcome-face-name">{n.display_name?.split(' ')[0]}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="nb-welcome-actions">
        {!hasIntro ? (
          <button className="nb-btn nb-btn-primary" onClick={onIntroduce}>
            Say hello to your neighbors →
          </button>
        ) : (
          <button className="nb-btn nb-btn-primary" onClick={onAnswerQuestion}>
            See what's happening →
          </button>
        )}
      </div>

      <div className="nb-welcome-note">
        {isPioneer
          ? "Early neighborhoods are special — you'll know everyone here."
          : "Real neighbors, real help, right around the corner."}
      </div>
    </div>
  );
}

/**
 * IntroComposer: Lightweight intro writer ("Say hello").
 * Name, approximate area, one thing you're good at.
 */
const SKILL_OPTIONS = [
  'Yard work', 'Cooking', 'Rides', 'Plumbing', 'Childcare', 'Pet sitting',
  'Moving help', 'Tech help', 'Tutoring', 'Cleaning', 'Car repairs',
  'Snow shoveling', 'Painting', 'Errands',
];

export function IntroComposer({ initialIntro = '', initialSkills = [], onSave, onSkip }) {
  const [intro, setIntro] = useState(initialIntro);
  const [skillList, setSkillList] = useState(() => initialSkills.slice(0, 10));
  const [customSkill, setCustomSkill] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleSkill = (skill) => {
    setSkillList((prev) =>
      prev.includes(skill) ? prev.filter((x) => x !== skill) : [...prev, skill].slice(0, 10)
    );
  };
  const addCustomSkill = () => {
    const v = customSkill.trim().slice(0, 30);
    if (!v) return;
    if (!skillList.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setSkillList((prev) => [...prev, v].slice(0, 10));
    }
    setCustomSkill('');
  };

  const handleSave = async () => {
    const cleanIntro = intro.trim();
    if (cleanIntro.length < 10) {
      setError('Tell us a little more — at least 10 characters.');
      return;
    }
    if (cleanIntro.length > 200) {
      setError('Keep it under 200 characters.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await updateIntro({ intro: cleanIntro, skills: skillList });
      onSave && onSave();
    } catch (e) {
      setError(e.message || 'Could not save. Please try again.');
    }
    setSaving(false);
  };

  return (
    <div className="nb-intro-composer">
      <div className="nb-intro-title">Say hello 👋</div>
      <div className="nb-intro-sub">
        A quick intro helps neighbors know who you are. What should they know?
      </div>

      <textarea
        className="nb-input nb-intro-textarea"
        value={intro}
        onChange={e => setIntro(e.target.value)}
        placeholder="Hi! I'm Maria, near 115th and Harlem. Happy to help with yard work or give rides to the library."
        rows={3}
        maxLength={200}
      />
      <div className="nb-intro-count">{intro.length}/200</div>

      <div className="nb-intro-skills-label">Things you're good at or happy to help with (optional)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {SKILL_OPTIONS.map((skill) => (
          <button
            key={skill}
            type="button"
            className={`nb-chip ${skillList.includes(skill) ? 'is-active' : ''}`}
            onClick={() => toggleSkill(skill)}
          >
            {skill}
          </button>
        ))}
        {skillList.filter((x) => !SKILL_OPTIONS.includes(x)).map((skill) => (
          <button
            key={skill}
            type="button"
            className="nb-chip is-active"
            onClick={() => toggleSkill(skill)}
            title="Tap to remove"
          >
            {skill} ✕
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          className="nb-input"
          value={customSkill}
          onChange={e => setCustomSkill(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSkill(); } }}
          placeholder="Add your own…"
          maxLength={30}
        />
        <button type="button" className="nb-btn nb-btn-ghost" onClick={addCustomSkill} disabled={!customSkill.trim()}>
          Add
        </button>
      </div>
      <div className="nb-intro-skills-hint">Tap to pick up to 10. Helps us surface relevant opportunities.</div>

      {error && <div className="nb-intro-error">{error}</div>}

      <div className="nb-intro-actions">
        <button className="nb-btn nb-btn-ghost" onClick={onSkip} disabled={saving}>
          Skip for now
        </button>
        <button className="nb-btn nb-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Introduce yourself'}
        </button>
      </div>
    </div>
  );
}

/**
 * NeighborCard: Display a neighbor in the directory.
 * Shows: avatar, name, intro, "Helped X neighbors" (verified).
 */
export function NeighborCard({ neighbor, helpCount, onTap }) {
  return (
    <div className="nb-neighbor-card" onClick={() => onTap && onTap(neighbor)}>
      <div className="nb-neighbor-avatar">
        {neighbor.avatar_url ? (
          <img src={neighbor.avatar_url} alt={neighbor.display_name} />
        ) : (
          <div className="nb-neighbor-avatar-fallback">
            {(neighbor.display_name || '?')[0].toUpperCase()}
          </div>
        )}
      </div>
      <div className="nb-neighbor-info">
        <div className="nb-neighbor-name">{neighbor.display_name}</div>
        {neighbor.intro && (
          <div className="nb-neighbor-intro">{neighbor.intro}</div>
        )}
        <div className="nb-neighbor-meta">
          {helpCount > 0 && (
            <span className="nb-neighbor-helps">🤝 Helped {helpCount} neighbor{helpCount !== 1 ? 's' : ''}</span>
          )}
          {neighbor.town && (
            <span className="nb-neighbor-town">📍 {neighbor.town}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * TownAsk: the one setup question that matters (B2).
 * New profiles have town = NULL, and without a town the welcome
 * hero can't name the place or count its neighbors — so we ask
 * plainly, once, with the launch town preselected. Skippable for
 * the session; it returns next visit until answered.
 */
const TOWN_OPTIONS = [
  'Worth', 'Palos Hills', 'Palos Heights', 'Palos Park', 'Hickory Hills',
  'Oak Lawn', 'Orland Park', 'Orland Hills', 'Tinley Park', 'Homer Glen',
  'Lemont', 'Lockport', 'New Lenox', 'Mokena', 'Frankfort',
];

export function TownAsk({ displayName, onSave, onSkip }) {
  const [town, setTown] = useState('Worth');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chosen = town === '__other' ? custom.trim() : town;
  const firstName = (displayName || '').split(' ')[0];

  const submit = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave(chosen);
    } catch (e) {
      setError(e.message || 'Could not save your town — try again.');
      setBusy(false);
    }
  };

  return (
    <div className="nb-welcome-hero">
      <div className="nb-welcome-title">Welcome{firstName ? `, ${firstName}` : ''} 🏡</div>
      <div className="nb-welcome-sub">
        Neighbloom runs town by town — your town decides which neighbors and posts you see first.
        Which town do you call home?
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {TOWN_OPTIONS.map((t) => (
          <button
            key={t}
            type="button"
            className={`nb-chip ${town === t ? 'is-active' : ''}`}
            onClick={() => setTown(t)}
          >
            {t}
          </button>
        ))}
        <button
          type="button"
          className={`nb-chip ${town === '__other' ? 'is-active' : ''}`}
          onClick={() => setTown('__other')}
        >
          Another town
        </button>
      </div>

      {town === '__other' ? (
        <input
          type="text"
          placeholder="Your town"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="nb-input"
          style={{ width: '100%', marginTop: 12 }}
          autoComplete="address-level2"
        />
      ) : null}

      {error ? <div className="nb-error" style={{ marginTop: 12 }}>{error}</div> : null}

      <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
        <button
          type="button"
          className="nb-btn nb-btn-primary"
          onClick={submit}
          disabled={!chosen || busy}
        >
          {busy ? 'Saving…' : `This is my town`}
        </button>
        <button
          type="button"
          className="nb-btn nb-btn-ghost"
          onClick={onSkip}
          disabled={busy}
        >
          I'll set this later
        </button>
      </div>
    </div>
  );
}
