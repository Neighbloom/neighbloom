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
            <><strong>{neighborCount}</strong> neighbors are here.</>
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
export function IntroComposer({ initialIntro = '', initialSkills = [], onSave, onSkip }) {
  const [intro, setIntro] = useState(initialIntro);
  const [skills, setSkills] = useState(initialSkills.join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      const skillList = skills.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);
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
      <input
        className="nb-input"
        value={skills}
        onChange={e => setSkills(e.target.value)}
        placeholder="yard work, cooking, rides, plumbing…"
      />
      <div className="nb-intro-skills-hint">Comma-separated. Helps us surface relevant opportunities.</div>

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
